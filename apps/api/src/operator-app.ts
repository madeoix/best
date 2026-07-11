import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { OperatorApiConfig } from './config.js';
import { createBaseApp } from './lib/app-base.js';
import { registerOptionalDatabase } from './lib/database-health.js';
import { registerOperatorAuthentication } from './lib/operator-auth.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import {
  ExecFileCommandExecutor,
  OperatorActionRunner,
  type CommandExecutor
} from './modules/operator/action-runner.js';
import { OperatorAuditLog } from './modules/operator/audit-log.js';
import { OperatorOverview } from './modules/operator/overview.js';
import {
  registerOperatorRoutes,
  type OperatorRouteDependencies
} from './modules/operator/routes.js';
import { ServiceControl } from './modules/operator/service-control.js';
import { OperatorSessionImporter } from './modules/operator/session-importer.js';

export interface OperatorAppOverrides {
  commandExecutor?: CommandExecutor;
  routes?: Partial<OperatorRouteDependencies>;
}

export async function createOperatorApp(
  config: OperatorApiConfig,
  overrides: OperatorAppOverrides = {}
): Promise<FastifyInstance> {
  const app = createBaseApp({
    serviceName: 'smallverse-operator-api',
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

  registerOperatorAuthentication(
    app,
    config.operatorToken,
    config.operatorScopes
  );

  const database = registerOptionalDatabase(
    app,
    config.databaseUrl,
    'smallverse-operator-api'
  );

  await registerHealthRoutes(app, {
    serviceName: 'smallverse-operator-api',
    version: config.serviceVersion,
    dependencies: async () => ({
      systemd: 'not-configured',
      database: await database.status()
    })
  });

  const executor =
    overrides.commandExecutor ?? new ExecFileCommandExecutor();

  const services = new ServiceControl({
    allowedServices: config.allowedServices,
    command: config.systemctlCommand
  });

  const dependencies: OperatorRouteDependencies = {
    services,
    actions: new OperatorActionRunner({
      smallverseRoot: config.smallverseRoot,
      workspaceRoot: config.workspaceRoot,
      systemctlCommand: config.systemctlCommand,
      privilegedCommand: config.privilegedCommand,
      executor
    }),
    overview: new OperatorOverview({
      smallverseRoot: config.smallverseRoot,
      workspaceRoot: config.workspaceRoot,
      remoteSessionRoot: config.remoteSessionRoot,
      systemctlCommand: config.systemctlCommand,
      services,
      executor
    }),
    sessions: new OperatorSessionImporter(
      config.remoteSessionRoot
    ),
    audit: new OperatorAuditLog(database.database, app.log),
    ...overrides.routes
  };

  await registerOperatorRoutes(app, dependencies);

  return app;
}
