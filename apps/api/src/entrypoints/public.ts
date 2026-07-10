import { loadPublicConfig } from '../config.js';
import { createPublicApp } from '../public-app.js';

const config = loadPublicConfig();
const app = await createPublicApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down public API');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({
    host: config.host,
    port: config.port
  });
} catch (error) {
  app.log.fatal({ err: error }, 'Public API failed to start');
  process.exit(1);
}
