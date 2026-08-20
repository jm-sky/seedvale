"""
Extraction of embedded V8 CPU profiles (`args.data.cpuProfile`) into
`ProfileOperation`s, restricted to WebGL/shader/Three.js renderer
functions (see `categorize`).
"""

from __future__ import annotations

from typing import Any, Iterable

from .categorize import normalize_category
from .models import ProfileOperation
from .trace_parser import safe_int


def iter_cpu_profiles(
    events: list[dict[str, Any]],
) -> Iterable[dict[str, Any]]:
    for event in events:
        args = event.get("args") or {}
        data = args.get("data") or {}

        profile = data.get("cpuProfile")

        if isinstance(profile, dict):
            yield profile


def profile_nodes(
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    nodes = profile.get("nodes")

    if not isinstance(nodes, list):
        return []

    return [
        node
        for node in nodes
        if isinstance(node, dict)
    ]


def profile_samples(
    profile: dict[str, Any],
) -> list[Any]:
    samples = profile.get("samples")

    if isinstance(samples, list):
        return samples

    return []


def profile_time_deltas(
    profile: dict[str, Any],
) -> list[float]:
    deltas = profile.get("timeDeltas")

    if not isinstance(deltas, list):
        return []

    result = []

    for value in deltas:
        if isinstance(value, (int, float)):
            result.append(float(value))

    return result


def node_by_id(
    nodes: list[dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}

    for node in nodes:
        node_id = node.get("id")

        if node_id is None:
            continue

        result[safe_int(node_id)] = node

    return result


def get_node_call_frame(
    node: dict[str, Any],
) -> dict[str, Any]:
    frame = node.get("callFrame")

    if isinstance(frame, dict):
        return frame

    return {}


def profile_parent_map(
    nodes: list[dict[str, Any]],
) -> dict[int, int]:
    result: dict[int, int] = {}

    for node in nodes:
        node_id = node.get("id")

        if node_id is None:
            continue

        for child_id in node.get("children") or []:
            result[safe_int(child_id)] = safe_int(node_id)

    return result


def profile_call_tree(
    node_id: int,
    nodes_by_id: dict[int, dict[str, Any]],
    parents: dict[int, int],
) -> tuple[str, ...]:
    path: list[str] = []

    current = node_id
    seen: set[int] = set()

    while current and current not in seen:
        seen.add(current)

        node = nodes_by_id.get(current)

        if not node:
            break

        frame = get_node_call_frame(node)

        name = (
            frame.get("functionName")
            or node.get("name")
            or "(anonymous)"
        )

        path.append(str(name))

        current = parents.get(current, 0)

    path.reverse()

    return tuple(path)


def profile_node_operation(
    node: dict[str, Any],
    nodes_by_id: dict[int, dict[str, Any]],
    parents: dict[int, int],
) -> ProfileOperation | None:
    frame = get_node_call_frame(node)

    name = (
        frame.get("functionName")
        or node.get("name")
        or "(anonymous)"
    )

    name = str(name)

    category = normalize_category(name)

    if category not in {
        "WebGL",
        "SHADER / PROGRAM",
        "THREE.JS RENDERER",
    }:
        return None

    url = str(frame.get("url") or "")

    line = frame.get("lineNumber")
    column = frame.get("columnNumber")

    line_value = (
        safe_int(line) + 1
        if line is not None
        else None
    )

    column_value = (
        safe_int(column) + 1
        if column is not None
        else None
    )

    return ProfileOperation(
        name=name,
        category=category,
        url=url,
        line=line_value,
        column=column_value,
        tree=profile_call_tree(
            safe_int(node.get("id")),
            nodes_by_id,
            parents,
        ),
    )


def extract_profile_operations(
    profiles: list[dict[str, Any]],
) -> list[ProfileOperation]:
    operations: dict[
        tuple[str, str, int | None, int | None],
        ProfileOperation,
    ] = {}

    for profile in profiles:
        nodes = profile_nodes(profile)

        if not nodes:
            continue

        samples = profile_samples(profile)
        deltas = profile_time_deltas(profile)

        nodes_by_id = node_by_id(nodes)
        parents = profile_parent_map(nodes)

        profile_seen: set[
            tuple[str, str, int | None, int | None]
        ] = set()

        # ---------------------------------------------------------------
        # 1. Sampled CPU time
        # ---------------------------------------------------------------

        for index, sample in enumerate(samples):
            node_id = safe_int(sample)

            node = nodes_by_id.get(node_id)

            if not node:
                continue

            operation = profile_node_operation(
                node,
                nodes_by_id,
                parents,
            )

            if operation is None:
                continue

            delta_us = 0.0

            if index < len(deltas):
                delta_us = max(
                    0.0,
                    deltas[index],
                )

            duration_ms = delta_us / 1000.0

            key = (
                operation.name,
                operation.url,
                operation.line,
                operation.column,
            )

            item = operations.get(key)

            if item is None:
                item = operation
                operations[key] = item

            item.duration_ms += duration_ms
            item.samples += 1

            if key not in profile_seen:
                item.profile_count += 1
                profile_seen.add(key)

        # ---------------------------------------------------------------
        # 2. All matching profile nodes
        #
        # Important:
        # A function can exist in cpuProfile.nodes without appearing
        # in samples. This is still useful evidence that the function
        # was present in the captured profile.
        # ---------------------------------------------------------------

        node_seen: set[
            tuple[str, str, int | None, int | None]
        ] = set()

        for node in nodes:
            operation = profile_node_operation(
                node,
                nodes_by_id,
                parents,
            )

            if operation is None:
                continue

            key = (
                operation.name,
                operation.url,
                operation.line,
                operation.column,
            )

            item = operations.get(key)

            if item is None:
                item = operation
                operations[key] = item

            if key not in node_seen:
                item.node_occurrences += 1
                node_seen.add(key)

    return list(operations.values())
