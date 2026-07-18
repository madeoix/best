# Smallverse Lab — Source-to-Blueprint Gap Audit

> The supporting protocol catalog, lineage, renderer, runtime, and verification evidence is indexed in [`docs/dossier/README.md`](./dossier/README.md).

**Audit date:** 2026-07-16  
**Source of truth:** [`SMALLVERSE-LAB-BLUEPRINT.md`](./SMALLVERSE-LAB-BLUEPRINT.md)  
**Scope:** repository source, local preserved exports, runtime wiring, collectors, public API, operator API, renderer, and UI  
**Change policy:** this document is an audit only. No application code was changed while producing it.

## 1. Executive finding

The current application does not yet implement the architecture described by the blueprint. It contains many of the required ingredients, but they are connected through a large legacy compatibility layer rather than through one canonical evidence model.

The most important distinction is:

- The **blueprint** describes an evidence system: capture immutable facts, normalize them once, enrich incomplete identities, publish only canonical projections, and render from captured configuration.
- The **current runtime** is a file federation system: independently generated JSON exports are copied locally, read by request handlers, heuristically joined in memory, and interpreted again by UI components.

That difference is the root cause of nearly every visible defect reported so far:

- an avatar name resolves on an item dialog but not on the avatar page;
- avatar heads exist without account ownership or configuration;
- item owners appear with guessed avatars;
- rooms appear without trustworthy room relationships;
- placed, listed, and equipped items become mixed;
- variant icons exist on disk while Observatory reports zero;
- a crawler service can be green while capturing no useful avatar config;
- the renderer can show a preserved PNG or fallback body while claiming reconstruction capability;
- the public UI exposes IDs, empty sections, and contradictory counts because each screen creates a different projection.

This is not primarily a CSS problem. The UI is displaying inconsistent products of inconsistent joins. A facelift without fixing authority, identity, provenance, and publication would only make the contradictions prettier.

## 2. Severity summary

| Severity | Gap | Consequence |
|---|---|---|
| Critical | No canonical operational database | No single authoritative owner/avatar/item/space/config graph exists |
| Critical | Public API is legacy JSON federation | Every request can assemble a different truth from different file generations |
| Critical | Observation records lack relationship keys | Owners, avatars, rooms, equipped items, placed items, and sale listings cannot be joined truthfully |
| Critical | Identity enrichment is not producing owner links | Account → avatars → selected/default avatar is absent |
| Critical | Renderer is a source selector, not a complete config renderer | Head PNGs and captured references can be mistaken for rendered avatars |
| High | Sync is atomic per file, not atomic as a dataset | Files can be individually valid but mutually inconsistent |
| High | Collector health does not prove useful capture | Green timers can yield zero configs and zero canonical entities |
| High | Primary avatar is selected by array order in legacy builders | A throwaway/alternate avatar can be publicly called primary |
| High | Space and portrait provenance is guessed or mislabeled | The UI cannot explain where a name/image/relationship came from |
| High | Observatory monitors obsolete or irrelevant signals | Operator status is not actionable and can contradict real state |
| High | Public routes expose legacy Observatory concepts | Private operations and public product boundaries are blurred |
| Medium | Variant authority is split across assets, visuals, and filesystem counts | Labels and cache counts disagree even when icons exist |
| Medium | Duplicate route/components and inline styling remain | UI behavior and design drift between screens |
| Medium | Placeholder product routes are publicly navigable | Zoltar, receipts, and parts of Spin promise features that are not implemented |
| Operational | Worktree contains a very large uncommitted generated surface | It is difficult to identify the deployable release or reproduce a build |

## 3. What the current data actually says

The local synchronized workspace was measured directly. These numbers are important because they separate “the code has a path for it” from “the pipeline currently produces it.”

### 3.1 Identity and render coverage

| Dataset | Current count | Important qualification |
|---|---:|---|
| Avatar URL index | 1,887 | Only 89 entries mark a verified portrait in that index |
| Identity graph avatars | 1,644 | All 1,644 have names; 1,623 have a local thumbnail |
| Identity graph accounts | 0 | No canonical owner account records |
| Identity avatars with owner association | 0 | No account-to-avatar graph in the synchronized export |
| Render queue configs | 125 | Captured config candidates, not finished public renders |
| RTMP manifest avatars | 11 | Only 11 current manifest entries |

The joins are weaker than the raw totals suggest:

- only **27** render-queue avatar IDs overlap the URL index;
- only **7** render-queue avatar IDs overlap identity-graph avatars;
- all **11** RTMP manifest entries overlap the queue and URL index;
- **0** RTMP manifest entries overlap the current identity graph.

Therefore the application presently has three partially disjoint avatar populations:

1. named avatars with thumbnails;
2. avatars with captured configs;
3. avatars observed in the latest RTMP manifest.

The blueprint requires these to be states of the same canonical `Avatar`, not separate lists that UI code tries to reconcile.

### 3.2 Observation quality

The Observatory export contains:

- 2,673 assets;
- 12,000 observations;
- 1,207 rendered variant visuals.

But the 12,000 observation rows contain:

- 11,982 owner IDs;
- **0 avatar IDs**;
- **0 space IDs**;
- **0 typed relationship/event-context fields**.

That means the dominant evidence export cannot by itself prove:

- which avatar belonging to an owner wore an item;
- whether an item was equipped, placed, or listed for sale;
- which room contained the observation;
- which capture run produced it;
- whether two appearances represent the same UID moving between contexts.

Any screen currently showing those relationships is necessarily borrowing them from another export, guessing them, or using stale cached profile data.

### 3.3 Spaces

The world export has 80 spaces. All 80 currently have a name and a top-level snapshot or thumbnail. However, seven rows include malformed values such as a duplicated `.../uploads/spaces/https://...` URL inside `image_urls`.

The important problem is not lack of display metadata in the world index. It is lack of typed room provenance in observations. The app knows a room exists, but an item observation does not reliably say that it occurred in that room.

### 3.4 Variants

The export contains 1,207 variant visuals and all 1,207 say they are rendered. Of those, 1,195 have a decoded label and 12 do not.

The visible contradictions come from counting and naming different layers:

- asset rows may have an asset-level `variant_icon` field;
- `variant_visuals` contains per-UID rendered outputs;
- Observatory counts filesystem entries in a configured directory;
- the public item profile merges variant rows at request time;
- the UI falls back from decoded label to options, instance name, or “not decoded.”

Thus “variant cache: 0” does not mean there are no rendered variants. It means the operator counter looked in a location or collection different from the one powering the public page.

## 4. Root cause: the declared database is not the product database

### 4.1 The migration is generic infrastructure only

[`packages/database/src/migrations/20260710_001_foundation.ts`](../packages/database/src/migrations/20260710_001_foundation.ts) creates:

- `sources`;
- `entities`;
- `blobs`;
- `assets`;
- `jobs`;
- `operator_tokens`;
- `audit_events`.

It does **not** create the domain tables required by the blueprint:

- owner accounts;
- avatars and owner/avatar membership;
- selected/default avatar evidence;
- immutable avatar config snapshots;
- item definitions and item instances;
- per-UID variant configurations;
- spaces;
- capture runs and room captures;
- equipped, placed, listed, presence, or sale observations;
- source receipts and provenance edges;
- enrichment/publication state.

The generic `entities.metadata` JSON column cannot substitute for explicit relationships without recreating the same weakly typed JSON problem inside PostgreSQL.

### 4.2 The worker is intentionally nonfunctional

[`apps/api/src/entrypoints/worker.ts`](../apps/api/src/entrypoints/worker.ts) is disabled unless explicitly enabled and logs that no production handlers are registered. Its active behavior is a sleep loop.

There is consequently no application worker performing:

- raw receipt ingestion;
- idempotent normalization;
- identity reconciliation;
- missing-name/portrait/config enrichment;
- render scheduling;
- publication-state transitions;
- retries and dead-letter handling;
- freshness or integrity reconciliation.

This leaves shell scripts and export builders as the actual pipeline, with no canonical job lifecycle.

### 4.3 The identity SQLite database is empty and is never synchronized

`.local-data/workspace/identity.sqlite` is zero bytes. The source-correct builder, [`tools/beacon_owner_avatar_identity_graph.py`](../tools/beacon_owner_avatar_identity_graph.py), defines useful evidence tables and correctly distinguishes `isDefault` from lifecycle `active`. But its intended database is not populated in the local source-of-truth snapshot.

Worse, [`scripts/sync-preserved-exports.sh`](../scripts/sync-preserved-exports.sh) explicitly states that no SQLite databases are copied. The architecture therefore creates a canonical-looking identity database on the VPS and then deliberately excludes it from the local runtime, forcing the local API back onto lossy JSON projections.

### Required correction

There must be one operational canonical store, whether PostgreSQL or a deliberately versioned SQLite first step. JSON files should be immutable import receipts or generated public projections—not peer authorities queried and joined by the public API.

Acceptance requires:

1. every canonical domain object has an explicit schema and stable key;
2. every relationship carries provenance and observation time;
3. imports are idempotent;
4. missing enrichment remains an explicit state, never a guessed association;
5. public projections are generated from one committed canonical generation.

## 5. Root cause: contracts exist but are not enforced

[`packages/contracts/src/domain.ts`](../packages/contracts/src/domain.ts) contains much of the desired vocabulary: `OwnerAccount`, `Avatar`, `AvatarConfigSnapshot`, `ItemDefinition`, `ItemInstance`, `Space`, and typed observations.

The active API does not use those contracts as its read model. Instead, legacy builders accept `AnyRecord`, probe many alternate field names, and emit snake-case ad hoc objects.

Specific contradictions include:

- `AvatarSchema.ownerId` is mandatory, while the synchronized graph has zero owner-linked avatars.
- `AvatarConfigSnapshot` expects explicit equipped slots, UIDs, and variant keys, while the queue is still opaque XML/config evidence.
- `Space` expects a canonical snapshot asset, while the world export keeps raw URLs and malformed candidate lists.
- the public catalog contract allows only rare/legendary, but legacy search applies its own XML/flag logic.
- `PrimaryAvatarBasisSchema` allows observation-frequency/manual inference; the blueprint requires authoritative default/selected evidence for a public primary, with inference clearly separated.

### Required correction

The domain contract must sit on both sides of persistence:

`raw receipt → validated normalizer → canonical domain rows → validated public DTO`

Compatibility aliases belong at import boundaries only. They must not remain in public request-time builders.

## 6. Root cause: the public API is a legacy request-time join engine

[`apps/api/src/public-app.ts`](../apps/api/src/public-app.ts) instantiates `LegacyDataStore` and registers `registerLegacyPublicRoutes`. Database registration is used for optional health reporting; public reads do not come from it.

[`apps/api/src/modules/legacy/data-store.ts`](../apps/api/src/modules/legacy/data-store.ts) reads the following as peer inputs:

- `beacon-world-index.json`;
- `observatory-sync.json`;
- `beacon-item-profiles.json`;
- `avatar-url-index.json`;
- `avatar-rtmp-manifest.json`;
- `owner-avatar-identity-graph.json`;
- `beacon-avatar-render-queue.json`.

### 6.1 Expensive joins happen during user requests

An avatar profile loads seven exports concurrently and calls a large builder. An item profile loads cached profiles plus Observatory, world, avatar index, and identity graph. A space profile builds from several files and then repairs missing owners from the item-profile cache.

That design produces three failures:

1. **Latency:** multi-megabyte JSON parsing and large array scans occur on the request path. The frontend aborts after 20 seconds in [`src/lib/runtime/apiClient.js`](../src/lib/runtime/apiClient.js), producing the observed timeout.
2. **Inconsistency:** the cache duration differs by file, so two requests can join different generations.
3. **Semantic drift:** each endpoint implements a different repair path, so one screen resolves a name that another misses.

### 6.2 Presentation-time repair is admitted in source

The space-profile path explicitly uses cached item profiles to repair missing owner joins. That is historical information being promoted during a read request, not canonical reconciliation.

The recent-avatar route filters out records missing names or portraits. Filtering is a useful publication guard, but it does not repair enrichment and should not be confused with pipeline success.

### 6.3 Raw exports remain public API surfaces

The route layer still exposes:

- `/api/beacon/world` as a raw export;
- public `/api/beacon/observatory/*` routes;
- `/api/beacon/avatar/badge`, which can generate a placeholder SVG.

These violate the blueprint boundary: Observatory is private, and a generated badge is not a verified avatar portrait.

### Required correction

Precompute canonical public read models. A public request should perform a bounded indexed lookup, not read several exports and infer a graph. Observatory routes must move behind operator authentication or be replaced by intentionally public catalog DTOs.

## 7. Root cause: legacy profile builders manufacture identity

[`apps/api/src/modules/legacy/profile-builders.ts`](../apps/api/src/modules/legacy/profile-builders.ts) is the highest-risk compatibility component.

### 7.1 Arbitrary aliasing can merge distinct definitions

`sourceAliases()` guesses equivalence between `.xml`, `_item.xml`, and icon-derived names. This is practical for recovery but is not proof of identity. Without a canonical definition-alias table backed by decoded XML, two sources can be conflated.

### 7.2 Primary avatar is selected by order

`buildOwnerRows()` converts an observed set to an array and uses `avatarIds[0]` as `primaryAvatarId`. `buildItemProfile()` later chooses `eligibleIds[0]` and writes it into primary/display fields.

This directly contradicts the blueprint and the user’s account model. An owner can have up to three avatars; the first array element is not evidence that an avatar is default or selected.

### 7.3 Portrait provenance is mislabeled

`portraitFields()` reports `beacon-world-index` whenever a head/thumb/snapshot exists, regardless of whether it came from the URL index, identity graph, friend search, cache, or world data. That destroys provenance and makes debugging impossible.

### 7.4 Incomplete records are hidden rather than enriched

`publicAvatarReady()` and `publicSpaceReady()` suppress incomplete rows. A public eligibility gate is correct, but the missing companion is a reconciliation queue. Today the record simply disappears while another endpoint may still expose its raw ID.

### 7.5 Loose records replace typed relationships

The builder inspects many aliases, owner rows, wearing events, protocol events, cached item profiles, room data, and dirty events. Because the underlying observation lacks typed context, the builder has no authoritative way to distinguish all relationship classes.

### Required correction

Delete identity selection and relationship inference from presentation builders after canonical importers exist. Builders should map already-resolved rows into DTOs, not decide truth.

## 8. Identity pipeline gaps

### 8.1 The intended owner graph exists only as code design

The identity graph builder correctly models:

- owner accounts;
- avatar entities;
- append-only owner/avatar evidence;
- explicit default state;
- explicit selected state;
- integrity warnings for contradictory evidence.

But the synchronized output has 1,644 named avatar entities and zero accounts/owner links. That means portrait/name discovery ran, while owner-to-avatar resolution did not survive into the active projection.

### 8.2 Friend-search service labeling and behavior disagree

[`deploy/systemd/smallverse-avatar-friend-search.service`](../deploy/systemd/smallverse-avatar-friend-search.service) describes a crawler-01 read but executes with `crawler-02`. Its timer description also says crawler-01. Operational documentation therefore cannot be trusted to identify which account is doing the work.

It runs every six hours and limits owner-avatar resolution to 25 owners. That is a bounded probe, not a complete continuously draining enrichment queue.

### 8.3 Primary/default semantics are lost downstream

Even though the graph builder can preserve `isDefault`, the legacy profile builder ignores that evidence and selects the first eligible avatar. The correct information can be captured and still be destroyed at publication.

### Required correction

Identity enrichment needs a persistent state machine:

- `avatar_seen`;
- `name_missing` / `name_resolved`;
- `portrait_missing` / `portrait_verified`;
- `owner_missing` / `owner_resolved`;
- `account_avatar_list_missing` / `resolved`;
- `default_unknown` / `default_verified`;
- `config_missing` / `config_captured`.

Crawler-02 should drain unresolved identity/config states, not merely run a small periodic search whose output is another standalone JSON file.

## 9. Crawler and capture pipeline gaps

### 9.1 Popular selection is real but narrowly bounded

The Popular collector uses live Popular-space data, filters for rooms with visitors, ranks/partitions them, and assigns rooms to crawler profiles. That is aligned with the blueprint.

However, each service invocation is limited to three rooms and runs every 20 minutes. Both crawlers use the same generic collector path; the system does not yet enforce the intended specialization:

- crawler-01: Popular rooms, object UIDs, room context, rare-item evidence;
- crawler-02: unresolved identity/config enrichment and overflow capture.

### 9.2 Service success does not equal useful capture

The collector treats “room had no avatar shared object” as an expected miss. It records the room as missing and allows the service to remain successful unless a true runner failure occurs.

That is valid fault handling, but it makes a green systemd unit insufficient. The operator must see:

- rooms attempted;
- rooms entered;
- rooms with avatar shared objects;
- avatars observed;
- new names/portraits/owner links/configs;
- configs deduplicated;
- objects/UIDs captured;
- failure and miss reasons.

### 9.3 No canonical CaptureRun or RoomCapture exists

Collector state contains bounded lists of completed, missing, and failed room IDs. It is scheduling state, not an immutable receipt. There is no canonical record tying:

`crawler profile + session generation + run + room + raw payload + observed entities + output hashes`

Without that chain, provenance and replay are incomplete.

### 9.4 Resource controls can still overload the VPS

Each Popular collector instance permits up to 1.6 GB and 90% CPU. Two collectors plus Chromium, capture tooling, exports, and render work can overlap. Resource limits constrain individual services, not aggregate pressure.

The architecture needs global concurrency, job locks, backpressure, incremental exports, and explicit scheduling windows. Repeated full Observatory exports should never compete with live crawler browsers.

## 10. Synchronization and release gaps

[`scripts/sync-preserved-exports.sh`](../scripts/sync-preserved-exports.sh) is careful about per-file temporary paths, but the dataset is not synchronized atomically.

### 10.1 Cross-file generations can differ

World, Observatory, variants, thumbnails, item profiles, identity graph, and render queue are copied sequentially. A collector/export can update one remote file between copies. Local files can therefore all be valid but describe different moments.

### 10.2 Lite/full naming obscures the contract

The script may copy a remote `beacon-observatory-lite.json` into local `observatory-sync.json`. The API then reports the source as `observatory-sync.json` regardless of which contract was actually selected.

### 10.3 Mutable transformation occurs after copy

The script rewrites avatar index URLs for local thumbnails and applies live render-queue output into the source tree. The synchronized object is no longer a byte-for-byte receipt of the VPS source.

### 10.4 Checksums do not prove dataset consistency

`SHA256SUMS` covers selected JSON files, not the complete static asset directories, and carries no shared generation/capture watermark. It proves individual bytes, not relational consistency.

### Required correction

The VPS should publish a versioned export bundle:

- immutable generation directory;
- manifest with contract versions, generation ID, source watermarks, row counts, and hashes;
- all JSON projections and referenced static assets;
- final `READY` marker written only after completion.

Local sync should fetch one ready generation and atomically switch a single `current` pointer.

## 11. Renderer gaps

### 11.1 The active resolver selects images; it does not reconstruct an avatar

[`src/lib/avatar-renderer/avatarRenderSource.js`](../src/lib/avatar-renderer/avatarRenderSource.js) collects candidates from:

- calibration documents;
- v4 render contracts;
- v3 bundles;
- body manifests;
- profile URLs.

It then selects the first available full-body, preview, thumbnail, or head image. This is a useful evidence resolver, but it is not the SkyCrypt-style renderer in the blueprint.

### 11.2 “Reconstruction available” is too weak

The resolver sets reconstruction capability when a v4 contract exists and matches the avatar ID. It does not prove:

- config XML parsed successfully;
- every required sprite sheet and asset exists;
- equipped slots resolved;
- variant configs applied;
- animation XML loaded;
- the composite passed a visual or structural check.

### 11.3 The fallback order explains floating heads

When no full-body/preview/thumb exists, the primary becomes `head`. The avatar page can therefore present a headshot as the main avatar visual. That is correct for a portrait directory but false for a “fully rendered avatar” product promise.

### 11.4 The detailed renderer route is dead

`src/routes/avatar-render/[avatarId]/+page.js` immediately redirects to `/avatar/[avatarId]`, so the adjacent detailed renderer page component is not reached through its own route.

### 11.5 Multiple render document generations remain authorities

Calibration v1, contract v4, bundle v3, and body manifest v1 are all consulted. This preserves useful history but leaves no single production render contract.

### Required correction

Separate three products explicitly:

1. **Portrait:** verified game-provided head/thumb PNG.
2. **Captured oracle:** full-body PNG captured from the real Flash client.
3. **Reconstruction:** deterministic render produced from config XML/SWF-derived assets.

A profile may show the portrait while reconstruction is unavailable, but it must label the state honestly. Production reconstruction requires an explicit readiness contract and should never be inferred merely from the presence of one JSON file.

## 12. Item and relationship gaps

### 12.1 Definition, instance, and context are not canonicalized

The blueprint distinguishes:

- item definition (`source_xml`);
- item instance (`uid`);
- variant config for that UID;
- equipped-on-avatar observation;
- placed-in-space observation;
- listed-for-sale observation.

The active Observatory observation lacks avatar, space, and relationship fields. Consequently public profiles cannot make these distinctions solely from primary evidence.

### 12.2 Owner does not equal avatar

An owner ID observed with an item does not identify which of up to three avatars wore it. The current builder may attach the first public-ready avatar for that owner. That can make an item page visually complete while being factually wrong.

### 12.3 Historical caches can masquerade as current context

Cached item profiles are used as repair input for current profile routes. Without an explicit temporal/provenance label, users cannot tell whether an association is live, historical, room placement, sale evidence, or inferred owner association.

### Required correction

Every item relationship must be a typed observation with:

- item instance UID;
- definition source XML;
- relationship type;
- avatar ID and owner ID when equipped;
- space ID when placed/listed;
- price/currency when listed;
- observed-at and ended-at/last-seen;
- capture run and raw receipt reference;
- confidence/authority.

Unknown context belongs in private unresolved evidence, not in a public relationship section.

## 13. Variant pipeline gaps

### 13.1 Current visuals are real, but authority is fragmented

The 1,207 rendered UID visuals prove that the renderer path works for many instances. The remaining problem is canonical linkage and naming.

A variant should resolve by:

`UID → item definition → decoded config/options → stable variant key → rendered icon asset`

Today different surfaces may use:

- decoded label;
- item instance name;
- base item name;
- selected option text;
- a filesystem icon count;
- an asset-level icon field.

That is why one row says a color and another only says “Parka Jacket.” The latter is not a meaningful decoded variant label; it is a fallback leaking through.

### 13.2 Variant cache status is measuring the wrong thing

Operator overview counts directory entries under one workspace path. The public page reads `variant_visuals` from the Observatory export and can also reference synced static icons. Zero in one counter can coexist with rendered icons in another store.

### Required correction

Create one canonical `ItemVariant`/`VariantRender` projection with explicit statuses:

- `config_captured`;
- `decoded`;
- `label_resolved`;
- `render_queued`;
- `rendered`;
- `published`;
- `failed` plus reason.

Base item names must never be displayed as decoded variant names.

## 14. Observatory/operator gaps

[`apps/api/src/modules/operator/overview.ts`](../apps/api/src/modules/operator/overview.ts) is not observing the system described by the blueprint.

It checks:

- obsolete/generic `smallverse-explorer.service` and `smallverse-admin.service`;
- `smallverse-explorer.timer`;
- whether a cookie file contains `JSESSIONID` and `SWSID` strings;
- whether selected JSON files exist;
- directory/file counts.

It does not report:

- crawler-01 and crawler-02 unit/timer status;
- browser/CDP reachability;
- actual authenticated endpoint validation;
- current/last room;
- last successful useful capture;
- rooms attempted/missed/failed;
- new avatars, configs, UIDs, spaces, and variants;
- friend-search progress and unresolved queue depth;
- export generation health;
- CPU, memory, disk, process overlap, or throttling;
- last error with actionable recovery.

This explains the meaningless “Explorer unavailable,” “Admin unavailable,” “timer unknown,” and “variant cache 0” cards. They are not measuring the active pipeline.

### Required correction

Observatory should be an operator workbench with three bounded surfaces:

1. **Live operations:** each crawler, session generation, current job/room, last result, next run, resource use, stop/start/retry.
2. **Enrichment queues:** unresolved names, portraits, owners, defaults, configs, spaces, variants, with reason and retry state.
3. **Capture inspector:** immutable run/room receipts, payload hashes, parsed entities, warnings, and replay action.

No card should exist unless it answers an operator question or supports an action.

## 15. UI and information-architecture gaps

The visual cleanup has begun, but the current app still has multiple design generations and data semantics.

### 15.1 Avatar pages are not yet SkyCrypt-style profiles

They need one coherent hierarchy:

1. verified portrait/full render and avatar name;
2. owner account and sibling avatars;
3. selected/default status with source;
4. current captured configuration by equipment slot;
5. observed locations with room name and image;
6. separate historical placed/listed evidence;
7. compact technical provenance only when requested.

An empty section should not become a large visual panel. Raw IDs should live in a technical disclosure, not serve as primary content.

### 15.2 Relationship interpretation is duplicated in the client

`src/lib/beacon/avatarProfileView.js` reclassifies loose relationship strings. The API should provide typed, already-resolved sections. Client-side interpretation allows spelling and shape differences to misclassify listed items as placed items.

### 15.3 Item surfaces are duplicated

Different item dialog/profile implementations coexist and present different fields. This causes the same entity to have different identity and relationship behavior depending on entry point.

### 15.4 Empty product routes remain in navigation

Zoltar and Receipts are placeholders, and Spin admits that receipt history is not wired. They should be private/disabled until they have real data, or clearly marked as operator experiments rather than product modules.

### 15.5 The UI cannot compensate for missing canonical joins

Cards, lists, and modals are not the principal failure. The same canonical record must drive search results, item profiles, avatar profiles, space profiles, and Observatory inspection. Until then, every redesign will reproduce contradictions.

## 16. Operational and repository gaps

### 16.1 Source and generated state are mixed

The working tree contains extensive modified and untracked code, documentation, generated avatar assets, renders, manifests, and synchronized data. There is no clean, obvious deployable baseline.

Consequences:

- a build cannot easily be reproduced from a known commit;
- generated output can be mistaken for authored source;
- deployment may omit required untracked files;
- rollback and regression attribution are unreliable.

### 16.2 The README still describes transitional authority

[`README.md`](../README.md) says `/opt/smallverse` remains authoritative/read-only and that PostgreSQL/canonical ingestion is later and nonblocking. That statement accurately describes the current transitional runtime but contradicts the blueprint’s target architecture.

### Required correction

Separate:

- authored source;
- reverse-engineering fixtures;
- immutable raw receipts;
- generated projections;
- generated render assets;
- local secrets/session state;
- deploy bundles.

Then establish a clean release commit and a generated-data manifest.

## 17. Why the API times out

The timeout is a symptom with several contributing causes:

1. the frontend aborts requests at 20 seconds;
2. profile endpoints load multiple multi-megabyte JSON files;
3. builders repeatedly scan arrays and construct maps during requests;
4. cache entries can expire together, forcing simultaneous parse work;
5. local API availability and VPS SSH/sync availability have been conflated during testing;
6. the VPS can be resource-starved by overlapping browsers, collectors, and full exports;
7. there is no indexed canonical query path for the requested entity.

Increasing the timeout would conceal the architecture problem. The correct repair is indexed, precomputed read models plus bounded background ingestion and export work.

## 18. Required repair order

The order matters. UI work before these stages will continue to churn.

### Phase 0 — Freeze and inventory

- establish a clean baseline commit;
- classify every generated/local file;
- record current VPS service units and active schedules;
- preserve current raw captures and exports as immutable fixtures;
- stop adding new heuristic joins.

### Phase 1 — Canonical evidence schema

- implement explicit domain tables;
- add capture runs and room captures;
- retain raw payload hashes and provenance;
- model typed temporal relationships;
- implement idempotent import keys and integrity constraints.

### Phase 2 — Import current preserved data

- import world, Observatory, identity, config queue, RTMP manifest, item profiles, and variants as separate source receipts;
- reconcile by stable IDs only;
- record alias claims instead of silently applying them;
- report conflicts and unresolved edges.

### Phase 3 — Enrichment state machine

- make unresolved identity/config/space/variant work persistent;
- assign crawler-01 and crawler-02 explicit responsibilities;
- validate sessions against authenticated endpoints;
- record useful capture metrics;
- add retries, cooldowns, locks, and backpressure.

### Phase 4 — Versioned publication

- generate one public projection generation from canonical rows;
- validate public eligibility and referential integrity;
- publish JSON/assets as one atomic bundle;
- make the API query only that generation or the canonical DB.

### Phase 5 — Renderer contract

- freeze config XML and SWF-derived asset semantics;
- resolve equipment slots and variants;
- implement deterministic animation/frame composition;
- distinguish portrait, captured oracle, and reconstruction;
- publish only verified render outputs.

### Phase 6 — Public UI rebuild

- one entity model across search, item, avatar, and space pages;
- minimal hierarchy instead of nested cards;
- no raw IDs in primary UI;
- no empty sections;
- no unresolved public records;
- consistent item/variant image framing;
- SkyCrypt-style avatar profile backed by real config data.

### Phase 7 — Observatory rebuild

- replace obsolete service checks;
- show active crawler work and useful outcomes;
- expose enrichment queues and capture receipts;
- add safe bounded controls;
- monitor aggregate VPS resource budgets.

## 19. Non-negotiable acceptance rules

The blueprint is not implemented until all of these are true:

1. An avatar returned publicly has a canonical ID, human name, verified portrait, and owner account.
2. An account’s displayed primary/default avatar is backed by explicit selected/default evidence, not array order.
3. An observed space displayed publicly has canonical name and image, and every relationship to it names the capture evidence.
4. An item association explicitly says equipped, placed, or listed; unknown is never silently promoted.
5. An equipped observation identifies the actual avatar, not merely the owner.
6. A variant row identifies the UID, base definition, decoded config, label status, and rendered asset.
7. A renderer never labels a headshot or fallback base body as a fully configured avatar.
8. Every screen reads the same canonical entity projection.
9. Observatory status reflects active crawler units and useful results, not unrelated file existence.
10. A green collector run reports what it captured; zero useful results are visible as zero useful results.
11. Local sync switches one internally consistent generation atomically.
12. Public requests do not scan and join multi-megabyte legacy exports.
13. Raw IDs and incomplete evidence remain private until enriched.
14. Zoltar/Spin use a separate personal-account security boundary from crawler accounts.
15. The VPS has global resource budgets and cannot launch unlimited overlapping heavy work.

## 20. Bottom line

The project has strong recovered assets, working fragments of the SWF/RTMP acquisition path, a substantial variant corpus, many resolved avatar names and thumbnails, live Popular-room collection, and the beginnings of correct domain contracts. The missing piece is not more scraping or more UI components. It is a canonical middle.

Until capture receipts become typed canonical entities and relationships, every downstream feature—profiles, variants, spaces, renderer, Observatory, and UI—will continue to disagree. The next implementation effort should therefore treat the legacy JSON federation as import material, not as the application database.
