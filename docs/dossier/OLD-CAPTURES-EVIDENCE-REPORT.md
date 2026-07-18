# Old captures evidence report

This report records the read-only analysis of `/home/maddie/Documents/old-captures.tar.gz` performed on 2026-07-16. The archive was extracted only under `/tmp`; no capture was imported into the application, no session credential was retained in this dossier, and no application source was changed.

## Chain of custody

Archive SHA-256: `9e46ae036e13d54a6ab0546c98573e7dc7efd5401e6fc84610a881ea4afffbc2`

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `auction.pcapng` | 69,527,316 | `563b85b398455f07afdfdf99d17132a9c7f30de1131291774e82e557e24fca4e` |
| `auction.saz` | 107,469,645 | `77e874d4103bfc63ad6a99750ed1d9266d83e22153c705b813559e21c4a89943` |
| `buying_from_store.pcapng` | 7,531,520 | `1b6092006287ef805312c12d501fceff485ca867dae1b16052657c094895e1d2` |
| `buyingfromstore69.pcapng` | 28,117,760 | `d593b1abb12cd82d8b474a6b23029ec6d70b750832c362345c63ef0b8aedfd22` |
| `findfriends-capture.zip` | 8,920,545 | `4eb93d6671e495161270bd3b7195984589135a6c8c014a46baa7adee32f12c61` |
| `svtest2.saz` | 54,969,542 | `1d5c9137ee5058e41126b0f0f7bf3408c763c74b93ac01edbdf281b82d05019f` |
| `test.pcapng` | 90,269,772 | `0aad3fae24ab3a98fc627d2fd9774e453875094941211be3454f653993cbc84d` |
| `test3.pcapng` | 143,772,972 | `9b3e92ef6cb6e2e389a1d19792091aacb6c4ebda3cfd59545d7d71df89f32b90` |
| `tranquil.pcapng` | 73,553,024 | `7b0c8cbdacff7638e6abd37bbef2e8247df3ce8e587ea2f99ff37333d2152198` |
| `tranquil.saz` | 52,604,293 | `22ec14a47e2f705bb3eced1f16b6481a16993f0ae6dd062b918d79e716997c5b` |
| `zoltar.pcapng` | 8,379,120 | `f50a5f4e29b5c0b96c8921c36fe69b9f45f6be983886eb79a7584a3a05522f42` |
| `zoltar.saz` | 3,952 | `b6fb0af1ff6b836edecb3920d95633cd4d68d870a86d4ae4f0f328b9899b5101` |

The HTTP sessions were decoded as Fiddler SAZ request/response pairs. AMF envelopes were decoded with `tools/smallverse_amf.py`. RTMP server streams were sequence-reassembled and decoded with `session/rtmp_avatar_configs.py`. HTTP authorization material, cookies, gateway paths, email addresses, and raw personal identifiers are intentionally excluded from this report.

## AMF census

The three substantive SAZ files contain 437 successfully decoded AMF request envelopes with no AMF decoder failures:

| Session | AMF requests | Relevant calls captured |
|---|---:|---|
| `auction.saz` | 194 | room lookup/info, member list, Find Friends, account/avatar selection, inventory, item actions, marketplace read, Spin initialization/prices/free prize |
| `svtest2.saz` | 196 | room lookup/info, account/avatar selection, inventory, transactions, catalog/item checks, Spin initialization/prices |
| `tranquil.saz` | 47 | account/avatar selection, room lookup/info, inventory, widget content |

The captures verify actual response classes and fields, not merely recovered method names. Important examples are:

- `ds.getLoggedInUser` → `LoginResult`, including `userId`, `currentAvatarId`, `homeSpaceId`, and session/account state;
- `avatar.chooseAvatar` → `ChoosenAvatarResult`, including avatar ID/name, full compressed `config`, and head/thumb/snapshot postfixes;
- `ls.lookupSpace` → `LookupSpaceResult`, including `spaceId`, `ownerId`, and RTMP `Location` host/instance/visitor data;
- `space.getSpaceInfo` → `SpaceInfoResult`, including ID, owner, name fields, config, model source, and snapshot/thumbnail sources;
- `space.viewMembers` → a record set whose captured columns include avatar ID, first/last name, name instance, online state, role, and space ID;
- `avatar.viewMyAvatars` → a record set whose captured columns include `avatar_id`, first/last name, type, description, and `avatar_owner_id`;
- `widget.content.getContentForItem` → creator and owner avatar/user IDs plus content paths and images;
- `spintowin.getInitState`, `getSpinPrices`, and `getFreePrize` → typed Spin state, prize categories, winners, prices, cooldown, and awarded prize.

## Identity findings

### Find Friends proves avatar identity and portraits, not owner identity

The embedded Find Friends archive contains five complete `friend.searchForFriends` HTTP/AMF transactions. Together they return 4,085 response rows:

| Evidence | Count |
|---|---:|
| rows with a 24-character avatar ID | 4,085 |
| rows with a human avatar name | 4,085 |
| rows with `headUrl` | 4,085 |
| rows with `thumbUrl` | 4,085 |
| rows with `snapshotUrl` | 4,049 |
| rows with `Person.user` / owner ID | **0** |
| rows with a current-space ID | 1 |

Every sampled row has the captured schema `Person { avatar: AvatarIdentity, request: null, user: null }`. The nested avatar object contains `id`, first/last name, gender, head/thumb/snapshot URLs, online flags, and optional current/home location fields. The alternate `avatarId` property is null; `AvatarIdentity.id` is the usable avatar identifier.

This disproves the earlier assumption that these particular Find Friends responses establish `ownerId → avatarId`. They establish `avatarId → name + exact server-generated portrait URLs`. A future response may populate `Person.user`, because the recovered class supports it, but publication may not assume that it does.

### `ownerId` is a user/account identifier

The RTMP `Item.<uid>` and `Space.<space-id>` objects expose an `ownerId`. Recovered client checks compare both item and space `ownerId` directly with `user.userId` (`recovered-swfs/main-source/scripts/com/smallworlds/entity/item/Item.as:2316`, `:2794`, `:2808`, `:3406`; `recovered-swfs/main-source/scripts/com/smallworlds/entity/space/Space.as:2015`). Therefore this field is a user/account ID, not an avatar ID.

The captured account-avatar row set separately exposes `avatar_owner_id`. For arbitrary known owners, the recovered `avatarcore.getUsersAvatars(ownerId)` contract is still the correct owner-to-all-avatar-slots expansion. Find Friends should enrich those avatar IDs with names and portraits; it should not be used as the owner edge unless a retained response actually contains `Person.user.id`.

The evidence-safe graph is therefore:

```text
Item/Space.ownerId (user account)
  └─ avatarcore.getUsersAvatars(ownerId), or captured avatar_owner_id
       └─ avatarId(s), including explicit isDefault when returned
            └─ Find Friends AvatarIdentity.id
                 └─ name + headUrl + thumbUrl + snapshotUrl
```

`space.viewMembers` and room RTMP can identify avatars present in a room, but neither capture proves that co-presence links an avatar to every object in that room.

## RTMP room-state findings

`test3.pcapng` is the strongest complete room-state capture. Repository decoding recovered:

- 27 distinct `Avatar.<avatar-id>` objects with 27 valid, distinct `<avatar>` configuration XML documents;
- a human display name for all 27, gender for all 27, and head/thumb/snapshot postfixes for all 27;
- 102 distinct `Item.<uid>` states;
- 36 distinct referenced item models;
- two `Space.*` SharedObject states;
- `Items` and `Avatars` collection objects that enumerate room members;
- item state fields `uid`, `model`, `ownerId`, `configXML`, `forSale`, `price`, `priceTokens`, position, angle, parent, access/edit/move flags, and counters;
- space state fields `uid`, `name`, `ownerId`, `config`, model, visitor counts, access, sale fields, and group metadata;
- avatar state fields `avatarId`, first/last/display name, compressed `config`, model, head/thumb/snapshot postfixes, position, angle, animation state, equipped `item`, actions, role data, and profile fields.

The capture directly proves the reconstruction boundary: the room sends complete compressed avatar XML and the runtime state needed to associate it with a named avatar and animation state. It also proves that every room object instance has its own UID and model/config/sale/owner state. The model XML defines the base item; `configXML` is per-instance state and must not be collapsed into the model identity.

The capture does **not** place `ownerId` on `Avatar.<id>` state. Owner/avatar joins still require the account-avatar service evidence described above.

## Auction and sale findings

The “auction” capture proves observation of objects offered in a room, not a completed marketplace transaction:

- room RTMP exposes each item instance and its `forSale`, `price`, and `priceTokens` state;
- recovered sale codes are `N` (not for sale), `I` (that instance), and `Y` (model/unlimited) (`recovered-swfs/main-source/scripts/com/smallworlds/entity/PurchaseableEntity.as:11-15`);
- `auction.saz` contains one `market.getSellOrders` read and no captured `market.placeSellOrder`, `market.purchaseSellOrder`, or `market.cancelSellOrder` request;
- the recovered market service proves the exact missing mutation contracts (`recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:18-49`).

Consequently, “listed for sale in this space” is room-item evidence. A marketplace order, seller, or completed purchase must only be asserted from its typed market request/response or transaction receipt.

## Spin findings

The archive contains historical successful free-wheel evidence:

- one `spintowin.getInitState`, one `spintowin.getSpinPrices`, and one `spintowin.getFreePrize` in `auction.saz`;
- typed responses containing cooldown, categories, recent winners, prices, and the awarded prize;
- two initialization/price reads in `svtest2.saz`.

The recovered client confirms `getFreePrize` is the free-spin mutation and that it updates cooldown. Deluxe behavior is separate: `purchaseDeluxeSpins`, `getDeluxePrize`, and `processDeluxeWin` (`recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:51-151`). No deluxe mutation is present in these decoded SAZs.

## Zoltar findings

`zoltar.saz` identifies the exact item and launch chain:

```text
item model: Zoltar's Trading Cards (model id 9383)
model XML: items/base/antique/a_widget_02_cardtrade.xml
widget SWF: /widgets/widget_card_dispenser_rsrs.swf
control UI: widgets/assets/card_dispenser/control_ui.mxml
iframe route: widget/zoltar?widget=true
```

The item describes the action as purchasing or transmuting a set of cards. A current copy of the exact referenced SWF was fetched read-only and hashed as `01f30f085a4d345da1c5a21c6d59c5f63249aeb19a10d71fb4e7b542617cfbbf`. Decompilation shows it is the generic URL-iframe widget: when maximized it reads `widget_iframe_file` from the item model and emits `OPEN_WIDGET_IFRAME`; it does not implement Zoltar's business transaction itself.

`zoltar.pcapng` contains only the RTMP registration of the widget's `Collection._USERS_` persistent property and the success result. It does not contain an AMF Zoltar purchase/transmute call. The business request occurs inside the HTTPS iframe route, and this PCAP has no usable TLS secrets. Therefore the exact Zoltar request body, response schema, card result, and transaction correlation remain unresolved. They cannot be reconstructed honestly from the generic widget SWF.

## Store-purchase findings

The two store PCAPs are browser HTTPS captures, not decrypted AMF captures. The later capture proves connections to `api.smallverse.app`, `smallverse.app`, `content.smallverse.app`, and the payment-provider infrastructure, but no TLS key log was retained and neither capture has clear RTMP. They prove that the store flow occurred through the web/payment surface; they do not expose the request body, order schema, or resulting item grant.

The exact store purchase contract therefore remains an evidence gap. It requires a sanitized HAR/Fiddler request-response pair or a PCAP plus TLS key log from a test transaction. Payment credentials and provider tokens must be removed before retention.

## Gaps closed and gaps still open

Closed by this archive:

1. exact Find Friends avatar/name/portrait response shape and coverage;
2. proof that these Find Friends responses contain no owner edge;
3. exact logged-in account/avatar/space result fields;
4. full room RTMP `Space`, `Item`, `Avatar`, `Items`, and `Avatars` field families;
5. proof of 27 complete avatar configurations in a multi-avatar room capture;
6. item UID/model/config/owner/sale field lineage;
7. historical free-Spin request and typed response;
8. Zoltar item, generic widget SWF, control asset, iframe route, and RTMP collection boundary;
9. distinction between an auction-room listing observation and a marketplace transaction.

Still open:

1. an arbitrary `ownerId → all avatar slots → isDefault` response retained with provenance;
2. a current Popular response paired with lookup, room RTMP, and space image receipts from one run;
3. Zoltar iframe purchase/transmute request and response;
4. decrypted store purchase request, response, and item-grant receipt;
5. a completed marketplace order mutation/receipt if transaction history is a product requirement;
6. deterministic Flash-oracle parity for full Idle/Walk/Wave avatar rendering;
7. complete semantic labeling rules for every variant configuration family.

## Minimum useful follow-up captures

The next captures should be narrow rather than another long desktop session:

1. one owner lookup: request and response for `avatarcore.getUsersAvatars(knownOwnerId)`, retaining `isDefault` and portrait/config fields;
2. one Popular room chain: `space.viewPopSpaces` response, `ls.lookupSpace`, bounded RTMP join, and fetched thumbnail/snapshot hashes;
3. one Zoltar action in a sanitized browser HAR/Fiddler session, preserving request path, method, non-secret body schema, response schema, and resulting transaction ID/type;
4. one store test purchase with sanitized request/response and the subsequent inventory/transaction receipt;
5. one marketplace purchase test if Beacon must distinguish room sale state from a completed order.

No password, cookie, gateway session path, payment token, or full bearer credential should be included in those retained fixtures.
