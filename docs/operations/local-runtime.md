# Local runtime

## One-time setup

The desktop crate requires Rust 1.88 or newer.

```bash
rustup update stable
npm install
npm run infra:up
npm run db:verify
```

`db:verify` runs all migrations and confirms that the foundation tables are
queryable.

## Sync safe preservation exports

```bash
npm run sync:exports
```

Defaults:

```text
remote host: casa
remote root: /opt/smallverse
local root:  .local-data
```

Overrides:

```bash
SMALLVERSE_SYNC_REMOTE=other-host \
SMALLVERSE_SYNC_REMOTE_ROOT=/srv/smallverse \
SMALLVERSE_SYNC_LOCAL_ROOT="$PWD/.local-data" \
npm run sync:exports
```

The sync script prefers the published `/var/www/smallverse/observatory-sync-lite.json` read model and stores it locally as `.local-data/workspace/observatory-sync.json`. It writes `.local-data/SHA256SUMS`. It does not copy SQLite
databases, raw captures, cookies, tokens, or sessions.

## Start the runtime

APIs and worker:

```bash
npm run dev:runtime
```

APIs, worker, and web frontend:

```bash
npm run dev:all
```

Default listeners:

```text
web          127.0.0.1:5173
public API   127.0.0.1:8780
operator API 127.0.0.1:8781
PostgreSQL   127.0.0.1:5432
```

The development operator token is intentionally local-only:

```text
smallverse-local-operator-token-change-me
```

Set `SMALLVERSE_OPERATOR_TOKEN` explicitly when testing a different value.

## Smoke test

With the runtime running:

```bash
npm run smoke:runtime
```

The smoke test verifies:

- public health;
- world and Observatory reads;
- item, avatar, and space profiles;
- cached spin-price behavior;
- versioned API envelopes;
- public rejection of operator routes;
- operator rejection without a token;
- operator acceptance with the configured token.

## Shutdown

Press `Ctrl+C` in the runtime terminal, then:

```bash
npm run infra:down
```

## Port override

The web process uses a strict port so the runtime never reports one URL while
Vite silently selects another:

```bash
SMALLVERSE_WEB_PORT=5174 npm run dev:all
```

## Compose compatibility

`infra:up`, `infra:down`, and `infra:logs` use the Docker Compose plugin when
available, then the legacy `docker-compose` command, and finally a direct
Docker fallback for the development PostgreSQL and MinIO containers.


## Desktop operator runtime

Start the APIs with the same operator token that the desktop process will use:

```bash
export SMALLVERSE_OPERATOR_TOKEN='smallverse-local-operator-token-change-me'
npm run dev:runtime
```

In another terminal:

```bash
export SMALLVERSE_OPERATOR_API_URL='http://127.0.0.1:8781'
export SMALLVERSE_OPERATOR_TOKEN='smallverse-local-operator-token-change-me'
npm run dev:desktop
```

The token is read by Rust at process startup. It is not compiled into the
frontend and is not stored in browser storage.

Verify the Rust command layer before launching the desktop app:

```bash
npm run test:desktop
```

The normal web app remains consumer-only. Session controls and technical modes
appear only in the Tauri runtime.
