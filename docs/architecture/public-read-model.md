# Public preservation read model

## Purpose

The public API must remain useful while PostgreSQL ingestion is being built,
without exposing the operational Python system or requiring the web server to
SSH into the VPS.

The read model is a compatibility layer over explicit JSON exports. It is
read-only and deterministic.

## Source priority

### Items

1. `beacon-item-profiles.json`, when a generated profile exists.
2. A profile synthesized from `observatory-sync.json` and
   `beacon-world-index.json`.

The synthesized profile contains canonical item fields, observation counts,
known UIDs, owners, spaces, recent evidence, and price observations.

### Avatars

Avatar identity and portrait URLs come from:

1. `beacon-world-index.json`;
2. `avatar-url-index.json`;
3. matching Observatory evidence.

The API attaches the versioned browser-render asset paths but does not execute
the renderer while serving a request.

### Spaces

The API combines the world-space record with matching Observatory evidence.
Only rare, legendary, or price-backed items enter `useful_items`; common scene
objects remain visible under `filtered_noise`.

### Spin prices

The public route reads a preserved snapshot. It never invokes the live Gateway
and never touches session credentials. Missing snapshots return a successful
HTTP response with `ok: false` so the consumer UI can display an honest
unavailable state.

## Filesystem safety

Local development uses:

```text
.local-data/
├── workspace/
└── automation/
```

`scripts/sync-preserved-exports.sh` copies only an allowlist of JSON exports
from `casa`. It explicitly excludes databases, captures, cookies, tokens, and
session files.

## Transition to PostgreSQL

The compatibility layer is temporary but intentionally stable. PostgreSQL
repositories can replace each builder behind `LegacyDataStore` without changing
the browser API contracts.

The cutover sequence is:

1. import preserved exports into staging tables;
2. compare generated API responses against the read model;
3. shadow-read PostgreSQL in production;
4. switch one route at a time;
5. retain JSON exports for rollback until reconciliation is complete.
