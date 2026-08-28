# MPFB2 2.0.17 — Face Target Diagnostic
#
# Uruchom w Blenderze z zainstalowanym MPFB2.
#
# Generuje:
#   - bazową kobietę
#   - warianty pojedynczych targetów twarzy
#   - każdy target w 3 wersjach: 0.25 / 0.50 / 1.00
#
# Modele są ustawione w siatce.
#
# Źródło targetów:
#   MPFB2/data/targets/target.json
#
# Nie zapisuje żadnych plików ani nie modyfikuje assetów MPFB2.

import bpy
import importlib
import json
import os
import sys


# ---------------------------------------------------------------------------
# MPFB2 dynamic import
# ---------------------------------------------------------------------------

def dynamic_import(absolute_package_str, key):
    """
    MPFB2 extension workaround used by the official script examples.
    """
    for module_name in sys.modules:
        if module_name.endswith(absolute_package_str):
            module = importlib.import_module(module_name)
            if not hasattr(module, key):
                raise AttributeError(
                    f"Module {module_name} does not have attribute {key}"
                )
            return getattr(module, key)

    raise RuntimeError(
        f"Could not find MPFB2 module: {absolute_package_str}"
    )


HumanService = dynamic_import(
    "mpfb.services.humanservice",
    "HumanService"
)

TargetService = dynamic_import(
    "mpfb.services.targetservice",
    "TargetService"
)

HumanObjectProperties = dynamic_import(
    "mpfb.entities.objectproperties",
    "HumanObjectProperties"
)

LocationService = dynamic_import(
    "mpfb.services.locationservice",
    "LocationService"
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TARGET_WEIGHTS = [0.25, 0.50, 1.00]

# Na start tylko najważniejsze kategorie twarzy.
# Możemy później rozszerzyć listę.
FACE_SECTIONS = [
    "cheek",
    "chin",
    "ears",
    "eyebrows",
    "eyes",
    "forehead",
    "head",
    "mouth",
    "nose",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_face_target_catalog():
    """
    Load MPFB2 bundled target catalog.
    """
    targets_dir = LocationService.get_mpfb_data("targets")
    target_json_path = os.path.join(
        targets_dir,
        "target.json"
    )

    if not os.path.isfile(target_json_path):
        raise RuntimeError(
            f"MPFB2 target catalog not found:\n{target_json_path}"
        )

    with open(target_json_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    return metadata


def get_face_targets(metadata):
    """
    Extract target names from selected face sections.

    We deliberately use the actual target.json shipped with MPFB2
    instead of maintaining our own list.
    """

    result = []

    for section in FACE_SECTIONS:
        section_data = metadata.get(section)

        if not section_data:
            print(f"[WARNING] Missing section: {section}")
            continue

        for category in section_data.get("categories", []):
            targets = category.get("targets", [])

            for target_name in targets:
                if target_name and target_name not in result:
                    result.append(target_name)

    return sorted(result)


def create_female():
    """
    Create MPFB2 female using MPFB2 API.
    """

    human = HumanService.create_human()

    # Female
    HumanObjectProperties.set_value(
        "gender",
        1.0,
        entity_reference=human
    )

    # Young adult-ish
    HumanObjectProperties.set_value(
        "age",
        0.20,
        entity_reference=human
    )

    # Normal body
    HumanObjectProperties.set_value(
        "weight",
        0.45,
        entity_reference=human
    )

    HumanObjectProperties.set_value(
        "muscle",
        0.35,
        entity_reference=human
    )

    HumanObjectProperties.set_value(
        "height",
        0.50,
        entity_reference=human
    )

    HumanObjectProperties.set_value(
        "proportions",
        0.50,
        entity_reference=human
    )

    # Make sure macro targets are regenerated.
    TargetService.reapply_macro_details(human)

    return human


def apply_target(human, target_name, weight):
    """
    Load one bundled target with a specified weight.
    """

    path = TargetService.target_full_path(target_name)

    if not path:
        print(
            f"[SKIP] Target not found: {target_name}"
        )
        return False

    try:
        TargetService.load_target(
            human,
            path,
            weight=weight
        )

        return True

    except Exception as exc:
        print(
            f"[ERROR] {target_name} @ {weight}: {exc}"
        )

        return False


def add_label(text, location):
    """
    Simple Blender text label.
    """

    curve = bpy.data.curves.new(
        name="LabelCurve",
        type="FONT"
    )

    curve.body = text
    curve.align_x = "CENTER"
    curve.size = 0.12
    curve.extrude = 0.002

    obj = bpy.data.objects.new(
        name="Label",
        object_data=curve
    )

    bpy.context.collection.objects.link(obj)

    obj.location = location

    return obj


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

print("=" * 70)
print("MPFB2 FACE TARGET DIAGNOSTIC")
print("=" * 70)

metadata = load_face_target_catalog()

face_targets = get_face_targets(metadata)

print(
    f"Found {len(face_targets)} face targets."
)

# ---------------------------------------------------------------------------
# Base female
# ---------------------------------------------------------------------------

base = create_female()

base.location = (0, 0, 0)

add_label(
    "BASE FEMALE",
    (0, 0, 2.15)
)


# ---------------------------------------------------------------------------
# Target variants
# ---------------------------------------------------------------------------

COLUMN_SPACING = 1.8
ROW_SPACING = 2.4

start_x = 3.0
start_y = 0.0

for index, target_name in enumerate(face_targets):

    row = index // 3
    col = index % 3

    x = start_x + col * COLUMN_SPACING
    y = start_y - row * ROW_SPACING

    for weight_index, weight in enumerate(TARGET_WEIGHTS):

        human = create_female()

        ok = apply_target(
            human,
            target_name,
            weight
        )

        if not ok:
            bpy.data.objects.remove(
                human,
                do_unlink=True
            )
            continue

        # Small spacing between weight variants.
        human.location = (
            x + weight_index * 0.65,
            y,
            0
        )

        label = (
            f"{target_name}\n"
            f"{weight:.2f}"
        )

        add_label(
            label,
            (
                human.location.x,
                human.location.y,
                2.15
            )
        )


print("=" * 70)
print("DONE")
print(f"Generated variants for {len(face_targets)} targets.")
print("=" * 70)
