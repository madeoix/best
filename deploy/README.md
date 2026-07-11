# Smallverse Lab production artifacts

This directory documents the tracked production surface. Runtime templates
live under `infra/`; generated releases live under `releases/` and are not
committed.

## Release contents

A verified release contains:

- the static Svelte build under `build/`;
- compiled public, operator, and worker Fastify entrypoints;
- compiled contracts and PostgreSQL migrations;
- every workspace `package.json` needed by `npm ci --omit=dev`;
- root package and lock files;
- Nginx, systemd, sudoers, and environment templates;
- production audit, smoke, database verification, and release verification
  scripts;
- operations documentation;
- `RELEASE.json` and `MANIFEST.sha256`.

Create one from a clean Node 24 worktree:

```bash
npm run release:package
```

For a source archive with no `.git` directory:

```bash
SMALLVERSE_RELEASE_COMMIT=<verified-git-sha> \
  npm run release:package
```

The packaging command verifies both the release directory and the final
archive before writing the archive SHA-256 file.

## Deployment boundary

A release is installed under:

```text
/srv/smallverse/releases/<commit>
```

It must never be extracted over `/opt/smallverse`, an existing release, or the
`current` symlink. Follow `docs/operations/production-rollout.md` gate by gate.
