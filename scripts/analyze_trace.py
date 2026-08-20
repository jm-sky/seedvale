#!/usr/bin/env python3

import json
import sys
from collections import defaultdict
from pathlib import Path


WRAPPER_NAMES = {
    "RunTask",
    "RunMicrotasks",
    "FunctionCall",
    "EvaluateScript",
    "V8.Execute",
    "V8.RunMicrotasks",
    "EventDispatch",
    "AnimationFrame",
    "TimerFire",
    "ThreadControllerImpl::RunTask",
}

GPU_KEYWORDS = (
    "getProgramInfoLog",
    "getShaderInfoLog",
    "compileShader",
    "linkProgram",
    "createShader",
    "createProgram",
    "deleteShader",
    "deleteProgram",
    "shaderSource",
    "drawArrays",
    "drawElements",
    "drawArraysInstanced",
    "drawElementsInstanced",
    "WebGL",
    "Shader",
    "GPU",
)

CPU_RENDER_KEYWORDS = (
    "render",
    "Render",
    "Renderer",
    "EffectComposer",
    "WebGLRenderer",
)

MAX_PATH_DEPTH = 12


def duration_us(event):
    value = event.get("dur")
    return value if isinstance(value, (int, float)) and value > 0 else 0


def duration_ms(us):
    return us / 1000.0


def name(event):
    return str(event.get("name", "<unknown>"))


def category(event):
    n = name(event)

    if any(keyword in n for keyword in GPU_KEYWORDS):
        return "GPU / WebGL / Shader"

    if any(keyword in n for keyword in CPU_RENDER_KEYWORDS):
        return "CPU / Rendering"

    return "CPU"


def is_wrapper(event):
    return name(event) in WRAPPER_NAMES


def event_location(event):
    args = event.get("args") or {}
    data = args.get("data") or {}

    url = (
        data.get("url")
        or data.get("scriptName")
        or data.get("scriptUrl")
    )

    function = (
        data.get("functionName")
        or data.get("function")
    )

    if function and url:
        return f"{function} ({url})"

    if url:
        return str(url)

    if function:
        return str(function)

    return None


def format_event(event):
    n = name(event)
    location = event_location(event)

    if location:
        return f"{n} — {location}"

    return n


def build_children(events):
    """
    Build a nesting tree for duration events using timestamp ranges.

    Chrome trace events are generally represented as:
        parent [----------------]
          child [-----]
          child       [----]

    We use a stack ordered by timestamp and duration.
    """
    indexed = []

    for index, event in enumerate(events):
        dur = duration_us(event)

        if dur <= 0:
            continue

        ts = event.get("ts")

        if not isinstance(ts, (int, float)):
            continue

        indexed.append(
            (
                ts,
                ts + dur,
                index,
                event,
            )
        )

    indexed.sort(
        key=lambda item: (
            item[0],
            -item[1],
        )
    )

    children = defaultdict(list)
    stack = []

    for start, end, index, event in indexed:
        while stack and start >= stack[-1][1]:
            stack.pop()

        if stack:
            parent_index = stack[-1][2]

            # Only create a parent-child relation when the child
            # is completely contained in the parent.
            if end <= stack[-1][1]:
                children[parent_index].append(index)

        stack.append((start, end, index))

    return children


def compute_self_time(events, children):
    self_times = {}

    for index, event in enumerate(events):
        total = duration_us(event)

        if total <= 0:
            continue

        child_total = sum(
            duration_us(events[child])
            for child in children.get(index, [])
        )

        self_times[index] = max(0, total - child_total)

    return self_times


def build_parent_map(children):
    parents = {}

    for parent, child_list in children.items():
        for child in child_list:
            parents[child] = parent

    return parents


def build_path(index, events, parents):
    path = []
    current = index
    seen = set()

    while current in parents and current not in seen:
        seen.add(current)
        path.append(current)
        current = parents[current]

        if len(path) >= MAX_PATH_DEPTH:
            break

    path.reverse()
    path.append(index)

    # Remove duplicates while preserving order.
    result = []
    seen = set()

    for item in path:
        if item not in seen:
            result.append(item)
            seen.add(item)

    return result


def print_path(index, events, parents):
    path = build_path(index, events, parents)

    for depth, item in enumerate(path):
        event = events[item]

        indent = "  " * depth
        duration = duration_ms(duration_us(event))

        print(
            f"   {indent}→ {format_event(event)} "
            f"({duration:,.1f} ms)"
        )


def main():
    if len(sys.argv) != 2:
        print(
            f"Usage: {Path(sys.argv[0]).name} TRACE.json",
            file=sys.stderr,
        )
        sys.exit(1)

    path = Path(sys.argv[1])

    print(f"Reading: {path}")

    with path.open("r", encoding="utf-8") as f:
        trace = json.load(f)

    events = trace.get("traceEvents", [])

    timed_count = sum(
        1 for event in events
        if duration_us(event) > 0
    )

    print()
    print("TRACE ANALYSIS")
    print("═" * 72)
    print(f"Events:       {len(events):,}")
    print(f"Timed events: {timed_count:,}")

    print()
    print("Building call tree...")

    children = build_children(events)
    parents = build_parent_map(children)
    self_times = compute_self_time(events, children)

    # ------------------------------------------------------------
    # TOP INDIVIDUAL OPERATIONS
    # ------------------------------------------------------------

    candidates = []

    for index, event in enumerate(events):
        total = duration_us(event)

        if total <= 0:
            continue

        n = name(event)

        # Wrapper events are useful for tree reconstruction but
        # not useful as the primary diagnostic result.
        if is_wrapper(event):
            continue

        candidates.append(
            (
                total,
                self_times.get(index, total),
                index,
                event,
            )
        )

    candidates.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    print()
    print("TOP 5 WORST OPERATIONS")
    print("═" * 72)

    for rank, (total, self_time, index, event) in enumerate(
        candidates[:5],
        1,
    ):
        print()
        print(
            f"{rank}. {duration_ms(total):,.1f} ms  "
            f"{format_event(event)}"
        )
        print(f"   {category(event)}")
        print(
            f"   Total: {duration_ms(total):,.1f} ms"
            f"   Self: {duration_ms(self_time):,.1f} ms"
        )
        print(
            f"   pid={event.get('pid')} "
            f"tid={event.get('tid')} "
            f"ph={event.get('ph')}"
        )

        print()
        print("   Call tree:")
        print_path(index, events, parents)

    # ------------------------------------------------------------
    # TOP SELF TIME
    # ------------------------------------------------------------

    self_candidates = []

    for index, event in enumerate(events):
        self_time = self_times.get(index, 0)

        if self_time <= 0:
            continue

        if is_wrapper(event):
            continue

        self_candidates.append(
            (
                self_time,
                duration_us(event),
                index,
                event,
            )
        )

    self_candidates.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    print()
    print("TOP 5 BY SELF TIME")
    print("═" * 72)

    for rank, (self_time, total, index, event) in enumerate(
        self_candidates[:5],
        1,
    ):
        print()
        print(
            f"{rank}. {duration_ms(self_time):,.1f} ms self  "
            f"{format_event(event)}"
        )
        print(
            f"   Total: {duration_ms(total):,.1f} ms"
            f"   {category(event)}"
        )

        print("   Call tree:")
        print_path(index, events, parents)

    # ------------------------------------------------------------
    # AGGREGATED OPERATIONS
    # ------------------------------------------------------------

    aggregated = defaultdict(
        lambda: {
            "total": 0,
            "self": 0,
            "count": 0,
            "category": "CPU",
        }
    )

    for index, event in enumerate(events):
        if is_wrapper(event):
            continue

        total = duration_us(event)

        if total <= 0:
            continue

        key = name(event)

        aggregated[key]["total"] += total
        aggregated[key]["self"] += self_times.get(index, total)
        aggregated[key]["count"] += 1
        aggregated[key]["category"] = category(event)

    aggregated_top = sorted(
        aggregated.items(),
        key=lambda item: item[1]["self"],
        reverse=True,
    )[:5]

    print()
    print("TOP 5 OPERATIONS BY AGGREGATED SELF TIME")
    print("═" * 72)

    for rank, (operation, data) in enumerate(
        aggregated_top,
        1,
    ):
        print(
            f"{rank}. {duration_ms(data['self']):,.1f} ms self  "
            f"{operation}"
        )
        print(
            f"   Total: {duration_ms(data['total']):,.1f} ms"
            f"   Calls: {data['count']:,}"
            f"   {data['category']}"
        )


if __name__ == "__main__":
    main()
