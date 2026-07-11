# Smallverse Lab production artifacts

This directory documents the tracked VPS surface. Templates live under
`infra/`; certified immutable archives are generated under ignored `releases/`.

## Release certification

Use Node 24.x and npm 11.18.0 from a clean Git worktree:

```bash
npm run release:lifecycle
```

The lifecycle verifies a fresh `git archive`, not the developer's existing
`node_modules`. It performs:

1. lockfile-only clean installation;
2. boundary, API, and runtime tests;
3. static web and Fastify builds;
4. production and complete-tree dependency audits;
5. immutable release packaging and checksum verification;
6. production-only `npm ci --omit=dev --ignore-scripts`;
7. installed-runtime verification.

The certified archive and `.sha256` sidecar are copied to `releases/` only after
all stages pass.

## Release contents

A verified release contains:

- the static Svelte build under `build/`;
- compiled public, operator, and worker Fastify entrypoints;
- compiled contracts and PostgreSQL migrations;
- every workspace manifest required by production `npm ci`;
- exact root package and lock files;
- Nginx, systemd, sudoers, and environment templates;
- the dry-run deployment control surface and read-only diagnostic tools;
- dependency inventory and security-review records;
- operations documentation;
- `RELEASE.json` and `MANIFEST.sha256`.

## Deployment boundary

A transferred release is verified before extraction and installed under:

```text
/srv/smallverse/releases/<full-git-commit>
```

It is never extracted over `/opt/smallverse`, an existing release, or the
`current` symlink. The worker remains disabled. Follow
`docs/operations/production-rollout.md` gate by gate.
