import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { PublicApiConfig } from './config.js';
import { createBaseApp } from './lib/app-base.js';
import { registerOptionalDatabase } from './lib/database-health.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { LegacyDataStore } from './modules/legacy/data-store.js';
import { registerLegacyPublicRoutes } from './modules/legacy/public-routes.js';

export async function createPublicApp(
  config: PublicApiConfig
): Promise<FastifyInstance> {
  const app = createBaseApp({
    serviceName: 'smallverse-public-api',
    logger:
      config.nodeEnv === 'test'
        ? false
        : { level: config.logLevel }
  });

  await app.register(cors, {
    origin:
      config.allowedOrigins.length === 0
        ? false
        : config.allowedOrigins
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip
  });

  const store = new LegacyDataStore({
    workspaceRoot: config.workspaceRoot,
    automationRoot: config.automationRoot
  });
  const database = registerOptionalDatabase(
    app,
    config.databaseUrl,
    'smallverse-public-api'
  );

  await registerHealthRoutes(app, {
    serviceName: 'smallverse-public-api',
    version: config.serviceVersion,
    dependencies: async () => {
      let observatory: 'ok' | 'unavailable' = 'ok';

      try {
        await store.getObservatoryStatus();
      } catch {
        observatory = 'unavailable';
      }

      return {
        observatory,
        database: await database.status()
      };
    }
  });

  await registerLegacyPublicRoutes(app, store);

  return app;
}
