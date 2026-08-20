"""
WebGL / shader / Three.js renderer analysis: ranking sampled V8 profile
operations, and aggregating raw trace "X" events that are themselves
WebGL/shader/renderer calls.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from .categorize import normalize_category
from .models import ProfileOperation, TOP_N
from .trace_parser import event_name


def webgl_profile_operations(
    operations: list[ProfileOperation],
) -> list[ProfileOperation]:
    result = [
        operation
        for operation in operations
        if operation.category in {
            "WebGL",
            "SHADER / PROGRAM",
            "THREE.JS RENDERER",
        }
    ]

    result.sort(
        key=lambda operation: (
            operation.node_occurrences,
            operation.samples,
            operation.duration_ms,
        ),
        reverse=True,
    )

    return result


def webgl_trace_events(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    result = []

    for event in events:
        name = event_name(event)

        category = normalize_category(name)

        if category not in {
            "WebGL",
            "SHADER / PROGRAM",
            "THREE.JS RENDERER",
        }:
            continue

        dur_us = float(event.get("dur") or 0.0)

        result.append(
            {
                "name": name,
                "category": category,
                "duration_ms": dur_us / 1000.0,
            }
        )

    return result


def aggregate_webgl_trace(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    stats: dict[
        tuple[str, str],
        dict[str, Any],
    ] = defaultdict(
        lambda: {
            "name": "",
            "category": "",
            "calls": 0,
            "total": 0.0,
        }
    )

    for event in events:
        key = (
            event["name"],
            event["category"],
        )

        item = stats[key]

        item["name"] = event["name"]
        item["category"] = event["category"]
        item["calls"] += 1
        item["total"] += event["duration_ms"]

    result = list(stats.values())

    result.sort(
        key=lambda item: (
            item["calls"],
            item["total"],
        ),
        reverse=True,
    )

    return result[:TOP_N]
