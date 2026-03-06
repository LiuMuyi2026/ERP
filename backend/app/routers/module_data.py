"""
Module Data API — generic CRUD driven by module_definitions.

Reads the module_definition to determine the target table, then performs
list / get / create / update / delete on the actual data rows.
"""

import csv
import io
import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.deps import get_current_user_with_tenant, require_admin_with_tenant

router = APIRouter(prefix="/module-data", tags=["module-data"])

# Allowed table names (must match tenant DDL tables) to prevent injection
ALLOWED_TABLES = {
    "leads", "crm_contracts", "crm_receivables", "crm_payables",
    "employees", "leave_requests",
    "invoices", "invoice_line_items", "journal_entries",
    "chart_of_accounts", "products", "warehouses", "suppliers",
    "stock_movements", "contacts", "companies", "crm_accounts",
    "deals", "interactions", "documents", "payroll_runs",
    "inquiries", "quotations", "purchase_orders", "shipments",
    "supplier_quotations",
}

_IDENT_RE = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def _safe_ident(name: str) -> str:
    """Validate and quote a SQL identifier."""
    if not _IDENT_RE.match(name):
        raise HTTPException(status_code=400, detail=f"Invalid identifier: {name}")
    return f'"{name}"'


async def _audit_log(db, table_name: str, record_id: str, action: str,
                     user_id: str = None, changed_fields: list = None,
                     old_values: dict = None, new_values: dict = None):
    """Write an audit log entry."""
    try:
        await db.execute(text("""
            INSERT INTO audit_logs (table_name, record_id, action, changed_fields, old_values, new_values, user_id)
            VALUES (:table_name, :record_id, :action, :changed_fields, :old_values, :new_values, :user_id)
        """), {
            "table_name": table_name,
            "record_id": record_id,
            "action": action,
            "changed_fields": changed_fields,
            "old_values": json.dumps(old_values) if old_values else None,
            "new_values": json.dumps(new_values) if new_values else None,
            "user_id": user_id,
        })
    except Exception:
        pass  # Don't fail the main operation if audit logging fails


async def _get_def(db, module: str, doctype: str):
    """Fetch module definition and validate table exists."""
    row = await db.execute(text("""
        SELECT id, table_name, fields, list_settings, form_settings, workflow_settings
        FROM module_definitions
        WHERE module = :module AND doctype = :doctype AND is_active = TRUE
    """), {"module": module, "doctype": doctype})
    mdef = row.fetchone()
    if not mdef:
        raise HTTPException(status_code=404, detail=f"Module definition not found: {module}/{doctype}")
    table = mdef.table_name
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail=f"Table not allowed: {table}")
    return mdef


# ── Link field helpers (MUST be before /{record_id} route) ───────────────────

# Map Link "options" values to (table_name, title_field) pairs
_LINK_TARGETS: dict[str, tuple[str, str]] = {
    "Lead": ("leads", "full_name"),
    "Contract": ("crm_contracts", "title"),
    "Employee": ("employees", "full_name"),
    "User": ("employees", "full_name"),  # fallback: resolve via employees
    "Department": ("employees", "department"),  # pseudo
    "Position": ("employees", "position"),      # pseudo
    "Product": ("products", "product_name"),
    "Supplier": ("suppliers", "supplier_name"),
    "Company": ("companies", "company_name"),
    "Contact": ("contacts", "full_name"),
    "Account": ("chart_of_accounts", "account_name"),
    "Warehouse": ("warehouses", "warehouse_name"),
    "Invoice": ("invoices", "invoice_number"),
    "JournalEntry": ("journal_entries", "reference"),
    "Quotation": ("quotations", "quotation_number"),
    "PurchaseOrder": ("purchase_orders", "po_number"),
    "Shipment": ("shipments", "shipment_number"),
}


@router.post("/{module}/{doctype}/resolve-links")
async def resolve_links(
    module: str, doctype: str, body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Resolve Link field IDs to display names.

    Body: {"<link_options>": ["id1", "id2", ...], ...}
    Returns: {"<link_options>": {"id1": "Display Name", ...}, ...}
    """
    db = ctx["db"]
    # Validate module/doctype exist
    await _get_def(db, module, doctype)

    result: dict = {}
    for link_type, ids in body.items():
        if not isinstance(ids, list) or not ids:
            continue
        target = _LINK_TARGETS.get(link_type)
        if not target:
            # Try to find by looking up module_definitions
            row = await db.execute(text(
                "SELECT table_name, fields FROM module_definitions WHERE doctype = :dt AND is_active = TRUE LIMIT 1"
            ), {"dt": link_type.lower()})
            mdef_row = row.fetchone()
            if mdef_row and mdef_row.table_name in ALLOWED_TABLES:
                fmeta = mdef_row.fields if isinstance(mdef_row.fields, list) else json.loads(mdef_row.fields)
                title_f = next((f["fieldname"] for f in fmeta if f.get("fieldtype") == "Data" and f.get("in_list_view")), None)
                if title_f and _IDENT_RE.match(title_f):
                    target = (mdef_row.table_name, title_f)

        if not target:
            result[link_type] = {}
            continue

        tbl, title_col = target
        if tbl not in ALLOWED_TABLES or not _IDENT_RE.match(title_col):
            result[link_type] = {}
            continue

        # Filter to valid UUIDs only
        safe_ids = [str(i) for i in ids[:100] if i]
        if not safe_ids:
            result[link_type] = {}
            continue

        # Build parameterized query
        id_params = {f"_id{j}": uid for j, uid in enumerate(safe_ids)}
        id_placeholders = ", ".join(f":_id{j}" for j in range(len(safe_ids)))
        try:
            rows = await db.execute(text(
                f'SELECT id, {_safe_ident(title_col)} AS title FROM {_safe_ident(tbl)} WHERE id IN ({id_placeholders})'
            ), id_params)
            mapping = {}
            for r in rows.fetchall():
                rid = str(r.id) if hasattr(r.id, 'hex') else str(r.id)
                mapping[rid] = r.title or rid[:8]
            result[link_type] = mapping
        except Exception:
            result[link_type] = {}

    return result


@router.get("/{module}/{doctype}/link-search/{link_type}")
async def link_search(
    module: str, doctype: str, link_type: str,
    q: str = Query("", min_length=0),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Search linked records for autocomplete."""
    db = ctx["db"]
    await _get_def(db, module, doctype)

    target = _LINK_TARGETS.get(link_type)
    if not target:
        row = await db.execute(text(
            "SELECT table_name, fields FROM module_definitions WHERE doctype = :dt AND is_active = TRUE LIMIT 1"
        ), {"dt": link_type.lower()})
        mdef_row = row.fetchone()
        if mdef_row and mdef_row.table_name in ALLOWED_TABLES:
            fmeta = mdef_row.fields if isinstance(mdef_row.fields, list) else json.loads(mdef_row.fields)
            title_f = next((f["fieldname"] for f in fmeta if f.get("fieldtype") == "Data" and f.get("in_list_view")), None)
            if title_f and _IDENT_RE.match(title_f):
                target = (mdef_row.table_name, title_f)

    if not target:
        return []

    tbl, title_col = target
    if tbl not in ALLOWED_TABLES or not _IDENT_RE.match(title_col):
        return []

    params: dict = {"limit": 20}
    where = ""
    if q:
        where = f"WHERE {_safe_ident(title_col)} ILIKE :q"
        params["q"] = f"%{q}%"

    try:
        rows = await db.execute(text(
            f'SELECT id, {_safe_ident(title_col)} AS title FROM {_safe_ident(tbl)} {where} ORDER BY {_safe_ident(title_col)} LIMIT :limit'
        ), params)
        results = []
        for r in rows.fetchall():
            rid = str(r.id) if hasattr(r.id, 'hex') else str(r.id)
            results.append({"id": rid, "title": r.title or rid[:8]})
        return results
    except Exception:
        return []


# ── Batch operations (MUST be before /{record_id} route) ─────────────────────

@router.post("/{module}/{doctype}/batch/update")
async def batch_update(
    module: str, doctype: str, body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Batch update records. Body: {"ids": [...], "data": {"status": "..."}}"""
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)
    fields_meta = mdef.fields if isinstance(mdef.fields, list) else json.loads(mdef.fields)

    ids = body.get("ids", [])
    data = body.get("data", {})
    if not ids or not data:
        raise HTTPException(status_code=400, detail="ids and data required")
    if len(ids) > 200:
        raise HTTPException(status_code=400, detail="Max 200 records per batch")

    allowed = {
        f["fieldname"] for f in fields_meta
        if f.get("fieldtype") not in ("Section Break", "Column Break", "Tab Break")
        and not f.get("read_only")
        and _IDENT_RE.match(f.get("fieldname", ""))
    }
    allowed.update({"assigned_to", "status"})

    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    sets = ", ".join(f'{_safe_ident(k)} = :_v_{k}' for k in updates)
    params = {f"_v_{k}": v for k, v in updates.items()}

    # Build IN clause
    for i, uid in enumerate(ids[:200]):
        params[f"_bid{i}"] = str(uid)
    id_placeholders = ", ".join(f":_bid{i}" for i in range(min(len(ids), 200)))

    result = await db.execute(text(
        f'UPDATE {table} SET {sets}, updated_at = NOW() WHERE id IN ({id_placeholders}) RETURNING id'
    ), params)
    count = len(result.fetchall())
    await db.commit()
    return {"updated": count}


@router.post("/{module}/{doctype}/batch/delete")
async def batch_delete(
    module: str, doctype: str, body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Batch delete records. Body: {"ids": [...]}"""
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)

    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids required")
    if len(ids) > 200:
        raise HTTPException(status_code=400, detail="Max 200 records per batch")

    params = {}
    for i, uid in enumerate(ids[:200]):
        params[f"_bid{i}"] = str(uid)
    id_placeholders = ", ".join(f":_bid{i}" for i in range(min(len(ids), 200)))

    result = await db.execute(text(
        f'DELETE FROM {table} WHERE id IN ({id_placeholders}) RETURNING id'
    ), params)
    count = len(result.fetchall())
    await db.commit()
    return {"deleted": count}


# ── CSV Import (MUST be before /{record_id} route) ───────────────────────────

@router.post("/{module}/{doctype}/import/csv")
async def import_csv(
    module: str, doctype: str,
    file: UploadFile = File(...),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Import records from a CSV file. First row must be field labels or fieldnames."""
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)
    fields_meta = mdef.fields if isinstance(mdef.fields, list) else json.loads(mdef.fields)

    # Build label→fieldname and fieldname→fieldmeta maps
    label_to_name = {}
    name_to_meta = {}
    for f in fields_meta:
        if f.get("fieldtype") in ("Section Break", "Column Break", "Tab Break"):
            continue
        fn = f.get("fieldname", "")
        if not _IDENT_RE.match(fn):
            continue
        name_to_meta[fn] = f
        label_to_name[f.get("label", "").strip()] = fn
        label_to_name[fn] = fn  # also allow fieldname as header

    content = await file.read()
    # Try UTF-8, fall back to GBK (common for Chinese CSVs)
    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text_content = content.decode("gbk", errors="replace")

    reader = csv.reader(io.StringIO(text_content))
    rows = list(reader)
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="CSV must have at least a header row and one data row")

    # Map headers to fieldnames
    headers = rows[0]
    col_map: list[str | None] = []
    for h in headers:
        h = h.strip()
        col_map.append(label_to_name.get(h))

    if not any(col_map):
        raise HTTPException(status_code=400, detail="No matching field names found in CSV headers")

    created = 0
    errors = []
    for row_idx, row in enumerate(rows[1:], start=2):
        record: dict = {}
        for ci, val in enumerate(row):
            if ci >= len(col_map) or col_map[ci] is None:
                continue
            fn = col_map[ci]
            meta = name_to_meta.get(fn)
            if not meta:
                continue
            val = val.strip()
            if not val:
                continue
            # Type coercion
            ft = meta.get("fieldtype", "Data")
            try:
                if ft in ("Int",):
                    record[fn] = int(val)
                elif ft in ("Float", "Currency"):
                    record[fn] = float(val.replace(",", ""))
                elif ft == "Check":
                    record[fn] = val.lower() in ("1", "true", "yes", "是", "✓")
                else:
                    record[fn] = val
            except (ValueError, TypeError):
                record[fn] = val

        if not record:
            continue

        record["created_by"] = ctx["sub"]

        try:
            cols = ", ".join(_safe_ident(k) for k in record)
            placeholders = ", ".join(f":{k}" for k in record)
            await db.execute(text(
                f'INSERT INTO {table} ({cols}) VALUES ({placeholders})'
            ), record)
            created += 1
        except Exception as e:
            errors.append(f"Row {row_idx}: {str(e)[:100]}")
            if len(errors) > 10:
                break

    if created > 0:
        await db.commit()

    return {
        "created": created,
        "errors": errors,
        "total_rows": len(rows) - 1,
        "mapped_columns": [h for h, m in zip(headers, col_map) if m],
    }


# ── Audit log (MUST be before /{record_id} route) ────────────────────────────

@router.get("/{module}/{doctype}/audit/{record_id}")
async def get_audit_log(
    module: str, doctype: str, record_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)

    offset = (page - 1) * page_size
    rows = await db.execute(text("""
        SELECT id, action, changed_fields, old_values, new_values, user_id, created_at
        FROM audit_logs
        WHERE table_name = :table_name AND record_id = :record_id
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """), {"table_name": mdef.table_name, "record_id": record_id, "limit": page_size, "offset": offset})

    logs = []
    for r in rows.fetchall():
        log = dict(r._mapping)
        for k, v in log.items():
            if hasattr(v, 'isoformat'):
                log[k] = v.isoformat()
            elif hasattr(v, 'hex') and not isinstance(v, (str, bytes)):
                log[k] = str(v)
        logs.append(log)

    return {"logs": logs, "page": page}


# ── Aggregate stats for dashboard (MUST be before /{record_id} route) ────────

@router.get("/{module}/{doctype}/stats/summary")
async def get_stats(
    module: str, doctype: str,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)
    fields_meta = mdef.fields if isinstance(mdef.fields, list) else json.loads(mdef.fields)
    workflow = mdef.workflow_settings if isinstance(mdef.workflow_settings, dict) else json.loads(mdef.workflow_settings or '{}')

    stats: dict = {}

    # Total count
    row = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
    stats["total"] = row.scalar() or 0

    # Status breakdown (if status field exists)
    status_field = workflow.get("status_field", "status")
    has_status = any(f["fieldname"] == status_field for f in fields_meta if f.get("fieldtype") == "Select")
    if has_status and _IDENT_RE.match(status_field):
        sf = _safe_ident(status_field)
        rows = await db.execute(text(f"SELECT {sf} AS status, COUNT(*) AS cnt FROM {table} GROUP BY {sf} ORDER BY cnt DESC"))
        stats["by_status"] = {r.status or "unknown": r.cnt for r in rows.fetchall()}

    # Sum of currency fields
    currency_fields = [
        f["fieldname"] for f in fields_meta
        if f.get("fieldtype") == "Currency" and _IDENT_RE.match(f.get("fieldname", ""))
    ]
    for cf in currency_fields[:3]:
        row = await db.execute(text(f"SELECT COALESCE(SUM({_safe_ident(cf)}), 0) FROM {table}"))
        stats[f"sum_{cf}"] = float(row.scalar() or 0)

    return stats


# ── CSV Export (MUST be before /{record_id} route) ───────────────────────────

@router.get("/{module}/{doctype}/export/csv")
async def export_csv(
    module: str, doctype: str,
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    filters: Optional[str] = Query(None),
    sort_field: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("desc"),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)
    fields_meta = mdef.fields if isinstance(mdef.fields, list) else json.loads(mdef.fields)
    list_settings = mdef.list_settings if isinstance(mdef.list_settings, dict) else json.loads(mdef.list_settings or '{}')

    allowed_fields = {
        f.get("fieldname") for f in fields_meta
        if f.get("fieldtype") not in ("Section Break", "Column Break", "Tab Break")
        and _IDENT_RE.match(f.get("fieldname", ""))
    }

    # Build WHERE (same logic as list_records)
    conditions = []
    params: dict = {}
    if search:
        search_fields = [
            f.get("fieldname") for f in fields_meta
            if f.get("in_list_view") and f.get("fieldtype") in ("Data", "Text")
            and _IDENT_RE.match(f.get("fieldname", ""))
        ]
        if search_fields:
            or_parts = [f'{_safe_ident(sf)} ILIKE :search' for sf in search_fields[:5]]
            conditions.append(f"({' OR '.join(or_parts)})")
            params["search"] = f"%{search}%"
    if status:
        conditions.append('"status" = :status')
        params["status"] = status
    if filters:
        try:
            filter_dict = json.loads(filters) if isinstance(filters, str) else {}
        except (json.JSONDecodeError, TypeError):
            filter_dict = {}
        for i, (fname, fval) in enumerate(filter_dict.items()):
            if fname in allowed_fields and _IDENT_RE.match(fname) and fval is not None and fval != "":
                param_key = f"_f{i}"
                conditions.append(f"{_safe_ident(fname)} = :{param_key}")
                params[param_key] = fval
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    sf = sort_field or list_settings.get("sort_field", "created_at")
    so = sort_order if sort_order in ("asc", "desc") else "desc"
    if not _IDENT_RE.match(sf):
        sf = "created_at"
    order_clause = f"ORDER BY {_safe_ident(sf)} {so} NULLS LAST"

    rows = await db.execute(text(f"SELECT * FROM {table} {where} {order_clause} LIMIT 5000"), params)
    records = [dict(r._mapping) for r in rows.fetchall()]

    # Determine columns: visible fields
    export_fields = [f for f in fields_meta if f.get("fieldtype") not in ("Section Break", "Column Break", "Tab Break")]

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    # Header
    writer.writerow([f.get("label", f.get("fieldname")) for f in export_fields])
    # Rows
    for rec in records:
        row_data = []
        for f in export_fields:
            v = rec.get(f.get("fieldname"))
            if v is None:
                row_data.append("")
            elif hasattr(v, 'isoformat'):
                row_data.append(v.isoformat())
            elif hasattr(v, 'hex') and not isinstance(v, (str, bytes)):
                row_data.append(str(v))
            else:
                row_data.append(str(v))
        writer.writerow(row_data)

    output.seek(0)
    filename = f"{module}_{doctype}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/{module}/{doctype}")
async def list_records(
    module: str,
    doctype: str,
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    filters: Optional[str] = Query(None),
    sort_field: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)
    fields_meta = mdef.fields if isinstance(mdef.fields, list) else json.loads(mdef.fields)
    list_settings = mdef.list_settings if isinstance(mdef.list_settings, dict) else json.loads(mdef.list_settings or '{}')

    # Allowed field names for filtering
    allowed_fields = {
        f.get("fieldname") for f in fields_meta
        if f.get("fieldtype") not in ("Section Break", "Column Break", "Tab Break")
        and _IDENT_RE.match(f.get("fieldname", ""))
    }
    allowed_fields.update({"status", "created_by", "assigned_to"})

    # Build WHERE clause
    conditions = []
    params: dict = {}

    if search:
        # Search across text-like fields that are in_list_view
        search_fields = [
            f.get("fieldname") for f in fields_meta
            if f.get("in_list_view") and f.get("fieldtype") in ("Data", "Text")
            and _IDENT_RE.match(f.get("fieldname", ""))
        ]
        if search_fields:
            or_parts = [f'{_safe_ident(sf)} ILIKE :search' for sf in search_fields[:5]]
            conditions.append(f"({' OR '.join(or_parts)})")
            params["search"] = f"%{search}%"

    if status:
        conditions.append('"status" = :status')
        params["status"] = status

    # Arbitrary field filters: JSON object like {"source":"Website","rating":"Hot"}
    if filters:
        try:
            filter_dict = json.loads(filters) if isinstance(filters, str) else {}
        except (json.JSONDecodeError, TypeError):
            filter_dict = {}
        for i, (fname, fval) in enumerate(filter_dict.items()):
            if fname in allowed_fields and _IDENT_RE.match(fname) and fval is not None and fval != "":
                param_key = f"_f{i}"
                conditions.append(f"{_safe_ident(fname)} = :{param_key}")
                params[param_key] = fval

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Sort
    default_sort = list_settings.get("sort_field", "created_at")
    default_order = list_settings.get("sort_order", "desc")
    sf = sort_field or default_sort
    so = sort_order if sort_order in ("asc", "desc") else default_order
    if not _IDENT_RE.match(sf):
        sf = "created_at"
    order_clause = f"ORDER BY {_safe_ident(sf)} {so} NULLS LAST"

    # Pagination
    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    # Count
    count_row = await db.execute(text(f"SELECT COUNT(*) FROM {table} {where}"), params)
    total = count_row.scalar() or 0

    # Fetch
    rows = await db.execute(text(
        f"SELECT * FROM {table} {where} {order_clause} LIMIT :limit OFFSET :offset"
    ), params)
    records = [dict(r._mapping) for r in rows.fetchall()]

    # Serialize dates/datetimes/UUIDs to strings
    for rec in records:
        for k, v in rec.items():
            if hasattr(v, 'isoformat'):
                rec[k] = v.isoformat()
            elif hasattr(v, 'hex') and not isinstance(v, (str, bytes)):
                rec[k] = str(v)

    return {
        "records": records,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


# ── Get single ───────────────────────────────────────────────────────────────

@router.get("/{module}/{doctype}/{record_id}")
async def get_record(
    module: str, doctype: str, record_id: str,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)

    row = await db.execute(text(f"SELECT * FROM {table} WHERE id = :id"), {"id": record_id})
    rec = row.fetchone()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    result = dict(rec._mapping)
    for k, v in result.items():
        if hasattr(v, 'isoformat'):
            result[k] = v.isoformat()
        elif hasattr(v, 'hex') and not isinstance(v, (str, bytes)):
            result[k] = str(v)
    return result


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/{module}/{doctype}")
async def create_record(
    module: str, doctype: str, body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)
    fields_meta = mdef.fields if isinstance(mdef.fields, list) else json.loads(mdef.fields)

    # Only allow fields defined in the module_definition (excluding layout fields)
    allowed = {
        f["fieldname"] for f in fields_meta
        if f.get("fieldtype") not in ("Section Break", "Column Break", "Tab Break")
        and _IDENT_RE.match(f.get("fieldname", ""))
    }
    # Always allow these standard fields
    allowed.update({"created_by", "assigned_to"})

    data = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No valid fields provided")

    # Add created_by
    data["created_by"] = ctx["sub"]

    cols = ", ".join(_safe_ident(k) for k in data)
    placeholders = ", ".join(f":{k}" for k in data)

    row = await db.execute(text(
        f'INSERT INTO {table} ({cols}) VALUES ({placeholders}) RETURNING id'
    ), data)
    new_id = row.scalar()
    await _audit_log(db, mdef.table_name, str(new_id), "create",
                     user_id=ctx["sub"], changed_fields=list(data.keys()),
                     new_values={k: v for k, v in data.items() if k != "created_by"})
    await db.commit()
    return {"id": str(new_id)}


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{module}/{doctype}/{record_id}")
async def update_record(
    module: str, doctype: str, record_id: str, body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)
    fields_meta = mdef.fields if isinstance(mdef.fields, list) else json.loads(mdef.fields)

    allowed = {
        f["fieldname"] for f in fields_meta
        if f.get("fieldtype") not in ("Section Break", "Column Break", "Tab Break")
        and not f.get("read_only")
        and _IDENT_RE.match(f.get("fieldname", ""))
    }
    allowed.update({"assigned_to", "status"})

    data = {k: v for k, v in body.items() if k in allowed}
    if not data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Fetch old values for audit
    old_cols = ", ".join(_safe_ident(k) for k in data)
    old_row = await db.execute(text(f"SELECT {old_cols} FROM {table} WHERE id = :id"), {"id": record_id})
    old_rec = old_row.fetchone()
    old_values = {}
    if old_rec:
        old_values = {k: (v.isoformat() if hasattr(v, 'isoformat') else str(v) if hasattr(v, 'hex') and not isinstance(v, (str, bytes)) else v) for k, v in dict(old_rec._mapping).items()}

    sets = ", ".join(f'{_safe_ident(k)} = :{k}' for k in data)
    data["id"] = record_id
    data["_now"] = "NOW()"

    result = await db.execute(text(
        f'UPDATE {table} SET {sets}, updated_at = NOW() WHERE id = :id RETURNING id'
    ), data)
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Record not found")

    # Audit log — only log fields that actually changed
    changed = {k: v for k, v in body.items() if k in allowed and old_values.get(k) != v}
    if changed:
        await _audit_log(db, mdef.table_name, record_id, "update",
                         user_id=ctx["sub"], changed_fields=list(changed.keys()),
                         old_values={k: old_values.get(k) for k in changed},
                         new_values=changed)
    await db.commit()
    return {"ok": True}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{module}/{doctype}/{record_id}")
async def delete_record(
    module: str, doctype: str, record_id: str,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    mdef = await _get_def(db, module, doctype)
    table = _safe_ident(mdef.table_name)

    result = await db.execute(text(f"DELETE FROM {table} WHERE id = :id RETURNING id"), {"id": record_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Record not found")
    await _audit_log(db, mdef.table_name, record_id, "delete", user_id=ctx["sub"])
    await db.commit()
    return {"ok": True}
