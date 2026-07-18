import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('enrichment_jobs')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('kind', 'text', (column) => column.notNull().check(sql`kind in ('avatar-identity','avatar-config','avatar-render','uid-variant-render','space-identity')`))
    .addColumn('canonical_key', 'text', (column) => column.notNull())
    .addColumn('source_generation_id', 'uuid', (column) => column.references('capture_generations.id'))
    .addColumn('priority', 'integer', (column) => column.notNull().defaultTo(100))
    .addColumn('reason', 'text', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('queued').check(sql`status in ('queued','leased','completed','failed')`))
    .addColumn('attempts', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('enrichment_jobs_active_dedupe', ['kind', 'canonical_key', 'status'])
    .execute();

  await db.schema.createTable('renderer_parity_results')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('entity_kind', 'text', (column) => column.notNull().check(sql`entity_kind in ('avatar','uid-variant')`))
    .addColumn('canonical_key', 'text', (column) => column.notNull())
    .addColumn('source_config_sha256', 'varchar(64)', (column) => column.notNull())
    .addColumn('rendered_asset_id', 'uuid', (column) => column.references('assets.id'))
    .addColumn('captured_reference_asset_id', 'uuid', (column) => column.references('assets.id'))
    .addColumn('pixel_difference_ratio', 'double precision')
    .addColumn('status', 'text', (column) => column.notNull().check(sql`status in ('pending','matched','mismatch','insufficient-evidence')`))
    .addColumn('verified_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('renderer_parity_identity', ['entity_kind', 'canonical_key', 'source_config_sha256'])
    .execute();

  await db.schema.createTable('uid_variant_renders')
    .addColumn('uid', 'text', (column) => column.primaryKey())
    .addColumn('item_definition_source_xml', 'text', (column) => column.notNull().references('item_definitions.source_xml'))
    .addColumn('config_sha256', 'varchar(64)', (column) => column.notNull())
    .addColumn('decoded_label', 'text')
    .addColumn('rendered_asset_id', 'uuid', (column) => column.references('assets.id'))
    .addColumn('status', 'text', (column) => column.notNull().check(sql`status in ('queued','rendered','failed')`))
    .addColumn('observed_at', 'timestamptz', (column) => column.notNull())
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('enrichment_queue_order').on('enrichment_jobs').columns(['status', 'priority', 'created_at']).execute();
  await db.schema.createIndex('variant_by_definition').on('uid_variant_renders').column('item_definition_source_xml').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('uid_variant_renders').ifExists().execute();
  await db.schema.dropTable('renderer_parity_results').ifExists().execute();
  await db.schema.dropTable('enrichment_jobs').ifExists().execute();
}
