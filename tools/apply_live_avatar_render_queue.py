#!/usr/bin/env python3
"""Install sanitized VPS avatar configs and build Beacon render contracts."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", required=True)
    parser.add_argument("--lab-root", default=str(Path.cwd()))
    parser.add_argument("--asset-root", default="/tmp/smallverse-avatar-assets")
    args = parser.parse_args()
    lab = Path(args.lab_root).resolve()
    data = json.loads(Path(args.queue).read_text())
    if data.get("contract") != "beacon-avatar-render-queue/v1":
        raise SystemExit("unsupported avatar render queue")
    completed = []
    for entry in data.get("avatars", []):
        avatar_id = str(entry.get("avatar_id") or "").lower()
        config = str(entry.get("config_xml") or "")
        if not re.fullmatch(r"[0-9a-f]{24}", avatar_id) or not config.lstrip().startswith("<avatar"):
            continue
        root = lab / "static" / "avatar-calibration" / avatar_id
        root.mkdir(parents=True, exist_ok=True)
        (root / "live-config.xml").write_text(config.rstrip() + "\n", encoding="utf-8")
        manifest = {
            "contract": "beacon-avatar-calibration/v1", "avatar_id": avatar_id,
            "gender": entry.get("gender") or "unknown", "sanitized": True,
            "captured_at": entry.get("captured_at"),
            "states": [{"config": f"/avatar-calibration/{avatar_id}/live-config.xml"}],
        }
        (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        subprocess.run([
            sys.executable, "tools/bootstrap_avatar_calibration_contract.py",
            "--avatar-id", avatar_id, "--lab-root", str(lab),
            "--asset-root", args.asset_root,
        ], cwd=lab, check=True, stdout=subprocess.DEVNULL)
        completed.append(avatar_id)
    print(json.dumps({"ok": True, "rendered": completed, "count": len(completed)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
