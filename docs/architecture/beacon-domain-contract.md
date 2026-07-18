# Beacon domain contract v1

Status: frozen for implementation  
Contract version: `1.0.0`  
Runtime schemas: `packages/contracts/src/domain.ts`

This contract separates Smallverse identity, immutable evidence, and public
presentation. Importers may normalize older data into this model, but public
and operator features should not invent alternate meanings for these fields.

## Canonical hierarchy

```text
OwnerAccount
├── selected avatar (captured fact, when available)
├── primary avatar (explicitly labelled fact or inference)
└── 0..3 Avatars
    ├── name and thumbnail identity
    └── immutable AvatarConfigSnapshots

ItemDefinition (source XML)
└── ItemInstance (observed UID)

Space

TemporalObservation
├── equipped: Avatar → ItemDefinition [→ optional ItemInstance]
│   └── optional exact AvatarConfigSnapshot link
├── placed: Space → ItemInstance → ItemDefinition
└── listed-for-sale: Space → ItemInstance → ItemDefinition
```

An owner account and an owner are the same aggregate. An avatar is not an
owner, and an avatar ID must never be displayed as though it were an avatar
name. One account can retain up to three avatars rather than collapsing every
observation onto whichever avatar was seen first.

`selectedAvatarId` records an authoritative selected-avatar response.
`primaryAvatar` carries a basis and confidence so an observation-frequency
inference cannot masquerade as an authoritative selection.

## Entities and evidence

| Contract | Identity | Important rule |
| --- | --- | --- |
| `OwnerAccount` | `ownerId` | Selected and primary avatars must belong to `avatarIds`. |
| `Avatar` | `avatarId` | Belongs to exactly one owner in this contract. Names carry a resolution status. |
| `AvatarConfigSnapshot` | `snapshotId` | Immutable config evidence identified by SHA-256 and capture time. |
| `ItemDefinition` | `sourceXml` | Describes the XML definition, not a unique copy. |
| `ItemInstance` | `uid` | Describes one observed copy and does not carry timeless ownership. |
| `Space` | `spaceId` | May have a known owner and snapshot, independently of observed contents. |
| `TemporalObservation` | `observationId` | Carries provenance, confidence, and a half-open validity interval. |

All entity `firstObservedAt`/`lastObservedAt` ranges are ordered. Observation
validity uses `[validFrom, validTo)`; `validTo: null` means no later evidence
has closed that relationship yet. It does **not** guarantee that the state is
still true.

Item ownership and location are evidence over time, not permanent properties
of an `ItemInstance`. They must be recovered by querying typed observations.
This prevents a UID last seen for sale from silently remaining equipped or
placed forever.

## Catalog boundary versus renderer input

The public Beacon item catalog is deliberately narrower than the renderer:

- `xmlRarity: rare` and `xmlRarity: legendary` are catalog eligible.
- `unknown`, `common`, and `uncommon` are not catalog eligible.
- Eligibility is derived by `isPublicCatalogEligible`; callers cannot supply
  or override an eligibility boolean.
- Avatar config snapshots and `equipped` observations accept every XML rarity.
  Common body and clothing definitions are necessary to reconstruct a complete
  avatar but must not leak into the rare-item catalog.

Price, popularity, crawler frequency, a rendered icon, or manual UI promotion
does not make an item catalog eligible under v1. If that product rule changes,
it requires a new contract version rather than a hidden query exception.

## Relationship meanings

### `equipped`

Two captured paths can prove this relationship: a whole-avatar config can name
an equipment selection, or an RTMP `avatar_wearing_uid` / explicitly equipped
init packet can name the avatar, item UID, and item XML directly. The UID and
slot are therefore nullable. `avatarConfigSnapshotId` is also nullable and may
be set only when the capture explicitly linked that wearing event to that exact
snapshot. Joining two records merely because they share an avatar ID or nearby
timestamps is forbidden.

Current captured body `<avatar>` configs expose option selections such as body,
face, and default clothing keys, but they do not consistently carry the unique
item UID or a canonical item XML for every option. Conversely, wearing packets
often carry UID/XML without a body-snapshot ID or slot. This is an irreducible
capture gap, not permission to infer a join. Beacon keeps the two evidence
streams independently until a future packet or recovered SWF mapping proves the
connection.

### `placed`

A unique item UID was observed as an object placed inside a space. This is not
proof that a currently present avatar owns or wears it.

### `listed-for-sale`

A unique item UID was observed in a sale listing associated with a space.
Seller and price can be unknown, but the relationship is never folded into
`placed` or `equipped` merely for display convenience.

## Read-model rules

Public pages are projections of this contract rather than additional sources
of truth:

- An avatar profile joins its avatar, owner account, latest config snapshot,
  equipped observations, rare-item observations, and space observations.
- An item profile groups observations by UID and keeps relationship type and
  observation time visible.
- A space profile presents placed items and sale listings separately.
- The public catalog starts from eligible `ItemDefinition` rows, not every
  definition encountered while rendering an outfit.
- The private Observatory may expose raw provenance and incomplete records;
  public profiles should label uncertainty and omit unresolved IDs as names.

## Validation boundary

All new API, importer, and persistence boundaries should validate normalized
records with the exported `validate*` functions before accepting them. The
schemas reject extra fields so accidental legacy flags cannot silently become
part of the canonical model. Source-specific raw payloads remain outside these
contracts and are preserved separately as evidence.
