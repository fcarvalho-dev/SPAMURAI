import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import get_settings

settings = get_settings()


async def migrate():
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        migrations = [
            # Cria os tipos enum antes de usá-los (idempotente)
            "DO $$ BEGIN CREATE TYPE plantype AS ENUM ('free', 'pro', 'business'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            "DO $$ BEGIN CREATE TYPE billingcycle AS ENUM ('monthly', 'weekly'); EXCEPTION WHEN duplicate_object THEN null; END $$",
            # Adiciona colunas (IF NOT EXISTS = idempotente)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan plantype NOT NULL DEFAULT 'free'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle billingcycle",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS deletions_this_month INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS deletions_month_reset TIMESTAMP",
        ]
        for sql in migrations:
            await conn.execute(text(sql))
            print(f"OK: {sql[:80]}")
    await engine.dispose()
    print("\nMigration concluida!")


asyncio.run(migrate())
