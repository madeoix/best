# Production rollout gates

This is the ordered path from a clean repository to a reversible file-backed
Beacon deployment. Stop for review between gates. A successful command is not
permission to continue automatically.

## Permanent invariants

- `/opt/smallverse` remains authoritative and is never changed by these tools.
- Existing SQLite databases and preservation exports remain read-only.
- Releases are immutable under `/srv/smallverse/releases/<full-commit>`.
- `/srv/smallverse/current` is the only application release switch.
- Public API binds only to loopback.
- Operator API binds only to loopback or a confirmed Tailscale address.
- Operator routes are never proxied by public Nginx.
- Worker remains stopped, disabled, and blocked by environment configuration.
- No gate deletes a source database, export, prior release, backup, or legacy
  service.
- PostgreSQL and ingestion are later gates and do not block the initial
  file-backed runtime.

## Gate 0 — certify the repository release

Requirements:

```text
Node 24.x
npm 11.18.0
clean Git worktree
```

Run:

```bash
node --version
npm --version
git status --short
npm run release:lifecycle
```

The lifecycle verifies a fresh Git archive, clean lockfile installation, tests,
builds, dependency policy, packaging, checksums, and a production-only install.
The resulting files are written under ignored `releases/`:

```text
releases/smallverse-<12-char-commit>.tar.gz
releases/smallverse-<12-char-commit>.tar.gz.sha256
```

Do not transfer an archive if certification fails or the worktree was dirty.

## Gate 1 — read-only VPS inventory

Transfer only enough source to run the audit, then:

```bash
node scripts/production-audit.mjs \
  --output "$HOME/smallverse-production-audit.json"

node scripts/evaluate-production-audit.mjs \
  "$HOME/smallverse-production-audit.json" \
  --stage inventory
```

This gate changes nothing except the requested private report file. Review:

- OS and architecture;
- Node/npm presence and exact paths;
- disk and memory;
- Tailscale address;
- Nginx sites and `nginx -t`;
- current Smallverse services/timers;
- listener conflicts;
- `/opt/smallverse` and Observatory database locations;
- deployment path conflicts;
- PostgreSQL state as information only.

Stop and discuss every blocker or unexpected fact before Gate 2.

## Gate 2 — backup and recovery proof

This is separately approved maintenance, not automated by the repository.
Before installing anything:

1. create a provider snapshot or independent backup of `/opt/smallverse`;
2. create a database-safe read-only copy of every authoritative SQLite file;
3. record SHA-256 values;
4. open the copies read-only and perform integrity checks;
5. record Nginx available/enabled configuration and symlinks;
6. record enabled and active systemd units and timers.

A backup is accepted only after checksum and readability verification.

## Gate 3 — prerequisite and foundation preparation

The audit determines what, if anything, is missing. Package installation is
manual and separately reviewed. Required for the file-backed runtime:

```text
/usr/bin/node  -> Node 24.x
/usr/bin/npm   -> npm 11.18.0
Nginx
Tailscale with a confirmed IPv4 address
systemd-analyze, visudo, getent, useradd
```

PostgreSQL is not required yet.

Preview the tracked foundation operation:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs foundation \
  --audit "$HOME/smallverse-production-audit.json"
```

After reviewing the plan:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs foundation \
  --audit "$HOME/smallverse-production-audit.json" \
  --apply --confirm FOUNDATION
```

This creates only dedicated accounts and safe directories.

## Gate 4 — private production environment

Create these from the tracked examples:

```text
/etc/smallverse/public-api.env
/etc/smallverse/operator-api.env
/etc/smallverse/worker.env
```

Install as `root:root` mode `0600`. Set all three
`SMALLVERSE_VERSION` values to the full release commit. Keep:

```text
SMALLVERSE_WORKER_ENABLED=false
```

Database URLs may remain absent for the initial file-backed runtime.

Validate without printing values:

```bash
sudo /usr/bin/node scripts/validate-production-env.mjs \
  --dir /etc/smallverse \
  --commit <full-release-commit>
```

Re-run the audit and require the foundation stage to pass:

```bash
node scripts/production-audit.mjs \
  --output "$HOME/smallverse-production-foundation.json"

node scripts/evaluate-production-audit.mjs \
  "$HOME/smallverse-production-foundation.json" \
  --stage foundation
```

PostgreSQL may appear as a warning. Other blockers stop the rollout.

## Gate 5 — transfer and install the immutable release

Transfer both certified files. Verify the outer checksum before using the
control surface:

```bash
sha256sum -c smallverse-<commit>.tar.gz.sha256
```

Preview:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs install \
  --release ./smallverse-<commit>.tar.gz \
  --checksum ./smallverse-<commit>.tar.gz.sha256
```

The dry run prints the exact `INSTALL:<sha-prefix>` confirmation. Repeat with
`--apply --confirm ...` only after review. Installation verifies the archive,
performs a production-only lockfile install with lifecycle scripts disabled,
verifies runtime dependencies, and creates a root-owned immutable release. It
does not switch `current` or start services.

## Gate 6 — install runtime policy without starting it

Preview:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs units \
  --commit <full-release-commit>
```

Then repeat with the reported `UNITS:<commit-prefix>` confirmation. This
validates and installs systemd units and the narrow sudoers file, then runs
`daemon-reload`. It starts and enables nothing.

## Gate 7 — select release and start private APIs

Preview:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs switch \
  --commit <full-release-commit>
```

Then repeat with the reported `SWITCH:<commit-prefix>` confirmation. The switch
is atomic. Only public and operator APIs restart. Direct health checks run
automatically, and failure restores the previous release or stops the new
services when no prior release exists.

Inspect the selected release and service state:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs status
```

## Gate 8 — loopback-only Nginx shadow

Preview and then apply only after review:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs shadow --enable

sudo /usr/bin/node scripts/production-deploy.mjs shadow --enable \
  --apply --confirm SHADOW:ENABLE
```

The tracked site listens only on `127.0.0.1:8088`. Nginx is snapshotted,
validated, reloaded, and subjected to static plus API smoke checks. Failure
restores the prior Nginx state.

Run a fresh audit and require `--stage shadow` to pass:

```bash
node scripts/production-audit.mjs \
  --output "$HOME/smallverse-production-shadow.json"

node scripts/evaluate-production-audit.mjs \
  "$HOME/smallverse-production-shadow.json" \
  --stage shadow
```

Confirm the worker is both inactive and disabled. Then run the combined
read-only doctor:

```bash
sudo /usr/bin/node scripts/production-doctor.mjs \
  --release ./smallverse-<commit>.tar.gz \
  --audit "$HOME/smallverse-production-shadow.json" \
  --stage shadow \
  --env-dir /etc/smallverse
```

## Gate 9 — public cutover, separately approved

Public activation is not implied by a successful shadow. First identify the
exact existing Nginx site and whether it owns TLS.

For a plain reviewed HTTP site, preview:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs activate \
  --hostname <public-hostname> \
  --replace-site <existing-site-filename>
```

The apply confirmation is
`ACTIVATE:<hostname>:<commit-prefix>`. The command backs up only the named site,
validates and reloads Nginx, and smokes the SPA and API through loopback using
the public Host header. Failure restores the previous Nginx state.

The tool refuses to overwrite TLS/443/HTTP3/QUIC configuration. For an existing
HTTPS site, review and include:

```text
infra/nginx/smallverse-lab.locations.conf.template
```

inside the existing TLS server block. That fragment owns no listener,
hostname, certificate, or redirect. The manual edit, `nginx -t`, reload, and
smoke require a separate review.

After either activation path is verified, preview and separately approve boot
persistence:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs finalize
```

Repeat with the reported `FINALIZE:<commit-prefix>` confirmation. Finalization
rechecks Nginx and both API health endpoints, refuses an active or enabled
worker, and enables only public/operator services. It records prior enablement
for rollback.

## Rollback

Each switch, shadow, and activation operation writes a private state record
under `/srv/smallverse/shared/deployments`. Preview the latest rollback:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs rollback
```

Then repeat with `--apply --confirm ROLLBACK:<state-id>`. A specific older state
may be selected with `--state <file>`.

Rollback restores only the release symlink and/or Nginx snapshot recorded by
that operation. It does not delete the failed release or alter preservation
data.

## Later gate — PostgreSQL and ingestion

Only after the file-backed deployment is stable:

1. install and secure PostgreSQL;
2. create separate migration, public-read, operator-audit, and worker roles;
3. evaluate the audit with `--stage database`;
4. run migrations only against the new PostgreSQL database;
5. implement idempotent, transactional, checkpointed importers;
6. compare PostgreSQL results privately while public reads remain file-backed;
7. approve endpoint authority changes separately.

No current rollout command enables ingestion or modifies SQLite.

## Lockfile portability gate

Every source and release certification must pass `npm run lockfile:verify` before
installing dependencies. The repository pins `https://registry.npmjs.org/` and
permits only public npm tarball URLs plus repository-relative workspace entries
inside `package-lock.json`. Private mirrors, localhost, private IP addresses,
plain HTTP, and unknown package registries are release blockers.
