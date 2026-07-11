# VPS foundation deployment

Do not deploy this batch directly over `/opt/smallverse`. The existing Python
preservation system and its 22 GB workspace remain authoritative during the
transition.

## Prerequisites

- Create a backup or storage snapshot of `/opt/smallverse`.
- Upgrade the VPS Node.js runtime from 18.19.1 to a currently supported release
  compatible with the lockfile.
- Install PostgreSQL before enabling the worker.
- Keep Nginx's existing `receipt-viewer` site untouched.
- Confirm the Tailscale address before copying the operator environment file.

## Filesystem

```text
/srv/smallverse/releases/<git-commit>
/srv/smallverse/current -> releases/<git-commit>
/srv/smallverse/shared
/etc/smallverse/public-api.env
/etc/smallverse/operator-api.env
/etc/smallverse/worker.env
```


## Operator service account

```bash
sudo useradd   --system   --home-dir /nonexistent   --shell /usr/sbin/nologin   smallverse-operator 2>/dev/null || true

sudo install   -d   -o smallverse-operator   -g smallverse-operator   -m 0700   /opt/smallverse/probe-lab-connect

sudo install   -o root   -g root   -m 0440   infra/sudoers/smallverse-operator   /etc/sudoers.d/smallverse-operator

sudo visudo   -cf   /etc/sudoers.d/smallverse-operator
```

Verify the exact privilege boundary before starting the API:

```bash
sudo -u smallverse-operator   sudo -n   /usr/bin/systemctl   show   smallverse-explorer.service   --property=ActiveState   --no-pager
```

The operator API does not require browser CORS. Leave
`SMALLVERSE_OPERATOR_ALLOWED_ORIGINS` empty when the Tauri Rust bridge is the
only client.

## Public API smoke test

```bash
curl -fsS http://127.0.0.1:8780/api/v1/health
curl -fsS http://127.0.0.1:8780/api/beacon/observatory/status
```

## Operator API smoke test

Run through Tailscale:

```bash
curl -fsS http://100.118.39.6:8781/ops/v1/health
curl -fsS \
  -H "Authorization: Bearer $SMALLVERSE_OPERATOR_TOKEN" \
  http://100.118.39.6:8781/ops/v1/services/smallverse-explorer.service
```

## Safety

The operator service must run as `smallverse-operator`, not root. Install the
narrow sudoers file from `infra/sudoers/smallverse-operator` with mode `0440`
and validate it with `visudo -cf`.

The operator systemd unit intentionally sets `NoNewPrivileges=false`. The API
itself remains unprivileged, but its fixed service/action allowlist uses
passwordless `sudo` for only the exact commands declared in the sudoers file.
Setting `NoNewPrivileges=true` would make those allowlisted commands fail.
Do not broaden the sudoers entries or replace them with a shell wildcard.
