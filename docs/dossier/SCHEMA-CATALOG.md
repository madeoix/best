# Physical schema catalog

This catalog records every SQLite CREATE TABLE IF NOT EXISTS block found in active application, session, tool, package, and source directories. Duplicate table names are retained because their differing declarations are themselves schema-drift evidence.

## Captured remote record-set schemas

These are protocol result schemas observed in retained traffic, not local database declarations.

### transaction.getMyTransactions

The broader historical HAR dump captures `transaction.getMyTransactions(searchText, startIndex, pageSize)` returning a `RecordSetResult` with:

- `usertrans_timestamp`;
- `usertrans_details`;
- `usertrans_gold`;
- `usertrans_tokens`.

Filtered responses include historical Spin and Zoltar receipt descriptions. The schema proves account-history presentation and currency deltas; it does not expose the underlying Zoltar mutation or card-grant response.

Declarations: **11**. Distinct table names: **9**.

## PostgreSQL foundation

The Kysely migration at packages/database/src/migrations/20260710_001_foundation.ts declares:

- sources(id, source_key, display_name, source_type, base_uri, trust_priority, enabled, notes, created_at, updated_at);
- entities(id, kind, canonical_key, slug, display_name, summary, visibility, confidence, metadata, created_at, updated_at);
- blobs(sha256, storage_key, byte_size, media_type, verified_at, created_at);
- assets(id, blob_sha256, asset_kind, visibility, original_filename, rights_statement, metadata, created_at);
- jobs(id, job_type, status, payload, result, priority, attempts, max_attempts, run_after, locked_at, locked_by, last_error, created_at, finished_at);
- operator_tokens(id, label, token_prefix, token_digest, scopes, created_at, expires_at, last_used_at, revoked_at);
- audit_events(id, occurred_at, request_id, actor_token_id, action, target_type, target_id, input_summary, result, remote_address).

See the migration for constraints, defaults, extensions, foreign keys, and indexes. These are infrastructure tables, not the complete domain schema.

## SQLite declarations

### avatar_wearing_rtmp_events — tools/beacon_avatar_wearing_sidecar.py:98

~~~sql
CREATE TABLE IF NOT EXISTS avatar_wearing_rtmp_events (
      event_key TEXT PRIMARY KEY,
      observatory_event_id INTEGER,
      session_name TEXT,
      event_type TEXT,
      relationship TEXT NOT NULL DEFAULT 'equipped',
      uid TEXT,
      owner_id TEXT,
      wearing_avatar_id TEXT,
      npc_avatar_id TEXT,
      source_xml TEXT,
      display_name TEXT,
      description TEXT,
      config_field TEXT,
      variant_signature TEXT,
      item_config_sha256 TEXT,
      avatar_config_snapshot_id TEXT,
      decoded_config_xml TEXT,
      raw_context TEXT,
      evidence TEXT,
      confidence REAL,
      observed_at TEXT,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );
~~~

### identity_search_results — tools/beacon_friend_search_capture_import.py:170

~~~sql
CREATE TABLE IF NOT EXISTS identity_search_results (
      avatar_id TEXT PRIMARY KEY,
      owner_id TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      full_name TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      current_space_id TEXT DEFAULT '',
      home_space_id TEXT DEFAULT '',
      head_url TEXT DEFAULT '',
      thumb_url TEXT DEFAULT '',
      snapshot_url TEXT DEFAULT '',
      online INTEGER DEFAULT 0,
      is_friend INTEGER DEFAULT 0,
      is_reciprocal INTEGER DEFAULT 0,
      source_query TEXT DEFAULT '',
      source_file TEXT DEFAULT '',
      raw_ref TEXT DEFAULT '',
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );
~~~

### avatar_assets — tools/beacon_friend_search_capture_import.py:198

~~~sql
CREATE TABLE IF NOT EXISTS avatar_assets (
      avatar_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      asset_hash TEXT NOT NULL,
      url TEXT NOT NULL,
      http_status INTEGER DEFAULT 0,
      content_type TEXT DEFAULT '',
      is_verified_image INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (avatar_id, variant, asset_hash, url)
    );
~~~

### identity_search_results — tools/beacon_friend_search_live.py:201

~~~sql
CREATE TABLE IF NOT EXISTS identity_search_results (
      avatar_id TEXT PRIMARY KEY,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      full_name TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      current_space_id TEXT DEFAULT '',
      home_space_id TEXT DEFAULT '',
      head_url TEXT DEFAULT '',
      thumb_url TEXT DEFAULT '',
      snapshot_url TEXT DEFAULT '',
      online INTEGER DEFAULT 0,
      is_friend INTEGER DEFAULT 0,
      is_reciprocal INTEGER DEFAULT 0,
      source_query TEXT DEFAULT '',
      source_file TEXT DEFAULT '',
      raw_ref TEXT DEFAULT '',
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );
~~~

### avatar_assets — tools/beacon_friend_search_live.py:222

~~~sql
CREATE TABLE IF NOT EXISTS avatar_assets (
      avatar_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      asset_hash TEXT NOT NULL,
      url TEXT NOT NULL,
      http_status INTEGER DEFAULT 0,
      content_type TEXT DEFAULT '',
      is_verified_image INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (avatar_id, variant, asset_hash, url)
    );
~~~

### identity_owner_accounts_v1 — tools/beacon_owner_avatar_identity_graph.py:84

~~~sql
CREATE TABLE IF NOT EXISTS identity_owner_accounts_v1 (
      owner_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      first_observed_at TEXT NOT NULL,
      last_observed_at TEXT NOT NULL
    );
~~~

### identity_avatar_entities_v1 — tools/beacon_owner_avatar_identity_graph.py:91

~~~sql
CREATE TABLE IF NOT EXISTS identity_avatar_entities_v1 (
      avatar_id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      head_url TEXT NOT NULL DEFAULT '',
      thumb_url TEXT NOT NULL DEFAULT '',
      snapshot_url TEXT NOT NULL DEFAULT '',
      first_observed_at TEXT NOT NULL,
      last_observed_at TEXT NOT NULL
    );
~~~

### identity_owner_avatar_evidence_v1 — tools/beacon_owner_avatar_identity_graph.py:104

~~~sql
CREATE TABLE IF NOT EXISTS identity_owner_avatar_evidence_v1 (
      evidence_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      avatar_id TEXT NOT NULL,
      source_method TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      source_query TEXT NOT NULL DEFAULT '',
      observed_at TEXT NOT NULL,
      relationship_basis TEXT NOT NULL,
      is_default INTEGER,
      is_selected INTEGER,
      raw_ref TEXT NOT NULL DEFAULT '{}',
      CHECK (is_default IS NULL OR is_default IN (0, 1)),
      CHECK (is_selected IS NULL OR is_selected IN (0, 1)),
      FOREIGN KEY (owner_id) REFERENCES identity_owner_accounts_v1(owner_id),
      FOREIGN KEY (avatar_id) REFERENCES identity_avatar_entities_v1(avatar_id)
    );
~~~

### avatar_protocol_events — tools/beacon_avatar_rtmp_probe.py:29

~~~sql
CREATE TABLE IF NOT EXISTS avatar_protocol_events (
      id INTEGER PRIMARY KEY,
      source_event_id INTEGER,
      session_name TEXT,
      owner_id TEXT,
      avatar_id TEXT,
      event_type TEXT,
      raw_context TEXT,
      parsed_json TEXT,
      confidence REAL,
      origin TEXT,
      observed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
~~~

### avatar_appearance_snapshots — tools/beacon_avatar_rtmp_probe.py:46

~~~sql
CREATE TABLE IF NOT EXISTS avatar_appearance_snapshots (
      avatar_id TEXT NOT NULL,
      owner_id TEXT,
      snapshot_key TEXT NOT NULL,
      appearance_json TEXT NOT NULL,
      source_event_ids_json TEXT,
      confidence REAL,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (avatar_id, snapshot_key)
    );
~~~

### avatar_asset_hints — tools/beacon_avatar_rtmp_probe.py:58

~~~sql
CREATE TABLE IF NOT EXISTS avatar_asset_hints (
      avatar_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      asset_hash TEXT,
      url TEXT,
      source_event_id INTEGER,
      source TEXT,
      is_protocol_derived INTEGER DEFAULT 1,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (avatar_id, variant, asset_hash, url)
    );
~~~

## Drift rule

Two declarations with the same table name are compatible only after comparing every column, default, nullability rule, key, and index. Runtime code must not assume compatibility from the name alone.

## Captured protocol schemas that canonical storage must preserve

These are not current database tables. They are field families decoded from the supplied historical Fiddler/RTMP corpus and define evidence that a future canonical schema must not discard. Full chain of custody is in [Old captures evidence report](./OLD-CAPTURES-EVIDENCE-REPORT.md).

| Protocol record | Captured fields relevant to Smallverse Lab | Join meaning |
|---|---|---|
| Find Friends `Person.avatar` / `AvatarIdentity` | `id`, first/last name, gender, `headUrl`, `thumbUrl`, `snapshotUrl`, online and optional location fields | exact avatar ID to name and server-generated portraits; all supplied `Person.user` values are null |
| `LoginResult` | user ID, current avatar ID, home space ID, session/account state | signed-in account context only |
| `ChoosenAvatarResult` | avatar ID/name, compressed full config, head/thumb/snapshot postfixes | exact selected avatar appearance and portrait suffixes |
| `avatar.viewMyAvatars` row | `avatar_id`, first/last name, type, description, `avatar_owner_id` | captured account-to-avatar edge for that row set |
| `LookupSpaceResult` | space ID, owner ID, hostname, channel ID, instance ID, visitors | canonical space to live RTMP connection context |
| `SpaceInfoResult` | space ID/owner, human name, config, model source, snapshot and thumbnail sources | canonical public space identity and imagery |
| `space.viewMembers` row | avatar ID/name, online state, role, space ID | avatar presence/membership, not item ownership |
| RTMP `Avatar.<id>` | names, compressed config, model/gender, portrait postfixes, animation/action/equipped state | time-bounded avatar appearance and room state; no owner ID in the supplied 27-avatar capture |
| RTMP `Item.<uid>` | UID, model, `ownerId`, `configXML`, sale/pricing, transform, parent/access state | unique object instance and per-instance variant; `ownerId` is a user/account ID |
| RTMP `Space.<id>` | ID/name, `ownerId`, config/model, visitors/access/sale/group state | time-bounded room state |

The owner graph therefore cannot be populated from Find Friends in this corpus. It requires `avatar_owner_id`, `avatarcore.getUsersAvatars(ownerId)`, or another retained typed account-avatar response. Co-presence fields must never be coerced into that schema.
