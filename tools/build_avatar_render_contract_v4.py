#!/usr/bin/env python3

import argparse
import hashlib
import json
import re
import shutil
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


MACROS = {
    "$hf": "avatars/head/base/female",
    "$hm": "avatars/head/base/male",
    "$hu": "avatars/head/base/unisex",
    "$bf": "avatars/body/base/female",
    "$bm": "avatars/body/base/male",
    "$bu": "avatars/body/base/unisex",
}

ASSET_RE = re.compile(
    r'(?P<ref>(?:\$[a-z]{2}|avatars|items)[^"\'<>\s]+?'
    r'\.(?:png|xml|o3d|swf))',
    re.I,
)

# These are SmallVerse option semantics, not avatar-specific filenames.
MORPH_GROUP_BY_OPTION = {
    "FaceAOptions": "face",
    "FaceBOptions": "face",
    "NoseAOptions": "nose",
    "NoseBOptions": "nose",
}


def expand_ref(ref):
    ref = str(ref).strip()

    for macro, path in MACROS.items():
        if ref.startswith(macro + "/"):
            return path + ref[len(macro):]

    return ref


def refs_from_selected_element(elem):
    """
    Collect assets owned by one selected design node.

    Nested elements with their own id are selection boundaries and must not
    donate assets to their parent. This prevents taxonomy/container nodes such
    as a gender selection from recursively importing an entire asset catalog.
    """
    if elem is None:
        return []

    refs = set()
    root_id = elem.attrib.get("id")

    def collect(node, is_root=False):
        node_id = node.attrib.get("id")

        # A nested named node represents another selectable design item.
        if not is_root and node_id and node_id != root_id:
            return

        for value in node.attrib.values():
            if not isinstance(value, str):
                continue

            for match in ASSET_RE.finditer(value):
                refs.add(expand_ref(match.group("ref")))

            if value.startswith(
                (
                    "$hf/",
                    "$hm/",
                    "$hu/",
                    "$bf/",
                    "$bm/",
                    "$bu/",
                    "avatars/",
                    "items/",
                )
            ) and value.lower().endswith(
                (".png", ".xml", ".o3d", ".swf")
            ):
                refs.add(expand_ref(value))

        for child in list(node):
            collect(child)

    collect(elem, is_root=True)
    return sorted(refs)


def find_design_group(design_root, option_id, gender=None):
    """
    Resolve an option group inside the avatar's selected gender branch.

    The SmallVerse design contains duplicate option IDs under Male and Female.
    Returning the first global occurrence silently binds assets from the wrong
    gender branch.
    """
    candidates = [
        elem
        for elem in design_root.iter()
        if elem.attrib.get("id") == option_id
    ]

    if len(candidates) == 1:
        return candidates[0]

    if gender:
        wanted_gender = str(gender).strip().lower()

        for gender_node in design_root.iter():
            node_id = str(
                gender_node.attrib.get("id", "")
            ).strip().lower()

            if node_id != wanted_gender:
                continue

            scoped = [
                elem
                for elem in gender_node.iter()
                if elem.attrib.get("id") == option_id
            ]

            if len(scoped) == 1:
                return scoped[0]

    # Ambiguous duplicate groups must not fall back to first-match.
    return None


def find_selected_element(design_root, group, selected_id):
    """
    Resolve the selected item within its already gender-scoped option group.

    A global fallback is permitted only when the selected ID is unique across
    the entire design document.
    """
    if not selected_id:
        return None

    if group is not None:
        scoped = [
            elem
            for elem in group.iter()
            if elem.attrib.get("id") == selected_id
        ]

        if len(scoped) == 1:
            return scoped[0]

        if len(scoped) > 1:
            return None

    global_candidates = [
        elem
        for elem in design_root.iter()
        if elem.attrib.get("id") == selected_id
    ]

    if len(global_candidates) == 1:
        return global_candidates[0]

    return None


def selected_options_from_config(config_root):
    selected = {}
    weights = {}
    transforms = {}

    for option in config_root.findall(".//options/option"):
        option_id = option.attrib.get("id")

        if not option_id:
            continue

        if "sel" in option.attrib:
            selected[option_id] = option.attrib.get("sel") or ""
        elif "w" in option.attrib:
            weights[option_id] = float(option.attrib["w"])
        else:
            transforms[option_id] = dict(option.attrib)

    return selected, weights, transforms


def dances_from_config(config_root):
    return [
        {
            "id": dance.attrib.get("id"),
            "frames": [
                dict(frame.attrib)
                for frame in dance.findall("./f")
            ],
        }
        for dance in config_root.findall(".//dance")
    ]


def hydrate_asset(source_root, relative_path):
    destination = source_root / relative_path

    if destination.exists():
        return False

    url = (
        "https://content.smallverse.app/assets/"
        + relative_path
    )

    try:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": (
                    "https://content.smallverse.app/"
                    "releases/en_US/main.swf"
                ),
            },
        )

        with urllib.request.urlopen(
            request,
            timeout=8,
        ) as response:
            data = response.read()

        if not data:
            return False

        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        destination.write_bytes(data)
        return True
    except Exception:
        return False


def copy_asset(source_root, static_root, relative_path):
    source = source_root / relative_path
    destination = static_root / relative_path

    result = {
        "ref": relative_path,
        "url": f"/avatar-assets/{relative_path}",
        "exists": source.exists(),
    }

    if source.exists():
        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        shutil.copy2(source, destination)
        result["bytes"] = destination.stat().st_size

    return result


def element_children_count(elem):
    return len(list(elem)) if elem is not None else 0


def o3d_topology(path):
    root = ET.fromstring(
        path.read_text(errors="ignore")
    )

    mesh_summaries = []

    for mesh in root.findall(".//mesh"):
        vertices = mesh.find("./vertices")
        if vertices is None:
            vertices = mesh.find(".//vertices")

        faces = mesh.find("./faces")
        if faces is None:
            faces = mesh.find(".//faces")

        uvs = mesh.find("./uvs")
        if uvs is None:
            uvs = mesh.find(".//uvs")

        topology_faces = []

        if faces is not None:
            for face in faces.findall("./face"):
                uv = face.find("./uv")

                topology_faces.append(
                    {
                        "v": [
                            face.attrib.get("a"),
                            face.attrib.get("b"),
                            face.attrib.get("c"),
                        ],
                        "m": face.attrib.get("m", "0"),
                        "uv": (
                            [
                                uv.attrib.get("a"),
                                uv.attrib.get("b"),
                                uv.attrib.get("c"),
                            ]
                            if uv is not None
                            else None
                        ),
                    }
                )

        topology_payload = {
            "vertex_count": element_children_count(vertices),
            "face_count": element_children_count(faces),
            "uv_count": element_children_count(uvs),
            "faces": topology_faces,
        }

        topology_hash = hashlib.sha256(
            json.dumps(
                topology_payload,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()

        mesh_summaries.append(
            {
                "name": mesh.attrib.get("name", ""),
                "vertex_count": topology_payload[
                    "vertex_count"
                ],
                "face_count": topology_payload[
                    "face_count"
                ],
                "uv_count": topology_payload[
                    "uv_count"
                ],
                "topology_hash": topology_hash,
            }
        )

    return mesh_summaries


def topology_key(topology):
    """
    Morph targets contribute vertex positions only.

    Materials, UVs, triangle ordering and mesh names may legitimately differ
    because rendering uses the chosen base mesh's indices and UVs. Compatibility
    therefore requires the same ordered mesh count and vertex counts.
    """
    return json.dumps(
        [mesh["vertex_count"] for mesh in topology],
        separators=(",", ":"),
    )


def classify_asset(ref):
    lower = ref.lower()

    if lower.endswith(".o3d"):
        return "mesh"

    if lower.endswith(".png"):
        return "texture"

    if lower.endswith(".xml"):
        return "xml"

    if lower.endswith(".swf"):
        return "swf"

    return "other"


def build_morph_groups(candidates, missing_selections):
    grouped = defaultdict(list)

    for candidate in candidates:
        grouped[candidate["morph_group"]].append(candidate)

    morph_groups = {}
    rejected = list(missing_selections)

    for group_name, targets in grouped.items():
        valid = [
            target
            for target in targets
            if target.get("topology")
        ]

        if not valid:
            continue

        topology_buckets = defaultdict(list)

        for target in valid:
            topology_buckets[
                topology_key(target["topology"])
            ].append(target)

        # Pick the topology carrying the greatest selected weight.
        # Count breaks ties when weights are unavailable.
        winning_key, winning_targets = max(
            topology_buckets.items(),
            key=lambda item: (
                sum(
                    max(0.0, float(target["weight"]))
                    for target in item[1]
                ),
                len(item[1]),
            ),
        )

        accepted = []

        for target in valid:
            if topology_key(target["topology"]) != winning_key:
                rejected.append(
                    {
                        **target,
                        "reason": "vertex-layout-mismatch",
                    }
                )
                continue

            accepted.append(dict(target))

        total_weight = sum(
            max(0.0, float(target["weight"]))
            for target in accepted
        )

        if accepted:
            if total_weight > 0:
                for target in accepted:
                    target["normalized_weight"] = (
                        max(0.0, float(target["weight"]))
                        / total_weight
                    )
            else:
                equal_weight = 1 / len(accepted)

                for target in accepted:
                    target["normalized_weight"] = equal_weight

            morph_groups[group_name] = {
                "topology": accepted[0]["topology"],
                "targets": accepted,
                "raw_weight_total": total_weight,
            }

    return morph_groups, rejected


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--avatar-id", required=True)
    parser.add_argument("--config-xml", required=True)
    parser.add_argument("--oracle-dir", default=None)
    parser.add_argument(
        "--lab-root",
        default=str(Path.home() / "smallverse-lab"),
    )
    parser.add_argument(
        "--asset-src",
        default="/tmp/smallverse-avatar-assets",
    )
    parser.add_argument(
        "--design",
        default=(
            "/tmp/smallverse-avatar-assets/"
            "avatars/designs/avatar_design.xml"
        ),
    )

    args = parser.parse_args()

    lab_root = Path(args.lab_root).resolve()
    source_root = Path(args.asset_src)
    static_root = lab_root / "static/avatar-assets"

    render_dir = (
        lab_root
        / "static/avatar-renders"
        / args.avatar_id
    )
    render_dir.mkdir(parents=True, exist_ok=True)

    config_root = ET.fromstring(
        Path(args.config_xml).read_text()
    )
    design_root = ET.fromstring(
        Path(args.design).read_text(errors="ignore")
    )

    selected, weights, transforms = (
        selected_options_from_config(config_root)
    )

    gender = config_root.attrib.get("gender")

    selected_asset_groups = {}
    copied_assets = {}
    missing_assets = []

    rigid_meshes = []
    morph_candidates = []
    missing_morph_selections = []
    head_textures = []
    body_textures = []
    other_assets = []

    for option_id, selected_raw in selected.items():
        if not selected_raw:
            continue

        selected_ids = [
            value.strip()
            for value in selected_raw.split(",")
            if value.strip()
        ]

        option_group = find_design_group(
            design_root,
            option_id,
            gender,
        )

        selection_records = []

        for selected_id in selected_ids:
            selected_element = find_selected_element(
                design_root,
                option_group,
                selected_id,
            )

            refs = refs_from_selected_element(
                selected_element
            )

            record = {
                "selected_id": selected_id,
                "design_node_found": (
                    selected_element is not None
                ),
                "design_tag": (
                    selected_element.tag
                    if selected_element is not None
                    else None
                ),
                "design_attrs": (
                    dict(selected_element.attrib)
                    if selected_element is not None
                    else {}
                ),
                "exact_refs": refs,
                "assets": [],
            }

            for ref in refs:
                source_path = source_root / ref
                existed_before = source_path.exists()
                hydrated = False

                if not existed_before:
                    hydrated = hydrate_asset(
                        source_root,
                        ref,
                    )

                if ref not in copied_assets:
                    copied_assets[ref] = copy_asset(
                        source_root,
                        static_root,
                        ref,
                    )

                asset = {
                    **copied_assets[ref],
                    "option_id": option_id,
                    "selected_id": selected_id,
                    "kind": classify_asset(ref),
                    "existed_before_hydrate": existed_before,
                    "hydrated": hydrated,
                }

                if (
                    asset["kind"] == "mesh"
                    and asset["exists"]
                ):
                    try:
                        asset["topology"] = o3d_topology(
                            source_root / ref
                        )
                    except Exception as error:
                        asset["topology"] = None
                        asset["topology_error"] = str(error)

                if not asset["exists"]:
                    missing_assets.append(ref)

                record["assets"].append(asset)

                if asset["kind"] == "mesh":
                    morph_group = MORPH_GROUP_BY_OPTION.get(
                        option_id
                    )

                    if morph_group:
                        morph_candidates.append(
                            {
                                "morph_group": morph_group,
                                "option_id": option_id,
                                "selected_id": selected_id,
                                "weight": float(
                                    weights.get(
                                        selected_id,
                                        0.0,
                                    )
                                ),
                                "ref": asset["ref"],
                                "url": asset["url"],
                                "topology": asset.get(
                                    "topology"
                                ),
                            }
                        )
                    else:
                        rigid_meshes.append(
                            {
                                "option_id": option_id,
                                "selected_id": selected_id,
                                "ref": asset["ref"],
                                "url": asset["url"],
                                "topology": asset.get(
                                    "topology"
                                ),
                            }
                        )

                elif asset["kind"] == "texture":
                    if "/head/" in ref:
                        head_textures.append(asset)
                    elif "/body/" in ref:
                        body_textures.append(asset)
                    else:
                        other_assets.append(asset)
                else:
                    other_assets.append(asset)

            if (
                option_id in MORPH_GROUP_BY_OPTION
                and not any(
                    asset["kind"] == "mesh"
                    for asset in record["assets"]
                )
            ):
                missing_morph_selections.append(
                    {
                        "morph_group": (
                            MORPH_GROUP_BY_OPTION[option_id]
                        ),
                        "option_id": option_id,
                        "selected_id": selected_id,
                        "weight": float(
                            weights.get(selected_id, 0.0)
                        ),
                        "reason": (
                            "selected-design-node-has-no-o3d-ref"
                        ),
                        "exact_refs": refs,
                    }
                )

            selection_records.append(record)

        selected_asset_groups[option_id] = (
            selection_records
        )

    morph_groups, rejected_morph_targets = (
        build_morph_groups(
            morph_candidates,
            missing_morph_selections,
        )
    )

    oracle = None

    if args.oracle_dir:
        oracle_path = Path(args.oracle_dir) / "oracle.json"

        if oracle_path.exists():
            oracle = json.loads(
                oracle_path.read_text()
            )

    contract = {
        "ok": True,
        "contract": "smallverse-avatar-render-contract/v4",
        "avatar_id": args.avatar_id,
        "gender": gender,
        "source_config_xml": args.config_xml,
        "oracle": oracle,
        "selected_options": selected,
        "weights": weights,
        "transforms": transforms,
        "dances": dances_from_config(config_root),
        "selected_asset_groups": selected_asset_groups,
        "head": {
            "rigid_meshes": rigid_meshes,
            "morph_groups": morph_groups,
            "rejected_morph_targets": (
                rejected_morph_targets
            ),
            "textures": head_textures,
            "sprite_manifest_url": (
                f"/avatar-renders/{args.avatar_id}/"
                "head-design-sprites.json"
            ),
        },
        "body": {
            "textures": body_textures,
        },
        "other_assets": other_assets,
        "stats": {
            "selected_option_count": len(selected),
            "selected_asset_group_count": len(
                selected_asset_groups
            ),
            "copied_asset_count": sum(
                1
                for asset in copied_assets.values()
                if asset.get("exists")
            ),
            "missing_asset_count": len(
                set(missing_assets)
            ),
            "rigid_mesh_count": len(rigid_meshes),
            "accepted_morph_target_count": sum(
                len(group["targets"])
                for group in morph_groups.values()
            ),
            "rejected_morph_target_count": len(
                rejected_morph_targets
            ),
            "head_texture_count": len(head_textures),
            "body_texture_count": len(body_textures),
        },
        "missing_assets": sorted(set(missing_assets)),
    }

    output = render_dir / "render-contract.v4.json"
    output.write_text(
        json.dumps(contract, indent=2)
    )

    print(
        json.dumps(
            {
                "ok": True,
                "output": str(output),
                "url": (
                    f"/avatar-renders/{args.avatar_id}/"
                    "render-contract.v4.json"
                ),
                "stats": contract["stats"],
                "rigid_meshes": [
                    {
                        "option_id": mesh["option_id"],
                        "selected_id": mesh["selected_id"],
                        "ref": mesh["ref"],
                    }
                    for mesh in rigid_meshes
                ],
                "morph_groups": {
                    name: [
                        {
                            "option_id": target["option_id"],
                            "selected_id": target["selected_id"],
                            "weight": target["weight"],
                            "normalized_weight": target[
                                "normalized_weight"
                            ],
                            "ref": target["ref"],
                        }
                        for target in group["targets"]
                    ]
                    for name, group in morph_groups.items()
                },
                "rejected_morph_targets": [
                    {
                        "option_id": target.get("option_id"),
                        "selected_id": target.get(
                            "selected_id"
                        ),
                        "reason": target.get("reason"),
                        "ref": target.get("ref"),
                    }
                    for target in rejected_morph_targets
                ],
                "missing": contract["missing_assets"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
