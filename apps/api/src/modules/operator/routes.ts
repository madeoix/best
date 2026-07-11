import {
  OperatorActionNameSchema,
  OperatorActionRequestSchema,
  OperatorServiceActionSchema,
  OperatorServiceNameSchema,
  OperatorSessionImportSchema,
  type OperatorActionName,
  type OperatorSessionImport
} from '@smallverse/contracts';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/errors.js';
import { requireOperatorScope } from '../../lib/operator-auth.js';
import type { OperatorActionRunner } from './action-runner.js';
import type { OperatorAudit } from './audit-log.js';
import type { OperatorOverview } from './overview.js';
import type { ServiceControl } from './service-control.js';
import type { OperatorSessionImporter } from './session-importer.js';

const ServiceParameters = Type.Object({
  service: OperatorServiceNameSchema
});

const ActionParameters = Type.Object({
  action: OperatorActionNameSchema
});

const AuditQuery = Type.Object({
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 200, default: 50 })
  )
});

export interface OperatorRouteDependencies {
  services: ServiceControl;
  actions: OperatorActionRunner;
  overview: OperatorOverview;
  sessions: OperatorSessionImporter;
  audit: OperatorAudit;
}

function response(request: FastifyRequest, data: unknown) {
  return {
    data,
    meta: {
      requestId: request.id,
      generatedAt: new Date().toISOString(),
      nextCursor: null
    }
  };
}

export async function registerOperatorRoutes(
  app: FastifyInstance,
  dependencies: OperatorRouteDependencies
): Promise<void> {
  app.get('/ops/v1/overview', async (request) => {
    requireOperatorScope(request, 'operations:read');
    return response(request, await dependencies.overview.read());
  });

  app.get(
    '/ops/v1/audit',
    {
      schema: {
        querystring: AuditQuery
      }
    },
    async (request) => {
      requireOperatorScope(request, 'audit:read');
      const query = request.query as {
        limit?: number | string;
      };
      const limit = Number(query.limit ?? 50);

      return response(request, {
        events: await dependencies.audit.list(limit)
      });
    }
  );

  app.get(
    '/ops/v1/services/:service',
    {
      schema: {
        params: ServiceParameters
      }
    },
    async (request) => {
      requireOperatorScope(request, 'services:read');
      const { service } = request.params as { service: string };

      return response(
        request,
        await dependencies.services.status(service)
      );
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
      requireOperatorScope(request, 'services:write');
      const { service } = request.params as { service: string };
      const body = request.body as {
        confirmation: string;
        reason: string;
      };

      if (body.confirmation !== service) {
        await dependencies.audit.record(request, {
          action: 'service.restart',
          targetType: 'systemd-service',
          targetId: service,
          inputSummary: { reason: body.reason },
          result: 'rejected',
          error: 'confirmation mismatch'
        });
        throw new HttpError(
          400,
          'CONFIRMATION_MISMATCH',
          'The confirmation must exactly match the service name.'
        );
      }

      try {
        const data = await dependencies.services.restart(service);
        await dependencies.audit.record(request, {
          action: 'service.restart',
          targetType: 'systemd-service',
          targetId: service,
          inputSummary: { reason: body.reason },
          result: 'succeeded'
        });
        return response(request, data);
      } catch (error) {
        await dependencies.audit.record(request, {
          action: 'service.restart',
          targetType: 'systemd-service',
          targetId: service,
          inputSummary: { reason: body.reason },
          result: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  );

  app.post(
    '/ops/v1/actions/:action',
    {
      schema: {
        params: ActionParameters,
        body: OperatorActionRequestSchema
      }
    },
    async (request) => {
      requireOperatorScope(request, 'operations:write');
      const { action } = request.params as {
        action: OperatorActionName;
      };
      const body = request.body as {
        confirmation: OperatorActionName;
        reason: string;
      };

      if (body.confirmation !== action) {
        await dependencies.audit.record(request, {
          action: `operation.${action}`,
          targetType: 'operator-action',
          targetId: action,
          inputSummary: { reason: body.reason },
          result: 'rejected',
          error: 'confirmation mismatch'
        });
        throw new HttpError(
          400,
          'CONFIRMATION_MISMATCH',
          'The confirmation must exactly match the operator action.'
        );
      }

      try {
        const data = await dependencies.actions.run(action);
        await dependencies.audit.record(request, {
          action: `operation.${action}`,
          targetType: 'operator-action',
          targetId: action,
          inputSummary: { reason: body.reason },
          result: 'succeeded'
        });
        return response(request, data);
      } catch (error) {
        await dependencies.audit.record(request, {
          action: `operation.${action}`,
          targetType: 'operator-action',
          targetId: action,
          inputSummary: { reason: body.reason },
          result: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  );

  app.post(
    '/ops/v1/sessions/import',
    {
      schema: {
        body: OperatorSessionImportSchema
      }
    },
    async (request) => {
      requireOperatorScope(request, 'sessions:write');
      const body = request.body as OperatorSessionImport;

      try {
        const data = await dependencies.sessions.importSession(body);
        await dependencies.audit.record(request, {
          action: 'session.import',
          targetType: 'operator-session',
          targetId: data.fingerprint,
          inputSummary: {
            label: data.label,
            capturedAt: data.capturedAt,
            cookieLength: data.cookieLength
          },
          result: 'succeeded'
        });
        return response(request, data);
      } catch (error) {
        await dependencies.audit.record(request, {
          action: 'session.import',
          targetType: 'operator-session',
          inputSummary: {
            label: body.label ?? null,
            avatarName: body.avatarName ?? null,
            capturedAt: body.capturedAt ?? null,
            cookieLength: body.cookie.length
          },
          result: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  );
}
