import { Type, type Static } from '@sinclair/typebox';

export const RequestMetaSchema = Type.Object({
  requestId: Type.String({ format: 'uuid' }),
  generatedAt: Type.String({ format: 'date-time' }),
  nextCursor: Type.Union([Type.String(), Type.Null()])
});
export type RequestMeta = Static<typeof RequestMetaSchema>;

export const HealthDataSchema = Type.Object({
  service: Type.String(),
  status: Type.Union([
    Type.Literal('ok'),
    Type.Literal('degraded')
  ]),
  version: Type.String(),
  uptimeSeconds: Type.Number({ minimum: 0 }),
  dependencies: Type.Record(
    Type.String(),
    Type.Union([
      Type.Literal('ok'),
      Type.Literal('degraded'),
      Type.Literal('unavailable'),
      Type.Literal('not-configured')
    ])
  )
});
export type HealthData = Static<typeof HealthDataSchema>;

export const HealthResponseSchema = Type.Object({
  data: HealthDataSchema,
  meta: RequestMetaSchema
});
export type HealthResponse = Static<typeof HealthResponseSchema>;

export const ErrorBodySchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.String({ format: 'uuid' }),
    details: Type.Optional(Type.Unknown())
  })
});
export type ErrorBody = Static<typeof ErrorBodySchema>;

export const ObservatoryStatusSchema = Type.Object({
  ok: Type.Boolean(),
  source: Type.Optional(Type.String()),
  generated_at: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  file_modified_unix: Type.Optional(Type.Number()),
  counts: Type.Optional(Type.Object({
    assets: Type.Integer({ minimum: 0 }),
    observations: Type.Integer({ minimum: 0 }),
    uid_change_events: Type.Integer({ minimum: 0 }),
    variant_visuals: Type.Integer({ minimum: 0 })
  })),
  error: Type.Optional(Type.String())
});
export type ObservatoryStatus = Static<typeof ObservatoryStatusSchema>;

export const OperatorServiceNameSchema = Type.Union([
  Type.Literal('smallverse-explorer.service'),
  Type.Literal('smallverse-admin.service')
]);
export type OperatorServiceName = Static<typeof OperatorServiceNameSchema>;

export const OperatorServiceActionSchema = Type.Object({
  confirmation: Type.String({ minLength: 1, maxLength: 128 }),
  reason: Type.String({ minLength: 3, maxLength: 500 })
});
export type OperatorServiceAction = Static<typeof OperatorServiceActionSchema>;
