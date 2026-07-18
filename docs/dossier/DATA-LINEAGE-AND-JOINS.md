# Canonical data, schemas, lineage, and joins

## Canonical identifiers

| Identifier | Shape | Entity | Source |
|---|---|---|---|
| owner ID | observed opaque account identifier, commonly 24 hex | one user account | identity/room responses |
| avatar ID | 24 hex | one avatar slot/persona | Find Friends, owner-avatar lookup, RTMP `Avatar.<id>` |
| space ID | commonly 32 hex | one space | Popular/space service and capture context |
| source XML | normalized asset-definition path | one item definition | catalog/XML and observation export |
| object UID | instance-specific opaque identifier | one placed, equipped, inventoried, or listed object | room/item state |
| config digest | SHA-256 | immutable configuration snapshot | decoded config XML |
| asset digest | SHA-256 | immutable PNG/SWF/XML/blob | fetched or generated artifact |

IDs must remain typed. A 24-hex string is not automatically an avatar ID; its field and protocol context determine whether it is an owner or avatar.

## Canonical entity graph

```text
OwnerAccount 1 ──< OwnerAvatarEvidence >── 1 Avatar
Avatar 1 ──< AvatarConfigSnapshot
Avatar 1 ──< AvatarPresenceObservation >── 1 Space
Space 1 ──< RoomCapture
RoomCapture 1 ──< ItemObservation >── 1 ItemInstance
ItemInstance * ── 1 ItemDefinition
ItemInstance 1 ──< ItemVariantSnapshot
Avatar 1 ──< EquippedObservation >── 1 ItemInstance
Space 1 ──< PlacedObservation >── 1 ItemInstance
Space 1 ──< SaleListingObservation >── 1 ItemInstance
```

Equipped, placed, listed, and merely observed are separate relations. They must never be inferred from one another.

## Owner and avatar lineage

### Find Friends path

1. A two-character query is selected by the scheduled query-state tool.
2. The crawler session invokes the recovered Find Friends request shape.
3. The response yields avatar identity fields, exact portrait URLs, and optional location fields. In the five supplied captures, `Person.avatar.id` is the usable avatar ID, the separate `avatarId` property is null, and all 4,085 `Person.user` values are null.
4. `tools/beacon_friend_search_live.py` or `tools/beacon_friend_search_capture_import.py` normalizes rows into `identity_search_results` and `avatar_assets`.
5. `tools/beacon_owner_avatar_identity_graph.py` records owners, avatars, and evidence edges, but Find Friends alone must not create an owner edge unless the retained response actually contains a typed user/account object.
6. Portrait fetching caches immutable local assets and updates an avatar URL index.
7. Publication selects the canonical avatar name and portrait only when they belong to the same avatar ID.

### Owner-to-all-avatars path

1. Start with a proven owner ID.
2. Call the recovered owner-avatar service shape described in the protocol catalog/foundation.
3. Store every returned avatar ID and any explicit selected/default marker.
4. Enrich every avatar independently with name and portrait.
5. Preserve evidence timestamps and source request.
6. Choose a primary avatar only from the recovered explicit `UserAvatar.isDefault`/current-avatar marker. If no current response preserves that marker, show the avatars as peers; do not use array order, most recent observation, or portrait availability as truth.

The protocol meaning of `ownerId` is independently supported: recovered `Item` and `Space` code compares it directly with the signed-in `user.userId`, and captured `avatar.viewMyAvatars` rows expose `avatar_owner_id`. The valid expansion is therefore:

```text
Item.ownerId or Space.ownerId (user/account)
  -> avatarcore.getUsersAvatars(ownerId), captured avatar_owner_id,
     or another typed account-avatar response
  -> exact avatar IDs
  -> Find Friends identity/portrait enrichment for each exact avatar ID
```

Room co-presence, an item owner ID, and a space owner ID never identify which avatar slot was present without that middle account-avatar edge.

### Required public avatar join

```text
avatar_profile.avatar_id
  = canonical_avatar.avatar_id
  = portrait.avatar_id
  = config_snapshot.avatar_id
  = presence.avatar_id
```

The owner link is an additional edge, not a replacement key. A profile cannot borrow a sibling avatar’s name or portrait because the owner matches.

The present identity database does not yet satisfy this model: it contains avatar entities but zero canonical owner-account and owner-avatar evidence rows. `owner_avatar_candidates` contains hypotheses derived from space-panel/co-presence signals; inspection found candidate owners associated with unrelated avatar names. Those rows are backlog hints, not publishable joins.

## Space lineage

1. Popular or another recovered space service returns the space identity and display metadata. A retained historical `catalog_entry.getSpacesForCategory` response proves that Popular rows directly carried ID, name, visitors, owner/default-avatar context, thumbnail, and snapshot; `space.viewPopSpaces` is a second recovered path.
2. Channel lookup provides the live room connection context.
3. A capture receipt binds the room capture to that canonical space ID.
4. The name is retained from the service response or a canonical space-profile response.
5. The image URL is resolved using recovered `Paths.getSpaceIconURL` behavior and the response’s icon/thumbnail/model fields.
6. The image is fetched, hashed, cached, and linked to the space.
7. Avatar, item, and market observations reference that space row through the capture receipt.

Public space eligibility requires a canonical ID, nonempty human-readable name, valid local or verified remote image, and provenance. Raw IDs may remain in technical details, but never substitute for the public label.

Historical databases demonstrate why this must be enforced at ingestion rather than hidden at presentation: upstream Popular rows retained names/images, while the old Observatory `space_summaries` projection retained 24 space rows and zero names. That is a failed canonical join/projection, not absent source data.

## Item-definition and UID lineage

### Definition

- `source_xml` points to the definition document.
- XML fields establish base name, description, type/category, rarity tags, and base asset references.
- Observatory admission is based on the authoritative XML rarity tag (`rare` or `legendary`), not UI category, filename, ownership count, or visual appearance.

### Instance

- `uid` identifies a specific object.
- the observation links UID to definition, configuration, capture, space, and timestamp;
- owner/avatar fields are stored only when present in that event or joined through explicit evidence;
- instance state is never collapsed into the definition row.

### Variant

The variant key must include at least definition identity plus normalized configuration. Two UIDs with identical normalized configurations may share rendered output; two UIDs with different configurations must remain distinguishable even if their base definition is the same.

Readable color/variant labels are derived from decoded configuration semantics. If decoding cannot establish the color, the UI should say `Unresolved variant` and retain the UID in technical details—not repeat the base item name as though it were a variant name.

## Field-level publication lineage

| Public field | Required canonical source | Forbidden fallback |
|---|---|---|
| avatar name | identity result for exact avatar ID | avatar ID, owner display name, sibling name |
| avatar portrait | verified asset for exact avatar ID and variant | unrelated oracle, floating generic head, badge placeholder presented as real |
| owner/account | explicit owner-avatar evidence edge | “observed with” relation |
| primary avatar | explicit selected/default evidence | first row, newest row, richest row |
| space name | canonical space response | raw space ID or filename |
| space image | resolved and verified space asset | generic model image without labeling |
| item name | authoritative definition XML | source filename when XML parsed successfully |
| rarity | authoritative definition XML | hand-maintained showcase classification |
| item owners | explicit owner evidence | avatars observed in the same room |
| equipped items | captured avatar configuration/equipment relation | room-placed or sale-listed objects |
| placed items | room object relation | equipped or inventory membership |
| sale listings | market/listing relation | placement or ownership alone |
| variant label | decoded normalized config | base definition name |
| variant icon | renderer output for normalized config | base icon presented as variant-specific |

## Current PostgreSQL schema

Evidence: **Implemented** in `packages/database/src/migrations/20260710_001_foundation.ts`.

The current migration creates generic infrastructure tables only:

- `sources`: provenance source registry;
- `entities`: generic canonical entity shell;
- `blobs`: content-addressed immutable files;
- `assets`: typed blob metadata;
- `jobs`: retryable worker queue;
- `operator_tokens`: scoped operator credentials;
- `audit_events`: operator action log.

It does **not** yet create the domain graph above. Therefore PostgreSQL is not presently the authoritative product database for owners, avatars, spaces, definitions, instances, observations, configs, variants, captures, or publication generations.

## Transitional SQLite schemas

| Table | Current writer | Purpose |
|---|---|---|
| `identity_search_results` | friend-search live/capture importers | avatar identity, names, owner/location hints |
| `avatar_assets` | several avatar importers | portrait variants and asset hashes |
| `avatar_api_profiles` | avatar API/capture importers | profile response cache |
| `identity_owner_accounts_v1` | owner-avatar graph builder | owner nodes |
| `identity_avatar_entities_v1` | owner-avatar graph builder | avatar nodes |
| `identity_owner_avatar_evidence_v1` | owner-avatar graph builder | typed, sourced owner-avatar edges |
| `avatar_protocol_events` | RTMP probe | decoded protocol events |
| `avatar_appearance_snapshots` | RTMP probe | config snapshot records |
| `avatar_asset_hints` | RTMP probe | discovered portrait/content hints |
| `avatar_wearing_rtmp_events` | wearing sidecar | possible equipped evidence from RTMP |

The repeated definitions of `avatar_assets`, `identity_search_results`, and profile caches are schema drift. Until migrated, every importer must be compared field by field; a shared table name does not guarantee a shared contract.

## Required canonical schema

The production database still needs explicit tables for:

- `owner_accounts`;
- `avatars`;
- `owner_avatar_edges` with evidence and selected/default marker;
- `avatar_identity_observations`;
- `avatar_assets` with variant, hash, URL, status, and provenance;
- `avatar_config_snapshots`;
- `spaces` and `space_assets`;
- `capture_runs`, `room_captures`, and `capture_artifacts`;
- `item_definitions`;
- `item_instances`;
- `item_observations`;
- `equipped_observations`, `placed_observations`, and `sale_listing_observations`;
- `variant_snapshots` and `rendered_variant_assets`;
- `publication_generations` and generation membership;
- `spin_attempts`, `spin_results`, and transaction receipts.

Every observation table needs source, captured time, imported time, capture/run ID, parser version, and raw-artifact reference.

## Publication join rule

Publication is a build, not a request-time repair operation:

1. select one completed evidence cutoff;
2. resolve canonical identities and typed relations;
3. validate required names/images and referential integrity;
4. generate all public projections into a new generation;
5. write counts and hashes to a manifest;
6. atomically switch the current-generation pointer;
7. serve only that immutable generation.

The current legacy API instead reads and merges multiple JSON/SQLite/static sources at request time in `apps/api/src/modules/legacy/data-store.ts` and `profile-builders.ts`. That is the primary reason different pages can disagree and requests can time out.
