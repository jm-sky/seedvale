# Plan: Heavy settlement performance benchmark

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** high · **Effort:** S
**Depends on:** ~~tools-001~~
**Domain:** `tools`
**Type:** `infrastructure`
**Subdomains:** `diagnostics` `development`
**Tags:** `performance` `benchmark` `settlement` `mountain`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Add one canonical benchmark scenario that reproduces the sustained load of a large mountain settlement without player movement or streaming being the primary workload.

The scenario should answer:

> How expensive is Seedvale when the player is standing inside a large mountain settlement with its normal buildings, NPCs, livestock, fauna, terrain, vegetation, shadows, water/reflections and post-processing active?

This is a diagnostic extension of the existing benchmark harness, not a new benchmark system.

## Current problem

The current canonical `settlement` scenario in `src/perf/benchmark.ts` always uses the home settlement. The newest `stream` benchmark measures movement/streaming and therefore does not isolate the user-observed severe FPS drop in a large mountain settlement.

Existing instrumentation is already sufficient to diagnose the main hypotheses once the correct workload is reproducible:

- `PerfMonitor` system timings,
- `Agent CPU` split for NPC/fauna/livestock,
- `sceneCensus()` category draw/triangle counts,
- render isolation probes including `hide-settlement`, `hide-npc-fauna`, `hide-grass`, `hide-vegetation`, `no-shadows`, `no-postprocessing` and `no-reflections`,
- long-frame attribution,
- program census/compile attribution.

Do not create parallel profiling or rendering instrumentation unless the first heavy-settlement capture proves a specific missing measurement.

## Scenario

Add a new canonical scenario id:

```text
settlement-heavy
```

Keep the existing `settlement` scenario unchanged as the home-settlement baseline.

`settlement-heavy` must:

1. start from the canonical benchmark fixture (`tools-001-v1` unless independently changed by another plan),
2. select a deterministic large mountain settlement from `SettlementDef` data,
3. move the player to that settlement's world-space center,
4. preload the normal terrain load ring around that position,
5. use the existing warm-up phase,
6. keep the player stationary during the measured run,
7. use High quality and the normal fixture time/weather rules,
8. measure for the same default 30 seconds,
9. run the existing post-session isolation probes,
10. restore player/time/quality exactly like the other scenarios.

No scripted camera movement, synthetic NPC spawning, artificial population multiplier or benchmark-only settlement objects.

## Deterministic settlement selection

Extend the benchmark host with the smallest read-only settlement-definition seam needed to select the scenario anchor from the live `WorldBundle`.

Use existing authoritative settlement definitions from `SettlementsManager`:

- `getHomeDef()` for the fixture origin,
- `peekDef(cell)` for deterministic neighboring definitions.

Do not depend on loaded runtime `Settlement` instances or camera streaming state to choose the benchmark target.

Selection policy:

1. scan a fixed bounded square/ring of settlement grid cells around the home cell,
2. keep only `SettlementDef.terrain === 'mountain'`,
3. rank by settlement load proxy:
   - village size rank (`XL > LG > MD > SM > OUTPOST` according to the actual `VillageSize` union/config),
   - then total family-member/NPC count,
   - then deterministic distance-to-home / cell-id tie-break,
4. choose the highest-ranked candidate.

The exact bounded search radius must be small enough to avoid a full-world scan but large enough to guarantee a useful candidate for the canonical seed. Verify the canonical fixture during implementation; if seed 42 has no suitable large mountain candidate inside the initial bound, increase the fixed bound deliberately rather than falling back silently to a different terrain.

A canonical `settlement-heavy` run must not silently degrade to the home settlement. Failure to resolve the expected workload should be explicit.

Keep the selector as a pure function where practical so it can be unit tested without browser execution.

## Scenario metadata

Extend `PerfContext` rather than inventing a second report metadata structure.

For settlement-targeted scenarios, record enough identity to prove repeated runs are measuring the same settlement, for example:

```text
settlement id
settlement name
terrain
size
family count
resident/NPC definition count
world position
```

Keep existing fields such as `scenarioAnchor`, `npcCount`, `faunaCount`, loaded chunks, viewport, seed, time/weather, draw calls and scene census.

Do not duplicate values that already exist in the report.

The exported Markdown report must make the selected settlement identity visible in the reproducibility/context section.

## Existing systems to reuse

### `src/perf/benchmarkScenarios.ts`

Add `settlement-heavy` to the canonical scenario union.

### `src/perf/flags.ts`

Accept `?benchmark=settlement-heavy` through the existing URL parser.

Avoid maintaining a second unrelated list of valid scenario IDs if the current code can safely derive validation from `BENCHMARK_SCENARIO_IDS`; if changing this now would broaden scope, minimally extend the existing parser and cover it with a test.

### `src/perf/benchmark.ts`

Reuse the existing lifecycle:

```text
scenario setup
→ waitForChunks()
→ warm-up
→ PerfMonitor session
→ scene census
→ isolation probes
→ report/export
→ restore
```

Add only the settlement selection/metadata needed by this scenario.

### `src/app/createApp.ts`

Expose the settlement-definition lookup to `BenchmarkHost` using live accessors to `bundle.settlementsManager`, matching the existing `chunkManager: () => bundle.chunkManager` lifetime rule.

Do not capture a replaceable world-bundle manager by value.

### `src/perf/types.ts` / report formatting

Extend `PerfContext` with a small settlement-scenario descriptor. Keep the normal `PerfReportJson` shape and existing formatting path.

## Tests

Add focused tests for logic that does not require browser rendering:

- `settlement-heavy` is a recognized scenario/URL value,
- selector ignores non-mountain settlements,
- larger settlement size wins before smaller size,
- equal size is resolved by resident count,
- tie-breaking is deterministic,
- missing qualifying mountain settlement is explicit rather than silently falling back,
- report/context formatting includes selected settlement identity when present,
- existing scenarios remain unchanged.

Do not mock the complete rendering pipeline for unit tests.

## First benchmark after implementation

Manual browser verification belongs to the user.

Run at least:

```text
?benchmark=settlement-heavy
```

for the canonical 30 s run and save the result under `docs/performance/results/` using the existing numbering/naming convention.

Compare against the latest `stream` report, but do not treat the two workloads as interchangeable.

Inspect especially:

- FPS avg/min/p1 and frame avg/p95/max,
- `RENDER`, `NPC`, `FAUNA`, `WATER`, `STREAMING`,
- settlement/NPC/fauna scene draw counts and triangles,
- loaded NPC/livestock/fauna counts,
- `hide-settlement` delta,
- `hide-npc-fauna` delta,
- `no-shadows` delta,
- `hide-grass` / `hide-vegetation` delta,
- `no-reflections` and `no-postprocessing` deltas,
- long frames and whether their cost is attributed,
- WebGL program count/first-use events.

The purpose of this plan is measurement. Do not bundle a settlement-rendering optimization into the same implementation. The first result should determine the next optimization plan.

## Non-goals

- no building/settlement batching implementation,
- no shadow optimization,
- no grass/terrain LOD change,
- no NPC/fauna cadence change,
- no synthetic stress population,
- no new BenchmarkManager,
- no second fixture/configuration system,
- no browser automation by the AI agent,
- no broad performance refactor.

## Verification

Automated:

- typecheck,
- lint,
- focused unit tests for selector/parser/context,
- normal test suite/build as required by repository workflow.

Manual browser verification by the user:

- run `settlement-heavy` at least twice and confirm identical settlement id/anchor/fixture metadata,
- confirm visually that the player is inside the intended large mountain settlement,
- save a 30 s result,
- compare its sustained and isolation metrics with `stream` and the existing home `settlement` scenario.

Add JSDoc to the settlement-selection helper / benchmark host seam if it materially improves preflight discovery; use `@domain tools` where useful.

Do not run `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
