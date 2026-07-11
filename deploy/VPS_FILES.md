# VPS deployment surface

## Tracked source inputs

`vps-source-paths.txt` lists the source paths needed to build, package, verify,
and operate the production web/API release.

## Included in generated releases

- static web build;
- compiled Fastify services;
- compiled contracts and database migrations;
- workspace package manifests;
- production `infra/` templates;
- deployment and operations documentation;
- read-only audit and smoke tools;
- release and database verification tools.

## Excluded from VPS releases

- `src-tauri/` and generated Rust output;
- `docs/research/`;
- `tools/` reverse-engineering and local extraction utilities;
- `recovered-swfs/`;
- `.renderer-backups/`;
- `.local-data/`;
- raw local capture files and credentials.

The release verifier rejects missing runtime components, checksum mismatches,
symlinks, unsafe archive paths, writable preservation mounts for the worker,
and production units that violate the service-account boundary.
