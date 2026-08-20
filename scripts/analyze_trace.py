#!/usr/bin/env python3
"""
Seedvale Chrome Trace Analyzer v15

Analyzes Chrome/DevTools JSON traces without requiring NAVSTART.

Focus:
- CPU X events
- B/E events
- embedded V8 CPU profiles
- Three.js / WebGL API calls
- shader/program operations
- GPU tasks
- aggregated operation cost
- call trees

Usage:
    ./scripts/analyze_trace.py trace.json

No Lighthouse / NAVSTART dependency.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


VERSION = "15"

TOP_N = 5
MAX_TREE_DEPTH = 10
MIN_PROFILE_DURATION_MS = 0.01


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Event:
    name: str
    start: float
    end: float
    pid: int
    tid: int
    ph: str
    args: dict[str, Any] = field(default_factory=dict)

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass
class Node:
    name: str
    start: float
    end: float
    pid: int
    tid: int
    ph: str
    args: dict[str, Any] = field(default_factory=dict)
    children: list["Node"] = field(default_factory=list)

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)

    @property
    def self_time(self) -> float:
        if not self.children:
            return self.duration

        child_time = 0.0

        for start, end in merge_intervals(
            (child.start, child.end)
            for child in self.children
        ):
            child_time += max(0.0, end - start)

        return max(0.0, self.duration - child_time)


@dataclass
class ProfileOperation:
    name: str
    url: str = ""
    line: int | None = None
    column: int | None = None
    duration_ms: float = 0.0
    samples: int = 0
    profile_count: int = 0
    tree: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def ms(value: float) -> str:
    return f"{value:,.1f} ms"


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def event_name(event: dict[str, Any]) -> str:
    return str(event.get("name") or "<unnamed>")


def merge_intervals(
    intervals: Iterable[tuple[float, float]],
) -> list[tuple[float, float]]:
    ordered = sorted(
        (start, end)
        for start, end in intervals
        if end > start
    )

    if not ordered:
        return []

    result: list[tuple[float, float]] = [ordered[0]]

    for start, end in ordered[1:]:
        previous_start, previous_end = result[-1]

        if start <= previous_end:
            result[-1] = (
                previous_start,
                max(previous_end, end),
            )
        else:
            result.append((start, end))

    return result


def normalize_category(name: str) -> str:
    lower = name.lower()

    if (
        "webgl" in lower
        or lower in {
            "bindtexture",
            "bindbuffer",
            "bufferdata",
            "buffer_sub_data",
            "createbuffer",
            "deletebuffer",
            "createtexture",
            "deletetexture",
            "teximage2d",
            "texsubimage2d",
            "drawarrays",
            "drawelements",
            "disable",
            "enable",
            "useprogram",
            "vertexattribpointer",
            "uniform",
            "viewport",
            "clear",
            "blendfunc",
            "depthfunc",
            "cullface",
        }
    ):
        return "WebGL"

    if (
        "shader" in lower
        or "program" in lower
        or lower in {
            "compile",
            "linkprogram",
            "getuniforms",
            "getprograminfo",
            "getshaderinfo",
            "getshaderprecisionformat",
        }
    ):
        return "SHADER / PROGRAM"

    if lower.startswith("webglrenderer."):
        return "THREE.JS RENDERER"

    if lower.startswith("render"):
        return "THREE.JS RENDERER"

    if lower.startswith("v8."):
        return "V8 / JS"

    return "Other"


# ---------------------------------------------------------------------------
# Trace events
# ---------------------------------------------------------------------------

def parse_timed_events(
    events: list[dict[str, Any]],
) -> list[Event]:
    result: list[Event] = []

    for raw in events:
        if raw.get("ph") != "X":
            continue

        ts = raw.get("ts")
        dur = raw.get("dur")

        if ts is None or dur is None:
            continue

        duration = float(dur)

        if duration <= 0:
            continue

        result.append(
            Event(
                name=event_name(raw),
                start=float(ts),
                end=float(ts) + duration,
                pid=safe_int(raw.get("pid")),
                tid=safe_int(raw.get("tid")),
                ph="X",
                args=raw.get("args") or {},
            )
        )

    return result


def build_be_events(
    events: list[dict[str, Any]],
) -> list[Event]:
    stacks: dict[
        tuple[int, int],
        list[dict[str, Any]],
    ] = defaultdict(list)

    result: list[Event] = []

    ordered = sorted(
        enumerate(events),
        key=lambda item: (
            safe_int(item[1].get("ts")),
            item[0],
        ),
    )

    for _, raw in ordered:
        ph = raw.get("ph")

        if ph not in {"B", "E"}:
            continue

        pid = safe_int(raw.get("pid"))
        tid = safe_int(raw.get("tid"))
        key = (pid, tid)

        if ph == "B":
            stacks[key].append(raw)
            continue

        stack = stacks.get(key)

        if not stack:
            continue

        begin = stack.pop()

        start = begin.get("ts")
        end = raw.get("ts")

        if start is None or end is None:
            continue

        start_f = float(start)
        end_f = float(end)

        if end_f <= start_f:
            continue

        result.append(
            Event(
                name=event_name(begin),
                start=start_f,
                end=end_f,
                pid=pid,
                tid=tid,
                ph="B",
                args=begin.get("args") or {},
            )
        )

    return result


# ---------------------------------------------------------------------------
# Call tree
# ---------------------------------------------------------------------------

def build_call_tree(
    events: list[Event],
) -> list[Node]:
    by_thread: dict[
        tuple[int, int],
        list[Event],
    ] = defaultdict(list)

    for event in events:
        by_thread[(event.pid, event.tid)].append(event)

    roots: list[Node] = []

    for thread_events in by_thread.values():
        thread_events.sort(
            key=lambda event: (
                event.start,
                -event.end,
            )
        )

        stack: list[Node] = []

        for event in thread_events:
            while (
                stack
                and event.start >= stack[-1].end
            ):
                stack.pop()

            node = Node(
                name=event.name,
                start=event.start,
                end=event.end,
                pid=event.pid,
                tid=event.tid,
                ph=event.ph,
                args=event.args,
            )

            if stack:
                parent = stack[-1]

                if event.end <= parent.end:
                    parent.children.append(node)
                else:
                    roots.append(node)
                    stack.clear()
                    stack.append(node)
                    continue
            else:
                roots.append(node)

            stack.append(node)

    return roots


def flatten_nodes(
    roots: list[Node],
) -> list[Node]:
    result: list[Node] = []

    stack = list(reversed(roots))

    while stack:
        node = stack.pop()
        result.append(node)

        for child in reversed(node.children):
            stack.append(child)

    return result


def find_call_path(
    target: Node,
    roots: list[Node],
) -> list[Node]:
    def visit(
        node: Node,
        path: list[Node],
    ) -> list[Node] | None:
        current = path + [node]

        if node is target:
            return current

        for child in node.children:
            found = visit(child, current)

            if found:
                return found

        return None

    for root in roots:
        found = visit(root, [])

        if found:
            return found

    return [target]


def find_matching_node(
    event: Event,
    roots: list[Node],
) -> Node | None:
    """
    Find the Node corresponding to an Event.

    Multiple events can have identical properties, so prefer the
    exact object identity where possible and otherwise use the
    narrowest matching interval.
    """

    candidates: list[Node] = []

    for node in flatten_nodes(roots):
        if (
            node.name == event.name
            and node.start == event.start
            and node.end == event.end
            and node.pid == event.pid
            and node.tid == event.tid
            and node.ph == event.ph
        ):
            candidates.append(node)

    if not candidates:
        return None

    return candidates[0]


def print_call_tree(
    node: Node,
    roots: list[Node],
    max_depth: int = MAX_TREE_DEPTH,
) -> None:
    path = find_call_path(node, roots)
    path = path[-max_depth:]

    for depth, item in enumerate(path):
        indent = "  " * depth

        print(
            f"{indent}→ {item.name} ({ms(item.duration)})"
        )


# ---------------------------------------------------------------------------
# CPU ranking
# ---------------------------------------------------------------------------

def is_noise_operation(
    name: str,
) -> bool:
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


# ---------------------------------------------------------------------------
# Embedded CPU profiles
# ---------------------------------------------------------------------------

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

    result: list[float] = []

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


def extract_profile_operations(
    profiles: list[dict[str, Any]],
) -> list[ProfileOperation]:
    operations: dict[
        tuple[str, str, int | None, int | None],
        ProfileOperation,
    ] = {}

    for profile in profiles:
        nodes = profile_nodes(profile)
        samples = profile_samples(profile)
        deltas = profile_time_deltas(profile)

        if not nodes or not samples:
            continue

        nodes_by_id = node_by_id(nodes)
        parents = profile_parent_map(nodes)

        profile_seen: set[
            tuple[str, str, int | None, int | None]
        ] = set()

        for index, sample in enumerate(samples):
            node_id = safe_int(sample)
            node = nodes_by_id.get(node_id)

            if not node:
                continue

            frame = get_node_call_frame(node)

            name = (
                frame.get("functionName")
                or node.get("name")
                or "(anonymous)"
            )

            name = str(name)
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

            delta_us = 0.0

            if index < len(deltas):
                delta_us = max(0.0, deltas[index])

            duration_ms = delta_us / 1000.0

            if duration_ms < MIN_PROFILE_DURATION_MS:
                continue

            key = (
                name,
                url,
                line_value,
                column_value,
            )

            item = operations.get(key)

            if item is None:
                item = ProfileOperation(
                    name=name,
                    url=url,
                    line=line_value,
                    column=column_value,
                    tree=profile_call_tree(
                        node_id,
                        nodes_by_id,
                        parents,
                    ),
                )

                operations[key] = item

            item.duration_ms += duration_ms
            item.samples += 1

            if key not in profile_seen:
                item.profile_count += 1
                profile_seen.add(key)

    return list(operations.values())


# ---------------------------------------------------------------------------
# WebGL / shader profile analysis
# ---------------------------------------------------------------------------

def webgl_profile_operations(
    operations: list[ProfileOperation],
) -> list[ProfileOperation]:
    result: list[ProfileOperation] = []

    for operation in operations:
        category = normalize_category(operation.name)

        if category in {
            "WebGL",
            "SHADER / PROGRAM",
            "THREE.JS RENDERER",
        }:
            result.append(operation)

    result.sort(
        key=lambda item: (
            item.duration_ms,
            item.samples,
            item.profile_count,
        ),
        reverse=True,
    )

    return result


def webgl_trace_events(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for event in events:
        name = event_name(event)

        if name.startswith("v8.compile"):
            continue

        category = normalize_category(name)

        if category not in {
            "WebGL",
            "SHADER / PROGRAM",
            "THREE.JS RENDERER",
        }:
            continue

        duration_us = float(event.get("dur") or 0.0)

        result.append(
            {
                "name": name,
                "category": category,
                "duration_ms": duration_us / 1000.0,
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
            item["total"],
            item["calls"],
        ),
        reverse=True,
    )

    return result[:TOP_N]


# ---------------------------------------------------------------------------
# GPU
# ---------------------------------------------------------------------------

def gpu_events(
    events: list[Event],
) -> list[Event]:
    result: list[Event] = []

    for event in events:
        lower = event.name.lower()

        if (
            "gputask" in lower
            or event.name in {
                "GpuTask",
                "GPUTask",
            }
        ):
            result.append(event)

    result.sort(
        key=lambda event: event.duration,
        reverse=True,
    )

    return result


def aggregate_gpu(
    events: list[Event],
) -> dict[str, Any]:
    """
    Aggregate GPU task intervals.

    Event has duration, but deliberately does not have self_time.
    GPU events are leaf trace intervals here, so their self time is
    equivalent to their duration.
    """

    if not events:
        return {
            "calls": 0,
            "total": 0.0,
            "self": 0.0,
        }

    total = sum(
        event.duration
        for event in events
    )

    return {
        "calls": len(events),
        "total": total,
        "self": total,
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def print_cpu_operations(
    roots: list[Node],
) -> None:
    print()
    print("TOP 5 REAL CPU OPERATIONS")
    print("═" * 72)

    operations = top_real_cpu_operations(roots)

    if not operations:
        print("No real CPU operations found.")
        return

    for index, node in enumerate(operations, 1):
        print(
            f"{index}. {ms(node.self_time)} self  {node.name}"
        )
        print("   CPU")
        print(
            f"   Total: {ms(node.duration)}   "
            f"Self: {ms(node.self_time)}"
        )
        print(
            f"   pid={node.pid} tid={node.tid} ph={node.ph}"
        )
        print()
        print("   Call tree:")
        print_call_tree(node, roots)
        print()


def print_aggregate_cpu(
    roots: list[Node],
) -> None:
    print()
    print("TOP 5 AGGREGATED REAL CPU OPERATIONS")
    print("═" * 72)

    operations = aggregate_cpu(roots)

    if not operations:
        print("No aggregated CPU operations found.")
        return

    for index, item in enumerate(operations, 1):
        print(
            f"{index}. {ms(item['self'])} self  "
            f"{item['node'].name}"
        )
        print(
            f"   Total: {ms(item['total'])}   "
            f"Calls: {item['calls']}   CPU"
        )


def print_webgl_profiles(
    operations: list[ProfileOperation],
) -> None:
    print()
    print("TOP 5 WEBGL / THREE.JS / SHADER OPERATIONS")
    print("═" * 72)

    items = webgl_profile_operations(operations)

    if not items:
        print(
            "No WebGL/Three.js/shader functions "
            "found in CPU profiles."
        )
        return

    for index, item in enumerate(items[:TOP_N], 1):
        category = normalize_category(item.name)

        print(f"{index}. {item.name}")

        print(
            f"   {category}   "
            f"Profile CPU: {ms(item.duration_ms)}   "
            f"Samples: {item.samples}   "
            f"Profiles: {item.profile_count}"
        )

        if item.url:
            location = item.url

            if item.line is not None:
                location += f":{item.line}"

                if item.column is not None:
                    location += f":{item.column}"

            print(f"   Location: {location}")

        if item.tree:
            print()
            print("   Profile call tree:")

            for depth, name in enumerate(
                item.tree[-MAX_TREE_DEPTH:]
            ):
                print(
                    f"{'  ' * depth}   → {name}"
                )

        print()


def print_webgl_trace(
    raw_events: list[dict[str, Any]],
) -> None:
    print()
    print("TOP 5 TRACE WEBGL / SHADER EVENTS")
    print("═" * 72)

    events = webgl_trace_events(raw_events)

    if not events:
        print(
            "No WebGL/Three.js/shader trace events found."
        )
        return

    aggregate = aggregate_webgl_trace(events)

    for index, item in enumerate(aggregate, 1):
        print(f"{index}. {item['name']}")
        print(
            f"   {item['category']}   "
            f"Occurrences: {item['calls']}   "
            f"Total: {ms(item['total'])}"
        )


def print_gpu(
    gpu: list[Event],
    roots: list[Node],
) -> None:
    print()
    print("GPU SUMMARY")
    print("═" * 72)

    aggregate = aggregate_gpu(gpu)

    if not gpu:
        print("No GPU tasks found.")
        return

    print(
        f"Total GPU task time: {ms(aggregate['total'])}"
    )

    print(
        f"Total GPU task self: {ms(aggregate['self'])}"
    )

    print(
        f"GPU task calls: {aggregate['calls']}"
    )

    print()
    print("TOP 5 GPU TASKS")
    print("─" * 72)

    for index, event in enumerate(gpu[:TOP_N], 1):
        print(
            f"{index}. {ms(event.duration)}  {event.name}"
        )

        print("   GPU")

        print(
            f"   pid={event.pid} "
            f"tid={event.tid} "
            f"ph={event.ph}"
        )

        print(
            f"   Total: {ms(event.duration)}"
        )

        print()
        print("   Call tree:")

        node = find_matching_node(
            event,
            roots,
        )

        if node is not None:
            print_call_tree(node, roots)
        else:
            print(
                f"   → {event.name} "
                f"({ms(event.duration)})"
            )
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load_trace(
    path: Path,
) -> list[dict[str, Any]]:
    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        data = json.load(handle)

    if isinstance(data, dict):
        events = data.get("traceEvents")

        if isinstance(events, list):
            return events

    if isinstance(data, list):
        return data

    raise ValueError(
        "Unsupported trace format: expected "
        "{traceEvents: [...]} or a trace event list."
    )


def main() -> None:
    if len(sys.argv) != 2:
        print(
            f"Usage: {sys.argv[0]} TRACE.json",
            file=sys.stderr,
        )
        raise SystemExit(2)

    path = Path(sys.argv[1])

    if not path.exists():
        print(
            f"Trace file not found: {path}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    print("===================================")
    print(f"Running Analyze Trace v{VERSION}")
    print("===================================")
    print()
    print(f"Reading: {path}")
    print()

    raw_events = load_trace(path)

    print("TRACE ANALYSIS")
    print("═" * 72)
    print(f"Events: {len(raw_events):,}")
    print()
    print("Building X + B/E call tree...")

    x_events = parse_timed_events(raw_events)
    be_events = build_be_events(raw_events)

    timed_events = x_events + be_events

    print(
        f"Timed intervals: {len(timed_events):,}"
    )

    print()
    print("Calculating call tree...")

    roots = build_call_tree(timed_events)

    print_cpu_operations(roots)
    print_aggregate_cpu(roots)

    print()
    print("Extracting embedded CPU profiles...")

    profiles = list(
        iter_cpu_profiles(raw_events)
    )

    print(
        f"CPU profiles: {len(profiles):,}"
    )

    profile_operations = extract_profile_operations(
        profiles
    )

    print_webgl_profiles(
        profile_operations
    )

    print_webgl_trace(
        raw_events
    )

    gpu = gpu_events(x_events)

    print_gpu(
        gpu,
        roots,
    )

    print()
    print("DONE")


if __name__ == "__main__":
    main()
