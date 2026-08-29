"""
Seedvale — MPFB2 Character Structure Recon

Read-only Blender scene inspection.

Purpose:
    Discover the structural hierarchy and MPFB2 metadata needed to
    identify human, rig, eyes, hair, beard and clothing without relying
    on hard-coded asset-name keywords.

Output:
    /tmp/seedvale_character_recon.json

Run inside Blender's Scripting workspace.
"""

from __future__ import annotations

import json
from pathlib import Path

import bpy


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_get_mpfb_property(obj, name: str):
    """Read an MPFB2 property without failing the whole recon."""
    try:
        from mpfb.utils.objectproperties import GeneralObjectProperties

        value = GeneralObjectProperties.get_value(
            name,
            entity_reference=obj,
        )

        if value is not None:
            return value
    except Exception:
        pass

    return None


def clean_value(value):
    """Convert Blender/MPFB2 values to JSON-safe primitive values."""
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (list, tuple)):
        return [clean_value(v) for v in value]

    return str(value)


def object_summary(obj):
    """Return only information useful for structural identification."""

    modifiers = [
        {
            "name": modifier.name,
            "type": modifier.type,
        }
        for modifier in obj.modifiers
    ]

    materials = []
    if hasattr(obj.data, "materials"):
        materials = [
            material.name
            for material in obj.data.materials
            if material is not None
        ]

    vertex_groups = []

    # Vertex groups are highly useful for MPFB2 clothing/Delete Groups,
    # but only names are relevant here.
    if hasattr(obj, "vertex_groups"):
        vertex_groups = [
            group.name
            for group in obj.vertex_groups
        ]

    armature = None

    for modifier in obj.modifiers:
        if modifier.type == "ARMATURE" and modifier.object:
            armature = modifier.object.name
            break

    mpfb = {
        "object_type": clean_value(
            safe_get_mpfb_property(obj, "object_type")
        ),
        "asset_source": clean_value(
            safe_get_mpfb_property(obj, "asset_source")
        ),
        "scale_factor": clean_value(
            safe_get_mpfb_property(obj, "scale_factor")
        ),
    }

    # Remove unavailable values to keep the output compact.
    mpfb = {
        key: value
        for key, value in mpfb.items()
        if value is not None
    }

    return {
        "name": obj.name,
        "blender_type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "children": sorted(child.name for child in obj.children),
        "collections": sorted(
            collection.name
            for collection in obj.users_collection
        ),
        "mpfb2": mpfb,
        "armature": armature,
        "modifiers": modifiers,
        "materials": materials,
        "vertex_groups": vertex_groups,
    }


# ---------------------------------------------------------------------------
# Hierarchy
# ---------------------------------------------------------------------------

def build_hierarchy(objects):
    """Build a compact object hierarchy."""

    object_map = {
        obj.name: obj
        for obj in objects
    }

    roots = [
        obj
        for obj in objects
        if obj.parent is None
    ]

    def node(obj):
        return {
            "name": obj.name,
            "type": obj.type,
            "children": [
                node(child)
                for child in sorted(
                    obj.children,
                    key=lambda item: item.name,
                )
                if child.name in object_map
            ],
        }

    return [
        node(root)
        for root in sorted(roots, key=lambda item: item.name)
    ]


# ---------------------------------------------------------------------------
# Character candidates
# ---------------------------------------------------------------------------

def find_candidates(objects):
    """
    Do not attempt to classify objects as Hair/Beard/Pants/etc.

    Instead, expose useful structural candidates.
    """

    candidates = {
        "armatures": [],
        "meshes": [],
        "objects_with_mpfb2_metadata": [],
        "objects_with_armature_modifier": [],
        "objects_with_delete_groups": [],
    }

    for obj in objects:
        if obj.type == "ARMATURE":
            candidates["armatures"].append(obj.name)

        if obj.type == "MESH":
            candidates["meshes"].append(obj.name)

        mpfb = object_summary(obj)["mpfb2"]

        if mpfb:
            candidates["objects_with_mpfb2_metadata"].append(obj.name)

        if any(
            modifier.type == "ARMATURE" and modifier.object
            for modifier in obj.modifiers
        ):
            candidates["objects_with_armature_modifier"].append(obj.name)

        if any(
            group.name.startswith("Delete.")
            for group in obj.vertex_groups
        ):
            candidates["objects_with_delete_groups"].append(obj.name)

    for key in candidates:
        candidates[key] = sorted(candidates[key])

    return candidates


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    objects = list(bpy.context.scene.objects)

    output_path = (
        Path(bpy.data.filepath).parent
        / "seedvale_character_recon.json"
    )

    data = {
        "recon": {
            "purpose": "MPFB2 character structure and identification",
            "blender_version": bpy.app.version_string,
        },
        "scene": {
            "object_count": len(objects),
            "objects": [
                object_summary(obj)
                for obj in sorted(objects, key=lambda item: item.name)
            ],
            "hierarchy": build_hierarchy(objects),
            "candidates": find_candidates(objects),
        },
    }

    print("=" * 72)
    print(
        json.dumps(
            data,
            indent=2,
            ensure_ascii=False,
        )
    )
    print("=" * 72)

    print()
    print("=" * 72)
    print("Seedvale MPFB2 Character Structure Recon")
    print("=" * 72)
    print(f"Objects: {len(objects)}")
    print(f"Output:  {OUTPUT_PATH}")
    print()

    print("Armatures:")
    for name in data["scene"]["candidates"]["armatures"]:
        print(f"  - {name}")

    print()
    print("Objects with MPFB2 metadata:")
    for name in data["scene"]["candidates"]["objects_with_mpfb2_metadata"]:
        print(f"  - {name}")

    print()
    print("Objects with Delete.* groups:")
    for name in data["scene"]["candidates"]["objects_with_delete_groups"]:
        print(f"  - {name}")

    print()
    print("Recon complete.")


if __name__ == "__main__":
    main()
