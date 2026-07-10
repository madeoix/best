# Endpoint migration matrix

The public web application is a static SPA. Public read routes therefore live
in `apps/api`; they are not duplicated under `src/routes/api`.

| Previous SvelteKit endpoint | Runtime owner | Status |
|---|---|---|
| `/api/beacon/world` | Public API | Migrated and old route removed |
| `/api/beacon/observatory/status` | Public API | Migrated and old route removed |
| `/api/beacon/observatory/search` | Public API | Migrated and old route removed |
| `/api/beacon/observatory/item` | Public API | Migrated and old route removed |
| `/api/beacon/item/profile` | Public API | Migrated and old route removed |
| `/api/beacon/item/profiles` | Public API | Migrated and old route removed |
| `/api/beacon/avatar/profile` | Public API | Migrated and old route removed |
| `/api/beacon/avatar/badge` | Public API | Migrated and old route removed |
| `/api/beacon/space/profile` | Public API | Migrated and old route removed |
| `/api/beacon/spin/prices` | Public API | Migrated to cached preserved snapshots; old live probe removed |
| `/api/beacon/sessions` | Operator API or Tauri | Pending |
| `/api/beacon/action` | Operator API | Pending |
| `/api/beacon/overview` | Operator API | Pending |
| `/api/vps/status` | Operator API | Partially replaced by scoped service status |
| `/api/vps/action` | Operator API or Tauri | Pending |
| `/api/launch` | Tauri only | Pending |
| `/api/recent` | Tauri only | Pending |

## Public read-model rule

Public endpoints may read only explicit preservation exports:

- `beacon-world-index.json`
- `observatory-sync.json`
- `beacon-item-profiles.json`
- `avatar-url-index.json`
- preserved spin-price snapshots

They may not:

- invoke SSH;
- execute Python or shell commands;
- read cookies or session files;
- call the live Gateway;
- control systemd services.

The runtime-boundary test fails when a migrated public SvelteKit route is
reintroduced or when a public API module imports process-execution code.

## Versioned endpoints

Compatibility routes remain available while the frontend is migrated. New
consumers should prefer:

```text
GET /api/v1/search
GET /api/v1/observatory/item?source_xml=...
GET /api/v1/items/profile?source_xml=...
GET /api/v1/avatars/:avatarId
GET /api/v1/spaces/:spaceId
GET /api/v1/spin/prices
```

Versioned endpoints return `{ data, meta }` envelopes with request IDs.
