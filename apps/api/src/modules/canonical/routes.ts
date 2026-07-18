import type { CanonicalRepository } from '@smallverse/database';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/errors.js';
import { responseMeta } from '../../lib/response.js';

const IdPath = Type.Object({ id: Type.String({ minLength: 1, maxLength: 512 }) });
const SearchQuery = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 60 }))
});
const SourceQuery = Type.Object({ source_xml: Type.String({ minLength: 1, maxLength: 2048 }) });

function envelope(request: FastifyRequest, data: unknown) {
  return { data, meta: responseMeta(request) };
}

function publishable<T extends { publication: { eligible: boolean } | null | undefined }>(
  record: T | null,
  entity: string
): T {
  if (!record) throw new HttpError(404, `${entity.toUpperCase()}_NOT_FOUND`, `${entity} was not found.`);
  if (record.publication?.eligible !== true) {
    throw new HttpError(404, `${entity.toUpperCase()}_NOT_PUBLIC`, `${entity} has not passed canonical publication validation.`);
  }
  return record;
}

export async function registerCanonicalPublicRoutes(
  app: FastifyInstance,
  repository: CanonicalRepository
): Promise<void> {
  app.get('/api/v1/status', async (request) =>
    envelope(request, await repository.publicStatus()));

  app.get('/api/v1/search', { schema: { querystring: SearchQuery } }, async (request) => {
    const query = request.query as { q?: string; limit?: number };
    return envelope(request, await repository.searchPublicItems(query.q ?? '', query.limit ?? 60));
  });

  app.get('/api/v1/avatars', { schema: { querystring: SearchQuery } }, async (request) => {
    const query = request.query as { q?: string; limit?: number };
    return envelope(request, await repository.publicAvatars(query.q ?? '', query.limit ?? 60));
  });

  // This is a read-only receipt feed for the private desktop Observatory.
  // It contains no raw config, and it is not a replacement for the general
  // avatar directory: every row has a real config snapshot plus a separately
  // published name and portrait.
  app.get('/api/v1/avatars/captured', { schema: { querystring: SearchQuery } }, async (request) => {
    const query = request.query as { limit?: number };
    return envelope(request, await repository.capturedPublicAvatars(query.limit ?? 60));
  });

  app.get('/api/v1/spaces', { schema: { querystring: SearchQuery } }, async (request) => {
    const query = request.query as { q?: string; limit?: number };
    return envelope(request, await repository.publicSpaces(query.q ?? '', query.limit ?? 60));
  });

  app.get('/api/v1/items/profile', { schema: { querystring: SourceQuery } }, async (request) => {
    const { source_xml } = request.query as { source_xml: string };
    return envelope(request, publishable(await repository.item(source_xml.trim()), 'item'));
  });

  app.get('/api/v1/observatory/item', { schema: { querystring: SourceQuery } }, async (request) => {
    const { source_xml } = request.query as { source_xml: string };
    return envelope(request, publishable(await repository.item(source_xml.trim()), 'item'));
  });

  app.get('/api/v1/avatars/:id', { schema: { params: IdPath } }, async (request) => {
    const { id } = request.params as { id: string };
    return envelope(request, publishable(await repository.avatar(id), 'avatar'));
  });

  app.get('/api/v1/accounts/:id', { schema: { params: IdPath } }, async (request) => {
    const { id } = request.params as { id: string };
    const account = await repository.account(id);
    if (!account) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'account was not found.');
    return envelope(request, account);
  });

  app.get('/api/v1/spaces/:id', { schema: { params: IdPath } }, async (request) => {
    const { id } = request.params as { id: string };
    return envelope(request, publishable(await repository.space(id), 'space'));
  });
}
