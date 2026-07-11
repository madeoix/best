# Read-only production audit

`scripts/production-audit.mjs` captures the facts needed before changing the
VPS. It is deliberately separate from installation and deployment.

## Safety behavior

The audit does not:

- invoke package managers;
- start, stop, restart, enable, or disable services;
- reload Nginx;
- read `/etc/smallverse/*.env` contents;
- write under `/opt`, `/srv`, `/etc`, or `/var/www`;
- call Smallverse application endpoints;
- modify PostgreSQL or SQLite.

When `--output` is supplied, the only write is the requested mode-`0600` JSON
report.

## Report contents

The report includes:

- host, OS, kernel, architecture, user, Node, and npm;
- availability of exact deployment commands;
- service-account existence;
- fixed systemd service and timer states;
- listener addresses without process command lines;
- Tailscale IPv4 availability;
- Nginx version, config-test result, and enabled-site metadata;
- PostgreSQL client availability and readiness;
- metadata for preservation, release, shared, environment, and unit paths;
- discovered Observatory database metadata;
- disk and memory summaries.

Environment values and tokens are never included.

## Commands

```bash
npm run production:audit -- \
  --output "$HOME/smallverse-production-audit.json"

npm run production:evaluate -- \
  "$HOME/smallverse-production-audit.json" --stage inventory
```

Hashing a multi-gigabyte preservation database is optional and can be slow:

```bash
npm run production:audit -- \
  --hash-preservation \
  --output "$HOME/smallverse-production-audit-with-hashes.json"
```

## Evaluation stages

The evaluator has four stages:

- `inventory`: confirms the authoritative preservation root and reports basic
  tooling without requiring any deployment changes;
- `foundation`: requires Node 24.x, npm 11.18.0, Nginx, Tailscale, dedicated
  accounts, safe directories, and root-owned private environment files;
- `shadow`: additionally requires a selected immutable release, installed
  units, active public/operator APIs, private listeners, and a stopped and
  disabled worker;
- `database`: separately requires PostgreSQL tooling, account, and readiness.

PostgreSQL absence is only a warning during file-backed foundation and shadow
stages. It blocks the later database stage, not initial Beacon deployment.

A blocker exits non-zero. Warnings remain visible for review.
