#!/usr/bin/env python3

import json
import sys
from pathlib import Path


# Categories used by Tracium/Chrome Lighthouse to identify
# navigation, frame and main-thread events.
TRACIUM_CATEGORIES = (
    "blink.user_timing",
    "loading",
    "devtools.timeline",
    "__metadata",
)

# Keep WebGL/GPU/shader events even when they are outside the
# categories above. These are important for Seedvale performance analysis.
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
    "GPU",
    "Shader",
    "shader",
    "Program",
    "program",
    "RenderPass",
    "renderPass",
)


def has_tracium_category(event: dict) -> bool:
    category = str(event.get("cat", ""))

    if category == "__metadata":
        return True

    return any(
        required in category
        for required in TRACIUM_CATEGORIES
    )


def is_gpu_event(event: dict) -> bool:
    name = str(event.get("name", ""))

    return any(
        keyword in name
        for keyword in GPU_KEYWORDS
    )


def should_keep(event: dict) -> bool:
    # Preserve everything Tracium can use for:
    # - main frame detection
    # - navigationStart
    # - CPU task hierarchy
    # - call trees
    if has_tracium_category(event):
        return True

    # Preserve explicit GPU/WebGL/shader events.
    if is_gpu_event(event):
        return True

    return False


def main() -> None:
    if len(sys.argv) != 3:
        print(
            f"Usage: {Path(sys.argv[0]).name} INPUT.json OUTPUT.json",
            file=sys.stderr,
        )
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    print(f"Reading: {input_path}")

    with input_path.open("r", encoding="utf-8") as f:
        trace = json.load(f)

    events = trace.get("traceEvents")

    if not isinstance(events, list):
        raise ValueError("Trace does not contain a valid traceEvents array")

    kept = [event for event in events if should_keep(event)]

    # Preserve all top-level fields except the filtered traceEvents.
    output_trace = {
        key: value
        for key, value in trace.items()
        if key != "traceEvents"
    }
    output_trace["traceEvents"] = kept

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(
            output_trace,
            f,
            separators=(",", ":"),
        )

    input_size = input_path.stat().st_size
    output_size = output_path.stat().st_size

    def mb(size: int) -> float:
        return size / 1024 / 1024

    reduction = (
        100.0 * (1.0 - output_size / input_size)
        if input_size
        else 0.0
    )

    print()
    print(f"Events:  {len(events):,}")
    print(f"Kept:    {len(kept):,}")
    print(f"Removed: {len(events) - len(kept):,}")
    print()
    print(f"Size:    {mb(input_size):.1f} MB → {mb(output_size):.1f} MB")
    print(f"Reduced: {reduction:.1f}%")
    print()
    print(f"Output:  {output_path}")


if __name__ == "__main__":
    main()
