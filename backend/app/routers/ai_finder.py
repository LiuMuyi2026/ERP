"""
AI Finder — Firecrawl-inspired pipeline
Search strategy (mirrors Firecrawl):
  ✅ Uses `ddgs` package (primp/Rust TLS fingerprint spoofing) — bypasses DDG anti-bot
  ✅ LinkedIn site: queries — best source for professional profiles
  ✅ LinkedIn snippets extracted without scraping (LinkedIn blocks crawlers)
  ✅ Non-LinkedIn pages scraped with httpx verify=False
  ✅ asyncio pipeline (as_completed) — stream results as each finishes
  ✅ Gemini fallback when all web search is blocked
"""
import asyncio
import concurrent.futures
import html as html_module
import json
import logging
import random
import re
import secrets
import uuid
from typing import AsyncIterator
from urllib.parse import quote_plus, unquote, urlparse

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user_with_tenant
from app.services.ai.provider import generate_json_for_tenant
from app.services.qcc import search_people_at_company as qcc_search_people, search_company as qcc_search_company, _is_configured as qcc_is_configured
from app.utils.sql import safe_set_search_path

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai-finder", tags=["ai-finder"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PeopleSearchRequest(BaseModel):
    query: str
    limit: int = 8
    exclude_names: list[str] = []  # names already found — for "search more"


class NewsItem(BaseModel):
    title: str
    url: str
    snippet: str | None = None


class PersonResult(BaseModel):
    id: str
    name: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    email: str | None = None
    phone: str | None = None
    wechat: str | None = None
    linkedin: str | None = None
    source_url: str
    source_title: str | None = None
    summary: str | None = None
    match_reason: str | None = None
    confidence: float = 0.0
    news: list[NewsItem] | None = None


class CompanyResearchRequest(BaseModel):
    query: str
    limit_urls: int = 8


class FindSimilarRequest(BaseModel):
    person: PersonResult
    limit: int = 6


class CompanySearchRequest(BaseModel):
    query: str
    limit: int = 10
    exclude_names: list[str] = []  # company names already found — for "search more"


class CompanySummary(BaseModel):
    id: str
    company_name: str
    industry: str | None = None
    location: str | None = None
    snippet: str | None = None       # 1-2句简介
    website: str | None = None
    source_url: str
    source_title: str | None = None
    confidence: float = 0.0
    founded: str | None = None
    size: str | None = None


# ── Constants ─────────────────────────────────────────────────────────────────

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
]

_BLOCKED_DOMAINS = {
    "facebook.com", "instagram.com", "tiktok.com", "snapchat.com",
    "twitter.com", "x.com", "threads.net",
    "nytimes.com", "wsj.com", "ft.com", "bloomberg.com", "economist.com",
    "hbr.org", "sciencedirect.com", "springer.com", "wiley.com",
    "amazon.com", "alibaba.com", "taobao.com", "tmall.com",
    "youtube.com", "youtu.be", "bilibili.com",
    "quora.com", "reddit.com",
    # Spam/NSFW domains from Yandex search results
    "91jav.com", "hyjrf.com", "bbj75.com", "bkh25.com",
    "crazyhome2000.com", "snw2.lat",
}

# Block spam domains by pattern (random subdomain + TLD combos)
_SPAM_DOMAIN_PATTERNS = re.compile(
    r'(campus|author|board|wiki|center|assume|bjgth)\.[a-z]{6,12}\.(cc|com|lat)$'
)

# Keywords in title/URL that strongly suggest NOT a person page
_NON_PERSON_SIGNALS = [
    "news", "article", "blog", "category", "search", "results", "index",
    "products", "services", "shop", "store", "careers", "jobs",
    "新闻", "文章", "搜索", "产品", "商品",
]

# FIX 2: Reduced timeouts
_SCRAPE_TIMEOUT = 6.0   # was 14.0 — slow sites are JS-rendered anyway, won't help us
_SEARCH_TIMEOUT = 6.0   # was 12.0 — DDG should respond in 2-3s normally
_LLM_TIMEOUT = 10.0     # NEW: per-LLM-call timeout guard


def _rand_ua() -> str:
    return random.choice(_USER_AGENTS)


def _is_blocked(url: str) -> bool:
    try:
        domain = urlparse(url).netloc.lower().lstrip("www.")
        if any(domain == b or domain.endswith("." + b) for b in _BLOCKED_DOMAINS):
            return True
        if _SPAM_DOMAIN_PATTERNS.search(domain):
            return True
        return False
    except Exception:
        return False


def _url_priority_score(url: str) -> int:
    """Higher score = scrape first."""
    if _is_blocked(url):
        return -999
    score = 0
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        path = parsed.path.lower()
        if "linkedin.com" in domain and "/in/" in path:
            score += 10
        depth = path.rstrip("/").count("/")
        if depth >= 2:
            score += 2
        elif depth == 1:
            score += 1
        if any(x in path for x in ["/page/", "/category/", "/tag/", "?p=", "?page="]):
            score -= 3
        for good in ["crunchbase.com", "glassdoor.com", "zoominfo.com", "apollo.io",
                     "tianyancha.com", "qcc.com", "aiqicha.baidu.com", "qixin.com",
                     "shuidi.cn", "qichacha.com"]:
            if good in domain:
                score += 8
        # Baidu redirect links from Crawl4AI search — these resolve to good sources
        if "baidu.com/link" in url:
            score += 5
    except Exception:
        pass
    return score


# FIX 5: Pre-filter without calling LLM
def _looks_like_person_page(url: str, title: str, description: str) -> bool:
    """Quick heuristic check — skip obvious non-person pages before hitting LLM."""
    text = f"{url} {title} {description}".lower()
    # Chinese business directories and Baidu redirect links are always relevant
    if _is_cn_biz_site(url) or "baidu.com/link" in url:
        return True
    # Strong positive signals
    positive = any(x in text for x in [
        "/in/", "/profile", "/person/", "/bio", "/about/",
        "linkedin.com", "crunchbase.com",
        "ceo", "cto", "director", "manager", "founder", "president",
        "总监", "总经理", "创始人", "负责人", "法人", "股东", "高管",
        "tianyancha", "qcc.com", "aiqicha", "qixin",
        "联系方式", "电话", "邮箱",
        "进出口", "贸易", "公司", "企业", "集团",
    ])
    # Strong negative signals (skip immediately)
    if any(f"/{x}" in text or f" {x} " in text for x in _NON_PERSON_SIGNALS):
        if not positive:
            return False
    return True


# ── Search providers (Firecrawl-inspired: ddgs package with TLS fingerprinting) ─

# Thread pool for running sync ddgs calls without blocking the event loop.
# IMPORTANT: max_workers=1 because primp (Rust TLS lib) is NOT thread-safe —
# concurrent DDGS calls from multiple threads deadlock.
_search_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="ddgs")


def _ddgs_search_sync(query: str, num: int, backend: str = "google") -> list[dict]:
    """
    Firecrawl-style: use ddgs with primp TLS fingerprinting + verify=False.
    verify=False bypasses macOS SSL cert chain issue without weakening actual TLS.
    Supports google / bing / yahoo / brave backends — all work without API keys.
    """
    import warnings
    warnings.filterwarnings("ignore")
    from ddgs import DDGS

    results = []
    try:
        raw = DDGS(timeout=8, verify=False).text(query, max_results=num, backend=backend)
        for r in (raw or []):
            url = r.get("href", "")
            if url and not _is_blocked(url):
                results.append({
                    "url": url,
                    "title": r.get("title", ""),
                    "description": r.get("body", ""),
                })
    except Exception as e:
        logger.warning(f"ddgs/{backend} search failed for '{query[:50]}': {e}")
    return results


async def _ddg_search(query: str, num: int = 8, backend: str = "google") -> list[dict]:
    """Async wrapper — runs ddgs in thread pool to avoid blocking the event loop."""
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(_search_executor, _ddgs_search_sync, query, num, backend),
        timeout=15.0,
    )


async def _multi_search(queries: list[str], per_query: int = 8, use_baidu: bool = False) -> list[dict]:
    """
    Multi-engine search (Firecrawl strategy).
    Uses DDG api + html backends (reliable, no rate-limiting) plus lite as fallback.
    Google/Brave backends are rate-limited (429) so we avoid them.
    For Chinese queries, also uses Crawl4AI to scrape Baidu as supplementary source.
    """
    seen_urls: set[str] = set()
    all_results: list[dict] = []

    # Build tasks: each query × [duckduckgo, yahoo]
    # google/brave backends are rate-limited (429), so we use DDG's own index + Yahoo
    tasks = []
    for q in queries:
        tasks.append(_ddg_search(q, per_query, backend="duckduckgo"))
        tasks.append(_ddg_search(q, per_query, backend="yahoo"))

    # Auto-detect Chinese queries
    has_chinese = use_baidu or any(
        '\u4e00' <= c <= '\u9fff' for q in queries for c in q
    )
    # Note: Baidu Crawl4AI search disabled — Baidu triggers CAPTCHAs for headless
    # browsers. DDG's duckduckgo backend works well for Chinese business queries.

    batches = await asyncio.gather(*tasks, return_exceptions=True)
    for batch in batches:
        if isinstance(batch, list):
            for r in batch:
                u = r.get("url", "")
                if u and u not in seen_urls and not _is_blocked(u):
                    seen_urls.add(u)
                    all_results.append(r)

    logger.info(f"Multi-search returned {len(all_results)} results for {len(queries)} queries (baidu={has_chinese})")
    return all_results


async def _resolve_baidu_redirect(url: str) -> str:
    """Follow Baidu redirect link to get the actual URL."""
    if "baidu.com/link" not in url:
        return url
    try:
        # Use GET with redirect following — HEAD is rejected by many Chinese sites
        async with httpx.AsyncClient(timeout=8, follow_redirects=False, verify=False) as client:
            resp = await client.get(url, headers={"User-Agent": _rand_ua()})
            # Baidu returns 302 with Location header
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("location", "")
                if location and "baidu.com" not in location:
                    return location
            # If redirect was followed, check final URL
            final_url = str(resp.url)
            if final_url and "baidu.com" not in final_url:
                return final_url
    except Exception as e:
        logger.debug(f"Baidu redirect resolve failed for {url}: {e}")
    return url


async def _crawl4ai_search_cn(query: str, limit: int = 8) -> list[dict]:
    """
    Use Crawl4AI to scrape Chinese search engines (Baidu) for business info.
    DDG is terrible for Chinese business queries — Baidu is far superior.
    Resolves Baidu redirect links to actual URLs for better scraping.
    """
    results: list[dict] = []
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

        encoded_query = quote_plus(query)
        search_url = f"https://www.baidu.com/s?wd={encoded_query}&rn={limit}"

        browser_conf = BrowserConfig(headless=True, java_script_enabled=True)
        run_conf = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            page_timeout=15000,
            delay_before_return_html=2.0,
        )
        async with AsyncWebCrawler(config=browser_conf) as crawler:
            result = await asyncio.wait_for(
                crawler.arun(url=search_url, config=run_conf),
                timeout=20.0,
            )
            if not result.success:
                return results

            html = result.html or ""
            # Extract Baidu search result links and titles
            blocks = re.findall(
                r'<h3[^>]*class="[^"]*t[^"]*"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>',
                html, re.DOTALL
            )
            raw_results = []
            for link_url, title_html in blocks[:limit]:
                title = re.sub(r'<[^>]+>', '', title_html).strip()
                if not link_url or not title:
                    continue
                if _is_blocked(link_url):
                    continue
                raw_results.append({"url": link_url, "title": title, "description": title})

            # Resolve Baidu redirect links in parallel to get real URLs
            resolve_tasks = [_resolve_baidu_redirect(r["url"]) for r in raw_results]
            resolved_urls = await asyncio.gather(*resolve_tasks, return_exceptions=True)
            for i, resolved in enumerate(resolved_urls):
                actual_url = resolved if isinstance(resolved, str) else raw_results[i]["url"]
                if not _is_blocked(actual_url):
                    raw_results[i]["url"] = actual_url
                    results.append(raw_results[i])

            logger.info(f"Crawl4AI Baidu search returned {len(results)} results for '{query[:40]}'")
    except Exception as e:
        logger.warning(f"Crawl4AI Baidu search failed: {e}")
    return results


async def _search_news(name: str, company: str | None = None, limit: int = 5) -> list[dict]:
    """Search recent news for a person or company via DDG."""
    query_parts = [name]
    if company:
        query_parts.append(company)
    query = " ".join(query_parts) + " news 2026"
    results = await _ddg_search(query, num=limit)
    return [
        {"title": r["title"], "url": r["url"], "snippet": r.get("description", "")}
        for r in results[:limit]
    ]


# ── Chinese business directory domains (JS-rendered, need Crawl4AI) ───────────

_CN_BIZ_DOMAINS = {
    "tianyancha.com", "qcc.com", "aiqicha.baidu.com", "qixin.com",
    "gsxt.gov.cn", "xiaohongshu.com", "zhihu.com",
}


def _is_cn_biz_site(url: str) -> bool:
    try:
        domain = urlparse(url).netloc.lower().lstrip("www.")
        return any(domain == d or domain.endswith("." + d) for d in _CN_BIZ_DOMAINS)
    except Exception:
        return False


# ── Scraping ──────────────────────────────────────────────────────────────────

def _extract_text_from_html(html: str) -> str:
    for tag in ["script", "style", "nav", "footer", "header", "noscript", "svg", "iframe"]:
        html = re.sub(rf'<{tag}[^>]*>.*?</{tag}>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<(?:br|p|div|h[1-6]|li|tr|section|article)[^>]*>', '\n', html, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', html)
    text = html_module.unescape(text)
    lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in text.split('\n')]
    return '\n'.join(line for line in lines if line).strip()


_crawl4ai_semaphore = asyncio.Semaphore(3)


async def _scrape_page_crawl4ai(url: str) -> str:
    """Scrape JS-rendered pages (Chinese biz sites etc.) using Crawl4AI headless browser."""
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

        async with _crawl4ai_semaphore:
            browser_conf = BrowserConfig(
                headless=True,
                java_script_enabled=True,
            )
            run_conf = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=15000,
                delay_before_return_html=2.0,
                remove_overlay_elements=True,
            )
            async with AsyncWebCrawler(config=browser_conf) as crawler:
                result = await asyncio.wait_for(
                    crawler.arun(url=url, config=run_conf),
                    timeout=20.0,
                )
                if result.success and result.markdown:
                    text = result.markdown.raw_markdown if hasattr(result.markdown, 'raw_markdown') else str(result.markdown)
                    return text[:8000] if len(text) >= 150 else ""
                return ""
    except Exception as e:
        logger.debug(f"Crawl4AI scrape failed {url}: {e}")
        return ""


async def _scrape_page_firecrawl(url: str) -> str:
    """Scrape page using Firecrawl API — only enabled when FIRECRAWL_API_KEY is set."""
    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if not api_key:
        return ""
    try:
        from firecrawl import FirecrawlApp
        app = FirecrawlApp(api_key=api_key)
        loop = asyncio.get_running_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: app.scrape_url(url, params={"formats": ["markdown"]})),
            timeout=15.0,
        )
        if result and result.get("markdown"):
            text = result["markdown"]
            return text[:8000] if len(text) >= 150 else ""
        return ""
    except Exception as e:
        logger.debug(f"Firecrawl scrape failed {url}: {e}")
        return ""


async def _scrape_page(url: str) -> str:
    # Use Crawl4AI for Chinese business sites (JS-rendered) and Baidu redirect links
    if _is_cn_biz_site(url) or "baidu.com/link" in url:
        return await _scrape_page_crawl4ai(url)

    headers = {
        "User-Agent": _rand_ua(),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    try:
        async with httpx.AsyncClient(timeout=_SCRAPE_TIMEOUT, follow_redirects=True, verify=False) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code >= 400:
                # Fallback: try Firecrawl (if available), then Crawl4AI
                fc_text = await _scrape_page_firecrawl(url)
                return fc_text if fc_text else await _scrape_page_crawl4ai(url)
            ct = resp.headers.get("content-type", "")
            if not any(x in ct for x in ["text/html", "text/plain", "application/xhtml"]):
                return ""
            html = resp.text

        text = _extract_text_from_html(html)
        if len(text) < 150:
            # Page might be JS-rendered, try Firecrawl first then Crawl4AI
            fc_text = await _scrape_page_firecrawl(url)
            return fc_text if fc_text else await _scrape_page_crawl4ai(url)
        return text[:8000]
    except Exception as e:
        logger.debug(f"httpx scrape failed {url}, trying fallbacks: {e}")
        fc_text = await _scrape_page_firecrawl(url)
        return fc_text if fc_text else await _scrape_page_crawl4ai(url)


# ── LLM extraction ────────────────────────────────────────────────────────────

async def _extract_person(
    page_text: str, url: str, title: str, description: str, user_query: str, tenant_ctx: dict
) -> PersonResult | None:
    # Always include search metadata — for CN biz sites the title often has the key info
    # (e.g., "罗健 - 诺钢（天津）进出口贸易有限公司 - 法定代表人/高管/股东 - 爱企查")
    search_meta = f"搜索引擎标题: {title}\n搜索引擎摘要: {description}\n"
    content = page_text if len(page_text) >= 150 else description
    if not content or len(content) < 20:
        # Even if page text is empty, if title has useful info, try extraction
        if len(title) < 10:
            return None
        content = f"{title} {description}"

    prompt = f"""用户正在寻找: "{user_query}"
URL: {url}
{search_meta}
页面内容: {content[:6000]}

任务：提取人物信息。重点关注：
1. 搜索引擎标题是最可靠的信息源！即使页面内容为登录页/验证页，搜索标题中的人名、公司名、职位仍然可信
2. 精确匹配用户搜索的人名（如果搜索词包含人名）
3. 尽一切努力提取联系方式（手机号、座机、邮箱、微信、QQ等）
4. 即使联系方式被部分隐藏（如138****6904），也要提取出来
5. 从工商信息中提取法人代表、股东、高管等角色
6. 如果搜索标题格式类似"姓名 - 公司名 - 角色 - 来源"（如企查查/爱企查/天眼查），直接提取
7. 提取公司注册地址、统一社会信用代码等信息放入summary

仅输出JSON：
{{"is_person":true/false,"name":"姓名或null","title":"职位（法人/总经理/股东等）或null","company":"公司全名或null","location":"城市/国家或null","email":"邮箱或null","phone":"手机或座机号码或null","wechat":"微信号或null","linkedin":"LinkedIn URL或null","summary":"2句专业背景，包含公司业务范围","match_reason":"匹配原因1句","confidence":0.0-1.0}}"""

    try:
        # FIX 6: Per-LLM-call timeout — prevents one hanging call from blocking everything
        result = await asyncio.wait_for(
            generate_json_for_tenant(
                db=tenant_ctx["db"],
                tenant_id_or_slug=tenant_ctx.get("tenant_id"),
                prompt=prompt,
                system_instruction="商业情报分析师，提取人物信息，严格JSON输出。",
            ),
            timeout=_LLM_TIMEOUT,
        )
        # Gemini may return a list instead of dict — unwrap first element
        if isinstance(result, list):
            result = result[0] if result else {}
        if not isinstance(result, dict) or not result.get("is_person"):
            return None
        confidence = float(result.get("confidence", 0))
        if confidence < 0.25:
            return None
        name = result.get("name")
        if not name or len(name) < 2:
            return None
        return PersonResult(
            id=str(uuid.uuid4()), name=name,
            title=result.get("title"), company=result.get("company"),
            location=result.get("location"), email=result.get("email"),
            phone=result.get("phone"), wechat=result.get("wechat"),
            linkedin=result.get("linkedin") or (url if _is_linkedin_profile(url) else None), source_url=url, source_title=title,
            summary=result.get("summary"), match_reason=result.get("match_reason"),
            confidence=confidence,
        )
    except asyncio.TimeoutError:
        logger.warning(f"LLM timeout for {url}")
        return None
    except Exception as e:
        logger.warning(f"LLM extraction failed for {url}: {e}")
        return None


async def _extract_people(
    page_text: str, url: str, title: str, description: str, user_query: str, tenant_ctx: dict
) -> list[PersonResult]:
    """Extract multiple people from a single page (e.g. company directory page on qcc/tianyancha)."""
    search_meta = f"搜索引擎标题: {title}\n搜索引擎摘要: {description}\n"
    content = page_text if len(page_text) >= 150 else description
    if not content or len(content) < 20:
        if len(title) < 10:
            return []
        content = f"{title} {description}"

    prompt = f"""用户正在寻找: "{user_query}"
URL: {url}
{search_meta}
页面内容: {content[:6000]}

任务：从该页面提取所有相关人物信息。这可能是一个企业信息页面，包含多位高管/股东/法人。
请提取页面上所有能找到的人物（最多8人）。

重点关注：
1. 搜索引擎标题是最可靠的信息源
2. 法人代表、股东、高管、总经理、董事等角色
3. 尽一切努力提取联系方式（手机号、座机、邮箱、微信等）
4. 即使联系方式被部分隐藏（如138****6904），也要提取出来
5. 从工商信息中提取所有可见人物

仅输出JSON数组：
[{{"is_person":true,"name":"姓名","title":"职位","company":"公司全名","location":"地区","email":"邮箱或null","phone":"手机或座机或null","wechat":"微信号或null","linkedin":"LinkedIn URL或null","summary":"2句专业背景","match_reason":"匹配原因","confidence":0.0-1.0}}]"""

    try:
        result = await asyncio.wait_for(
            generate_json_for_tenant(
                db=tenant_ctx["db"],
                tenant_id_or_slug=tenant_ctx.get("tenant_id"),
                prompt=prompt,
                system_instruction="商业情报分析师，从页面提取所有人物信息，严格JSON数组输出。",
            ),
            timeout=_LLM_TIMEOUT + 5,
        )
        if isinstance(result, dict):
            result = [result]
        if not isinstance(result, list):
            return []
        people = []
        for item in result:
            if not isinstance(item, dict) or not item.get("is_person"):
                continue
            confidence = float(item.get("confidence", 0))
            if confidence < 0.25:
                continue
            name = item.get("name")
            if not name or len(name) < 2:
                continue
            people.append(PersonResult(
                id=str(uuid.uuid4()), name=name,
                title=item.get("title"), company=item.get("company"),
                location=item.get("location"), email=item.get("email"),
                phone=item.get("phone"), wechat=item.get("wechat"),
                linkedin=item.get("linkedin"),
                source_url=url, source_title=title,
                summary=item.get("summary"), match_reason=item.get("match_reason"),
                confidence=confidence,
            ))
        return people
    except asyncio.TimeoutError:
        logger.warning(f"LLM multi-extract timeout for {url}")
        return []
    except Exception as e:
        logger.warning(f"LLM multi-extract failed for {url}: {e}")
        return []


# ── Core pipeline ─────────────────────────────────────────────────────────────

def _is_linkedin_profile(url: str) -> bool:
    """LinkedIn /in/ profile URLs — use snippet directly, don't scrape (LinkedIn blocks)."""
    try:
        parsed = urlparse(url)
        return "linkedin.com" in parsed.netloc and "/in/" in parsed.path
    except Exception:
        return False


async def _scrape_and_extract(
    result: dict, user_query: str, ctx: dict
) -> PersonResult | list[PersonResult] | None:
    """
    Combined scrape + extract pipeline (Firecrawl-inspired).
    LinkedIn profiles: use DDG snippet directly (no scraping, LinkedIn blocks it).
    CN biz directory pages: use multi-person extraction to get all people from one page.
    Other pages: scrape with httpx then extract with LLM.
    """
    url = result["url"]
    title = result.get("title", "")
    description = result.get("description", "")

    # LinkedIn profile: snippet already has name/title/company — skip scraping
    if _is_linkedin_profile(url):
        # Set linkedin URL in result so LLM can include it
        result["_linkedin"] = url
        return await _extract_person(description, url, title, description, user_query, ctx)

    # Pre-filter non-person pages before expensive LLM call
    if not _looks_like_person_page(url, title, description):
        logger.debug(f"Pre-filtered (non-person signals): {url}")
        return None

    page_text = await _scrape_page(url)

    # CN business directory pages (qcc, tianyancha, etc.) often contain multiple people
    if _is_cn_biz_site(url):
        people = await _extract_people(page_text, url, title, description, user_query, ctx)
        if people:
            return people
        # Fall back to single extraction if multi-extract returns nothing
    return await _extract_person(page_text, url, title, description, user_query, ctx)


def _parse_gemini_people(result: list | dict) -> list[PersonResult]:
    """Parse Gemini JSON response into PersonResult list."""
    items = result if isinstance(result, list) else []
    people = []
    for item in items:
        if not isinstance(item, dict) or not item.get("name"):
            continue
        try:
            people.append(PersonResult(
                id=str(uuid.uuid4()),
                name=item["name"],
                title=item.get("title"),
                company=item.get("company"),
                location=item.get("location"),
                email=item.get("email"),
                phone=item.get("phone"),
                wechat=item.get("wechat"),
                linkedin=item.get("linkedin"),
                source_url=item.get("source_url", item.get("linkedin", "https://google.com")),
                source_title=item.get("source_title", "Google Search"),
                summary=item.get("summary"),
                match_reason=item.get("match_reason"),
                confidence=float(item.get("confidence", 0.7)),
            ))
        except Exception:
            continue
    return people


_GEMINI_PERSON_JSON_SCHEMA = """[
  {{
    "name": "姓名",
    "title": "职位（法人/总经理/股东/CEO等）",
    "company": "公司全名",
    "location": "城市/国家",
    "email": "邮箱或null",
    "phone": "手机或座机或null",
    "wechat": "微信号或null",
    "linkedin": "LinkedIn URL或null",
    "source_url": "信息来源URL",
    "source_title": "来源描述",
    "summary": "2句专业背景，包含公司业务范围",
    "match_reason": "匹配原因",
    "confidence": 0.75
  }}
]"""


async def _gemini_grounded_search(query: str, limit: int, ctx: dict) -> list[PersonResult]:
    """
    Primary search: use Gemini with Google Search grounding to find people.
    Unlike web scraping, this accesses Google's full index (incl. 企查查/天眼查/LinkedIn
    cached data) without being blocked by anti-bot measures.
    """
    import google.generativeai as genai
    from app.config import settings as app_settings

    # Resolve tenant API key
    from app.services.ai.provider import get_tenant_ai_config
    cfg = await get_tenant_ai_config(ctx["db"], ctx.get("tenant_id")) if ctx.get("tenant_id") else {}
    api_key = cfg.get("api_key") or app_settings.gemini_api_key
    if not api_key:
        return []

    genai.configure(api_key=api_key)

    has_chinese = any('\u4e00' <= c <= '\u9fff' for c in query)

    if has_chinese:
        prompt = f"""搜索并找出与"{query}"相关的真实人物信息。

要求：
1. 通过Google搜索获取最新的真实数据，不要编造
2. 重点搜索：企查查/天眼查的工商数据（法人、股东、高管）、LinkedIn职业档案、公司官网团队页面、新闻报道
3. 如果是搜索公司相关人员，要找出法定代表人、总经理、核心高管、业务负责人
4. 如果是搜索个人，要找出其任职公司、职位、联系方式
5. 提取所有可找到的联系方式：手机、座机、邮箱、微信、LinkedIn
6. 联系方式部分隐藏（如138****6904）也请保留原样
7. 最多返回 {limit} 人

仅输出JSON数组：
{_GEMINI_PERSON_JSON_SCHEMA}"""
    else:
        prompt = f"""Search for real people matching: "{query}"

Requirements:
1. Use Google Search to find real, current data — do not fabricate
2. Focus on: LinkedIn profiles, company websites (team/about pages), Crunchbase, news articles
3. For company searches: find CEO, founders, key executives, directors
4. For person searches: find their company, role, contact info
5. Extract all available contact info: email, phone, LinkedIn URL
6. Return up to {limit} people

Output JSON array only:
{_GEMINI_PERSON_JSON_SCHEMA}"""

    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            tools=[genai.Tool(google_search_retrieval=genai.GoogleSearchRetrieval())],
            generation_config=genai.GenerationConfig(temperature=0.1),
        )
        response = await asyncio.wait_for(
            asyncio.to_thread(model.generate_content, prompt),
            timeout=25.0,
        )
        text = response.text.strip()
        # Parse JSON from response (may be wrapped in markdown)
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        result = json.loads(text)
        people = _parse_gemini_people(result)
        logger.info(f"Gemini grounded search found {len(people)} people for '{query}'")
        return people
    except Exception as e:
        logger.warning(f"Gemini grounded search failed: {e}")
        return []


async def _gemini_direct_search(query: str, limit: int, ctx: dict) -> list[PersonResult]:
    """
    Fallback: ask Gemini directly for people matching the query.
    Used when web scraping yields no results (blocked by anti-bot).
    Gemini has broad knowledge of publicly known professionals.
    """
    prompt = f"""你是专业商业情报分析师。
用户正在寻找: "{query}"

列出 {limit} 位匹配的真实人物。
优先使用中国工商数据（天眼查、企查查等）、LinkedIn、公司官网、新闻报道等公开信息。
重点提取联系方式（手机号、座机、邮箱、微信等）。
对于中国企业，关注法人代表、总经理、股东等工商登记信息。

仅输出JSON数组：
{_GEMINI_PERSON_JSON_SCHEMA}"""

    try:
        result = await asyncio.wait_for(
            generate_json_for_tenant(
                db=ctx["db"],
                tenant_id_or_slug=ctx.get("tenant_id"),
                prompt=prompt,
                system_instruction="Business intelligence analyst. Output only valid JSON arrays with real, publicly known professionals.",
            ),
            timeout=20.0,
        )
        return _parse_gemini_people(result)
    except Exception as e:
        logger.warning(f"Gemini direct search failed: {e}")
        return []


async def _run_people_pipeline(query: str, limit: int, ctx: dict, exclude_names: list[str] | None = None) -> AsyncIterator[str]:
    _excluded = {n.lower().strip() for n in (exclude_names or [])}
    is_more = len(_excluded) > 0
    action_prefix = "继续" if is_more else ""
    yield f"data: {json.dumps({'type': 'status', 'phase': 'searching', 'message': f'正在{action_prefix}搜索「{query}」...'})}\n\n"

    # Detect if query contains Chinese characters
    has_chinese = any('\u4e00' <= c <= '\u9fff' for c in query)

    if has_chinese:
        if is_more:
            # "Search more" — use different query angles to find new people
            queries = [
                f'{query} 销售经理 业务经理',
                f'{query} 副总 董事 监事',
                f'{query} 采购 外贸 进出口',
                f'{query} 联系人 负责人 经理',
                f'site:linkedin.com/in "{query}"',
            ]
        else:
            queries = [
                f'{query} 法人 联系方式 电话',
                f'{query} 总经理 负责人 联系电话 邮箱',
                f'{query} 天眼查 企查查',
                f'{query} 高管 股东',
                f'{query} 法定代表人 工商信息',
                f'{query} 业务负责人 采购经理',
                f'site:linkedin.com/in {query}',
            ]
    else:
        if is_more:
            queries = [
                f'{query} manager director team',
                f'{query} sales operations VP',
                f'site:linkedin.com/in "{query}" manager OR director',
                f'{query} staff employee contact',
            ]
        else:
            queries = [
                f'site:linkedin.com/in {query}',
                f'site:linkedin.com/in "{query}"',
                f'{query} professional profile LinkedIn',
            ]

    # Run web search + Gemini grounded search + QCC API in parallel
    search_task = asyncio.create_task(_multi_search(queries, per_query=8))
    grounded_task = asyncio.create_task(_gemini_grounded_search(query, limit, ctx))
    qcc_task = asyncio.create_task(qcc_search_people(query)) if (has_chinese and qcc_is_configured()) else None
    tick = 0
    while not search_task.done():
        await asyncio.sleep(0.8)
        tick += 1
        yield f"data: {json.dumps({'type': 'heartbeat', 'phase': 'searching', 'elapsed': tick})}\n\n"
    all_results = await search_task
    all_results.sort(key=lambda r: _url_priority_score(r["url"]), reverse=True)

    # Collect Gemini grounded search results (may already be done or still running)
    try:
        grounded_people = await asyncio.wait_for(asyncio.shield(grounded_task), timeout=5.0)
    except (asyncio.TimeoutError, Exception):
        grounded_people = []

    # Collect QCC API results
    qcc_people: list[PersonResult] = []
    if qcc_task:
        try:
            raw = await asyncio.wait_for(asyncio.shield(qcc_task), timeout=5.0)
            for item in (raw or []):
                qcc_people.append(PersonResult(
                    id=str(uuid.uuid4()), **{k: v for k, v in item.items() if k != "id"},
                ))
        except (asyncio.TimeoutError, Exception) as e:
            logger.debug(f"QCC search failed: {e}")

    # Ensure high-priority CN biz / Baidu results always get processed
    # even if they'd otherwise be cut off by the candidate limit
    priority_results = [r for r in all_results if _url_priority_score(r["url"]) >= 5]
    other_results = [r for r in all_results if _url_priority_score(r["url"]) < 5]
    max_candidates = min(limit + 10, 30)
    candidates = priority_results + other_results[:max(0, max_candidates - len(priority_results))]
    candidates = candidates[:max_candidates]
    total = len(candidates)

    # ── No web results: use QCC + Gemini grounded results + direct fallback ──
    if not candidates:
        found_count = 0
        # QCC API results first
        if qcc_people:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'extracting', 'message': f'企查查找到 {len(qcc_people)} 人...', 'total_candidates': limit})}\n\n"
            for person in qcc_people:
                name_key = person.name.lower().strip()
                if name_key in _excluded:
                    continue
                found_count += 1
                yield f"data: {json.dumps({'type': 'person', 'data': person.model_dump(), 'found': found_count, 'completed': found_count, 'total_candidates': limit})}\n\n"
                if found_count >= limit:
                    break
        _seen_fallback = {p.name.lower().strip() for p in qcc_people} | _excluded
        if found_count < limit and grounded_people:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'extracting', 'message': f'通过 AI 联网搜索找到 {len(grounded_people)} 人...', 'total_candidates': limit})}\n\n"
            for person in grounded_people:
                name_key = person.name.lower().strip()
                if name_key in _seen_fallback:
                    continue
                _seen_fallback.add(name_key)
                found_count += 1
                yield f"data: {json.dumps({'type': 'person', 'data': person.model_dump(), 'found': found_count, 'completed': found_count, 'total_candidates': limit})}\n\n"
                if found_count >= limit:
                    break
        if found_count < limit:
            yield f"data: {json.dumps({'type': 'status', 'phase': 'extracting', 'message': '启用 AI 知识库补充检索...', 'total_candidates': limit})}\n\n"
            gemini_people = await _gemini_direct_search(query, limit - found_count, ctx)
            for person in gemini_people:
                if person.name.lower().strip() in _seen_fallback:
                    continue
                found_count += 1
                yield f"data: {json.dumps({'type': 'person', 'data': person.model_dump(), 'found': found_count, 'completed': found_count, 'total_candidates': limit})}\n\n"
                if found_count >= limit:
                    break
        msg = (f"共找到 {found_count} 位符合条件的人员" if found_count > 0
               else "未找到匹配人员，建议细化搜索条件（加上行业、国家、公司名等）")
        yield f"data: {json.dumps({'type': 'status', 'phase': 'done', 'message': msg, 'found': found_count, 'total_candidates': limit})}\n\n"
        return
    # ──────────────────────────────────────────────────────────────────────────

    yield f"data: {json.dumps({'type': 'status', 'phase': 'scraping', 'message': f'找到 {len(all_results)} 个来源，分析 Top {total} 个...', 'total_candidates': total})}\n\n"

    # For Chinese queries: process CN business directory sites first (qcc.com, aiqicha,
    # tianyancha etc.) — they contain exact person/company data from 工商 records.
    # Without this, faster LinkedIn extractions fill all slots before CN sites finish.
    if has_chinese:
        cn_biz_dirs = {"tianyancha.com", "qcc.com", "aiqicha.baidu.com", "qixin.com", "shuidi.cn", "qichacha.com"}
        def _is_cn_biz_dir(url: str) -> bool:
            try:
                d = urlparse(url).netloc.lower().lstrip("www.")
                return any(bd in d for bd in cn_biz_dirs)
            except Exception:
                return False
        priority_candidates = [r for r in candidates if _is_cn_biz_dir(r["url"])]
        normal_candidates = [r for r in candidates if not _is_cn_biz_dir(r["url"])]
    else:
        priority_candidates = []
        normal_candidates = candidates

    found_count = 0
    completed_count = 0
    seen_names: set[str] = set(_excluded)  # seed with already-found names for "search more"
    found_people: list[PersonResult] = []

    # Phase 0: QCC API results first (highest confidence — official 工商 data)
    if qcc_people:
        for person in qcc_people:
            if found_count >= limit:
                break
            name_key = person.name.lower().strip()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)
            found_count += 1
            found_people.append(person)
            yield f"data: {json.dumps({'type': 'person', 'data': person.model_dump(), 'found': found_count, 'completed': 0, 'total_candidates': total})}\n\n"

    async def _process_batch(batch):
        nonlocal found_count, completed_count
        tasks = [_scrape_and_extract(r, query, ctx) for r in batch]
        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
                completed_count += 1
                # Multi-person extraction returns a list
                persons = result if isinstance(result, list) else ([result] if result else [])
                for person in persons:
                    if person and found_count < limit:
                        name_key = person.name.lower().strip()
                        if name_key in seen_names:
                            continue
                        seen_names.add(name_key)
                        found_count += 1
                        found_people.append(person)
                        yield f"data: {json.dumps({'type': 'person', 'data': person.model_dump(), 'found': found_count, 'completed': completed_count, 'total_candidates': total})}\n\n"
                if not persons:
                    yield f"data: {json.dumps({'type': 'progress', 'found': found_count, 'completed': completed_count, 'total_candidates': total})}\n\n"
            except Exception as e:
                logger.debug(f"Pipeline task error: {e}")

    # Phase 1: Priority CN biz sites
    if priority_candidates:
        async for chunk in _process_batch(priority_candidates):
            yield chunk

    # Phase 2: LinkedIn and other sites (only if we still need more results)
    if found_count < limit and normal_candidates:
        async for chunk in _process_batch(normal_candidates):
            yield chunk

    # Phase 3: Merge Gemini grounded search results to fill remaining slots
    if found_count < limit and grounded_people:
        for person in grounded_people:
            if found_count >= limit:
                break
            name_key = person.name.lower().strip()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)
            found_count += 1
            found_people.append(person)
            yield f"data: {json.dumps({'type': 'person', 'data': person.model_dump(), 'found': found_count, 'completed': completed_count, 'total_candidates': total})}\n\n"

    # ── Search news for top 3 found people ────────────────────────────────────
    if found_people:
        yield f"data: {json.dumps({'type': 'status', 'phase': 'news', 'message': '正在搜索相关新闻...'})}\n\n"
        for person in found_people[:3]:
            try:
                news = await _search_news(person.name, person.company, limit=3)
                if news:
                    yield f"data: {json.dumps({'type': 'person_news', 'person_id': person.id, 'news': news})}\n\n"
            except Exception as e:
                logger.debug(f"News search failed for {person.name}: {e}")

    msg = (f"共找到 {found_count} 位符合条件的人员" if found_count > 0
           else "未找到匹配人员，建议细化搜索条件（加上行业、国家、公司名等）")
    yield f"data: {json.dumps({'type': 'status', 'phase': 'done', 'message': msg, 'found': found_count, 'total_candidates': total})}\n\n"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/people")
async def find_people(body: PeopleSearchRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    async def _gen():
        async for chunk in _run_people_pipeline(body.query.strip(), min(body.limit, 30), ctx, exclude_names=body.exclude_names):
            yield chunk
    return StreamingResponse(_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/find-similar")
async def find_similar_people(body: FindSimilarRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    p = body.person
    parts = [x for x in [p.title, p.location] if x]
    if p.company:
        parts.append(f"similar to {p.company}")
    derived_query = " ".join(parts) if parts else (p.title or "business professional")

    async def _gen():
        yield f"data: {json.dumps({'type': 'status', 'phase': 'searching', 'message': f'正在寻找与「{p.name}」类似的人...'})}\n\n"
        async for chunk in _run_people_pipeline(derived_query, min(body.limit, 12), ctx):
            yield chunk

    return StreamingResponse(_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/company-search")
async def company_search(body: CompanySearchRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    """Lightweight company search — returns a list of company summaries without scraping pages."""
    async def _gen():
        query = body.query.strip()
        limit = min(body.limit, 20)
        exclude_set = {n.lower().strip() for n in body.exclude_names}
        is_more = len(exclude_set) > 0

        action_prefix = "继续" if is_more else ""
        yield f"data: {json.dumps({'type': 'status', 'message': f'正在{action_prefix}搜索「{query}」相关公司...'})}\n\n"

        # Vary search queries for "search more"
        has_chinese = any('\u4e00' <= c <= '\u9fff' for c in query)
        if has_chinese:
            if is_more:
                queries = [
                    f'{query} 贸易公司 进出口',
                    f'{query} 供应商 制造商 生产商',
                    f'{query} 有限公司 集团',
                    f'{query} 同行 竞争对手',
                ]
            else:
                queries = [
                    f'{query} 公司 企业',
                    f'{query} 天眼查 企查查 工商信息',
                    f'{query} 行业 产品 业务',
                ]
        else:
            if is_more:
                queries = [
                    f'{query} supplier manufacturer',
                    f'{query} trading company competitors',
                    f'{query} exporter importer distributor',
                    f'{query} corporation ltd group',
                ]
            else:
                queries = [
                    f'{query} company overview',
                    f'{query} industry products about',
                    f'{query} headquarters founded',
                ]

        search_task = asyncio.create_task(_multi_search(queries, per_query=8))
        tick = 0
        while not search_task.done():
            await asyncio.sleep(0.8)
            tick += 1
            yield f"data: {json.dumps({'type': 'heartbeat', 'elapsed': tick})}\n\n"
        all_results = await search_task

        if not all_results:
            yield f"data: {json.dumps({'type': 'error', 'message': '未找到更多相关公司'})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'phase': 'done', 'message': '搜索完成'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'status', 'message': f'从 {len(all_results)} 条搜索结果中识别公司...'})}\n\n"

        # Build a text block from search result titles + descriptions (no page scraping)
        snippets = []
        for i, r in enumerate(all_results[:30]):
            snippets.append(f"[{i+1}] 标题: {r.get('title', '')} | 摘要: {r.get('description', '')} | URL: {r.get('url', '')}")
        snippets_text = "\n".join(snippets)

        exclude_instruction = ""
        if exclude_set:
            exclude_list = "、".join(body.exclude_names[:20])
            exclude_instruction = f"\n\n重要：以下公司已经找到，请不要重复列出：{exclude_list}\n"

        prompt = f"""用户搜索: "{query}"

以下是搜索引擎返回的结果（标题+摘要），请从中识别不同的公司实体。

{snippets_text}
{exclude_instruction}
任务：
1. 从搜索结果中识别出不同的公司（去重，同一家公司只列一次）
2. 对每家公司，提取基本信息
3. 按与用户搜索词的匹配度排序（最相关的排前面）
4. 最多返回 {limit} 家公司

仅输出JSON数组：
[{{
  "company_name": "公司全名",
  "industry": "行业或null",
  "location": "地区/国家或null",
  "snippet": "1-2句简介（从搜索摘要中提取）",
  "website": "官网URL或null",
  "source_url": "最佳信息来源URL",
  "source_title": "来源标题或null",
  "confidence": 0.0-1.0,
  "founded": "成立年份或null",
  "size": "规模或null"
}}]"""

        try:
            result = await asyncio.wait_for(
                generate_json_for_tenant(
                    db=ctx["db"],
                    tenant_id_or_slug=ctx.get("tenant_id"),
                    prompt=prompt,
                    system_instruction="商业情报分析师，从搜索结果中识别公司实体，严格JSON数组输出。",
                ),
                timeout=15.0,
            )
            if isinstance(result, dict):
                result = [result]
            if not isinstance(result, list):
                result = []

            found = 0
            for item in result:
                if not isinstance(item, dict) or not item.get("company_name"):
                    continue
                # Skip companies already found (for "search more")
                if item["company_name"].lower().strip() in exclude_set:
                    continue
                found += 1
                company = CompanySummary(
                    id=str(uuid.uuid4()),
                    company_name=item["company_name"],
                    industry=item.get("industry"),
                    location=item.get("location"),
                    snippet=item.get("snippet"),
                    website=item.get("website"),
                    source_url=item.get("source_url", ""),
                    source_title=item.get("source_title"),
                    confidence=float(item.get("confidence", 0.5)),
                    founded=item.get("founded"),
                    size=item.get("size"),
                )
                yield f"data: {json.dumps({'type': 'company', 'data': company.model_dump()})}\n\n"

            msg = f"找到 {found} 家相关公司" if found > 0 else "未识别到相关公司，请尝试更具体的关键词"
            yield f"data: {json.dumps({'type': 'status', 'phase': 'done', 'message': msg, 'found': found})}\n\n"

        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI分析超时，请重试'})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'phase': 'done', 'message': '搜索完成'})}\n\n"
        except Exception as e:
            logger.error(f"Company search LLM error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'AI分析失败: {str(e)}'})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'phase': 'done', 'message': '搜索完成'})}\n\n"

    return StreamingResponse(_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/company")
async def research_company_web(body: CompanyResearchRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    async def _gen():
        query = body.query.strip()
        limit_urls = min(body.limit_urls, 10)

        yield f"data: {json.dumps({'type': 'status', 'phase': 'searching', 'message': f'正在搜索「{query}」...'})}\n\n"

        has_chinese = any('\u4e00' <= c <= '\u9fff' for c in query)
        if has_chinese:
            queries = [
                f"{query} 官网 公司介绍 产品",
                f"{query} 联系方式 电话 邮箱 地址",
                f"{query} 新闻 动态 2025 2026",
                f"{query} 天眼查 企查查 工商信息",
            ]
        else:
            queries = [
                f"{query} official website about overview",
                f"{query} contact email phone address",
                f"{query} news 2025 2026",
                f"{query} team leadership CEO",
            ]

        search_task = asyncio.create_task(_multi_search(queries, per_query=6))
        tick = 0
        while not search_task.done():
            await asyncio.sleep(0.8)
            tick += 1
            yield f"data: {json.dumps({'type': 'heartbeat', 'phase': 'searching', 'elapsed': tick})}\n\n"
        all_results = await search_task
        all_results.sort(key=lambda r: _url_priority_score(r["url"]), reverse=True)

        yield f"data: {json.dumps({'type': 'status', 'phase': 'scraping', 'message': f'找到 {len(all_results)} 个来源，并发抓取中...'})}\n\n"

        if not all_results:
            yield f"data: {json.dumps({'type': 'error', 'message': '未找到相关信息，请尝试用英文搜索'})}\n\n"
            return

        # FIX 2: Scrape with reduced timeout (6s), fewer URLs (10 max)
        page_texts = await asyncio.gather(
            *[_scrape_page(r["url"]) for r in all_results[:limit_urls]],
            return_exceptions=True,
        )

        merged, sources = "", []
        for i, (result, text) in enumerate(zip(all_results[:limit_urls], page_texts)):
            if isinstance(text, str) and len(text) >= 150:
                merged += f"\n\n=== 来源{i+1}: {result['title']} ===\n{text[:1800]}"
                sources.append(result["url"])

        if not merged.strip():
            yield f"data: {json.dumps({'type': 'error', 'message': '抓取内容为空（网站可能需要 JavaScript 渲染）'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'status', 'phase': 'extracting', 'message': f'AI 综合分析 {len(sources)} 个来源...'})}\n\n"

        # Build source URL mapping for news injection
        source_urls = {r["title"]: r["url"] for r in all_results[:limit_urls]}

        prompt = f"""根据以下{len(sources)}个来源，为「{query}」生成企业风险调研报告（JSON，不要其他内容）。
重点关注：法律诉讼、财务风险、经营风险、合规问题、负面新闻、信用风险。

{merged[:9000]}

输出JSON：
{{"company_name":"公司全名","industry":"行业","overview":"3-5句概述","founded":"成立年份或null","headquarters":"总部","size":"规模或null","website":"官网或null","key_personnel":[{{"name":"姓名","title":"职位","email":"邮箱或null","phone":"电话或null","linkedin":"LinkedIn链接或null"}}],"products_services":["产品1","产品2"],"recent_news":[{{"title":"标题","date":"日期","summary":"摘要","url":"新闻链接或null"}}],"contact_info":{{"email":"或null","phone":"或null","address":"或null"}},"market_position":"市场地位","target_customers":"目标客户","strengths":["优势1","优势2"],"business_opportunities":["机会1","机会2"],"risk_score":7,"risk_notes":["详细描述每个风险点，包括法律诉讼、财务问题、合规风险、负面新闻等"]}}

risk_score 为1-10的整数，10=最高风险。风险评估要点：
- 涉诉记录（原告/被告）
- 财务健康（负债率、现金流、亏损）
- 经营合规（监管处罚、资质问题）
- 负面舆情（媒体报道、用户投诉）
- 管理层变动/丑闻"""

        try:
            report = await asyncio.wait_for(
                generate_json_for_tenant(
                    db=ctx["db"], tenant_id_or_slug=ctx.get("tenant_id"),
                    prompt=prompt,
                    system_instruction="资深商业风险分析师，重点评估企业风险、合规和信用。严格JSON输出，字段完整，内容专业。",
                ),
                timeout=25.0,  # Company report is one large call, give it more time
            )
            if report:
                report["sources"] = sources
                # Inject source URLs into recent_news if missing
                if report.get("recent_news"):
                    for news_item in report["recent_news"]:
                        if not news_item.get("url") and news_item.get("title"):
                            news_item["url"] = source_urls.get(news_item["title"])
                yield f"data: {json.dumps({'type': 'report', 'data': report})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'AI分析结果为空，请重试'})}\n\n"
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI分析超时，请重试'})}\n\n"
        except Exception as e:
            logger.error(f"Company research LLM error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'AI分析失败: {str(e)}'})}\n\n"

        # ── Phase 1.5: Enrich contact info if missing ─────────────────────
        if report:
            ci = report.get("contact_info") or {}
            has_contact = ci.get("email") or ci.get("phone") or ci.get("address")
            if not has_contact:
                yield f"data: {json.dumps({'type': 'status', 'phase': 'contact', 'message': '联系方式不完整，正在搜索更多来源...'})}\n\n"
                company_name_for_contact = report.get("company_name", query)
                website_url = report.get("website")

                # Strategy 1: scrape the company's own website contact/about pages
                contact_texts: list[str] = []
                if website_url:
                    parsed_site = urlparse(website_url)
                    base = f"{parsed_site.scheme}://{parsed_site.netloc}"
                    contact_urls = [
                        f"{base}/contact", f"{base}/contact-us", f"{base}/about",
                        f"{base}/about-us", f"{base}/联系我们", f"{base}/关于我们",
                    ]
                    scrape_tasks = [_scrape_page(u) for u in contact_urls[:4]]
                    scraped = await asyncio.gather(*scrape_tasks, return_exceptions=True)
                    for text in scraped:
                        if isinstance(text, str) and len(text) >= 80:
                            contact_texts.append(text[:2000])

                # Strategy 2: targeted search for contact details
                if has_chinese:
                    contact_queries = [f'"{company_name_for_contact}" 联系电话 邮箱 地址']
                else:
                    contact_queries = [f'"{company_name_for_contact}" contact email phone address']
                contact_results = await _multi_search(contact_queries, per_query=5)
                # Scrape top 3 results
                if contact_results:
                    extra_scrape = await asyncio.gather(
                        *[_scrape_page(r["url"]) for r in contact_results[:3]],
                        return_exceptions=True,
                    )
                    for text in extra_scrape:
                        if isinstance(text, str) and len(text) >= 80:
                            contact_texts.append(text[:2000])

                if contact_texts:
                    combined = "\n\n---\n\n".join(contact_texts)
                    contact_prompt = f"""从以下内容中提取「{company_name_for_contact}」的联系方式。

{combined[:6000]}

仅输出JSON：
{{"email":"公司邮箱或null","phone":"公司电话或null","address":"公司地址或null","website":"官网或null"}}

注意：只提取属于该公司的联系方式，不要提取第三方网站的联系方式。"""
                    try:
                        contact_data = await asyncio.wait_for(
                            generate_json_for_tenant(
                                db=ctx["db"], tenant_id_or_slug=ctx.get("tenant_id"),
                                prompt=contact_prompt,
                                system_instruction="信息提取专家，严格JSON输出。",
                            ),
                            timeout=10.0,
                        )
                        if isinstance(contact_data, list):
                            contact_data = contact_data[0] if contact_data else {}
                        if isinstance(contact_data, dict):
                            updated_ci = report.get("contact_info") or {}
                            if contact_data.get("email") and not updated_ci.get("email"):
                                updated_ci["email"] = contact_data["email"]
                            if contact_data.get("phone") and not updated_ci.get("phone"):
                                updated_ci["phone"] = contact_data["phone"]
                            if contact_data.get("address") and not updated_ci.get("address"):
                                updated_ci["address"] = contact_data["address"]
                            if contact_data.get("website") and not report.get("website"):
                                report["website"] = contact_data["website"]
                            report["contact_info"] = updated_ci
                            # Send updated report
                            yield f"data: {json.dumps({'type': 'report', 'data': report})}\n\n"
                    except Exception as e:
                        logger.debug(f"Contact enrichment LLM failed: {e}")

        # ── Phase 2: Find company personnel ─────────────────────────────────
        company_name = report.get("company_name", query) if report else query
        yield f"data: {json.dumps({'type': 'status', 'phase': 'people', 'message': f'正在搜索「{company_name}」的关键人员...'})}\n\n"

        # Build company name variants for matching (e.g. "诺钢" matches "诺钢（天津）进出口贸易有限公司")
        cn_parts = re.split(r'[（()）\s]+', company_name)
        company_keywords = {company_name.lower()}
        for part in cn_parts:
            p = part.strip()
            if len(p) >= 2:
                company_keywords.add(p.lower())
        # Also add the original query as keyword (user may have typed short name)
        for qp in re.split(r'[\s,，]+', query):
            if len(qp) >= 2:
                company_keywords.add(qp.lower())

        def _person_matches_company(person: PersonResult) -> bool:
            """Check if extracted person belongs to the target company."""
            person_company = (person.company or "").lower()
            if not person_company:
                return False
            # Exact or substring match
            for kw in company_keywords:
                if kw in person_company or person_company in kw:
                    return True
            return False

        has_chinese = any('\u4e00' <= c <= '\u9fff' for c in company_name)
        if has_chinese:
            people_queries = [
                f'"{company_name}" 法人 总经理 联系方式',
                f'"{company_name}" 高管 股东 负责人',
                f'{company_name} 天眼查 企查查 工商信息',
                f'site:linkedin.com/in "{company_name}"',
            ]
        else:
            people_queries = [
                f'site:linkedin.com/in "{company_name}"',
                f'"{company_name}" CEO OR CTO OR CFO OR VP OR director',
                f'"{company_name}" team leadership management',
            ]
        # Run web search + grounded search + QCC API in parallel for company people
        people_search_task = asyncio.create_task(_multi_search(people_queries, per_query=8))
        company_qcc_task = asyncio.create_task(qcc_search_people(company_name)) if (has_chinese and qcc_is_configured()) else None
        company_grounded_task = asyncio.create_task(_gemini_grounded_search(
            f'"{company_name}" 的法人代表 总经理 高管 核心团队' if has_chinese
            else f'"{company_name}" CEO CTO founder executives leadership',
            6, ctx,
        ))
        people_results = await people_search_task
        people_results.sort(key=lambda r: _url_priority_score(r["url"]), reverse=True)
        candidates = people_results[:12]

        found_count = 0
        seen_names: set[str] = set()

        # QCC API results first (highest confidence)
        if company_qcc_task:
            try:
                qcc_raw = await asyncio.wait_for(asyncio.shield(company_qcc_task), timeout=5.0)
                for item in (qcc_raw or []):
                    if found_count >= 6:
                        break
                    name_key = item.get("name", "").lower().strip()
                    if name_key in seen_names:
                        continue
                    seen_names.add(name_key)
                    person = PersonResult(id=str(uuid.uuid4()), **{k: v for k, v in item.items() if k != "id"})
                    found_count += 1
                    yield f"data: {json.dumps({'type': 'company_person', 'data': person.model_dump()})}\n\n"
            except (asyncio.TimeoutError, Exception) as e:
                logger.debug(f"QCC company people failed: {e}")

        if candidates and found_count < 6:
            tasks = [_scrape_and_extract(r, f"{company_name} 的员工/高管/法人", ctx) for r in candidates]
            for coro in asyncio.as_completed(tasks):
                try:
                    result = await coro
                    persons = result if isinstance(result, list) else ([result] if result else [])
                    for person in persons:
                        if not person or found_count >= 6:
                            continue
                        if not _person_matches_company(person):
                            logger.debug(f"Filtered out {person.name} (company={person.company}) — not matching {company_name}")
                            continue
                        name_key = person.name.lower().strip()
                        if name_key in seen_names:
                            continue
                        seen_names.add(name_key)
                        found_count += 1
                        yield f"data: {json.dumps({'type': 'company_person', 'data': person.model_dump()})}\n\n"
                except Exception:
                    pass

        # Merge grounded search results
        try:
            company_grounded_people = await asyncio.wait_for(asyncio.shield(company_grounded_task), timeout=5.0)
        except (asyncio.TimeoutError, Exception):
            company_grounded_people = []

        if found_count < 6 and company_grounded_people:
            for person in company_grounded_people:
                if found_count >= 6:
                    break
                if not _person_matches_company(person) and person.company:
                    continue
                name_key = person.name.lower().strip()
                if name_key in seen_names:
                    continue
                seen_names.add(name_key)
                found_count += 1
                yield f"data: {json.dumps({'type': 'company_person', 'data': person.model_dump()})}\n\n"

        if found_count == 0:
            # Final fallback: Gemini direct (no Google Search grounding)
            gemini_people = await _gemini_direct_search(
                f'"{company_name}" 的高管、法人代表、总经理、核心团队成员',
                5, ctx,
            )
            for person in gemini_people:
                if _person_matches_company(person) or not person.company:
                    yield f"data: {json.dumps({'type': 'company_person', 'data': person.model_dump()})}\n\n"
                    found_count += 1

        people_msg = f"报告完成，共参考 {len(sources)} 个来源" + (f"，找到 {found_count} 位关键人员" if found_count > 0 else "")
        yield f"data: {json.dumps({'type': 'status', 'phase': 'done', 'message': people_msg})}\n\n"

    return StreamingResponse(_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/analyze-url")
async def analyze_url_endpoint(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    url = body.get("url", "")
    query = body.get("query", "")
    if _is_blocked(url):
        return {"success": False, "reason": "blocked_domain", "person": None}
    text = await _scrape_page(url)
    person = await _extract_person(text, url, url, "", query, ctx)
    return {"success": True, "person": person.model_dump() if person else None}


# ── Search History ─────────────────────────────────────────────────────────────
# Table is created lazily (CREATE TABLE IF NOT EXISTS) in the tenant schema.

_HISTORY_INITIALIZED: set[str] = set()

_CREATE_HISTORY_TABLE = """
CREATE TABLE IF NOT EXISTS ai_search_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    query           TEXT NOT NULL,
    result_count    INT  DEFAULT 0,
    results_json    JSONB DEFAULT '[]',
    share_token     VARCHAR(32) UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ash_user_time
    ON ai_search_history(user_id, created_at DESC);
"""


async def _ensure_history_table(db: AsyncSession, tenant_slug: str) -> None:
    key = tenant_slug or "public"
    if key not in _HISTORY_INITIALIZED:
        from sqlalchemy import text as sa_text
        # asyncpg requires separate execute calls for each statement
        await db.execute(sa_text("""
            CREATE TABLE IF NOT EXISTS ai_search_history (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id       UUID NOT NULL,
                user_id         UUID NOT NULL,
                query           TEXT NOT NULL,
                result_count    INT  DEFAULT 0,
                results_json    JSONB DEFAULT '[]',
                share_token     VARCHAR(32) UNIQUE,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        await db.execute(sa_text(
            "CREATE INDEX IF NOT EXISTS idx_ash_user_time ON ai_search_history(user_id, created_at DESC)"
        ))
        await db.commit()
        _HISTORY_INITIALIZED.add(key)


class SaveHistoryRequest(BaseModel):
    query: str
    results: list[dict]


@router.post("/history")
async def save_history(body: SaveHistoryRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    """Auto-save a completed search."""
    from sqlalchemy import text as sa_text
    db = ctx["db"]
    await _ensure_history_table(db, ctx.get("tenant_slug", ""))

    row = await db.execute(
        sa_text("""
            INSERT INTO ai_search_history (id, tenant_id, user_id, query, result_count, results_json)
            VALUES (:id, CAST(:tid AS uuid), CAST(:uid AS uuid), :query, :count, CAST(:results AS jsonb))
            RETURNING id, created_at
        """),
        {
            "id": str(uuid.uuid4()),
            "tid": ctx["tenant_id"],
            "uid": ctx["sub"],
            "query": body.query.strip(),
            "count": len(body.results),
            "results": json.dumps(body.results),
        },
    )
    r = row.fetchone()
    await db.commit()
    return {"id": str(r.id), "created_at": r.created_at.isoformat()}


@router.get("/history")
async def list_history(ctx: dict = Depends(get_current_user_with_tenant)):
    """List the current user's saved searches (last 50)."""
    from sqlalchemy import text as sa_text
    db = ctx["db"]
    await _ensure_history_table(db, ctx.get("tenant_slug", ""))

    result = await db.execute(
        sa_text("""
            SELECT id, query, result_count, share_token, created_at
            FROM ai_search_history
            WHERE user_id = CAST(:uid AS uuid)
            ORDER BY created_at DESC
            LIMIT 50
        """),
        {"uid": ctx["sub"]},
    )
    rows = []
    for r in result.fetchall():
        d = dict(r._mapping)
        d["id"] = str(d["id"])
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        rows.append(d)
    return {"history": rows}


@router.get("/history/{history_id}/results")
async def get_history_results(history_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get full results for a saved search (owner only)."""
    from sqlalchemy import text as sa_text
    db = ctx["db"]
    await _ensure_history_table(db, ctx.get("tenant_slug", ""))

    result = await db.execute(
        sa_text("""
            SELECT id, query, result_count, results_json, share_token, created_at
            FROM ai_search_history
            WHERE id = CAST(:id AS uuid) AND user_id = CAST(:uid AS uuid)
        """),
        {"id": history_id, "uid": ctx["sub"]},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    d = dict(row._mapping)
    d["id"] = str(d["id"])
    d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
    return d


@router.delete("/history/{history_id}")
async def delete_history(history_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Delete a saved search (owner only)."""
    from sqlalchemy import text as sa_text
    db = ctx["db"]
    await _ensure_history_table(db, ctx.get("tenant_slug", ""))

    await db.execute(
        sa_text("DELETE FROM ai_search_history WHERE id = CAST(:id AS uuid) AND user_id = CAST(:uid AS uuid)"),
        {"id": history_id, "uid": ctx["sub"]},
    )
    await db.commit()
    return {"success": True}


@router.post("/history/{history_id}/share")
async def share_history(history_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Generate (or return existing) share token for a saved search."""
    from sqlalchemy import text as sa_text
    db = ctx["db"]
    await _ensure_history_table(db, ctx.get("tenant_slug", ""))

    result = await db.execute(
        sa_text("SELECT share_token FROM ai_search_history WHERE id = CAST(:id AS uuid) AND user_id = CAST(:uid AS uuid)"),
        {"id": history_id, "uid": ctx["sub"]},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    token = row.share_token
    if not token:
        token = secrets.token_urlsafe(16)
        await db.execute(
            sa_text("UPDATE ai_search_history SET share_token = :token WHERE id = CAST(:id AS uuid)"),
            {"token": token, "id": history_id},
        )
        await db.commit()

    return {"share_token": token, "tenant_slug": ctx.get("tenant_slug")}


@router.get("/shared/{tenant_slug}/{token}")
async def get_shared_search(tenant_slug: str, token: str, db: AsyncSession = Depends(get_db)):
    """
    Public endpoint — no auth required.
    Uses tenant_slug to set search_path and find the shared search by token.
    """
    from sqlalchemy import text as sa_text
    await safe_set_search_path(db, tenant_slug)

    result = await db.execute(
        sa_text("SELECT query, result_count, results_json, created_at FROM ai_search_history WHERE share_token = :token"),
        {"token": token},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Shared search not found or link has expired")

    d = dict(row._mapping)
    d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
    return d
