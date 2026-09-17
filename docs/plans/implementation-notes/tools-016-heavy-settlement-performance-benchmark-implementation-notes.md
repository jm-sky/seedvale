# Implementation Notes: Heavy settlement performance benchmark

**Reviewed:** 2026-09-17
**Plan:** tools-016-heavy-settlement-performance-benchmark.md
**Repository:** jm-sky/seedvale, main

## Current code reality

The benchmark stack is already mature enough for this task. The missing piece is workload selection, not measurement infrastructure.

- `src/perf/benchmarkScenarios.ts` currently defines: `current`, `forest`, `settlement`, `water`, `night`, `stress`, `stream`.
- `src/perf/flags.ts::benchmarkScenarioFromUrl()` repeats those ids manually and must accept the new scenario.
- `src/perf/benchmark.ts::createBenchmarkRunner()` owns the canonical lifecycle and currently resolves `settlement` directly to `host.home()`.
- `BenchmarkHost` currently exposes `chunkManager()` and `home()`, but no settlement-definition lookup.
- `src/app/createApp.ts` constructs the runner and has live access to `bundle.settlementsManager`; follow the existing accessor pattern rather than capturing manager instances.
- `SettlementDef` in `src/settlement/settlementGenerator.ts` already contains exactly the stable data needed for selection/metadata: `id`, `gx/gz`, `x/z/y`, `size`, `families`, `terrain`, `name`, `plan`.
- `SettlementTerrain` includes the literal `mountain`.
- `PerfContext` in `src/perf/types.ts` is the right ownership point for reproducibility metadata.
- `sceneCensus()` and `runIsolationProbes()` already run after every scenario; no new profiler is required for the first capture.

## Recommended implementation shape

### 1. Pure selector

Create a small perf-owned helper, preferably separate from `benchmark.ts` if that keeps tests focused, e.g. conceptually:

```text
src/perf/heavySettlementScenario.ts
```

Inputs should be data/read-only seams, not managers:

```text
home: Pick<SettlementDef, 'gx' | 'gz'>
peekDef(cell): SettlementDef | null
fixed search radius
```

Return either the selected `SettlementDef` or an explicit failure/result type.

Do not import quest-domain helpers such as `nearbyRpgSettlementDefs()` merely because they also scan neighboring settlements. That helper has quest-specific limits/semantics; benchmark selection belongs in `perf` and should remain tiny/pure.

### 2. Ranking

Verify `VillageSize` ordering in `src/settlement/families.ts` before coding. Do not compare size strings lexicographically.

Preferred ranking tuple:

```text
sizeRank desc
residentCount desc
distanceSq asc
settlement id asc
```

Resident count should come from `families.flatMap(...members...)` or an equivalent count without constructing NPC agents.

Filter `terrain === 'mountain'` before ranking.

The selector should not depend on settlement runtime load state.

### 3. Host seam

Extend `BenchmarkHost` with a live settlement accessor, conceptually:

```text
settlements: () => {
  getHomeDef(): SettlementDef
  peekDef(cell: SettlementCell): SettlementDef | null
}
```

or two smaller closures if that is cleaner.

In `createApp.ts`, resolve through `bundle.settlementsManager` at call time. `WorldBundle` can be replaced wholesale, so copying the current `chunkManager: () => bundle.chunkManager` pattern matters.

Do not add generic world-query abstractions for this plan.

### 4. `benchmark.ts`

Resolve `settlement-heavy` during the existing setup phase before `preloadChunks()`.

The normal flow after anchor resolution must remain unchanged:

```text
apply High
setPosition
waitForChunks
warm-up
reset diagnostics
beginSession
30 s measurement
endSession
scene census
isolation probes
report
restore
```

There should be no movement timer for `settlement-heavy`.

If no qualifying settlement is found, fail explicitly before starting the measured session. Do not emit a canonical report for a fallback workload.

### 5. Context metadata

Prefer one optional nested descriptor on `PerfContext`, e.g. conceptually:

```text
scenarioSettlement?: {
  id
  name
  terrain
  size
  familyCount
  residentCount
  x
  z
}
```

Do not add another top-level diagnostics report.

`formatReport()` already owns the reproducibility section; add this descriptor there rather than printing ad-hoc lines from `benchmark.ts`.

### 6. Existing isolation probes are the important follow-up

The current benchmark already exposes the A/B probes needed for the reported mountain-settlement regression:

- `hide-settlement`
- `hide-npc-fauna`
- `hide-grass`
- `hide-vegetation`
- `hide-environment`
- `no-shadows`
- `no-ao`
- `no-bloom`
- `no-smaa`
- `no-god-rays`
- `no-film-grade`
- `no-postprocessing`
- `no-reflections`

Do not add specialized building/light/shadow counters pre-emptively. First capture the scenario; if `no-shadows` or `hide-settlement` produces a strong delta, make the next diagnostic/optimization plan from evidence.

## Files likely to change

Verified primary files:

```text
src/perf/benchmarkScenarios.ts
src/perf/flags.ts
src/perf/benchmark.ts
src/perf/types.ts
src/perf/report.ts
src/app/createApp.ts
```

Likely new focused helper/test files:

```text
src/perf/heavySettlementScenario.ts
src/perf/heavySettlementScenario.test.ts
```

Also update/add focused tests for URL scenario parsing/report formatting where the current test structure makes that practical.

Do not change rendering, settlement generation or NPC/fauna simulation files for this plan.

## Search-radius decision

The plan intentionally does not invent the numeric radius without checking the canonical fixture.

Implementation procedure:

1. start with a small fixed bounded radius (e.g. a few settlement cells),
2. use the deterministic seed-42 definitions through `peekDef()`,
3. confirm there is a mountain candidate with a genuinely large size/resident count,
4. increase the bound only if required,
5. then freeze that bound as part of scenario identity.

Because browser verification belongs to the user, automated tests should validate ranking/failure semantics with synthetic `SettlementDef`-like fixtures; the user confirms the chosen real fixture settlement in-browser.

## Report interpretation after implementation

The first result should be diagnostic, not an optimization verdict.

Compare three workloads separately:

```text
settlement       = home baseline
settlement-heavy = stationary large mountain settlement
stream           = movement/streaming workload
```

Do not compare FPS alone. Use isolation deltas to determine whether the regression is primarily:

```text
settlement submissions/geometry
shadows
NPC/fauna/livestock simulation
vegetation/grass
post-processing
reflections
or a mixed load
```

The latest `stream` result already shows that `RENDER`, `NPC` and especially `FAUNA` can all be material; the new scenario is meant to separate the settlement-specific workload from streaming.

## Traps

1. Do not select by nearest loaded runtime settlement — that makes the canonical anchor depend on streaming/camera history.
2. Do not silently fall back from mountain to another terrain.
3. Do not rank sizes by string order.
4. Do not create NPC agents merely to count residents.
5. Do not preload an oversized region beyond the normal load ring; the benchmark should represent gameplay residency.
6. Do not mutate settlement state/population to make the benchmark heavier.
7. Do not duplicate `PerfMonitor`, `sceneCensus` or isolation logic.
8. Do not run optimization work in the same plan.
9. Keep fixture/version metadata visible so future worldgen changes that pick a different settlement are detectable.
10. Browser verification is user-owned.

## Verification

Automated implementation agent checks:

```text
npx tsc --noEmit
pnpm lint:fix
focused tests
pnpm test
pnpm build
```

Use repository-standard commands if names have changed.

Do not run browser verification and do not run `pnpm docs:sync`.
