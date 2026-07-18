# Unresolved claims, contradictions, and verification matrix

## Status vocabulary

- **Verified live**: retained current request/response or runtime result proves the behavior.
- **Recovered only**: the old client declares it, but current server behavior is unknown.
- **Implemented only**: Smallverse Lab contains code, but no successful live evidence proves the end-to-end result.
- **Captured historical**: preserved traffic/artifact proves a past response, not necessarily current availability.
- **Contradicted**: two authorities disagree and publication must stop for that entity/generation.
- **Missing**: required evidence does not exist.

## Current unresolved ledger

| Area | Known | Unresolved / contradiction | Required proof |
|---|---|---|---|
| crawler-01 session | historical collection and retained PCAP are proven | browser/CDP and scheduled Popular timer are currently inactive | successful bounded health call plus fresh capture receipt |
| crawler-02 session | human login previously succeeded in VPS browser | browser/CDP and scheduled Popular timer are currently inactive | fresh timer run with nonzero room/config receipt |
| Popular selection | two recovered paths are known; a retained `catalog_entry.getSpacesForCategory` response is historically ordered by `currentVisitors` descending | current availability, ordering, and selected service path | retained current Popular request/response with method, `currentVisitors`, and row order |
| room join | exact lookup/location/RTMP source flow and a historical room PCAP are proven | current server generation and paired lookup response | paired current lookup and successful RTMP connection capture |
| avatar presence | `avatars`, `Avatar.<id>`, and a historical 27-avatar room capture are proven | complete replay/change vocabulary across current rooms | decoded event catalog from multiple fresh rooms |
| owner link | `ownerId` is proven to mean user/account ID; captured `avatar.viewMyAvatars` rows include `avatar_owner_id`; the owner-avatar service schema is explicit | all 4,085 supplied Find Friends rows have `Person.user = null`, and current projections contain zero canonical owner edges | captured `avatar_owner_id`, `getUsersAvatars` response, or another typed owner-avatar edge retained with provenance |
| primary avatar | recovered `UserAvatar.isDefault` and current-avatar result define semantics | marker absent from retained current normalized data | current response retaining explicit `isDefault`/selected marker |
| avatar name | many IDs resolve through Find Friends | coverage for every observed RTMP avatar | enrichment job with query/source receipt |
| portrait | postfix/URL capture and local cache work | guaranteed availability/expiry rules | HTTP status, content hash, avatar-ID match |
| avatar config | `test3.pcapng` proves 27 distinct `Avatar.<id>` objects and 27 valid full `<avatar>` configurations; another retained PCAP proves 88 decoded configurations | coverage across current Popular rooms and state variants | fresh nonzero config receipt per room plus XML validation |
| full renderer | several modules and oracle corpus exist | Flash parity across body/equipment/head/actions | deterministic corpus with difference thresholds |
| space identity | IDs/names/images resolve in some data | coverage and exact icon fallback order | current response plus verified fetched asset |
| object UID | observation pipeline captures UIDs | exact semantics for every object event | paired RTMP object state and recovered entity class |
| rarity | XML rare/legendary gate is defined | conflicting/historical XML versions | hash/version policy and parser test corpus |
| equipped relation | config and wearing sidecars exist | reliable separation from room placement | avatar config slot evidence for exact UID/definition |
| placed relation | room object observation exists | ownership and placement lifecycle | typed room event receipts |
| sale relation | room state proves `forSale`, `price`, and `priceTokens`; `market.getSellOrders` is captured once and the market service is recovered | no completed place/purchase/cancel transaction is present in the supplied auction captures | sanitized completed transaction capture with UID, listing, result, and transaction correlation |
| variant label | config rendering can produce distinct icons | complete decoder vocabulary and human names | config-to-label fixtures for each option family |
| Spin | exact recovered UI/service sequence, historical VPS receipts, and a captured successful `getFreePrize` response exist | current endpoint behavior and idempotency | new bounded personal-session receipt when explicitly authorized |
| Zoltar | launch boundary plus filtered historical transaction-history receipts and result columns are captured | iframe purchase/transmute request, card grant, and direct correlation remain opaque | sanitized browser HAR/Fiddler action preserving non-secret request/response and resulting grant correlation |
| PostgreSQL | infrastructure schema exists | domain tables/importer/publication absent | migration, importer, counts, parity tests |
| public API | routes and schemas exist | legacy request-time joins remain authority | immutable-generation read implementation |
| Observatory | authentication/actions exist | current overview lacks useful domain metrics | live pipeline state model and action receipts |

## Known source contradictions

1. Friend-search systemd comments refer to crawler-01 while `ExecStart` selects crawler-02.
2. Duplicate collector units under `session/` omit the resource controls present in `deploy/systemd/`.
3. PostgreSQL is described as target authority while public reads still come from the legacy mixed-file store.
4. Multiple tools create similarly named SQLite tables with non-identical schemas.
5. Multiple render document generations and fallback candidates can describe the same avatar.
6. UI-observed variant icons can exist while an operator “variant cache” metric reports zero because they count different directories/contracts.
7. Avatar names can resolve in one read model while another profile builder still says unresolved.
8. Space IDs/images can exist in capture exports while public profiles lack the canonical space name join.
9. Historical owner/association caches can be presented beside current item observations without equivalent timestamps.
10. Recovered service availability is sometimes described as live capability without a current successful capture.
11. The supplied Find Friends responses prove avatar identity and exact portraits but cannot be used as owner evidence because every `Person.user` field is null.
12. The supplied auction traffic proves room sale state and a marketplace read, not a completed auction mutation.

## Verification matrix

### Session

- Confirm secret lookup succeeds without revealing the value.
- Confirm fingerprint/generation changes after human renewal.
- Make one bounded authenticated read call.
- Confirm crawler traffic originates on VPS.
- Confirm failure stops rather than loops.

### Popular and room capture

- Save the exact current Popular request and response; do not assume in advance whether it uses the recovered `space` or `catalog_entry` path.
- Record category, row order, population, space ID/name/image fields.
- Save channel lookup response.
- Record RTMP endpoint and connection result.
- Hash PCAP and create room receipt.
- Require nonzero presence or explicitly label empty room.

### Identity

- For each published avatar, require name and portrait for exact avatar ID.
- For each owner edge, retain response/capture provenance.
- For primary avatar, require explicit selected/default proof.
- Verify sibling avatars do not overwrite each other.

### Space

- Require ID, name, verified image, and source response.
- Confirm room capture references same ID.
- Confirm image hash and media type.
- Never display raw ID as name.

### Item and variant

- Parse rarity from hashed source XML.
- Bind each UID to definition and captured config.
- Classify relationship independently as equipped, placed, listed, or observed.
- Render two known distinct configurations and require distinct expected hashes.
- Show unresolved label when semantic decoding is absent.

### Avatar renderer

- Parse and hash config XML.
- Resolve every required base/head/equipment asset.
- Compile Idle, Walk, and Wave frame plans.
- Render deterministic frames.
- Compare against retained Flash oracle.
- Reject head-only output as full render.

### Publication

- All projections share one generation ID and evidence cutoff.
- Manifest contains counts and SHA-256 values.
- Referential-integrity checks pass.
- Public API reads no mutable capture files.
- Generation switch is atomic.
- Previous generation remains rollback-capable.

### Operations

- Overview reports last success/failure and next run for every crawler job.
- Queues show counts and oldest age for identity, portrait, config, render, and publication.
- Every action is allowlisted, confirmed, and audited.
- CPU/memory/task limits match installed units.
- No expensive export is triggered on every capture.

## Public eligibility rules

An entity should not be silently dropped merely because enrichment has not run. It should remain in the private backlog until its required evidence is complete. Public eligibility is the final state of an explicit enrichment process:

- avatar: exact ID + human name + verified portrait + provenance;
- space: exact ID + human name + verified image + provenance;
- item definition: normalized source XML + name + authoritative rare/legendary tag + icon;
- variant: UID/config evidence + definition + normalized variant identity + render status;
- avatar full render: exact config snapshot + complete asset contract + verified composite.

The system should therefore explain why an entity is pending and schedule the missing enrichment. It should not manufacture a placeholder identity, publish a raw ID, or make the record disappear without an operator-visible reason.

## Completion boundary

This dossier is complete as a source map only when:

1. every app-relevant recovered call has a catalog row and its wrapper/result source;
2. every current route and service has an owner and data source;
3. every public field has one canonical lineage;
4. every persistence table has a writer, reader, and migration status;
5. every renderer output has an input/asset graph and verification status;
6. every unresolved claim above has either evidence or remains explicitly unresolved;
7. live verification receipts are retained for both crawlers, Popular, identity, configs, variants, spaces, Spin, and publication.

Documentation cannot turn an unresolved live behavior into a verified one. It can—and must—prevent the application from pretending otherwise.

The dated evidence, retained PCAP hash, current runtime diagnosis, artifact census, and closed-vs-open boundary are recorded in [Evidence closure report](./EVIDENCE-CLOSURE-REPORT.md). The supplied Fiddler/Wireshark archive and its remaining cryptographic evidence gaps are recorded in [Old captures evidence report](./OLD-CAPTURES-EVIDENCE-REPORT.md).
