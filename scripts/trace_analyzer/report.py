"""
Markdown-ish report formatting: the output buffer (`emit`/`output`), text
helpers, and one `print_*` function per report section.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .call_tree import find_call_path
from .cpu_analysis import aggregate_cpu, top_real_cpu_operations
from .gpu_analysis import aggregate_gpu
from .hitch_analysis import (
    MIN_FRAMES_FOR_RELIABLE_STATS,
    FrameStats,
    compute_frame_stats,
    extract_frame_timestamps,
    top_long_cpu_tasks,
)
from .models import Event, MAX_TREE_DEPTH, Node, ProfileOperation, TOP_N
from .v8_profiles import application_profile_operations
from .webgl_analysis import (
    aggregate_webgl_trace,
    webgl_profile_operations,
    webgl_trace_events,
)


config: dict = {
    "instant_output": False,
    "output_to_stdout": True,
    "output_to_file": True,
}

lines: list[str] = []


def emit(line: str = "", stdout_only: bool = False) -> None:
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


# ---------------------------------------------------------------------------
# CPU operations
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


# ---------------------------------------------------------------------------
# CPU hitches / frame timing
# ---------------------------------------------------------------------------

def print_long_cpu_tasks(
    roots: list[Node],
    trace_start_ms: float | None,
) -> None:
    emit()
    emit("-" * 72)
    emit(md_header("TOP 5 LONG CPU TASKS / HITCHES"))
    emit("-" * 72, True)

    tasks = top_long_cpu_tasks(roots, TOP_N)

    if not tasks:
        emit("No CPU tasks found.")
        return

    emit(
        "Ranked by wall-clock duration of top-level (root) call-tree "
        "nodes — each root is a disjoint span on its own thread, so "
        "this list cannot double-count nested work. An event name "
        "such as \"RunTask\" is not assumed to be a hitch by itself; "
        "ranking is purely by duration."
    )
    emit()

    for index, node in enumerate(tasks, 1):
        start_label = (
            ms(node.start - trace_start_ms)
            if trace_start_ms is not None
            else ms(node.start)
        )

        emit(
            f"{index}. {ms(node.duration)}  "
            f"{node.name}"
        )

        emit("   CPU")

        emit(
            f"   Start: {start_label} (trace-relative)   "
            f"pid={node.pid} tid={node.tid} ph={node.ph}"
        )

        emit()
        emit("   Call tree:")

        print_call_tree(
            node,
            roots,
        )
        emit()


def print_frame_summary(
    raw_events: list[dict[str, Any]],
    trace_start_ms: float | None,
) -> None:
    emit()
    emit("-" * 72)
    emit(md_header("FRAME / HITCH SUMMARY"))
    emit("-" * 72, True)

    timestamps = extract_frame_timestamps(raw_events)
    stats = compute_frame_stats(timestamps)

    if stats is None:
        emit(
            "Not enough frame data to reliably compute frame timing "
            f"(found {len(timestamps)} \"DrawFrame\" marker(s) in the "
            f"dominant sequence, need at least "
            f"{MIN_FRAMES_FOR_RELIABLE_STATS + 1} to derive "
            f"{MIN_FRAMES_FOR_RELIABLE_STATS} frame durations)."
        )
        emit(
            "Not guessing FPS/frame-time numbers from insufficient "
            "data."
        )
        return

    _print_frame_stats(stats, trace_start_ms)


def _print_frame_stats(
    stats: FrameStats,
    trace_start_ms: float | None,
) -> None:
    max_start_label = (
        ms(stats.max_start_ms - trace_start_ms)
        if trace_start_ms is not None
        else ms(stats.max_start_ms)
    )

    emit(f"Frames: {stats.frame_count:,}")
    emit(f"Median frame duration: {ms(stats.median_ms)}")
    emit(f"Average frame duration: {ms(stats.average_ms)}")
    emit(f"P95 frame duration: {ms(stats.p95_ms)}")
    emit(f"P99 frame duration: {ms(stats.p99_ms)}")
    emit(
        f"Longest frame: {ms(stats.max_ms)} "
        f"(start {max_start_label}, trace-relative)"
    )
    emit(
        f"Frames > 16.7 ms (<60 FPS): {stats.over_60fps_budget:,}"
    )
    emit(
        f"Frames > 33.3 ms (<30 FPS): {stats.over_30fps_budget:,}"
    )
    emit(
        f"Frames > 100 ms: {stats.over_hitch_budget:,}"
    )


# ---------------------------------------------------------------------------
# WebGL / shader
# ---------------------------------------------------------------------------

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


def print_application_profiles(
    operations: list[ProfileOperation],
) -> None:
    emit()
    emit("-" * 72)
    emit(md_header("TOP APPLICATION CPU OPERATIONS"))
    emit("-" * 72, True)

    items = application_profile_operations(
        operations
    )

    if not items:
        emit(
            "No Seedvale application functions identified in CPU "
            "profiles (no sampled call frame resolved to a "
            "`/src/` source location)."
        )
        return

    total_duration = sum(
        item.duration_ms for item in items
    )

    if total_duration <= 0.0:
        emit(
            "This trace's embedded CPU profiles carry no "
            "`timeDeltas` (per-sample timing), so sampled CPU time "
            "cannot be computed for any function, application or "
            "otherwise. Ranking below falls back to sample/node "
            "count, which reflects sampling frequency, not "
            "wall-clock CPU cost. To get real per-function CPU "
            "time, re-record with a capture path that preserves "
            "`timeDeltas` on `disabled-by-default-v8.cpu_profiler` "
            "`ProfileChunk` events."
        )
        emit()

    for index, item in enumerate(
        items[:TOP_N],
        1,
    ):
        emit(
            f"{index}. {item.name}"
        )

        emit(
            f"   {item.category}   "
            f"Sampled CPU: {ms(item.duration_ms)}   "
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


# ---------------------------------------------------------------------------
# GPU
# ---------------------------------------------------------------------------

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
