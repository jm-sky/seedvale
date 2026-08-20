"""
Ranking of real CPU cost from the call tree: top individual operations by
self time, and the same aggregated by operation name.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from .call_tree import flatten_nodes
from .models import Node, TOP_N


def is_noise_operation(name: str) -> bool:
    return name.lower() in {
        "threadcontroller",
        "threadpool_run",
        "threadpool_task",
    }


def top_real_cpu_operations(
    roots: list[Node],
) -> list[Node]:
    candidates: list[Node] = []

    for node in flatten_nodes(roots):
        if is_noise_operation(node.name):
            continue

        if node.duration < 1.0:
            continue

        candidates.append(node)

    candidates.sort(
        key=lambda node: (
            node.self_time,
            node.duration,
        ),
        reverse=True,
    )

    return candidates[:TOP_N]


def aggregate_cpu(
    roots: list[Node],
) -> list[dict[str, Any]]:
    stats: dict[
        str,
        dict[str, Any],
    ] = defaultdict(
        lambda: {
            "self": 0.0,
            "total": 0.0,
            "calls": 0,
            "node": None,
        }
    )

    for node in flatten_nodes(roots):
        if is_noise_operation(node.name):
            continue

        item = stats[node.name]

        item["self"] += node.self_time
        item["total"] += node.duration
        item["calls"] += 1

        if (
            item["node"] is None
            or node.self_time > item["node"].self_time
        ):
            item["node"] = node

    result = list(stats.values())

    result.sort(
        key=lambda item: (
            item["self"],
            item["total"],
        ),
        reverse=True,
    )

    return result[:TOP_N]
