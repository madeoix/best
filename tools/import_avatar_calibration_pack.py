#!/usr/bin/env python3
"""Install a sanitized avatar calibration pack into Beacon static assets."""

from __future__ import annotations

import argparse
import json
import shutil
import tarfile
import tempfile
from pathlib import Path


def safe_member(member: tarfile.TarInfo) -> bool:
    path = Path(member.name)
    return not path.is_absolute() and ".." not in path.parts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pack")
    parser.add_argument("--lab-root", default=str(Path.home() / "smallverse-lab"))
    args = parser.parse_args()

    pack = Path(args.pack).expanduser().resolve()
    lab_root = Path(args.lab_root).expanduser().resolve()

    if not pack.is_file():
        raise SystemExit(f"Pack does not exist: {pack}")

    with tempfile.TemporaryDirectory(prefix="beacon-calibration-import-") as tmp:
        temp_root = Path(tmp)
        with tarfile.open(pack, "r:*") as tar:
            members = tar.getmembers()
            if not members or not all(safe_member(member) for member in members):
                raise SystemExit("Pack contains an unsafe archive path")
            try:
                tar.extractall(temp_root, members=members, filter="data")
            except TypeError:
                tar.extractall(temp_root, members=members)

        manifests = list(temp_root.rglob("manifest.json"))
        if len(manifests) != 1:
            raise SystemExit(f"Expected one manifest.json, found {len(manifests)}")

        manifest_path = manifests[0]
        manifest = json.loads(manifest_path.read_text())
        contract = manifest.get("contract") or manifest.get("schema")
        supported = {
            "beacon-avatar-calibration/v1",
            "smallverse-avatar-calibration-pack/v1",
        }
        if contract not in supported:
            raise SystemExit(f"Unsupported calibration contract: {contract}")
        if manifest.get("sanitized") is False:
            raise SystemExit("Refusing to import a pack marked unsanitized")

        avatar_id = str(manifest.get("avatar_id") or "").strip()
        if not avatar_id or not avatar_id.replace("-", "").isalnum():
            raise SystemExit("Manifest contains an invalid avatar ID")

        source_root = manifest_path.parent
        destination = lab_root / "static" / "avatar-calibration" / avatar_id
        incoming = destination.with_name(destination.name + ".incoming")

        if incoming.exists():
            shutil.rmtree(incoming)
        shutil.copytree(source_root, incoming)

        raw_manifest = json.loads((incoming / "manifest.json").read_text())
        if "states" in raw_manifest:
            states = raw_manifest.get("states", [])
            snapshots = raw_manifest.get("snapshots", [])
            gender = raw_manifest.get("gender", "unknown")
        else:
            states = []
            for entry in raw_manifest.get("full", []):
                index = int(entry.get("index", len(states)))
                base = f"full-{index:02d}"
                states.append({
                    "label": f"State {index + 1}",
                    "captured_at": entry.get("captured_at"),
                    "config": f"{base}/config.xml",
                    "preview": f"{base}/preview.png",
                    "body": f"{base}/body.png",
                    "thumb": f"{base}/thumb.png",
                    "config_sha256": entry.get("config_sha256"),
                    "preview_sha256": entry.get("preview_sha256"),
                    "body_sha256": entry.get("body_sha256"),
                    "thumb_sha256": entry.get("thumb_sha256"),
                    "selected_options": entry.get("selected_options", {}),
                })
            snapshots = [
                {
                    "png": f"snapshot-{index:02d}.png",
                    "sha256": entry.get("sha256") if isinstance(entry, dict) else None,
                }
                for index, entry in enumerate(raw_manifest.get("snapshots", []))
            ]
            gender = raw_manifest.get("gender", "female")

        public_manifest = {
            "contract": "beacon-avatar-calibration/v1",
            "avatar_id": avatar_id,
            "gender": gender,
            "sanitized": True,
            "states": states,
            "snapshots": snapshots,
        }
        for state in public_manifest["states"]:
            for key in ("config", "preview", "body", "thumb"):
                relative = state.get(key)
                if relative:
                    state[key] = f"/avatar-calibration/{avatar_id}/{relative}"
        for snapshot in public_manifest["snapshots"]:
            relative = snapshot.get("png")
            if relative:
                snapshot["png"] = f"/avatar-calibration/{avatar_id}/{relative}"
        (incoming / "manifest.json").write_text(json.dumps(public_manifest, indent=2) + "\n")

        if destination.exists():
            shutil.rmtree(destination)
        incoming.rename(destination)

    print(json.dumps({
        "ok": True,
        "avatar_id": avatar_id,
        "gender": public_manifest.get("gender"),
        "states": len(public_manifest.get("states", [])),
        "destination": str(destination),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
