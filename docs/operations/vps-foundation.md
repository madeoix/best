# VPS foundation

The full approval sequence is in `production-rollout.md`. Foundation creates a
safe home for the new runtime without replacing the preservation system.

## Immutable boundary

```text
/opt/smallverse                         authoritative; never modified here
/srv/smallverse/releases/<git-commit>  immutable application releases
/srv/smallverse/current                atomic release symlink
/srv/smallverse/shared/operator        private operator staging
/srv/smallverse/shared/worker          future worker state
/srv/smallverse/shared/deployments     reversible operation records
/srv/smallverse/shared/nginx-backups   cutover snapshots
/etc/smallverse/*.env                  root-owned mode 0600
```

## Dedicated identities

```text
smallverse-public
smallverse-operator
smallverse-worker
```

All are non-login accounts. Only `smallverse-operator` receives the exact
commands in `infra/sudoers/smallverse-operator`, installed mode `0440` and
validated with `visudo -cf`. Public and worker accounts receive no sudo.

## Foundation command

First produce a dry-run plan from the reviewed read-only audit:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs foundation \
  --audit "$HOME/smallverse-production-audit.json"
```

Only after approval, repeat with the exact confirmation shown by the dry run:

```bash
sudo /usr/bin/node scripts/production-deploy.mjs foundation \
  --audit "$HOME/smallverse-production-audit.json" \
  --apply --confirm FOUNDATION
```

This command creates the three accounts and safe directories. It does not
install Node, npm, Nginx, Tailscale, PostgreSQL, or any other package. It does
not read or change `/opt/smallverse`.

## Environment boundary

Copy the three tracked examples to `/etc/smallverse`, replace placeholders, and
install them as `root:root` mode `0600`. Validate without printing values:

```bash
sudo /usr/bin/node scripts/validate-production-env.mjs \
  --dir /etc/smallverse --commit <full-git-commit>
```

Required listener policy:

- public API: `127.0.0.1:8780`;
- operator API: confirmed Tailscale address or loopback on `8781`;
- shadow Nginx: `127.0.0.1:8088`;
- worker: `SMALLVERSE_WORKER_ENABLED=false`.

PostgreSQL URLs may remain absent for the initial file-backed runtime.
