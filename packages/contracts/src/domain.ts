import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const BEACON_DOMAIN_CONTRACT_VERSION = '1.0.0' as const;

/**
 * Nominal string types keep identifiers from different Smallverse domains from
 * being accidentally interchanged in TypeScript code. Runtime values remain
 * plain strings on the wire.
 */
type Brand<Value, Name extends string> = Value & {
  readonly __domainBrand: Name;
};

export type OwnerId = Brand<string, 'OwnerId'>;
export type AvatarId = Brand<string, 'AvatarId'>;
export type AvatarConfigSnapshotId = Brand<string, 'AvatarConfigSnapshotId'>;
export type ItemInstanceUid = Brand<string, 'ItemInstanceUid'>;
export type SpaceId = Brand<string, 'SpaceId'>;
export type ObservationId = Brand<string, 'ObservationId'>;
export type AssetId = Brand<string, 'AssetId'>;

const opaqueIdOptions = {
  minLength: 1,
  maxLength: 128,
  pattern: '^[^\\s]+$'
} as const;

export const OwnerIdSchema = Type.Transform(Type.String({
  ...opaqueIdOptions,
  $id: 'OwnerId'
})).Decode((value) => value as OwnerId).Encode((value) => value);
export const AvatarIdSchema = Type.Transform(Type.String({
  ...opaqueIdOptions,
  $id: 'AvatarId'
})).Decode((value) => value as AvatarId).Encode((value) => value);
export const AvatarConfigSnapshotIdSchema =
  Type.Transform(Type.String({
    ...opaqueIdOptions,
    $id: 'AvatarConfigSnapshotId'
  })).Decode((value) => value as AvatarConfigSnapshotId)
    .Encode((value) => value);
export const ItemInstanceUidSchema = Type.Transform(Type.String({
  ...opaqueIdOptions,
  $id: 'ItemInstanceUid'
})).Decode((value) => value as ItemInstanceUid).Encode((value) => value);
export const SpaceIdSchema = Type.Transform(Type.String({
  ...opaqueIdOptions,
  $id: 'SpaceId'
})).Decode((value) => value as SpaceId).Encode((value) => value);
export const ObservationIdSchema = Type.Transform(Type.String({
  ...opaqueIdOptions,
  $id: 'ObservationId'
})).Decode((value) => value as ObservationId).Encode((value) => value);
export const AssetIdSchema = Type.Transform(Type.String({
  ...opaqueIdOptions,
  $id: 'AssetId'
})).Decode((value) => value as AssetId).Encode((value) => value);

export const SourceXmlSchema = Type.String({
  minLength: 1,
  maxLength: 2_048,
  pattern: '^[^\\s?#]+\\.xml$'
});
export type SourceXml = Static<typeof SourceXmlSchema>;

/** RFC 3339 timestamp with an explicit UTC or numeric offset. */
export const DomainDateTimeSchema = Type.String({
  minLength: 20,
  maxLength: 35,
  pattern:
    '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}' +
    '(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$'
});
export type DomainDateTime = Static<typeof DomainDateTimeSchema>;

export const PrimaryAvatarBasisSchema = Type.Union([
  Type.Literal('selected-endpoint'),
  Type.Literal('default-endpoint'),
  Type.Literal('manual')
]);
export type PrimaryAvatarBasis = Static<typeof PrimaryAvatarBasisSchema>;

export const PrimaryAvatarSelectionSchema = Type.Object({
  avatarId: AvatarIdSchema,
  basis: PrimaryAvatarBasisSchema,
  confidence: Type.Integer({ minimum: 0, maximum: 100 }),
  selectedAt: DomainDateTimeSchema
}, {
  additionalProperties: false
});
export type PrimaryAvatarSelection =
  Static<typeof PrimaryAvatarSelectionSchema>;

export const OwnerAvatarEvidenceKindSchema = Type.Union([
  Type.Literal('avatar-owner-field'),
  Type.Literal('get-users-avatars'),
  Type.Literal('selected-avatar-endpoint'),
  Type.Literal('default-avatar-endpoint'),
  Type.Literal('manual-verified')
]);
export type OwnerAvatarEvidenceKind =
  Static<typeof OwnerAvatarEvidenceKindSchema>;

/**
 * An OwnerAccount is the account-level identity. It can currently contain at
 * most three Smallverse avatars. `selectedAvatarId` is captured authority;
 * `primaryAvatar` may be an explicitly labelled inference.
 */
export const OwnerAccountSchema = Type.Object({
  ownerId: OwnerIdSchema,
  displayName: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ]),
  avatarIds: Type.Array(AvatarIdSchema, {
    maxItems: 3,
    uniqueItems: true
  }),
  selectedAvatarId: Type.Union([AvatarIdSchema, Type.Null()]),
  primaryAvatar: Type.Union([PrimaryAvatarSelectionSchema, Type.Null()]),
  firstObservedAt: DomainDateTimeSchema,
  lastObservedAt: DomainDateTimeSchema
}, {
  $id: 'OwnerAccount',
  additionalProperties: false
});
export type OwnerAccount = Static<typeof OwnerAccountSchema>;
/** Account and Owner are the same aggregate in Beacon. */
export const AccountSchema = OwnerAccountSchema;
export type Account = OwnerAccount;

export const AvatarNameStatusSchema = Type.Union([
  Type.Literal('verified'),
  Type.Literal('observed'),
  Type.Literal('unresolved')
]);
export type AvatarNameStatus = Static<typeof AvatarNameStatusSchema>;

export const AvatarSchema = Type.Object({
  avatarId: AvatarIdSchema,
  ownerId: OwnerIdSchema,
  name: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ]),
  nameStatus: AvatarNameStatusSchema,
  thumbnailAssetId: Type.Union([AssetIdSchema, Type.Null()]),
  firstObservedAt: DomainDateTimeSchema,
  lastObservedAt: DomainDateTimeSchema
}, {
  $id: 'Avatar',
  additionalProperties: false
});
export type Avatar = Static<typeof AvatarSchema>;

export const AvatarEquippedItemSchema = Type.Object({
  slot: Type.String({ minLength: 1, maxLength: 128 }),
  itemDefinitionSourceXml: SourceXmlSchema,
  itemInstanceUid: Type.Union([ItemInstanceUidSchema, Type.Null()]),
  variantKey: Type.Union([
    Type.String({ minLength: 1, maxLength: 256 }),
    Type.Null()
  ])
}, {
  additionalProperties: false
});
export type AvatarEquippedItem = Static<typeof AvatarEquippedItemSchema>;

/**
 * Immutable, versioned evidence of one avatar configuration. `rawConfig` is
 * intentionally opaque until the XML/SWF renderer contract is frozen.
 */
export const AvatarConfigSnapshotSchema = Type.Object({
  snapshotId: AvatarConfigSnapshotIdSchema,
  avatarId: AvatarIdSchema,
  capturedAt: DomainDateTimeSchema,
  configSha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  sourceCaptureId: Type.Union([
    Type.String({ minLength: 1, maxLength: 256 }),
    Type.Null()
  ]),
  rawConfig: Type.Record(Type.String(), Type.Unknown()),
  equippedItems: Type.Array(AvatarEquippedItemSchema)
}, {
  $id: 'AvatarConfigSnapshot',
  additionalProperties: false
});
export type AvatarConfigSnapshot =
  Static<typeof AvatarConfigSnapshotSchema>;

export const XmlRaritySchema = Type.Union([
  Type.Literal('unknown'),
  Type.Literal('common'),
  Type.Literal('uncommon'),
  Type.Literal('rare'),
  Type.Literal('legendary')
]);
export type XmlRarity = Static<typeof XmlRaritySchema>;

export const ItemDefinitionSchema = Type.Object({
  sourceXml: SourceXmlSchema,
  displayName: Type.String({ minLength: 1, maxLength: 256 }),
  category: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ]),
  xmlRarity: XmlRaritySchema,
  iconAssetId: Type.Union([AssetIdSchema, Type.Null()])
}, {
  $id: 'ItemDefinition',
  additionalProperties: false
});
export type ItemDefinition = Static<typeof ItemDefinitionSchema>;

export const PublicCatalogItemDefinitionSchema = Type.Object({
  sourceXml: SourceXmlSchema,
  displayName: Type.String({ minLength: 1, maxLength: 256 }),
  category: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ]),
  xmlRarity: Type.Union([
    Type.Literal('rare'),
    Type.Literal('legendary')
  ]),
  iconAssetId: AssetIdSchema
}, {
  $id: 'PublicCatalogItemDefinition',
  additionalProperties: false
});
export type PublicCatalogItemDefinition =
  Static<typeof PublicCatalogItemDefinitionSchema>;

export const ItemInstanceSchema = Type.Object({
  uid: ItemInstanceUidSchema,
  itemDefinitionSourceXml: SourceXmlSchema,
  firstObservedAt: DomainDateTimeSchema,
  lastObservedAt: DomainDateTimeSchema
}, {
  $id: 'ItemInstance',
  additionalProperties: false
});
export type ItemInstance = Static<typeof ItemInstanceSchema>;

export const SpaceSchema = Type.Object({
  spaceId: SpaceIdSchema,
  ownerId: Type.Union([OwnerIdSchema, Type.Null()]),
  displayName: Type.Union([
    Type.String({ minLength: 1, maxLength: 256 }),
    Type.Null()
  ]),
  snapshotAssetId: Type.Union([AssetIdSchema, Type.Null()]),
  firstObservedAt: DomainDateTimeSchema,
  lastObservedAt: DomainDateTimeSchema
}, {
  $id: 'Space',
  additionalProperties: false
});
export type Space = Static<typeof SpaceSchema>;

export const ObservationProvenanceSchema = Type.Object({
  sourceKey: Type.String({ minLength: 1, maxLength: 128 }),
  captureId: Type.Union([
    Type.String({ minLength: 1, maxLength: 256 }),
    Type.Null()
  ]),
  crawlerId: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ]),
  evidenceSha256: Type.Union([
    Type.String({ pattern: '^[a-f0-9]{64}$' }),
    Type.Null()
  ])
}, {
  additionalProperties: false
});
export type ObservationProvenance =
  Static<typeof ObservationProvenanceSchema>;

/**
 * One exact owner -> avatar membership edge. Co-presence, matching names, and
 * observation frequency are deliberately not valid evidence kinds.
 */
export const OwnerAvatarRelationshipSchema = Type.Object({
  ownerId: OwnerIdSchema,
  avatarId: AvatarIdSchema,
  relationship: Type.Literal('account-avatar'),
  evidenceKind: OwnerAvatarEvidenceKindSchema,
  observedAt: DomainDateTimeSchema,
  provenance: ObservationProvenanceSchema
}, {
  $id: 'OwnerAvatarRelationship',
  additionalProperties: false
});
export type OwnerAvatarRelationship =
  Static<typeof OwnerAvatarRelationshipSchema>;

const temporalObservationFields = {
  observationId: ObservationIdSchema,
  observedAt: DomainDateTimeSchema,
  validFrom: DomainDateTimeSchema,
  validTo: Type.Union([DomainDateTimeSchema, Type.Null()]),
  confidence: Type.Integer({ minimum: 0, maximum: 100 }),
  provenance: ObservationProvenanceSchema
};

export const EquippedObservationSchema = Type.Object({
  ...temporalObservationFields,
  relationship: Type.Literal('equipped'),
  avatarId: AvatarIdSchema,
  itemDefinitionSourceXml: SourceXmlSchema,
  itemInstanceUid: Type.Union([ItemInstanceUidSchema, Type.Null()]),
  /**
   * A wearing packet and a whole-avatar config snapshot are independent RTMP
   * evidence streams. Keep this null unless the capture explicitly linked the
   * two; matching only on avatar id or capture time is not authoritative.
   */
  avatarConfigSnapshotId: Type.Union([
    AvatarConfigSnapshotIdSchema,
    Type.Null()
  ]),
  /** Older wearing packets identify the UID/model but do not expose a slot. */
  slot: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ])
}, {
  $id: 'EquippedObservation',
  additionalProperties: false
});
export type EquippedObservation =
  Static<typeof EquippedObservationSchema>;

export const PlacedObservationSchema = Type.Object({
  ...temporalObservationFields,
  relationship: Type.Literal('placed'),
  spaceId: SpaceIdSchema,
  itemDefinitionSourceXml: SourceXmlSchema,
  itemInstanceUid: ItemInstanceUidSchema
}, {
  $id: 'PlacedObservation',
  additionalProperties: false
});
export type PlacedObservation = Static<typeof PlacedObservationSchema>;

export const ListingPriceSchema = Type.Object({
  amountMinorUnits: Type.String({ pattern: '^(?:0|[1-9]\\d*)$' }),
  currency: Type.String({ minLength: 1, maxLength: 64 })
}, {
  additionalProperties: false
});
export type ListingPrice = Static<typeof ListingPriceSchema>;

export const ListedForSaleObservationSchema = Type.Object({
  ...temporalObservationFields,
  relationship: Type.Literal('listed-for-sale'),
  spaceId: SpaceIdSchema,
  sellerOwnerId: Type.Union([OwnerIdSchema, Type.Null()]),
  itemDefinitionSourceXml: SourceXmlSchema,
  itemInstanceUid: ItemInstanceUidSchema,
  listingId: Type.Union([
    Type.String({ minLength: 1, maxLength: 128 }),
    Type.Null()
  ]),
  price: Type.Union([ListingPriceSchema, Type.Null()])
}, {
  $id: 'ListedForSaleObservation',
  additionalProperties: false
});
export type ListedForSaleObservation =
  Static<typeof ListedForSaleObservationSchema>;

export const TemporalObservationSchema = Type.Union([
  EquippedObservationSchema,
  PlacedObservationSchema,
  ListedForSaleObservationSchema
], {
  $id: 'TemporalObservation'
});
export type TemporalObservation = Static<typeof TemporalObservationSchema>;

export interface DomainValidationIssue {
  path: string;
  message: string;
}

export type DomainValidationResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; issues: DomainValidationIssue[] };

function validateStructure<Schema extends TSchema>(
  schema: Schema,
  input: unknown
): DomainValidationResult<Static<Schema>> {
  if (Value.Check(schema, input)) {
    return { ok: true, value: input as Static<Schema> };
  }

  return {
    ok: false,
    issues: [...Value.Errors(schema, input)].map((error) => ({
      path: error.path || '/',
      message: error.message
    }))
  };
}

function invalid(
  path: string,
  message: string
): DomainValidationResult<never> {
  return { ok: false, issues: [{ path, message }] };
}

function isRealDateTime(value: string): boolean {
  const dateTimePattern =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;
  const match = dateTimePattern.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText,
    secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? '0');
  const offsetMinute = Number(offsetMinuteText ?? '0');

  if (hour > 23 || minute > 59 || second > 59 ||
      offsetHour > 23 || offsetMinute > 59) {
    return false;
  }

  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day &&
    Number.isFinite(Date.parse(value));
}

function validateEntityTimes<Value extends {
  firstObservedAt: string;
  lastObservedAt: string;
}>(value: Value): DomainValidationResult<Value> {
  if (!isRealDateTime(value.firstObservedAt)) {
    return invalid('/firstObservedAt', 'must be a real RFC 3339 timestamp');
  }
  if (!isRealDateTime(value.lastObservedAt)) {
    return invalid('/lastObservedAt', 'must be a real RFC 3339 timestamp');
  }
  if (Date.parse(value.lastObservedAt) < Date.parse(value.firstObservedAt)) {
    return invalid(
      '/lastObservedAt',
      'must be at or after firstObservedAt'
    );
  }
  return { ok: true, value };
}

export function validateOwnerAccount(
  input: unknown
): DomainValidationResult<OwnerAccount> {
  const result = validateStructure(OwnerAccountSchema, input);
  if (!result.ok) return result;

  const value = result.value;
  if (value.selectedAvatarId !== null &&
      !value.avatarIds.includes(value.selectedAvatarId)) {
    return invalid(
      '/selectedAvatarId',
      'must refer to an avatar in avatarIds'
    );
  }
  if (value.primaryAvatar !== null &&
      !value.avatarIds.includes(value.primaryAvatar.avatarId)) {
    return invalid(
      '/primaryAvatar/avatarId',
      'must refer to an avatar in avatarIds'
    );
  }
  if (value.primaryAvatar !== null &&
      !isRealDateTime(value.primaryAvatar.selectedAt)) {
    return invalid(
      '/primaryAvatar/selectedAt',
      'must be a real RFC 3339 timestamp'
    );
  }
  return validateEntityTimes(value);
}

export const validateAccount = validateOwnerAccount;

export function validateAvatar(
  input: unknown
): DomainValidationResult<Avatar> {
  const result = validateStructure(AvatarSchema, input);
  if (!result.ok) return result;

  const value = result.value;
  if (value.nameStatus === 'unresolved' && value.name !== null) {
    return invalid('/name', 'must be null when nameStatus is unresolved');
  }
  if (value.nameStatus !== 'unresolved' && value.name === null) {
    return invalid('/name', 'is required for a verified or observed name');
  }
  return validateEntityTimes(value);
}

export function validateAvatarConfigSnapshot(
  input: unknown
): DomainValidationResult<AvatarConfigSnapshot> {
  const result = validateStructure(AvatarConfigSnapshotSchema, input);
  if (!result.ok) return result;
  if (!isRealDateTime(result.value.capturedAt)) {
    return invalid('/capturedAt', 'must be a real RFC 3339 timestamp');
  }
  return result;
}

export function validateOwnerAvatarRelationship(
  input: unknown
): DomainValidationResult<OwnerAvatarRelationship> {
  const result = validateStructure(OwnerAvatarRelationshipSchema, input);
  if (!result.ok) return result;
  if (!isRealDateTime(result.value.observedAt)) {
    return invalid('/observedAt', 'must be a real RFC 3339 timestamp');
  }
  return result;
}

export function validateItemDefinition(
  input: unknown
): DomainValidationResult<ItemDefinition> {
  return validateStructure(ItemDefinitionSchema, input);
}

export function validatePublicCatalogItemDefinition(
  input: unknown
): DomainValidationResult<PublicCatalogItemDefinition> {
  return validateStructure(PublicCatalogItemDefinitionSchema, input);
}

export function validateItemInstance(
  input: unknown
): DomainValidationResult<ItemInstance> {
  const result = validateStructure(ItemInstanceSchema, input);
  return result.ok ? validateEntityTimes(result.value) : result;
}

export function validateSpace(
  input: unknown
): DomainValidationResult<Space> {
  const result = validateStructure(SpaceSchema, input);
  return result.ok ? validateEntityTimes(result.value) : result;
}

export function validateTemporalObservation(
  input: unknown
): DomainValidationResult<TemporalObservation> {
  const result = validateStructure(TemporalObservationSchema, input);
  if (!result.ok) return result;

  const value = result.value;
  if (!isRealDateTime(value.observedAt)) {
    return invalid('/observedAt', 'must be a real RFC 3339 timestamp');
  }
  if (!isRealDateTime(value.validFrom)) {
    return invalid('/validFrom', 'must be a real RFC 3339 timestamp');
  }
  if (value.validTo !== null && !isRealDateTime(value.validTo)) {
    return invalid('/validTo', 'must be a real RFC 3339 timestamp');
  }
  if (value.validTo !== null &&
      Date.parse(value.validTo) <= Date.parse(value.validFrom)) {
    return invalid('/validTo', 'must be later than validFrom');
  }
  return result;
}

/**
 * Public catalog membership is deliberately derived, never caller supplied.
 * Common outfit pieces remain valid ItemDefinitions and equipped observations,
 * but only XML-derived rare/legendary definitions pass this boundary.
 */
export function isPublicCatalogEligible(
  item: ItemDefinition
): item is PublicCatalogItemDefinition {
  return (item.xmlRarity === 'rare' || item.xmlRarity === 'legendary') &&
    item.iconAssetId !== null;
}
