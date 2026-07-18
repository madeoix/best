# RTMP and SharedObject catalog

## Connection contract

Evidence: **Recovered** in `recovered-swfs/main-source/scripts/com/smallworlds/service/channel/ChannelEndpoint.as`.

1. An HTTP/AMF lookup supplies a `Location` containing `hostname`, `channelId`, and `instanceId`.
2. The client constructs `rtmp://<hostname>:1935/swcs/<channelId>` and appends `_<instanceId>` when the instance is positive.
3. `NetConnection.objectEncoding` is AMF0.
4. The connection arguments are session ID, client generation string `"1"`, optional room password, and settings location.
5. After connecting, the client opens the remote SharedObject named `avatars` through `SharedArrayCollection`.
6. The client listens for collection-change events and treats that collection as room presence.
7. Failed native RTMP performance causes a reconnect attempt; the recovered code’s alleged tunneling branch currently constructs the same RTMP URL, so actual RTMPT behavior is unresolved.

The crawler therefore cannot obtain room state from a guessed Popular slug. It must first resolve a live channel/location and then reproduce the connection and SharedObject subscription.

## Recovered remote-object primitives

| Primitive | Meaning | Source |
|---|---|---|
| `RemoteObject.getRemote` | Wraps `SharedObject.getRemote`, queues work until synchronized, and exposes `data` and `send` | `recovered-swfs/main-source/scripts/com/smallworlds/net/rso/RemoteObject.as` |
| `SharedArrayCollection` | Projects a remote SharedObject into ordered collection events | `recovered-swfs/main-source/scripts/com/smallworlds/net/rso/SharedArrayCollection.as` |
| `SharedAvatarCollection` | Entity-aware collection specialized for avatars | `recovered-swfs/main-source/scripts/com/smallworlds/net/rso/SharedAvatarCollection.as` |
| `SharedEntityCollection` | Entity-aware collection for general room entities | `recovered-swfs/main-source/scripts/com/smallworlds/net/rso/SharedEntityCollection.as` |
| `SharedObjectCollection` | Collection plus optional remote controller routing | `recovered-swfs/main-source/scripts/com/smallworlds/net/rso/SharedObjectCollection.as` |
| `SharedObjectController` | Coordinates shared-object references, requests, and current controller | `recovered-swfs/main-source/scripts/com/smallworlds/net/rso/controller/SharedObjectController.as` |
| `ControllerSharedObject` | Controller-backed individual shared object | `recovered-swfs/main-source/scripts/com/smallworlds/net/rso/controller/ControllerSharedObject.as` |

## RTMP message handling implemented by Smallverse Lab

Evidence: **Implemented** in `session/rtmp_avatar_configs.py` and `session/import_vps_live_capture.py`.

The decoder performs these stages:

1. Reassemble server-to-client TCP payloads by sequence number from packets whose source port is 1935.
2. Remove duplicate/retransmitted byte ranges.
3. Try a stream offset of 3073 for S0/S1/S2 handshake-bearing captures, then offset 0 for an already stripped stream.
4. Parse RTMP basic headers, including one-, two-, and three-byte chunk stream IDs.
5. Reconstruct type 0, 1, 2, and 3 message headers.
6. Track negotiated chunk size and assemble messages across chunks.
7. Reject messages above 16 MiB and nesting deeper than 50 AMF levels.
8. Decode AMF values and shared-object message bodies.
9. Accept avatar objects whose name begins `Avatar.` and whose suffix is a 24-hex avatar ID.
10. Locate compressed configuration state, base64-decode it, zlib-inflate it, and require an `<avatar>` XML root.
11. Hash both compressed and expanded representations.
12. Write sanitized XML and metadata; never publish the raw PCAP or session credential.

## Avatar observation record

`AvatarConfigObservation` currently carries:

| Field | Meaning | Provenance |
|---|---|---|
| `avatar_id` | 24-hex entity ID from `Avatar.<id>` | SharedObject name |
| `shared_object` | exact remote-object name | RTMP event |
| `rtmp_version` | SharedObject event version | RTMP message |
| `rtmp_timestamp` | message timestamp | RTMP header |
| `space_id` | room context supplied to decoder | capture session/channel metadata |
| `owner_id` | account ID if present in state | decoded avatar state; nullable |
| `display_name`, `first_name`, `last_name` | names if present in state | decoded avatar state; not a substitute for identity enrichment |
| `gender`, `model` | avatar construction hints | decoded state/config |
| `head_postfix`, `thumb_postfix`, `snapshot_postfix` | content-address suffixes | decoded avatar state |
| `compressed_config` | original encoded configuration | decoded state; private evidence |
| `config_xml` | inflated authoritative avatar document | derived from compressed config |
| `compressed_sha256`, `config_sha256` | integrity identifiers | local hashing |
| `state` | decoded source object | raw normalized evidence |

## Imported capture artifacts

`session/import_vps_live_capture.py` creates or updates:

- a per-session SQLite database containing observations and protocol events;
- `avatar-configs/<avatar_id>/<config_sha256>.xml`;
- `avatar-configs/manifest.json`;
- `beacon-avatar-render-queue.json`, containing sanitized configuration XML and non-secret metadata;
- optional Observatory synchronization only when `--sync-observatory` is explicitly requested.

The expensive Observatory merge is deliberately deferred in the normal crawler path. This is a resource-safety boundary, not missing functionality.

## Entity-event meanings

| Event family | What it may prove | What it does not prove |
|---|---|---|
| avatar added/updated | avatar was present and exposed a state at a time in a room | account ownership of room contents |
| avatar removed | presence ended | logout, ban, or permanent departure reason |
| item/object added/updated | a UID/config was present in the room state | avatar ownership or equipped status |
| item/object removed | instance left observed state | deletion, sale, inventory transfer, or owner |
| room/channel lookup | channel corresponds to requested space at lookup time | permanent channel identity |
| SharedObject config | exact captured appearance state | that it is the owner account’s primary avatar |

## Retained capture receipt

The VPS retains a historical bounded room capture at `/opt/smallverse/automation-workspace/live-captures/manual-popular-1784074791/raw/popular-join.rtmp-live.pcapng` (538,091 bytes, SHA-256 `19f12be39cfb64e9ae59e03cbd30e60fd85e24cea68e5a969b07c26966b31e29`). Its imported protocol stream contains 3,535 events, eight distinct avatar IDs, 363 distinct UIDs and 88 decoded configurations. Event types include avatar equipped/wearing relations, object/world observations, space state, market/listing markers and avatar dirty-snapshot state.

This is captured historical proof of the RTMP decoder path. It is not a fresh Popular receipt and does not convert heuristic `owner_or_avatar`, co-presence or `dirtySnapshot` markers into canonical ownership.

## Supplied historical room corpus

The read-only archive analyzed in [Old captures evidence report](./OLD-CAPTURES-EVIDENCE-REPORT.md) adds a stronger room-state specimen. `test3.pcapng` yields 27 distinct `Avatar.<id>` objects and 27 distinct, valid inflated `<avatar>` configurations. Every decoded avatar has a name, gender, and head/thumb/snapshot postfix. The same major server stream contains 102 item states, 36 item models, two space states, and the collection objects `Items` and `Avatars`.

| Object | Captured field families |
|---|---|
| `Avatar.<avatar-id>` | avatar ID, first/last/display names, full compressed config, model/gender, head/thumb/snapshot postfixes, animation/action state, equipped/wearing state, roles and profile state |
| `Item.<uid>` | UID, model, `ownerId`, per-instance `configXML`, `forSale`, `price`, `priceTokens`, position/angle, parent item, access/edit/move state and counters |
| `Space.<space-id>` | UID, name, `ownerId`, config/model, visitor/access state, sale state and group metadata |
| `Items` collection | room item UIDs and collection membership |
| `Avatars` collection | room avatar IDs and presence membership |

This establishes the reconstruction boundary: RTMP supplies live avatar configuration and animation state, while XML/SWF assets define how that state is rendered. It does not establish an account edge for those avatars: the captured `Avatar.<id>` states contain no owner ID. `Item.ownerId` and `Space.ownerId` are user/account IDs and must be expanded through a typed account-avatar response.

The supplied Zoltar capture separately proves registration of a widget `Collection._USERS_` persistent property. It does not expose the HTTPS iframe transaction performed by the widget UI.

## Capturer responsibilities

The capture process must retain a receipt linking:

- crawler profile;
- session generation/fingerprint, never the cookie value;
- requested category and returned Popular row;
- space ID, channel ID, hostname, and instance;
- PCAP hash and path;
- parser version;
- counts of RTMP messages, SharedObject messages, avatar objects, item objects, configs, and errors;
- start/end timestamps and exit status.

Without that receipt, decoded entities cannot be reliably attributed to a room or crawler run.

## Known unresolved RTMP questions

1. The supplied corpus proves `Avatars`, `Items`, `Avatar.<id>`, `Item.<uid>`, `Space.<id>`, and a widget `Collection._USERS_`; the complete vocabulary across multiple current rooms remains uncataloged.
2. Some item state is parsed by compatibility/fallback logic; exact field semantics need paired SWF-class and capture verification.
3. The recovered controller-routing protocol is broader than the crawler’s decoder and has not been recreated completely.
4. Primary-avatar semantics are not proved by room presence.
5. Whether every server generation still uses the same channel lookup and AMF0 connection arguments requires a fresh retained capture.
6. A successful room join does not guarantee a configuration event if the server does not replay existing SharedObject state as expected.
