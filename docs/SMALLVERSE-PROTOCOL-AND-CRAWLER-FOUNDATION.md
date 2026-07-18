# Smallverse Protocol and Crawler Foundation

> The exhaustive source catalogs, field lineage, runtime topology, renderer graph, and unresolved verification ledger are indexed in [`docs/dossier/README.md`](./dossier/README.md).

Status: source-grounded technical reference  
Scope: recovered Smallverse client, VPS crawler, identity joins, room evidence, rendering, Spin, and Observatory publication  
Rule: this document describes the system. It does not authorize invented data or speculative joins.

## 1. The foundation

Beacon is not a conventional scraper. The Smallverse client distributes one logical world across three acquisition channels:

1. HTTP/AMF service calls made in the same form as the recovered Flash client;
2. RTMP room traffic and remote SharedObjects;
3. Smallverse content-host URLs returned by those services or constructed using server-returned postfixes.

Those observations are interpreted with static model XML, per-instance configuration XML, recovered sprites, and animation XML. A finished public record is a canonical join across those sources.

The recovered `main.swf` is the behavioral specification. The repository's Python, shell, TypeScript, and Svelte code implements selected portions. When implementation and SWF behavior differ, the discrepancy must be explicit. The implementation must not silently redefine the game protocol.

Most recurring defects came from collapsing unlike identities together:

- a UID is not an avatar ID;
- an owner ID is not the selected avatar;
- a model XML path is not an item copy;
- a head PNG is not an avatar configuration or body render;
- a room ID does not become a room name without a server-provided relationship.

## 2. Evidence levels

- **SWF-proven**: recovered ActionScript contains the call, field, URL rule, or transition.
- **capture-proven**: a real AMF, HTTP, RTMP, browser, or SAZ capture contains it.
- **implementation-proven**: current code parses/persists it and a focused test verifies it.
- **intended**: the architecture requires it, but live end-to-end proof is incomplete.

No public screen should state intended or inferred data as fact.

## 3. Identity dictionary

### 3.1 Owner ID

An owner ID is the account/user identity. It is the parent for an account that can contain multiple avatars. It is not an avatar's display name and is not necessarily the avatar visible in a room.

The recovered service proves this lookup:

```text
owner/account id
  -> avatarcore.getUsersAvatars(ownerId)
  -> avatar records
     -> avatar id
     -> name fields
     -> default metadata when returned
```

Source: `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as`.

That service separately exposes `getCurrentAvatar`, `makeDefaultAvatar`, and `chooseAvatar`. Therefore:

- membership under an owner does not identify the primary avatar;
- `active` may be lifecycle state, not selected/default state;
- primary/default status must come from an explicit field or current/default call;
- all avatars remain attached to the owner even when one is primary.

### 3.2 Avatar ID

An avatar ID identifies one avatar/character slot. It joins room SharedObjects, avatar services, portrait URLs, configurations, and Beacon profiles. It is a technical key, not the public label.

A canonical avatar needs:

```text
avatar_id
owner_id
display_name or first_name + last_name
verified head/thumb/snapshot metadata
is_default only when explicit
source capture/call and observation time
```

### 3.3 Space ID

A space ID identifies one room. It is used by Popular responses, navigation, RTMP paths, and observation joins. It is not a title or URL slug.

A canonical space needs:

```text
space_id
space_name
owner_id when returned
model_id when returned
icon/thumb/snapshot source
time-bounded current visitor count
source and observation time
```

The public UI shows the name and image. The raw ID is provenance, not a substitute for unresolved data.

### 3.4 Item definition and object UID

An item definition is the reusable model described by a source XML path. It supplies the base name, description, tags, category, assets, configurable options, and behavior.

An object UID identifies one concrete item instance/copy. Two copies may share one model XML but have different UIDs, owners, configurations, colors, icon postfixes, locations, and histories.

```text
definition: source_xml -> base metadata and configurable model
instance:   uid -> source_xml + owner/location/config/icon evidence
```

The UID is unique per object instance, not the global definition of that object type.

## 4. How the client talks to Smallverse

### 4.1 AMF over HTTP

`AMFEndpoint.as` and `AMFHTTPEndpoint.as` prove the request form:

1. choose the exact service method name;
2. serialize arguments in an AMF remoting envelope;
3. generate the client authentication context from the client key, Flash timer, and eligible arguments;
4. insert that context as the first server argument when required;
5. send through the configured NetConnection endpoint with the authenticated session;
6. format the returned `ServiceResult` into the expected record type.

The authentication material concatenates bounded strings and numeric arguments, excludes unsupported boolean/object values from the hash material, hashes that material with the client key and timer, and sends digest plus timer. Repository protocol helpers reproduce this behavior without documenting the reusable key value itself.

The login cookie/session and AMF context are different layers: the session authenticates the account; the AMF context proves the request was formed like the game client.

### 4.2 RTMP

`SpaceEndpoint.as` constructs a connection shaped like:

```text
rtmp://<host>:1935/<application>/<spaceId>
```

with an optional instance suffix. It uses AMF0 and passes session/client values during connection. It then subscribes to the remote SharedObject named `init`. Completion opens the room-state path, where spaces, avatars, and items synchronize through SharedObject events.

HTTP/AMF discovers identities and lists. RTMP supplies live instantiated room state. Neither channel replaces the other.

### 4.3 Smallverse content hosts

The client receives configured base paths and combines them with server-returned IDs and postfixes. The rules are in `Paths.as`. Beacon must preserve the literal returned URL or every exact input to that rule. It must never guess opaque hashes.

## 5. The crawler, step by step

### 5.1 VPS sessions

Crawler-01 and crawler-02 are dedicated VPS account/browser profiles. A local machine may display and control the VPS screen, but the Smallverse requests originate from the VPS process and session. The personal Spin/Zoltar account is a separate security boundary.

### 5.2 Live Popular discovery

The recovered client exposes `space.viewPopSpaces` in `SpaceService.as`. The current web client also exposes a server-owned Popular category/API. Repository support includes:

- `tools/smallverse_popular_protocol.py`: validates and decodes the protocol;
- `tools/fetch_popular_spaces_via_cdp.py`: performs discovery inside the signed-in browser;
- `tools/select_fresh_popular_spaces.py`: validates freshness, visitors, cooldowns, and crawler partitioning;
- `session/vps_popular_avatar_collector.sh`: processes a bounded sequential queue.

Popular is server data—not a guessed slug. `SpacePanelItem.as` shows fields such as ID, description/name, current visitors, model ID, image sources, space owner, and avatar owner fields.

Rooms with occupants are prioritized because they are likely to emit Avatar SharedObjects. The queue is paced, bounded, and cooldown-aware to protect the VPS.

### 5.3 Entering a room

`session/vps_real_client_crawl.sh`:

1. validates crawler profile and internal space ID;
2. reuses the authenticated Electron profile;
3. starts `tcpdump` for RTMP traffic on the VPS egress interface;
4. navigates the real client through CDP;
5. waits for `Avatar.<24-hex-id>` SharedObject evidence;
6. stops the bounded capture;
7. invokes the live-capture importer;
8. returns a retry status when the room supplied no Avatar object.

It does not fabricate a handshake or treat object-only traffic as an avatar success.

### 5.4 RTMP SharedObject parsing

`session/rtmp_avatar_configs.py` reconstructs RTMP messages, decodes AMF0, parses SharedObject headers/events, and tracks changed properties.

For `Avatar.<avatarId>`, the `config` property is:

1. Base64 decoded;
2. zlib decompressed;
3. decoded as UTF-8;
4. parsed as XML;
5. rejected unless the root is `<avatar>`;
6. hashed and preserved as immutable evidence.

The same state may contain first name, last name/display name, owner/user ID, and other properties. The capture context supplies space ID. A valid observation therefore binds one configuration state to one avatar, room, capture, and time.

The parser does not invent omitted identity fields. AMF identity enrichment fills them later.

## 6. Space name and PNG resolution

### 6.1 Name sources

A name comes from a server response:

- Popular record description/name;
- `ls.lookupSpace` formatted as `LookupSpaceResult`;
- captured space profile/world-index evidence.

The evidence store upserts these by `space_id`, retains provenance/time, and never overwrites a good canonical name with blank data.

### 6.2 Image rules

`Paths.as` proves the selection:

- use an absolute snapshot/icon/thumb source directly when supplied;
- otherwise prefix the configured space-image path;
- when custom media is absent, use the model default snapshot/thumb/icon rule.

The crawler stores original source plus a same-origin cached image. Public records require both meaningful name and usable image.

### 6.3 Join

```text
Popular/lookup response                 RTMP capture
space_id -> name/model/image            space_id -> avatar/item observations
                \                       /
                 canonical_spaces[space_id]
                           |
                  public space name + PNG
```

An item inherits a space only from its captured space ID. Temporal proximity or a shared definition is not enough.

## 7. Owner, avatar name, and portrait resolution

### 7.1 Find Friends

`FindFriendsPanel.as` requires a legal query of at least two characters and calls:

```text
friend.searchForFriends(query, true)
```

through `FriendService.as`. Results provide human-readable identity and portrait metadata. Systematic two-character searches can therefore discover avatar names and exact portrait references.

Implementation path:

- `tools/smallverse_friend_search_protocol.py` builds/decodes the SWF-compatible AMF request;
- `tools/beacon_friend_search_bridge.py` executes it through an authenticated crawler;
- `tools/beacon_owner_avatar_identity_graph.py` persists owner/avatar evidence;
- `tools/cache_avatar_thumbnails_via_cdp.py` caches exact portrait URLs.

### 7.2 Owner to every avatar

Find Friends is discovery, not the complete account graph. Once an owner ID is known:

```text
avatarcore.getUsersAvatars(ownerId)
```

enumerates avatars under that account. Each response becomes an explicit edge:

```text
owner_id --has_avatar--> avatar_id
```

The edge stores its source and explicit default flag when present. Account pages may elevate the proven default but retain alternate avatars.

### 7.3 Name rules

Resolve an avatar name from:

1. latest trustworthy identity-service result;
2. explicit first/last name in that avatar's SharedObject;
3. previously verified canonical name for the identical avatar ID.

Never borrow a sibling avatar's name merely because both share an owner.

### 7.4 Portrait postfixes

`Paths.as` constructs:

```text
head:     avatarImagesPath + avatarId + headPostfix + ".png"
snapshot: avatarImagesPath + avatarId + snapshotPostfix + "_snap.png"
thumb:    avatarImagesPath + avatarId + thumbPostfix + "_thumb.png"
```

The postfix is opaque and cannot be decoded from avatar ID. It must come from a Find Friends/avatar result or captured exact URL. `cache_avatar_thumbnails_via_cdp.py` refuses to invent it and uses the authenticated browser when direct CDN access is rejected.

A public avatar therefore needs a real name and verified/cached portrait. Incomplete records remain private enrichment work; they do not appear as blank faces and hexadecimal labels.

## 8. Item instances, icons, and relationships

### 8.1 Captured item state

Room state can supply UID, model/source XML, owner ID, space, config XML, icon postfix, and protocol-specific sale/equipment fields. `Item.as` reacts to SharedObject changes: it decompresses `configXML` into `ItemConfig` and updates the instance icon when `iconPostfix` changes.

### 8.2 Icon URL

`Paths.getItemIconURL(uid, iconPostfix)` constructs:

```text
widgetImagesPath + "iconbmp_" + uid + "_" + iconPostfix + ".png"
```

Inventory and room item code use this rule. Shared/base items can use a different shared-icon rule. The authoritative PNG comes from the configured Smallverse host; Beacon caches it and records provenance.

An icon alone proves neither rarity, owner, location, nor configuration.

### 8.3 Relationship vocabulary

- `owned_by`: explicit owner evidence;
- `placed_in`: observed in room state;
- `listed_for_sale_in`: explicit listing evidence;
- `equipped_by`: explicit avatar config/wearing evidence.

Presence in a person's space does not prove ownership. Sharing an item definition does not prove an avatar wore a particular UID.

## 9. Observatory rarity gate

Recovered `Model.as` defines `rare` and `legendary` tags, and `OverlayBadge.as` uses them. The public Observatory catalog is intended to contain definitions whose source XML explicitly carries one of those tags:

```text
eligible = XML tag contains "rare" OR XML tag contains "legendary"
```

This gate does not delete common items required for avatar rendering. Common equipped instances remain private equipment evidence and never become rare merely because an avatar wears them.

`session/export-beacon-observatory-lite.py` assumes its `items` table was already gated upstream. Any helper expanding eligibility to “promoted,” name/price heuristics, or general usefulness violates the stated public contract.

## 10. Variant reconstruction

### 10.1 Definition plus instance state

A variant is a UID whose `configXML` chooses options from a reusable item definition:

```text
source XML -> option/material/asset definitions
UID state  -> selected configXML + iconPostfix + observed appearance
```

### 10.2 Two different outputs

The recovered client applies instance config and asks for an instance PNG using UID plus icon postfix. This yields two separate capabilities:

1. **authoritative captured icon**: fetch the exact Smallverse-rendered UID PNG;
2. **local reconstruction**: parse model XML plus config XML and reproduce the appearance from recovered assets.

The current public variant cache publishes PNG files recorded in `uid_instance_configs`; it is not evidence that every item has a complete independent local renderer. The lite exporter publishes only rows marked `rendered` whose PNG exists on disk.

### 10.3 Naming and record shape

The label must come from decoded selected options—color/material/pattern—not automatically from the base model. `src/lib/beacon/itemVariant.js` tries decoded labels/options and otherwise honestly returns `Variant not decoded`.

Required record:

```text
uid
source_xml
config XML or immutable config reference/hash
decoded selected options
human-readable variant label
icon postfix/source URL
same-origin PNG
space/capture provenance
render status and time
```

Never assign one UID-specific icon to all copies of the base definition.

## 11. Avatar config, body, and live actions

### 11.1 Authoritative input

The Avatar SharedObject's compressed `config` is the authoritative live state. The parser creates an immutable snapshot identified by avatar ID plus config SHA-256, capture time, and space ID.

The configuration should contain or resolve gender/body design, skin/material choices, head features, hair, clothing/equipment, and dances/behavior.

### 11.2 SWF behavior and local implementation

`AvatarConfig.as` proves decompression into XML. `Avatar.as` applies config changes and creates the sprite model from the selected design. Recovered `avatar.xml` defines nodes, textures, views, offsets, layers, frames, and animation timelines.

Local modules map to that design:

- `avatarSpriteXmlCompiler.js`: compile recovered sprite XML;
- `avatarAnimationPlanner.js`: choose frames, angles, nested timelines, offsets, flips, duration;
- `avatarEquipmentResolver.js`: resolve equipment selected by config;
- `avatarXmlBodyCompositor.js`: assemble body layers in authored draw order;
- head compositor modules: reconstruct the head;
- `SmallverseAvatarCompositeStage.svelte`: present the composition.

Supported local actions currently include Idle, Walk, LeftArmWave, and RightArmWave, driven from recovered XML rather than arbitrary CSS.

### 11.3 Fundamental algorithm

```text
captured <avatar> config
  -> resolve gender/base appearance
  -> resolve selected equipment definitions/fragments
  -> compile recovered avatar.xml
  -> choose animation + angle + frame tick
  -> resolve head/torso/arm/leg/shadow frames
  -> resolve sprite cells, offsets, flips, alpha, tint, blend
  -> layer base skin + equipment in authored order
  -> composite head
  -> draw frame
```

A head PNG is an identity reference/oracle, not full renderer input. Missing equipment fragments mean a partial reconstruction. The system must not substitute a default outfit and claim completeness.

### 11.4 Equipped versus room-observed

The lite exporter separates them:

- equipment enters only through explicit `avatar_wearing_uid` or `avatar_equipped_item` evidence;
- placed/listed observations remain separate;
- a UID is never attached to a body merely because it appeared nearby in time.

## 12. Automatic Spin

### 12.1 Boundary

Spin uses the personal-account VPS session, never crawler-01/02. Every mutation requires a receipt, bounded retry policy, and recorded server result.

### 12.2 SWF methods

`SpinToWinService.as` defines:

- `spintowin.getInitState`
- `spintowin.getFreeWheelCooldown`
- `spintowin.getFreePrize`
- `spintowin.getDeluxeSpinsRemaining`
- `spintowin.getSpinPrices`
- `spintowin.getDeluxePrize`
- `spintowin.purchaseDeluxeSpins`
- `spintowin.processDeluxeWin`

They use the same authenticated AMF endpoint. Prize/mutation calls request the secure endpoint form when the SWF sets that flag.

### 12.3 Free wheel

```text
getInitState/getFreeWheelCooldown
  -> wait until cooldown zero
  -> getFreePrize
  -> server returns prize + new cooldown
  -> client animates the server-selected prize
  -> refresh balance if needed
  -> persist receipt
```

The animation does not choose the prize. `FreeWheel.as` requests the prize first and animates around the result.

### 12.4 Deluxe wheel

```text
getInitState/getDeluxeSpinsRemaining
  -> optionally getSpinPrices
  -> optionally purchaseDeluxeSpins(count)
  -> getDeluxePrize
  -> animate returned prize
  -> processDeluxeWin(recordWinnerBoolean)
  -> refresh balance + persist receipt
```

`processDeluxeWin` is a distinct completion call. Skipping it makes the workflow incomplete.

### 12.5 Current truth

The repository contains protocol evidence, operator action discovery, preserved action/price files, and a Spin UI. It does not prove a complete continuously verified transactional worker and receipt ledger in this tree. Zoltar remains a placeholder route.

## 13. Canonical graph

```text
OwnerAccount(owner_id)
  has_avatar -> Avatar(avatar_id, name, portrait, default evidence)

Space(space_id, name, image, owner evidence)
  observed_avatar -> AvatarObservation(avatar_id, config snapshot, time)
  observed_item -> ItemObservation(uid, source_xml, time)

ItemDefinition(source_xml, name, rarity tags, base assets)
  has_instance -> ItemInstance(uid, config, icon, provenance)

AvatarConfigSnapshot(avatar_id, config_hash, captured_at, space_id)
  explicitly_equips -> ItemInstance(uid, slot, valid time)

ItemInstance
  explicitly_owned_by -> OwnerAccount
  explicitly_placed_in -> Space
  explicitly_listed_in -> Space/Market
```

Every edge requires source, time, and evidence class. Read models may join these tables; ingestion must not flatten them into one ambiguous “associated” list.

## 14. Complete flows

### 14.1 Popular room to avatar profile

```text
signed-in crawler
  -> live Popular response
  -> canonical space id/name/image
  -> occupied room
  -> real client room entry
  -> RTMP SharedObjects
  -> Avatar.<id>.config + identity fields
  -> config snapshot + avatar-space observation
  -> Find Friends/owner-avatar enrichment
  -> exact portrait caching
  -> referenced renderer asset resolution
  -> supported action rendering
  -> publish after name + portrait + canonical space join
```

### 14.2 Room object to rare item

```text
RTMP item instance
  -> uid + source_xml + configXML + iconPostfix + space_id
  -> parse source XML tags
  -> admit definition only if rare/legendary
  -> fetch/cache exact UID icon
  -> decode variant options
  -> join canonical space
  -> join explicit owner/avatar edges
  -> publish definition and individual UID variants
```

### 14.3 Find Friends to owner profile

```text
two-character query
  -> friend.searchForFriends
  -> avatar id + name + owner id + portrait metadata
  -> avatarcore.getUsersAvatars(owner id)
  -> retain every account avatar
  -> mark default only from explicit evidence
  -> cache exact media
  -> merge RTMP configs by avatar id
```

## 15. Proven versus incomplete

### Proven

- SWF AMF method naming and argument authentication;
- server-driven Popular discovery;
- real-client VPS room navigation and bounded RTMP capture;
- AMF0 SharedObject parsing and avatar config decompression;
- Find Friends and owner-to-avatars service calls;
- avatar, space, and item URL construction rules;
- item config/icon postfix synchronization;
- recovered avatar XML compilation and partial compositor;
- explicit separation of equipped and room-observed items;
- server-selected Spin prize sequence.

### Incomplete/end-to-end unproven

- owner/avatar enrichment for every captured avatar;
- explicit default-avatar coverage;
- public name/portrait completeness;
- canonical space joins for every item observation;
- complete equipment extraction from every live config;
- complete reconstruction of every clothing/accessory asset;
- a locally versioned variant reconstruction worker distinct from captured UID PNG publication;
- complete Spin receipt-backed automation;
- Zoltar execution and transaction ingestion.

## 16. Non-negotiable invariants

1. Raw IDs are join keys, not user-facing labels.
2. A public avatar has a resolved name and verified portrait.
3. A public space relationship has a canonical name and image.
4. Owner-to-avatar membership comes from explicit evidence.
5. Default avatar status is never guessed from recency or `active` alone.
6. Public Observatory definitions are XML-tagged rare or legendary only.
7. Common equipped items do not enter the rare catalog.
8. Placed, listed, owned, and equipped remain distinct.
9. A UID variant retains its own config and icon.
10. Opaque media postfixes are captured, never guessed.
11. A head PNG is not a full avatar render.
12. Partial renders remain labeled partial.
13. Crawling stays bounded, sequential, and cooldown-aware.
14. Personal transactional sessions stay separate from crawlers.
15. Every public statement traces to XML, service response, capture, or tested transform.

## 17. Source map

Recovered client:

- `recovered-swfs/main.swf`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/endpoint/AMFEndpoint.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/endpoint/AMFHTTPEndpoint.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceEndpoint.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/result/space/SpacePanelItem.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/Paths.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/player/dockPanels/me/FindFriendsPanel.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/friend/FriendService.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/entity/avatar/Avatar.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/entity/avatar/AvatarConfig.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/entity/item/Item.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/entity/item/ItemConfig.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/item/result/Model.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/spin/ui/FreeWheel.as`
- `recovered-swfs/main-source/scripts/com/smallworlds/spin/ui/DeluxeWheel.as`

Acquisition and parsing:

- `tools/smallverse_popular_protocol.py`
- `tools/fetch_popular_spaces_via_cdp.py`
- `tools/select_fresh_popular_spaces.py`
- `session/vps_popular_avatar_collector.sh`
- `session/vps_real_client_crawl.sh`
- `session/rtmp_avatar_configs.py`
- `tools/smallverse_friend_search_protocol.py`
- `tools/beacon_friend_search_bridge.py`
- `tools/beacon_owner_avatar_identity_graph.py`
- `tools/cache_avatar_thumbnails_via_cdp.py`

Projection and rendering:

- `session/export-beacon-observatory-lite.py`
- `src/lib/beacon/itemVariant.js`
- `src/lib/avatar-renderer/avatarSpriteXmlCompiler.js`
- `src/lib/avatar-renderer/avatarAnimationPlanner.js`
- `src/lib/avatar-renderer/avatarEquipmentResolver.js`
- `src/lib/avatar-renderer/avatarXmlBodyCompositor.js`
- `src/lib/components/avatar/SmallverseAvatarCompositeStage.svelte`

This map is the path for auditing a UI claim back to recovered behavior and captured evidence.

## 18. Exact AMF request anatomy

### 18.1 Remoting envelope

The helpers in `tools/smallverse_friend_search_protocol.py` and `tools/smallverse_popular_protocol.py` construct the byte-level request rather than posting JSON. The general envelope is:

```text
u16 envelope version       = 3
u16 header count           = 0
u16 message count          = 1
u16 target length
bytes target               = exact service method
u16 response URI length
bytes response URI         = "/<call-id>"
u32 body length
bytes AMF0 body
```

The body for an argument array begins with AMF0 strict-array marker `0x0A`, followed by its 32-bit element count. Values use their AMF0 markers: string `0x02`, boolean `0x01`, number `0x00`, and so forth.

### 18.2 Authentication context

`AMFEndpoint.addAuthenticationToken` walks the original arguments before transmission. For each argument:

- string: append at most the first 256 characters;
- number: append the ActionScript string representation;
- boolean/object: do not add to hash material.

If eligible material exists, it constructs:

```text
timer = Flash getTimer() in milliseconds
digest = MD5(clientKey + timer + concatenatedArgumentMaterial)
context = digest + "," + timer
wireArguments = [context, ...originalArguments]
```

The static key is present in recovered source and protocol code, but operational documentation should not repeat reusable authentication constants or session values.

### 18.3 Find Friends wire arguments

Recovered call:

```text
FriendService.searchForFriends(callback, query, true)
target: friend.searchForFriends
original arguments: [query, true]
hash material: query only
wire arguments: [authContext, query, true]
```

The final boolean requests broad results rather than an already-friends-only list. `normalize_query` lowercases/trims and enforces the recovered minimum of two characters.

### 18.4 Owner avatars wire arguments

Recovered call:

```text
target: avatarcore.getUsersAvatars
original arguments: [ownerId]
hash material: ownerId
wire arguments: [authContext, ownerId]
```

Nothing in this request derives avatar IDs mathematically. The server returns the membership list.

### 18.5 Gateway execution

`tools/beacon_friend_search_bridge.py` loads an already-renewed crawler profile from the VPS session-profile vault. It extracts the active cookie/session only in memory and posts `application/x-amf` to the session gateway with Flash-compatible request headers. It deliberately:

- does not perform login;
- does not print cookies or session IDs;
- does not serialize raw AMF into public output;
- writes private manifests atomically with restrictive permissions;
- persists a monotonically advancing Flash-shaped timer so process restarts do not replay one context.

The bridge first executes Find Friends, deduplicates discovered owner IDs, then performs at most the configured number of owner follow-ups. A failed owner call increments a failure count without destroying successful Find Friends rows.

## 19. Exact identity response fields

### 19.1 Find Friends response

`avatar_rows` decodes the response `list`. For each `Person` it reads:

```text
Person.user.id                  -> owner_id
Person.user.firstName           -> owner_first_name
Person.user.lastName            -> owner_last_name
Person.avatar.id                -> avatar_id
Person.avatar.firstName         -> avatar first name
Person.avatar.lastName          -> avatar last name
Person.avatar.gender            -> gender
Person.avatar.homeSpaceId       -> home-space hint
Person.avatar.currentSpaceId    -> current-space hint
Person.avatar.currentInstanceId -> live-instance hint
Person.avatar.headUrl           -> exact head URL
Person.avatar.thumbUrl          -> exact thumb URL
Person.avatar.snapshotUrl       -> exact snapshot URL
Person.avatar.online            -> observation-time presence
Person.avatar.isFriend          -> relationship to crawler account
Person.avatar.isReciprocal      -> reciprocal relationship flag
```

Captured evidence shows `Person.avatar`, not a sibling `Person.avatarId`, is the authoritative nested avatar. The parser intentionally ignores invalid 24-hex IDs.

Find Friends proves that this avatar was returned beside this user/owner. It does **not** prove that the avatar is the account default.

### 19.2 `getUsersAvatars` response

`owner_avatar_rows` reads:

```text
id/avatarId          -> avatar_id
fName/firstName      -> first name
lName/lastName       -> last name
fullName             -> display name
nameInstance         -> name discriminator when present
headUrl              -> exact head URL
thumbUrl             -> exact thumb URL
snapshotUrl          -> exact snapshot URL
isDefault            -> valid primary/default evidence
active               -> retained lifecycle state only
created              -> creation metadata
config variants      -> complete avatar XML when actually returned
```

Explicit non-user avatar types are excluded so pets/NPCs do not become account avatar slots.

### 19.3 Canonical identity tables

`tools/beacon_owner_avatar_identity_graph.py` owns three tables:

```text
identity_owner_accounts_v1
  owner_id PK
  display_name
  first_observed_at
  last_observed_at

identity_avatar_entities_v1
  avatar_id PK
  first_name, last_name, display_name, gender
  head_url, thumb_url, snapshot_url
  first_observed_at, last_observed_at

identity_owner_avatar_evidence_v1
  evidence_id PK
  owner_id FK
  avatar_id FK
  source_method, source_ref, source_query
  observed_at, relationship_basis
  is_default nullable boolean
  is_selected nullable boolean
  sanitized raw_ref
```

Upserts preserve non-empty identity/media values and expand first/last observation bounds. Relationships are append-only and deduplicated by a hash of the evidence identity. This prevents a later sparse response from erasing a previously resolved name.

## 20. Popular response anatomy

### 20.1 Recovered and current protocol generations

The recovered SWF exposes `space.viewPopSpaces(offset, count)`. The current helper also models:

```text
catalog_category.getActiveSpaceCategoryTree()
catalog_entry.getSpacesForCategory(categoryId, offset, limit)
GET /api/space/popular
```

These are protocol generations for the same server-owned concept. The implementation must record which source produced a manifest rather than pretend they are byte-identical.

### 20.2 Category resolution

The category helper walks the returned category tree, accepts valid server IDs, prefers an exact case-insensitive `Popular` name, and otherwise accepts a category explicitly marked controlled by popularity. It fails unless exactly one active category remains. This avoids choosing an arbitrary category when the server response is ambiguous.

### 20.3 Space row normalization

For every server row, the helper validates:

```text
id               -> 32-hex space_id
currentVisitors  -> non-negative whole number
desc             -> name
spaceOwner       -> owner_id when valid
avatarId         -> owner/display avatar hint when valid
avatarFName      -> avatar first name
avatarLName      -> avatar last name
source order     -> stable tie-breaking order
```

The recovered `SpacePanelItem` additionally defines model, icon, thumbnail, snapshot, description, details, and related presentation fields. The acquisition manifest must retain those when the active endpoint returns them.

### 20.4 Freshness and queue semantics

The collector manifest is rejected if stale or malformed. The selector tracks three histories separately:

- successful room visits;
- rooms that opened but emitted no Avatar SharedObject;
- genuine runner failures.

Each has a bounded timestamp map and separate cooldown. A no-avatar room is not success and is not a broken crawler. A genuine runner error fails the service run. Successful rooms are eligible for re-crawl after the configured interval so avatar state can evolve.

## 21. RTMP decoding internals

### 21.1 Packet reassembly

`session/import_vps_live_capture.py` converts captures into a stable Ethernet PCAP representation, then:

1. parses packet headers;
2. keeps server-to-client TCP payloads whose source port is 1935;
3. groups flows by endpoints;
4. sorts TCP segments by sequence number;
5. removes retransmitted overlap;
6. concatenates the largest relevant server stream.

The parser tries the offset after a full RTMP handshake and a stripped-stream fallback. This is necessary because avatar config Base64 normally spans multiple TCP packets and cannot be recovered reliably with packet-local regexes.

### 21.2 RTMP chunks and messages

`session/rtmp_avatar_configs.py` handles RTMP chunk headers, extended timestamps, message stream state, and reassembly before AMF decoding. The resulting SharedObject message contains:

```text
u16 name length + name
u32 version
8-byte flags
repeated events:
  u8 event type
  u32 event length
  event payload
```

Change events contain repeated UTF keys and AMF0 values. The state accumulator applies changes across messages rather than treating one event as a complete object.

### 21.3 Avatar observation output

For every distinct avatar/config hash, the decoder records:

```text
avatar_id
shared_object name
RTMP version and timestamp
space_id
owner_id when present
first_name, last_name, display_name
gender from avatar XML
portrait postfix hints when present
compressed_config
config_xml
config_sha256
safe state metadata
```

Raw PCAP and compressed values remain private. Sanitized XML and metadata are written under a capture-specific artifact directory.

### 21.4 Defensive fallback

The importer contains a byte-search fallback for historic/incomplete captures. It accepts a candidate only when Base64 and zlib succeed and the result begins with a real `<avatar>` document. This fallback is less authoritative than the structured RTMP parser and should be identified as such in provenance.

## 22. Capture import and persistence handoffs

`session/import_vps_live_capture.py` performs two parallel extractions:

```text
PCAP
  -> smallverse_core observatory parser
     -> XML sources
     -> item observations
     -> protocol events

PCAP server stream
  -> rtmp_avatar_configs
     -> avatar configuration artifacts
     -> beacon-avatar-render-queue.json
```

It then creates a per-session SQLite database, upserts session metadata, inserts observations and protocol events, and commits atomically.

The expensive Observatory merge is **not** automatic in the normal crawler path. It runs only when `--sync-observatory` is explicitly requested. The default reports `deferred_bounded_export`. This is the VPS-protection mechanism that avoids repeatedly rebuilding a multi-gigabyte Observatory file after each room.

The importer depends on `smallverse_core`, whose authoritative VPS runtime lives outside this repository. That external package owns the base session database schema and generic observatory parser. This dependency boundary must be documented because the repository alone cannot fully audit or reproduce those internals.

### 22.1 Render queue behavior

The render queue is keyed by avatar ID. A newly captured valid config replaces the current queue entry for that avatar and retains:

```text
avatar_id
gender
config_sha256
full config_xml
captured_at
space_id
display_name
thumb_postfix
```

This queue is a latest-render-input projection, not the full historical ledger. Immutable per-capture artifacts retain history.

## 23. Observatory-lite export contract

The bounded exporter reads:

- `items`: already-gated public definitions;
- `uid_instance_configs`: UID variant records and their render state;
- `observations`: item/owner/price/session evidence;
- `protocol_events`: explicit wearing/equipment events;
- optional wearing sidecar;
- avatar render queue;
- canonical world/space index.

It writes `beacon-observatory-lite/v3` with:

```text
assets
observations
uid_change_events
variant_visuals
avatar_wearing_events
avatar_config_snapshots
sync_metadata
```

### 23.1 Canonical-space admission

For each observation it looks up the latest UID-to-space relation, then the world index entry. Only a world row containing `space_id`, non-empty `space_name`, and an image is admitted. Incomplete rows remain in the source database and increment `pending_space_enrichment`.

This is publication filtering, not deletion and not a claim that the crawler should normally omit names/images. The correct upstream goal remains complete capture/enrichment.

### 23.2 Wearing admission

Only protocol event types `avatar_wearing_uid` and `avatar_equipped_item` enter the equipped projection. A row requires valid avatar ID, UID, and item-definition XML; avatar body XML is excluded. Owner ID may be null when the wearing packet did not state it.

Every exported relationship carries an evidence hash, capture/session reference, observation time, and optional explicit avatar-config snapshot ID. It deliberately refuses a time-only snapshot join.

### 23.3 Variant admission

A variant row is published only when:

- `variant_icon` is non-empty;
- `variant_render_status` equals `rendered`;
- the referenced PNG still exists in the variant icon directory.

The first available variant icon can decorate the base asset preview, while all UID-specific rows remain in `variant_visuals`. The base decoration must never erase the distinction between variants.

## 24. Public API read path

### 24.1 Routes

`apps/api/src/modules/legacy/public-routes.ts` exposes, among others:

```text
GET /api/v1/search
GET /api/v1/observatory/item?source_xml=...
GET /api/v1/items/profile?source_xml=...
GET /api/v1/avatars/:avatarId
```

The data store loads bounded JSON exports with timeouts. The route does not query live crawler sessions directly.

### 24.2 Public search

`data-store.ts` computes observation, UID, owner, and latest-seen counts by source XML, but the final search result is explicitly filtered to `is_rare || is_legendary`. A text query narrows this eligible collection; it does not promote common records.

### 24.3 Item profile builder

`buildItemProfile`:

1. normalizes source XML aliases;
2. finds the canonical asset;
3. gathers evidence for that definition;
4. builds avatar lookup data from world/avatar index plus identity graph;
5. resolves public-ready avatars;
6. builds owner rows only when a valid display avatar exists;
7. builds canonical spaces from evidence/world joins;
8. separates explicit avatar relationships;
9. attaches UID-specific variant visuals;
10. returns the item, stats, owners, spaces, avatars, relationships, latest evidence, and technical provenance.

Cached item profiles are merged at read time with newly refreshed portrait and identity exports so a stale cache does not permanently erase owner/avatar media.

### 24.4 Avatar profile builder

`buildAvatarProfile` merges:

- world/avatar index;
- RTMP avatar manifest;
- owner/avatar identity graph;
- cached item-profile identity evidence;
- Observatory evidence;
- explicit wearing events;
- render queue/config snapshots.

It builds account membership, sibling avatars, spaces, relationships, config snapshots, item summaries, render hints, and stats. Its current compatibility `items` field is derived from all evidence matching the avatar ID; new consumers should prefer the typed relationship buckets.

### 24.5 Current remaining read-model danger

The file still contains compatibility and promotion logic from older generations. In particular, space-profile code can describe “rare, legendary, price-backed, or otherwise promoted” items. That is not the strict public Observatory rule and must not leak back into catalog admission. The canonical contract is the strict data-store search filter plus XML rarity provenance.

## 25. Renderer internals in more detail

### 25.1 Compile stage

`avatarSpriteXmlCompiler.js` transforms recovered XML into indexed structures:

```text
texturesById
nodesById
node frames/layers/views
animationsById
frame references and durations
```

It preserves authored ordering because draw order and tie-breaking depend on XML order.

### 25.2 Animation planning

`avatarAnimationPlanner.js`:

- normalizes the requested angle;
- selects an exact authored view, then `ANY_ANGLE`, then nearest authored view;
- resolves global frames and nested node animations;
- combines node, global-frame, layer, and view offsets;
- resolves texture cell, flip, alpha, blend, and frame duration;
- expands nested timelines using their least common cycle.

The recovered sheets use 90 degrees for the forward-facing oracle; zero degrees is a profile direction. Treating zero as front produces misaligned bodies.

### 25.3 Equipment resolution

The equipment resolver must interpret captured avatar selections and load the corresponding authored item fragment XML. A slot result needs source XML, selected option/config, composite texture IDs, layer priority, tint/material mapping, and evidence origin.

Unknown source XML or a fragment lacking the expected composite IDs stays unresolved. It must not be painted as generic clothing.

### 25.4 Compositing

The body compositor uses recovered node order:

```text
Shadow
LeftLegWhole
RightLegWhole
Torso
LeftArm
RightArm
Head
```

For each resolved layer it emits URL, canvas position, sprite grid cell, flip, alpha, blend, tint, role, priority, and evidence. Base skin and equipment fragments are combined. Head composition is separately anchored to the recovered head node.

The canvas is currently 128x256. A render is oracle-comparable only for the calibrated forward Idle frame. Other animation frames can be valid without matching the static captured portrait.

### 25.5 Capture oracle versus reconstruction

`avatarRenderSource.js` ranks captured Flash calibration/full-body/preview/thumb evidence ahead of preserved profile assets. These are comparison targets and fallbacks. A reconstructed body is a deterministic transform of config plus assets; a captured Flash PNG is evidence of what the original client produced. They must be displayed and labeled separately during calibration.

## 26. Spin result state, not just method names

`SpinToWinService` caches state from results:

- `getInitState`: cooldown remaining, deluxe prize catalog, deluxe spins remaining, recent winners, server time;
- `getFreeWheelCooldown`: cooldown and local synchronization timer;
- `getFreePrize`: awarded free prize and new cooldown;
- `getDeluxeSpinsRemaining`: integer balance;
- `getSpinPrices`: purchase-price list;
- `getDeluxePrize`: awarded prize and remaining spins;
- `purchaseDeluxeSpins`: updated remaining-spin count;
- `processDeluxeWin`: recent winners and update event.

The displayed countdown is computed as server cooldown minus elapsed client timer, clamped to zero. Automation should use server result state rather than a local wall-clock guess.

A complete receipt needs:

```text
operation ID and idempotency key
personal session profile label
SWF method and sanitized argument summary
request time and response time
HTTP/AMF success classification
server result type
prize identity/value
cooldown or spin balance before/after when known
transaction/listing reference when returned
evidence hash
failure/retry disposition
```

## 27. Failure taxonomy and correct response

| Failure | Meaning | Correct response |
|---|---|---|
| No signed-in crawler browser | Session/control surface absent | Stop discovery; renew/open profile |
| Popular manifest stale | Room list cannot be trusted as live | Fail closed; fetch again |
| No occupied rooms | Valid empty moment | Wait for next scheduled run |
| Room has no Avatar SharedObject | Occupants left or state not emitted | Record bounded miss; retry later |
| No RTMP packets | Capture/interface/navigation failure | Fail runner; inspect client/interface |
| TCP stream incomplete | Packet loss or wrong framing | Preserve capture; do not publish config |
| Config Base64/zlib/XML invalid | Not an avatar config or truncated data | Reject candidate |
| Avatar has ID but no name | Identity enrichment incomplete | Keep private; run Find Friends/owner lookup |
| Avatar has name but no portrait | Exact postfix/URL missing or cache failed | Keep private; recover exact media URL |
| Space ID without name/image | Canonical space enrichment incomplete | Keep relation private; perform lookup/image cache |
| UID lacks source XML | Cannot identify definition | Preserve raw evidence; do not publish item |
| Definition lacks rare/legendary tag | Common item | Exclude from public catalog, retain private evidence |
| Variant config exists but label absent | Options not decoded | Show `Variant not decoded`, never base-name fiction |
| Variant DB says rendered but PNG missing | Stale cache row | Do not publish broken URL; repair cache |
| Avatar equipment asset unresolved | Reconstruction incomplete | Label partial and list missing source |
| Owner has several avatars and no default flag | Primary unknown | Show account avatars without inventing primary |
| Observatory merge overloads VPS | Unbounded/too-frequent export | Keep per-capture import bounded; schedule controlled merge |
| AMF returns HTTP error | Session, endpoint, request context, or server failure | Sanitize log; classify; do not expose body/secrets |
| Spin prize obtained but completion omitted | Transaction workflow incomplete | Do not mark complete; reconcile before retry |

## 28. Definition of done per public entity

### Avatar

- valid avatar ID;
- real display name;
- verified same-origin portrait backed by exact source URL;
- owner membership when known, without guessed default;
- canonical observed spaces;
- latest valid config snapshot when captured;
- renderer status that distinguishes captured, complete reconstruction, partial, and missing;
- equipped items only from explicit evidence.

### Space

- valid ID internally;
- real name publicly;
- cached icon/thumb/snapshot;
- source provenance;
- owner identity when explicit;
- visitor count tied to observation time;
- observed avatars/items linked through this exact ID.

### Item definition

- canonical source XML;
- parsed name/description/category/tags;
- explicit rare or legendary provenance for public admission;
- representative base icon;
- observed copy/owner/space counts computed from canonical evidence.

### Item instance variant

- valid UID;
- definition link;
- config evidence;
- decoded selections or honest unresolved label;
- exact/cached UID icon;
- captured location/time;
- explicit owner/listing/equipment edges only.

### Spin receipt

- personal session boundary;
- complete SWF call sequence;
- server result and before/after state;
- immutable evidence reference;
- explicit terminal success, retryable failure, or reconciliation-required status.

## 29. What the first version still did not fully explain

The earlier sections described architecture but omitted enough implementation detail to leave ambiguity about:

- exact AMF bytes and authentication arguments;
- precise Find Friends and owner-avatar response fields;
- how RTMP TCP segments become SharedObject state;
- which component creates which artifact/database/read model;
- the external `smallverse_core` dependency boundary;
- how the API merges cached and current evidence;
- why captured variant PNG publication is not identical to local reconstruction;
- how the renderer resolves views, nested timelines, equipment, and completeness;
- how every common failure should affect publication.

Sections 18–28 are the implementation specification for those missing layers. Future code changes should cite the relevant invariant, input contract, output contract, and failure behavior from this document before implementation.
