import {
  createDatabase,
  pingDatabase
} from '@smallverse/database';
import type { FastifyInstance } from 'fastify';

export interface OptionalDatabase {
  database?: ReturnType<typeof createDatabase>;
  status(): Promise<'ok' | 'unavailable' | 'not-configured'>;
}

export function registerOptionalDatabase(
  app: FastifyInstance,
  connectionString: string | undefined,
  applicationName: string
): OptionalDatabase {
  if (!connectionString) {
    return {
      async status() {
        return 'not-configured';
      }
    };
  }

  const database = createDatabase({
    connectionString,
    applicationName,
    maxConnections: 2
  });

  app.addHook('onClose', async () => {
    await database.destroy();
  });

  return {
    database,
    async status() {
      try {
        await pingDatabase(database);
        return 'ok';
      } catch (error) {
        app.log.warn({ err: error }, 'Database health check failed');
        return 'unavailable';
      }
    }
  };
}
