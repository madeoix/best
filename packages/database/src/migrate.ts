import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FileMigrationProvider,
  Migrator
} from 'kysely';
import { createDatabase } from './index.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const directory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations'
);

const database = createDatabase({
  connectionString,
  applicationName: 'smallverse-migrator',
  maxConnections: 1
});

try {
  const migrator = new Migrator({
    db: database,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: directory
    })
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    console.log(`${result.status}: ${result.migrationName}`);
  }

  if (error) {
    throw error;
  }
} finally {
  await database.destroy();
}
