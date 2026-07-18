import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import { DomainDateTimeSchema } from './domain.js';

export const CAPTURE_GENERATION_CONTRACT_VERSION = '1.0.0' as const;

export const CaptureGenerationOutcomeSchema = Type.Union([
  Type.Literal('succeeded'),
  Type.Literal('partial'),
  Type.Literal('failed')
]);
export type CaptureGenerationOutcome =
  Static<typeof CaptureGenerationOutcomeSchema>;

export const PopularRequestMethodSchema = Type.Union([
  Type.Literal('space.viewPopSpaces'),
  Type.Literal('catalog_entry.getSpacesForCategory'),
  Type.Literal('GET /api/space/popular'),
  Type.Null()
]);
export type PopularRequestMethod = Static<typeof PopularRequestMethodSchema>;

export const CaptureGenerationCountsSchema = Type.Object({
  popularRows: Type.Integer({ minimum: 0 }),
  selectedSpaces: Type.Integer({ minimum: 0 }),
  joinedSpaces: Type.Integer({ minimum: 0 }),
  avatarsObserved: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  avatarConfigsCaptured: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  itemUidsObserved: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  itemConfigsCaptured: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  protocolEvents: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  assetsVerified: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])
}, {
  additionalProperties: false
});
export type CaptureGenerationCounts =
  Static<typeof CaptureGenerationCountsSchema>;

/**
 * Append-only receipt for one bounded crawler attempt. A generation records
 * what was captured, not merely whether a timer or parser exited with code 0.
 */
export const CaptureGenerationSchema = Type.Object({
  generationId: Type.String({
    minLength: 1,
    maxLength: 128,
    pattern: '^[A-Za-z0-9._:-]+$'
  }),
  crawlerId: Type.String({ minLength: 1, maxLength: 128 }),
  outcome: CaptureGenerationOutcomeSchema,
  startedAt: DomainDateTimeSchema,
  completedAt: DomainDateTimeSchema,
  popularRequestMethod: PopularRequestMethodSchema,
  popularRequestSha256: Type.Union([
    Type.String({ pattern: '^[a-f0-9]{64}$' }),
    Type.Null()
  ]),
  popularResponseSha256: Type.Union([
    Type.String({ pattern: '^[a-f0-9]{64}$' }),
    Type.Null()
  ]),
  evidenceManifestSha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  counts: CaptureGenerationCountsSchema,
  failureCode: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ]),
  failureMessage: Type.Union([
    Type.String({ minLength: 1, maxLength: 2_048 }),
    Type.Null()
  ])
}, {
  $id: 'CaptureGeneration',
  additionalProperties: false
});
export type CaptureGeneration = Static<typeof CaptureGenerationSchema>;

export type CaptureGenerationValidationResult =
  | { ok: true; value: CaptureGeneration }
  | { ok: false; issues: Array<{ path: string; message: string }> };

function issue(path: string, message: string): CaptureGenerationValidationResult {
  return { ok: false, issues: [{ path, message }] };
}

export function validateCaptureGeneration(
  input: unknown
): CaptureGenerationValidationResult {
  if (!Value.Check(CaptureGenerationSchema, input)) {
    return {
      ok: false,
      issues: [...Value.Errors(CaptureGenerationSchema, input)].map((error) => ({
        path: error.path || '/',
        message: error.message
      }))
    };
  }

  const value = input as CaptureGeneration;
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    return issue('/completedAt', 'must be at or after startedAt');
  }

  const hasPopularRequest = value.popularRequestMethod !== null;
  if (hasPopularRequest !== (value.popularRequestSha256 !== null) ||
      hasPopularRequest !== (value.popularResponseSha256 !== null)) {
    return issue(
      '/popularRequestMethod',
      'method, request receipt, and response receipt must be present together'
    );
  }

  if (value.outcome === 'succeeded') {
    if (!hasPopularRequest || value.counts.popularRows === 0) {
      return issue(
        '/counts/popularRows',
        'a successful live generation requires a retained nonempty Popular response'
      );
    }
    if (value.failureCode !== null || value.failureMessage !== null) {
      return issue('/failureCode', 'must be null for a successful generation');
    }
  } else if (value.failureCode === null) {
    return issue('/failureCode', 'is required for partial or failed generations');
  }

  if (value.counts.joinedSpaces > value.counts.selectedSpaces ||
      value.counts.selectedSpaces > value.counts.popularRows) {
    return issue(
      '/counts/joinedSpaces',
      'joinedSpaces <= selectedSpaces <= popularRows must hold'
    );
  }

  return { ok: true, value };
}
