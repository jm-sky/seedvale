"""
CPU hitch / long-task analysis and frame-timing summary.

Two independent signals, both reused from data the parser/call-tree
already expose (no Seedvale-specific heuristics):

- Long CPU tasks: the longest top-level (root) nodes of the per-thread
  call tree built from "X" and "B"/"E" events. Roots are, by
  construction (`call_tree.build_call_tree`), disjoint intervals within
  their own thread, so ranking by root `duration` finds real
  contiguous CPU-blocking spans without double-counting nested work.
  No event name (e.g. "RunTask") is assumed to be a hitch by itself —
  every root is ranked purely by how long it actually blocked its
  thread.

- Frame timing: derived from consecutive "DrawFrame" instant events
  (category `disabled-by-default-devtools.timeline.frame`), which is
  the same general frame-boundary marker Chrome's own trace viewer
  uses to compute FPS. If a trace does not contain enough of these
  events, frame stats are not computed and the caller must say so
  rather than guessing.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import statistics
from typing import Any

from .models import Node, TOP_N
from .trace_parser import event_name, normalize_trace_time, safe_int


# ---------------------------------------------------------------------------
# Long CPU tasks / hitches
# ---------------------------------------------------------------------------

def top_long_cpu_tasks(
    roots: list[Node],
    top_n: int = TOP_N,
) -> list[Node]:
    candidates = [
        node
        for node in roots
        if node.duration > 0
    ]

    candidates.sort(
        key=lambda node: node.duration,
        reverse=True,
    )

    return candidates[:top_n]


# ---------------------------------------------------------------------------
# Frame timing
# ---------------------------------------------------------------------------

FRAME_MARKER_EVENT_NAME = "DrawFrame"
FRAME_INSTANT_PHASES = {"I", "i"}

# Below this many frame intervals, percentile/median figures are not
# considered reliable enough to report.
MIN_FRAMES_FOR_RELIABLE_STATS = 10

FRAME_BUDGET_60FPS_MS = 16.7
FRAME_BUDGET_30FPS_MS = 33.3
FRAME_BUDGET_HITCH_MS = 100.0


@dataclass
class FrameStats:
    frame_count: int
    median_ms: float
    average_ms: float
    p95_ms: float
    p99_ms: float
    max_ms: float
    max_start_ms: float
    over_60fps_budget: int
    over_30fps_budget: int
    over_hitch_budget: int


def extract_frame_timestamps(
    raw_events: list[dict[str, Any]],
) -> list[float]:
    """
    Returns sorted timestamps (ms) of the dominant DrawFrame sequence
    in the trace, or an empty list if no such sequence exists.

    Frames can belong to different (pid, tid, layerTreeId) groups (e.g.
    a page navigation recreates the layer tree). Only the largest group
    is used so unrelated/short-lived sequences don't corrupt the stats.
    """
    groups: dict[
        tuple[int, int, Any],
        list[float],
    ] = defaultdict(list)

    for raw in raw_events:
        if event_name(raw) != FRAME_MARKER_EVENT_NAME:
            continue

        if raw.get("ph") not in FRAME_INSTANT_PHASES:
            continue

        ts = raw.get("ts")

        if ts is None:
            continue

        args = raw.get("args") or {}

        key = (
            safe_int(raw.get("pid")),
            safe_int(raw.get("tid")),
            args.get("layerTreeId"),
        )

        groups[key].append(normalize_trace_time(ts))

    if not groups:
        return []

    dominant = max(groups.values(), key=len)
    dominant.sort()

    return dominant


def _percentile(
    sorted_values: list[float],
    fraction: float,
) -> float:
    if not sorted_values:
        return 0.0

    index = min(
        len(sorted_values) - 1,
        int(len(sorted_values) * fraction),
    )

    return sorted_values[index]


def compute_frame_stats(
    timestamps: list[float],
) -> FrameStats | None:
    """
    Returns None when there are too few consecutive frame markers to
    compute reliable statistics from.
    """
    if len(timestamps) < 2:
        return None

    durations = [
        timestamps[index + 1] - timestamps[index]
        for index in range(len(timestamps) - 1)
    ]

    if len(durations) < MIN_FRAMES_FOR_RELIABLE_STATS:
        return None

    ordered = sorted(durations)
    max_duration = max(durations)
    max_index = durations.index(max_duration)

    return FrameStats(
        frame_count=len(durations),
        median_ms=statistics.median(durations),
        average_ms=statistics.fmean(durations),
        p95_ms=_percentile(ordered, 0.95),
        p99_ms=_percentile(ordered, 0.99),
        max_ms=max_duration,
        max_start_ms=timestamps[max_index],
        over_60fps_budget=sum(
            1 for d in durations if d > FRAME_BUDGET_60FPS_MS
        ),
        over_30fps_budget=sum(
            1 for d in durations if d > FRAME_BUDGET_30FPS_MS
        ),
        over_hitch_budget=sum(
            1 for d in durations if d > FRAME_BUDGET_HITCH_MS
        ),
    )
