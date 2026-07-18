# Research dump evidence report

This report records the read-only examination of `/home/maddie/Documents/idk-atp.tar.gz` on 2026-07-16. The archive was extracted only beneath `/tmp/smallverse-idk-atp-analysis`; no application, crawler, renderer, test, deployment, session, or runtime source was changed. This report and the related dossier corrections are documentation-only.

## Chain of custody

| Artifact | SHA-256 |
|---|---|
| `idk-atp.tar.gz` | `8dabee79461d0031e27d56311385e8ad7cef0c72fe27f413f848b20a80d6a38e` |
| saved Popular HTTP/AMF exchange (`popular2.txt`) | `dea3be132a474558454b4d7f37129766603804c0ff55a613ec56d3cc09e8f4f6` |
| normalized saved Popular projection | `d5e5b922ba156af3e60d7375d85f7a132704b48e2e84a0029bbfd0c3c1bd79d5` |
| transaction-history HAR | `0f9246996dc31a82f5a5e177c034989f66c85ea975e60ac3ae09fbfd148d81f1` |
| filtered card-transaction HAR | `a5110e8c278bae14dbd5622900ea32b307be5e6e4d3d9826b15da1dd977cf541` |
| historical identity SQLite | `f72c2b7933d7c266ffe7a41beb93162363752a28b288b1b669a1e4577850033b` |
| historical Observatory SQLite | `aeb672d8658108cf4e07bf7622eaea65df3f8395b7ff4c76758d1c7728d92981` |
| marketplace observation PCAP (`stream_of_deals`) | `ef31a668d6abdd47d086c8c5707df7c006e5e67bba9713992e8717b0b7d30d57` |
| consignment observation PCAP | `6a96008665d4404de9f2b427f41c846c9966de707c068d79e365c394f7c91162` |

The archive contains 4,319 entries, including 209 PCAPNG files, 14 SAZ files, eight HAR files, 211 SQLite files, 939 JSON files, 321 XML files, and 347 PNG files. Credentials, cookies, session identifiers, personal transaction details, and raw route tokens are intentionally omitted from this dossier.

The included `auction.saz` and `svtest2.saz` hash identically to the copies already examined in the old-captures audit. They are duplicates, not independent corroborating observations.

## Popular-category request and response

The saved exchange proves that one historical game-client Popular surface invoked:

```text
catalog_entry.getSpacesForCategory(category, offset, count)
  -> SpacePanelItem.formatTypedRecordSet
```

That call shape matches `CatalogEntryService.getSpacesForCategory` in `recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryService.as:21`. It complements, rather than erases, the separately recovered `space.viewPopSpaces(offset, count)` path. The recovered client contains both service paths; the dossier must not describe either as the only possible Popular path.

The saved response is a typed record set containing 68 `SpacePanelItem` rows from a request whose limit was 100. Every row contains:

- a canonical space ID and human-readable description/name;
- `currentVisitors`;
- owner/default-avatar context (`spaceOwner`, avatar ID, first name, and last name);
- thumbnail and snapshot sources;
- access and sale fields.

All 68 rows have an ID, name, owner/default-avatar fields, thumbnail, and snapshot. The captured visitor counts are monotonically non-increasing (beginning 13, 6, 4, 3), proving that this particular historical response was ordered by current population descending. This closes the historical ordering question. It does not prove current ordering, availability, or whether today’s client/server still chooses the same Popular service path.

The normalized `popular-spaces.json` explicitly records its source as the saved `catalog_entry.getSpacesForCategory` capture. Historical headless routines reused these 68 canonical rows; they did not discover Popular rooms from a guessed URL slug.

## Historical headless room chain

Fifty-seven retained `headless-dynamic-probe-result.json` records were readable:

- 49 report a successful connection;
- 49 contain a space record, widget configuration, and items-controller state;
- 48 report that the selected target space was observed;
- 47 contain nonzero UID discovery, dynamic requests, item detail, and item-UID counts.

Across 200 historical session databases, 28 contain observations and protocol events. Their aggregate is 1,865 observations, 1,885 protocol events, and 539 assets. The observation vocabulary includes 1,693 world-item observations, 153 market listings, 20 dirty avatar snapshots, and 19 avatar-wearing UID events.

This proves that the old probe could traverse `canonical Popular row -> connected room -> live item UID -> item detail/config evidence`. It does not make every legacy heuristic relationship canonical. In particular, co-presence, `dirtySnapshot`, and `owner_or_avatar` labels remain evidence candidates unless a typed field supplies the actual relation.

## Space-name loss was a projection defect

The historical session databases contain 1,833 observations with space IDs and 1,597 with space names. The historical Observatory database contains 24 `space_summaries`, but none retains a space name. Because the upstream Popular response demonstrably included names and image sources, this is evidence of lineage loss in the old normalization/projection path—not evidence that Smallverse failed to provide a name.

The correct invariant is therefore:

```text
captured canonical space response
  -> capture receipt keyed by space ID
  -> observations joined through that receipt
  -> retained name + verified thumbnail/snapshot
```

Generating an unnamed public space row and hiding it later is not equivalent. The canonical join must be completed before publication.

## Identity database findings

The historical identity database contains 35,700 avatar rows with thumbnail URLs (35,699 also have snapshots) and 35,700 `owner_avatar_candidates` spanning 30,949 distinct candidate owners. Those candidate edges were derived from historical imports and panel/co-presence evidence; their volume does not make them authoritative account-avatar relationships.

The dump therefore strengthens two conclusions:

1. exact avatar ID/name/portrait enrichment was operational at historical scale;
2. `owner_avatar_candidates` must not be promoted into canonical ownership without `avatar_owner_id`, `getUsersAvatars`, a populated typed user object, or equivalent explicit evidence.

## Transaction history and Zoltar/Spin receipts

The HARs capture the recovered call shape:

```text
transaction.getMyTransactions(searchText, startIndex, pageSize)
  -> RecordSetResult
```

The record-set columns are exactly:

- `usertrans_timestamp`;
- `usertrans_details`;
- `usertrans_gold`;
- `usertrans_tokens`.

Captured filtered responses contain historical descriptions for Zoltar card-pack purchases (including five-card and fifteen-card packs), Deluxe Spin purchases, and free/Deluxe Spin wins. This proves that Spin and Zoltar actions were reflected in account transaction history and that the history endpoint can be filtered by text and paginated.

It does **not** expose the Zoltar iframe purchase/transmute request, the card-grant payload, an idempotency key, or a direct action-to-grant identifier. Those business requests remained inside HTTPS without usable decryption material. The gap is narrowed from “no transaction evidence” to “receipt schema and descriptions proven; mutation/grant protocol unresolved.”

## Marketplace captures

The `stream_of_deals` and consignment PCAPs contain substantial RTMPT traffic alongside TLS. They support the already documented live market/listing observation boundary. They do not reveal a completed HTTPS/AMF place/purchase/cancel mutation with a typed result. Accordingly, they must not be cited as proof of ownership transfer or a successful market transaction.

## Evidence gaps closed or narrowed

Closed as **captured historical**:

1. the actual `catalog_entry.getSpacesForCategory` Popular-category request path;
2. its typed space row shape, including human names and image sources;
3. descending-by-`currentVisitors` ordering for the retained response;
4. historical headless traversal from a canonical Popular row to room UID/item evidence;
5. the `transaction.getMyTransactions` request/result schema;
6. historical transaction-history receipts for Zoltar and Spin activity.

Narrowed but still open:

1. current Popular availability, ordering, and selected service path;
2. current per-room avatar/config coverage;
3. canonical owner-to-avatar edges and explicit default markers;
4. Zoltar HTTPS mutation and card-grant schema;
5. completed marketplace mutation semantics;
6. current image fetch validity and content hashes;
7. deterministic Flash-parity avatar rendering.

## Documentation consequence

This dump changes the evidence model, not application behavior. The dossier now treats Popular discovery as two recovered paths with one captured historical category path; treats historical space names/images as source evidence that was later dropped by projection; and distinguishes Zoltar/Spin transaction receipts from the still-unseen Zoltar mutation protocol.
