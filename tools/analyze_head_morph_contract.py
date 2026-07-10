#!/usr/bin/env python3

import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path


AVATAR_ID = "6a47397a3d4b833613ec136a"
LAB = Path.home() / "smallverse-lab"

CONTRACT = (
    LAB
    / "static/avatar-renders"
    / AVATAR_ID
    / "render-contract.v4.json"
)

ASSETS = LAB / "static/avatar-assets"


def local_name(tag):
    return str(tag).split("}")[-1].lower()


def first_descendant(node, wanted_name):
    wanted_name = wanted_name.lower()

    for child in node.iter():
        if local_name(child.tag) == wanted_name:
            return child

    return None


def vertices_from_o3d(path):
    root = ET.fromstring(
        path.read_text(errors="ignore")
    )

    meshes = []

    for mesh in root.iter():
        if local_name(mesh.tag) != "mesh":
            continue

        container = first_descendant(mesh, "vertices")
        points = []

        if container is not None:
            # SmallVerse O3D files do not consistently use the same child
            # element name. Read any child carrying x/y/z coordinates.
            for child in container.iter():
                if child is container:
                    continue

                attrs = child.attrib

                if not all(key in attrs for key in ("x", "y", "z")):
                    continue

                points.append(
                    (
                        float(attrs["x"]),
                        float(attrs["y"]),
                        float(attrs["z"]),
                    )
                )

        meshes.append(
            {
                "name": mesh.attrib.get("name", ""),
                "vertices": points,
            }
        )

    return meshes


def flatten(meshes):
    return [
        point
        for mesh in meshes
        for point in mesh["vertices"]
    ]


def distance_squared(a, b):
    return (
        (a[0] - b[0]) ** 2
        + (a[1] - b[1]) ** 2
        + (a[2] - b[2]) ** 2
    )


def compare_same_layout(a, b):
    if len(a) != len(b):
        return {
            "compatible": False,
            "a_vertices": len(a),
            "b_vertices": len(b),
        }

    distances = [
        math.sqrt(distance_squared(left, right))
        for left, right in zip(a, b)
    ]

    changed = [
        value
        for value in distances
        if value > 0.0001
    ]

    return {
        "compatible": True,
        "vertices": len(a),
        "changed_vertices": len(changed),
        "changed_ratio": (
            len(changed) / len(distances)
            if distances else 0
        ),
        "mean_delta": (
            sum(distances) / len(distances)
            if distances else 0
        ),
        "max_delta": max(distances, default=0),
        "rms_delta": (
            math.sqrt(
                sum(value * value for value in distances)
                / len(distances)
            )
            if distances else 0
        ),
    }


def nearest_correspondence(source, target):
    """
    For every source vertex, find the nearest target vertex.

    This tells us whether a smaller mesh layout is embedded in a larger
    reference layout without relying on filenames or avatar-specific indices.
    """
    nearest_distances = []
    nearest_indices = []

    for source_vertex in source:
        best_index = None
        best_distance_squared = math.inf

        for index, target_vertex in enumerate(target):
            current = distance_squared(
                source_vertex,
                target_vertex,
            )

            if current < best_distance_squared:
                best_distance_squared = current
                best_index = index

        nearest_distances.append(
            math.sqrt(best_distance_squared)
        )
        nearest_indices.append(best_index)

    return {
        "source_vertices": len(source),
        "target_vertices": len(target),
        "unique_target_matches": len(set(nearest_indices)),
        "within_1e-6": sum(
            distance <= 1e-6
            for distance in nearest_distances
        ),
        "within_1e-4": sum(
            distance <= 1e-4
            for distance in nearest_distances
        ),
        "within_1e-2": sum(
            distance <= 1e-2
            for distance in nearest_distances
        ),
        "mean_nearest_distance": (
            sum(nearest_distances)
            / len(nearest_distances)
            if nearest_distances else 0
        ),
        "max_nearest_distance": max(
            nearest_distances,
            default=0,
        ),
    }


contract = json.loads(CONTRACT.read_text())
groups = contract["head"]["morph_groups"]

loaded = {}

for group_name, group in groups.items():
    print(f"\n===== {group_name.upper()} =====")

    for target in group["targets"]:
        path = ASSETS / target["ref"]
        meshes = vertices_from_o3d(path)
        points = flatten(meshes)

        key = target["selected_id"]
        loaded[key] = points

        print(
            key,
            "weight=",
            target["normalized_weight"],
            "vertices=",
            len(points),
            "meshes=",
            [
                {
                    "name": mesh["name"],
                    "vertices": len(mesh["vertices"]),
                }
                for mesh in meshes
            ],
        )

    targets = group["targets"]

    if len(targets) >= 2:
        first = targets[0]["selected_id"]
        second = targets[1]["selected_id"]

        print(f"\npair delta: {first} <-> {second}")
        print(
            json.dumps(
                compare_same_layout(
                    loaded[first],
                    loaded[second],
                ),
                indent=2,
            )
        )


face_targets = groups.get("face", {}).get("targets", [])
nose_targets = groups.get("nose", {}).get("targets", [])

if face_targets and nose_targets:
    print("\n===== FACE → NOSE CORRESPONDENCE =====")

    for face in face_targets:
        for nose in nose_targets:
            face_id = face["selected_id"]
            nose_id = nose["selected_id"]

            print(f"\n{face_id} -> {nose_id}")

            print(
                json.dumps(
                    nearest_correspondence(
                        loaded[face_id],
                        loaded[nose_id],
                    ),
                    indent=2,
                )
            )
