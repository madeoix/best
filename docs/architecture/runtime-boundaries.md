# Smallverse runtime boundaries

## Public web

The SvelteKit application is a static consumer SPA. It contains no server
routes and no direct operator API client.

Public requests pass through:

```text
src/lib/runtime/apiClient.js
```

The browser may configure only:

```text
VITE_SMALLVERSE_PUBLIC_API_BASE
```

Gateway, Explorer, Truth, and session controls are hidden outside the desktop
runtime.

## Public API

`apps/api/src/entrypoints/public.ts` serves read-only preservation data. It may
read allowlisted exports and PostgreSQL, but it may not execute commands, SSH,
read credentials, or control services.

## Operator API

`apps/api/src/entrypoints/operator.ts` is private and should bind to the
Tailscale address in production.

Every non-health route requires:

1. a bearer token;
2. a route-specific scope;
3. allowlisted inputs;
4. exact confirmation for mutations;
5. an audit event.

Recent audit records are available through `GET /ops/v1/audit` when the
operator API has a database connection.

The configured bootstrap token receives only the scopes listed in
`SMALLVERSE_OPERATOR_SCOPES`.

## Desktop boundary

Tauri owns local-machine behavior:

```text
desktop_runtime_info
desktop_recent_files
desktop_sessions
desktop_session_action
desktop_launch_tool
desktop_operator_action
desktop_operator_overview
```

The Rust layer keeps the operator token out of the JavaScript bundle. It reads
`SMALLVERSE_OPERATOR_API_URL` and `SMALLVERSE_OPERATOR_TOKEN` at process
startup and exposes only fixed operator operations.

The Tauri webview has a non-null CSP and a single capability file. Browser
builds receive no Tauri controls.

## Worker

`apps/api/src/entrypoints/worker.ts` owns future ingestion, indexing, rendering,
and integrity jobs.

## Enforcement

`scripts/check-runtime-boundaries.mjs` fails when:

- a SvelteKit `+server.js` route returns;
- browser code executes processes;
- browser code connects directly to the operator API;
- Tauri globals are accessed outside `desktopBridge.js`;
- the public API imports process execution;
- desktop CSP is disabled.
