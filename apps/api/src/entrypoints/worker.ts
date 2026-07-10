import { createDatabase } from '@smallverse/database';
import { loadWorkerConfig } from '../config.js';

const config = loadWorkerConfig();

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required to start the worker');
}

const database = createDatabase({
  connectionString: config.databaseUrl,
  applicationName: `smallverse-worker:${config.workerId}`,
  maxConnections: 2
});

let stopping = false;

const stop = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.info(JSON.stringify({
    level: 'info',
    service: 'smallverse-worker',
    signal,
    message: 'Worker shutting down'
  }));
  await database.destroy();
  process.exit(0);
};

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));

console.info(JSON.stringify({
  level: 'info',
  service: 'smallverse-worker',
  workerId: config.workerId,
  pollIntervalMs: config.pollIntervalMs,
  message: 'Worker foundation started; no production handlers are registered yet'
}));

while (!stopping) {
  await new Promise((resolve) =>
    setTimeout(resolve, config.pollIntervalMs)
  );
}
