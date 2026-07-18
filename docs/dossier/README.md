# Smallverse Lab source dossier

This directory is the source-indexed companion to the product blueprint. The blueprint states what Smallverse Lab is intended to be; this dossier records what the recovered client and current repository actually implement.

## Scope and completeness rules

“Complete” in this dossier means complete for Smallverse Lab’s product boundary: session acquisition, Smallverse protocol calls, Popular-space discovery, room observation, owner/avatar identity, portrait acquisition, item/UID evidence, space identity, variant rendering, avatar reconstruction, Spin/Zoltar, persistence, publication, public routes, operator routes, and VPS operation.

The recovered client contains thousands of unrelated game, moderation, mission, social, and administration classes. Those are indexed when they expose a protocol call, but they are not narrated unless they provide data or behavior used by Smallverse Lab.

Every assertion uses one of four evidence labels:

- **Recovered** — directly visible in recovered ActionScript or SWF assets.
- **Captured** — directly visible in saved HTTP/AMF/RTMP traffic or preserved artifacts.
- **Implemented** — directly visible in the current Smallverse Lab source.
- **Unresolved** — plausible or desired, but not yet proven by the recovered client, a capture, or a successful live verification.

Generated projections, filenames, screenshots, and UI labels are never treated as primary protocol evidence.

## Volumes

1. [Protocol call catalog](./PROTOCOL-CALL-CATALOG.md) — recovered AMF service calls, callers, result formatters, and relevance.
2. [RTMP and SharedObject catalog](./RTMP-SHAREDOBJECT-CATALOG.md) — connection setup, remote object types, event flow, and captured entity state.
3. [Canonical data and lineage](./DATA-LINEAGE-AND-JOINS.md) — identifiers, schemas, joins, provenance, and field-by-field transformations.
4. [Physical schema catalog](./SCHEMA-CATALOG.md) — every current SQLite declaration plus the PostgreSQL foundation columns.
5. [Renderer and asset graph](./RENDERER-ASSET-GRAPH.md) — avatar and item reconstruction dependencies from XML/SWF input to PNG output.
6. [Runtime, services, and routes](./RUNTIME-SERVICES-AND-ROUTES.md) — local/VPS topology, systemd units, APIs, frontend routes, keyring, exports, and release boundaries.
7. [Unresolved claims and verification](./UNRESOLVED-AND-VERIFICATION.md) — contradictions, unknowns, live tests, and acceptance gates.
8. [Evidence closure report](./EVIDENCE-CLOSURE-REPORT.md) — read-only 2026-07-16 source/capture verification, closed gaps, artifact hashes, runtime diagnosis, and irreducible missing evidence.
9. [Old captures evidence report](./OLD-CAPTURES-EVIDENCE-REPORT.md) — decoded Fiddler/Wireshark evidence for Find Friends, owner/avatar boundaries, room UIDs/configs, auction state, Spin, Zoltar, and store gaps.
10. [Research dump evidence report](./RESEARCH-DUMP-EVIDENCE-REPORT.md) — read-only audit of the broader historical HAR/SAZ/PCAP/SQLite/headless dump, including the captured Popular category path, historical population ordering, projection loss, and Spin/Zoltar transaction-history schema.

The detailed narrative remains in [Smallverse Protocol and Crawler Foundation](../SMALLVERSE-PROTOCOL-AND-CRAWLER-FOUNDATION.md). The target product model remains in [Smallverse Lab Blueprint](../SMALLVERSE-LAB-BLUEPRINT.md). The current implementation failures remain in [Source-to-Blueprint Gap Audit](../SMALLVERSE-LAB-SOURCE-GAP-AUDIT.md).

## Authoritative order

When sources disagree, use this order:

1. a successful current live capture with request and response retained;
2. the recovered client implementation that produced the same protocol generation;
3. immutable raw capture artifacts;
4. normalized canonical database rows with provenance;
5. versioned publication manifests;
6. API read models;
7. frontend presentation;
8. historical exports, caches, screenshots, and filenames.

No lower layer may silently overwrite the meaning established by a higher layer.

## Repository surface measured on 2026-07-16

- 4,109 recovered ActionScript files under `recovered-swfs/main-source/scripts`.
- 716 recovered endpoint invocation sites in the service tree: 482 common-wrapper calls and 234 general/multiline calls. The catalog extracts app-relevant common calls and explicitly documents the critical identity, Popular Spaces, room, item, and SpinToWin calls whose source shape differs.
- 20 recovered remote SharedObject construction/access sites.
- 458 repository source, runtime, tooling, test, infrastructure, and documentation files after excluding builds and dependencies.
- 27 current API route registrations.
- 19 current avatar-rendering modules.
- 16 current SQLite `CREATE TABLE` sites across active and transitional tooling.

These counts define the audit surface; they are not claims that all recovered game functions belong in the product.
