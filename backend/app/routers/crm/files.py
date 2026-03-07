"""
CRM Lead Files & Permissions.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant

from app.routers.crm_shared import (
    LeadFileCreate, LeadFileUpdate, FilePermissionSet,
    _is_admin,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Lead Files & Permissions
# ---------------------------------------------------------------------------

@router.post("/lead-files")
async def create_lead_file(body: LeadFileCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]

    row = await db.execute(
        text("""
            INSERT INTO lead_files (lead_id, file_name, file_url, file_type, file_size, category, description, tags, uploaded_by)
            VALUES (CAST(:lead_id AS uuid), :file_name, :file_url, :file_type, :file_size, :category, :description, CAST(:tags AS jsonb), CAST(:uid AS uuid))
            RETURNING id
        """),
        {
            "lead_id": body.lead_id, "file_name": body.file_name,
            "file_url": body.file_url, "file_type": body.file_type,
            "file_size": body.file_size, "category": body.category,
            "description": body.description,
            "tags": json.dumps(body.tags or []),
            "uid": user_id,
        },
    )
    file_id = str(row.fetchone()[0])

    if body.involved_user_ids:
        for uid in body.involved_user_ids:
            await db.execute(
                text("""
                    INSERT INTO lead_file_permissions (file_id, user_id, can_view, can_download, granted_by)
                    VALUES (CAST(:fid AS uuid), CAST(:uid AS uuid), TRUE, FALSE, CAST(:gid AS uuid))
                    ON CONFLICT (file_id, user_id) DO UPDATE SET can_view = TRUE, updated_at = NOW()
                """),
                {"fid": file_id, "uid": uid, "gid": user_id},
            )

    await db.commit()
    return {"id": file_id, "success": True}


@router.get("/lead-files")
async def list_lead_files(
    category: Optional[str] = None,
    lead_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    user_id = ctx["sub"]
    admin = _is_admin(ctx)

    where = ["1=1"]
    params: dict = {}

    if category:
        where.append("lf.category = :category")
        params["category"] = category
    if lead_id:
        where.append("lf.lead_id = CAST(:lead_id AS uuid)")
        params["lead_id"] = lead_id
    if uploaded_by:
        where.append("lf.uploaded_by = CAST(:uploaded_by AS uuid)")
        params["uploaded_by"] = uploaded_by
    if date_from:
        where.append("lf.created_at >= CAST(:date_from AS date)")
        params["date_from"] = date_from
    if date_to:
        where.append("lf.created_at < CAST(:date_to AS date) + INTERVAL '1 day'")
        params["date_to"] = date_to

    if admin:
        query = f"""
            SELECT lf.*, l.full_name AS lead_name, l.company AS customer_name,
                   u.full_name AS uploader_name
            FROM lead_files lf
            JOIN leads l ON l.id = lf.lead_id
            LEFT JOIN users u ON u.id = lf.uploaded_by
            WHERE {' AND '.join(where)}
            ORDER BY lf.created_at DESC
        """
    else:
        query = f"""
            SELECT lf.*, l.full_name AS lead_name, l.company AS customer_name,
                   u.full_name AS uploader_name, lfp.can_download
            FROM lead_files lf
            JOIN leads l ON l.id = lf.lead_id
            LEFT JOIN users u ON u.id = lf.uploaded_by
            JOIN lead_file_permissions lfp ON lfp.file_id = lf.id
                AND lfp.user_id = CAST(:current_user AS uuid) AND lfp.can_view = TRUE
            WHERE {' AND '.join(where)}
            ORDER BY lf.created_at DESC
        """
        params["current_user"] = user_id

    rows = await db.execute(text(query), params)
    files = []
    for r in rows.fetchall():
        d = dict(r._mapping)
        for k in ("id", "lead_id", "uploaded_by"):
            if d.get(k):
                d[k] = str(d[k])
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat()
        if admin:
            d["can_download"] = True
        files.append(d)

    if files:
        file_ids = [f["id"] for f in files]
        placeholders = ", ".join(f"CAST(:fid_{i} AS uuid)" for i in range(len(file_ids)))
        perm_params = {f"fid_{i}": fid for i, fid in enumerate(file_ids)}
        perm_rows = await db.execute(
            text(f"""
                SELECT lfp.file_id, lfp.user_id, lfp.can_view, lfp.can_download,
                       u.full_name, u.email
                FROM lead_file_permissions lfp
                LEFT JOIN users u ON u.id = lfp.user_id
                WHERE lfp.file_id IN ({placeholders})
            """),
            perm_params,
        )
        perm_map: dict = {}
        for pr in perm_rows.fetchall():
            pd = dict(pr._mapping)
            fid = str(pd["file_id"])
            perm_map.setdefault(fid, []).append({
                "user_id": str(pd["user_id"]),
                "full_name": pd.get("full_name") or pd.get("email", ""),
                "can_view": pd["can_view"],
                "can_download": pd["can_download"],
            })
        for f in files:
            f["involved_users"] = perm_map.get(f["id"], [])

    return files


@router.get("/lead-files/{file_id}")
async def get_lead_file(file_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    admin = _is_admin(ctx)

    row = await db.execute(
        text("""
            SELECT lf.*, l.full_name AS lead_name, l.company AS customer_name,
                   u.full_name AS uploader_name
            FROM lead_files lf
            JOIN leads l ON l.id = lf.lead_id
            LEFT JOIN users u ON u.id = lf.uploaded_by
            WHERE lf.id = CAST(:fid AS uuid)
        """),
        {"fid": file_id},
    )
    r = row.fetchone()
    if not r:
        raise HTTPException(404, "File not found")

    d = dict(r._mapping)
    for k in ("id", "lead_id", "uploaded_by"):
        if d.get(k):
            d[k] = str(d[k])
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()

    if not admin:
        perm = await db.execute(
            text("SELECT can_view, can_download FROM lead_file_permissions WHERE file_id = CAST(:fid AS uuid) AND user_id = CAST(:uid AS uuid)"),
            {"fid": file_id, "uid": user_id},
        )
        p = perm.fetchone()
        if not p or not p[0]:
            raise HTTPException(403, "No access")
        d["can_download"] = p[1]
    else:
        d["can_download"] = True

    perm_rows = await db.execute(
        text("""
            SELECT lfp.*, u.full_name, u.email
            FROM lead_file_permissions lfp
            LEFT JOIN users u ON u.id = lfp.user_id
            WHERE lfp.file_id = CAST(:fid AS uuid)
        """),
        {"fid": file_id},
    )
    d["permissions"] = []
    for pr in perm_rows.fetchall():
        pd = dict(pr._mapping)
        d["permissions"].append({
            "user_id": str(pd["user_id"]),
            "full_name": pd.get("full_name") or pd.get("email", ""),
            "can_view": pd["can_view"],
            "can_download": pd["can_download"],
        })

    return d


@router.patch("/lead-files/{file_id}")
async def update_lead_file(file_id: str, body: LeadFileUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    admin = _is_admin(ctx)

    if not admin:
        row = await db.execute(
            text("SELECT uploaded_by FROM lead_files WHERE id = CAST(:fid AS uuid)"),
            {"fid": file_id},
        )
        r = row.fetchone()
        if not r or str(r[0]) != user_id:
            raise HTTPException(403, "Only admin or uploader can edit")

    updates = []
    params: dict = {"fid": file_id}
    if body.category is not None:
        updates.append("category = :category")
        params["category"] = body.category
    if body.description is not None:
        updates.append("description = :description")
        params["description"] = body.description
    if body.tags is not None:
        updates.append("tags = CAST(:tags AS jsonb)")
        params["tags"] = json.dumps(body.tags)

    if updates:
        await db.execute(
            text(f"UPDATE lead_files SET {', '.join(updates)} WHERE id = CAST(:fid AS uuid)"),
            params,
        )
        await db.commit()
    return {"success": True}


@router.delete("/lead-files/{file_id}")
async def delete_lead_file(file_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    admin = _is_admin(ctx)

    if not admin:
        raise HTTPException(403, "Only admin can delete files")

    await db.execute(
        text("DELETE FROM lead_files WHERE id = CAST(:fid AS uuid)"),
        {"fid": file_id},
    )
    await db.commit()
    return {"success": True}


@router.put("/lead-files/{file_id}/permissions")
async def set_file_permissions(file_id: str, body: FilePermissionSet, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]

    if not _is_admin(ctx):
        raise HTTPException(403, "Admin only")

    for p in body.permissions:
        await db.execute(
            text("""
                INSERT INTO lead_file_permissions (file_id, user_id, can_view, can_download, granted_by)
                VALUES (CAST(:fid AS uuid), CAST(:uid AS uuid), :view, :dl, CAST(:gid AS uuid))
                ON CONFLICT (file_id, user_id) DO UPDATE
                    SET can_view = :view, can_download = :dl, updated_at = NOW()
            """),
            {
                "fid": file_id, "uid": p["user_id"],
                "view": p.get("can_view", True), "dl": p.get("can_download", False),
                "gid": user_id,
            },
        )
    await db.commit()
    return {"success": True}


@router.get("/lead-files/{file_id}/check-access")
async def check_file_access(file_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]

    if _is_admin(ctx):
        return {"can_view": True, "can_download": True}

    row = await db.execute(
        text("SELECT can_view, can_download FROM lead_file_permissions WHERE file_id = CAST(:fid AS uuid) AND user_id = CAST(:uid AS uuid)"),
        {"fid": file_id, "uid": user_id},
    )
    r = row.fetchone()
    if not r:
        return {"can_view": False, "can_download": False}
    return {"can_view": r[0], "can_download": r[1]}
