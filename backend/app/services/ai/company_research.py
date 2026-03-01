import google.generativeai as genai
from app.config import settings
import logging
import json

logger = logging.getLogger(__name__)
genai.configure(api_key=settings.gemini_api_key)


async def research_company(company_name: str, website: str | None = None) -> dict:
    """Research a company using Gemini with Google Search grounding."""
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            tools=[genai.Tool(google_search_retrieval=genai.GoogleSearchRetrieval())],
        )
        query = f"Research the company '{company_name}'"
        if website:
            query += f" (website: {website})"
        query += """. Return JSON:
{
  "summary": "2-3 sentence summary",
  "industry": "industry/sector",
  "size": "company size estimate",
  "products": ["product1", "product2"],
  "news": [{"title": "...", "date": "...", "summary": "..."}]
}"""
        response = model.generate_content(query)
        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return json.loads(text)
    except Exception as e:
        logger.error(f"Company research failed: {e}")
        return {"summary": f"Research unavailable for {company_name}", "industry": "Unknown",
                "size": "Unknown", "products": [], "news": []}
