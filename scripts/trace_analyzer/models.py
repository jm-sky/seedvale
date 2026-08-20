"""
Shared data structures and constants used across the trace analyzer.

Chrome trace timestamps/durations are stored in microseconds.
Internally Event/Node times are normalized to milliseconds.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable


VERSION = "16"

TOP_N = 5
MAX_TREE_DEPTH = 10
MIN_PROFILE_DURATION_MS = 0.01


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
