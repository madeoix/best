# Smallverse Lab

Smallverse Lab is the Beacon preservation and exploration runtime for SmallWorlds
spaces, items, avatars, prices, and captured evidence.

## Runtime boundaries

```text
Static Svelte SPA
├── public read API client
└── browser avatar renderer

Tauri desktop boundary
├── local files and sessions
├── allowlisted process launchers
└── private operator API mediation

Fastify runtime
├── loopback public read API
├── Tailscale-only operator API
└── disabled-by-default preservation worker

Existing preservation system
└── /opt/smallverse remains authoritative and read-only to the new runtime
```

The public runtime currently reads allowlisted preserved exports. PostgreSQL and
canonical ingestion are a later, separately approved stage; they do not block a
safe file-backed deployment.

## Toolchain and local verification

Production and release certification are pinned to Node 24.x and npm 11.18.0.
Use a clean checkout:

```bash
node --version
npm --version
npm ci
npm test
npm run build:all
npm run test:desktop
```

The dependency policy allows no known production findings and no high or
critical findings anywhere in the complete dependency tree. It never runs an
automatic audit fix:

```bash
npm run dependency:audit
```

## Local integrated runtime

```bash
npm run infra:up

export DATABASE_URL='postgresql://smallverse:smallverse-development-only@127.0.0.1:5432/smallverse'
npm run db:verify
npm run sync:exports
npm run dev:all
```

In another terminal:

```bash
npm run smoke:runtime
```

See `docs/operations/local-runtime.md`.

## Certified production release

The full release lifecycle builds from a clean Git archive, installs from the
lockfile, runs tests and builds, audits dependencies, packages the immutable
release, performs a production-only install, and verifies the result:

```bash
npm run release:lifecycle
```

A verified archive and its checksum are written to `releases/`. No command in
that lifecycle connects to or changes the VPS.

## VPS operations

The production control surface is dry-run by default:

```bash
npm run production:deploy -- status
npm run production:deploy -- <command> [options]
```

Every mutating command requires both `--apply` and a command-specific
confirmation value shown by its dry run. It never installs OS packages, changes
`/opt/smallverse`, runs database migrations, or starts the worker.

Before any live action, run and review the read-only audit:

```bash
npm run production:audit -- --output "$HOME/smallverse-production-audit.json"
npm run production:evaluate -- \
  "$HOME/smallverse-production-audit.json" --stage inventory
```

Follow these documents in order:

```text
docs/operations/production-rollout.md
docs/operations/production-command-reference.md
docs/operations/production-audit.md
docs/operations/vps-foundation.md
```

## Desktop development

Start the private runtime in one terminal:

```bash
npm run dev:runtime
```

Then start the desktop shell in another:

```bash
npm run dev:desktop
```

The desktop launcher verifies both APIs before opening Tauri. Operator tokens,
local files, sessions, and process launchers remain outside browser JavaScript.

### Dependency source boundary

Run `npm run lockfile:verify` before installing or packaging. Beacon release
lockfiles may resolve packages only from `https://registry.npmjs.org/` or local
workspace paths; private mirrors and unknown registries are rejected.
