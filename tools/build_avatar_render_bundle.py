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


# These are selected render categories, not UI-only picker icons.
# We still keep icons in debug_refs, but do not use them as render assets unless explicitly needed.
RENDER_OPTION_IDS = {
    "GenderOptions",
    "FaceAOptions",
    "FaceBOptions",
    "NoseAOptions",
    "NoseBOptions",
    "HairstyleOptions",
    "HairColorOptions",
    "HighlightOptions",
    "TintOptions",
    "SkinColorOptions",
    "EyeOptions",
    "EyeColorOptions",
    "BrowOptions",
    "EyebrowColorOptions",
    "MouthOptions",
    "LipstickOptions",
    "DecalOptions",
    "FoundationOptions",
    "BlusherOptions",
    "BlusherColorOptions",
    "EyeShadowOptions",
    "CuteEyeShadowOptions",
    "JSTop",
    "JSBottom",
    "JSFeet",
    "BodySkin",
}


BODY_CORE_ASSETS = [
    "avatars/body/base/unisex/avatar.xml",
    "avatars/body/base/unisex/frame_palette.xml",
    "avatars/body/base/unisex/shadow.png",
]


def expand_ref(ref: str, gender: str = "female") -> str:
    ref = ref.strip()

    for macro, path in MACROS.items():
        if ref.startswith(macro + "/"):
            return path + ref[len(macro):]

    return ref


def is_ui_icon(ref: str) -> bool:
    name = Path(ref).name.lower()
    return (
        name.startswith("icon_")
        or name.startswith("icons_")
        or "/icons/" in ref.lower()
        or "_icon." in name
    )


def is_render_asset(ref: str) -> bool:
    lower = ref.lower()

    if lower.endswith(".o3d"):
        return True

    if lower.endswith(".xml"):
        return True

    if lower.endswith(".png"):
        # keep actual render layers/textures/decals, drop picker icons
        if is_ui_icon(lower):
            return False
        return True

    return False


def elem_text(e: ET.Element) -> str:
    parts = [e.tag]
    parts += [f"{k}={v}" for k, v in e.attrib.items()]
    if e.text and e.text.strip():
        parts.append(e.text.strip())
    return " ".join(parts)


def find_parent_map(root: ET.Element):
    return {child: parent for parent in root.iter() for child in list(parent)}


def get_ancestors(parent_map, elem):
    out = []
    cur = elem
    while cur in parent_map:
        cur = parent_map[cur]
        out.append(cur)
    out.reverse()
    return out


def serialize(e: ET.Element, limit=2500) -> str:
    return ET.tostring(e, encoding="unicode")[:limit]


def find_option_elements(root: ET.Element, option_id: str, selected_ids: list[str]):
    """
    Find the exact selected option elements, avoiding the previous sibling-spam issue.

    Strategy:
    - Find an element whose id == option_id as the option group.
    - Search descendants of that group for selected IDs.
    - If not found, fallback to global id == selected_id.
    """
    option_groups = [e for e in root.iter() if e.attrib.get("id") == option_id]
    hits = []

    for group in option_groups:
        for selected_id in selected_ids:
            for e in group.iter():
                if e.attrib.get("id") == selected_id:
                    hits.append((group, e, selected_id))

    if hits:
        return hits

    # fallback: exact id match globally
    for selected_id in selected_ids:
        for e in root.iter():
            if e.attrib.get("id") == selected_id:
                hits.append((None, e, selected_id))

    return hits


def refs_from_context(group, selected_elem):
    """
    Use only selected element XML plus its direct children.
    Some design entries keep refs in child tags/attrs.
    Avoid dumping the whole parent option group.
    """
    chunks = [serialize(selected_elem, limit=10000)]

    for child in list(selected_elem):
        chunks.append(serialize(child, limit=10000))

    text = "\n".join(chunks)
    return sorted(set(m.group("ref") for m in ASSET_RE.finditer(text)))


def parse_selected_ids(raw):
    if raw is None:
        return []

    return [x.strip() for x in str(raw).split(",") if x.strip()]


def copy_asset(src_root: Path, static_root: Path, rel: str):
    src = src_root / rel
    dst = static_root / rel

    if not src.exists():
        return {
            "ref": rel,
            "exists": False,
            "url": f"/avatar-assets/{rel}",
        }

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

    return {
        "ref": rel,
        "exists": True,
        "url": f"/avatar-assets/{rel}",
        "bytes": dst.stat().st_size,
    }


def parse_o3d_summary(path: Path):
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--avatar-id", required=True)
    ap.add_argument("--lab-root", default=str(Path.home() / "smallverse-lab"))
    ap.add_argument("--asset-src", default="/tmp/smallverse-avatar-assets")
    ap.add_argument("--design", default="/tmp/smallverse-avatar-assets/avatars/designs/avatar_design.xml")
    args = ap.parse_args()

    avatar_id = args.avatar_id
    lab = Path(args.lab_root)
    asset_src = Path(args.asset_src)
    static_assets = lab / "static/avatar-assets"
    render_dir = lab / f"static/avatar-renders/{avatar_id}"
    render_dir.mkdir(parents=True, exist_ok=True)

    body_manifest_path = render_dir / "body-render-manifest.json"
    if not body_manifest_path.exists():
        raise SystemExit(f"Missing body manifest: {body_manifest_path}")

    body_manifest = json.loads(body_manifest_path.read_text())
    selected_options = body_manifest.get("selected_options", {})
    gender = (body_manifest.get("gender") or selected_options.get("GenderOptions") or "female").lower()

    design_root = ET.fromstring(Path(args.design).read_text(errors="ignore"))

    copied = {}
    missing = []
    option_records = []

    # Always copy base body assets.
    for rel in BODY_CORE_ASSETS:
        result = copy_asset(asset_src, static_assets, rel)
        copied[rel] = result
        if not result["exists"]:
            missing.append(rel)

    for option_id, selected_raw in selected_options.items():
        if option_id not in RENDER_OPTION_IDS:
            continue

        selected_ids = parse_selected_ids(selected_raw)
        if not selected_ids:
            continue

        hits = find_option_elements(design_root, option_id, selected_ids)

        option_render_assets = []
        option_debug_refs = []

        for group, selected_elem, selected_id in hits:
            refs = refs_from_context(group, selected_elem)

            for ref in refs:
                expanded = expand_ref(ref, gender=gender)
                option_debug_refs.append({
                    "raw": ref,
                    "expanded": expanded,
                    "ui_icon": is_ui_icon(expanded),
                    "render_asset": is_render_asset(expanded),
                })

                if not is_render_asset(expanded):
                    continue

                result = copy_asset(asset_src, static_assets, expanded)
                copied[expanded] = result

                if result["exists"]:
                    option_render_assets.append(result)
                else:
                    missing.append(expanded)

        option_records.append({
            "option_id": option_id,
            "selected_ids": selected_ids,
            "hit_count": len(hits),
            "render_assets": option_render_assets,
            "debug_refs": option_debug_refs,
        })

    # Add all selected body assets already present in body_manifest.selected_assets.
    for key, url in (body_manifest.get("selected_assets") or {}).items():
        if not url or not url.startswith("/avatar-assets/"):
            continue
        rel = url.replace("/avatar-assets/", "", 1)
        result = copy_asset(asset_src, static_assets, rel)
        copied[rel] = result
        if not result["exists"]:
            missing.append(rel)

    # Build categorized assets.
    all_assets = [v for v in copied.values() if v.get("exists")]
    head_meshes = []
    face_textures = []
    body_textures = []
    xml_assets = []

    for asset in all_assets:
        rel = asset["ref"].lower()

        if rel.endswith(".o3d"):
            p = asset_src / asset["ref"]
            head_meshes.append({
                **asset,
                "meshes": parse_o3d_summary(p) if p.exists() else [],
            })
        elif rel.endswith(".xml"):
            xml_assets.append(asset)
        elif rel.endswith(".png"):
            if "/head/" in rel:
                face_textures.append(asset)
            elif "/body/" in rel or "/items/" in rel:
                body_textures.append(asset)

    bundle = {
        "ok": True,
        "contract": "smallverse-avatar-render-bundle/v1",
        "avatar_id": avatar_id,
        "gender": gender,
        "source": {
            "selected_options": "body-render-manifest.json:selected_options",
            "design": "avatars/designs/avatar_design.xml",
            "asset_root": "/avatar-assets",
        },
        "selected_options": selected_options,
        "body": {
            "manifest_url": f"/avatar-renders/{avatar_id}/body-render-manifest.json",
            "body_xml": body_manifest.get("body_xml"),
            "frame_palette": body_manifest.get("frame_palette"),
            "selected_assets": body_manifest.get("selected_assets", {}),
        },
        "head": {
            "meshes": head_meshes,
            "textures": face_textures,
        },
        "xml_assets": xml_assets,
        "body_textures": body_textures,
        "options": option_records,
        "stats": {
            "copied_asset_count": len([x for x in copied.values() if x.get("exists")]),
            "missing_asset_count": len(sorted(set(missing))),
            "option_count": len(option_records),
            "head_mesh_count": len(head_meshes),
            "head_texture_count": len(face_textures),
            "body_texture_count": len(body_textures),
        },
        "missing_assets": sorted(set(missing)),
    }

    out = render_dir / "render-bundle.json"
    out.write_text(json.dumps(bundle, indent=2))

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "url": f"/avatar-renders/{avatar_id}/render-bundle.json",
        "stats": bundle["stats"],
        "head_meshes": [
            {"ref": x["ref"], "meshes": x.get("meshes", [])}
            for x in head_meshes
        ],
        "head_textures": [x["ref"] for x in face_textures],
        "missing_assets": bundle["missing_assets"][:50],
    }, indent=2))


if __name__ == "__main__":
    main()
