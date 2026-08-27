# Implementation Notes: Performance Benchmark Determinism & Reliability

**Reviewed:** 2026-08-28
**Plan:** tools-001-performance-benchmark-determinism-and-reliability.md
**Repository:** jm-sky/seedvale, main

## Current code reality

The plan is still applicable, but the benchmark is more mature than the original plan implies.

- src/main.ts treats ?benchmark= / ?perf= as unattended and currently loads the latest save via readSave(), then passes it to createApp(). This is the main source of persisted-state drift. A deterministic benchmark must bypass the save entirely, not merely overwrite time/position inside benchmark.ts.
- createApp.ts builds config through createWorldConfig(), which can include localStorage domains. Therefore "no save" alone is not enough for a fixed world fixture: benchmark setup must also override world-generation values rather than inheriting local settings.
- Climate is already deterministic from (config.seed, dayNight.elapsedDays); do not add a separate benchmark weather implementation.
- PerfContext already contains seed, terrainResolution, loadRadius, actual pixelRatio, quality and live scene memory counts. Extend this type/context rather than creating a parallel benchmark metadata object.
- WorldBundle is rebuilt wholesale. The existing chunkManager: () => bundle.chunkManager accessor is correct; keep live accessors for replaceable bundle fields.
- prewarmRenderPrograms() already runs during loading, before the render loop starts. Treat this as setup/warm-up; do not add another shader prewarm path in benchmark.ts.

## Fixture / persisted-state isolation

Use a small explicit benchmark fixture at the app/bootstrap boundary.

Recommended canonical fixture:

- seed: 42
- elapsedDays: 0 unless a measured reason requires another fixed day
- timeOfDay: 07:00 for standard runs
- terrain resolution: 193
- loadRadius: 3
- fixed terrain/world parameters from current defaults
- deterministic home settlement configuration
- High quality preset
- deterministic renderer pixel ratio/cap

Historically the browser workflow used seed=42 and res=193, but the fixture should be authoritative. URL overrides can remain useful for ad-hoc diagnostics, but such runs should be identifiable as non-canonical.

Best ownership:

main.ts detects benchmark mode -> createApp with an explicit benchmark fixture -> createApp constructs a fresh benchmark world without SaveData and applies the fixture before world creation.

Do not load a save and then try to reset it inside benchmark.ts. By then terrain lifecycle, settlements, NPCs and other runtime state may already be materialized.

Do not use saveAllDomains() as a source of benchmark state. Benchmark setup must not mutate the user's world/graphics preferences.

## Scenario anchors

Current benchmark.ts dynamically searches:

- settlement: home settlement; deterministic once the fixture is fixed.
- forest: seekForest(home).
- water: seekWater(home), using nearest height to water level.
- stress: forest result + night.
- stream: home +X at fixed speed.
- current: current player position.

Canonical comparisons should use named fixture anchors for forest and water. The anchor should be a world-space coordinate, not a mutable runtime object.

Use the existing search functions once as a development aid to discover suitable coordinates for seed 42, then encode verified coordinates in fixture data. The water anchor must be visibly/structurally water-adjacent; proximity to waterLevel alone is not sufficient.

current should not participate in canonical baseline comparisons unless it gets its own fixed anchor. It can remain a debug scenario.

Keep settlement derived from the fixture's home SettlementDef; there is no need to duplicate settlement coordinates.

## Warm-up and measurement

Current flow is:

setup -> move -> waitForChunks() -> sleep(1000) -> beginSession() -> measured duration.

This already keeps initial preload outside the session, but the 1-second sleep is not a defined warm-up contract.

Make phases explicit:

1. setup fixture/config
2. move to scenario anchor
3. preload required chunks with existing waitForChunks()
4. warm up the runtime/render path
5. start a fresh PerfMonitor session
6. measure
7. restore player/graphics/time state

Keep program prewarm outside measured gameplay time. It reduces shader first-use noise but does not eliminate every first-use asset/GPU upload.

If cold-start data is wanted later, add a separate explicit mode instead of weakening the normal benchmark.

## Stream scenario

Current route is effectively:

- start at home
- move +X
- 14.4 m/s (8 * 1.8)
- update every 100 ms
- run for the requested duration

Keep the route deterministic, but make start, direction, speed and duration explicit scenario data.

Prefer movement derived from elapsed benchmark time or a deterministic fixed-step schedule over setInterval drift. Browser timer delays must not change the intended route distance.

Do not preload the complete route: streaming is the workload.

## PerfMonitor / frame attribution

Do not redesign PerfMonitor. It already owns frame statistics, category accumulation, hitch recording, session boundaries and percentiles.

Important limitation: withCategory() measures category time but does not create a hitch. recordHitch() is called only by explicitly instrumented operations. Therefore frame.max can be much larger than max labelled hitch.

Latest benchmark evidence showed stream frame.max around 800 ms while the largest labelled chunk-mesh hitch was about 52 ms.

Do not invent a category as the cause of every long frame. Preserve the distinction:

- frame spike = frame-level observation
- category cost = measured application span
- hitch = explicitly attributed operation
- unattributed long frame = report as such

RENDER is especially important here: EffectComposer rendering can include GPU wait, so it is not pure CPU time.

## Report interpretation

Current report.ts ranks average category cost and calls the top three bottlenecks. That is too strong for the new benchmark goal.

Keep systems as raw measured category averages, but distinguish:

- sustained category cost
- frame spikes / hitch evidence
- unattributed frame spikes
- possible GPU/render cost

Do not call the highest category the bottleneck when the main evidence is an isolated spike or when RENDER is large and may include GPU wait.

Existing measurements support this caution:

- sustained settlement cost is dominated by RENDER and draw submissions;
- stream has labelled roughly 40-52 ms chunk-mesh hitches;
- the much larger roughly 800 ms stream frame was not attributed;
- SHADOWS and POSTPROCESS are intentionally empty categories;
- censusScene() is a one-pass scene-graph estimate, not GPU timing.

Do not infer GPU causality from triangle count or draw count alone.

## Context

Extend PerfContext rather than duplicating metadata in PerfReportJson.

The existing provider already reads live loaded chunks, NPC/fauna counts, renderer pixel ratio, quality, seed, terrain resolution, load radius and renderer memory counts.

Add only reproducibility fields that are not already derivable, such as:

- elapsedDays
- season/weather identity
- scenario anchor
- route definition where applicable
- viewport width/height
- benchmark fixture identifier/version

Record actual values where possible. For example, actual renderer pixel ratio and actual viewport dimensions.

A fixture/version identifier is valuable: when the fixture changes, old reports must not be silently compared with new ones.

## Existing systems to reuse

- src/main.ts: benchmark/unattended boot decision.
- createApp.ts: composition root; fixture must enter before world construction.
- createWorldConfig() + defaultTerrainConfig(): existing config/default machinery.
- createDayNightState() + createClimateState(): deterministic time/climate.
- createGraphicsSettings().applyNamedQualityPreset(): existing quality application path.
- prewarmRenderPrograms(): existing loading-window shader/program prewarm.
- WorldBundle: existing world lifetime/rebuild boundary.
- PerfMonitor.beginSession()/endSession(): measurement boundary.
- ChunkManager.waitForChunks(): preload primitive.
- censusScene(): existing scene composition diagnostic.
- IsolationHost / isolation probes: optional post-run diagnostics; their time stays outside the measured session.

Avoid a new generic BenchmarkManager, save snapshots, or a second quality/configuration system.

## Important dependencies / traps

1. Save loading currently happens in main.ts before createApp. Fix this first or benchmark determinism is impossible.
2. localStorage can influence createWorldConfig(). Fresh save != fresh config.
3. createClimateState(seed, elapsedDays) means elapsedDays changes season/weather even with the same seed.
4. prewarmRenderPrograms() already exists; do not duplicate it or include it in steady-state measurements.
5. renderer.getPixelRatio() is the actual benchmark value; window.devicePixelRatio alone is insufficient.
6. Renderer/composer resize changes workload. Record viewport dimensions and avoid resize during measurement.
7. Quality restoration currently handles Low/Medium/High explicitly. If benchmark setup can encounter Custom, preserve the actual state.
8. benchmark.ts restores player/time/quality, but not an entire world state. Canonical runs must therefore start from a fresh fixture.
9. waitForChunks() is synchronization, not proof that all first-use rendering costs are gone.
10. Stream crosses chunk boundaries by design; do not preload all route chunks.
11. Mirror/shadow/postprocess passes affect RENDER. Do not invent separate CPU categories without a real instrumentation seam.
12. Do not resurrect the retired AO auto-budget. createPostProcessing.applyFrameBudget() is intentionally a no-op after the grass-flicker regression.
13. Do not use dynamic forest/water searches as the hidden identity of canonical scenarios.
14. Benchmark mode must not overwrite user saves or preferences.

## Verification

Use docs/performance/agent-browser-benchmarking.md for browser procedure.

Minimum deterministic acceptance:

- same fixture identifier/config across repeated runs;
- same seed and elapsedDays;
- same derived season/weather;
- same anchor/route;
- same quality/pixel ratio/viewport;
- comparable loaded-chunk and scene-census counts;
- repeated steady-state FPS/frame-time distributions within observed environmental variance.

Run at least three identical runs for a representative scenario before declaring stability.

For stream inspect both labelled chunk/streaming hitches and frame-level max/p95. If frame.max remains much larger than labelled hitches, report it as unattributed rather than claiming chunk mesh caused the whole spike.

## Scope guard

This plan should answer: "did this change make the same workload faster/more stable?"

Do not include Chrome trace parsing, GPU timer-query implementation, shader hitch fixing, chunk mesh optimization, settlement batching, mirror optimization, or gameplay/simulation changes. Those belong to separate work.
