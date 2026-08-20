"""
Loading a Chrome trace file and parsing raw trace events ("X" complete
events and "B"/"E" begin/end pairs) into normalized `Event`s.
"""

from __future__ import annotations

from datetime import datetime
from collections import defaultdict
import json
from pathlib import Path
from typing import Any

from .models import Event


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def event_name(event: dict[str, Any]) -> str:
    return str(event.get("name") or "<unnamed>")


def normalize_trace_time(value: Any) -> float:
    """
    Chrome trace timestamps/durations are microseconds.

    Internally all Event start/end values are milliseconds.
    """
    return float(value) / 1000.0


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


def get_trace_date_time(path: Path) -> str:
    """
    Returns the date and time of the trace file.
    """
    parts = path.stem.split("-")
    timestamp = ''
    for part in parts:
        if part.split('T')[0].isdigit():
            timestamp = part
            break

    date = datetime.strptime(timestamp, "%Y%m%dT%H%M%S") if timestamp else None

    if not timestamp:
        return ''

    return f'Trace date/time: {date.strftime("%Y-%m-%d %H:%M:%S")}'


def trace_start_ms(
    raw_events: list[dict[str, Any]],
) -> float | None:
    """
    Earliest timestamp (normalized to ms) across all timed raw trace
    events. Used to display hitch/frame timestamps relative to the
    start of the trace instead of raw epoch values.

    Metadata ("M") events are excluded: by Chrome trace convention
    they carry ts=0 as a sentinel rather than a real timestamp, which
    would otherwise make every "trace-relative" value collapse back
    to the absolute one.
    """
    earliest: float | None = None

    for raw in raw_events:
        if raw.get("ph") == "M":
            continue

        ts = raw.get("ts")

        if ts is None:
            continue

        ts_ms = normalize_trace_time(ts)

        if earliest is None or ts_ms < earliest:
            earliest = ts_ms

    return earliest


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
