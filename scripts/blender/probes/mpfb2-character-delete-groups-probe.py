"""
Seedvale — Character Component Detector + Delete Groups Probe

Blender 5.2 + MPFB2.
No manual object selection.
No Decimate / Export Copy / material changes.
"""

from __future__ import annotations

import bpy
import importlib.util
import sys
from pathlib import Path

SEEDVALE_BLENDER_DIR = Path(
    r"\\wsl.localhost\Ubuntu-20.04\home\madeyskij\projects\private\seedvale\scripts\blender"
)

DELETE_TOOLS_PATH = (
    SEEDVALE_BLENDER_DIR
    / "delete-outfit"
    / "seedvale_character_tools.py"
)

CLOTHING_NAME_TOKENS = {
    "pants", "trousers", "boots", "boot", "shoes", "shoe",
    "shirt", "tank", "tunic", "dress", "skirt", "coat", "jacket",
    "cloak", "helmet", "hat", "gloves",
}

BEARD_NAME_TOKENS = {"beard", "moustache", "mustache"}
HAIR_NAME_TOKENS = {"hair"}

HUMAN_GROUP_HINTS = {
    "body", "HelperGeometry", "helper-genital", "helper-hair",
    "helper-l-eye", "helper-r-eye", "joint-head", "joint-neck",
    "joint-pelvis", "mixamorig:Hips", "mixamorig:Spine",
    "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck",
    "mixamorig:Head",
}


def group_names(obj):
    return {group.name for group in obj.vertex_groups}


def has_character_armature(obj, rig):
    return any(
        modifier.type == "ARMATURE" and modifier.object == rig
        for modifier in obj.modifiers
    )


def find_rig():
    armatures = [
        obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"
    ]
    if not armatures:
        return None

    return sorted(
        armatures,
        key=lambda obj: (
            -("rig" in obj.name.lower()),
            -len(obj.data.bones),
            obj.name.lower(),
        ),
    )[0]


def find_human(meshes, rig):
    candidates = []

    for obj in meshes:
        if not has_character_armature(obj, rig):
            continue

        groups = group_names(obj)
        score = 0

        score += min(len(groups.intersection(HUMAN_GROUP_HINTS)), 17)

        mixamo_count = sum(
            group.startswith("mixamorig:") for group in groups
        )
        if mixamo_count >= 30:
            score += 10

        if len(groups) >= 100:
            score += 10

        if obj.name == "Human":
            score += 20

        candidates.append((score, obj))

    return max(candidates, key=lambda item: item[0]) if candidates else None


def classify_component(obj, rig, human):
    if obj == human:
        return "HUMAN", "HIGH"

    if not has_character_armature(obj, rig):
        return "UNKNOWN", "LOW"

    groups = group_names(obj)
    name = obj.name.lower()

    if (
        len(obj.data.vertices) <= 500
        and groups
        and groups.issubset({"mixamorig:Head"})
    ):
        return "EYES", "HIGH"

    if (
        any(token in name for token in BEARD_NAME_TOKENS)
        and "mixamorig:Head" in groups
    ):
        return "BEARD", "MEDIUM"

    if (
        any(token in name for token in HAIR_NAME_TOKENS)
        and "mixamorig:Head" in groups
    ):
        return "HAIR", "MEDIUM"

    if any(token in name for token in CLOTHING_NAME_TOKENS):
        return "CLOTHING", "MEDIUM"

    mixamo_groups = [
        group for group in groups if group.startswith("mixamorig:")
    ]
    if mixamo_groups and len(groups) <= 20:
        return "CLOTHING", "LOW"

    return "UNKNOWN", "LOW"


def load_delete_tools():
    if not DELETE_TOOLS_PATH.exists():
        raise RuntimeError(
            "Existing Seedvale Delete Group tool not found:\n"
            f"  {DELETE_TOOLS_PATH}"
        )

    spec = importlib.util.spec_from_file_location(
        "seedvale_character_tools_runtime",
        DELETE_TOOLS_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load Seedvale Character Tools.")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main():
    print("\n" + "=" * 80)
    print("Seedvale — Character Component Detector + Delete Groups Probe")
    print("=" * 80)

    rig = find_rig()
    if rig is None:
        print("\nERROR: Character rig not found.")
        return

    meshes = [
        obj for obj in bpy.context.scene.objects if obj.type == "MESH"
    ]

    human_result = find_human(meshes, rig)
    if human_result is None:
        print("\nERROR: Human mesh not found.")
        return

    human_score, human = human_result

    print("\n" + "-" * 80)
    print("CHARACTER")
    print("-" * 80)
    print(f"  Rig:   {rig.name}")
    print(f"  Bones: {len(rig.data.bones)}")
    print(f"  Human: {human.name}")
    print(f"  Score: {human_score}")

    clothing = []

    print("\n" + "-" * 80)
    print("COMPONENTS")
    print("-" * 80)

    for obj in sorted(meshes, key=lambda item: item.name.lower()):
        component, confidence = classify_component(obj, rig, human)
        print(
            f"  {obj.name:<50} "
            f"{component:<10} {confidence}"
        )

        if component == "CLOTHING":
            clothing.append(obj)

    print("\n" + "-" * 80)
    print("CLOTHING")
    print("-" * 80)

    for obj in clothing:
        print(f"  - {obj.name} | vertices: {len(obj.data.vertices)}")

    if not clothing:
        print("  NONE")
        return

    print("\n" + "-" * 80)
    print("VERIFIED DELETE GROUP IMPLEMENTATION")
    print("-" * 80)
    print(f"  source: {DELETE_TOOLS_PATH}")

    tools = load_delete_tools()

    if not hasattr(tools, "create_delete_group_for_clothing"):
        raise RuntimeError(
            "create_delete_group_for_clothing() not found."
        )

    create_delete_group = tools.create_delete_group_for_clothing

    print("\n" + "-" * 80)
    print("GENERATING")
    print("-" * 80)

    for clothes in clothing:
        print(f"\n  [{clothes.name}]")
        group_name = create_delete_group(human, clothes)
        print(f"    CREATED: {group_name}")

    groups = sorted(
        group.name
        for group in human.vertex_groups
        if group.name.startswith("Delete.")
    )

    masks = [
        modifier
        for modifier in human.modifiers
        if (
            modifier.type == "MASK"
            and modifier.vertex_group
            and modifier.vertex_group.startswith("Delete.")
        )
    ]

    print("\n" + "-" * 80)
    print("RESULT")
    print("-" * 80)
    print(f"  Human: {human.name}")
    print(f"  Delete.* groups: {len(groups)}")

    for group in groups:
        print(f"    - {group}")

    print(f"  Delete Mask modifiers: {len(masks)}")

    for modifier in masks:
        print(
            f"    - {modifier.name} -> {modifier.vertex_group}"
        )

    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
