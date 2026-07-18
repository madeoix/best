import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE enrichment_jobs DROP CONSTRAINT IF EXISTS enrichment_jobs_active_dedupe`.execute(db);
  await sql`CREATE UNIQUE INDEX enrichment_jobs_active_dedupe
    ON enrichment_jobs (kind, canonical_key)
    WHERE status IN ('queued', 'leased')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS enrichment_jobs_active_dedupe`.execute(db);
  await sql`ALTER TABLE enrichment_jobs ADD CONSTRAINT enrichment_jobs_active_dedupe
    UNIQUE (kind, canonical_key, status)`.execute(db);
}
