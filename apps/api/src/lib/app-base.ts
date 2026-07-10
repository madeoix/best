import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from 'fastify';
import { HttpError } from './errors.js';
import { errorBody } from './response.js';

export interface BaseAppOptions {
  serviceName: string;
  logger?: FastifyServerOptions['logger'];
}

export function createBaseApp(options: BaseAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send(errorBody(
          request,
          error.code,
          error.message,
          error.details
        ));
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      Array.isArray(error.validation)
    ) {
      return reply
        .status(400)
        .send(errorBody(
          request,
          'REQUEST_VALIDATION_FAILED',
          'The request did not match the required schema.',
          error.validation
        ));
    }

    request.log.error({ err: error }, 'Unhandled request error');

    return reply
      .status(500)
      .send(errorBody(
        request,
        'INTERNAL_SERVER_ERROR',
        'The server could not complete the request.'
      ));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(errorBody(
        request,
        'ROUTE_NOT_FOUND',
        'The requested route does not exist.'
      ))
  );

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    return payload;
  });

  app.get('/_service', async (request) => ({
    data: {
      service: options.serviceName
    },
    meta: {
      requestId: request.id,
      generatedAt: new Date().toISOString(),
      nextCursor: null
    }
  }));

  return app;
}
