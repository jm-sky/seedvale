"""
GPU task ("GPUTask" X events) ranking and aggregation.
"""

from __future__ import annotations

from typing import Any

from .models import Event


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
