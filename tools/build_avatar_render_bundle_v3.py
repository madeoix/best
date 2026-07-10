#!/usr/bin/env python3
import argparse
import json
import re
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

ASSET_RE = re.compile(r'(?P<ref>(?:\$[a-z]{2}|avatars|items)[^"\'<>\s]+?\.(?:png|xml|o3d|swf))', re.I)

def expand_ref(ref):
    for macro, path in MACROS.items():
        if ref.startswith(macro + "/"):
            return path + ref[len(macro):]
    return ref

def fallback_refs(ref):
    """Known design refs that point at missing/renamed local assets."""
    fallbacks = {
        "avatars/head/base/male/faces/n_04_straight.o3d": [
            "avatars/head/base/female/faces/nose_04_straight.o3d",
        ],
        "$hm/faces/n_04_straight.o3d": [
            "avatars/head/base/female/faces/nose_04_straight.o3d",
        ],
    }

    expanded = expand_ref(ref)
    return [expanded] + fallbacks.get(expanded, []) + fallbacks.get(ref, [])


def copy_asset(src_root, static_root, rel):
    src = src_root / rel
    dst = static_root / rel
    out = {"ref": rel, "url": f"/avatar-assets/{rel}", "exists": src.exists()}
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        out["bytes"] = dst.stat().st_size
    return out

def hydrate_asset(src_root, rel):
    """Fetch selected asset from live content host if missing locally."""
    dest = src_root / rel
    if dest.exists():
        return False

    url = "https://content.smallverse.app/assets/" + rel
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://content.smallverse.app/releases/en_US/main.swf",
        })
        with urllib.request.urlopen(req, timeout=6) as r:
            data = r.read()
        if not data:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return True
    except Exception:
        return False

def refs_from_xml(elem):
    refs = set()

    # Direct AS3/XML design refs usually live in attributes:
    # <target s="$hf/faces/f_f_02_cute.o3d" />
    # <model s="$hf/hair/hair_fteenvamp.o3d" />
    # <s s="$hu/hair/h_base.png" />
    for e in elem.iter():
        for value in e.attrib.values():
            if not isinstance(value, str):
                continue

            for m in ASSET_RE.finditer(value):
                refs.add(expand_ref(m.group("ref")))

            if value.startswith(("$hf/", "$hm/", "$hu/", "$bf/", "$bm/", "$bu/", "avatars/", "items/")):
                if value.endswith((".png", ".xml", ".o3d", ".swf")):
                    refs.add(expand_ref(value))

    xml = ET.tostring(elem, encoding="unicode")
    for m in ASSET_RE.finditer(xml):
        refs.add(expand_ref(m.group("ref")))

    return sorted(refs)

def find_design_group(design_root, option_id):
    for e in design_root.iter():
        if e.attrib.get("id") == option_id:
            return e
    return None

def find_selected_elem(group, selected_id, design_root=None):
    if not selected_id:
        return None

    if group is not None:
        for e in group.iter():
            if e.attrib.get("id") == selected_id:
                return e

    # Some selected targets are not nested under their option group.
    # Example: FaceCuteTwo / NoseStraightOne / HairFBehindEarsTinted.
    if design_root is not None:
        for e in design_root.iter():
            if e.attrib.get("id") == selected_id:
                return e

    return None

def parse_o3d_summary(path):
    root = ET.fromstring(path.read_text(errors="ignore"))
    meshes = []
    for mesh in root.findall(".//mesh"):
        vertices = mesh.find(".//vertices")
        faces = mesh.find(".//faces")
        uvs = mesh.find(".//uvs")
        meshes.append({
            "name": mesh.attrib.get("name", ""),
            "vertex_count": len(list(vertices)) if vertices is not None else 0,
            "face_count": len(list(faces)) if faces is not None else 0,
            "uv_count": len(list(uvs)) if uvs is not None else 0,
        })
    return meshes

def score_ref(option_id, selected_id, ref):
    r = ref.lower()
    name = Path(r).name.lower()
    sid = selected_id.lower()

    score = 0

    if "icon" in name and option_id not in ("GlassesOptions",):
        score -= 100

    # Head geometry
    if option_id in ("FaceAOptions", "FaceBOptions"):
        if r.endswith(".o3d") and "/faces/" in r:
            score += 40
        if "cute" in sid and "cute" in r:
            score += 40
        if "thin" in sid and "thin" in r:
            score += 40

    elif option_id in ("NoseAOptions", "NoseBOptions"):
        if r.endswith(".o3d") and "/faces/nose_" in r:
            score += 40
        if "straight" in sid and "straight" in r:
            score += 40
        if "button" in sid and ("wide" in r or "button" in r or "nose_01" in r):
            score += 35

    elif option_id == "HairstyleOptions":
        if r.endswith(".o3d") and "/hair/" in r:
            score += 50
        if r.endswith(".png") and "/hair/" in r:
            score += 20
        if "behindears" in sid and ("behind" in r or "fbehind" in r or "ears" in r):
            score += 50
        if "berry" in sid and "berry" in r:
            score += 50

    elif option_id == "GlassesOptions":
        if "/props/" in r and (r.endswith(".o3d") or r.endswith(".png")):
            score += 50
        if "surfy" in sid and "surfy" in r:
            score += 50
        if "grey" in sid or "gray" in sid:
            score += 10

    # Face textures
    elif option_id == "EyeOptions":
        if "/eyes/" in r and r.endswith(".png"):
            score += 40
        for token in ["heavy", "makeup", "real", "norm", "iris", "base"]:
            if token in sid and token in r:
                score += 20

    elif option_id in ("EyeColorOptions",):
        if "/eyes/" in r and "iris" in r and r.endswith(".png"):
            score += 40
        if "brown" in sid and "brown" in r:
            score += 40

    elif option_id in ("EyeShadowOptions", "CuteEyeShadowOptions"):
        if ("/eyes/" in r or "/skin/" in r or "/decals/" in r) and r.endswith(".png"):
            score += 25
        if "vanilla" in sid and "vanilla" in r:
            score += 40
        if "lightbrown" in sid and ("brown" in r or "light" in r):
            score += 40

    elif option_id == "BrowOptions":
        if "/brow/" in r and r.endswith(".png"):
            score += 40
        if "anim07" in sid and ("07" in r or "anim07" in r):
            score += 50

    elif option_id == "MouthOptions":
        if "/mouth/" in r and r.endswith(".png"):
            score += 40
        if "toothy" in sid and ("tooth" in r or "teeth" in r):
            score += 50

    elif option_id == "LipstickOptions":
        if "/mouth/" in r and r.endswith(".png"):
            score += 30
        if "marylin" in sid or "marilyn" in sid:
            score += 30

    elif option_id == "BlusherOptions":
        if "/skin/" in r and r.endswith(".png"):
            score += 30
        if "80" in sid and "80" in r:
            score += 50

    elif option_id == "FoundationOptions":
        if "/skin/" in r and r.endswith(".png"):
            score += 20
        if "sheen3" in sid and ("sheen3" in r or "sheen" in r):
            score += 50

    # Body/options
    elif option_id in ("JSTop", "JSBottom", "JSFeet", "BodySkin"):
        if "/body/" in r and r.endswith(".png"):
            score += 40
        if "jump" in sid and "jump" in r:
            score += 40
        if "noshoe" in sid and ("bare" in r or "foot" in r):
            score += 40

    return score

def selected_options_from_config(config_root):
    selected = {}
    weights = {}
    transforms = {}

    for opt in config_root.findall(".//options/option"):
        oid = opt.attrib.get("id")
        if not oid:
            continue
        if "sel" in opt.attrib:
            selected[oid] = opt.attrib.get("sel") or ""
        elif "w" in opt.attrib:
            weights[oid] = float(opt.attrib["w"])
        else:
            transforms[oid] = dict(opt.attrib)

    return selected, weights, transforms

def dances_from_config(config_root):
    dances = []
    for dance in config_root.findall(".//dance"):
        dances.append({
            "id": dance.attrib.get("id"),
            "frames": [dict(f.attrib) for f in dance.findall("./f")]
        })
    return dances

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--avatar-id", required=True)
    ap.add_argument("--config-xml", required=True)
    ap.add_argument("--oracle-dir", default=None)
    ap.add_argument("--lab-root", default=str(Path.home() / "smallverse-lab"))
    ap.add_argument("--asset-src", default="/tmp/smallverse-avatar-assets")
    ap.add_argument("--design", default="/tmp/smallverse-avatar-assets/avatars/designs/avatar_design.xml")
    args = ap.parse_args()

    lab = Path(args.lab_root)
    src_root = Path(args.asset_src)
    static_root = lab / "static/avatar-assets"
    render_dir = lab / f"static/avatar-renders/{args.avatar_id}"
    render_dir.mkdir(parents=True, exist_ok=True)

    config_root = ET.fromstring(Path(args.config_xml).read_text())
    design_root = ET.fromstring(Path(args.design).read_text(errors="ignore"))

    selected, weights, transforms = selected_options_from_config(config_root)

    selected_assets = {}
    copied = {}
    missing = []

    for option_id, selected_raw in selected.items():
        if not selected_raw:
            continue

        ids = [x.strip() for x in selected_raw.split(",") if x.strip()]
        assets = []

        for sid in ids:
            group = find_design_group(design_root, option_id)
            selected_elem = find_selected_elem(group, sid, design_root)

            selected_ref_set = refs_from_xml(selected_elem) if selected_elem is not None else []

            # For model-bearing head options, the selected node is authoritative.
            # Do NOT mix sibling refs from the parent group, or NoseStraightOne can
            # accidentally pick NoseButtonTwo's f_anime mesh.
            if option_id in (
                "FaceAOptions", "FaceBOptions",
                "NoseAOptions", "NoseBOptions",
                "HairstyleOptions", "GlassesOptions"
            ) and selected_ref_set:
                refs = list(selected_ref_set)
            else:
                refs = []
                if selected_ref_set:
                    refs.extend(selected_ref_set)

                # Many non-model design nodes keep render refs in the group.
                if group is not None:
                    refs.extend(refs_from_xml(group))

            scored = []
            missing_candidates = []

            for original_ref in sorted(set(refs)):
                for ref in fallback_refs(original_ref):
                    exists = (src_root / ref).exists()
                    score = score_ref(option_id, sid, ref)

                    # Direct selected model refs are authoritative even when filename tokens
                    # don't match the human-readable option id.
                    if exists and ref.endswith(".o3d") and option_id in (
                        "FaceAOptions", "FaceBOptions",
                        "NoseAOptions", "NoseBOptions",
                        "HairstyleOptions", "GlassesOptions"
                    ):
                        score = max(score, 100)

                    # Selected head/body refs are allowed into the candidate list even
                    # when missing locally; copy_asset() hydrates them from /assets/.
                    if ref.endswith(".png") and option_id in (
                        "EyeOptions",
                        "BrowOptions",
                        "MouthOptions",
                        "LipstickOptions",
                        "FoundationOptions",
                        "BlusherOptions",
                        "EyeShadowOptions",
                        "CuteEyeShadowOptions",
                        "BlusherColorOptions",
                        "EyeColorOptions",
                        "HairColorOptions",
                        "HighlightOptions",
                        "TintOptions",
                        "SkinColorOptions",
                        "HairstyleOptions",
                        "GlassesOptions"
                    ):
                        score = max(score, 80)

                    if score > 0:
                        scored.append({"ref": ref, "score": score, "from": original_ref, "exists_before_hydrate": exists})
                    elif original_ref.endswith((".o3d", ".png")) and option_id in (
                        "FaceAOptions", "FaceBOptions",
                        "NoseAOptions", "NoseBOptions",
                        "HairstyleOptions", "GlassesOptions"
                    ):
                        missing_candidates.append(original_ref)

            scored.sort(key=lambda x: x["score"], reverse=True)

            if option_id in ("FaceAOptions", "FaceBOptions", "NoseAOptions", "NoseBOptions"):
                keep = [x for x in scored if x["ref"].endswith(".o3d")][:1]
            elif option_id in ("HairstyleOptions",):
                keep = [x for x in scored if x["ref"].endswith(".o3d") or x["ref"].endswith(".png")][:4]
            elif option_id in ("GlassesOptions",):
                keep = [x for x in scored if x["ref"].endswith(".o3d") or x["ref"].endswith(".png")][:3]
            elif option_id in (
                "EyeOptions",
                "BrowOptions",
                "MouthOptions",
                "LipstickOptions",
                "FoundationOptions",
                "BlusherOptions",
                "EyeShadowOptions",
                "CuteEyeShadowOptions",
                "BlusherColorOptions",
                "EyeColorOptions",
                "HairColorOptions",
                "HighlightOptions",
                "TintOptions",
                "SkinColorOptions"
            ):
                keep = [x for x in scored if x["ref"].endswith(".png")][:20]
            elif option_id in ("JSTop", "JSBottom", "JSFeet", "BodySkin"):
                keep = [x for x in scored if x["ref"].endswith(".png")][:8]
            else:
                keep = [x for x in scored if x["ref"].endswith(".png")][:8]

            for item in keep:
                hydrate_asset(src_root, item["ref"])
                hydrate_asset(src_root, item["ref"])
                result = copy_asset(src_root, static_root, item["ref"])
                copied[item["ref"]] = result
                if not result["exists"]:
                    missing.append(item["ref"])
                assets.append(result)

        if assets:
            selected_assets[option_id] = assets

    meshes = []
    textures = []
    body_textures = []

    for option_id, assets in selected_assets.items():
        for a in assets:
            ref = a["ref"]
            if ref.endswith(".o3d") and a.get("exists"):
                meshes.append({**a, "meshes": parse_o3d_summary(src_root / ref), "option_id": option_id})
            elif ref.endswith(".png") and "/head/" in ref:
                textures.append({**a, "option_id": option_id})
            elif ref.endswith(".png") and "/body/" in ref:
                body_textures.append({**a, "option_id": option_id})

    oracle = None
    if args.oracle_dir:
        oracle_path = Path(args.oracle_dir) / "oracle.json"
        if oracle_path.exists():
            oracle = json.loads(oracle_path.read_text())

    bundle = {
        "ok": True,
        "contract": "smallverse-avatar-render-bundle/v3",
        "avatar_id": args.avatar_id,
        "gender": config_root.attrib.get("gender"),
        "source_config_xml": args.config_xml,
        "oracle": oracle,
        "selected_options": selected,
        "weights": weights,
        "transforms": transforms,
        "dances": dances_from_config(config_root),
        "selected_assets_by_option": selected_assets,
        "head": {
            "meshes": meshes,
            "textures": textures,
        },
        "body": {
            "textures": body_textures,
        },
        "stats": {
            "selected_option_count": len(selected),
            "asset_group_count": len(selected_assets),
            "copied_asset_count": len([x for x in copied.values() if x.get("exists")]),
            "missing_asset_count": len(set(missing)),
            "head_mesh_count": len(meshes),
            "head_texture_count": len(textures),
            "body_texture_count": len(body_textures),
        },
        "missing_assets": sorted(set(missing)),
    }

    out = render_dir / "render-bundle.v3.json"
    out.write_text(json.dumps(bundle, indent=2))

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "url": f"/avatar-renders/{args.avatar_id}/render-bundle.v3.json",
        "stats": bundle["stats"],
        "meshes": [m["ref"] for m in meshes],
        "head_textures": [t["ref"] for t in textures],
        "body_textures": [t["ref"] for t in body_textures],
        "missing": bundle["missing_assets"],
    }, indent=2))

if __name__ == "__main__":
    main()
