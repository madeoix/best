#!/usr/bin/env python3
import argparse
import json
import zlib
import base64
from pathlib import Path
from pyamf import remoting

def bytearray_to_bytes(x):
    for obj in [x, getattr(x, "stream", None)]:
        if obj is None:
            continue
        if hasattr(obj, "seek") and hasattr(obj, "read"):
            try:
                pos = obj.tell()
                obj.seek(0)
                data = obj.read()
                obj.seek(pos)
                if isinstance(data, str):
                    data = data.encode("latin1")
                return bytes(data)
            except Exception:
                pass
        if hasattr(obj, "getvalue"):
            try:
                data = obj.getvalue()
                if isinstance(data, str):
                    data = data.encode("latin1")
                return bytes(data)
            except Exception:
                pass
    try:
        return bytes(x)
    except Exception:
        return b""

def decode_config_string(s):
    if not isinstance(s, str) or not s:
        return None
    try:
        raw = base64.b64decode(s + "=" * (-len(s) % 4))
    except Exception:
        return None

    for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
        try:
            return zlib.decompress(raw, wbits).decode("utf-8", "replace")
        except Exception:
            pass

    try:
        return raw.decode("utf-8", "replace")
    except Exception:
        return None

def load_manifest(out_dir, avatar_id):
    p = out_dir / "snapshot-manifest.json"
    if p.exists():
        try:
            data = json.loads(p.read_text())
            if isinstance(data, dict):
                data.setdefault("avatar_id", avatar_id)
                data.setdefault("snapshots", [])
                data.setdefault("saveAvatar", [])
                return data
        except Exception:
            pass
    return {
        "avatar_id": avatar_id,
        "source": "SmallVerse Flash gateway capture oracle",
        "latest_snapshot": None,
        "latest_full_body": None,
        "latest_thumb": None,
        "latest_preview": None,
        "snapshots": [],
        "saveAvatar": []
    }

def write_manifest(out_dir, manifest):
    # newest first
    manifest["snapshots"] = sorted(
        {x["png"]: x for x in manifest.get("snapshots", [])}.values(),
        key=lambda x: x.get("capture_file", ""),
        reverse=True
    )
    manifest["saveAvatar"] = sorted(
        {x["capture_file"]: x for x in manifest.get("saveAvatar", [])}.values(),
        key=lambda x: x.get("capture_file", ""),
        reverse=True
    )
    (out_dir / "snapshot-manifest.json").write_text(json.dumps(manifest, indent=2))

def import_snapshot(cap_path, msg, lab):
    body = msg.body
    if not isinstance(body, (list, tuple)) or len(body) < 3:
        return None

    avatar_id = str(body[1])
    raw = bytearray_to_bytes(body[2])
    if not raw.startswith(b"\x89PNG"):
        return None

    out_dir = lab / "static" / "avatar-oracles" / avatar_id
    out_dir.mkdir(parents=True, exist_ok=True)

    snap_name = f"flash-saveAvatarSnapshot-{cap_path.stem}.png"
    out_png = out_dir / snap_name

    if out_png.exists() and out_png.read_bytes() == raw:
        return None

    out_png.write_bytes(raw)

    latest_png = out_dir / "flash-saveAvatarSnapshot.png"
    latest_png.write_bytes(raw)

    public_png = f"/avatar-oracles/{avatar_id}/{snap_name}"
    public_latest = f"/avatar-oracles/{avatar_id}/flash-saveAvatarSnapshot.png"

    capture_meta = {
        "avatar_id": avatar_id,
        "source": "captured avatar.saveAvatarSnapshot request",
        "capture_file": cap_path.name,
        "target": msg.target,
        "png": public_png,
        "latest_png": public_latest,
        "bytes": len(raw)
    }

    (out_dir / "snapshot-capture.json").write_text(json.dumps(capture_meta, indent=2))

    manifest = load_manifest(out_dir, avatar_id)
    manifest["latest_snapshot"] = public_latest
    manifest["snapshots"].append(capture_meta)
    write_manifest(out_dir, manifest)

    return {
        "avatar_id": avatar_id,
        "target": msg.target,
        "capture": cap_path.name,
        "png": str(out_png),
        "bytes": len(raw)
    }

def import_save_avatar(cap_path, msg, lab):
    body = msg.body
    if not isinstance(body, (list, tuple)) or len(body) < 9:
        return None

    avatar_id = str(body[1])
    out_dir = lab / "static" / "avatar-oracles" / avatar_id
    out_dir.mkdir(parents=True, exist_ok=True)

    fname = str(body[2]) if len(body) > 2 else ""
    lname = str(body[3]) if len(body) > 3 else ""

    config_xml = decode_config_string(body[5]) if len(body) > 5 else None
    if config_xml:
        (out_dir / "config.xml").write_text(config_xml)

    labels = [
        (6, "flash-preview.png", "preview"),
        (7, "flash-full-body.png", "full_body"),
        (8, "flash-thumb.png", "thumb"),
    ]

    wrote = []
    for idx, filename, key in labels:
        raw = bytearray_to_bytes(body[idx]) if len(body) > idx else b""
        if not raw.startswith(b"\x89PNG"):
            continue

        out_png = out_dir / filename
        if out_png.exists() and out_png.read_bytes() == raw:
            continue

        out_png.write_bytes(raw)
        wrote.append({
            "kind": key,
            "png": f"/avatar-oracles/{avatar_id}/{filename}",
            "bytes": len(raw)
        })

    if not wrote and not config_xml:
        return None

    oracle = {
        "avatar_id": avatar_id,
        "name": f"{fname} {lname}".strip(),
        "source": "captured avatar.saveAvatar request",
        "capture_file": cap_path.name,
        "target": msg.target,
        "preview": f"/avatar-oracles/{avatar_id}/flash-preview.png",
        "full_body": f"/avatar-oracles/{avatar_id}/flash-full-body.png",
        "thumb": f"/avatar-oracles/{avatar_id}/flash-thumb.png",
        "config": f"/avatar-oracles/{avatar_id}/config.xml"
    }
    (out_dir / "oracle.json").write_text(json.dumps(oracle, indent=2))

    manifest = load_manifest(out_dir, avatar_id)
    manifest["latest_full_body"] = oracle["full_body"]
    manifest["latest_preview"] = oracle["preview"]
    manifest["latest_thumb"] = oracle["thumb"]
    manifest["saveAvatar"].append({
        "avatar_id": avatar_id,
        "capture_file": cap_path.name,
        "target": msg.target,
        "name": oracle["name"],
        "renders": wrote,
        "config": oracle["config"] if config_xml else None
    })
    write_manifest(out_dir, manifest)

    return {
        "avatar_id": avatar_id,
        "target": msg.target,
        "capture": cap_path.name,
        "renders": wrote,
        "config": bool(config_xml)
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--captures-dir", default=str(Path.home() / ".config/SmallVerse/gateway-captures"))
    ap.add_argument("--lab-root", default=str(Path.home() / "smallverse-lab"))
    args = ap.parse_args()

    captures = Path(args.captures_dir)
    lab = Path(args.lab_root)

    imported = []

    for cap_path in sorted(captures.glob("gateway-request-*.json")):
        try:
            cap = json.loads(cap_path.read_text())
            body_hex = cap.get("bodyHex")
            if not body_hex:
                continue
            env = remoting.decode(bytes.fromhex(body_hex))
        except Exception:
            continue

        for _, msg in env.bodies:
            target = getattr(msg, "target", "")

            item = None
            if target == "avatar.saveAvatarSnapshot":
                item = import_snapshot(cap_path, msg, lab)
            elif target == "avatar.saveAvatar":
                item = import_save_avatar(cap_path, msg, lab)

            if item:
                imported.append(item)

    print(json.dumps({
        "ok": True,
        "imported_count": len(imported),
        "imported": imported
    }, indent=2))

if __name__ == "__main__":
    main()
