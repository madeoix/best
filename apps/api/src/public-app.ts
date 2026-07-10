import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { PublicApiConfig } from './config.js';
import { createBaseApp } from './lib/app-base.js';
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

  await registerHealthRoutes(app, {
    serviceName: 'smallverse-public-api',
    version: config.serviceVersion,
    dependencies: async () => {
      try {
        await store.getObservatoryStatus();
        return {
          observatory: 'ok'
        };
      } catch {
        return {
          observatory: 'unavailable'
        };
      }
    }
  });

  await registerLegacyPublicRoutes(app, store);

  return app;
}
