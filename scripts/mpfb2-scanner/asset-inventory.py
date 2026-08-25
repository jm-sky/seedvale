import bpy
import os
import sys
import json
from pathlib import Path
from datetime import datetime

import config

# ============================================================
# CONFIGURATION
# ============================================================

# Windows UNC path to WSL repository.
WSL_REPO = Path(config.WSL_REPO)

ASSET_INVENTORY_JSON = (
    WSL_REPO
    / "docs"
    / "plans"
    / "references"
    / "mpfb2-asset-inventory.json"
)

# ============================================================
# SEEDVALE / MPFB2 ASSET INVENTORY
# Blender 5.2 / MPFB2
# ============================================================

print("\n" + "=" * 70)
print("SEEDVALE / MPFB2 ASSET INVENTORY")
print("=" * 70)


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

def safe_text(value):
    """Convert Blender/bytes/path values to JSON/Markdown safe text."""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, Path):
        return str(value)
    return str(value)


def find_mpfb():
    """Find installed MPFB module and root directory."""
    candidates = []

    for module_name in [
        "bl_ext.extensions_blender_org.mpfb",
        "mpfb",
    ]:
        try:
            module = __import__(module_name, fromlist=["*"])

            module_file = getattr(module, "__file__", None)

            if module_file:
                candidates.append(Path(module_file).resolve())

        except Exception:
            pass

    return candidates


def classify_file(path):
    """Classify asset based on path/name."""
    s = str(path).lower().replace("\\", "/")

    if "/clothes/" in s or "/clothing/" in s:
        return "clothes"

    if "/hair/" in s:
        return "hair"

    if "/skin/" in s or "/skins/" in s:
        return "skin"

    if "/material/" in s or "/materials/" in s:
        return "materials"

    if "/target/" in s or "/targets/" in s:
        return "targets"

    if "/pose/" in s or "/poses/" in s:
        return "poses"

    if "/rig/" in s or "/rigs/" in s:
        return "rigs"

    if "/preset/" in s or "/presets/" in s:
        return "presets"

    if "/pack/" in s or "/packs/" in s:
        return "packs"

    return "other"


def scan_directory(root):
    result = {
        "root": safe_text(root),
        "files": [],
        "categories": {},
        "extensions": {},
    }

    if not root.exists():
        return result

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        try:
            rel = path.relative_to(root)
        except Exception:
            rel = path.name

        category = classify_file(path)
        ext = path.suffix.lower() or "[no extension]"

        result["files"].append({
            "path": safe_text(rel),
            "name": path.name,
            "extension": ext,
            "category": category,
            "size": path.stat().st_size,
        })

        result["categories"].setdefault(category, 0)
        result["categories"][category] += 1

        result["extensions"].setdefault(ext, 0)
        result["extensions"][ext] += 1

    return result


# ------------------------------------------------------------
# Blender
# ------------------------------------------------------------

version = bpy.app.version_string
build_branch = safe_text(bpy.app.build_branch)
build_hash = safe_text(bpy.app.build_hash)

print(f"[BLENDER] {version}")
print(f"[BRANCH]  {build_branch}")
print(f"[BUILD]   {build_hash}")


# ------------------------------------------------------------
# MPFB module
# ------------------------------------------------------------

modules = find_mpfb()

print("\n[MPFB MODULES]")

for module in modules:
    print(" ", module)


if not modules:
    print("  ERROR: MPFB2 module not found.")
    raise RuntimeError("MPFB2 module not found")


mpfb_file = modules[0]
mpfb_root = mpfb_file.parent


print("\n[MPFB ROOT]")
print(" ", mpfb_root)


# ------------------------------------------------------------
# Search possible resource roots
# ------------------------------------------------------------

possible_roots = []

for base in [
    mpfb_root,
    mpfb_root.parent,
    mpfb_root.parent.parent,
]:
    for name in [
        "data",
        "assets",
        "makehuman",
        "resources",
        "resource",
        "libraries",
        "library",
        "packs",
        "presets",
    ]:
        p = base / name

        if p.exists() and p.is_dir():
            possible_roots.append(p)


# Add descendants that look like asset/resource directories.
for p in list(mpfb_root.rglob("*")):
    if not p.is_dir():
        continue

    name = p.name.lower()

    if name in {
        "clothes",
        "clothing",
        "hair",
        "skin",
        "skins",
        "materials",
        "material",
        "targets",
        "poses",
        "pose",
        "rigs",
        "rig",
        "presets",
        "packs",
        "libraries",
        "library",
    }:
        possible_roots.append(p)


# Deduplicate
unique_roots = []

seen = set()

for p in possible_roots:
    p = p.resolve()

    if p in seen:
        continue

    seen.add(p)
    unique_roots.append(p)


print("\n[RESOURCE DIRECTORIES]")

for p in unique_roots:
    print(" ", p)


# ------------------------------------------------------------
# Scan resources
# ------------------------------------------------------------

reports = []

print("\n[SCANNING ASSETS]")

for root in unique_roots:

    print(f"  scanning: {root}")

    try:
        report = scan_directory(root)

        if report["files"]:
            reports.append(report)

    except Exception as exc:
        print("  ERROR:", exc)


# ------------------------------------------------------------
# Operators
# ------------------------------------------------------------

operators = []

for name in dir(bpy.ops.mpfb):
    if not name.startswith("_"):
        operators.append(name)

operators.sort()


# ------------------------------------------------------------
# Properties
# ------------------------------------------------------------

properties = []

for owner in [
    bpy.types.Scene,
    bpy.types.Object,
    bpy.types.Armature,
]:

    for name in dir(owner):

        if "MPFB" in name.upper():
            properties.append(
                f"{owner.__name__}.{name}"
            )

properties = sorted(set(properties))


# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------

category_totals = {}
extension_totals = {}

all_files = []

for report in reports:

    all_files.extend(report["files"])

    for category, count in report["categories"].items():
        category_totals[category] = (
            category_totals.get(category, 0) + count
        )

    for ext, count in report["extensions"].items():
        extension_totals[ext] = (
            extension_totals.get(ext, 0) + count
        )


print("\n[ASSET SUMMARY]")

for category, count in sorted(category_totals.items()):
    print(f"  {category:12} {count}")


print("\n[FILE EXTENSIONS]")

for ext, count in sorted(
    extension_totals.items(),
    key=lambda x: (-x[1], x[0])
):
    print(f"  {ext:12} {count}")


# ------------------------------------------------------------
# Markdown report
# ------------------------------------------------------------

timestamp = datetime.now().isoformat()

lines = []

lines.append("# Seedvale MPFB2 Asset Inventory")
lines.append("")
lines.append(f"Generated: {timestamp}")
lines.append("")

lines.append("## Blender")
lines.append("")
lines.append(f"- Version: {version}")
lines.append(f"- Branch: {build_branch}")
lines.append(f"- Build: {build_hash}")
lines.append("")

lines.append("## MPFB2")
lines.append("")
lines.append(f"- Module: `bl_ext.extensions_blender_org.mpfb`")
lines.append(f"- Root: `{safe_text(mpfb_root)}`")
lines.append("")

lines.append("## Asset Summary")
lines.append("")

for category, count in sorted(category_totals.items()):
    lines.append(f"- **{category}**: {count}")

lines.append("")
lines.append("## File Extensions")
lines.append("")

for ext, count in sorted(
    extension_totals.items(),
    key=lambda x: (-x[1], x[0])
):
    lines.append(f"- `{ext}`: {count}")

lines.append("")

lines.append("## Resource Directories")
lines.append("")

for root in unique_roots:
    lines.append(f"- `{safe_text(root)}`")

lines.append("")

# ------------------------------------------------------------
# Assets by category
# ------------------------------------------------------------

by_category = {}

for item in all_files:
    by_category.setdefault(
        item["category"], []
    ).append(item)


for category in sorted(by_category):

    lines.append("")
    lines.append(f"## {category.title()}")
    lines.append("")

    items = sorted(
        by_category[category],
        key=lambda x: x["path"].lower()
    )

    for item in items:

        lines.append(
            f"- `{item['path']}`"
        )


# ------------------------------------------------------------
# MPFB operators
# ------------------------------------------------------------

lines.append("")
lines.append("## MPFB2 Operators")
lines.append("")

for op in operators:
    lines.append(f"- `mpfb.{op}`")


# ------------------------------------------------------------
# MPFB properties
# ------------------------------------------------------------

lines.append("")
lines.append("## MPFB2 Properties")
lines.append("")

for prop in properties:
    lines.append(f"- `{prop}`")

# ------------------------------------------------------------
# JSON summary
# ------------------------------------------------------------

json_data = {
    "generated": timestamp,
    "blender": {
        "version": version,
        "branch": build_branch,
        "build": build_hash,
    },
    "mpfb": {
        "module": "bl_ext.extensions_blender_org.mpfb",
        "root": safe_text(mpfb_root),
    },
    "resource_directories": [
        safe_text(x)
        for x in unique_roots
    ],
    "summary": category_totals,
    "extensions": extension_totals,
    "files": all_files,
    "operators": operators,
    "properties": properties,
}

ASSET_INVENTORY_JSON.parent.mkdir(parents=True, exist_ok=True)

ASSET_INVENTORY_JSON.write_text(
    json.dumps(
        json_data,
        indent=2,
        ensure_ascii=False,
        default=safe_text,
    ),
    encoding="utf-8"
)


# ------------------------------------------------------------
# Finish
# ------------------------------------------------------------

print("\n" + "=" * 70)
print("SCAN COMPLETE")
print("=" * 70)

print("\nJSON:")
print(ASSET_INVENTORY_JSON)

print("\nTotal files:", len(all_files))

print("\nCategories:")

for category, count in sorted(category_totals.items()):
    print(f"  {category}: {count}")

print("\n" + "=" * 70)
