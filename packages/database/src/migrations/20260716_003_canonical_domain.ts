import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('owner_accounts')
    .addColumn('owner_id', 'text', (c) => c.primaryKey())
    .addColumn('display_name', 'text')
    .addColumn('selected_avatar_id', 'text')
    .addColumn('primary_avatar_id', 'text')
    .addColumn('primary_basis', 'text')
    .addColumn('primary_confidence', 'smallint')
    .addColumn('primary_selected_at', 'timestamptz')
    .addColumn('first_observed_at', 'timestamptz', (c) => c.notNull())
    .addColumn('last_observed_at', 'timestamptz', (c) => c.notNull())
    .execute();

  await db.schema.createTable('avatars')
    .addColumn('avatar_id', 'text', (c) => c.primaryKey())
    .addColumn('owner_id', 'text')
    .addColumn('name', 'text')
    .addColumn('name_status', 'text', (c) => c.notNull())
    .addColumn('thumbnail_asset_id', 'uuid', (c) => c.references('assets.id'))
    .addColumn('first_observed_at', 'timestamptz', (c) => c.notNull())
    .addColumn('last_observed_at', 'timestamptz', (c) => c.notNull())
    .execute();

  await db.schema.createTable('owner_avatar_relationships')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('owner_id', 'text', (c) => c.notNull().references('owner_accounts.owner_id'))
    .addColumn('avatar_id', 'text', (c) => c.notNull().references('avatars.avatar_id'))
    .addColumn('evidence_kind', 'text', (c) => c.notNull())
    .addColumn('observed_at', 'timestamptz', (c) => c.notNull())
    .addColumn('source_key', 'text', (c) => c.notNull())
    .addColumn('capture_id', 'text')
    .addColumn('crawler_id', 'text')
    .addColumn('evidence_sha256', 'char(64)')
    .addUniqueConstraint('owner_avatar_relationship_evidence_unique', [
      'owner_id', 'avatar_id', 'evidence_kind', 'observed_at', 'source_key'
    ])
    .execute();

  await db.schema.createTable('spaces')
    .addColumn('space_id', 'text', (c) => c.primaryKey())
    .addColumn('owner_id', 'text')
    .addColumn('display_name', 'text')
    .addColumn('snapshot_asset_id', 'uuid', (c) => c.references('assets.id'))
    .addColumn('first_observed_at', 'timestamptz', (c) => c.notNull())
    .addColumn('last_observed_at', 'timestamptz', (c) => c.notNull())
    .execute();

  await db.schema.createTable('item_definitions')
    .addColumn('source_xml', 'text', (c) => c.primaryKey())
    .addColumn('display_name', 'text', (c) => c.notNull())
    .addColumn('category', 'text')
    .addColumn('xml_rarity', 'text', (c) => c.notNull())
    .addColumn('icon_asset_id', 'uuid', (c) => c.references('assets.id'))
    .addColumn('definition_sha256', 'char(64)', (c) => c.notNull())
    .execute();

  await db.schema.createTable('item_instances')
    .addColumn('uid', 'text', (c) => c.primaryKey())
    .addColumn('item_definition_source_xml', 'text', (c) =>
      c.notNull().references('item_definitions.source_xml'))
    .addColumn('first_observed_at', 'timestamptz', (c) => c.notNull())
    .addColumn('last_observed_at', 'timestamptz', (c) => c.notNull())
    .execute();

  await db.schema.createTable('avatar_config_snapshots')
    .addColumn('snapshot_id', 'text', (c) => c.primaryKey())
    .addColumn('avatar_id', 'text', (c) => c.notNull().references('avatars.avatar_id'))
    .addColumn('capture_generation_key', 'text', (c) =>
      c.references('capture_generations.generation_key'))
    .addColumn('captured_at', 'timestamptz', (c) => c.notNull())
    .addColumn('config_sha256', 'char(64)', (c) => c.notNull().unique())
    .addColumn('source_capture_id', 'text')
    .addColumn('raw_config', 'jsonb', (c) => c.notNull())
    .addColumn('equipped_items', 'jsonb', (c) => c.notNull())
    .execute();

  await db.schema.createTable('temporal_observations')
    .addColumn('observation_id', 'text', (c) => c.primaryKey())
    .addColumn('relationship', 'text', (c) => c.notNull())
    .addColumn('avatar_id', 'text')
    .addColumn('space_id', 'text')
    .addColumn('seller_owner_id', 'text')
    .addColumn('item_definition_source_xml', 'text', (c) =>
      c.notNull().references('item_definitions.source_xml'))
    .addColumn('item_instance_uid', 'text')
    .addColumn('avatar_config_snapshot_id', 'text')
    .addColumn('slot', 'text')
    .addColumn('listing_id', 'text')
    .addColumn('price', 'jsonb')
    .addColumn('observed_at', 'timestamptz', (c) => c.notNull())
    .addColumn('valid_from', 'timestamptz', (c) => c.notNull())
    .addColumn('valid_to', 'timestamptz')
    .addColumn('confidence', 'smallint', (c) => c.notNull())
    .addColumn('source_key', 'text', (c) => c.notNull())
    .addColumn('capture_id', 'text')
    .addColumn('crawler_id', 'text')
    .addColumn('evidence_sha256', 'char(64)')
    .execute();

  await db.schema.createTable('publication_decisions')
    .addColumn('entity_kind', 'text', (c) => c.notNull())
    .addColumn('canonical_key', 'text', (c) => c.notNull())
    .addColumn('eligible', 'boolean', (c) => c.notNull())
    .addColumn('reasons', sql`text[]`, (c) => c.notNull())
    .addColumn('evaluated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('publication_decisions_pk', ['entity_kind', 'canonical_key'])
    .execute();

  await sql`
    ALTER TABLE owner_accounts ADD CONSTRAINT owner_accounts_primary_check CHECK (
      (primary_avatar_id IS NULL AND primary_basis IS NULL AND
       primary_confidence IS NULL AND primary_selected_at IS NULL)
      OR
      (primary_avatar_id IS NOT NULL AND primary_basis IN
       ('selected-endpoint','default-endpoint','manual') AND
       primary_confidence BETWEEN 0 AND 100 AND primary_selected_at IS NOT NULL)
    );
    ALTER TABLE avatars ADD CONSTRAINT avatars_name_check CHECK (
      (name_status = 'unresolved' AND name IS NULL) OR
      (name_status IN ('verified','observed') AND name IS NOT NULL)
    );
    ALTER TABLE owner_avatar_relationships ADD CONSTRAINT owner_avatar_evidence_check CHECK (
      evidence_kind IN ('avatar-owner-field','get-users-avatars',
        'selected-avatar-endpoint','default-avatar-endpoint','manual-verified')
    );
    ALTER TABLE item_definitions ADD CONSTRAINT item_xml_rarity_check CHECK (
      xml_rarity IN ('unknown','common','uncommon','rare','legendary')
    );
    ALTER TABLE temporal_observations ADD CONSTRAINT temporal_relationship_shape_check CHECK (
      (relationship = 'equipped' AND avatar_id IS NOT NULL AND space_id IS NULL)
      OR
      (relationship = 'placed' AND avatar_id IS NULL AND space_id IS NOT NULL)
      OR
      (relationship = 'listed-for-sale' AND avatar_id IS NULL AND space_id IS NOT NULL)
    );
    ALTER TABLE temporal_observations ADD CONSTRAINT temporal_interval_check CHECK (
      valid_to IS NULL OR valid_to > valid_from
    );
  `.execute(db);

  await sql`
    CREATE FUNCTION reject_immutable_domain_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'canonical evidence rows are append-only';
    END;
    $$
  `.execute(db);

  for (const table of [
    'owner_avatar_relationships',
    'avatar_config_snapshots',
    'temporal_observations'
  ]) {
    await sql.raw(`
      CREATE TRIGGER ${table}_append_only
      BEFORE UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION reject_immutable_domain_mutation()
    `).execute(db);
  }

  await db.schema.createIndex('avatars_owner_idx').on('avatars').column('owner_id').execute();
  await db.schema.createIndex('observations_avatar_time_idx')
    .on('temporal_observations').columns(['avatar_id', 'observed_at']).execute();
  await db.schema.createIndex('observations_space_time_idx')
    .on('temporal_observations').columns(['space_id', 'observed_at']).execute();
  await db.schema.createIndex('observations_item_time_idx')
    .on('temporal_observations').columns(['item_definition_source_xml', 'observed_at']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('publication_decisions').ifExists().execute();
  await db.schema.dropTable('temporal_observations').ifExists().execute();
  await db.schema.dropTable('avatar_config_snapshots').ifExists().execute();
  await db.schema.dropTable('item_instances').ifExists().execute();
  await db.schema.dropTable('item_definitions').ifExists().execute();
  await db.schema.dropTable('spaces').ifExists().execute();
  await db.schema.dropTable('owner_avatar_relationships').ifExists().execute();
  await db.schema.dropTable('avatars').ifExists().execute();
  await db.schema.dropTable('owner_accounts').ifExists().execute();
  await sql`DROP FUNCTION IF EXISTS reject_immutable_domain_mutation()`
    .execute(db);
}
