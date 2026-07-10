# Smallverse Lab

Smallverse Lab is a consumer-facing preservation and exploration interface for
SmallWorlds data, spaces, items, avatars, prices, and captured evidence.

## Runtime layout

```text
SvelteKit static SPA
├── public API client
├── operator API client
└── browser avatar renderer

Fastify runtime
├── public read API
├── VPN-only operator API
└── preservation worker

Existing VPS preservation system
└── /opt/smallverse
```

The existing Python system remains active while API routes are migrated. See
`docs/architecture/runtime-boundaries.md`.

## Development

```bash
npm install
npm run dev:web
npm run dev:api
```

Public API development defaults to `127.0.0.1:8780`.

## Verification

```bash
npm test
npm run build:all
```

## Local PostgreSQL and object storage

```bash
docker compose -f infra/compose.dev.yml up -d
export DATABASE_URL='postgresql://smallverse:smallverse-development-only@127.0.0.1:5432/smallverse'
npm run db:migrate
```

## Production packaging

```bash
npm run release:package
```

This creates a checksummed archive under `releases/`.
