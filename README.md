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

## Production packaging

```bash
npm run release:package
```

This creates a checksummed archive under `releases/`.

Do not deploy the Fastify services to the current VPS until its Node runtime,
service accounts, environment files, database, and reverse-proxy routes have
been prepared.


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
