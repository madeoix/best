# Smallverse Lab

Smallverse Lab is a consumer-facing preservation and exploration interface for
SmallWorlds data, spaces, items, avatars, prices, and captured evidence.

## Runtime layout

```text
SvelteKit static SPA
├── public API client
└── browser avatar renderer

Tauri desktop boundary
├── local files and sessions
├── allowlisted process launchers
└── private operator API mediation

Fastify runtime
├── public read API
├── VPN-only operator API
└── preservation worker

PostgreSQL
└── canonical metadata and jobs

Existing preservation system
└── /opt/smallverse
```

The existing Python preservation system remains active while data is imported
into PostgreSQL. Public requests no longer SSH into that system. The static frontend contains no server endpoints.

## Install and verify

```bash
npm install
npm test
npm run build:all
npm run test:desktop
```

## Local integrated runtime

```bash
npm run infra:up

export DATABASE_URL='postgresql://smallverse:smallverse-development-only@127.0.0.1:5432/smallverse'
npm run db:verify

npm run sync:exports
npm run dev:all
```

In a second terminal:

```bash
npm run smoke:runtime
```

Detailed instructions:

```text
docs/operations/local-runtime.md
```

## Public read model

The public API reads only allowlisted preservation exports while PostgreSQL
ingestion is built. Item, avatar, space, Observatory, and cached spin-price
routes are implemented in `apps/api`.

```text
docs/architecture/public-read-model.md
docs/architecture/endpoint-migration.md
```

## Production rollout

Production is pinned to Node 24.x and proceeds through read-only inventory,
foundation, immutable release verification, loopback shadow deployment, data
reconciliation, and a separately approved cutover.

```bash
npm run production:audit -- --output production-audit.json
npm run production:evaluate -- production-audit.json --stage inventory
npm run release:package
```

The worker is disabled by default in production and authoritative preservation
paths remain read-only. Follow:

```text
docs/operations/production-rollout.md
docs/operations/production-audit.md
```


## Desktop development

Start the private runtime in one terminal:

```bash
npm run dev:runtime
```

Then start the desktop shell in another terminal:

```bash
npm run dev:desktop
```

The development launcher supplies loopback-only API defaults, verifies both APIs
before opening Tauri, and keeps the operator token outside browser JavaScript.
Environment variables may still override the defaults. Local files, sessions,
and process launchers remain Tauri-only.
