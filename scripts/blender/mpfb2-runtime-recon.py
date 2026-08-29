"""
Seedvale — MPFB2 Targeted Runtime API Recon

Run inside Blender 5.2 with MPFB2 enabled.

This is intentionally NOT a full API dump.

Strategy:
    1. Discover module names without importing every module.
    2. Select candidate modules by target terms / hints.
    3. Inspect only those modules.
    4. Report only matching classes, methods and functions.
    5. Inspect matching MPFB2 operators.
    6. Keep paths compact and deduplicated.

Evidence:
    This discovers runtime availability. It does not prove that an operation
    works correctly; execution tests remain a separate verification step.
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

TARGET_TERMS = [
    "animation",
    "mixamo",
    "rig",
    "snap",
    "map",
    "bake",
    "action",
]

# Module names containing these terms are inspected even when they do not
# contain a TARGET_TERM. This is useful for known MPFB2 UI packages.
TARGET_MODULE_HINTS = [
    "animops",
    "rigging",
]

INCLUDE_PRIVATE = False
MAX_MODULES = 100
MAX_METHODS_PER_CLASS = 80

MPFB_ROOTS = (
    "bl_ext.extensions_blender_org.mpfb",
    "mpfb",
)

OUTPUT_DIR = "D:\\"
OUTPUT_FILENAME = "seedvale_mpfb2_targeted_runtime_recon.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\\", "/").strip()


def normalize_path(path: str | None) -> str | None:
    if not path:
        return None
    try:
        return Path(path).resolve().as_posix()
    except Exception:
        return norm(path)


def common_base(paths: list[str]) -> str | None:
    if not paths:
        return None
    try:
        return os.path.commonpath(paths).replace("\\", "/")
    except Exception:
        return None


def relative_path(path: str | None, base: str | None) -> str | None:
    if not path or not base:
        return path
    try:
        return Path(path).relative_to(Path(base)).as_posix()
    except Exception:
        return path


def public_name(name: str) -> bool:
    return INCLUDE_PRIVATE or not name.startswith("_")


def matches(*values: Any) -> bool:
    haystack = " ".join(
        norm(value).lower()
        for value in values
        if value is not None
    )
    return any(term.lower() in haystack for term in TARGET_TERMS)


def module_is_candidate(name: str) -> bool:
    lowered = name.lower()
    return (
        any(term.lower() in lowered for term in TARGET_TERMS)
        or any(hint.lower() in lowered for hint in TARGET_MODULE_HINTS)
    )


def safe_signature(value: Any) -> str | None:
    try:
        return str(inspect.signature(value))
    except Exception:
        return None


def safe_source(value: Any) -> str | None:
    try:
        return normalize_path(
            inspect.getsourcefile(value) or inspect.getfile(value)
        )
    except Exception:
        return None


def safe_doc(value: Any) -> str:
    try:
        return inspect.getdoc(value) or ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# MPFB2 module discovery
# ---------------------------------------------------------------------------

def import_root() -> tuple[ModuleType | None, str | None]:
    for name in MPFB_ROOTS:
        try:
            return importlib.import_module(name), name
        except Exception:
            pass
    return None, None


def discover_candidate_module_names(root: ModuleType) -> list[str]:
    names: list[str] = []
    root_path = getattr(root, "__path__", None)

    if not root_path:
        return [root.__name__]

    prefix = root.__name__ + "."

    try:
        for info in pkgutil.walk_packages(root_path, prefix):
            if module_is_candidate(info.name):
                names.append(info.name)
                if len(names) >= MAX_MODULES:
                    break
    except Exception:
        pass

    return sorted(set(names))


def import_candidate_modules(names: list[str]) -> list[ModuleType]:
    modules: list[ModuleType] = []

    for name in names:
        try:
            modules.append(importlib.import_module(name))
        except Exception:
            pass

    return modules


# ---------------------------------------------------------------------------
# API extraction
# ---------------------------------------------------------------------------

def class_record(
    module: ModuleType,
    name: str,
    cls: type,
) -> dict[str, Any] | None:
    class_doc = safe_doc(cls)
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
        doc = safe_doc(value)

        if not matches(
            module.__name__,
            name,
            method_name,
            signature,
            doc,
        ):
            continue

        methods.append(
            {
                "name": method_name,
                "signature": signature,
                "source": safe_source(value),
            }
        )

        if len(methods) >= MAX_METHODS_PER_CLASS:
            break

    if not matches(module.__name__, name, class_doc) and not methods:
        return None

    return {
        "name": name,
        "source": safe_source(cls),
        "methods": methods,
    }


def module_record(module: ModuleType) -> dict[str, Any] | None:
    classes: list[dict[str, Any]] = []
    functions: list[dict[str, Any]] = []

    for name in sorted(
        item for item in dir(module)
        if public_name(item)
    ):
        try:
            value = getattr(module, name)
        except Exception:
            continue

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
            doc = safe_doc(value)

            if matches(module.__name__, name, signature, doc):
                functions.append(
                    {
                        "name": name,
                        "signature": signature,
                        "source": safe_source(value),
                    }
                )

    if not classes and not functions:
        return None

    return {
        "name": module.__name__,
        "file": normalize_path(getattr(module, "__file__", None)),
        "classes": classes,
        "functions": functions,
    }


# ---------------------------------------------------------------------------
# MPFB2 operators
# ---------------------------------------------------------------------------

def discover_mpfb_operators() -> list[dict[str, str]]:
    result: list[dict[str, str]] = []

    try:
        groups = dir(bpy.ops.mpfb)
    except Exception:
        return result

    for group_name in sorted(
        name for name in groups if public_name(name)
    ):
        try:
            group = getattr(bpy.ops.mpfb, group_name)
            operator_names = [
                name for name in dir(group)
                if public_name(name)
            ]
        except Exception:
            continue

        for operator_name in sorted(operator_names):
            idname = f"mpfb.{group_name}.{operator_name}"

            if not matches(group_name, operator_name, idname):
                continue

            result.append(
                {
                    "group": group_name,
                    "name": operator_name,
                    "idname": idname,
                }
            )

    return result


# ---------------------------------------------------------------------------
# Blender API candidates
# ---------------------------------------------------------------------------

def discover_blender_api() -> list[dict[str, str]]:
    candidates = (
        ("bpy.ops.nla", "bake", "animation bake"),
        ("bpy.ops.export_scene", "gltf", "GLB export"),
        ("bpy.data", "actions", "Action datablocks"),
        ("bpy.types.Object", "animation_data", "object animation data"),
        ("bpy.types.Action", "fcurves", "Action curves"),
    )

    return [
        {
            "owner": owner,
            "name": name,
            "purpose": purpose,
        }
        for owner, name, purpose in candidates
        if matches(owner, name, purpose)
    ]


# ---------------------------------------------------------------------------
# Path aggregation
# ---------------------------------------------------------------------------

def collect_paths(modules: list[dict[str, Any]]) -> list[str]:
    paths: list[str] = []

    for module in modules:
        paths.append(module["file"]) if module.get("file") else None

        for cls in module["classes"]:
            paths.append(cls["source"]) if cls.get("source") else None

            for method in cls["methods"]:
                paths.append(method["source"]) if method.get("source") else None

        for function in module["functions"]:
            paths.append(function["source"]) if function.get("source") else None

    return sorted(set(paths))


def compact_paths(
    modules: list[dict[str, Any]],
    base: str | None,
) -> None:
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
    print("Seedvale — MPFB2 Targeted Runtime API Recon")
    print("=" * 72)
    print(f"Blender:   {data['recon']['blender_version']}")
    print(f"MPFB2:     {data['mpfb2']['import']}")
    print(f"Terms:     {', '.join(TARGET_TERMS)}")
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
        print(f"Unique paths: {data['unique_paths']}")

    print("\nMPFB2 API")

    for module in data["modules"]:
        print(f"\n[{module['name']}]")

        if module["file"]:
            print(f"  file: {module['file']}")

        for cls in module["classes"]:
            print(f"  class {cls['name']}")

            for method in cls["methods"]:
                signature = method["signature"] or "(...)"
                print(f"    .{method['name']}{signature}")

        for function in module["functions"]:
            signature = function["signature"] or "(...)"
            print(f"  function {function['name']}{signature}")

    print("\nMPFB2 OPERATORS")

    if data["operators"]:
        for operator in data["operators"]:
            print(f"  {operator['idname']}")
    else:
        print("  none")

    print("\nBLENDER ANIMATION API")

    for item in data["blender_api"]:
        print(
            f"  {item['owner']}.{item['name']}"
            f" — {item['purpose']}"
        )

    print("\n" + "=" * 72)
    print(f"JSON: {data['output']}")
    print("=" * 72)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    root, import_name = import_root()

    if root is None:
        raise RuntimeError(
            "MPFB2 module not found. Tried: "
            + ", ".join(MPFB_ROOTS)
        )

    candidate_names = discover_candidate_module_names(root)
    modules = import_candidate_modules(candidate_names)

    records: list[dict[str, Any]] = []

    for module in modules:
        try:
            record = module_record(module)
            if record:
                records.append(record)
        except Exception:
            continue

    paths = collect_paths(records)
    path_base = common_base(paths)
    compact_paths(records, path_base)

    operators = discover_mpfb_operators()
    blender_api = discover_blender_api()

    class_count = sum(len(module["classes"]) for module in records)
    method_count = sum(
        len(cls["methods"])
        for module in records
        for cls in module["classes"]
    )
    function_count = sum(
        len(module["functions"])
        for module in records
    )

    output_path = (
        Path(bpy.data.filepath).parent / OUTPUT_FILENAME
        if bpy.data.filepath
        else Path(OUTPUT_DIR) / OUTPUT_FILENAME
    )

    data = {
        "recon": {
            "purpose": "targeted MPFB2 runtime API discovery",
            "blender_version": bpy.app.version_string,
            "terms": TARGET_TERMS,
            "module_hints": TARGET_MODULE_HINTS,
            "include_private": INCLUDE_PRIVATE,
        },
        "mpfb2": {
            "import": import_name,
            "file": normalize_path(getattr(root, "__file__", None)),
        },
        "path_base": path_base,
        "unique_paths": len(paths),
        "modules": records,
        "operators": operators,
        "blender_api": blender_api,
        "summary": {
            "modules": len(records),
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
