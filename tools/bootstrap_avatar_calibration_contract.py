#!/usr/bin/env python3
"""Build a renderer contract from an installed sanitized calibration pack.

The calibration pack supplies the authoritative config XML and Flash PNGs.
This tool fetches the public SmallVerse avatar design document, hydrates only
assets referenced by the selected config, builds the v4 O3D contract, and
builds the selected head-sprite manifest. It never reads gateway captures,
cookies, raw AMF requests, or session identifiers.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

DESIGN_URL = (
    "https://content.smallverse.app/assets/"
    "avatars/designs/avatar_design.xml"
)


def fetch_design(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        DESIGN_URL,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://content.smallverse.app/releases/en_US/main.swf",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()
    if not payload:
        raise SystemExit("Avatar design download returned an empty response")
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as error:
        raise SystemExit(f"Avatar design response was not valid XML: {error}")
    if root.tag.lower() != "design":
        raise SystemExit(f"Unexpected avatar design root element: {root.tag}")
    destination.write_bytes(payload)


def resolve_static_path(lab_root: Path, public_path: str) -> Path:
    value = str(public_path or "").strip()
    if not value.startswith("/"):
        raise SystemExit(f"Expected a static public path, got: {value}")
    target = (lab_root / "static" / value.lstrip("/")).resolve()
    static_root = (lab_root / "static").resolve()
    if static_root not in target.parents:
        raise SystemExit(f"Calibration path escaped static root: {value}")
    return target


def run(command: list[str], cwd: Path) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--avatar-id", required=True)
    parser.add_argument("--state-index", type=int, default=0)
    parser.add_argument("--lab-root", default=str(Path.home() / "smallverse-lab"))
    parser.add_argument("--asset-root", default="/tmp/smallverse-avatar-assets")
    parser.add_argument("--refresh-design", action="store_true")
    args = parser.parse_args()

    lab_root = Path(args.lab_root).expanduser().resolve()
    asset_root = Path(args.asset_root).expanduser().resolve()
    avatar_id = args.avatar_id.strip()

    manifest_path = (
        lab_root / "static" / "avatar-calibration" / avatar_id / "manifest.json"
    )
    if not manifest_path.is_file():
        raise SystemExit(
            "Calibration manifest is not installed: " + str(manifest_path)
        )

    manifest = json.loads(manifest_path.read_text())
    if manifest.get("contract") != "beacon-avatar-calibration/v1":
        raise SystemExit("Unsupported calibration manifest contract")
    if manifest.get("avatar_id") != avatar_id:
        raise SystemExit("Calibration manifest avatar ID does not match request")

    states = manifest.get("states") or []
    if not 0 <= args.state_index < len(states):
        raise SystemExit(
            f"State index {args.state_index} is outside 0..{max(0, len(states)-1)}"
        )

    state = states[args.state_index]
    config_path = resolve_static_path(lab_root, state.get("config"))
    if not config_path.is_file():
        raise SystemExit("Calibration config is missing: " + str(config_path))

    config_root = ET.fromstring(config_path.read_text())
    config_gender = str(config_root.attrib.get("gender") or "").lower()
    manifest_gender = str(manifest.get("gender") or "").lower()
    if manifest_gender and config_gender and manifest_gender != config_gender:
        raise SystemExit(
            f"Calibration gender mismatch: manifest={manifest_gender} config={config_gender}"
        )

    design_path = asset_root / "avatars" / "designs" / "avatar_design.xml"
    if args.refresh_design or not design_path.is_file():
        print(f"Downloading public avatar design: {DESIGN_URL}")
        fetch_design(design_path)
    else:
        try:
            root = ET.fromstring(design_path.read_text(errors="ignore"))
        except ET.ParseError:
            print("Cached avatar design is invalid; downloading a fresh copy")
            fetch_design(design_path)
        else:
            if root.tag.lower() != "design":
                print("Cached avatar design has the wrong root; downloading a fresh copy")
                fetch_design(design_path)

    python = sys.executable
    common = [
        "--avatar-id", avatar_id,
        "--config-xml", str(config_path),
        "--lab-root", str(lab_root),
    ]

    # First pass hydrates every exact selected ref that the v4 resolver sees.
    run(
        [
            python,
            "tools/build_avatar_render_contract_v4.py",
            *common,
            "--asset-src", str(asset_root),
            "--design", str(design_path),
        ],
        lab_root,
    )

    # Build the selected feature sprites after hydration so eye, mouth, brow,
    # hair-shadow and decal layers can participate in the browser compositor.
    run(
        [
            python,
            "tools/build_avatar_head_design_sprites.py",
            *common,
            "--asset-root", str(asset_root),
            "--design", str(design_path),
        ],
        lab_root,
    )

    # Rebuild once so the final contract and copied-asset stats describe the
    # fully hydrated selected fixture rather than the pre-sprite state.
    run(
        [
            python,
            "tools/build_avatar_render_contract_v4.py",
            *common,
            "--asset-src", str(asset_root),
            "--design", str(design_path),
        ],
        lab_root,
    )

    contract_path = (
        lab_root / "static" / "avatar-renders" / avatar_id / "render-contract.v4.json"
    )
    sprite_path = (
        lab_root / "static" / "avatar-renders" / avatar_id / "head-design-sprites.json"
    )
    contract = json.loads(contract_path.read_text())
    sprites = json.loads(sprite_path.read_text())

    result = {
        "ok": True,
        "avatar_id": avatar_id,
        "gender": contract.get("gender"),
        "state_index": args.state_index,
        "contract": str(contract_path),
        "head_sprites": str(sprite_path),
        "contract_stats": contract.get("stats"),
        "head_sprite_stats": sprites.get("stats"),
        "missing_assets": contract.get("missing_assets", []),
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
