from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


async def check_duplicate_lead(
    full_name: str,
    email: str | None,
    phone: str | None,
    whatsapp: str | None,
    db: AsyncSession,
    tenant_id: str | None = None,
) -> dict:
    """Tier 1: pg_trgm similarity, Tier 2: Gemini disambiguation."""
    conditions = ["similarity(full_name, :name) > 0.4"]
    params: dict = {"name": full_name}
    if email:
        conditions.append("email = :email")
        params["email"] = email
    if phone:
        conditions.append("phone = :phone")
        params["phone"] = phone
    if whatsapp:
        conditions.append("whatsapp = :whatsapp")
        params["whatsapp"] = whatsapp
    query = text(
        f"SELECT id, full_name, email, phone, whatsapp, similarity(full_name, :name) as name_sim "
        f"FROM leads WHERE {' OR '.join(conditions)} ORDER BY name_sim DESC LIMIT 5"
    )
    try:
        # Use a savepoint so a query failure doesn't abort the outer transaction.
        await db.execute(text("SAVEPOINT dup_check"))
        result = await db.execute(query, params)
        candidates = result.fetchall()
        await db.execute(text("RELEASE SAVEPOINT dup_check"))
    except Exception:
        try:
            await db.execute(text("ROLLBACK TO SAVEPOINT dup_check"))
        except Exception:
            pass
        return {"is_duplicate": False, "duplicate_id": None, "confidence": 0.0}

    if not candidates:
        return {"is_duplicate": False, "duplicate_id": None, "confidence": 0.0}

    for row in candidates:
        if email and row.email and row.email.lower() == email.lower():
            return {"is_duplicate": True, "duplicate_id": str(row.id), "confidence": 1.0, "method": "exact_email"}
        if whatsapp and row.whatsapp and row.whatsapp == whatsapp:
            return {"is_duplicate": True, "duplicate_id": str(row.id), "confidence": 1.0, "method": "exact_whatsapp"}

    top = candidates[0]
    if float(top.name_sim) > 0.85:
        return {"is_duplicate": True, "duplicate_id": str(top.id), "confidence": float(top.name_sim), "method": "high_similarity"}

    if float(top.name_sim) > 0.5:
        candidates_text = "\n".join([
            f"- ID: {row.id}, Name: {row.full_name}, Email: {row.email or 'N/A'}"
            for row in candidates
        ])
        prompt = f"""Is this new lead a duplicate of any existing ones?

New Lead: Name: {full_name}, Email: {email or 'N/A'}, Phone: {phone or 'N/A'}

Existing Leads:
{candidates_text}

Return JSON: {{"is_duplicate": bool, "duplicate_id": "uuid or null", "confidence": 0.0-1.0}}"""
        try:
            from app.services.ai.provider import generate_json_for_tenant
            return await generate_json_for_tenant(db, tenant_id, prompt, "You are a deduplication expert. Return JSON only.")
        except Exception:
            pass

    return {"is_duplicate": False, "duplicate_id": None, "confidence": 0.0}
