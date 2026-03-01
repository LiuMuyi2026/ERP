from jinja2 import Template
from typing import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession
import logging

logger = logging.getLogger(__name__)


async def execute_ai_tool(
    prompt_template: str,
    context: str = "",
    selection: str = "",
    output_mode: str = "sidebar",
    db: AsyncSession | None = None,
    tenant_id: str | None = None,
) -> AsyncIterator[str]:
    """Execute an AI Plus tool with Jinja2 template rendering."""
    try:
        template = Template(prompt_template)
        rendered_prompt = template.render(context=context, selection=selection)

        from app.services.ai.provider import stream_text_for_tenant
        async for chunk in stream_text_for_tenant(db, tenant_id, rendered_prompt):
            yield chunk
    except Exception as e:
        logger.error(f"AI tool execution failed: {e}")
        yield f"Error: {str(e)}"
