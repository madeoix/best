# VPS foundation

The production sequence and approval gates are defined in:

```text
docs/operations/production-rollout.md
```

Do not deploy over `/opt/smallverse`. The existing Python preservation system,
workspace, exports, and SQLite databases remain authoritative during the
transition.

## Required layout

```text
/srv/smallverse/releases/<git-commit>
/srv/smallverse/current -> releases/<git-commit>
/srv/smallverse/shared
/etc/smallverse/public-api.env
/etc/smallverse/operator-api.env
/etc/smallverse/worker.env
```

## Dedicated identities

Use three non-login Linux accounts:

```text
smallverse-public
smallverse-operator
smallverse-worker
```

Do not run a new API or worker as root. The operator account receives only the
exact sudo commands in `infra/sudoers/smallverse-operator`, installed mode
`0440` and validated with `visudo -cf`.

The public and worker accounts receive no sudo privileges. Preservation paths
are read-only in all three service units. Only the operator session staging
path and `/srv/smallverse/shared` are writable where explicitly declared.

## Worker kill switch

Production defaults to:

```text
SMALLVERSE_WORKER_ENABLED=false
```

The worker entrypoint refuses to start until that value is explicitly changed
to `true`. Do not change it during foundation or shadow deployment.

## Listener boundaries

- public API: `127.0.0.1:8780`;
- operator API: confirmed Tailscale IPv4 on port `8781`, or loopback for local
  testing;
- shadow Nginx: `127.0.0.1:8088`;
- public Nginx: unchanged until a separate cutover approval.

Production configuration rejects a non-loopback public API host and rejects a
wildcard operator host.
