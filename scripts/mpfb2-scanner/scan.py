import bpy
import json
import re
import os
import sys
import difflib
from datetime import datetime
from datetime import timezone


# ============================================================
# SCANNER DIRECTORY
# ============================================================

SCANNER_DIR = (
    r"\\wsl.localhost\Ubuntu-20.04"
    r"\home\madeyskij\projects\private\seedvale"
    r"\scripts\mpfb2-scanner"
)

if SCANNER_DIR not in sys.path:
    sys.path.insert(0, SCANNER_DIR)


# ============================================================
# LOCAL MODULES
# ============================================================

from config import (
    WSL_DISTRO,
    WSL_REPO_PATH,
    REQUIREMENTS_JSON,
    INVENTORY_JSON,
    OUTPUT_JSON,
    MATCH_THRESHOLD,
    REVIEW_THRESHOLD,
    MAX_MATCHES,
)

from aliases import (
    ALIASES,
    CONTEXT_HINTS,
    GENERIC_TOKENS,
    SINGULAR_FORMS,
)


# ============================================================
# CONSTANTS
# ============================================================

# The requirements document is a schema, not a bag of strings.
# Only these category values represent concrete asset candidates.
ASSET_VALUE_CATEGORIES = {
    "hair",
    "beard",
    "headwear",
    "base",
}

# Clothing is represented by explicit {"asset": ..., ...} records.
ASSET_RECORD_CATEGORIES = {
    "clothing",
}

# Values that describe the requirements document itself or simulation/design
# rules must never become asset requirements.
IGNORED_REQUIREMENT_KEYS = {
    "project",
    "version",
    "asset_source",
    "principle",
    "categories",
    "professions",
    "modular_example",
    "status",
    "note",
    "location",
    "asset",
    "planned",
    "total",
    "materials",
    "materials_and_colors",
    "wives",
    "profession_specific_outfits",
}

# These values describe the absence of an asset, not an asset to find.
IGNORED_ASSET_VALUES = {
    "none",
}

STOP_WORDS = {
    "the",
    "a",
    "an",
    "and",
    "with",
    "for",
    "of",
    "to",
    "from",
}


# ============================================================
# LOGGING
# ============================================================

def log(message=""):
    print(message, flush=True)


# ============================================================
# JSON
# ============================================================

def load_json(path):
    path = os.fspath(path)

    if not os.path.exists(path):
        raise FileNotFoundError(path)

    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path, data):
    path = os.fspath(path)

    parent = os.path.dirname(path)

    if parent:
        os.makedirs(parent, exist_ok=True)

    with open(path, "w", encoding="utf-8") as handle:
        json.dump(
            data,
            handle,
            indent=2,
            ensure_ascii=False,
        )

        handle.write("\n")


# ============================================================
# NORMALIZATION
# ============================================================

def split_camel_case(value):
    value = re.sub(
        r"([a-z0-9])([A-Z])",
        r"\1_\2",
        value,
    )

    value = re.sub(
        r"([A-Z]+)([A-Z][a-z])",
        r"\1_\2",
        value,
    )

    return value


def normalize(value):
    if value is None:
        return ""

    value = str(value).strip()

    if not value:
        return ""

    value = split_camel_case(value)

    value = value.replace("-", "_")
    value = value.replace(" ", "_")
    value = value.replace(".", "_")
    value = value.replace("/", "_")
    value = value.replace("\\", "_")

    value = re.sub(
        r"[^a-zA-Z0-9_]+",
        "_",
        value,
    )

    value = value.lower()

    value = re.sub(
        r"_+",
        "_",
        value,
    )

    value = value.strip("_")

    return value


def normalize_tokens(value):
    normalized = normalize(value)

    if not normalized:
        return []

    result = []

    for token in normalized.split("_"):
        if not token:
            continue

        if token in STOP_WORDS:
            continue

        token = SINGULAR_FORMS.get(
            token,
            token,
        )

        result.append(token)

    return result


def token_set(value):
    return set(normalize_tokens(value))


def compact(value):
    return "".join(normalize_tokens(value))


# ============================================================
# ALIAS EXPANSION
# ============================================================

def get_aliases(requirement):
    requirement = normalize(requirement)

    aliases = [
        requirement,
    ]

    aliases.extend(
        ALIASES.get(requirement, [])
    )

    result = []
    seen = set()

    for alias in aliases:
        alias = normalize(alias)

        if not alias or alias in seen:
            continue

        seen.add(alias)
        result.append(alias)

    return result


# ============================================================
# FUZZY SCORING
# ============================================================

def sequence_score(a, b):
    if not a or not b:
        return 0.0

    return difflib.SequenceMatcher(
        None,
        a,
        b,
    ).ratio()


def token_score(a, b):
    a_tokens = token_set(a)
    b_tokens = token_set(b)

    if not a_tokens or not b_tokens:
        return 0.0

    intersection = a_tokens & b_tokens
    union = a_tokens | b_tokens

    if not union:
        return 0.0

    return len(intersection) / len(union)


def containment_score(a, b):
    a_compact = compact(a)
    b_compact = compact(b)

    if not a_compact or not b_compact:
        return 0.0

    if a_compact == b_compact:
        return 1.0

    if a_compact in b_compact:
        return min(
            0.97,
            len(a_compact) / len(b_compact) + 0.25,
        )

    if b_compact in a_compact:
        return min(
            0.97,
            len(b_compact) / len(a_compact) + 0.25,
        )

    return 0.0


def semantic_context_score(requirement, candidate):
    requirement_tokens = token_set(requirement)
    candidate_tokens = token_set(candidate)

    if not requirement_tokens or not candidate_tokens:
        return 0.0

    score = 0.0

    for group in ("male", "female"):
        hints = set(CONTEXT_HINTS.get(group, []))
        req_has = bool(requirement_tokens & hints)
        candidate_has = bool(candidate_tokens & hints)

        if req_has and candidate_has:
            score += 0.08

        if req_has and not candidate_has:
            score -= 0.03

    for group, hints in CONTEXT_HINTS.items():
        if group in {"male", "female"}:
            continue

        hints = set(hints)
        req_has = bool(requirement_tokens & hints)
        candidate_has = bool(candidate_tokens & hints)

        if req_has and candidate_has:
            score += 0.03

    return max(-0.10, min(0.15, score))


def generic_token_penalty(candidate):
    tokens = token_set(candidate)

    if not tokens:
        return 0.0

    generic_count = len(tokens & GENERIC_TOKENS)

    if generic_count == 0:
        return 0.0

    return min(0.12, generic_count * 0.025)


def score_pair(requirement, candidate):
    requirement = normalize(requirement)
    candidate = normalize(candidate)

    if not requirement or not candidate:
        return 0.0

    if requirement == candidate:
        return 1.0

    best = 0.0

    for alias in get_aliases(requirement):
        seq = sequence_score(alias, candidate)
        tokens = token_score(alias, candidate)
        containment = containment_score(alias, candidate)
        semantic = semantic_context_score(alias, candidate)
        penalty = generic_token_penalty(candidate)

        score = (
            seq * 0.45
            + tokens * 0.25
            + containment * 0.30
            + semantic
            - penalty
        )

        if alias == candidate:
            score = 1.0

        best = max(best, score)

    return max(0.0, min(1.0, best))


# ============================================================
# INVENTORY EXTRACTION
# ============================================================

def extract_strings(value, path=""):
    """Recursively extract candidate asset names from inventory JSON."""
    results = []

    if isinstance(value, str):
        text = value.strip()

        if text:
            results.append({
                "name": text,
                "path": path,
                "source": "json",
            })

        return results

    if isinstance(value, list):
        for index, item in enumerate(value):
            child_path = f"{path}[{index}]" if path else f"[{index}]"
            results.extend(extract_strings(item, child_path))

        return results

    if isinstance(value, dict):
        asset_fields = (
            "name",
            "asset",
            "filename",
            "file",
            "object",
            "object_name",
            "collection",
            "path",
            "source",
        )

        used_asset_fields = set()

        for field in asset_fields:
            field_value = value.get(field)

            if isinstance(field_value, str) and field_value.strip():
                results.append({
                    "name": field_value.strip(),
                    "path": f"{path}.{field}" if path else field,
                    "source": field,
                })
                used_asset_fields.add(field)

        for key, child in value.items():
            if key in used_asset_fields:
                continue

            child_path = f"{path}.{key}" if path else key
            results.extend(extract_strings(child, child_path))

        return results

    return results


def deduplicate_inventory(entries):
    result = []
    seen = set()

    for entry in entries:
        name = entry.get("name", "")
        normalized = normalize(name)

        if not normalized:
            continue

        key = (normalized, entry.get("path", ""))

        if key in seen:
            continue

        seen.add(key)
        result.append({**entry, "normalized": normalized})

    return result


# ============================================================
# REQUIREMENT EXTRACTION
# ============================================================

def add_requirement(results, value, path, requirement_type="asset", location=None):
    """Add one concrete asset requirement unless it is an explicit absence."""
    if not isinstance(value, str):
        return

    value = value.strip()
    normalized = normalize(value)

    if not normalized or normalized in IGNORED_ASSET_VALUES:
        return

    entry = {
        "requirement": value,
        "path": path,
        "type": requirement_type,
    }

    if location is not None:
        entry["location"] = location

    results.append(entry)


def extract_asset_values(value, path, results, requirement_type="variant"):
    """Extract strings from an explicitly asset-valued category."""
    if isinstance(value, str):
        add_requirement(results, value, path, requirement_type)
        return

    if isinstance(value, list):
        for index, item in enumerate(value):
            child_path = f"{path}[{index}]"
            extract_asset_values(item, child_path, results, requirement_type)
        return

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            extract_asset_values(child, child_path, results, requirement_type)


def extract_asset_records(value, path, results):
    """Extract only explicit {asset: ...} records from a category."""
    if isinstance(value, list):
        for index, item in enumerate(value):
            child_path = f"{path}[{index}]"
            extract_asset_records(item, child_path, results)
        return

    if isinstance(value, dict):
        if isinstance(value.get("asset"), str):
            add_requirement(
                results,
                value["asset"],
                f"{path}.asset",
                "asset",
                value.get("location"),
            )
            return

        for key, child in value.items():
            # metadata / rules are not asset requirements
            if key in IGNORED_REQUIREMENT_KEYS:
                continue

            child_path = f"{path}.{key}"
            extract_asset_records(child, child_path, results)


def extract_requirements(value, path=""):
    """
    Schema-aware extraction for mpfb2-npc-hero-assets-v1.json.

    Important: this intentionally does NOT recursively treat every string
    in the JSON as an asset requirement. The document contains metadata,
    design principles, categories, professions and composition examples.
    Only concrete asset-bearing category values are extracted.
    """
    results = []

    if not isinstance(value, dict):
        return results

    categories = value.get("categories")

    if not isinstance(categories, dict):
        return results

    # MPFB2 body/face are generated by MPFB2/morphs in v1, so there is no
    # concrete asset to scan for in these categories.
    for category in ASSET_VALUE_CATEGORIES:
        if category not in categories:
            continue

        extract_asset_values(
            categories[category],
            f"categories.{category}",
            results,
            "variant",
        )

    # Clothing uses explicit asset records. This includes universal,
    # hero and profession-specific clothing, but ignores the wives metadata
    # and other descriptive fields.
    clothing = categories.get("clothing")

    if isinstance(clothing, dict):
        for key, child in clothing.items():
            if key in IGNORED_REQUIREMENT_KEYS:
                continue

            extract_asset_records(
                child,
                f"categories.clothing.{key}",
                results,
            )

    return results


def deduplicate_requirements(entries):
    """Deduplicate by actual asset identity, not by JSON path."""
    result = []
    by_normalized = {}

    for entry in entries:
        requirement = entry.get("requirement", "")
        normalized = normalize(requirement)

        if not normalized:
            continue

        existing = by_normalized.get(normalized)

        if existing is None:
            normalized_entry = {
                **entry,
                "normalized": normalized,
            }
            by_normalized[normalized] = normalized_entry
            result.append(normalized_entry)
            continue

        # Preserve the most specific metadata when the same asset occurs in
        # multiple places (e.g. boots in universal + hero clothing).
        if not existing.get("location") and entry.get("location"):
            existing["location"] = entry["location"]

        paths = existing.setdefault("paths", [existing.get("path")])
        if entry.get("path") not in paths:
            paths.append(entry.get("path"))

    for entry in result:
        paths = entry.pop("paths", None)
        if paths:
            entry["path"] = paths[0]
            if len(paths) > 1:
                entry["paths"] = paths

    return result


# ============================================================
# MATCHING
# ============================================================

def classify_score(score):
    if score >= MATCH_THRESHOLD:
        return "MATCH"

    if score >= REVIEW_THRESHOLD:
        return "REVIEW"

    return "MISSING"


def match_requirement(requirement, inventory):
    matches = []

    for candidate in inventory:
        candidate_name = candidate.get("name", "")

        score = score_pair(requirement, candidate_name)

        if score <= 0:
            continue

        matches.append({
            "asset": candidate_name,
            "score": round(score, 4),
            "path": candidate.get("path"),
            "source": candidate.get("source"),
            "normalized": candidate.get(
                "normalized",
                normalize(candidate_name),
            ),
        })

    matches.sort(
        key=lambda item: (item["score"], len(item["asset"])),
        reverse=True,
    )

    return matches[:MAX_MATCHES]


# ============================================================
# REPORT
# ============================================================

def print_match(requirement, matches):
    if not matches:
        log(f"MISSING 0.000 {requirement}")
        return

    best = matches[0]
    status = classify_score(best["score"])

    log(
        f"{status:<8} {best['score']:.3f} "
        f"{requirement} -> {best['asset']}"
    )

    for alternative in matches[1:]:
        if alternative["score"] < REVIEW_THRESHOLD:
            continue

        log(f"         {alternative['score']:.3f} -> {alternative['asset']}")


# ============================================================
# MAIN SCAN
# ============================================================

def run_scan():
    started_at = datetime.now(timezone.utc)

    log("=" * 70)
    log("SEEDVALE / MPFB2 ASSET MATCH SCANNER")
    log("=" * 70)
    log()

    log("[CONFIG]")
    log(f"Requirements: {REQUIREMENTS_JSON}")
    log(f"Inventory:    {INVENTORY_JSON}")
    log(f"Output:       {OUTPUT_JSON}")
    log()

    requirements_data = load_json(REQUIREMENTS_JSON)
    inventory_data = load_json(INVENTORY_JSON)

    requirements = deduplicate_requirements(
        extract_requirements(requirements_data)
    )

    inventory = deduplicate_inventory(
        extract_strings(inventory_data)
    )

    log("[INPUT]")
    log(f"Requirements: {len(requirements)}")
    log(f"Inventory candidates: {len(inventory)}")
    log()

    results = []
    statistics = {"match": 0, "review": 0, "missing": 0}

    log("[MATCHING]")

    for requirement_entry in requirements:
        requirement = requirement_entry["requirement"]
        matches = match_requirement(requirement, inventory)
        best_score = matches[0]["score"] if matches else 0.0
        status = classify_score(best_score)

        statistics[status.lower()] += 1
        print_match(requirement, matches)

        results.append({
            "requirement": requirement,
            "normalized": requirement_entry["normalized"],
            "path": requirement_entry.get("path"),
            "paths": requirement_entry.get("paths"),
            "type": requirement_entry.get("type"),
            "location": requirement_entry.get("location"),
            "status": status,
            "score": round(best_score, 4),
            "matches": matches,
        })

    finished_at = datetime.now(timezone.utc)

    output = {
        "scanner": {
            "name": "seedvale-mpfb2-scanner",
            "version": "1.1",
            "generated_at": finished_at.isoformat(),
            "started_at": started_at.isoformat(),
        },
        "blender": {
            "version": bpy.app.version_string,
            "version_tuple": list(bpy.app.version),
        },
        "configuration": {
            "match_threshold": MATCH_THRESHOLD,
            "review_threshold": REVIEW_THRESHOLD,
            "max_matches": MAX_MATCHES,
        },
        "sources": {
            "requirements": REQUIREMENTS_JSON,
            "inventory": INVENTORY_JSON,
        },
        "statistics": {
            "requirements": len(requirements),
            "inventory_candidates": len(inventory),
            "match": statistics["match"],
            "review": statistics["review"],
            "missing": statistics["missing"],
        },
        "results": results,
    }

    save_json(OUTPUT_JSON, output)

    log()
    log("[SUMMARY]")
    log(f"MATCH:   {statistics['match']}")
    log(f"REVIEW:  {statistics['review']}")
    log(f"MISSING: {statistics['missing']}")
    log()
    log(f"Saved: {OUTPUT_JSON}")

    return output


# ============================================================
# BLENDER EXECUTION
# ============================================================

if __name__ == "__main__":
    try:
        run_scan()
    except Exception as exc:
        log()
        log("=" * 70)
        log("ERROR")
        log("=" * 70)
        log(str(exc))
        raise
