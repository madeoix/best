import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from './errors.js';

function equalSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? '';
}

function tokenPrefix(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

export function registerOperatorAuthentication(
  app: FastifyInstance,
  expectedToken: string,
  scopes: string[]
): void {
  app.addHook('onRequest', async (request) => {
    if (
      request.url === '/health' ||
      request.url === '/ops/v1/health'
    ) {
      return;
    }

    const provided = bearerToken(request);

    if (
      !expectedToken ||
      !provided ||
      !equalSecret(provided, expectedToken)
    ) {
      throw new HttpError(
        401,
        'OPERATOR_AUTH_REQUIRED',
        'A valid operator bearer token is required.'
      );
    }

    request.operatorActor = {
      label: 'configured-operator',
      tokenPrefix: tokenPrefix(provided),
      scopes: [...scopes]
    };
  });
}

export function requireOperatorScope(
  request: FastifyRequest,
  scope: string
): void {
  if (!request.operatorActor?.scopes.includes(scope)) {
    throw new HttpError(
      403,
      'OPERATOR_SCOPE_REQUIRED',
      `The operator token requires the ${scope} scope.`
    );
  }
}
