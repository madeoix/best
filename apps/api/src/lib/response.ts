import type { FastifyRequest } from 'fastify';

export function responseMeta(request: FastifyRequest) {
  return {
    requestId: request.id,
    generatedAt: new Date().toISOString(),
    nextCursor: null
  };
}

export function errorBody(
  request: FastifyRequest,
  code: string,
  message: string,
  details?: unknown
) {
  return {
    error: {
      code,
      message,
      requestId: request.id,
      ...(details === undefined ? {} : { details })
    }
  };
}
