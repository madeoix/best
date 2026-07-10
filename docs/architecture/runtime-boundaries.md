# Smallverse runtime boundaries

This document describes the first implementation boundary. It is intentionally
compatible with the current application while the legacy SvelteKit endpoint
implementations are migrated.

## Public web

The SvelteKit application remains a static SPA.

Browser code may call APIs only through:

```text
src/lib/runtime/apiClient.js
```

Configuration:

```text
VITE_SMALLVERSE_PUBLIC_API_BASE
VITE_SMALLVERSE_OPERATOR_API_BASE
```

An empty value preserves same-origin development behavior. Production must set
the public base or proxy `/api/` to the public API. Operator features must point
to the Tailscale-only operator listener.

## Public API

Entry point:

```text
apps/api/src/entrypoints/public.ts
```

Default listener:

```text
127.0.0.1:8780
```

This process is read-only. The first migrated compatibility routes are:

```text
GET /api/beacon/world
GET /api/beacon/observatory/status
GET /api/beacon/observatory/search
GET /api/v1/search
GET /api/v1/health
```

They read the preserved exports directly from `/opt/smallverse` on the VPS.
They do not SSH back into the same machine.

## Operator API

Entry point:

```text
apps/api/src/entrypoints/operator.ts
```

The production example binds to the current Tailscale address:

```text
100.118.39.6:8781
```

Every non-health route requires a bearer token. Service operations use an
allowlist and a narrow sudoers rule. No arbitrary shell command route exists.

## Worker

Entry point:

```text
apps/api/src/entrypoints/worker.ts
```

The worker is deliberately inert until real job handlers are registered. It
requires PostgreSQL and provides the process boundary without pretending that
the current Python ingestion system has already been replaced.

## Existing Python preservation system

`/opt/smallverse` remains the active preservation source during migration.

Current facts from the VPS inventory:

- Ubuntu 24.04.
- Nginx 1.24.
- Tailscale is active.
- `smallverse-explorer.service` exists but is failed.
- `smallverse-admin.service` exists but is inactive.
- `observatory.sqlite` is approximately 7.5 GB.
- `/opt/smallverse` is approximately 22 GB.
- no PostgreSQL server is currently installed.
- Node.js is 18.19.1 and must be upgraded before Fastify 5 is deployed.

No migration step may delete or rewrite this data in place.

## Migration rule

For each old `src/routes/api/**/+server.js` route:

1. Add a public or operator implementation in `apps/api`.
2. Add an API test.
3. Point the browser caller through the runtime client.
4. Run the current web build and API tests.
5. Remove the SvelteKit endpoint only after the replacement is deployed.
