# Production command reference

`production-deploy.mjs` is the only tracked write-capable VPS control surface.
It is dry-run by default. Every mutation requires root, `--apply`, and the exact
confirmation shown by the dry run.

It never installs OS packages, runs database migrations, modifies
`/opt/smallverse`, or starts/enables `smallverse-worker.service`.

## Read-only status

```bash
sudo /usr/bin/node scripts/production-deploy.mjs status
```

## Foundation

```bash
sudo /usr/bin/node scripts/production-deploy.mjs foundation \
  --audit <audit.json>
```

Creates dedicated accounts and safe directories only after `--apply` and
`--confirm FOUNDATION`.

## Immutable install

```bash
sudo /usr/bin/node scripts/production-deploy.mjs install \
  --release <smallverse-commit.tar.gz> \
  --checksum <smallverse-commit.tar.gz.sha256>
```

The apply confirmation is `INSTALL:<first-12-of-archive-sha256>`. The command
verifies both checksums and release policy, extracts into an incoming directory,
performs production-only lockfile installation with scripts disabled, verifies
the installed dependency tree, makes it root-owned, and atomically renames it
to `/srv/smallverse/releases/<full-commit>`. It does not select or start it.

## Units

```bash
sudo /usr/bin/node scripts/production-deploy.mjs units --commit <commit>
```

The apply confirmation is `UNITS:<first-12-of-commit>`. It validates private
environment files, systemd units, and sudoers; installs them atomically; and
runs `daemon-reload`. It starts nothing.

## Select release and start private services

```bash
sudo /usr/bin/node scripts/production-deploy.mjs switch --commit <commit>
```

The apply confirmation is `SWITCH:<first-12-of-commit>`. It atomically selects
the release, restarts only public/operator APIs, performs direct health checks,
and restores the previous release or stops the new services on failure.

## Loopback shadow site

```bash
sudo /usr/bin/node scripts/production-deploy.mjs shadow --enable
sudo /usr/bin/node scripts/production-deploy.mjs shadow --disable
```

Confirmations are `SHADOW:ENABLE` and `SHADOW:DISABLE`. The shadow listener is
fixed to `127.0.0.1:8088`. Nginx state is snapshotted and restored on failure.

## Public activation

```bash
sudo /usr/bin/node scripts/production-deploy.mjs activate \
  --hostname <public-hostname> \
  --replace-site <existing-http-site-filename>
```

The confirmation is `ACTIVATE:<hostname>:<first-12-of-commit>`. The command
backs up only the named site, validates Nginx, reloads it, and smokes static and
API routes through loopback with the public Host header.

Automated activation refuses to overwrite a site that owns TLS, port 443,
HTTP/3, or QUIC. For an existing HTTPS site, review and include
`infra/nginx/smallverse-lab.locations.conf.template` inside the existing server
block, then validate and reload Nginx manually. The fragment owns no listener,
hostname, certificate, or redirect policy.

## Finalize boot persistence

After either automated HTTP activation or a separately reviewed TLS integration,
preview:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs finalize
```

The apply confirmation is `FINALIZE:<first-12-of-commit>`. Finalization
revalidates the selected release and environment, requires `nginx -t`, verifies
public and operator health, refuses to proceed if the worker is active or
enabled, and enables only the public/operator services at boot. Previous
enablement is recorded for rollback.

## Rollback

```bash
sudo /usr/bin/node scripts/production-deploy.mjs rollback
```

The dry run reports the state record and exact `ROLLBACK:<state-id>`
confirmation. Rollback restores only the release symlink and/or Nginx snapshot
recorded by that operation.

### Verify package-lock portability

```bash
npm run lockfile:verify
```

This must pass before `npm ci`, release packaging, or release certification. It
rejects private mirrors and any package download host other than the public npm
registry.
