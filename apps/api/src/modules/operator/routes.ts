import {
  OperatorServiceActionSchema,
  OperatorServiceNameSchema
} from '@smallverse/contracts';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../../lib/errors.js';
import type { ServiceControl } from './service-control.js';

const ServiceParameters = Type.Object({
  service: OperatorServiceNameSchema
});

export async function registerOperatorRoutes(
  app: FastifyInstance,
  services: ServiceControl
): Promise<void> {
  app.get(
    '/ops/v1/services/:service',
    {
      schema: {
        params: ServiceParameters
      }
    },
    async (request) => {
      const { service } = request.params as { service: string };

      return {
        data: await services.status(service),
        meta: {
          requestId: request.id,
          generatedAt: new Date().toISOString(),
          nextCursor: null
        }
      };
    }
  );

  app.post(
    '/ops/v1/services/:service/restart',
    {
      schema: {
        params: ServiceParameters,
        body: OperatorServiceActionSchema
      }
    },
    async (request) => {
      const { service } = request.params as { service: string };
      const body = request.body as {
        confirmation: string;
        reason: string;
      };

      if (body.confirmation !== service) {
        throw new HttpError(
          400,
          'CONFIRMATION_MISMATCH',
          'The confirmation must exactly match the service name.'
        );
      }

      request.log.warn({
        audit: {
          action: 'service.restart',
          target: service,
          reason: body.reason,
          requestId: request.id,
          remoteAddress: request.ip
        }
      }, 'Operator action');

      return {
        data: await services.restart(service),
        meta: {
          requestId: request.id,
          generatedAt: new Date().toISOString(),
          nextCursor: null
        }
      };
    }
  );
}
