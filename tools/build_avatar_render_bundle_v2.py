#!/usr/bin/env python3
import argparse
import json
import re
import shutil
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

def copy_asset(src_root, static_root, rel):
    src = src_root / rel
    dst = static_root / rel
    out = {"ref": rel, "url": f"/avatar-assets/{rel}", "exists": src.exists()}
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        out["bytes"] = dst.stat().st_size
    return out

def slug(s):
    return re.sub(r'[^a-z0-9]+', '', (s or '').lower())

def tokens_from_selected(selected):
    s = slug(selected)
    tokens = set()

    for word in [
        "fairy", "cute", "thin", "straight", "button", "berry", "medium",
        "freckle", "rouge", "palmy", "palm", "blusher", "eighty", "80",
        "skinny", "jump", "tshirt", "pants"
    ]:
        if word in s:
            tokens.add(word)

    if "lipstickpalmy" in s:
        tokens.update(["lip", "palm"])
    if "mouthumphstick" in s:
        tokens.update(["mouth", "anim05", "goofy", "smile", "std"])
    if "eyesfairyreal" in s:
        tokens.update(["fairy", "fantasyiris", "makeup1"])
    if "hairberry" in s:
        tokens.update(["berry"])
    if "browsmedium" in s:
        tokens.update(["medium"])
    if "facecutetwo" in s:
        tokens.update(["cute", "f_f_02"])
    if "facethinone" in s:
        tokens.update(["thin", "f_f_06"])
    if "nosestraight" in s:
        tokens.update(["straight", "nose_04"])
    if "nosebutton" in s:
        tokens.update(["button", "nose_01"])
    if "80sblusher" in s:
        tokens.update(["80blusher"])

    return tokens

def score_ref(option_id, selected_id, ref):
    r = ref.lower()
    name = Path(r).name.lower()
    stem = Path(r).stem.lower()
    toks = tokens_from_selected(selected_id)

    score = 0

    for t in toks:
        if t in r or t in stem:
            score += 10

    # Option-specific selected render assets.
    if option_id in ("FaceAOptions", "FaceBOptions"):
        if r.endswith(".o3d") and "/faces/" in r:
            score += 20
        if "icon_" in name:
            score -= 50

    elif option_id in ("NoseAOptions", "NoseBOptions"):
        if r.endswith(".o3d") and "/faces/nose_" in r:
            score += 25
        if "icon_" in name:
            score -= 50

    elif option_id == "HairstyleOptions":
        if r.endswith(".o3d") and "/hair/" in r:
            score += 30
        if "ht_" in name and "_shad" in name:
            score += 12
        if "icon_" in name:
            score -= 50

    elif option_id == "EyeOptions":
        if "/eyes/" in r and r.endswith(".png"):
            score += 20
        if "icon" in name:
            score -= 50
        if "eye_fairybase" in name or "eye_fantasyiris" in name or "eye_makeup1" in name:
            score += 50

    elif option_id == "BrowOptions":
        if "/brow/" in r and r.endswith(".png"):
            score += 20
        if name == "b_medium.png":
            score += 50
        if "icon" in name:
            score -= 50

    elif option_id == "MouthOptions":
        if "/mouth/" in r and r.endswith(".png"):
            score += 20
        if any(x in name for x in ["f_mouth_anim05_base", "f_mouth_anim05_teeth", "m_lipstick", "m_lipstickhlite", "m_smile", "m_smilehilite", "m_std_gloss"]):
            score += 40
        if "icon" in name:
            score -= 50

    elif option_id == "LipstickOptions":
        if "/mouth/" in r and r.endswith(".png"):
            score += 20
        if "icon_lip_palm" in name:
            score += 35
        if "icon_lip_" in name and "palm" not in name:
            score -= 30

    elif option_id == "DecalOptions":
        if "/decals/" in r and r.endswith(".png"):
            score += 20
        if name in ("d_freckles.png", "d_redcheeks.png"):
            score += 50
        if "icon" in name:
            score -= 50

    elif option_id == "BlusherOptions":
        if "/skin/" in r and r.endswith(".png"):
            score += 20
        if "mu_80blusher" in name:
            score += 50
        if "icon" in name:
            score -= 50

    elif option_id in ("HairColorOptions", "HighlightOptions", "TintOptions", "SkinColorOptions", "EyeColorOptions", "EyebrowColorOptions", "BlusherColorOptions", "EyeShadowOptions", "CuteEyeShadowOptions"):
        # Color options are not geometry; keep only actual texture/color assets that exist later if needed.
        if "icon_" in name:
            score -= 80
        if "/skin/" in r or "/hair/" in r or "/eyes/" in r:
            score += 5

    return score

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

def all_refs_under_selected(root, option_id, selected_id):
    option_groups = [e for e in root.iter() if e.attrib.get("id") == option_id]
    refs = []

    for group in option_groups:
        selected_hits = [e for e in group.iter() if e.attrib.get("id") == selected_id]
        for hit in selected_hits:
            xml = ET.tostring(hit, encoding="unicode")
            refs.extend(m.group("ref") for m in ASSET_RE.finditer(xml))

    # fallback: if selected child only has an icon, use option group refs but score them hard
    if not refs:
        for group in option_groups:
            xml = ET.tostring(group, encoding="unicode")
            refs.extend(m.group("ref") for m in ASSET_RE.finditer(xml))

    return sorted(set(expand_ref(r) for r in refs))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--avatar-id", required=True)
    ap.add_argument("--lab-root", default=str(Path.home() / "smallverse-lab"))
    ap.add_argument("--asset-src", default="/tmp/smallverse-avatar-assets")
    ap.add_argument("--design", default="/tmp/smallverse-avatar-assets/avatars/designs/avatar_design.xml")
    args = ap.parse_args()

    avatar_id = args.avatar_id
    lab = Path(args.lab_root)
    src_root = Path(args.asset_src)
    static_root = lab / "static/avatar-assets"
    render_dir = lab / f"static/avatar-renders/{avatar_id}"

    body_manifest = json.loads((render_dir / "body-render-manifest.json").read_text())
    selected = body_manifest.get("selected_options", {})
    root = ET.fromstring(Path(args.design).read_text(errors="ignore"))

    selected_assets = {}
    copied = {}
    missing = []
    debug = {}

    for option_id, selected_raw in selected.items():
        selected_ids = [x.strip() for x in str(selected_raw).split(",") if x.strip()]
        if not selected_ids:
            continue

        option_assets = []

        for sid in selected_ids:
            refs = all_refs_under_selected(root, option_id, sid)
            scored = []

            for ref in refs:
                score = score_ref(option_id, sid, ref)
                exists = (src_root / ref).exists()
                scored.append({"ref": ref, "score": score, "exists": exists})

            scored.sort(key=lambda x: (x["score"], x["exists"]), reverse=True)

            # Keep only meaningful selected render refs, not every sibling.
            keep = [x for x in scored if x["score"] > 0 and x["exists"]]

            # Hard cap avoids sibling explosion.
            if option_id in ("FaceAOptions", "FaceBOptions", "NoseAOptions", "NoseBOptions"):
                keep = [x for x in keep if x["ref"].endswith(".o3d")][:1]
            elif option_id == "HairstyleOptions":
                keep = [x for x in keep if x["ref"].endswith(".o3d") or "_shad.png" in x["ref"]][:3]
            elif option_id == "EyeOptions":
                keep = [x for x in keep if "/eyes/" in x["ref"] and x["ref"].endswith(".png")][:4]
            elif option_id == "MouthOptions":
                keep = [x for x in keep if "/mouth/" in x["ref"] and x["ref"].endswith(".png")][:7]
            elif option_id == "BrowOptions":
                keep = [x for x in keep if "/brow/" in x["ref"] and x["ref"].endswith(".png")][:2]
            elif option_id in ("DecalOptions", "BlusherOptions"):
                keep = [x for x in keep if x["ref"].endswith(".png")][:4]
            else:
                keep = keep[:3]

            for item in keep:
                result = copy_asset(src_root, static_root, item["ref"])
                copied[item["ref"]] = result
                if not result["exists"]:
                    missing.append(item["ref"])
                option_assets.append(result)

            debug[f"{option_id}:{sid}"] = {
                "top_scored": scored[:15],
                "kept": keep,
            }

        if option_assets:
            selected_assets[option_id] = option_assets

    # Include body selected assets exactly from body manifest.
    body_assets = {}
    for key, url in (body_manifest.get("selected_assets") or {}).items():
        if url and url.startswith("/avatar-assets/"):
            rel = url.replace("/avatar-assets/", "", 1)
            result = copy_asset(src_root, static_root, rel)
            copied[rel] = result
            body_assets[key] = result

    head_meshes = []
    head_textures = []

    for assets in selected_assets.values():
        for a in assets:
            if not a.get("exists"):
                continue
            ref = a["ref"]
            if ref.endswith(".o3d"):
                head_meshes.append({
                    **a,
                    "meshes": parse_o3d_summary(src_root / ref)
                })
            elif ref.endswith(".png") and "/head/" in ref:
                head_textures.append(a)

    bundle = {
        "ok": True,
        "contract": "smallverse-avatar-render-bundle/v2",
        "avatar_id": avatar_id,
        "gender": body_manifest.get("gender"),
        "selected_options": selected,
        "body": {
            "manifest_url": f"/avatar-renders/{avatar_id}/body-render-manifest.json",
            "assets": body_assets,
            "body_xml": body_manifest.get("body_xml"),
            "frame_palette": body_manifest.get("frame_palette"),
        },
        "head": {
            "selected_assets_by_option": selected_assets,
            "meshes": head_meshes,
            "textures": head_textures,
        },
        "stats": {
            "copied_asset_count": len([x for x in copied.values() if x.get("exists")]),
            "missing_asset_count": len(set(missing)),
            "selected_option_asset_groups": len(selected_assets),
            "head_mesh_count": len(head_meshes),
            "head_texture_count": len(head_textures),
        },
        "missing_assets": sorted(set(missing)),
        "debug_resolution": debug,
    }

    out = render_dir / "render-bundle.v2.json"
    out.write_text(json.dumps(bundle, indent=2))

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "url": f"/avatar-renders/{avatar_id}/render-bundle.v2.json",
        "stats": bundle["stats"],
        "head_meshes": [x["ref"] for x in head_meshes],
        "head_textures": [x["ref"] for x in head_textures],
        "missing_assets": bundle["missing_assets"],
    }, indent=2))

if __name__ == "__main__":
    main()
