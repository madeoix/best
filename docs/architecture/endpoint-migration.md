# Endpoint migration matrix

The SvelteKit application is a static SPA. It owns no `+server.js` routes.

| Previous SvelteKit endpoint | Runtime owner | Status |
|---|---|---|
| `/api/beacon/world` | Public API | Migrated |
| `/api/beacon/observatory/status` | Public API | Migrated |
| `/api/beacon/observatory/search` | Public API | Migrated |
| `/api/beacon/observatory/item` | Public API | Migrated |
| `/api/beacon/item/profile` | Public API | Migrated |
| `/api/beacon/item/profiles` | Public API | Migrated |
| `/api/beacon/avatar/profile` | Public API | Migrated |
| `/api/beacon/avatar/badge` | Public API | Migrated |
| `/api/beacon/space/profile` | Public API | Migrated |
| `/api/beacon/spin/prices` | Public API | Migrated |
| `/api/beacon/sessions` | Tauri command plus operator session import | Migrated |
| `/api/beacon/action` | Tauri launcher or scoped operator action | Migrated |
| `/api/beacon/overview` | Operator API | Migrated |
| `/api/vps/status` | Operator API | Migrated |
| `/api/vps/action` | Tauri launcher or operator API | Migrated |
| `/api/launch` | Tauri command | Migrated |
| `/api/recent` | Tauri command | Migrated |

## Public API rule

Public endpoints may read only explicit preservation exports and canonical
PostgreSQL data. They may not execute processes, SSH, read session files, call
the live Gateway, or control services.

## Operator API rule

Private actions use explicit allowlists and route scopes. There is no arbitrary
shell endpoint. Mutations require a matching confirmation value, a reason, and
an audit event.

Implemented private routes:

```text
GET  /ops/v1/overview
GET  /ops/v1/audit
GET  /ops/v1/services/:service
POST /ops/v1/services/:service/restart
POST /ops/v1/actions/:action
POST /ops/v1/sessions/import
```

## Desktop rule

Local files, local sessions, and process launching are available only through
named Tauri commands in `src-tauri/src/desktop.rs`. Browser JavaScript reaches
them only through `src/lib/runtime/desktopBridge.js`.
