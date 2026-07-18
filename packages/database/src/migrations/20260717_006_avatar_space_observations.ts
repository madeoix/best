import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('avatar_space_observations')
    .addColumn('observation_id', 'text', (column) => column.primaryKey())
    .addColumn('avatar_id', 'text', (column) => column.notNull().references('avatars.avatar_id'))
    .addColumn('space_id', 'text', (column) => column.notNull().references('spaces.space_id'))
    .addColumn('observed_at', 'timestamptz', (column) => column.notNull())
    .addColumn('source_key', 'text', (column) => column.notNull())
    .addColumn('capture_id', 'text', (column) => column.notNull())
    .addColumn('crawler_id', 'text')
    .addColumn('evidence_sha256', 'char(64)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('avatar_space_observations_avatar_idx')
    .on('avatar_space_observations').columns(['avatar_id', 'observed_at']).execute();
  await db.schema.createIndex('avatar_space_observations_space_idx')
    .on('avatar_space_observations').columns(['space_id', 'observed_at']).execute();
  await sql`
    CREATE TRIGGER avatar_space_observations_immutable
    BEFORE UPDATE OR DELETE ON avatar_space_observations
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_domain_mutation()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('avatar_space_observations').ifExists().execute();
}
