import {
  AvatarProfileQuerySchema,
  DataResponseSchema,
  LegacyBatchReadModelSchema,
  LegacyReadModelSchema,
  SourceXmlBatchQuerySchema,
  SourceXmlQuerySchema,
  SpaceProfileQuerySchema,
  SpinPriceReadModelSchema
} from '@smallverse/contracts';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/errors.js';
import { responseMeta } from '../../lib/response.js';
import type { LegacyDataStore } from './data-store.js';

const SearchQuery = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: 200,
    default: 60
  }))
});

const BadgeQuery = Type.Object({
  label: Type.Optional(Type.String({ maxLength: 8 })),
  status: Type.Optional(Type.String({ maxLength: 64 }))
});

const AvatarPath = Type.Object({
  avatarId: Type.String({
    minLength: 1,
    maxLength: 128,
    pattern: '^[A-Za-z0-9_-]+$'
  })
});

const SpacePath = Type.Object({
  spaceId: Type.String({
    minLength: 8,
    maxLength: 80,
    pattern: '^[A-Za-z0-9_-]+$'
  })
});

function envelope(request: FastifyRequest, data: unknown) {
  return {
    data,
    meta: responseMeta(request)
  };
}

function requireFound(
  profile: Record<string, unknown>,
  entity: string
): Record<string, unknown> {
  if (profile.ok === false) {
    throw new HttpError(
      404,
      `${entity.toUpperCase()}_NOT_FOUND`,
      typeof profile.error === 'string'
        ? profile.error
        : `The requested ${entity} was not found.`
    );
  }

  return profile;
}

function batchSources(value: string | string[]): string[] {
  const values = Array.isArray(value) ? value : [value];

  return [...new Set(
    values
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  )].slice(0, 20);
}

function avatarBadge(labelValue: string, status: string): string {
  const label =
    labelValue
      .slice(0, 2)
      .toUpperCase()
      .replace(/[^\p{L}\p{N}_?]/gu, '') ||
    '?';

  const stroke =
    status === 'captured_reference_unverified'
      ? '#b88746'
      : status === 'missing'
        ? '#4b5563'
        : '#5b6ee1';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <radialGradient id="g" cx="35%" cy="25%" r="75%">
        <stop offset="0%" stop-color="#2b3244"/>
        <stop offset="100%" stop-color="#0b0f17"/>
      </radialGradient>
    </defs>
    <rect width="96" height="96" rx="22" fill="url(#g)"/>
    <rect x="3" y="3" width="90" height="90" rx="20" fill="none" stroke="${stroke}" stroke-width="3" opacity="0.85"/>
    <circle cx="48" cy="35" r="16" fill="#d6deff" opacity="0.18"/>
    <path d="M22 80c4-18 17-28 26-28s22 10 26 28" fill="#d6deff" opacity="0.14"/>
    <text x="48" y="57" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800" fill="#eef2ff">${label}</text>
  </svg>`;
}

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
    '/api/beacon/observatory/item',
    {
      schema: {
        querystring: SourceXmlQuerySchema,
        response: {
          200: LegacyReadModelSchema
        }
      }
    },
    async (request) => {
      const query = request.query as { source_xml: string };
      return store.getObservatoryItem(query.source_xml.trim());
    }
  );

  app.get(
    '/api/beacon/item/profile',
    {
      schema: {
        querystring: SourceXmlQuerySchema,
        response: {
          200: LegacyReadModelSchema
        }
      }
    },
    async (request) => {
      const query = request.query as { source_xml: string };
      return store.getItemProfile(query.source_xml.trim());
    }
  );

  app.get(
    '/api/beacon/item/profiles',
    {
      schema: {
        querystring: SourceXmlBatchQuerySchema,
        response: {
          200: LegacyBatchReadModelSchema
        }
      }
    },
    async (request) => {
      const query = request.query as {
        source_xml: string | string[];
      };

      return store.getItemProfiles(
        batchSources(query.source_xml)
      );
    }
  );

  app.get(
    '/api/beacon/avatar/profile',
    {
      schema: {
        querystring: AvatarProfileQuerySchema,
        response: {
          200: LegacyReadModelSchema
        }
      }
    },
    async (request) => {
      const query = request.query as { avatar_id: string };
      return store.getAvatarProfile(query.avatar_id);
    }
  );

  app.get(
    '/api/beacon/avatar/badge',
    {
      schema: {
        querystring: BadgeQuery
      }
    },
    async (request, reply) => {
      const query = request.query as {
        label?: string;
        status?: string;
      };

      return reply
        .type('image/svg+xml; charset=utf-8')
        .header('cache-control', 'public, max-age=86400')
        .send(avatarBadge(
          query.label ?? '?',
          query.status ?? 'missing'
        ));
    }
  );

  app.get(
    '/api/beacon/space/profile',
    {
      schema: {
        querystring: SpaceProfileQuerySchema,
        response: {
          200: LegacyReadModelSchema
        }
      }
    },
    async (request) => {
      const query = request.query as { space_id: string };
      return store.getSpaceProfile(query.space_id);
    }
  );

  app.get(
    '/api/beacon/spin/prices',
    {
      schema: {
        response: {
          200: SpinPriceReadModelSchema
        }
      }
    },
    async () => store.getSpinPrices()
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

      return envelope(request, result.items);
    }
  );

  app.get(
    '/api/v1/observatory/item',
    {
      schema: {
        querystring: SourceXmlQuerySchema,
        response: {
          200: DataResponseSchema(LegacyReadModelSchema)
        }
      }
    },
    async (request) => {
      const query = request.query as { source_xml: string };
      const result = await store.getObservatoryItem(
        query.source_xml.trim()
      );

      return envelope(
        request,
        requireFound(result, 'observatory_item')
      );
    }
  );

  app.get(
    '/api/v1/items/profile',
    {
      schema: {
        querystring: SourceXmlQuerySchema,
        response: {
          200: DataResponseSchema(LegacyReadModelSchema)
        }
      }
    },
    async (request) => {
      const query = request.query as { source_xml: string };
      const result = await store.getItemProfile(
        query.source_xml.trim()
      );

      return envelope(request, requireFound(result, 'item'));
    }
  );

  app.get(
    '/api/v1/avatars/:avatarId',
    {
      schema: {
        params: AvatarPath,
        response: {
          200: DataResponseSchema(LegacyReadModelSchema)
        }
      }
    },
    async (request) => {
      const params = request.params as { avatarId: string };
      const result = await store.getAvatarProfile(params.avatarId);

      return envelope(request, requireFound(result, 'avatar'));
    }
  );

  app.get(
    '/api/v1/spaces/:spaceId',
    {
      schema: {
        params: SpacePath,
        response: {
          200: DataResponseSchema(LegacyReadModelSchema)
        }
      }
    },
    async (request) => {
      const params = request.params as { spaceId: string };
      const result = await store.getSpaceProfile(params.spaceId);

      return envelope(request, requireFound(result, 'space'));
    }
  );

  app.get(
    '/api/v1/spin/prices',
    {
      schema: {
        response: {
          200: DataResponseSchema(SpinPriceReadModelSchema)
        }
      }
    },
    async (request) => envelope(
      request,
      await store.getSpinPrices()
    )
  );
}
