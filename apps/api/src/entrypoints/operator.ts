import { loadOperatorConfig } from '../config.js';
import { createOperatorApp } from '../operator-app.js';

const config = loadOperatorConfig();
const app = await createOperatorApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down operator API');
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
  app.log.fatal({ err: error }, 'Operator API failed to start');
  process.exit(1);
}
