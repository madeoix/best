import { timingSafeEqual } from 'node:crypto';
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

export function registerOperatorAuthentication(
  app: FastifyInstance,
  expectedToken: string
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
  });
}
