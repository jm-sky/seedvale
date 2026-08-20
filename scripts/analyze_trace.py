#!/usr/bin/env python3

import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field


VERSION = "v11"
TOP_N = 5


WEBGL_PATTERNS = (
    "WebGL",
    "webgl",
    "drawElements",
    "drawArrays",
    "drawElementsInstanced",
    "drawArraysInstanced",
    "uniform",
    "bindTexture",
    "texImage",
    "texSubImage",
    "createBuffer",
    "deleteBuffer",
    "bindBuffer",
    "bufferData",
    "bufferSubData",
    "createTexture",
    "deleteTexture",
    "createFramebuffer",
    "bindFramebuffer",
    "createRenderbuffer",
    "bindRenderbuffer",
    "viewport",
    "scissor",
    "clear",
)

SHADER_PATTERNS = (
    "compileShader",
    "linkProgram",
    "getShaderInfoLog",
    "getProgramInfoLog",
    "shaderSource",
    "attachShader",
    "detachShader",
    "validateProgram",
    "createShader",
    "createProgram",
    "WebGLProgram",
    "WebGLShader",
)

GPU_NAMES = {
    "GPUTask",
}


@dataclass
class Node:
    event: dict
    parent: "Node | None" = None
    children: list["Node"] = field(default_factory=list)

    @property
    def name(self):
        return self.event.get("name", "(anonymous)")

    @property
    def ts(self):
        return self.event.get("ts", 0)

    @property
    def dur(self):
        return self.event.get("dur", 0) or 0

    @property
    def end(self):
        return self.ts + self.dur


@dataclass
class Operation:
    name: str
    total_us: float = 0
    self_us: float = 0
    calls: int = 0
    samples: int = 0
    locations: set = field(default_factory=set)


def ms(us):
    return us / 1000.0


def fmt_ms(us):
    return f"{ms(us):,.1f} ms"


def event_location(event):
    args = event.get("args", {})
    data = args.get("data", {}) if isinstance(args, dict) else {}

    url = data.get("url")
    line = data.get("lineNumber")
    column = data.get("columnNumber")

    if not url:
        return None

    if line is not None and column is not None:
        return f"{url}:{line}:{column}"

    if line is not None:
        return f"{url}:{line}"

    return url


def classify(name):
    lower = name.lower()

    if name in GPU_NAMES or "gpu" in lower:
        return "GPU"

    if any(p.lower() in lower for p in SHADER_PATTERNS):
        return "WebGL / Shader"

    if any(p.lower() in lower for p in WEBGL_PATTERNS):
        return "WebGL"

    return "CPU"


def is_webgl(name):
    lower = name.lower()

    return (
        any(p.lower() in lower for p in WEBGL_PATTERNS)
        or any(p.lower() in lower for p in SHADER_PATTERNS)
    )


def is_shader(name):
    lower = name.lower()
    return any(p.lower() in lower for p in SHADER_PATTERNS)


def build_intervals(events):
    intervals = []
    stacks = defaultdict(list)

    for index, event in enumerate(events):
        ph = event.get("ph")

        if ph == "X":
            dur = event.get("dur", 0) or 0

            if dur > 0:
                intervals.append(
                    {
                        "event": event,
                        "index": index,
                        "start": event.get("ts", 0),
                        "end": event.get("ts", 0) + dur,
                    }
                )

        elif ph == "B":
            key = (
                event.get("pid"),
                event.get("tid"),
            )

            stacks[key].append(
                (event, index)
            )

        elif ph == "E":
            key = (
                event.get("pid"),
                event.get("tid"),
            )

            stack = stacks.get(key)

            if not stack:
                continue

            start_event, start_index = stack.pop()

            start = start_event.get("ts", 0)
            end = event.get("ts", start)

            if end <= start:
                continue

            synthetic = dict(start_event)
            synthetic["dur"] = end - start
            synthetic["_begin_index"] = start_index
            synthetic["_end_index"] = index

            intervals.append(
                {
                    "event": synthetic,
                    "index": start_index,
                    "start": start,
                    "end": end,
                }
            )

    return intervals


def build_call_tree(intervals):
    by_thread = defaultdict(list)

    for item in intervals:
        event = item["event"]

        key = (
            event.get("pid"),
            event.get("tid"),
        )

        by_thread[key].append(item)

    roots = []

    for items in by_thread.values():
        items.sort(
            key=lambda x: (
                x["start"],
                -x["end"],
            )
        )

        stack = []

        for item in items:
            while stack and item["start"] >= stack[-1].end:
                stack.pop()

            while stack and item["end"] > stack[-1].end:
                stack.pop()

            node = Node(
                event=item["event"]
            )

            if stack:
                node.parent = stack[-1]
                stack[-1].children.append(node)
            else:
                roots.append(node)

            stack.append(node)

    return roots


def calculate_self_time(node):
    if not node.children:
        return node.dur

    children = sorted(
        (
            (child.ts, child.end)
            for child in node.children
        ),
        key=lambda x: x[0],
    )

    covered = 0
    current_start = None
    current_end = None

    for start, end in children:
        if current_start is None:
            current_start = start
            current_end = end
            continue

        if start <= current_end:
            current_end = max(
                current_end,
                end,
            )
        else:
            covered += (
                current_end -
                current_start
            )

            current_start = start
            current_end = end

    if current_start is not None:
        covered += (
            current_end -
            current_start
        )

    return max(
        0,
        node.dur - covered,
    )


def collect_operations(roots):
    operations = {}

    def visit(node):
        name = node.name

        operation = operations.setdefault(
            name,
            Operation(name=name),
        )

        operation.total_us += node.dur
        operation.self_us += calculate_self_time(node)
        operation.calls += 1

        location = event_location(
            node.event
        )

        if location:
            operation.locations.add(
                location
            )

        for child in node.children:
            visit(child)

    for root in roots:
        visit(root)

    return operations


def find_path(node):
    path = []
    current = node

    while current:
        path.append(current)
        current = current.parent

    return list(reversed(path))


def print_tree(node, max_depth=8):
    path = find_path(node)

    if len(path) > max_depth:
        path = path[-max_depth:]

    for depth, item in enumerate(path):
        indent = "  " * depth

        print(
            f"{indent}→ {item.name} "
            f"({fmt_ms(item.dur)})"
        )


def top_nodes(roots, predicate):
    result = []

    def visit(node):
        if predicate(node):
            result.append(node)

        for child in node.children:
            visit(child)

    for root in roots:
        visit(root)

    result.sort(
        key=lambda node: (
            calculate_self_time(node),
            node.dur,
        ),
        reverse=True,
    )

    return result[:TOP_N]


def print_cpu(roots):
    print()
    print("TOP 5 REAL CPU OPERATIONS")
    print(
        "════════════════════════════════════════════════════════════════════════"
    )

    nodes = top_nodes(
        roots,
        lambda node:
            classify(node.name) == "CPU"
            and node.name not in GPU_NAMES,
    )

    for index, node in enumerate(nodes, 1):
        self_us = calculate_self_time(node)

        print(
            f"{index}. {fmt_ms(self_us)} self  "
            f"{node.name}"
        )

        print("   CPU")

        print(
            f"   Total: {fmt_ms(node.dur)}   "
            f"Self: {fmt_ms(self_us)}"
        )

        event = node.event

        print(
            f"   pid={event.get('pid')} "
            f"tid={event.get('tid')} "
            f"ph={event.get('ph')}"
        )

        location = event_location(event)

        if location:
            print(
                f"   Location: {location}"
            )

        print()
        print("   Call tree:")

        print_tree(node)

        print()


def print_aggregated_cpu(operations):
    print()
    print(
        "TOP 5 AGGREGATED REAL CPU OPERATIONS"
    )
    print(
        "════════════════════════════════════════════════════════════════════════"
    )

    ranked = [
        operation
        for operation in operations.values()
        if classify(operation.name) == "CPU"
        and operation.name not in GPU_NAMES
    ]

    ranked.sort(
        key=lambda operation:
            operation.self_us,
        reverse=True,
    )

    for index, operation in enumerate(
        ranked[:TOP_N],
        1,
    ):
        print(
            f"{index}. "
            f"{fmt_ms(operation.self_us)} self  "
            f"{operation.name}"
        )

        print(
            f"   Total: "
            f"{fmt_ms(operation.total_us)}   "
            f"Calls: {operation.calls}   CPU"
        )

        if operation.locations:
            print(
                f"   Location: "
                f"{sorted(operation.locations)[0]}"
            )

        print()


def extract_cpu_profiles(events):
    profiles = []

    for event in events:
        args = event.get("args")

        if not isinstance(args, dict):
            continue

        data = args.get("data")

        if not isinstance(data, dict):
            continue

        profile = data.get(
            "cpuProfile"
        )

        if isinstance(profile, dict):
            profiles.append(
                {
                    "event": event,
                    "profile": profile,
                }
            )

    return profiles


def frame_name(node):
    call_frame = node.get(
        "callFrame",
        {},
    )

    if not isinstance(call_frame, dict):
        return "(anonymous)"

    return (
        call_frame.get("functionName")
        or "(anonymous)"
    )


def frame_location(node):
    call_frame = node.get(
        "callFrame",
        {},
    )

    if not isinstance(call_frame, dict):
        return None

    url = call_frame.get("url")

    if not url:
        return None

    line = call_frame.get(
        "lineNumber"
    )

    column = call_frame.get(
        "columnNumber"
    )

    if line is not None and column is not None:
        return (
            f"{url}:"
            f"{line + 1}:"
            f"{column + 1}"
        )

    if line is not None:
        return (
            f"{url}:"
            f"{line + 1}"
        )

    return url


def extract_profile_operations(profiles):
    """
    Count WebGL/shader functions found in
    embedded V8 CPU profile nodes.

    IMPORTANT:
    We intentionally do NOT fabricate duration here.

    V8 cpuProfile nodes provide reliable function
    identity and location, but a node's presence is
    not itself proof of a specific elapsed duration.
    """

    operations = {}

    for profile_index, profile_info in enumerate(
        profiles
    ):
        profile = profile_info["profile"]

        nodes = profile.get(
            "nodes",
            [],
        )

        if not isinstance(nodes, list):
            continue

        seen = set()

        for node in nodes:
            if not isinstance(node, dict):
                continue

            name = frame_name(node)

            if not is_webgl(name):
                continue

            location = frame_location(node)

            key = (
                name,
                location,
            )

            operation = operations.setdefault(
                key,
                {
                    "name": name,
                    "location": location,
                    "occurrences": 0,
                    "profiles": set(),
                },
            )

            operation["occurrences"] += 1
            operation["profiles"].add(
                profile_index
            )

            seen.add(key)

    return operations


def print_webgl_shader_operations(
    profile_operations,
):
    print()
    print(
        "TOP 5 WEBGL / SHADER OPERATIONS"
    )
    print(
        "════════════════════════════════════════════════════════════════════════"
    )

    ranked = sorted(
        profile_operations.values(),
        key=lambda operation: (
            operation["occurrences"],
            len(operation["profiles"]),
        ),
        reverse=True,
    )

    if not ranked:
        print(
            "No WebGL/shader functions found "
            "in CPU profiles."
        )
        return

    for index, operation in enumerate(
        ranked[:TOP_N],
        1,
    ):
        name = operation["name"]

        category = (
            "SHADER / PROGRAM"
            if is_shader(name)
            else "WebGL"
        )

        print(
            f"{index}. {name}"
        )

        print(
            f"   {category}   "
            f"Occurrences: "
            f"{operation['occurrences']}   "
            f"Profiles: "
            f"{len(operation['profiles'])}"
        )

        if operation["location"]:
            print(
                f"   Location: "
                f"{operation['location']}"
            )

        print()


def print_gpu_tasks(roots):
    print()
    print("TOP 5 GPU TASKS")
    print(
        "════════════════════════════════════════════════════════════════════════"
    )

    nodes = top_nodes(
        roots,
        lambda node:
            node.name in GPU_NAMES,
    )

    if not nodes:
        print("No GPU tasks found.")
        return

    for index, node in enumerate(
        nodes,
        1,
    ):
        print(
            f"{index}. "
            f"{fmt_ms(node.dur)}  "
            f"{node.name}"
        )

        print("   GPU")

        event = node.event

        print(
            f"   pid={event.get('pid')} "
            f"tid={event.get('tid')} "
            f"ph={event.get('ph')}"
        )

        print(
            f"   Total: {fmt_ms(node.dur)}"
        )

        print()
        print("   Call tree:")

        print_tree(node)

        print()


def main():
    if len(sys.argv) != 2:
        print(
            f"Usage: python {sys.argv[0]} TRACE.json",
            file=sys.stderr,
        )
        sys.exit(1)

    path = sys.argv[1]

    print()
    print("TRACE ANALYSIS")
    print(
        "════════════════════════════════════════════════════════════════════════"
    )

    print(
        f"Events: ",
        end="",
    )

    with open(
        path,
        "r",
        encoding="utf-8",
    ) as file:
        trace = json.load(file)

    events = trace.get(
        "traceEvents",
        [],
    )

    print(
        f"{len(events):,}"
    )

    print()
    print(
        "Building X + B/E call tree..."
    )

    intervals = build_intervals(
        events
    )

    print(
        f"Timed intervals: "
        f"{len(intervals):,}"
    )

    print()
    print(
        "Calculating call tree..."
    )

    roots = build_call_tree(
        intervals
    )

    operations = collect_operations(
        roots
    )

    print_cpu(roots)
    print_aggregated_cpu(
        operations
    )

    print()
    print(
        "Extracting embedded CPU profiles..."
    )

    profiles = extract_cpu_profiles(
        events
    )

    print(
        f"CPU profiles: "
        f"{len(profiles):,}"
    )

    profile_operations = (
        extract_profile_operations(
            profiles
        )
    )

    print_webgl_shader_operations(
        profile_operations
    )

    print_gpu_tasks(
        roots
    )

    print()
    print("DONE")


if __name__ == "__main__":
    main()
