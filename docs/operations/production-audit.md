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
- connect to Smallverse application endpoints;
- modify PostgreSQL or SQLite.

It may write one report file when `--output` is supplied. That file is created
with mode `0600`.

## Report contents

The JSON report includes:

- host, OS, kernel, architecture, user, Node, and npm;
- availability of required commands;
- fixed service-account existence;
- fixed systemd service and timer states;
- listener addresses without process command lines;
- Tailscale IPv4 availability;
- Nginx version, config-test result, and enabled-site metadata;
- PostgreSQL client version and readiness;
- metadata for preservation and deployment paths;
- discovered Observatory database metadata;
- disk and memory summaries.

Environment-file contents and tokens are never included.

## Evaluation stages

`evaluate-production-audit.mjs` has three increasingly strict stages:

- `inventory`: validates that the preservation source and audit tools are
  discoverable;
- `foundation`: additionally requires Node 24, PostgreSQL, Tailscale, service
  accounts, deployment paths, private environment files, and a current release
  symlink;
- `shadow`: additionally requires public/operator services active, the worker
  inactive, and no wildcard operator listener.

A blocker produces a non-zero exit status. Warnings remain visible but do not
change the exit status.
