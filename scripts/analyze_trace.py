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
- long CPU tasks / hitches
- frame timing

Chrome trace timestamps/durations are stored in microseconds.
Internally Event times are normalized to milliseconds.

Usage:
    ./scripts/analyze_trace.py trace.json
"""

from __future__ import annotations

import sys
from pathlib import Path

from trace_analyzer import report
from trace_analyzer.call_tree import build_call_tree
from trace_analyzer.gpu_analysis import gpu_events
from trace_analyzer.models import VERSION
from trace_analyzer.trace_parser import (
    build_be_events,
    get_trace_date_time,
    load_trace,
    parse_timed_events,
    trace_start_ms,
)
from trace_analyzer.v8_profiles import extract_profile_operations, iter_cpu_profiles


def main() -> None:
    if len(sys.argv) < 2:
        print(
            f"Usage: {sys.argv[0]} TRACE.json",
            file=sys.stderr,
        )
        raise SystemExit(2)

    path = Path(sys.argv[1])

    if len(sys.argv) > 2:
        report.config["output_to_stdout"] = sys.argv[2] == "stdout"
        report.config["output_to_file"] = sys.argv[2] == "file"

    if report.config["output_to_stdout"]:
        report.config["instant_output"] = True

    if not path.exists():
        print(
            f"Trace file not found: {path}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    report.emit(
        "==================================="
    )
    report.emit(
        report.md_title(f"Running Analyze Trace v{VERSION}")
    )
    report.emit(
        "==================================="
    )
    report.emit()

    report.emit(f"Reading: {path}")
    report.emit(get_trace_date_time(path))
    report.emit()

    raw_events = load_trace(path)

    report.emit("-" * 72)
    report.emit(report.md_header("TRACE ANALYSIS"))
    report.emit("-" * 72, True)
    report.emit(f"Events: {len(raw_events):,}")

    report.emit()
    report.emit("Building X + B/E call tree...", True)

    x_events = parse_timed_events(
        raw_events
    )

    be_events = build_be_events(
        raw_events
    )

    timed_events = (
        x_events + be_events
    )

    report.emit(
        f"Timed intervals: "
        f"{len(timed_events):,}"
    )

    report.emit()
    report.emit("Calculating call tree...", True)

    roots = build_call_tree(
        timed_events
    )

    report.print_cpu_operations(
        roots
    )

    report.print_aggregate_cpu(
        roots
    )

    trace_start = trace_start_ms(raw_events)

    report.print_long_cpu_tasks(
        roots,
        trace_start,
    )

    report.print_frame_summary(
        raw_events,
        trace_start,
    )

    report.emit()
    report.emit(
        "Extracting embedded CPU profiles..."
    )

    profiles = list(
        iter_cpu_profiles(
            raw_events
        )
    )

    report.emit(
        f"CPU profiles: "
        f"{len(profiles):,}"
    )

    profile_operations = (
        extract_profile_operations(
            profiles
        )
    )

    report.print_webgl_profiles(
        profile_operations
    )

    report.print_application_profiles(
        profile_operations
    )

    report.print_webgl_trace(
        raw_events
    )

    gpu = gpu_events(
        x_events
    )

    report.print_gpu(
        gpu,
        roots
    )

    report.emit()
    report.emit("DONE")
    report.output(path)


if __name__ == "__main__":
    main()
