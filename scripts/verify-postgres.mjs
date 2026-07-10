import process from 'node:process';
import {
  createDatabase,
  pingDatabase
} from '../packages/database/dist/index.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const database = createDatabase({
  connectionString,
  applicationName: 'smallverse-database-verifier',
  maxConnections: 1
});

try {
  await pingDatabase(database);

  const tables = [
    'sources',
    'entities',
    'blobs',
    'assets',
    'jobs',
    'operator_tokens',
    'audit_events'
  ];

  const result = await database
    .selectFrom('sources')
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirstOrThrow();

  const jobResult = await database
    .selectFrom('jobs')
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirstOrThrow();

  console.log(JSON.stringify({
    ok: true,
    tables,
    sourceRows: String(result.count),
    jobRows: String(jobResult.count)
  }, null, 2));
} finally {
  await database.destroy();
}
