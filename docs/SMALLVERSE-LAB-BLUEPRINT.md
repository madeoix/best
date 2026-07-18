# Smallverse Lab: Product and Architecture Blueprint

> Source-indexed implementation and reverse-engineering details are maintained in [`docs/dossier/README.md`](./dossier/README.md).

Protocol-level companion reference: [Smallverse Protocol and Crawler Foundation](./SMALLVERSE-PROTOCOL-AND-CRAWLER-FOUNDATION.md).

Status: canonical project direction  
Purpose: define what Smallverse Lab is, what each subsystem means, how its data is formatted, what is currently wrong, and what “finished” means.

## 1. What this project is

Smallverse Lab is a preservation, indexing, reconstruction, and exploration platform for SmallWorlds.

It must:

1. Operate authenticated, isolated SmallWorlds crawler accounts.
2. Observe live Popular spaces and their occupants.
3. Capture raw game protocol evidence.
4. Resolve owners, avatars, names, portraits, spaces, objects, and item variants.
5. Preserve evidence without inventing relationships.
6. Convert observations into canonical entities.
7. Reconstruct avatars and item variants using recovered XML and SWF behavior.
8. Publish a clean public interface called Beacon.
9. Provide a private operations interface called Observatory.
10. Keep Spin and Zoltar automation separate from crawler accounts.

The system is:

```text
SmallWorlds game
    ↓
VPS crawlers and protocol capture
    ↓
Evidence preservation and enrichment
    ↓
Canonical Smallverse knowledge graph
    ↓
Beacon public UI + Observatory private UI
```

The product goal is a SkyCrypt-inspired SmallWorlds explorer: users see resolved identities, imagery, appearance, equipment, rare items, spaces, variants, and history. Raw identifiers, capture files, XML paths, and operational uncertainty stay behind the scenes.

## 2. Product areas

### 2.1 Beacon

Beacon is the public application. It answers:

- What is this rare item?
- Which UID variants have been observed?
- Which avatars were explicitly observed with it?
- Where was it placed or listed for sale?
- Who is this avatar?
- What did the avatar look like?
- Which items were equipped?
- Which spaces did the avatar visit?
- What rare objects appeared in a space?

Beacon must not require users to understand owner IDs, avatar IDs, space IDs, source XML, RTMP packets, hashes, services, or queues. Those belong in technical disclosures or Observatory.

### 2.2 Observatory

Observatory is the private operator surface. It must answer:

- Are crawler-01 and crawler-02 authenticated?
- What is each crawler currently doing?
- Which room or query is active?
- When did every stage last succeed?
- How many avatars, spaces, objects, variants, configs, and portraits were captured?
- Which identities and spaces remain unresolved?
- Which configurations could not be correlated?
- Is the VPS under memory, disk, or CPU pressure?
- Why did a job fail?
- When is the next scheduled run?
- Can the operator pause, resume, run, renew, or open an interactive VPS login?

Observatory must be an operational timeline and control surface, not a collection of generic unavailable cards.

### 2.3 Items

Items is the public rare-item catalog.

Public eligibility comes only from XML rarity:

- `rare`: eligible;
- `legendary`: eligible;
- `common`, `uncommon`, and `unknown`: not eligible.

Common items may still be valid avatar renderer inputs. That does not promote them into Beacon’s rare-item catalog.

An item profile should contain:

- canonical name and description;
- XML rarity and category;
- base icon;
- known copies/UIDs;
- exact UID-specific variants;
- readable decoded variant configuration;
- exact rendered variant icon;
- avatars explicitly observed wearing it;
- spaces where it was placed;
- spaces where it was listed for sale;
- observation history;
- technical evidence behind one disclosure.

### 2.4 Avatars

The avatar directory contains complete public identities. A public avatar requires:

- internal avatar ID;
- human-readable avatar name;
- valid portrait PNG;
- owner relationship when resolved;
- source evidence.

No blank portrait or raw avatar ID may appear as a public identity.

The directory should support name search and filters such as recently observed, configuration captured, fully renderable, account resolved, and Popular-space sightings.

### 2.5 Avatar profiles

An avatar profile should be the SmallWorlds equivalent of a SkyCrypt profile.

It should show:

- avatar name;
- portrait;
- complete reconstructed avatar;
- animation selector;
- latest authoritative captured configuration;
- equipment arranged by slot;
- readable item variants;
- sibling avatars belonging to the same account;
- observed spaces;
- rare equipped items;
- placed/listed evidence in separate sections;
- last observation time;
- confidence or historical state where necessary.

It must not lead with a floating head, raw IDs, hashes, empty panels, or diagnostics.

### 2.6 Spaces

A complete public space requires:

- internal space ID;
- canonical space name;
- preview/snapshot PNG;
- owner when explicitly known;
- Popular ranking/status;
- player population at capture;
- observation time;
- avatars present;
- objects placed;
- sale listings.

Useful browse modes include Popular now, recently observed, markets, historically active spaces, rare-item locations, and spaces with captured avatar activity.

### 2.7 Search

Search is the unified entry point for items, avatars, spaces, tags, rarity, and optionally exact UIDs as an advanced query. Results must be compact, clearly typed, and human-readable.

### 2.8 Spin

Spin automates the SmallWorlds spin wheel using its recovered SWF-compatible request. It is separate from crawler accounts and may use a personal authorized session.

It records execution, result, price/transaction evidence, receipts, errors, and safe retry state.

### 2.9 Zoltar

Zoltar is another personal-account workflow. It has its own session, execution state, controls, receipt history, and failure reporting. It must not depend on crawler-01 or crawler-02.

### 2.10 Receipts

Receipts preserve controlled operations such as Spin, Zoltar, and transactions. A receipt contains operation, timestamp, session label, status, result, transaction references, evidence reference, and failure reason.

## 3. Runtime architecture

### 3.1 Svelte frontend

The frontend lives under `src/routes`, `src/lib/components`, `src/lib/beacon`, `src/lib/avatar-renderer`, and `src/lib/styles`.

It is a SvelteKit static SPA providing public routes, private Observatory routes, browser avatar rendering, and desktop-aware controls.

### 3.2 Tauri desktop boundary

The desktop implementation lives under `src-tauri` and securely provides capabilities that normal browser JavaScript must not have:

- GNOME Keyring access;
- crawler credential storage;
- SSH communication with the VPS;
- opening the VPS-hosted login screen;
- crawler controls;
- private operator API access;
- allowlisted local tools;
- local session information.

Crawler passwords and unrestricted commands never belong in browser JavaScript.

### 3.3 Public API

The public Fastify API is read-only. It serves items, avatars, spaces, profiles, public health, and preserved Spin information. It must not expose credentials, trigger crawlers, perform live authenticated requests, or publish incomplete identities.

### 3.4 Operator API

The private Fastify operator API provides authenticated status, service controls, audit logs, session import, controlled actions, and private health information.

### 3.5 Worker

The worker is intended to become the authoritative ingestion and enrichment process. Its current lack of a complete durable enrichment workflow is one of the project’s primary architectural gaps.

## 4. VPS crawler architecture

### 4.1 crawler-01

Primary responsibility:

- fetch authentic Popular-space listings;
- enter occupied Popular rooms;
- capture room identity;
- capture avatars present;
- capture object UIDs;
- capture item XML and configuration evidence;
- record placed and listed items;
- feed general preservation.

Every room visit should produce:

```text
RoomCapture
├── capture run and crawler profile
├── Popular rank/population
├── space ID, name, and image
├── avatars present
├── object UIDs
├── placed objects
├── sale listings
├── protocol evidence
└── timestamps and provenance
```

### 4.2 crawler-02

Primary responsibility:

- avatar discovery;
- bounded Find Friends two-letter rotation;
- owner resolution;
- `getUsersAvatars` account expansion;
- default-avatar evidence;
- portrait URL capture and local caching;
- populated-room avatar configuration capture;
- render-queue enrichment.

Being logged in or having an active timer does not prove productivity. Every run must report actual outputs.

### 4.3 Session flow

```text
Beacon desktop
    ↓ encrypted credential lookup
SSH to VPS
    ↓
isolated crawler profile
    ↓
SmallWorlds login
    ↓
JSESSIONID + SWSID captured
    ↓
crawler services use refreshed session
```

When interactive verification is required, the SmallWorlds screen remains on the VPS and is viewed through a private tunnel/noVNC connection. The user solves the challenge manually; cookies remain on the VPS.

### 4.4 Scheduled services

The repository includes services/timers for Popular crawling, avatar harvest, Find Friends, and portrait refresh. Every service requires resource limits, bounded runtime, idempotent execution, per-run receipts, explicit success/failure state, overlap protection, and bounded exports.

## 5. Recovered SWF and protocol layer

Recovered SWFs are the authority for reproducing real game behavior rather than inventing replacement requests.

They inform:

- Find Friends AMF calls;
- `getUsersAvatars`;
- Popular-space requests;
- Spin/Zoltar operations;
- avatar configuration decoding;
- item color transforms;
- sprite animation;
- avatar composition;
- variant icon rendering.

This layer documents protocol and renderer behavior. It is not itself the public database.

## 6. Canonical domain model

### OwnerAccount

Identity: `ownerId`.

Contains zero to three avatar IDs, authoritative default avatar when captured, explicit selected avatar when captured, an optional inferred display avatar, and account-level history.

The first, latest, or most frequently observed avatar must never automatically become the primary avatar.

### Avatar

Identity: `avatarId`.

Contains owner relationship, human-readable name, portrait references, body/gender information, immutable configuration snapshots, and observation history. An avatar ID is never a display name.

### AvatarConfigSnapshot

An immutable captured avatar state containing snapshot ID, avatar ID, explicit owner correlation where available, sanitized configuration XML, hash, capture time, space, body/gender, selected outfit options, and provenance.

Snapshots may not be joined to avatars using timestamp proximity alone.

### ItemDefinition

Identity: source XML. Describes the item type: name, description, rarity, category, base icon, and renderer metadata. It is not a unique copy.

### ItemInstance

Identity: UID. Represents one observed copy and links to its item definition, decoded configuration, variant identity, and temporal observations. A UID does not carry timeless ownership or placement.

### ItemVariant

```text
ItemVariant
├── item definition
├── observed UID
├── decoded options/config
├── normalized signature
├── readable variant name
├── rendered icon
├── render key/status
└── source evidence
```

A variant must not use the base item name when its distinguishing configuration is unresolved.

### Space

Identity: `spaceId`. Contains canonical name, image, explicit owner where available, Popular observations, population, and capture history.

### CaptureRun and RoomCapture

`CaptureRun` records one bounded crawler execution. `RoomCapture` correlates all evidence gathered in one room visit.

### TemporalObservation

Represents evidence-backed relationships over time: equipped, placed, listed for sale, avatar present in space, UID observed, and owner/avatar membership. It includes provenance, capture ID, timestamps, confidence, validity, and relationship type.

## 7. Relationship meanings

### Equipped

An avatar configuration or explicit wearing packet proves the item was worn. Room proximity is not enough.

### Placed

A UID was observed as an object in a space. It does not prove that a present avatar owns or wears it.

### Listed for sale

A UID appeared in a sale listing. It stays separate from placed and equipped evidence.

### Observed together

An avatar and item appeared in the same capture context. This weak relationship must not be promoted to ownership or equipment.

## 8. Storage formats

### Raw evidence

RTMP packets, AMF payloads, Fiddler captures, SWFs, sanitized XML, original metadata, and evidence hashes remain immutable.

### SQLite sidecars

SQLite stores bounded append-only operational evidence such as identity graphs, wearing events, and observations while canonical PostgreSQL ingestion remains incomplete.

### JSON projections

Current projections include world index, avatar URL index, RTMP manifest, avatar render queue, owner/avatar identity graph, item profiles, and the bounded Observatory export. They are projections, not competing authorities.

### Static assets

Same-origin static assets include item icons, UID variant icons, avatar portraits/renders, space images, and renderer assets. External acquisition URLs remain evidence rather than public fallbacks.

### PostgreSQL target

The long-term canonical database should import preserved evidence, generate normalized entities, shadow-read against current projections, cut over endpoint by endpoint, and retain temporary JSON rollback artifacts until reconciliation completes.

## 9. Avatar renderer

The renderer supports XML animation compilation, body composition, equipment resolution, material/color transforms, head features and morphs, O3D parsing, Three.js meshes, Flash oracle comparison, and Idle/Walk/Wave planning.

Source authority order:

1. Captured authentic Flash output.
2. Captured avatar configuration XML.
3. Recovered avatar animation XML.
4. Recovered SWF material/color behavior.
5. Preserved sprite assets.
6. Experimental O3D reconstruction.

The current renderer works with known fixtures but cannot reliably render arbitrary live avatars when authoritative configs, fragments, variant options, offsets, sprite sheets, or explicit identity correlation are missing.

A production render must include head, body, skin, face, hair, clothing, shoes, accessories, exact variants, transparent background, and verified animations.

## 10. UI formatting rules

### Public visual language

- minimal dark interface;
- strong typography;
- restrained teal accent;
- flat sections and thin separators;
- purposeful spacing;
- very few containers;
- no nested cards;
- no empty diagnostic panels;
- no unexplained numbers;
- no raw IDs in primary content.

### Public page hierarchy

```text
Identity hero
    ↓
Most important visual/state
    ↓
Primary relationships
    ↓
History/context
    ↓
Optional technical evidence
```

### Empty states

Empty states identify the missing pipeline stage, for example “Configuration capture is pending,” rather than generic “unknown” or “unavailable” language.

### Observatory formatting

Observatory shows VPS health, crawler state, current work, last run, next run, output counts, unresolved queues, failures, and controls. Each crawler view includes authentication, current work, last result, and run/pause/resume/login actions.

## 11. Source-code atlas

This section identifies the actual source files that power Smallverse Lab. It is the map to use before changing behavior. Generated `build/`, `dist/`, cached PNGs, exported JSON, capture archives, and backup files are outputs or evidence; they are not the implementation authority.

### 11.1 Application entry points

| Layer | Source | Responsibility |
|---|---|---|
| Web application | `src/routes/**`, `src/lib/**`, `src/app.css` | SvelteKit public and private interfaces |
| Desktop shell | `src-tauri/src/**`, `src-tauri/tauri.conf.json` | Tauri window, secure operator bridge, local process control |
| Public API | `apps/api/src/entrypoints/public.ts` | Starts the read-only Beacon API |
| Operator API | `apps/api/src/entrypoints/operator.ts` | Starts authenticated Observatory actions and status |
| Worker | `apps/api/src/entrypoints/worker.ts` | Background application jobs; not the authority for VPS crawler timers |
| Shared contracts | `packages/contracts/src/**` | Runtime schemas and TypeScript domain contracts |
| Database | `packages/database/src/**` | Canonical schema, migrations, database access |
| VPS collectors | `session/**`, `tools/**`, `deploy/systemd/**` | Authentication, protocol calls, room capture, enrichment, and exports |

The root `package.json` is the executable index for local development, tests, builds, migrations, desktop packaging, production audits, and deployment verification. `scripts/dev-runtime.mjs` starts the local services; `scripts/check-runtime-boundaries.mjs` protects public/operator boundaries; the `production-*` and `verify-*` scripts govern release safety.

### 11.2 Public route source

The route files decide which product surface is visible:

| URL | Source | Primary implementation |
|---|---|---|
| `/` | `src/routes/+page.svelte` | `src/lib/components/home/BeaconHome.svelte` |
| `/items` | `src/routes/items/+page.svelte` | `src/lib/components/atlas/ItemsAtlas.svelte` |
| `/avatars` | `src/routes/avatars/+page.svelte` | Avatar discovery/index surface |
| `/avatar/[avatarId]` | `src/routes/avatar/[avatarId]/+page.svelte` | Canonical public avatar profile |
| `/spaces` | `src/routes/spaces/+page.svelte` | `src/lib/components/atlas/SpacesAtlas.svelte` |
| `/spin` | `src/routes/spin/+page.svelte` | `src/lib/components/spin/SpinView.svelte` |
| `/zoltar` | `src/routes/zoltar/+page.svelte` | Currently an `EmptyModule`, not a finished product |
| `/receipts` | `src/routes/receipts/+page.svelte` | Currently an `EmptyModule`, not a finished product |
| `/ops` | `src/routes/ops/+page.svelte` | Private Observatory overview |
| `/ops/live-avatars` | `src/routes/ops/live-avatars/+page.svelte` | Private live-capture inspection |
| `/ops/render/[avatarId]` | corresponding route | Private renderer evidence |
| `/avatar-render/[avatarId]` | corresponding route | Avatar render surface |
| `/avatar-oracles/[avatarId]/compare` | corresponding route | Calibration/oracle comparison |

`src/routes/+layout.svelte` and `src/lib/components/shell/**` own the shared shell and navigation. A public route must not implement a second identity resolver or its own interpretation of evidence.

### 11.3 Frontend data and presentation source

- `src/lib/runtime/apiClient.js` owns public API URL construction, the 20-second request timeout, JSON error handling, and recent-crawler-avatar requests. In local Vite development it defaults to `http://127.0.0.1:8780`.
- `src/lib/runtime/desktopBridge.js` owns calls that are allowed only through the Tauri/operator boundary.
- `src/lib/beacon/api.js` owns Beacon-specific API calls.
- `src/lib/beacon/beaconState.js` and `src/lib/beacon/stores/worldStore.js` own client-side read-model state.
- `src/lib/beacon/avatarProfileView.js` converts API profile data into a view model. It must never independently resolve an avatar name differently from item pages.
- `src/lib/beacon/itemVariant.js` and `itemGroups.js` format item/variant information. They must consume canonical variant fields rather than guess labels from base names.
- `src/lib/beacon/assets.js` and `assetResolver.js`-style helpers turn canonical media references into usable URLs; they must not silently replace missing canonical media with misleading content.
- `src/lib/beacon/observatoryStore.js` owns the private Observatory state exposed to the UI.
- `src/lib/beacon/modes.js` separates public and operator behavior.
- `src/lib/styles/tokens.css`, `reset.css`, `foundation.css`, `shell.css`, `home.css`, `atlas.css`, `observatory.css`, `modules.css`, `responsive.css`, `spin.css`, and `technical.css` are the design-system source. `src/app.css` composes them.

### 11.4 API and read-model source

The active API is split into public and operator applications:

- `apps/api/src/public-app.ts` assembles the public, read-only service.
- `apps/api/src/operator-app.ts` assembles the authenticated private service.
- `apps/api/src/modules/legacy/public-routes.ts` currently registers the active Beacon endpoints.
- `apps/api/src/modules/legacy/data-store.ts` currently loads and joins preserved/exported data.
- `apps/api/src/modules/legacy/profile-builders.ts` currently builds item, avatar, and space read models.

The `legacy` name is architectural debt: these files are not merely old compatibility code; they currently power the product. Until canonical database-backed repositories replace them, changes here can change the entire visible application.

Principal public endpoints include:

```text
GET /api/beacon/world
GET /api/beacon/avatars/recent
GET /api/beacon/observatory/status
GET /api/beacon/observatory/search
GET /api/beacon/observatory/item?source_xml=...
GET /api/beacon/item/profile?source_xml=...
GET /api/beacon/item/profiles?source_xml=...
GET /api/beacon/avatar/profile?avatar_id=...
GET /api/beacon/avatar/badge
GET /api/beacon/space/profile?space_id=...
GET /api/beacon/spin/prices
```

`packages/contracts/src/domain.ts`, `avatar-profile.ts`, and `index.ts` define the schemas clients are entitled to trust. If a field can be absent, unresolved, inferred, or stale, that meaning must be encoded in the contract rather than hidden in presentation logic.

### 11.5 Operator and security source

- `apps/api/src/modules/operator/routes.ts` registers private endpoints.
- `action-runner.ts` executes bounded operator actions.
- `service-control.ts` controls approved services rather than arbitrary shell commands.
- `session-importer.ts` imports renewed crawler sessions.
- `overview.ts` builds actionable operator status.
- `audit-log.ts` records who requested what and whether it succeeded.
- Tauri commands in `src-tauri/src/**` authenticate the desktop surface to the operator API.

Observatory is therefore a control plane over real receipts and bounded actions. It must not calculate health from file presence alone, expose credentials, or put operator endpoints into the public web bundle.

### 11.6 Session and crawler source

The session lifecycle is powered by:

- `session/crawler-vps-human-login.sh`: opens the VPS-hosted interactive browser used for a human login or reCAPTCHA.
- `session/crawler-session-renew.sh` and `session/vps-crawler-renew.sh`: validate and renew an existing crawler session.
- `session/provision-crawler-credentials.py`: provisions credentials into the approved secret store.
- `session/crawler_autologin.mjs`: browser-assisted login logic; it must stop for human challenges rather than bypass them.
- `session/vps_popular_avatar_collector.sh`: production Popular-space collection orchestrator.
- `session/vps_real_client_crawl.sh`: drives the recovered real client capture path.
- `session/import_vps_live_capture.py`: imports capture evidence.
- `session/rtmp_avatar_configs.py`: extracts avatar configuration candidates from captured traffic.
- `session/export-beacon-observatory-lite.py`: produces the bounded operator read model. This is the safe replacement for repeatedly rebuilding an unbounded `observatory-sync.json`.

The timers and unit limits live in `deploy/systemd/smallverse-*.service` and `.timer`. Those files define production cadence, concurrency, memory/CPU limits, restart behavior, and environment ownership.

### 11.7 Recovered protocol source

The recovered protocol is executable documentation of how the Flash client communicates:

- `tools/smallverse_amf.py`: AMF encoding/decoding primitives.
- `tools/smallverse_friend_search_protocol.py`: SWF-accurate `friend.searchForFriends` and `avatarcore.getUsersAvatars` calls.
- `tools/beacon_friend_search_bridge.py`: performs those calls inside an authenticated VPS session and writes sanitized evidence.
- `tools/next_smallverse_friend_query.py`: rotates bounded two-letter queries.
- `tools/smallverse_popular_protocol.py`: recovered Popular category/space methods and validation.
- `tools/fetch_popular_spaces_via_cdp.py`: reads the current `/api/space/popular` response through signed-in Chromium.
- `tools/select_fresh_popular_spaces.py`: selects fresh spaces and partitions work between crawlers.

These tools are protocol adapters, not canonical databases. Their outputs remain evidence until canonical import validates and joins them.

### 11.8 Identity, portrait, space, and item enrichment source

- `tools/beacon_owner_avatar_identity_graph.py`: append-only owner/avatar identity evidence, including authoritative `isDefault` when supplied by the game.
- `tools/cache_avatar_thumbnails_via_cdp.py`: fetches exact authenticated avatar portraits using avatar ID plus the server-provided image hash.
- `tools/beacon_avatar_api_import.py`, `beacon_avatar_assets_import.py`, `beacon_avatar_capture_import.py`, and `beacon_friend_search_capture_import.py`: import distinct avatar evidence sources.
- `tools/harvest_crawler_avatar_assets.py`: turns captured traffic into config candidates and portrait-cache work.
- `tools/export_live_avatar_configs.py`: exports only complete `avatars/.../avatar.xml` configurations.
- `tools/beacon_avatar_wearing_sidecar.py`: accepts only explicit equipped/wearing evidence.
- `tools/beacon_world_resolve_images.py`, `beacon_world_popular_image_resolver.py`, and `beacon_world_image_resolver.py`: enrich canonical spaces with names and images.
- `tools/beacon_item_profile_identity_resolver.py`, `beacon_space_profile_identity_resolver.py`, and `beacon_owner_identity_profile.py`: reconcile profile identities.

No one resolver may overwrite stronger evidence with a weaker guess. Each import must preserve source, capture time, crawler, confidence, and raw artifact reference.

### 11.9 Avatar renderer source

The browser renderer is distributed across `src/lib/beacon/avatar-renderer/**`:

| Stage | Principal source |
|---|---|
| Asset resolution | `assetResolver.js`, `materialResolver.js` |
| Snapshot contract | `avatarRenderContract.js`, `avatarRenderSource.js` |
| Equipment/slots | `avatarEquipmentResolver.js` |
| Animation planning | `avatarAnimationPlanner.js` |
| XML sprite compilation | `avatarSpriteXmlCompiler.js`, `avatarXmlBodyCompositor.js` |
| Body assembly | `bodySpriteCompositor.js` |
| Face/head composition | `headFeatureCompositor.js`, `headSpriteResolver.js`, `headTextureComposer.js` |
| Head morph/projection | `headMorphBuilder.js`, `headProjection.js` |
| Flash color behavior | `flashColorPipeline.js`, `avatarMaterialContext.js` |
| O3D parsing | `o3dParser.js`, `threeMeshBuilder.js` |
| Design metadata | `designManifest.js` |

Supporting reverse-engineering and calibration tools include `extract_cached_smallverse_swfs.py`, `find_smallverse_flash_payloads.py`, `inspect_smallverse_avatar_requests.py`, `bootstrap_avatar_calibration_contract.py`, `capture_avatar_calibration.py`, `import_avatar_calibration_pack.py`, the `build_avatar_render_bundle*.py` series, `build_avatar_render_contract_v4.py`, `build_avatar_head_design_sprites.py`, `analyze_head_morph_contract.py`, and `inspect_morph_design_bindings.py`.

`apply_live_avatar_render_queue.py`, `export_avatar_live_manifest.py`, `watch_avatar_render_captures.py`, and `import_avatar_snapshot_captures.py` connect live evidence to renderable snapshots. Multiple bundle versions are historical/research debt; the production contract must explicitly identify one supported path.

### 11.10 Persistent data and generated projections

`.local-data/workspace/identity.sqlite` should become the local canonical database mirror. Files such as `owner-avatar-identity-graph.json`, `beacon-world-index.json`, `beacon-item-profiles.json`, `avatar-rtmp-manifest.json`, `avatar-url-index.json`, `beacon-avatar-render-queue.json`, and `observatory-sync.json` are imports, queues, caches, or projections.

They are not equal authorities:

| Kind | Examples | Rule |
|---|---|---|
| Raw evidence | captures, RTMP/AMF payloads, source XML, response archives | Immutable; never edited to fit UI |
| Canonical state | database entities and temporal relationships | Reconciled authority used to build products |
| Work queue | render queue, portrait queue, unresolved enrichment | Retryable, bounded, disposable after completion |
| Read model | world index, item profiles, avatar profiles, Observatory lite | Rebuildable from canonical state |
| Media cache | portraits, space images, variant icons, renderer assets | Addressed by canonical identity plus provenance |
| Generated app | `build/`, `dist/` | Never edited directly |

`SHA256SUMS` verifies preserved artifacts; it does not make those artifacts the current domain authority.

## 12. End-to-end code pipelines

### 12.1 Human session renewal

```text
Operator clicks Manage crawler logins
→ desktopBridge.js / Tauri command
→ operator API routes.ts + action-runner.ts
→ crawler-vps-human-login.sh on the VPS
→ human completes login/reCAPTCHA in VPS Chromium
→ crawler-session-renew.sh validates cookies/session
→ session-importer.ts records sanitized status
→ Observatory shows a new receipt
```

Meaning: the operator controls a browser that remains on the VPS. Credentials, cookies, and game traffic do not need to originate from the local computer. A successful browser page is not enough; validation and a fresh receipt are required.

### 12.2 Popular-space capture

```text
systemd timer
→ vps_popular_avatar_collector.sh
→ fetch_popular_spaces_via_cdp.py or smallverse_popular_protocol.py
→ select_fresh_popular_spaces.py
→ vps_real_client_crawl.sh
→ raw room/RTMP/AMF evidence
→ import_vps_live_capture.py
→ canonical CaptureRun + RoomCapture + observations
```

Meaning: Popular is game-provided ordering/population evidence, not a guessed URL slug. Each visit must preserve the canonical space ID, current name, image reference, population/rank, present avatars, objects, placements, and listings as one bounded capture.

### 12.3 Owner, avatar name, and portrait resolution

```text
next_smallverse_friend_query.py
→ beacon_friend_search_bridge.py
→ smallverse_friend_search_protocol.py
→ friend search response: owner + avatar identity + name + portrait hash
→ getUsersAvatars response: account's avatar slots + isDefault
→ beacon_owner_avatar_identity_graph.py
→ cache_avatar_thumbnails_via_cdp.py
→ canonical OwnerAccount and Avatar
→ public avatar read model
```

Meaning: owner ID, avatar ID, avatar name, and portrait are different fields. An account may have up to three avatars. The primary/default avatar comes from authoritative `isDefault` evidence; it is not whichever avatar was seen most often. A raw avatar ID or badge is never a public substitute for a resolved name and portrait.

### 12.4 Avatar configuration and render

```text
room capture / avatar protocol event
→ harvest_crawler_avatar_assets.py + rtmp_avatar_configs.py
→ explicit avatar/config correlation
→ export_live_avatar_configs.py
→ immutable AvatarConfigSnapshot
→ beacon_avatar_wearing_sidecar.py for explicit equipped relationships
→ apply_live_avatar_render_queue.py
→ avatarRenderContract.js
→ equipment/material/XML/animation compositors
→ complete render + missing-asset diagnostics
→ public profile render
```

Meaning: a portrait PNG is only a portrait. A full render requires an explicitly correlated configuration snapshot, slot-resolved equipment, assets, colors/materials, and recovered animation rules. Timestamp proximity alone is not a valid avatar/config join.

### 12.5 Item, object UID, and variant pipeline

```text
room object traffic
→ raw object UID + source XML + context
→ ItemDefinition resolution
→ XML rarity eligibility
→ UID-specific decoded configuration
→ normalized ItemVariant signature
→ variant icon renderer/cache
→ explicit ObservedWith / PlacedIn / ListedForSale relation
→ item profile read model
```

Meaning: the base item definition answers “what kind of item is this?” The UID/config answers “which exact variant was observed?” The rare catalog is controlled by XML rarity, not whether an icon exists. Equipped, co-observed, placed, and listed-for-sale relations remain separate.

### 12.6 Space identity pipeline

```text
Popular response or room entry
→ space ID
→ captured space name + image/hash
→ beacon_world_*_image_resolver.py
→ canonical Space
→ RoomCapture relationship
→ space and avatar read models
```

Meaning: space ID is a join key, not public content. If a capture reaches the public layer without a space name and displayable image, enrichment/materialization is incomplete; the UI should not perform a late guess.

### 12.7 Public materialization and request path

```text
canonical database
→ deterministic profile builders
→ bounded read models / media cache
→ public-routes.ts
→ apiClient.js
→ route/component view model
→ Beacon screen
```

Meaning: identity and relationship joins happen once before presentation. The same avatar must have the same canonical name, portrait, account relationship, and space metadata on search, item, avatar, and space screens. Public UI code formats facts; it does not invent them.

### 12.8 Observatory path

```text
systemd/service state + run receipts + bounded queue counts + resource telemetry
→ overview.ts
→ authenticated operator API
→ observatoryStore.js
→ /ops
```

Meaning: useful status is task-oriented: current action, last success, next run, processed counts, failure reason, queue depth, and safe control. “Explorer unavailable,” file counts, or zeroes with no explanation are not meaningful operational information.

## 13. Source ownership rules

1. Protocol tools own faithful request/response handling, not product truth.
2. Importers own validation and provenance, not presentation labels.
3. The canonical database owns entity identity and temporal relationships.
4. Profile builders own deterministic public materialization.
5. Public API contracts own what clients may rely on.
6. Components own layout and interaction, not data reconciliation.
7. The renderer owns visual assembly from an authoritative snapshot, not avatar identity.
8. Observatory owns operations and uncertainty, not public catalog content.
9. Systemd owns production scheduling and resource limits.
10. Preserved captures remain immutable evidence even when canonical conclusions change.

Any implementation that crosses these boundaries must state why. A component that joins raw exports, a renderer that chooses a primary avatar, or a crawler that directly writes a public profile is a design defect.

## 14. Test, build, and release source

The required verification chain is encoded in `package.json`:

```text
npm run check:boundaries
→ build contracts/database
→ API tests
→ node --test tests/*.test.mjs
→ web/API production builds
→ desktop tests/build where relevant
→ production audit/smoke/release verification
```

Tests under `tests/` cover API clients, public application behavior, profiles, variants, identity joins, Popular refresh, Observatory, and renderer contracts. API-local tests live with `apps/api`. Database migration verification is run through `db:migrate` and `db:verify`.

Every pipeline change needs three levels of proof:

1. Unit/contract proof: parsing and semantics are correct.
2. Integration proof: a realistic fixture crosses the boundary correctly.
3. Live acceptance proof: a new VPS observation appears correctly in Beacon or Observatory.

A green build cannot prove a crawler is productive, and a screenshot cannot prove the canonical joins are correct.

## 15. Known structural debt in the source tree

- The active public API is under `modules/legacy`; compatibility and production authority are conflated.
- JSON projections and SQLite coexist without one enforced authority boundary.
- Several avatar bundle builders (`v2`, `v3`, `v4`) coexist; the production renderer path is insufficiently singular.
- Zoltar and Receipts have public navigation/route presence but placeholder implementations.
- Patch, inspection, import, and one-off recovery scripts are numerous and not consistently classified as production, migration, or research tools.
- Generated exports are close to source code and have repeatedly been treated as live authority.
- Full Observatory exports previously performed unbounded recomputation and could overload the VPS.
- Local and VPS state can drift unless synchronization publishes versioned, atomic read models.
- Public profiles have historically performed late joins, causing a name to resolve on one screen and remain unresolved on another.
- Public eligibility, media availability, and relationship resolution have historically been mixed together.
- System status has historically measured service/file existence rather than verified useful work.

The destination is not to delete preservation evidence. It is to make the authority chain explicit:

```text
raw evidence → validated imports → canonical database → bounded projections → APIs → UI
```

## 16. Current root causes

1. **No single live canonical database.** Screens still combine JSON, SQLite, exports, indexes, and manifests differently.
2. **No durable enrichment state machine.** Incomplete observations are stored without guaranteed eventual resolution.
3. **Public filtering is not resolution.** Hiding incomplete records improves presentation but does not repair them.
4. **Room capture evidence is fragmented.** Space identity, population, occupants, and objects need one shared `roomCaptureId`.
5. **crawler-02 productivity is unproven.** Active session/timer state does not prove it is producing identities and configs.
6. **Configuration correlation is incomplete.** Some configs cannot be authoritatively linked to an avatar.
7. **Historic relationships are ambiguous.** Older observations may not distinguish equipped, placed, listed, and co-observed.
8. **Variant normalization is incomplete.** UID, decoded config, readable label, render key, and icon are not always one canonical record.
9. **Renderer capability exceeds live input quality.** The renderer can pass fixtures while live captures remain incomplete.
10. **Legacy and current read models coexist.** Old full-export assumptions remain alongside bounded projections.
11. **Observatory measures service state more than productive outcomes.** It lacks complete run receipts and queue visibility.
12. **Several UI generations coexist.** Old CSS, new foundation styles, atlas styles, renderer labs, and component libraries are inconsistent.
13. **The visual product is sparse because canonical profiles are sparse.** CSS cannot substitute for missing resolved data.
14. **The worktree contains hundreds of changes.** Safe review, provenance, release packaging, and rollback are compromised.
15. **Live end-to-end acceptance is missing.** Component tests do not prove a real VPS capture becomes a complete public profile.

The primary root cause is the absence of one persistent, authoritative enrichment pipeline that converts raw evidence into complete canonical records before public presentation.

## 17. Target architecture

```text
RAW ACQUISITION
├── Popular listings and room sessions
├── RTMP/AMF events
├── Find Friends/getUsersAvatars
├── portraits and space images
└── item/config XML

IMMUTABLE EVIDENCE STORE
├── raw payload
├── capture ID and crawler
├── timestamp
└── evidence hash

ENRICHMENT WORKER
├── owner/avatar/space/item resolver
├── variant decoder
├── config correlator
└── media cache

CANONICAL DATABASE
├── owners and avatars
├── avatar configs
├── item definitions/instances/variants
├── spaces and room captures
└── typed temporal observations

MATERIALIZED PUBLIC PROFILES
├── item/avatar/space profiles
├── search index
└── media manifest

INTERFACES
├── Beacon public UI
└── Observatory private UI
```

## 18. Required implementation sequence

### Phase 1: Repository stabilization

Inventory all changes, preserve evidence, separate generated artifacts, establish a reviewed baseline, archive superseded implementations, and restore reproducible immutable releases.

### Phase 2: Canonical persistence

Make normalized SQLite/PostgreSQL storage authoritative, define durable entity tables, import existing evidence with provenance, and stop treating JSON projections as authorities.

### Phase 3: Capture receipts

Create `CaptureRun` and `RoomCapture`; record inputs, outputs, failures, stage timings, and resource usage for every bounded crawler run.

### Phase 4: Enrichment state machine

Implement durable states:

```text
observed
→ identity pending/resolved
→ media pending/resolved
→ configuration pending/resolved
→ renderable
→ public
```

### Phase 5: Crawler specialization

Keep crawler-01 focused on Popular spaces, objects, placements, and sales. Keep crawler-02 focused on Find Friends, owners, avatars, portraits, default selection, and configurations. Verify productivity through receipts.

### Phase 6: Variant normalization

Build one canonical UID variant record with decoded configuration, normalized signature, readable label, exact icon, status, and provenance.

### Phase 7: Avatar configuration and rendering

Capture explicit config correlation, materialize immutable snapshots, resolve equipment by slot, identify missing assets, render complete avatars, and validate against captured Flash output.

### Phase 8: Public materialization

Generate complete profiles from the canonical database. Publish only eligible records, keep incomplete evidence private, and remove presentation-time joins.

### Phase 9: Product redesign

Apply one design system and page hierarchy. Remove nested cards, empty panels, raw identifiers, unexplained metrics, and public diagnostics.

### Phase 10: Live acceptance

Prove a complete real path from crawler capture to a named, portrayed, owner-linked, configured, equipped, rendered, space-linked public avatar profile.

## 19. Reusable implementation prompts

### Canonical architecture

> Audit Smallverse Lab’s current JSON, SQLite, RTMP, Find Friends, world-index, avatar-index, and render-queue sources. Design one canonical persistence model for OwnerAccount, Avatar, AvatarConfigSnapshot, ItemDefinition, ItemInstance, ItemVariant, Space, RoomCapture, CaptureRun, and TemporalObservation. Preserve raw evidence and provenance. Do not change UI code. Produce a migration and reconciliation report before implementation.

### Capture pipeline

> Implement a bounded CaptureRun and RoomCapture pipeline. Every Popular-room crawl must atomically record crawler profile, Popular rank/population, space ID/name/image, avatars present, object UIDs, placed objects, sale listings, protocol evidence, timestamps, stage results, and resource use. Never publish incomplete room identities. Add per-run receipts and retryable enrichment tasks.

### Identity enrichment

> Make the owner-avatar identity graph authoritative. Consume Find Friends and getUsersAvatars evidence, enforce the three-avatar account limit, preserve isDefault, never infer primary from observation frequency, cache exact portraits, and maintain explicit unresolved/retry states. Public avatars require a name and portrait. Do not modify renderer or visual design.

### crawler-02 verification

> Verify crawler-02 end-to-end on the VPS. Prove with a run receipt that it performs bounded Find Friends rotation, owner expansion, portrait caching, populated-room capture, avatar configuration extraction, and render-queue publication. Add actionable Observatory status for each stage. Do not claim success from timer or session status alone.

### Variant pipeline

> Create one canonical UID-specific variant record joining UID, item definition, decoded config, normalized signature, readable label, rendered icon, render status, and provenance. Never use the base item name as a variant label unless no distinguishing configuration exists; otherwise label it configuration unresolved. Preserve rare-catalog eligibility independently.

### Avatar configuration

> Audit every captured RTMP/shared-object path that can explicitly correlate an avatar ID, owner ID, configuration XML, and equipped item selection. Reject timestamp-only joins. Materialize immutable avatar configuration snapshots and list every remaining correlation gap.

### Renderer

> Build production avatar renders only from authoritative snapshots and recovered SWF/XML rules. Resolve body, skin, face, hair, clothing, shoes, accessories, and UID variants by slot. Support Idle, Walk, LeftArmWave, and RightArmWave. Compare output against captured Flash oracle frames. Report missing assets honestly and keep experimental O3D output private.

### Public profiles

> Materialize public avatar, item, and space profiles from the canonical database. Public records must never contain unresolved names, missing required media, raw IDs as labels, or ambiguous relationship promotion. Separate equipped, placed, listed-for-sale, and unclassified evidence. Do not perform presentation-time joins.

### Observatory

> Redesign Observatory as an actionable private operations surface. Show crawler session status, current task, last successful run, next run, stage counts, unresolved queues, failed correlations, missing media, renderer failures, VPS memory/load/disk, and bounded controls. Remove generic service cards and file-presence metrics that do not help the operator decide what to do.

### UI redesign

> Redesign Beacon using one minimal dark design system. Use flat sections, strong typography, thin separators, responsive layouts, and restrained accent color. Eliminate nested cards, raw IDs, unexplained metrics, duplicated panels, and empty diagnostic sections. Prioritize identity, imagery, relationships, and history. Keep technical evidence behind one disclosure and operational diagnostics in Observatory.

### Live acceptance

> Run one complete live acceptance workflow from authenticated crawler to Beacon profile. Record every stage and artifact. Do not declare success unless a newly observed avatar has a resolved name, cached portrait, owner relationship, canonical space, authoritative configuration snapshot, resolved equipped items, and a working public render/profile.

## 20. Definition of done

Smallverse Lab is genuinely working when:

- crawler sessions renew safely;
- both crawlers continuously produce verified results;
- Popular rooms include canonical space metadata;
- every public avatar has a name and portrait;
- account/default-avatar relationships are evidence-backed;
- configuration snapshots are explicitly correlated;
- equipped, placed, and listed relationships never mix;
- UID variants have exact icons and meaningful names;
- complete avatars render from live captures;
- Beacon contains no raw or unresolved public junk;
- Observatory explains exactly what is working or blocked;
- exports remain bounded and the VPS remains stable;
- one clean release can be reproduced and deployed;
- live acceptance proves the complete chain rather than isolated components.

Smallverse Lab is ultimately a preservation-grade SmallWorlds evidence system transformed into a coherent, SkyCrypt-inspired public explorer.
