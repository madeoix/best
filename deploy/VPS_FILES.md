# VPS deployment surface

## Tracked source inputs

`vps-source-paths.txt` lists the paths required to build, certify, package,
install, inspect, and roll back a production release.

## Included in generated releases

- static web output;
- compiled Fastify services;
- compiled contracts and database migrations;
- workspace package manifests and exact lockfile;
- production `infra/` templates;
- environment validator and dependency/security records;
- dry-run deployment, doctor, audit, smoke, and rollback tools;
- operations documentation;
- release metadata and checksums.

## Excluded from VPS releases

- `src-tauri/` and generated Rust output;
- `docs/research/`;
- reverse-engineering and local extraction tools;
- recovered SWFs and renderer backups;
- `.local-data/`;
- real `.env` files, credentials, tokens, and captures;
- source `node_modules` and local build caches.

The verifier rejects incomplete manifests, checksum mismatches, symlinks,
unsafe archive paths, unreviewed dependency state, public operator routing,
writable authoritative preservation paths, and units that violate service
identity boundaries.
