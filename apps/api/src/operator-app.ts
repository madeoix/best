import type { FastifyInstance } from 'fastify';
import type { OperatorApiConfig } from './config.js';
import { createBaseApp } from './lib/app-base.js';
import { registerOperatorAuthentication } from './lib/operator-auth.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerOperatorRoutes } from './modules/operator/routes.js';
import { ServiceControl } from './modules/operator/service-control.js';

export async function createOperatorApp(
  config: OperatorApiConfig
): Promise<FastifyInstance> {
  const app = createBaseApp({
    serviceName: 'smallverse-operator-api',
    logger:
      config.nodeEnv === 'test'
        ? false
        : { level: config.logLevel }
  });

  registerOperatorAuthentication(app, config.operatorToken);

  await registerHealthRoutes(app, {
    serviceName: 'smallverse-operator-api',
    version: config.serviceVersion,
    dependencies: async () => ({
      systemd: 'not-configured'
    })
  });

  const services = new ServiceControl({
    allowedServices: config.allowedServices,
    command: config.systemctlCommand
  });

  await registerOperatorRoutes(app, services);

  return app;
}
