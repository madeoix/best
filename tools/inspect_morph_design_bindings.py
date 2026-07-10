#!/usr/bin/env python3

import re
import xml.etree.ElementTree as ET
from pathlib import Path


DESIGN = Path(
    "/tmp/smallverse-avatar-assets/"
    "avatars/designs/avatar_design.xml"
)

PAIRS = [
    ("FaceAOptions", "FaceThinOne"),
    ("FaceBOptions", "FaceCuteTwo"),
    ("NoseAOptions", "NoseStraightOne"),
    ("NoseBOptions", "NoseButtonTwo"),
]

ASSET_RE = re.compile(
    r'(?P<ref>(?:\$[a-z]{2}|avatars|items)'
    r'[^"\'<>\s]+?\.(?:png|xml|o3d|swf))',
    re.I,
)


root = ET.fromstring(
    DESIGN.read_text(errors="ignore")
)

parent = {
    child: node
    for node in root.iter()
    for child in list(node)
}


def node_label(node):
    tag = str(node.tag).split("}")[-1]
    node_id = node.attrib.get("id")

    return f"{tag}#{node_id}" if node_id else tag


def node_path(node):
    parts = []

    while node is not None:
        parts.append(node_label(node))
        node = parent.get(node)

    return " / ".join(reversed(parts))


def is_descendant(node, ancestor):
    current = node

    while current is not None:
        if current is ancestor:
            return True

        current = parent.get(current)

    return False


def asset_refs(node):
    refs = []

    for descendant in node.iter():
        for key, value in descendant.attrib.items():
            if not isinstance(value, str):
                continue

            matches = [
                match.group("ref")
                for match in ASSET_RE.finditer(value)
            ]

            if matches:
                refs.append({
                    "path": node_path(descendant),
                    "attribute": key,
                    "value": value,
                    "refs": matches,
                })

    return refs


def nodes_with_id(identifier):
    return [
        node
        for node in root.iter()
        if node.attrib.get("id") == identifier
    ]


for option_id, selected_id in PAIRS:
    print("\n" + "=" * 80)
    print(f"{option_id} -> {selected_id}")

    groups = nodes_with_id(option_id)

    print(f"\noption group occurrences: {len(groups)}")

    for index, group in enumerate(groups):
        print(f"\n  GROUP {index}")
        print("  path:", node_path(group))
        print("  attrs:", group.attrib)

    candidates = nodes_with_id(selected_id)

    print(f"\nselected node occurrences: {len(candidates)}")

    for index, candidate in enumerate(candidates):
        containing_groups = [
            group_index
            for group_index, group in enumerate(groups)
            if is_descendant(candidate, group)
        ]

        print(f"\n  CANDIDATE {index}")
        print("  path:", node_path(candidate))
        print("  attrs:", candidate.attrib)
        print("  inside option groups:", containing_groups)

        refs = asset_refs(candidate)

        if not refs:
            print("  asset refs: NONE")
        else:
            print("  asset refs:")

            for ref in refs:
                print(
                    "   ",
                    ref["path"],
                    f'[{ref["attribute"]}]',
                    "->",
                    ref["refs"],
                )
