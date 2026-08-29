"""
Extraction of embedded V8 CPU profiles (`args.data.cpuProfile`) into
`ProfileOperation`s: WebGL/shader/Three.js renderer functions (see
`categorize.normalize_category`) plus Seedvale application functions
and other code-ownership buckets (see `categorize.classify_source_ownership`).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable

from .categorize import (
    CATEGORY_APPLICATION,
    classify_source_ownership,
    normalize_category,
)
from .models import ProfileOperation
from .trace_parser import safe_int

WEBGL_FAMILY_CATEGORIES = {
    "WebGL",
    "SHADER / PROGRAM",
    "THREE.JS RENDERER",
}


def _profile_chunk(event: dict[str, Any]) -> dict[str, Any] | None:
    args = event.get("args") or {}
    data = args.get("data") or {}

    chunk = data.get("cpuProfile")

    return chunk if isinstance(chunk, dict) else None


def _merge_profile_chunks(
    chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    nodes: list[Any] = []
    samples: list[Any] = []
    time_deltas: list[Any] = []

    for chunk in chunks:
        chunk_nodes = chunk.get("nodes")

        if isinstance(chunk_nodes, list):
            nodes.extend(chunk_nodes)

        chunk_samples = chunk.get("samples")

        if isinstance(chunk_samples, list):
            samples.extend(chunk_samples)

        chunk_deltas = chunk.get("timeDeltas")

        if isinstance(chunk_deltas, list):
            time_deltas.extend(chunk_deltas)

    return {
        "nodes": nodes,
        "samples": samples,
        "timeDeltas": time_deltas,
    }


def iter_cpu_profiles(
    events: list[dict[str, Any]],
) -> Iterable[dict[str, Any]]:
    """
    Yields one merged CPU profile per V8 profiler id, accumulating
    `nodes`/`samples`/`timeDeltas` across every `ProfileChunk` event
    that shares that id.

    Chrome's tracing format splits a single logical V8 CPU profile
    into many `ProfileChunk` events on the wire: only some chunks
    introduce new `nodes` — later chunks routinely reference node ids
    that were defined by an earlier chunk of the SAME profile id.
    Treating each chunk as an independent profile (the previous
    behaviour here) resolves sample node ids only against that
    chunk's own `nodes` list, which silently drops almost every
    sample whose defining node arrived in an earlier chunk.
    """
    tagged: list[tuple[int, Any, Any, dict[str, Any]]] = []

    for event in events:
        chunk = _profile_chunk(event)

        if chunk is None:
            continue

        tagged.append(
            (
                safe_int(event.get("ts")),
                event.get("pid"),
                event.get("id"),
                chunk,
            )
        )

    tagged.sort(key=lambda item: item[0])

    chunks_by_id: dict[
        tuple[Any, Any],
        list[dict[str, Any]],
    ] = defaultdict(list)

    fallback: list[dict[str, Any]] = []

    for _, pid, profile_id, chunk in tagged:
        if profile_id is None:
            # No profiler id to group by (defensive: not observed in
            # practice) — treat the chunk as a standalone profile
            # rather than risk merging unrelated chunks together.
            fallback.append(chunk)
            continue

        chunks_by_id[(pid, profile_id)].append(chunk)

    for chunks in chunks_by_id.values():
        yield _merge_profile_chunks(chunks)

    yield from fallback


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
) -> ProfileOperation:
    frame = get_node_call_frame(node)

    name = (
        frame.get("functionName")
        or node.get("name")
        or "(anonymous)"
    )

    name = str(name)

    url = str(frame.get("url") or "")

    # Two classification axes: `normalize_category` identifies
    # WebGL/shader/Three.js-renderer calls by function name (kept
    # exactly as before). Everything else falls back to a URL-based
    # code-ownership classification (Seedvale application code vs.
    # framework/runtime vs. Chrome/V8 infrastructure vs. ambiguous).
    webgl_category = normalize_category(name)

    category = (
        webgl_category
        if webgl_category in WEBGL_FAMILY_CATEGORIES
        else classify_source_ownership(url)
    )

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


def application_profile_operations(
    operations: list[ProfileOperation],
) -> list[ProfileOperation]:
    """
    Seedvale application-owned operations with real sampling evidence,
    ranked by sampled CPU time where the trace provides it (see
    `ProfileOperation.duration_ms`), falling back to sample count when
    it does not — some traces' `ProfileChunk` events carry no
    `timeDeltas` at all, in which case `duration_ms` stays 0 for every
    operation and callers must not present that as a real
    zero-cost measurement.
    """
    result = [
        operation
        for operation in operations
        if operation.category == CATEGORY_APPLICATION
        and (operation.samples > 0 or operation.node_occurrences > 0)
    ]

    result.sort(
        key=lambda operation: (
            operation.duration_ms,
            operation.samples,
            operation.node_occurrences,
        ),
        reverse=True,
    )

    return result
