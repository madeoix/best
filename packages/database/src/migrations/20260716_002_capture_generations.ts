import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('capture_generations')
    .addColumn('id', 'uuid', (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('generation_key', 'text', (column) =>
      column.notNull().unique())
    .addColumn('crawler_id', 'text', (column) => column.notNull())
    .addColumn('outcome', 'text', (column) => column.notNull())
    .addColumn('started_at', 'timestamptz', (column) => column.notNull())
    .addColumn('completed_at', 'timestamptz', (column) => column.notNull())
    .addColumn('popular_request_method', 'text')
    .addColumn('popular_request_sha256', 'char(64)')
    .addColumn('popular_response_sha256', 'char(64)')
    .addColumn('evidence_manifest_sha256', 'char(64)', (column) =>
      column.notNull())
    .addColumn('counts', 'jsonb', (column) => column.notNull())
    .addColumn('failure_code', 'text')
    .addColumn('failure_message', 'text')
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    ALTER TABLE capture_generations
    ADD CONSTRAINT capture_generations_outcome_check
    CHECK (outcome IN ('succeeded', 'partial', 'failed')),
    ADD CONSTRAINT capture_generations_time_check
    CHECK (completed_at >= started_at),
    ADD CONSTRAINT capture_generations_popular_receipt_check
    CHECK (
      (popular_request_method IS NULL AND
       popular_request_sha256 IS NULL AND
       popular_response_sha256 IS NULL)
      OR
      (popular_request_method IN (
         'space.viewPopSpaces',
         'catalog_entry.getSpacesForCategory',
         'GET /api/space/popular'
       ) AND
       popular_request_sha256 IS NOT NULL AND
       popular_response_sha256 IS NOT NULL)
    ),
    ADD CONSTRAINT capture_generations_failure_check
    CHECK (
      (outcome = 'succeeded' AND failure_code IS NULL AND failure_message IS NULL)
      OR
      (outcome <> 'succeeded' AND failure_code IS NOT NULL)
    )
  `.execute(db);

  await db.schema
    .createIndex('capture_generations_crawler_completed_idx')
    .on('capture_generations')
    .columns(['crawler_id', 'completed_at'])
    .execute();

  await sql`
    CREATE FUNCTION reject_capture_generation_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'capture generations are append-only';
    END;
    $$
  `.execute(db);

  await sql`
    CREATE TRIGGER capture_generations_append_only
    BEFORE UPDATE OR DELETE ON capture_generations
    FOR EACH ROW EXECUTE FUNCTION reject_capture_generation_mutation()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS capture_generations_append_only
    ON capture_generations
  `.execute(db);
  await db.schema.dropTable('capture_generations').ifExists().execute();
  await sql`DROP FUNCTION IF EXISTS reject_capture_generation_mutation()`
    .execute(db);
}
