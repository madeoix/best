import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import type { LegacyDataStore } from './data-store.js';

const SearchQuery = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: 200,
    default: 60
  }))
});

export async function registerLegacyPublicRoutes(
  app: FastifyInstance,
  store: LegacyDataStore
): Promise<void> {
  app.get('/api/beacon/world', async () => store.getWorld());

  app.get(
    '/api/beacon/observatory/status',
    async () => store.getObservatoryStatus()
  );

  app.get(
    '/api/beacon/observatory/search',
    {
      schema: {
        querystring: SearchQuery
      }
    },
    async (request) => {
      const query = request.query as {
        q?: string;
        limit?: number;
      };

      return store.searchObservatory(
        query.q ?? '',
        query.limit ?? 60
      );
    }
  );

  app.get(
    '/api/v1/search',
    {
      schema: {
        querystring: SearchQuery
      }
    },
    async (request) => {
      const query = request.query as {
        q?: string;
        limit?: number;
      };

      const result = await store.searchObservatory(
        query.q ?? '',
        query.limit ?? 60
      );

      return {
        data: result.items,
        meta: {
          requestId: request.id,
          generatedAt: new Date().toISOString(),
          nextCursor: null
        }
      };
    }
  );
}
