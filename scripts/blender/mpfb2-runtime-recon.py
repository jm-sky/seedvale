"""
Seedvale — MPFB2 Runtime API Recon

Run inside Blender 5.2 with MPFB2 enabled.

Purpose:
    Discover the installed MPFB2 Python API without producing an
    unfiltered wall of filesystem paths and inherited methods.

Output is grouped as:
    module
        class
            method

FILTER_TERMS can narrow the recon to a topic such as:
    animation, mixamo, rig, bake, snap, map, action

This script establishes runtime availability only. It does not prove that an
operation works correctly; execution tests remain a separate verification step.
"""

from __future__ import annotations

import importlib
import inspect
import json
import os
import pkgutil
from pathlib import Path
from types import ModuleType
from typing import Any

import bpy


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Empty = discover all public MPFB2 API entries.
# Example:
# FILTER_TERMS = ["animation", "mixamo", "rig", "bake", "snap", "map"]
FILTER_TERMS: list[str] = []

INCLUDE_PRIVATE = False

MPFB_ROOTS = (
    "bl_ext.extensions_blender_org.mpfb",
    "mpfb",
)

OUTPUT_FILENAME = "seedvale_mpfb2_runtime_recon.json"


# ---------------------------------------------------------------------------
# Formatting / filtering
# ---------------------------------------------------------------------------

def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\\", "/").strip()


def normalize_path(path: str | None) -> str | None:
    if not path:
        return None

    try:
        return Path(path).resolve().as_posix()
    except Exception:
        return normalize_text(path)


def relative_path(path: str | None, base: str | None) -> str | None:
    if not path or not base:
        return path

    try:
        return Path(path).relative_to(Path(base)).as_posix()
    except Exception:
        return path


def common_base(paths: list[str]) -> str | None:
    if not paths:
        return None

    try:
        return os.path.commonpath(paths).replace("\\", "/")
    except Exception:
        return None


def matches_filter(*values: Any) -> bool:
    if not FILTER_TERMS:
        return True

    haystack = " ".join(
        normalize_text(value).lower()
        for value in values
        if value is not None
    )

    return any(term.lower() in haystack for term in FILTER_TERMS)


def public_name(name: str) -> bool:
    return INCLUDE_PRIVATE or not name.startswith("_")


# ---------------------------------------------------------------------------
# Safe introspection
# ---------------------------------------------------------------------------

def safe_signature(value: Any) -> str | None:
    try:
        return str(inspect.signature(value))
    except Exception:
        return None


def safe_source_file(value: Any) -> str | None:
    try:
        return normalize_path(
            inspect.getsourcefile(value) or inspect.getfile(value)
        )
    except Exception:
        return None


def safe_members(owner: Any) -> list[tuple[str, Any]]:
    try:
        return [
            (name, getattr(owner, name))
            for name in dir(owner)
            if public_name(name)
        ]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# MPFB2 discovery
# ---------------------------------------------------------------------------

def import_mpfb_root() -> tuple[ModuleType | None, str | None]:
    for name in MPFB_ROOTS:
        try:
            return importlib.import_module(name), name
        except Exception:
            continue

    return None, None


def discover_submodules(root: ModuleType) -> list[ModuleType]:
    modules = [root]
    root_path = getattr(root, "__path__", None)

    if not root_path:
        return modules

    prefix = root.__name__ + "."

    try:
        for info in pkgutil.walk_packages(root_path, prefix):
            try:
                modules.append(importlib.import_module(info.name))
            except Exception:
                # Optional/broken modules must not abort the recon.
                continue
    except Exception:
        pass

    return modules


# ---------------------------------------------------------------------------
# API extraction
# ---------------------------------------------------------------------------

def class_record(module: ModuleType, name: str, cls: type) -> dict[str, Any] | None:
    methods: list[dict[str, Any]] = []

    try:
        names = sorted(
            item for item in dir(cls)
            if public_name(item)
        )
    except Exception:
        names = []

    for method_name in names:
        try:
            value = getattr(cls, method_name)
        except Exception:
            continue

        if not callable(value):
            continue

        signature = safe_signature(value)

        if not matches_filter(
            module.__name__,
            name,
            method_name,
            signature,
        ):
            continue

        methods.append(
            {
                "name": method_name,
                "signature": signature,
                "source": safe_source_file(value),
            }
        )

    class_matches = matches_filter(module.__name__, name)

    if FILTER_TERMS and not class_matches and not methods:
        return None

    return {
        "name": name,
        "source": safe_source_file(cls),
        "methods": methods,
    }


def module_record(module: ModuleType) -> dict[str, Any] | None:
    classes: list[dict[str, Any]] = []
    functions: list[dict[str, Any]] = []

    for name, value in safe_members(module):
        if (
            inspect.isclass(value)
            and getattr(value, "__module__", None) == module.__name__
        ):
            record = class_record(module, name, value)
            if record:
                classes.append(record)

        elif (
            inspect.isfunction(value)
            and getattr(value, "__module__", None) == module.__name__
        ):
            signature = safe_signature(value)

            if matches_filter(module.__name__, name, signature):
                functions.append(
                    {
                        "name": name,
                        "signature": signature,
                        "source": safe_source_file(value),
                    }
                )

    if FILTER_TERMS and not matches_filter(module.__name__) and not classes and not functions:
        return None

    return {
        "name": module.__name__,
        "file": normalize_path(getattr(module, "__file__", None)),
        "classes": sorted(classes, key=lambda item: item["name"].lower()),
        "functions": sorted(functions, key=lambda item: item["name"].lower()),
    }


# ---------------------------------------------------------------------------
# Blender / MPFB2 operators
# ---------------------------------------------------------------------------

def discover_mpfb_operators() -> list[dict[str, str]]:
    operators: list[dict[str, str]] = []

    try:
        groups = dir(bpy.ops.mpfb)
    except Exception:
        return operators

    for group_name in sorted(
        name for name in groups if public_name(name)
    ):
        try:
            group = getattr(bpy.ops.mpfb, group_name)
            names = [
                name for name in dir(group)
                if public_name(name)
            ]
        except Exception:
            continue

        for operator_name in sorted(names):
            if not matches_filter(group_name, operator_name, "mpfb"):
                continue

            operators.append(
                {
                    "group": group_name,
                    "name": operator_name,
                    "idname": f"mpfb.{group_name}.{operator_name}",
                }
            )

    return operators


def discover_blender_api() -> list[dict[str, str]]:
    candidates = (
        ("bpy.ops.nla", "bake"),
        ("bpy.ops.export_scene", "gltf"),
        ("bpy.data", "actions"),
    )

    return [
        {"owner": owner, "name": name}
        for owner, name in candidates
        if matches_filter(owner, name, "animation")
    ]


# ---------------------------------------------------------------------------
# Path aggregation
# ---------------------------------------------------------------------------

def collect_paths(modules: list[dict[str, Any]]) -> list[str]:
    paths: list[str] = []

    for module in modules:
        for value in (
            module.get("file"),
            *(cls.get("source") for cls in module["classes"]),
            *(method.get("source") for cls in module["classes"] for method in cls["methods"]),
            *(function.get("source") for function in module["functions"]),
        ):
            if value:
                paths.append(value)

    return sorted(set(paths))


def compact_paths(modules: list[dict[str, Any]], base: str | None) -> None:
    for module in modules:
        module["file"] = relative_path(module.get("file"), base)

        for cls in module["classes"]:
            cls["source"] = relative_path(cls.get("source"), base)

            for method in cls["methods"]:
                method["source"] = relative_path(method.get("source"), base)

        for function in module["functions"]:
            function["source"] = relative_path(function.get("source"), base)


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(data: dict[str, Any]) -> None:
    summary = data["summary"]

    print("\n" + "=" * 72)
    print("Seedvale — MPFB2 Runtime API Recon")
    print("=" * 72)
    print(f"MPFB2:     {data['mpfb2']['import']}")
    print(f"File:      {data['mpfb2']['file'] or 'unknown'}")
    print(f"Filter:    {', '.join(FILTER_TERMS) if FILTER_TERMS else 'none'}")
    print(
        "Found:     "
        f"{summary['modules']} modules, "
        f"{summary['classes']} classes, "
        f"{summary['methods']} methods, "
        f"{summary['functions']} functions, "
        f"{summary['operators']} operators"
    )

    if data["path_base"]:
        print(f"Path base: {data['path_base']}")

    print("\nAPI")

    for module in data["modules"]:
        print(f"\n[{module['name']}]")

        if module["file"]:
            print(f"  file: {module['file']}")

        for cls in module["classes"]:
            print(f"  class {cls['name']}")

            if cls["source"]:
                print(f"    source: {cls['source']}")

            for method in cls["methods"]:
                signature = method["signature"] or "(...)"
                print(f"    .{method['name']}{signature}")

        for function in module["functions"]:
            signature = function["signature"] or "(...)"
            print(f"  function {function['name']}{signature}")

    print("\nMPFB2 operators")

    for operator in data["operators"]:
        print(f"  {operator['idname']}")

    if not data["operators"]:
        print("  none")

    print("\nBlender API candidates")

    for item in data["blender_api"]:
        print(f"  {item['owner']}.{item['name']}")

    print("\n" + "=" * 72)
    print(f"JSON: {data['output']}")
    print("=" * 72)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    root, import_name = import_mpfb_root()

    if root is None:
        raise RuntimeError(
            "MPFB2 module not found. Tried: "
            + ", ".join(MPFB_ROOTS)
        )

    modules = []

    for module in discover_submodules(root):
        try:
            record = module_record(module)
            if record:
                modules.append(record)
        except Exception:
            continue

    paths = collect_paths(modules)
    path_base = common_base(paths)
    compact_paths(modules, path_base)

    operators = discover_mpfb_operators()
    blender_api = discover_blender_api()

    class_count = sum(len(module["classes"]) for module in modules)
    method_count = sum(
        len(cls["methods"])
        for module in modules
        for cls in module["classes"]
    )
    function_count = sum(len(module["functions"]) for module in modules)

    output_path = (
        Path(bpy.data.filepath).parent / OUTPUT_FILENAME
        if bpy.data.filepath
        else Path("/tmp") / OUTPUT_FILENAME
    )

    data = {
        "recon": {
            "purpose": "MPFB2 runtime API discovery",
            "blender_version": bpy.app.version_string,
            "filter_terms": FILTER_TERMS,
            "include_private": INCLUDE_PRIVATE,
        },
        "mpfb2": {
            "import": import_name,
            "file": normalize_path(getattr(root, "__file__", None)),
        },
        "path_base": path_base,
        "modules": modules,
        "operators": operators,
        "blender_api": blender_api,
        "summary": {
            "modules": len(modules),
            "classes": class_count,
            "methods": method_count,
            "functions": function_count,
            "operators": len(operators),
        },
        "output": str(output_path),
    }

    output_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print_report(data)


if __name__ == "__main__":
    main()
