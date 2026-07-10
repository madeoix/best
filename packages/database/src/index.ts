import { CamelCasePlugin, Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { DatabaseSchema } from './types.js';

const { Pool } = pg;

export type { DatabaseSchema } from './types.js';

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
  applicationName?: string;
}

export function createDatabase(options: DatabaseOptions): Kysely<DatabaseSchema> {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? 'smallverse-api'
  });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()]
  });
}


export async function pingDatabase(
  database: Kysely<DatabaseSchema>
): Promise<void> {
  await sql`select 1`.execute(database);
}
