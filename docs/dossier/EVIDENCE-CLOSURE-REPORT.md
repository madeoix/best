# Evidence closure report

This report records the read-only source and artifact verification performed on 2026-07-16. It distinguishes questions that can now be answered from recovered code or retained captures from questions that still require a new authenticated response, a missing artifact, or a renderer oracle. No application source was changed during this verification.

## Closure summary

| Evidence area | Result | What is now proven | Remaining boundary |
|---|---|---|---|
| Popular response contract | Recovered + captured historical | Both `space.viewPopSpaces(offset, count)` and `catalog_entry.getSpacesForCategory(category, offset, count)` resolve typed space rows; the retained category response has canonical names/images and is ordered by visitor count descending | No retained current Popular AMF response proves present ordering, selected path, or server availability |
| Room lookup and RTMP connection | Recovered + captured | Lookup returns host/instance/visitor context; client connects to RTMP and subscribes to `avatars`; retained PCAP contains room state | The exact current lookup response paired with the retained PCAP was not preserved |
| Avatar and object RTMP evidence | Captured historical | Retained PCAP contains avatar presence, equipped/wearing UIDs, object observations, market/listing markers, space state, and decoded configurations | Scheduled live collection is presently stopped, so this is not a current freshness receipt |
| Owner-to-avatar schema | Recovered + captured boundary | `ownerId` is a user/account ID; account-avatar rows/calls expose the account's avatar slots | All 4,085 supplied Find Friends rows have `Person.user = null`; they cannot supply the owner edge |
| Primary/default avatar | Recovered | `UserAvatar.isDefault`, `SelectedAvatarResult.isDefault`, `avatarcore.getUsersAvatars`, and `avatarcore.getCurrentAvatar` define explicit default/current semantics | A current response containing those markers has not been retained |
| Avatar config | Captured historical | Full avatar state/config, postfixes, animation state, and equipped UID/config evidence are present in retained RTMP artifacts | Coverage across all current Popular rooms and all state transitions is unproven |
| Portrait identity | Captured + implemented | Exact avatar IDs, names, portrait URLs/postfixes, and a large local portrait cache exist | Current CDN expiry/fallback behavior and universal coverage are not guaranteed |
| Variant configurations | Captured + implemented | Distinct per-UID decoded configuration XML and hundreds of rendered icons exist | Complete option vocabulary and human-readable labels are not source-indexed yet |
| Avatar renderer | Implemented + partial captured oracle | Body/head/equipment assets and retained Flash comparison material exist | Full deterministic Flash parity for Idle/Walk/Wave remains unproven |
| Space identity | Recovered + captured historical | Popular rows and current world projections have name, ID, visitor and image fields | Current image validity and canonical fallback order need a retained response plus fetched-asset receipt |
| SpinToWin | Recovered + captured historical | Exact recovered call sequence exists and VPS receipts preserve successful historical actions | A new current personal-session read receipt was not created during this audit |
| Zoltar | Captured launch + receipt boundary | Item XML identifies the iframe launch; historical transaction responses prove filtered card-pack purchase receipts and their record-set schema | The HTTPS iframe purchase/transmute request, card-grant payload, and direct action-to-grant correlation remain unavailable |

## Retained Popular/RTMP receipt

The VPS contains the following immutable historical capture:

```text
/opt/smallverse/automation-workspace/live-captures/manual-popular-1784074791/raw/popular-join.rtmp-live.pcapng
size: 538091 bytes
sha256: 19f12be39cfb64e9ae59e03cbd30e60fd85e24cea68e5a969b07c26966b31e29
```

Its import is preserved under:

```text
/opt/smallverse/automation-workspace/live-captures/manual-popular-import/
```

The importer receipt reports:

- one PCAP session;
- 882 normalized observations;
- 3,535 protocol events;
- 137 resolved item definitions;
- 136 observed/resolved assets;
- no HTTP requests and no normalized avatar rows in that particular legacy import.

Direct inspection of `viewer-data/protocol-events.json` establishes a richer protocol layer than the legacy summary exposes:

- eight distinct `avatar_id` values;
- 363 distinct observed UIDs;
- 88 events carrying decoded configuration XML;
- 66 `avatar_wearing_uid` events;
- seven `avatar_equipped_item` events;
- 230 world-item observations;
- 223 generic object observations;
- 25 space-state events;
- 11 avatar dirty-snapshot events.

The event vocabulary also includes `market_or_listing`, `owner_or_avatar`, `items_manifest_entry`, chat/message markers, and raw AMF candidates. This proves that the capture and decoder can recover both avatar and object evidence. It does **not** prove that each heuristic event has canonical ownership semantics. `dirtySnapshot`, co-presence, and a room object must remain supporting evidence unless an explicit typed field establishes the relationship.

## Popular and space contract resolved from recovered source and capture

`SpaceService.viewPopSpaces` calls `space.viewPopSpaces` with `offset` and `count`, using `SpacePanelItem.formatTypedRecordSet` (`recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:700`). `SpacePanelItem` copies these server fields (`recovered-swfs/main-source/scripts/com/smallworlds/service/result/space/SpacePanelItem.as:10`):

- `id`, `desc`, `details`, `accessControl`, and `currentVisitors`;
- `iconSource`, `thumbnailSource`, and `snapshotSource`;
- `spaceOwner`, `avatarId`, `avatarFName`, `avatarLName`, and `avatarDetails`;
- rating/votes, sale fields, role/favorite state, tags, model ID and prices.

The broader historical dump adds a saved `catalog_entry.getSpacesForCategory(category, offset, count)` request and its 68-row `SpacePanelItem` response. Every retained row includes canonical ID/name, owner/default-avatar context, thumbnail, and snapshot; its visitor counts are monotonically non-increasing. This proves descending population order for that historical response. The recovered client contains both this catalog-category path and `space.viewPopSpaces`; neither should be described as the sole possible Popular implementation. It also establishes that Popular is not a guessed URL slug.

`LookupSpaceResult.format` converts returned `locations` into host/instance records and retains `spaceId`, `ownerId`, access control and description (`recovered-swfs/main-source/scripts/com/smallworlds/service/result/space/LookupSpaceResult.as:33`). `Location` retains hostname, instance ID, visitor count, maximum visitors and starvation state. This is the bridge from a selected space to the RTMP endpoint.

## Owner, avatar, and default semantics resolved from recovered source

The recovered identity model is explicit:

```text
owner/user account
  └─ user.id
     └─ avatarcore.getUsersAvatars(user.id)
        ├─ UserAvatar.id
        ├─ UserAvatar.fullName
        ├─ UserAvatar.thumbUrl / snapshotUrl
        └─ UserAvatar.isDefault
```

Supporting sources:

- `Person` constructs both `AvatarIdentity(param.avatar)` and `UserIdentity(param.user)` when those objects exist (`recovered-swfs/main-source/scripts/com/smallworlds/service/person/data/Person.as:20`).
- `UserIdentity` copies the account `id`, first name, last name and reciprocal state (`recovered-swfs/main-source/scripts/com/smallworlds/service/person/data/identity/UserIdentity.as:20`).
- `avatarcore.getUsersAvatars` returns the account's avatar-slot list (`recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as:27`).
- `UserAvatar` exposes ID, full name, thumbnail/snapshot URLs, active/created fields and `isDefault` (`recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/data/UserAvatar.as:32`).
- `avatarcore.getCurrentAvatar` uses `SelectedAvatarResult`, which also exposes `isDefault` (`recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as:41`; `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/result/SelectedAvatarResult.as:26`).

Therefore default-avatar selection is not a ranking problem and must not be inferred from observation frequency, portrait availability, array order or recency. The source-defined answer is the explicit `isDefault`/current response.

The supplied raw Find Friends captures now explain the missing current owner IDs: all 4,085 decoded rows contain `Person.avatar` but `Person.user` is null. They prove avatar ID/name/portrait URLs, not owner identity. Owner edges must instead come from captured `avatar_owner_id`, `avatarcore.getUsersAvatars(ownerId)`, or another typed account-avatar response. The identity database currently has avatar rows but zero canonical owner-account and owner-avatar evidence rows. The `owner_avatar_candidates` table contains unsafe co-presence/space-panel hypotheses and is not canonical proof; those candidates must never be promoted merely to fill a UI field.

## Avatar configuration and reconstruction evidence

The retained RTMP event data includes `Avatar.<avatar-id>` state with fields such as:

- first/last name and avatar ID;
- head, thumbnail and snapshot postfixes;
- model/body source;
- `config`, animation and animation state;
- equipped/wearing item UIDs and per-item decoded configuration XML;
- position, angle, bounds, actions and room link fields.

The VPS render queue and RTMP manifest preserve full `<avatar>` configuration documents with source PCAP, SharedObject name, version, capture time, display name, gender/model, postfixes, config hash and room context. This closes the question of whether room RTMP can provide reconstructable avatar state: it can, and it has.

It does not close renderer parity. A complete renderer still requires every referenced asset, exact option/color transforms, slot ordering, mirrors/offsets, animation frame plans and comparison against a retained Flash oracle. The repository currently has 873 avatar asset PNGs, 113 O3D files, 1,933 avatar thumbnail PNGs, and only 19 PNGs under `static/avatar-renders`; most render-directory records are metadata. A head portrait is identity evidence, not a full-body render.

## Runtime freshness diagnosis

Read-only VPS inspection on 2026-07-16 found the host healthy at the time of inspection. The avatar-harvest timer ran approximately every two minutes and completed, but it was reprocessing retained captures; a recently modified projection is not automatically a fresh room crawl.

Both per-crawler Popular timers were inactive after their last trigger. Journal evidence identified two failure modes:

1. the live Popular API returned no HTTP status; and
2. after restart, no signed-in Smallverse browser was available for the crawler profile, so the collector intentionally refused stale fallback.

The friend-search/portrait jobs also failed when their script attempted to reach a local Chrome DevTools Protocol JSON endpoint and received connection refused. This is a browser/session runtime outage, not evidence that the recovered Friend or RTMP protocols are wrong.

Consequently:

- crawler-02's successful human login is historical unless its browser/CDP process is still reachable;
- neither crawler currently has a fresh nonzero Popular-room receipt;
- avatar-harvest success proves parsing of available PCAPs, not continued live observation;
- restarting enrichment timers without restoring the signed-in browser would only repeat failure and risk unnecessary load.

## Artifact census

The local checkout contained the following evidence inventory at verification time:

| Artifact | Count/status |
|---|---:|
| `static/avatar-thumbnails/*.png` | 1,933 |
| `static/variant-icons/*.png` | 394 |
| `static/avatar-renders/*.png` | 19 |
| `static/avatar-assets` PNG files | 873 |
| `static/avatar-assets` O3D files | 113 |
| avatar calibration XML files | 135 |
| local owner-avatar graph avatar entities | 1,644 |
| local owner-account rows | 0 |
| local canonical owner-avatar evidence edges | 0 |

The previously missing `findfriends-capture.zip` is now present inside the supplied archive and has been decoded. It contains five successful Find Friends transactions and 4,085 avatar rows. Every row has a name plus head/thumb URLs, 4,049 have snapshots, and none has a populated `Person.user` owner object. See [Old captures evidence report](./OLD-CAPTURES-EVIDENCE-REPORT.md).

## Gaps that remain genuinely open

These cannot be closed honestly from the present artifacts:

1. **Current Popular ordering, selected service path, and availability.** Historical descending order is captured; current behavior still requires one retained AMF request/response from an authenticated VPS browser.
2. **Current owner-avatar edges.** The supplied Find Friends responses explicitly have `person.user = null`; this requires `avatarcore.getUsersAvatars(owner-id)`, captured `avatar_owner_id`, or another typed owner response retained with provenance.
3. **Current default avatar.** Requires the same owner response with `isDefault`, or `avatarcore.getCurrentAvatar` for an independently known account.
4. **Current room freshness.** Requires a new Popular row, lookup response, RTMP connection receipt and nonzero state/config counts from the same run.
5. **Full avatar renderer parity.** Requires deterministic Idle/Walk/Wave fixtures and accepted pixel/structural thresholds against Flash output.
6. **Complete variant label vocabulary.** Requires fixtures mapping each option family and selected value to normalized semantic labels.
7. **Current space image validity.** Requires image fetch status, media type and SHA-256 tied to the exact space response.
8. **Zoltar mutation/grant protocol.** Historical `getMyTransactions` responses prove receipt descriptions and the transaction-history schema. The remaining requirement is the sanitized HTTPS iframe purchase/transmute request, response, and card-grant correlation.
9. **Current Spin transaction behavior.** Historical receipts and recovered calls exist, but no new transaction was performed because this audit was read-only.

## Safest next evidence sequence

When live verification is authorized, the minimum bounded sequence is:

1. restore one signed-in VPS browser/CDP profile without restarting all timers;
2. retain the actual current Popular request/response, whether the client selects `space.viewPopSpaces` or `catalog_entry.getSpacesForCategory`;
3. select one returned row and retain its lookup response;
4. capture one bounded RTMP join, then stop;
5. retain the raw Friend/owner response for every avatar in that room;
6. hash every receipt and import into a new immutable capture generation;
7. run identity/config/space referential checks before publishing anything;
8. only then re-enable scheduled collection at bounded cadence.

This sequence closes the remaining live gaps without using request-time guesses, stale fallback or high-frequency exports.
