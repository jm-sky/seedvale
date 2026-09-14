# Main-thread frame spike trace analysis — 2026-09-14

**Status:** diagnostic evidence, root cause not yet proven

Source trace analysis: `docs/performance/trace-results/Trace-20260914T135513.md`.

## Why this matters

The current stream benchmark reported a worst frame of ~191 ms while the largest explicitly labelled hitch was only ~9.8 ms. That benchmark-side `unattributed` value is not itself a subsystem measurement — it is the difference between the worst frame and the largest labelled hitch. `withCategory()` timings do not automatically become hitch records, so a large frame can still come from already-known update/render code that simply lacks a matching `recordHitch()` marker.

This Chrome Performance trace provides stronger evidence about where the stall actually occurs.

## Confirmed findings

- The trace contains a real long main-thread animation-frame stall: `FireAnimationFrame` / scripted animation work reaches roughly **577 ms**.
- The longest traced frame is roughly **583.5 ms**.
- This means the large hitch is a real CPU/main-thread event inside the frame/tick path; it is not explained purely by worker execution.
- GPU work is much smaller: the largest individual `GPUTask` in this trace is about **27.4 ms**. GPU pressure may still matter for sustained frame time, but it does not explain the ~577 ms main-thread stall.
- Several ~600 ms `HandlePostMessage` / `FunctionCall` tasks occur on other threads. These are relevant worker activity, but they are not by themselves the explanation for the main-thread `FireAnimationFrame` stall.

## Strong lead: river / terrain path

The embedded CPU profiles repeatedly sample application functions in the river/terrain path, especially:

- `flowFactor()` in `src/terrain/riverNetwork.ts`
- `riverChannelSegmentsNear()` in `src/terrain/riverNetwork.ts`
- `sampleApronGridWeighted()` in `src/terrain/chunkHeightmap.ts`
- `tick()` in `src/app/gameLoop.ts`

This makes the river/terrain streaming path the strongest current lead for focused recon.

Relevant current architecture:

- `riverChannelSegmentsNear()` derives runtime river-channel segments from canonical river chains used by rendering/carving.
- `riverTileCache` still performs synchronous river-tile calculation on the main thread; existing documentation records roughly ~18 ms measured work per tile historically.

A plausible next path to inspect is therefore:

```text
gameLoop.tick
→ ChunkManager streaming/update
→ river tile retain/build
→ riverChannelSegmentsNear
→ terrain/water chunk preparation/finalization
```

## Important limitation of this trace

The embedded V8 CPU profiles in this capture do **not** contain `timeDeltas` per sample. Therefore the application ranking in the generated trace report is based on sampling frequency / node counts, not measured wall-clock CPU time per function.

Consequences:

- The trace proves the long stall is on the main thread during the animation-frame path.
- It does **not** yet prove that `flowFactor()` or `riverChannelSegmentsNear()` consumes hundreds of milliseconds.
- Do not optimize river code solely because it appears at the top of the sampled-function list.

## Current conclusion

The previous generic label **`181 ms unattributed frame spike`** should be treated as a measurement gap, not as evidence of a mysterious separate subsystem.

The best-supported current statement is:

> A severe main-thread stall occurs inside the animation-frame/tick path. GPU work is too small to explain it. River/terrain streaming is the strongest current CPU lead, but the available CPU profile lacks timing data needed to prove the exact function responsible.

## Recommended next diagnostic step

Do one focused instrumentation pass before making any optimization:

1. Capture timings for the major stages of the exact frame/tick path.
2. Around chunk streaming, split at least:
   - overall streaming update,
   - river tile retain/build,
   - `riverChannelSegmentsNear`,
   - terrain/chunk preparation,
   - water preparation/finalization,
   - existing bounded chunk finalization.
3. Record these timings specifically for long frames (for example >80 ms), together with existing RENDER/NPC/FAUNA category values and hitch events for the same frame.
4. Keep markers at coarse logical boundaries; do not put `performance.now()` inside terrain/river inner loops.
5. Run one browser benchmark/trace and use it to identify which stage actually owns the long frame.

If the next long-frame capture shows the river/terrain streaming path consuming most of the stall, optimize that existing mechanism. If not, follow the measured owner instead.

## Non-actions

Until that attribution exists, do **not**:

- redesign the river system,
- move more work to workers speculatively,
- add another scheduler/finalization manager,
- treat shader compilation or GPU work as the primary cause without new evidence,
- optimize `flowFactor()` merely because it has many profiler samples.

The purpose of the next step is attribution, not optimization.
