import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    operatorActor?: {
      label: string;
      tokenPrefix: string;
      scopes: string[];
    };
  }
}
