import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  await db.schema
    .createTable('sources')
    .ifNotExists()
    .addColumn('id', 'uuid', (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('source_key', 'text', (column) => column.notNull().unique())
    .addColumn('display_name', 'text', (column) => column.notNull())
    .addColumn('source_type', 'text', (column) => column.notNull())
    .addColumn('base_uri', 'text')
    .addColumn('trust_priority', 'smallint', (column) =>
      column.notNull().defaultTo(50))
    .addColumn('enabled', 'boolean', (column) =>
      column.notNull().defaultTo(true))
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    ALTER TABLE sources
    DROP CONSTRAINT IF EXISTS sources_trust_priority_check
  `.execute(db);
  await sql`
    ALTER TABLE sources
    ADD CONSTRAINT sources_trust_priority_check
    CHECK (trust_priority BETWEEN 0 AND 100)
  `.execute(db);

  await db.schema
    .createTable('entities')
    .ifNotExists()
    .addColumn('id', 'uuid', (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('kind', 'text', (column) => column.notNull())
    .addColumn('canonical_key', 'text', (column) => column.notNull())
    .addColumn('slug', 'text', (column) => column.notNull())
    .addColumn('display_name', 'text', (column) => column.notNull())
    .addColumn('summary', 'text')
    .addColumn('visibility', 'text', (column) =>
      column.notNull().defaultTo('public'))
    .addColumn('confidence', 'smallint', (column) =>
      column.notNull().defaultTo(50))
    .addColumn('metadata', 'jsonb', (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('entities_kind_canonical_key_unique', [
      'kind',
      'canonical_key'
    ])
    .addUniqueConstraint('entities_kind_slug_unique', ['kind', 'slug'])
    .execute();

  await db.schema
    .createTable('blobs')
    .ifNotExists()
    .addColumn('sha256', 'char(64)', (column) => column.primaryKey())
    .addColumn('storage_key', 'text', (column) => column.notNull().unique())
    .addColumn('byte_size', 'bigint', (column) => column.notNull())
    .addColumn('media_type', 'text', (column) => column.notNull())
    .addColumn('verified_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('assets')
    .ifNotExists()
    .addColumn('id', 'uuid', (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('blob_sha256', 'char(64)', (column) =>
      column.notNull().references('blobs.sha256'))
    .addColumn('asset_kind', 'text', (column) => column.notNull())
    .addColumn('visibility', 'text', (column) =>
      column.notNull().defaultTo('restricted'))
    .addColumn('original_filename', 'text')
    .addColumn('rights_statement', 'text')
    .addColumn('metadata', 'jsonb', (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('jobs')
    .ifNotExists()
    .addColumn('id', 'uuid', (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('job_type', 'text', (column) => column.notNull())
    .addColumn('status', 'text', (column) =>
      column.notNull().defaultTo('queued'))
    .addColumn('payload', 'jsonb', (column) => column.notNull())
    .addColumn('result', 'jsonb')
    .addColumn('priority', 'integer', (column) =>
      column.notNull().defaultTo(100))
    .addColumn('attempts', 'integer', (column) =>
      column.notNull().defaultTo(0))
    .addColumn('max_attempts', 'integer', (column) =>
      column.notNull().defaultTo(8))
    .addColumn('run_after', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .addColumn('locked_at', 'timestamptz')
    .addColumn('locked_by', 'text')
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .addColumn('finished_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('jobs_claim_idx')
    .ifNotExists()
    .on('jobs')
    .columns(['status', 'run_after', 'priority', 'created_at'])
    .where('status', '=', 'queued')
    .execute();

  await db.schema
    .createTable('operator_tokens')
    .ifNotExists()
    .addColumn('id', 'uuid', (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('label', 'text', (column) => column.notNull())
    .addColumn('token_prefix', 'text', (column) =>
      column.notNull().unique())
    .addColumn('token_digest', 'char(64)', (column) => column.notNull())
    .addColumn('scopes', sql`text[]`, (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz')
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .execute();

  await db.schema
    .createTable('audit_events')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('occurred_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`))
    .addColumn('request_id', 'uuid', (column) => column.notNull())
    .addColumn('actor_token_id', 'uuid', (column) =>
      column.references('operator_tokens.id'))
    .addColumn('action', 'text', (column) => column.notNull())
    .addColumn('target_type', 'text')
    .addColumn('target_id', 'text')
    .addColumn('input_summary', 'jsonb', (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('result', 'text', (column) => column.notNull())
    .addColumn('remote_address', sql`inet`)
    .execute();

  await db.schema
    .createIndex('audit_events_time_idx')
    .ifNotExists()
    .on('audit_events')
    .column('occurred_at')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('audit_events').ifExists().execute();
  await db.schema.dropTable('operator_tokens').ifExists().execute();
  await db.schema.dropTable('jobs').ifExists().execute();
  await db.schema.dropTable('assets').ifExists().execute();
  await db.schema.dropTable('blobs').ifExists().execute();
  await db.schema.dropTable('entities').ifExists().execute();
  await db.schema.dropTable('sources').ifExists().execute();
}
