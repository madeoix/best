# Production rollout gates

This document is the ordered production plan for Smallverse Lab. It is not a
single deployment command. Complete and review each gate separately.

## Invariants

These rules apply to every stage:

- `/opt/smallverse` remains the authoritative preservation system.
- Existing SQLite databases and preserved exports are opened read-only.
- Releases are installed under `/srv/smallverse/releases/<commit>`.
- `/srv/smallverse/current` is the only release switch.
- The existing Nginx public site and `receipt-viewer` site are not changed
  during inventory, foundation, or shadow verification.
- The public API binds only to loopback.
- The operator API binds only to a confirmed Tailscale address or loopback.
- The worker stays disabled until ingestion handlers and reconciliation have
  been implemented and separately approved.
- No stage deletes a prior release, source export, SQLite database, service, or
  backup.

## Gate 0: clean source checkpoint

Before production work:

```bash
npm ci
npm test
npm run build:all
npm run test:desktop

git status --short
git rev-parse HEAD
```

The worktree must be clean. Record the full Git commit and create a source
archive with its SHA-256.

## Gate 1: read-only VPS inventory

Run the audit from a checked-out or exported copy of this repository on the
VPS. The audit reads metadata and service state. It does not install packages,
change services, read environment-file contents, or alter preservation data.

```bash
node scripts/production-audit.mjs \
  --output "$HOME/smallverse-production-audit.json"

node scripts/evaluate-production-audit.mjs \
  "$HOME/smallverse-production-audit.json" \
  --stage inventory
```

Database hashing is optional because a multi-gigabyte SQLite file can take a
long time to read:

```bash
node scripts/production-audit.mjs \
  --hash-preservation \
  --output "$HOME/smallverse-production-audit-with-hashes.json"
```

Review the report before approving foundation changes. Confirm at minimum:

- OS and architecture;
- Node/npm versions;
- free disk and memory;
- Tailscale IPv4;
- Nginx enabled sites and config-test result;
- PostgreSQL presence and readiness;
- existing Smallverse services and timers;
- `/opt/smallverse` and Observatory database locations;
- `/srv/smallverse` and `/etc/smallverse` state;
- occupied listener ports.

## Gate 2: backup and recovery proof

This is a separately approved, write-capable maintenance step.

Before installing anything:

1. Create a provider snapshot or an independent backup of `/opt/smallverse`.
2. Create a read-only copy or database-safe backup of each authoritative SQLite
   database.
3. Record SHA-256 values for the backup artifacts.
4. Open the copied database with a read-only SQLite connection and run an
   integrity check.
5. Record the existing Nginx configuration and enabled-site symlinks.
6. Record enabled and active systemd units and timers.

A backup is not accepted merely because a file exists. Its checksum and
readability must be verified.

## Gate 3: production foundation

Do not place files over `/opt/smallverse`.

Prepare:

```text
/srv/smallverse/releases
/srv/smallverse/shared
/etc/smallverse
```

Create dedicated non-login service accounts:

```text
smallverse-public
smallverse-operator
smallverse-worker
```

Install Node 24.x, PostgreSQL, Nginx, and Tailscale prerequisites. Create
separate PostgreSQL roles for migration ownership, public reads, operator audit
access, and worker writes. PostgreSQL begins empty; it is not a replacement for
SQLite at this gate.

Copy environment templates from `infra/env/`, replace every placeholder, and
install the real files as root-owned mode `0600`:

```text
/etc/smallverse/public-api.env
/etc/smallverse/operator-api.env
/etc/smallverse/worker.env
```

Keep this value unchanged:

```text
SMALLVERSE_WORKER_ENABLED=false
```

Re-run the audit and evaluate the foundation gate:

```bash
node scripts/production-audit.mjs \
  --output "$HOME/smallverse-production-foundation.json"

node scripts/evaluate-production-audit.mjs \
  "$HOME/smallverse-production-foundation.json" \
  --stage foundation
```

Do not proceed with blockers.

## Gate 4: build and verify an immutable release

Build on Node 24 from a clean Git worktree:

```bash
npm ci
npm test
npm run build:all
npm run release:package
```

When packaging an exported source tree without `.git`, provide the verified
commit explicitly:

```bash
SMALLVERSE_RELEASE_COMMIT=<verified-git-sha> \
  npm run release:package
```

The packager:

- includes static web output and all three API entrypoints;
- includes workspace package manifests required by `npm ci --omit=dev`;
- includes migrations and production operations files;
- writes `RELEASE.json`;
- writes and verifies `MANIFEST.sha256`;
- rejects unsafe or incomplete release contents;
- verifies the directory and final archive before publishing its outer hash.

Verify again after transfer to the VPS:

```bash
sha256sum -c smallverse-<commit>.tar.gz.sha256
node scripts/verify-production-release.mjs \
  smallverse-<commit>.tar.gz
```

Extract into a new commit-named directory. Never extract over `current` or a
prior release. Run `npm ci --omit=dev --ignore-scripts` inside that immutable
release before switching the symlink.

## Gate 5: install services without public cutover

Install the systemd units from `infra/systemd/` and validate them before
starting anything. The units enforce these boundaries:

- public API: `smallverse-public`, loopback, read-only preservation paths;
- operator API: `smallverse-operator`, Tailscale/loopback, exact sudo allowlist;
- worker: `smallverse-worker`, read-only preservation paths, disabled by env.

Start only the public and operator APIs. Do not enable or start the worker.
Directly verify:

```bash
curl -fsS http://127.0.0.1:8780/api/v1/health
curl -fsS http://<tailscale-ip>:8781/ops/v1/health
```

## Gate 6: loopback-only Nginx shadow

Render `infra/nginx/smallverse-lab.shadow.conf.template`. It listens only on
`127.0.0.1:8088` and therefore cannot take public traffic.

Validate Nginx, reload it, and test locally:

```bash
curl -fsS http://127.0.0.1:8088/
SMALLVERSE_PUBLIC_API_BASE=http://127.0.0.1:8088 \
  node scripts/smoke-production.mjs
```

Operator smoke checks are optional and read-only:

```bash
SMALLVERSE_OPERATOR_TOKEN='<token-from-secure-shell-env>' \
  node scripts/smoke-production.mjs \
  --public-base http://127.0.0.1:8088 \
  --with-operator \
  --operator-base http://<tailscale-ip>:8781
```

The smoke script never calls restart, session import, or other mutation routes.

Re-run the audit with `--stage shadow`. The worker being active is a blocker.

## Gate 7: PostgreSQL migration verification

Run migrations only against the new PostgreSQL database, using the migration
owner role. Then verify table availability using a non-source database:

```bash
DATABASE_URL='<migration-owner-url>' npm run db:migrate
DATABASE_URL='<verification-url>' node scripts/verify-postgres.mjs
```

This gate does not import Observatory data and does not change public reads.

## Gate 8: ingestion implementation and comparison

This is a later code batch. The importer must be idempotent, transactional,
checkpointed, append-oriented, source-traceable, and quarantine malformed
records. It reads preserved exports and SQLite without mutation.

Public reads remain file-backed while PostgreSQL results are compared privately.
No endpoint changes authority until differences are explained and approved.

## Gate 9: public cutover

Public cutover is separate from deployment and ingestion. Before approval:

- shadow smoke checks pass;
- file and PostgreSQL comparisons pass;
- the previous public Nginx config is backed up;
- the prior release symlink target is recorded;
- rollback commands are prepared and tested syntactically.

Cut over only the intended `/api/` route and static site. Never expose the
operator listener.

## Rollback rule

Rollback uses two independent controls:

1. restore the previous Nginx enabled-site/configuration;
2. atomically repoint `/srv/smallverse/current` to the previous immutable
   release and restart only the affected new services.

The existing preservation system remains untouched, so rollback never depends
on PostgreSQL or the new worker.
