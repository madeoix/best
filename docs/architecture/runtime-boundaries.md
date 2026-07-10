# Smallverse runtime boundaries

This document describes the implemented runtime split. The SvelteKit
application is a static SPA; server behavior belongs in separate processes.

## Public web

Browser code may call APIs only through:

```text
src/lib/runtime/apiClient.js
```

Configuration:

```text
VITE_SMALLVERSE_PUBLIC_API_BASE
VITE_SMALLVERSE_OPERATOR_API_BASE
```

An empty base preserves same-origin proxying. Production should proxy `/api/`
to the public API and expose the operator base only on the VPN.

## Public API

Entry point:

```text
apps/api/src/entrypoints/public.ts
```

Default listener:

```text
127.0.0.1:8780
```

The process is read-only. It may read explicit preservation exports and
PostgreSQL health, but it may not execute commands, SSH, read credentials, or
control services.

Implemented compatibility routes:

```text
GET /api/beacon/world
GET /api/beacon/observatory/status
GET /api/beacon/observatory/search
GET /api/beacon/observatory/item
GET /api/beacon/item/profile
GET /api/beacon/item/profiles
GET /api/beacon/avatar/profile
GET /api/beacon/avatar/badge
GET /api/beacon/space/profile
GET /api/beacon/spin/prices
```

Versioned routes are documented in `endpoint-migration.md`.

## Operator API

Entry point:

```text
apps/api/src/entrypoints/operator.ts
```

Production should bind it to the Tailscale address, not a public interface.

Every non-health route requires a bearer token. Service operations use an
allowlist and a narrow sudoers rule. No arbitrary command route exists.

## Worker

Entry point:

```text
apps/api/src/entrypoints/worker.ts
```

The worker owns future ingestion, indexing, rendering, and integrity jobs. It
requires PostgreSQL and is intentionally separate from request handling.

## Existing preservation system

`/opt/smallverse` remains the active preservation source during migration.

Known VPS facts:

- Ubuntu 24.04;
- Nginx 1.24;
- Tailscale active;
- legacy Smallverse services exist but are not healthy;
- the Observatory SQLite database is large and irreplaceable;
- Node.js must be upgraded before the new Fastify runtime is deployed.

No migration step may rewrite preserved data in place.

## Local integration

The supported local flow is:

```text
Docker PostgreSQL and MinIO
        ↓
database migrations
        ↓
safe JSON export sync from casa
        ↓
public API + operator API + worker
        ↓
SvelteKit SPA
        ↓
runtime smoke test
```

See `docs/operations/local-runtime.md`.

## Enforcement

`scripts/check-runtime-boundaries.mjs` fails when:

- browser components bypass the central API client;
- migrated public SvelteKit server routes reappear;
- public API modules import process execution;
- public API modules contain SSH behavior;
- API base configuration leaks outside the runtime client.
