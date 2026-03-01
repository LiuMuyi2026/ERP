import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def run_manual_migration():
    database_url = "postgresql+asyncpg://nexus:nexus_secret@localhost:5432/nexus_platform"
    engine = create_async_engine(database_url)
    
    statements = [
        "CREATE TABLE IF NOT EXISTS user_ai_profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL UNIQUE, style_preference VARCHAR(100) DEFAULT 'professional', custom_instructions TEXT, common_tasks JSONB DEFAULT '[]', learned_context JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        "CREATE TABLE IF NOT EXISTS integration_oauth_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, platform VARCHAR(50) NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ, UNIQUE (user_id, platform))"
    ]
    
    async with engine.begin() as conn:
        print("Applying AI tables to tenant_demo...")
        await conn.execute(text("SET search_path TO tenant_demo, public"))
        for stmt in statements:
            await conn.execute(text(stmt))
        print("Migration complete.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_manual_migration())
