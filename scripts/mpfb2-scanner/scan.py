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

STRUCTURAL_REQUIREMENTS = {
    "body",
    "face",
    "hair",
    "beard",
    "headwear",
    "universal_clothing",
    "profession_piece",
    "equipment",
}

IGNORED_REQUIREMENT_KEYS = {
    "status",
    "note",
    "location",
    "asset",
    "planned",
    "clothing",
    "profession_specific",
    "wives",
    "materials",
    "total",
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

    # Normalize and remove duplicates.
    result = []

    seen = set()

    for alias in aliases:
        alias = normalize(alias)

        if not alias:
            continue

        if alias in seen:
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

    # Gender/context consistency.
    for group in ("male", "female"):
        hints = set(
            CONTEXT_HINTS.get(group, [])
        )

        req_has = bool(
            requirement_tokens & hints
        )

        candidate_has = bool(
            candidate_tokens & hints
        )

        if req_has and candidate_has:
            score += 0.08

        if req_has and not candidate_has:
            score -= 0.03

    # General semantic context.
    for group, hints in CONTEXT_HINTS.items():
        if group in {"male", "female"}:
            continue

        hints = set(hints)

        req_has = bool(
            requirement_tokens & hints
        )

        candidate_has = bool(
            candidate_tokens & hints
        )

        if req_has and candidate_has:
            score += 0.03

    return max(
        -0.10,
        min(0.15, score),
    )


def generic_token_penalty(candidate):
    tokens = token_set(candidate)

    if not tokens:
        return 0.0

    generic_count = len(
        tokens & GENERIC_TOKENS
    )

    if generic_count == 0:
        return 0.0

    return min(
        0.12,
        generic_count * 0.025,
    )


def score_pair(requirement, candidate):
    requirement = normalize(requirement)
    candidate = normalize(candidate)

    if not requirement or not candidate:
        return 0.0

    if requirement == candidate:
        return 1.0

    aliases = get_aliases(requirement)

    best = 0.0

    for alias in aliases:
        seq = sequence_score(
            alias,
            candidate,
        )

        tokens = token_score(
            alias,
            candidate,
        )

        containment = containment_score(
            alias,
            candidate,
        )

        semantic = semantic_context_score(
            alias,
            candidate,
        )

        penalty = generic_token_penalty(
            candidate
        )

        # Main score.
        score = (
            seq * 0.45
            + tokens * 0.25
            + containment * 0.30
            + semantic
            - penalty
        )

        # Exact alias should win immediately.
        if alias == candidate:
            score = 1.0

        best = max(best, score)

    return max(
        0.0,
        min(1.0, best),
    )


# ============================================================
# INVENTORY EXTRACTION
# ============================================================

def extract_strings(value, path=""):
    """
    Recursively extract candidate asset names from inventory JSON.

    The scanner intentionally accepts multiple inventory shapes.
    """

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
            child_path = (
                f"{path}[{index}]"
                if path
                else f"[{index}]"
            )

            results.extend(
                extract_strings(
                    item,
                    child_path,
                )
            )

        return results

    if isinstance(value, dict):
        # Prefer explicit asset-like fields.
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

        used_asset_field = False

        for field in asset_fields:
            if field not in value:
                continue

            field_value = value[field]

            if isinstance(field_value, str):
                text = field_value.strip()

                if text:
                    results.append({
                        "name": text,
                        "path": (
                            f"{path}.{field}"
                            if path
                            else field
                        ),
                        "source": field,
                    })

                    used_asset_field = True

        # Continue recursively to find nested assets.
        for key, child in value.items():
            child_path = (
                f"{path}.{key}"
                if path
                else key
            )

            # Avoid duplicating explicit string fields.
            if (
                used_asset_field
                and key in asset_fields
                and isinstance(child, str)
            ):
                continue

            results.extend(
                extract_strings(
                    child,
                    child_path,
                )
            )

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

        key = (
            normalized,
            entry.get("path", ""),
        )

        if key in seen:
            continue

        seen.add(key)

        result.append({
            **entry,
            "normalized": normalized,
        })

    return result


# ============================================================
# REQUIREMENT EXTRACTION
# ============================================================

def is_asset_requirement(
    name,
    value=None,
    parent_key=None,
):
    normalized = normalize(name)

    if not normalized:
        return False

    if normalized in IGNORED_REQUIREMENT_KEYS:
        return False

    if isinstance(value, dict):
        return False

    if normalized in STRUCTURAL_REQUIREMENTS:
        return True

    return True


def extract_requirements(value, path=""):
    """
    Extract concrete asset-like strings from requirements JSON.

    Lists of strings are treated as asset requirements.
    Objects with an explicit "asset" field are treated as assets.
    Structural category names are retained separately.
    """

    results = []

    if isinstance(value, str):
        text = value.strip()

        if text and is_asset_requirement(text):
            results.append({
                "requirement": text,
                "path": path,
                "type": "string",
            })

        return results

    if isinstance(value, list):
        for index, item in enumerate(value):
            child_path = (
                f"{path}[{index}]"
                if path
                else f"[{index}]"
            )

            results.extend(
                extract_requirements(
                    item,
                    child_path,
                )
            )

        return results

    if isinstance(value, dict):
        # Explicit asset definition:
        #
        # {
        #   "asset": "shirt",
        #   "location": "upper_body"
        # }
        #
        if isinstance(value.get("asset"), str):
            asset = value["asset"].strip()

            if asset:
                results.append({
                    "requirement": asset,
                    "path": (
                        f"{path}.asset"
                        if path
                        else "asset"
                    ),
                    "type": "asset",
                    "location": value.get("location"),
                })

        for key, child in value.items():
            child_path = (
                f"{path}.{key}"
                if path
                else key
            )

            if key == "asset":
                continue

            if key in IGNORED_REQUIREMENT_KEYS:
                continue

            if isinstance(child, dict):
                # Keep structural categories.
                if normalize(key) in STRUCTURAL_REQUIREMENTS:
                    results.append({
                        "requirement": key,
                        "path": child_path,
                        "type": "category",
                    })

                results.extend(
                    extract_requirements(
                        child,
                        child_path,
                    )
                )

            elif isinstance(child, list):
                results.extend(
                    extract_requirements(
                        child,
                        child_path,
                    )
                )

            elif isinstance(child, str):
                if is_asset_requirement(
                    key,
                    child,
                    parent_key=path,
                ):
                    results.append({
                        "requirement": child,
                        "path": child_path,
                        "type": "string",
                    })

        return results

    return results


def deduplicate_requirements(entries):
    result = []
    seen = set()

    for entry in entries:
        requirement = entry.get(
            "requirement",
            "",
        )

        normalized = normalize(
            requirement
        )

        if not normalized:
            continue

        key = (
            normalized,
            entry.get("path", ""),
        )

        if key in seen:
            continue

        seen.add(key)

        result.append({
            **entry,
            "normalized": normalized,
        })

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


def match_requirement(
    requirement,
    inventory,
):
    matches = []

    for candidate in inventory:
        candidate_name = candidate.get(
            "name",
            "",
        )

        score = score_pair(
            requirement,
            candidate_name,
        )

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
        key=lambda item: (
            item["score"],
            len(item["asset"]),
        ),
        reverse=True,
    )

    return matches[:MAX_MATCHES]


# ============================================================
# REPORT
# ============================================================

def print_match(requirement, matches):
    if not matches:
        log(
            f"MISSING 0.000 {requirement}"
        )
        return

    best = matches[0]

    status = classify_score(
        best["score"]
    )

    log(
        f"{status:<8} "
        f"{best['score']:.3f} "
        f"{requirement} "
        f"-> {best['asset']}"
    )

    for alternative in matches[1:]:
        if alternative["score"] < REVIEW_THRESHOLD:
            continue

        log(
            f"         "
            f"{alternative['score']:.3f} "
            f"-> {alternative['asset']}"
        )


# ============================================================
# MAIN SCAN
# ============================================================

def run_scan():
    started_at = datetime.now(
        timezone.utc
    )

    log("=" * 70)
    log("SEEDVALE / MPFB2 ASSET MATCH SCANNER")
    log("=" * 70)
    log()

    log("[CONFIG]")
    log(f"Requirements: {REQUIREMENTS_JSON}")
    log(f"Inventory:    {INVENTORY_JSON}")
    log(f"Output:       {OUTPUT_JSON}")
    log()

    # --------------------------------------------------------
    # Load
    # --------------------------------------------------------

    requirements_data = load_json(
        REQUIREMENTS_JSON
    )

    inventory_data = load_json(
        INVENTORY_JSON
    )

    # --------------------------------------------------------
    # Extract
    # --------------------------------------------------------

    requirements = deduplicate_requirements(
        extract_requirements(
            requirements_data
        )
    )

    inventory = deduplicate_inventory(
        extract_strings(
            inventory_data
        )
    )

    log("[INPUT]")
    log(
        f"Requirements: {len(requirements)}"
    )
    log(
        f"Inventory candidates: {len(inventory)}"
    )
    log()

    # --------------------------------------------------------
    # Match
    # --------------------------------------------------------

    results = []

    statistics = {
        "match": 0,
        "review": 0,
        "missing": 0,
    }

    log("[MATCHING]")

    for requirement_entry in requirements:
        requirement = requirement_entry[
            "requirement"
        ]

        matches = match_requirement(
            requirement,
            inventory,
        )

        best_score = (
            matches[0]["score"]
            if matches
            else 0.0
        )

        status = classify_score(
            best_score
        )

        statistics[
            status.lower()
        ] += 1

        print_match(
            requirement,
            matches,
        )

        results.append({
            "requirement": requirement,
            "normalized": requirement_entry[
                "normalized"
            ],
            "path": requirement_entry.get(
                "path"
            ),
            "type": requirement_entry.get(
                "type"
            ),
            "location": requirement_entry.get(
                "location"
            ),
            "status": status,
            "score": round(
                best_score,
                4,
            ),
            "matches": matches,
        })

    # --------------------------------------------------------
    # Output
    # --------------------------------------------------------

    finished_at = datetime.now(
        timezone.utc
    )

    output = {
        "scanner": {
            "name": "seedvale-mpfb2-scanner",
            "version": "1.0",
            "generated_at": finished_at.isoformat(),
            "started_at": started_at.isoformat(),
        },

        "blender": {
            "version": bpy.app.version_string,
            "version_tuple": list(
                bpy.app.version
            ),
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
            "requirements": len(
                requirements
            ),
            "inventory_candidates": len(
                inventory
            ),
            "match": statistics["match"],
            "review": statistics["review"],
            "missing": statistics["missing"],
        },

        "results": results,
    }

    save_json(
        OUTPUT_JSON,
        output,
    )

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------

    log()
    log("[SUMMARY]")
    log(
        f"MATCH:   {statistics['match']}"
    )
    log(
        f"REVIEW:  {statistics['review']}"
    )
    log(
        f"MISSING: {statistics['missing']}"
    )
    log()
    log(
        f"Saved: {OUTPUT_JSON}"
    )

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
