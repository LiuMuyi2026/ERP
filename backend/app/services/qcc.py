"""
企查查 (QCC) Open API client.

Docs: https://openapi.qcc.com
Auth: Token = MD5(AppKey + Timespan + SecretKey).upper()

Provides company search, detail, personnel, and risk data
as a reliable alternative to web scraping.
"""
import hashlib
import logging
import time
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.qichacha.com"
_TIMEOUT = 10.0


def _is_configured() -> bool:
    return bool(settings.qcc_app_key and settings.qcc_secret_key)


def _auth_headers() -> dict[str, str]:
    ts = str(int(time.time()))
    raw = settings.qcc_app_key + ts + settings.qcc_secret_key
    token = hashlib.md5(raw.encode("utf-8")).hexdigest().upper()
    return {"Token": token, "Timespan": ts}


async def _get(path: str, params: dict[str, Any] | None = None) -> dict:
    """Make authenticated GET request to QCC API."""
    if not _is_configured():
        return {}
    p = {"key": settings.qcc_app_key, **(params or {})}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{BASE_URL}{path}", params=p, headers=_auth_headers())
        resp.raise_for_status()
        data = resp.json()
    status = str(data.get("Status", ""))
    if status not in ("200", "201"):
        logger.warning(f"QCC API {path} status={status} msg={data.get('Message')}")
    return data


# ── Public helpers ────────────────────────────────────────────────────────────

async def search_company(keyword: str) -> list[dict]:
    """Fuzzy search companies by name/person/product.
    Returns list of {name, credit_code, legal_rep, status, start_date, address, key_no}.
    """
    if not _is_configured():
        return []
    try:
        data = await _get("/FuzzySearch/GetList", {"searchKey": keyword})
        results = data.get("Result") or []
        return [
            {
                "key_no": r.get("KeyNo", ""),
                "name": r.get("Name", ""),
                "credit_code": r.get("CreditCode", ""),
                "legal_rep": r.get("OperName", ""),
                "status": r.get("Status", ""),
                "start_date": r.get("StartDate", ""),
                "address": r.get("Address", ""),
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"QCC search_company failed: {e}")
        return []


async def get_company_detail(keyword: str) -> dict:
    """Get comprehensive company info including shareholders, personnel, contacts.
    `keyword` can be company name or unified social credit code.
    Returns full detail dict with nested Partners, Employees, ContactInfo, etc.
    """
    if not _is_configured():
        return {}
    try:
        data = await _get("/ECIInfoVerify/GetInfo", {"searchKey": keyword})
        return data.get("Result") or {}
    except Exception as e:
        logger.error(f"QCC get_company_detail failed: {e}")
        return {}


async def get_personnel(keyword: str) -> list[dict]:
    """Extract key personnel (法人/高管/股东) from company detail.
    Returns list of {name, title, is_legal_rep}.
    """
    detail = await get_company_detail(keyword)
    if not detail:
        return []

    people: list[dict] = []
    seen: set[str] = set()

    # Legal representative
    legal_rep = detail.get("OperName", "")
    if legal_rep:
        people.append({
            "name": legal_rep,
            "title": "法定代表人",
            "is_legal_rep": True,
        })
        seen.add(legal_rep)

    # Key personnel (董监高)
    for emp in detail.get("Employees") or []:
        name = emp.get("Name", "")
        if name and name not in seen:
            seen.add(name)
            people.append({
                "name": name,
                "title": emp.get("Job", "高管"),
                "is_legal_rep": False,
            })

    # Shareholders
    for partner in detail.get("Partners") or []:
        name = partner.get("StockName", "")
        if name and name not in seen:
            seen.add(name)
            ratio = partner.get("StockPercent", "")
            people.append({
                "name": name,
                "title": f"股东 ({ratio})" if ratio else "股东",
                "is_legal_rep": False,
            })

    return people


async def get_contact_info(keyword: str) -> dict:
    """Get company contact info (phone, email, website).
    Returns {phone, email, website, address}.
    """
    detail = await get_company_detail(keyword)
    if not detail:
        return {}
    ci = detail.get("ContactInfo") or {}
    return {
        "phone": ci.get("PhoneNumber") or detail.get("ContactNumber", ""),
        "email": ci.get("Email") or detail.get("Email", ""),
        "website": ci.get("WebSite") or detail.get("WebSite", ""),
        "address": detail.get("Address", ""),
    }


async def get_risk_summary(keyword: str) -> dict:
    """Get basic risk indicators for a company.
    Returns {legal_rep, status, credit_code, has_risk_flags}.
    Uses the basic detail endpoint to keep costs low.
    """
    detail = await get_company_detail(keyword)
    if not detail:
        return {}
    return {
        "name": detail.get("Name", ""),
        "legal_rep": detail.get("OperName", ""),
        "status": detail.get("Status", ""),
        "credit_code": detail.get("CreditCode", ""),
        "registered_capital": detail.get("RegistCapi", ""),
        "start_date": detail.get("StartDate", ""),
        "scope": detail.get("Scope", ""),
    }


async def search_people_at_company(company_name: str) -> list[dict]:
    """High-level: search for a company and return its personnel with contact info.
    This is the main function used by the AI Finder pipeline.
    Returns list of PersonResult-compatible dicts.
    """
    if not _is_configured():
        return []

    detail = await get_company_detail(company_name)
    if not detail:
        # Try fuzzy search first
        companies = await search_company(company_name)
        if companies:
            detail = await get_company_detail(companies[0]["name"])
    if not detail:
        return []

    full_name = detail.get("Name", company_name)
    contact = detail.get("ContactInfo") or {}
    phone = contact.get("PhoneNumber") or detail.get("ContactNumber", "")
    email = contact.get("Email") or detail.get("Email", "")
    address = detail.get("Address", "")

    people = await get_personnel(company_name)
    results: list[dict] = []
    for p in people[:10]:
        results.append({
            "name": p["name"],
            "title": p["title"],
            "company": full_name,
            "location": address,
            "email": email if p.get("is_legal_rep") else None,
            "phone": phone if p.get("is_legal_rep") else None,
            "source_url": f"https://www.qcc.com/search?key={full_name}",
            "source_title": "企查查工商数据",
            "summary": f"{full_name} {p['title']}，公司经营范围：{(detail.get('Scope') or '')[:80]}",
            "match_reason": "企查查工商登记数据",
            "confidence": 0.95 if p.get("is_legal_rep") else 0.85,
        })
    return results
