from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import settings
import logging

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=30,
    max_overflow=10,
    pool_pre_ping=True,         # detect dead connections before use
    pool_recycle=600,            # recycle connections after 10 minutes
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\""))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform.platform_admins (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                full_name VARCHAR(255),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform.tenants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                logo_url VARCHAR(500),
                primary_color VARCHAR(7) DEFAULT '#6366f1',
                currency VARCHAR(3) DEFAULT 'USD',
                locale VARCHAR(10) DEFAULT 'en-US',
                is_active BOOLEAN DEFAULT TRUE,
                schema_provisioned BOOLEAN DEFAULT FALSE,
                crm_enabled BOOLEAN DEFAULT TRUE,
                hr_enabled BOOLEAN DEFAULT TRUE,
                accounting_enabled BOOLEAN DEFAULT TRUE,
                inventory_enabled BOOLEAN DEFAULT TRUE,
                email_enabled BOOLEAN DEFAULT FALSE,
                smtp_host VARCHAR(255),
                smtp_port INTEGER DEFAULT 587,
                smtp_username VARCHAR(255),
                smtp_password TEXT,
                smtp_from_email VARCHAR(255),
                smtp_from_name VARCHAR(255) DEFAULT 'Nexus ERP',
                smtp_use_tls BOOLEAN DEFAULT TRUE,
                smtp_use_ssl BOOLEAN DEFAULT FALSE,
                smtp_timeout_seconds INTEGER DEFAULT 20,
                ai_provider VARCHAR(30) DEFAULT 'gemini',
                ai_model VARCHAR(120) DEFAULT 'gemini-2.0-flash',
                ai_api_key TEXT, -- Per-tenant encrypted API key (optional)
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform.workflow_templates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                description TEXT,
                definition JSONB NOT NULL DEFAULT '{}',
                version INTEGER NOT NULL DEFAULT 1,
                scope VARCHAR(20) NOT NULL DEFAULT 'tenant',
                tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT FALSE,
                created_by UUID,
                updated_by UUID,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform.ai_usage_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                user_id UUID NOT NULL,
                feature_name VARCHAR(100), -- 'workspace_gen', 'crm_analyze', etc.
                model_name VARCHAR(100),
                prompt_tokens INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON platform.ai_usage_logs(tenant_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON platform.ai_usage_logs(user_id)"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(30) DEFAULT 'gemini'"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS ai_model VARCHAR(120) DEFAULT 'gemini-2.0-flash'"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS ai_api_key TEXT"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255)"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_username VARCHAR(255)"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_password TEXT"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_from_email VARCHAR(255)"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_from_name VARCHAR(255) DEFAULT 'Nexus ERP'"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_use_tls BOOLEAN DEFAULT TRUE"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_use_ssl BOOLEAN DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS smtp_timeout_seconds INTEGER DEFAULT 20"))

        # ── Per-tenant AI provider configs (encrypted keys) ─────────────
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform.tenant_ai_configs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
                provider VARCHAR(30) NOT NULL,
                api_key_encrypted TEXT NOT NULL DEFAULT '',
                base_url VARCHAR(500),
                default_model VARCHAR(120),
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(tenant_id, provider)
            )
        """))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tai_tenant ON platform.tenant_ai_configs(tenant_id)"
        ))

        # Migrate legacy ai_api_key from platform.tenants → tenant_ai_configs (idempotent)
        try:
            await conn.execute(text("""
                INSERT INTO platform.tenant_ai_configs (tenant_id, provider, api_key_encrypted, default_model, is_default, is_active)
                SELECT id, COALESCE(ai_provider, 'gemini'), COALESCE(ai_api_key, ''), COALESCE(ai_model, 'gemini-2.0-flash'), TRUE, TRUE
                FROM platform.tenants
                WHERE ai_api_key IS NOT NULL AND ai_api_key != ''
                ON CONFLICT (tenant_id, provider) DO NOTHING
            """))
        except Exception as e:
            logger.warning("Legacy ai_api_key migration skipped: %s", e)

    logger.info("Database initialized")
    # Run tenant schema migrations for all existing tenants
    try:
        from app.services.tenant import migrate_tenant_schema
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT slug FROM platform.tenants WHERE schema_provisioned = TRUE"))
            slugs = [row[0] for row in result.fetchall()]
        for slug in slugs:
            async with AsyncSessionLocal() as session:
                await migrate_tenant_schema(slug, session)
                logger.info(f"Migrated tenant schema: {slug}")
    except Exception as e:
        logger.warning(f"Tenant migration warning: {e}")
