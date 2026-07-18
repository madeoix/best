# Runtime services, routes, and deployment topology

## Runtime boundaries

```text
local workstation
  ├─ SvelteKit/Vite public UI
  ├─ Tauri desktop shell
  └─ optional SSH/noVNC views into VPS

VPS
  ├─ crawler browser profiles and human-login/noVNC surface
  ├─ crawler-01 / crawler-02 sessions in VPS keyring/secret service
  ├─ Popular collector timers
  ├─ friend-search/portrait/config harvest timers
  ├─ immutable capture/artifact workspace
  ├─ bounded import and publication jobs
  ├─ public API
  ├─ VPN-only operator API
  ├─ worker/PostgreSQL target runtime
  └─ nginx/static release
```

The desktop UI may control or observe VPS processes, but crawler logins and Smallverse traffic should originate on the VPS when the crawler is described as VPS-hosted.

## Application entry points

| Process | Entrypoint | Role |
|---|---|---|
| public API | `apps/api/src/entrypoints/public.ts` | read-only public data |
| operator API | `apps/api/src/entrypoints/operator.ts` | authenticated operational actions/status |
| worker | `apps/api/src/entrypoints/worker.ts` | ingestion/job processing target |
| Svelte UI | `src/routes/` | public and operator presentation |
| Tauri shell | `src-tauri/` | local desktop boundary/commands |
| local orchestrator | `scripts/dev-runtime.mjs` | starts coordinated development processes |

## Public API routes

Evidence: **Implemented** in `apps/api/src/modules/legacy/public-routes.ts`.

| Route | Current read source/purpose |
|---|---|
| `GET /api/beacon/world` | legacy combined world projection |
| `GET /api/beacon/avatars/recent` | recently captured avatars |
| `GET /api/beacon/observatory/status` | export/cache status |
| `GET /api/beacon/observatory/search` | legacy Observatory search |
| `GET /api/beacon/observatory/item` | Observatory item by source XML |
| `GET /api/beacon/item/profile` | legacy item profile |
| `GET /api/beacon/item/profiles` | batch legacy item profiles |
| `GET /api/beacon/avatar/profile` | legacy avatar profile by avatar ID |
| `GET /api/beacon/avatar/badge` | generated placeholder/status SVG |
| `GET /api/beacon/space/profile` | legacy space profile by space ID |
| `GET /api/beacon/spin/prices` | Spin price projection |
| `GET /api/v1/search` | enveloped search |
| `GET /api/v1/observatory/item` | enveloped Observatory item |
| `GET /api/v1/items/profile` | enveloped item profile |
| `GET /api/v1/avatars/:avatarId` | enveloped avatar profile |
| `GET /api/v1/spaces/:spaceId` | enveloped space profile |
| `GET /api/v1/spin/prices` | enveloped Spin prices |

The duplicate `/api/beacon/*` and `/api/v1/*` families expose the same legacy store through different envelopes. They are transitional, not two authorities.

## Common service and health routes

| Route | Process | Meaning |
|---|---|---|
| `GET /_service` | every API process | service-name discovery and request metadata |
| `GET /health` | public and operator APIs | generic health/dependency response |
| `GET /api/v1/health` | public API | public canonical health alias |
| `GET /ops/v1/health` | operator API | operator canonical health alias |

These are registered through `apps/api/src/lib/app-base.ts` and `apps/api/src/modules/health/routes.ts`. The second health alias is selected dynamically from the configured service name, so one process does not expose both aliases.

## Operator routes

Evidence: **Implemented** in `apps/api/src/modules/operator/routes.ts`.

| Route | Required scope | Meaning |
|---|---|---|
| `GET /ops/v1/overview` | `operations:read` | operator summary |
| `GET /ops/v1/audit` | `audit:read` | audited action history |
| `GET /ops/v1/services/:service` | `services:read` | allowlisted systemd status |
| `POST /ops/v1/services/:service/restart` | `services:write` | confirmed, audited restart |
| `POST /ops/v1/actions/:action` | `operations:write` | confirmed, allowlisted operational action |
| `POST /ops/v1/sessions/import` | `sessions:write` | import session material through protected boundary |

An Observatory screen is useful only when these fields correspond to actionable domain states: crawler session freshness, last successful room capture, Popular queue, identity enrichment backlog, config/render backlog, publication generation, failures, and resource usage. Generic `explorer unavailable` cards are implementation diagnostics, not useful operator information.

## Frontend routes

| Route | Intended surface |
|---|---|
| `/` | Beacon search/home |
| `/items` | rare/legendary item discovery |
| `/avatars` | resolved avatar directory |
| `/avatar/[avatarId]` | canonical SkyCrypt-style avatar profile |
| `/spaces` | canonical observed spaces |
| `/spin` | personal-account Spin control/receipts |
| `/zoltar` | Zoltar control/transactions |
| `/receipts` | operation receipts |
| `/ops` | private operator overview |
| `/ops/live-avatars` | live crawler observation surface |
| `/ops/render/[avatarId]` | private render diagnosis |
| `/avatar-render/[avatarId]` | renderer evidence/lab route |
| `/avatar-oracles/[avatarId]/compare` | captured-versus-reconstructed comparison |

Empty or experimental routes must be private/labeled or removed from public navigation. A diagnostic lab is not a public profile.

## Systemd services and resource limits

### Platform services

- `infra/systemd/smallverse-public-api.service`: unprivileged read API, strict filesystem protection, read-only preservation sources.
- `infra/systemd/smallverse-operator-api.service`: VPN-only operator process with fixed sudo allowlist and audit boundary.
- `infra/systemd/smallverse-worker.service`: unprivileged ingestion worker with PostgreSQL dependency and read-only preservation inputs.

### Collection/enrichment services

- `smallverse-popular-avatar-collector@.service/.timer`: per-crawler Popular collection every 20 minutes with randomized delay and explicit CPU/memory/task limits.
- `smallverse-avatar-harvest.service/.timer`: decode RTMP avatar configs and cache portraits after captures.
- `smallverse-avatar-friend-search.service/.timer`: six-hour two-letter identity/portrait enrichment, currently configured for crawler-02 despite comments mentioning crawler-01.
- `smallverse-avatar-portrait-refresh.service/.timer`: six-hour portrait cache refresh.
- `smallverse-universal-api-sqlite.conf`: prevents the read API’s SQLite startup behavior from causing a restart storm and caps memory.

The duplicate collector unit files under `session/` lack the resource controls present under `deploy/systemd/`. Deployment must install only the hardened units or keep them identical.

## Session and human-login flow

1. Operator opens the VPS-hosted Chromium/noVNC login surface for a named crawler profile.
2. Human completes login and any CAPTCHA directly in that remote browser.
3. Session capture extracts the refreshed cookie/session state without printing it.
4. Secret material is stored in the VPS keyring/secret service.
5. A generation/fingerprint and timestamp are synchronized to operational status.
6. Collectors consume the secret in memory.
7. Expired sessions move to renewal-required; they do not loop login attempts or bypass CAPTCHA/VPN controls.

Relevant sources live under `session/`, especially `vps-crawler-human-login.sh`, `crawler-session-renew.sh`, `crawler_autologin.mjs`, and the Popular collector scripts.

## Crawler specialization

- `crawler-01`: room/object/UID capture and general Popular observation.
- `crawler-02`: avatar identity/config/portrait-focused collection and capacity backup.

This is an intended assignment, not yet a hard invariant. Actual timers, session status, and capture receipts determine what each crawler is doing. The friend-search service currently invokes `--session-profile crawler-02`; comments that call it crawler-01 are stale documentation.

### Read-only runtime finding, 2026-07-16

The VPS itself was healthy during inspection, but both per-crawler Popular timers were inactive. Their last runs reported either no HTTP status from the live Popular API or no reachable signed-in Smallverse browser, after which stale fallback was deliberately refused. Friend-search/portrait enrichment also encountered connection refusal at its local Chrome DevTools Protocol endpoint. The avatar-harvest timer continued to succeed by processing retained PCAPs, so its recent timestamps do not prove fresh room crawling.

The operational dependency is therefore explicit: scheduled collection requires a live signed-in VPS browser/CDP profile plus the crawler service. Re-enabling timers without restoring that dependency would repeat failures and add load without producing new evidence.

## Publication and sync

Current synchronization copies preserved exports and constructs projections from mixed JSON, SQLite, and static directories. The safe target is:

1. crawler writes immutable capture receipt and artifacts;
2. bounded importer writes canonical staging rows;
3. enrichment jobs resolve missing identity/assets/config;
4. validation rejects incomplete public entities;
5. publisher builds one immutable generation and manifest;
6. deployment atomically changes the release/generation pointer;
7. public API performs bounded indexed reads only.

The Observatory export must not run synchronously for every capture. `session/import_vps_live_capture.py` now makes that expensive merge explicit via `--sync-observatory`; this avoids the historical VPS overload path.

## Spin and Zoltar boundary

Spin/Zoltar use a personal account, not crawler credentials. They require their own named secret/session, request receipts, transaction persistence, retry/idempotency rules, and operator UI. Crawler rotations must never overwrite or borrow the personal Spin session.

Recovered service calls establish possible request names and result shapes; current live availability and transaction behavior require retained captures. See the protocol foundation and protocol call catalog.

## Deployment authority

- source tree: `/home/maddie/smallverse-lab` locally;
- packaged release: built through `scripts/package-release.mjs`;
- production release target: `/srv/smallverse/current` for the new API services;
- preservation/crawler workspaces: `/opt/smallverse`, `/opt/smallverse/workspace`, and `/opt/smallverse/automation-workspace` as referenced by units;
- static/public legacy path: `/var/www/smallverse` where configured;
- nginx templates: `infra/nginx/`;
- production checks: `scripts/production-*.mjs`, `smoke-production.mjs`, and release verification scripts.

These multiple roots are intentional boundaries only if deployment manifests state which process reads each one. Otherwise they are a source of version drift.
