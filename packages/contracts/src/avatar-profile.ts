import { Type, type Static } from '@sinclair/typebox';

import {
  DomainDateTimeSchema,
  PrimaryAvatarBasisSchema,
  SourceXmlSchema
} from './domain.js';

// The domain identifier schemas carry global `$id` values for standalone
// validation. A Fastify response schema embeds each ID many times, so the
// wire projection uses the same constraints without duplicating `$id` refs.
const ProfileIdSchema = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: '^[^\\s]+$'
});

const ProfilePrimaryAvatarSelectionSchema = Type.Object({
  avatarId: ProfileIdSchema,
  basis: PrimaryAvatarBasisSchema,
  confidence: Type.Integer({ minimum: 0, maximum: 100 }),
  selectedAt: DomainDateTimeSchema
}, {
  additionalProperties: false
});

const NullableDateTimeSchema = Type.Union([
  DomainDateTimeSchema,
  Type.Null()
]);

const NullableTextSchema = Type.Union([
  Type.String(),
  Type.Null()
]);

/**
 * Account identity exposed by the avatar-profile read model. The nullable
 * observation times are intentional: old preserved exports contain valid
 * owner/avatar joins without capture timestamps.
 */
export const AvatarProfileAccountSchema = Type.Object({
  ownerId: ProfileIdSchema,
  displayName: NullableTextSchema,
  avatarIds: Type.Array(ProfileIdSchema, {
    maxItems: 3,
    uniqueItems: true
  }),
  selectedAvatarId: Type.Union([ProfileIdSchema, Type.Null()]),
  primaryAvatar: Type.Union([
    ProfilePrimaryAvatarSelectionSchema,
    Type.Null()
  ]),
  primaryAvatarStatus: Type.Union([
    Type.Literal('known'),
    Type.Literal('unknown')
  ]),
  firstObservedAt: NullableDateTimeSchema,
  lastObservedAt: NullableDateTimeSchema,
  evidenceCount: Type.Integer({ minimum: 0 })
}, {
  additionalProperties: false
});
export type AvatarProfileAccount =
  Static<typeof AvatarProfileAccountSchema>;

export const AvatarProfileSiblingSchema = Type.Object({
  ownerId: ProfileIdSchema,
  avatarId: ProfileIdSchema,
  name: NullableTextSchema,
  nameStatus: Type.Union([
    Type.Literal('observed'),
    Type.Literal('unresolved')
  ]),
  headUrl: NullableTextSchema,
  thumbUrl: NullableTextSchema,
  snapshotUrl: NullableTextSchema
}, {
  additionalProperties: false
});
export type AvatarProfileSibling =
  Static<typeof AvatarProfileSiblingSchema>;

export const AvatarProfileRelationshipKindSchema = Type.Union([
  Type.Literal('equipped'),
  Type.Literal('placed'),
  Type.Literal('listed-for-sale'),
  Type.Literal('unknown')
]);
export type AvatarProfileRelationshipKind =
  Static<typeof AvatarProfileRelationshipKindSchema>;

/**
 * Evidence row used by the read model. A row enters a semantic bucket only
 * when the source event states that relationship; room IDs and prices alone
 * never promote an `unknown` row.
 */
export const AvatarProfileRelationshipItemSchema = Type.Object({
  relationship: AvatarProfileRelationshipKindSchema,
  itemDefinitionSourceXml: SourceXmlSchema,
  itemInstanceUid: NullableTextSchema,
  name: Type.String({ minLength: 1 }),
  rarity: NullableTextSchema,
  slot: NullableTextSchema,
  spaceId: NullableTextSchema,
  sellerOwnerId: NullableTextSchema,
  listingId: NullableTextSchema,
  price: Type.Union([Type.Unknown(), Type.Null()]),
  observedAt: NullableDateTimeSchema,
  evidenceType: NullableTextSchema,
  itemConfigSha256: NullableTextSchema,
  avatarConfigSnapshotId: NullableTextSchema
}, {
  additionalProperties: false
});
export type AvatarProfileRelationshipItem =
  Static<typeof AvatarProfileRelationshipItemSchema>;

export const AvatarProfileRelationshipsSchema = Type.Object({
  equipped: Type.Array(AvatarProfileRelationshipItemSchema),
  placed: Type.Array(AvatarProfileRelationshipItemSchema),
  listedForSale: Type.Array(AvatarProfileRelationshipItemSchema),
  unknown: Type.Array(AvatarProfileRelationshipItemSchema)
}, {
  additionalProperties: false
});
export type AvatarProfileRelationships =
  Static<typeof AvatarProfileRelationshipsSchema>;

export const AvatarProfileConfigSnapshotSchema = Type.Object({
  snapshotId: ProfileIdSchema,
  avatarId: ProfileIdSchema,
  ownerId: Type.Union([ProfileIdSchema, Type.Null()]),
  configSha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  capturedAt: NullableDateTimeSchema,
  spaceId: NullableTextSchema,
  gender: NullableTextSchema,
  sourceCaptureId: NullableTextSchema,
  source: Type.String({ minLength: 1 })
}, {
  additionalProperties: false
});
export type AvatarProfileConfigSnapshot =
  Static<typeof AvatarProfileConfigSnapshotSchema>;

/**
 * V4 adds a canonical identity graph and typed relationship buckets. The
 * legacy owners/items/evidence arrays remain on the wire during migration,
 * hence the intentionally open outer read model.
 */
export const AvatarProfileReadModelV4Schema = Type.Object({
  ok: Type.Literal(true),
  contract: Type.Literal('smallverse-beacon-avatar-profile/v4'),
  source: Type.String(),
  avatar: Type.Object({
    avatar_id: ProfileIdSchema,
    owner_id: Type.Union([ProfileIdSchema, Type.Null()]),
    owner_status: Type.Union([
      Type.Literal('observed'),
      Type.Literal('conflicting'),
      Type.Literal('unknown')
    ]),
    sibling_avatar_ids: Type.Array(ProfileIdSchema, {
      uniqueItems: true
    })
  }, {
    additionalProperties: true
  }),
  accounts: Type.Array(AvatarProfileAccountSchema),
  siblingAvatars: Type.Array(AvatarProfileSiblingSchema),
  relationships: AvatarProfileRelationshipsSchema,
  configSnapshots: Type.Array(AvatarProfileConfigSnapshotSchema),
  owners: Type.Array(Type.Unknown()),
  spaces: Type.Array(Type.Unknown()),
  items: Type.Array(Type.Unknown()),
  evidence: Type.Array(Type.Unknown()),
  stats: Type.Object({}, { additionalProperties: true }),
  render_packet: Type.Object({}, { additionalProperties: true }),
  technical: Type.Optional(
    Type.Object({}, { additionalProperties: true })
  )
}, {
  additionalProperties: true
});
export type AvatarProfileReadModelV4 =
  Static<typeof AvatarProfileReadModelV4Schema>;

export const AvatarProfileNotFoundSchema = Type.Object({
  ok: Type.Literal(false),
  error: Type.String(),
  avatar_id: ProfileIdSchema
}, {
  additionalProperties: true
});

export const AvatarProfileReadModelSchema = Type.Union([
  AvatarProfileReadModelV4Schema,
  AvatarProfileNotFoundSchema
]);
export type AvatarProfileReadModel =
  Static<typeof AvatarProfileReadModelSchema>;
