import {
  HealthResponseSchema
} from '@smallverse/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { responseMeta } from '../../lib/response.js';

export interface HealthRouteOptions {
  serviceName: string;
  version: string;
  dependencies: () => Promise<Record<string, string>>;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions
): Promise<void> {
  const handler = async (request: FastifyRequest) => {
    const dependencies = await options.dependencies();
    const degraded = Object.values(dependencies).some(
      (status) => status === 'unavailable' || status === 'degraded'
    );

    return {
      data: {
        service: options.serviceName,
        status: degraded ? 'degraded' as const : 'ok' as const,
        version: options.version,
        uptimeSeconds: process.uptime(),
        dependencies
      },
      meta: responseMeta(request)
    };
  };

  app.get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema
        }
      }
    },
    handler
  );

  app.get(
    options.serviceName === 'smallverse-operator-api'
      ? '/ops/v1/health'
      : '/api/v1/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema
        }
      }
    },
    handler
  );
}
