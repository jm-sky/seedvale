#!/usr/bin/env python3
"""
Seedvale Chrome Trace Analyzer v16

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

Chrome trace timestamps/durations are stored in microseconds.
Internally Event times are normalized to milliseconds.

Usage:
    ./scripts/analyze_trace.py trace.json
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


VERSION = "16"

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

    @property
    def self_time(self) -> float:
        # Event is normally a leaf in the GPU list, but this also works
        # for events which have children when represented as Nodes.
        return self.duration


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
    category: str
    url: str = ""
    line: int | None = None
    column: int | None = None
    duration_ms: float = 0.0
    samples: int = 0
    profile_count: int = 0
    node_occurrences: int = 0
    tree: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

config: dict = {
    "instant_output": False,
    "output_to_stdout": True,
    "output_to_file": True,
}

lines: list[str] = []


def emit(line: str = "", stdout_only: bool = True) -> None:
    """
    Saves a line of text to the output buffer.
    """
    if not stdout_only:
        lines.append(line + '  ')

    if config["instant_output"]:
        print(line)


def output(path: Path) -> None:
    """
    Saves the output buffer to a file or stdout.
    """
    text = "\n".join(lines)

    if config["output_to_file"]:
        output_dir = Path("docs/performance/trace-results")
        filename: str = path.name.replace(".json", ".md")
        output_path = Path(output_dir, filename)
        print('------------------------------')
        print(f'Saving to "{output_path}')
        print('------------------------------')
        output_path.write_text(text + "\n", encoding="utf-8")


def md_title(text: str) -> str:
    return f"# {text}"


def md_header(text: str) -> str:
    return f"## {text}"


def md_subheader(text: str) -> str:
    return f"### {text}"


def md_list(items: list[str], level: int = 1) -> str:
    return "\n".join([f"{'-' * level} {item}" for item in items])


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
        (a, b)
        for a, b in intervals
        if b > a
    )

    if not ordered:
        return []

    result: list[tuple[float, float]] = [ordered[0]]

    for start, end in ordered[1:]:
        prev_start, prev_end = result[-1]

        if start <= prev_end:
            result[-1] = (
                prev_start,
                max(prev_end, end),
            )
        else:
            result.append((start, end))

    return result


def normalize_trace_time(value: Any) -> float:
    """
    Chrome trace timestamps/durations are microseconds.

    Internally all Event start/end values are milliseconds.
    """
    return float(value) / 1000.0


# ---------------------------------------------------------------------------
# Categorization
# ---------------------------------------------------------------------------

WEBGL_FUNCTIONS = {
    "bindtexture",
    "bindbuffer",
    "bufferdata",
    "buffersubdata",
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
    "uniform1f",
    "uniform1fv",
    "uniform1i",
    "uniform1iv",
    "uniform2f",
    "uniform2fv",
    "uniform2i",
    "uniform2iv",
    "uniform3f",
    "uniform3fv",
    "uniform3i",
    "uniform3iv",
    "uniform4f",
    "uniform4fv",
    "uniform4i",
    "uniform4iv",
    "uniformmatrix2fv",
    "uniformmatrix3fv",
    "uniformmatrix4fv",
    "viewport",
    "clear",
    "blendfunc",
    "blendfuncseparate",
    "depthfunc",
    "cullface",
    "scissor",
    "colorMask".lower(),
}

SHADER_FUNCTIONS = {
    "compile",
    "compileShader".lower(),
    "linkprogram",
    "getuniforms",
    "getprograminfo",
    "getprograminfolog",
    "getshaderinfo",
    "getshaderinfolog",
    "getshaderprecisionformat",
    "createprogram",
    "createshader",
    "deleteshader",
    "deleteprogram",
}


THREE_RENDERER_PREFIXES = (
    "webglrenderer.",
    "webglprogram.",
)

THREE_RENDERER_FUNCTIONS = {
    "renderbufferdirect",
    "renderobjects",
    "renderobject",
    "projectobject",
    "setprogram",
    "setmaterial",
    "setblending",
    "settexture2d",
    "settexturecube",
}


def normalize_category(name: str) -> str:
    lower = name.lower()

    if lower.startswith(THREE_RENDERER_PREFIXES):
        return "THREE.JS RENDERER"

    if lower in THREE_RENDERER_FUNCTIONS:
        return "THREE.JS RENDERER"

    if lower in WEBGL_FUNCTIONS:
        return "WebGL"

    if lower in SHADER_FUNCTIONS:
        return "SHADER / PROGRAM"

    if "webglrenderer." in lower:
        return "THREE.JS RENDERER"

    if "webglprogram." in lower:
        return "SHADER / PROGRAM"

    if lower.startswith("v8."):
        return "V8 / JS"

    return "Other"


def is_webgl_operation(name: str) -> bool:
    return normalize_category(name) in {
        "WebGL",
        "SHADER / PROGRAM",
        "THREE.JS RENDERER",
    }


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

        duration_ms = normalize_trace_time(dur)

        if duration_ms <= 0:
            continue

        start_ms = normalize_trace_time(ts)

        result.append(
            Event(
                name=event_name(raw),
                start=start_ms,
                end=start_ms + duration_ms,
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

        start_ms = normalize_trace_time(start)
        end_ms = normalize_trace_time(end)

        if end_ms <= start_ms:
            continue

        result.append(
            Event(
                name=event_name(begin),
                start=start_ms,
                end=end_ms,
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


def print_call_tree(
    node: Node,
    roots: list[Node],
    max_depth: int = MAX_TREE_DEPTH,
) -> None:
    path = find_call_path(node, roots)

    path = path[-max_depth:]

    for depth, item in enumerate(path):
        indent = "  " * depth

        emit(
            f"{indent}→ {item.name} "
            f"({ms(item.duration)})"
        )


# ---------------------------------------------------------------------------
# CPU ranking
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# WebGL / shader profile analysis
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Trace WebGL / renderer events
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# GPU
# ---------------------------------------------------------------------------

def gpu_events(
    events: list[Event],
) -> list[Event]:
    result = []

    for event in events:
        lower = event.name.lower()

        if lower == "gputask":
            result.append(event)

    result.sort(
        key=lambda event: event.duration,
        reverse=True,
    )

    return result


def aggregate_gpu(
    events: list[Event],
) -> dict[str, Any]:
    return {
        "calls": len(events),
        "total": sum(
            event.duration
            for event in events
        ),
        "self": sum(
            event.self_time
            for event in events
        ),
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def print_cpu_operations(
    roots: list[Node],
) -> None:
    emit()
    emit("-" * 72)
    emit(md_header("TOP 5 REAL CPU OPERATIONS"))
    emit("-" * 72, True)

    operations = top_real_cpu_operations(roots)

    if not operations:
        emit("No real CPU operations found.")
        return

    for index, node in enumerate(
        operations,
        1,
    ):
        emit(
            f"{index}. {ms(node.self_time)} self  "
            f"{node.name}"
        )

        emit("   CPU")

        emit(
            f"   Total: {ms(node.duration)}   "
            f"Self: {ms(node.self_time)}"
        )

        emit(
            f"   pid={node.pid} "
            f"tid={node.tid} "
            f"ph={node.ph}"
        )

        emit()
        emit("   Call tree:")

        print_call_tree(
            node,
            roots,
        )
        emit()


def print_aggregate_cpu(
    roots: list[Node],
) -> None:
    emit()
    emit("-" * 72)
    emit(md_header("TOP 5 AGGREGATED REAL CPU OPERATIONS"))
    emit("-" * 72, True)

    operations = aggregate_cpu(roots)

    if not operations:
        emit("No aggregated CPU operations found.")
        return

    for index, item in enumerate(
        operations,
        1,
    ):
        emit(
            f"{index}. {ms(item['self'])} self  "
            f"{item['node'].name}"
        )

        emit(
            f"   Total: {ms(item['total'])}   "
            f"Calls: {item['calls']}   CPU"
        )


def print_webgl_profiles(
    operations: list[ProfileOperation],
) -> None:
    emit()
    emit("-" * 72)
    emit(
        md_header("TOP 5 WEBGL / THREE.JS / SHADER OPERATIONS")
    )
    emit("-" * 72, True)

    items = webgl_profile_operations(
        operations
    )

    if not items:
        emit(
            "No WebGL/Three.js/shader functions "
            "found in CPU profiles."
        )
        return

    for index, item in enumerate(
        items[:TOP_N],
        1,
    ):
        emit(
            f"{index}. {item.name}"
        )

        emit(
            f"   {item.category}   "
            f"Profile CPU: {ms(item.duration_ms)}   "
            f"Samples: {item.samples}   "
            f"Profiles: {item.profile_count}   "
            f"Nodes: {item.node_occurrences}"
        )

        if item.url:
            location = item.url

            if item.line is not None:
                location += f":{item.line}"

                if item.column is not None:
                    location += f":{item.column}"

            emit(
                f"   Location: {location}"
            )

        if item.tree:
            emit()
            emit(
                "   Profile call tree:"
            )

            for depth, name in enumerate(
                item.tree[-MAX_TREE_DEPTH:]
            ):
                emit(
                    f"{'  ' * depth}   → {name}"
                )

        emit()


def print_webgl_trace(
    raw_events: list[dict[str, Any]],
) -> None:
    emit()
    emit("-" * 72)
    emit(
        md_header("TOP 5 TRACE WEBGL / SHADER EVENTS")
    )
    emit("-" * 72, True)

    events = webgl_trace_events(
        raw_events
    )

    if not events:
        emit(
            "No WebGL/Three.js/shader trace "
            "events found."
        )
        return

    aggregate = aggregate_webgl_trace(
        events
    )

    for index, item in enumerate(
        aggregate,
        1,
    ):
        emit(
            f"{index}. {item['name']}"
        )

        emit(
            f"   {item['category']}   "
            f"Occurrences: {item['calls']}   "
            f"Total: {ms(item['total'])}"
        )


def event_to_node(
    event: Event,
) -> Node:
    return Node(
        name=event.name,
        start=event.start,
        end=event.end,
        pid=event.pid,
        tid=event.tid,
        ph=event.ph,
        args=event.args,
    )


def print_gpu(
    gpu: list[Event],
    roots: list[Node],
) -> None:
    emit()
    emit("-" * 72)
    emit(md_header("GPU SUMMARY"))
    emit("-" * 72, True)

    aggregate = aggregate_gpu(gpu)

    if not gpu:
        emit("No GPU tasks found.")
        return

    emit(
        f"Total GPU task time: "
        f"{ms(aggregate['total'])}"
    )

    emit(
        f"Total GPU task self: "
        f"{ms(aggregate['self'])}"
    )

    emit(
        f"GPU task calls: "
        f"{aggregate['calls']}"
    )

    emit()
    emit("-" * 72)
    emit(md_subheader("TOP 5 GPU TASKS"))
    emit("-" * 72, True)

    for index, event in enumerate(
        gpu[:TOP_N],
        1,
    ):
        emit(
            f"{index}. {ms(event.duration)}  "
            f"{event.name}"
        )

        emit("   GPU")

        emit(
            f"   pid={event.pid} "
            f"tid={event.tid} "
            f"ph={event.ph}"
        )

        emit(
            f"   Total: {ms(event.duration)}"
        )

        emit()
        emit("   Call tree:")

        print_call_tree(
            event_to_node(event),
            roots,
        )

        emit()


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
    if len(sys.argv) < 2:
        print(
            f"Usage: {sys.argv[0]} TRACE.json",
            file=sys.stderr,
        )
        raise SystemExit(2)

    path = Path(sys.argv[1])

    if len(sys.argv) > 2:
        config["output_to_stdout"] = sys.argv[2] == "stdout"
        config["output_to_file"] = sys.argv[2] == "file"

    if config["output_to_stdout"]:
        config["instant_output"] = True

    if not path.exists():
        print(
            f"Trace file not found: {path}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    emit(
        "==================================="
    )
    emit(
        md_title(f"Running Analyze Trace v{VERSION}")
    )
    emit(
        "==================================="
    )
    emit()

    emit(
        f"Reading: {path}"
    )
    emit()

    raw_events = load_trace(path)

    emit("-" * 72)
    emit(md_header("TRACE ANALYSIS"))
    emit("-" * 72, True)
    emit(
        f"Events: {len(raw_events):,}"
    )

    emit()
    emit(
        "Building X + B/E call tree..."
    )

    x_events = parse_timed_events(
        raw_events
    )

    be_events = build_be_events(
        raw_events
    )

    timed_events = (
        x_events + be_events
    )

    emit(
        f"Timed intervals: "
        f"{len(timed_events):,}"
    )

    emit()
    emit(
        "Calculating call tree..."
    )

    roots = build_call_tree(
        timed_events
    )

    print_cpu_operations(
        roots
    )

    print_aggregate_cpu(
        roots
    )

    emit()
    emit(
        "Extracting embedded CPU profiles..."
    )

    profiles = list(
        iter_cpu_profiles(
            raw_events
        )
    )

    emit(
        f"CPU profiles: "
        f"{len(profiles):,}"
    )

    profile_operations = (
        extract_profile_operations(
            profiles
        )
    )

    print_webgl_profiles(
        profile_operations
    )

    print_webgl_trace(
        raw_events
    )

    gpu = gpu_events(
        x_events
    )

    print_gpu(
        gpu,
        roots
    )

    emit()
    emit("DONE")
    output(path)


if __name__ == "__main__":
    main()
