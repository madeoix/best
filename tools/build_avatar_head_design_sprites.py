#!/usr/bin/env python3
import argparse
import json
import shutil
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

MACROS = {
    "$hf": "avatars/head/base/female",
    "$hm": "avatars/head/base/male",
    "$hu": "avatars/head/base/unisex",
    "$bf": "avatars/body/base/female",
    "$bm": "avatars/body/base/male",
    "$bu": "avatars/body/base/unisex",
}

HEAD_OPTIONS = [
    "HairstyleOptions",
    "GlassesOptions",
    "EyeOptions",
    "EyeShadowOptions",
    "CuteEyeShadowOptions",
    "BrowOptions",
    "MouthOptions",
    "LipstickOptions",
    "FoundationOptions",
    "BlusherOptions",
    "BlusherColorOptions",
    "HairColorOptions",
    "HighlightOptions",
    "TintOptions",
    "SkinColorOptions",
    "EyeColorOptions",
]

def expand_ref(ref):
    for macro, path in MACROS.items():
        if ref.startswith(macro + "/"):
            return path + ref[len(macro):]
    return ref

def find_id(root, wanted):
    for e in root.iter():
        if e.attrib.get("id") == wanted:
            return e
    return None

def hydrate(asset_root, rel):
    dest = asset_root / rel
    if dest.exists():
        return True

    url = "https://content.smallverse.app/assets/" + rel
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://content.smallverse.app/releases/en_US/main.swf",
        })
        with urllib.request.urlopen(req, timeout=8) as r:
            data = r.read()
        if not data:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return True
    except Exception:
        return False

def copy_to_static(asset_root, static_root, rel):
    hydrate(asset_root, rel)
    src = asset_root / rel
    dst = static_root / rel
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return True
    return False

def num_attrs(attrs):
    out = dict(attrs)
    for k in ["tx", "ty", "sx", "sy", "cx", "cy", "rot", "pri", "w", "h", "a", "b", "ct"]:
        if k in out:
            try:
                out[k] = float(out[k])
            except Exception:
                pass
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--avatar-id", required=True)
    ap.add_argument("--config-xml", required=True)
    ap.add_argument("--design", default="/tmp/smallverse-avatar-assets/avatars/designs/avatar_design.xml")
    ap.add_argument("--asset-root", default="/tmp/smallverse-avatar-assets")
    ap.add_argument("--lab-root", default=str(Path.home() / "smallverse-lab"))
    args = ap.parse_args()

    config = ET.fromstring(Path(args.config_xml).read_text())
    design = ET.fromstring(Path(args.design).read_text(errors="ignore"))

    asset_root = Path(args.asset_root)
    lab = Path(args.lab_root)
    static_root = lab / "static/avatar-assets"
    out_dir = lab / f"static/avatar-renders/{args.avatar_id}"
    out_dir.mkdir(parents=True, exist_ok=True)

    selected = {}
    weights = {}
    transforms = {}

    for opt in config.findall(".//options/option"):
        oid = opt.attrib.get("id")
        if not oid:
            continue
        if "sel" in opt.attrib and opt.attrib["sel"]:
            selected[oid] = [x.strip() for x in opt.attrib["sel"].split(",") if x.strip()]
        elif "w" in opt.attrib:
            weights[oid] = float(opt.attrib["w"])
        else:
            transforms[oid] = dict(opt.attrib)

    sprites = []
    colors = []
    models = []
    missing = []

    for option_id in HEAD_OPTIONS:
        for selected_id in selected.get(option_id, []):
            elem = find_id(design, selected_id)
            if elem is None:
                continue

            def walk(node, inherited=None):
                inherited = dict(inherited or {})
                tag = node.tag
                raw = num_attrs(node.attrib)

                current = dict(inherited)

                # <x tx="..." ty="..."> is a transform container in avatar_design.xml.
                if tag == "x":
                    current["tx"] = float(current.get("tx", 0)) + float(raw.get("tx", 0))
                    current["ty"] = float(current.get("ty", 0)) + float(raw.get("ty", 0))

                attrs = dict(raw)

                if tag == "s":
                    # Flatten inherited container position into the actual sprite.
                    if "tx" in current:
                        attrs["tx"] = float(current.get("tx", 0)) + float(attrs.get("tx", 0))
                    if "ty" in current:
                        attrs["ty"] = float(current.get("ty", 0)) + float(attrs.get("ty", 0))

                    if "s" in attrs:
                        ref = expand_ref(attrs["s"])
                        if ref.endswith(".png") and "/head/" in ref and "/icon" not in ref and "/icons_" not in ref:
                            ok = copy_to_static(asset_root, static_root, ref)
                            if not ok:
                                missing.append(ref)

                            sprites.append({
                                "option_id": option_id,
                                "selected_id": selected_id,
                                "id": attrs.get("id"),
                                "name": attrs.get("name"),
                                "cId": attrs.get("cId"),
                                "sId": attrs.get("sId"),
                                "ref": ref,
                                "url": f"/avatar-assets/{ref}",
                                "attrs": attrs,
                            })

                elif tag == "c":
                    colors.append({
                        "option_id": option_id,
                        "selected_id": selected_id,
                        "attrs": attrs,
                    })

                elif tag == "model" and "s" in attrs:
                    ref = expand_ref(attrs["s"])
                    models.append({
                        "option_id": option_id,
                        "selected_id": selected_id,
                        "ref": ref,
                        "attrs": attrs,
                    })

                for child in list(node):
                    walk(child, current)

            walk(elem)

    manifest = {
        "ok": True,
        "contract": "smallverse-avatar-head-design-sprites/v1",
        "avatar_id": args.avatar_id,
        "selected": {k: selected.get(k, []) for k in HEAD_OPTIONS if selected.get(k)},
        "weights": weights,
        "transforms": transforms,
        "sprites": sprites,
        "colors": colors,
        "models": models,
        "missing": sorted(set(missing)),
        "stats": {
            "sprite_count": len(sprites),
            "color_rule_count": len(colors),
            "model_ref_count": len(models),
            "missing_count": len(set(missing)),
        }
    }

    out = out_dir / "head-design-sprites.json"
    out.write_text(json.dumps(manifest, indent=2))

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "url": f"/avatar-renders/{args.avatar_id}/head-design-sprites.json",
        "stats": manifest["stats"],
        "sprites": [s["ref"] for s in sprites],
        "missing": manifest["missing"],
    }, indent=2))

if __name__ == "__main__":
    main()
