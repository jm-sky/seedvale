/**
 * Canonical benchmark fixture (plan tools-001). Comparing two benchmark
 * reports only means something if both runs started from the same world —
 * same seed, same terrain resolution/loadRadius, same in-game day/time — so
 * baseline → change → benchmark actually measure the same workload rather
 * than whatever save/localStorage state happened to be active.
 *
 * `?benchmark=<scenario>` boots through this fixture instead of the user's
 * save (`main.ts`); `createBenchmarkWorldConfig` (worldConfig.ts) builds the
 * matching `WorldConfig` with no localStorage overlay. Bump `version` if any
 * field here changes — old reports must not be silently compared with new
 * ones once the workload they measured has shifted.
 */
export type BenchmarkFixture = {
  version: string
  seed: number
  /** Day 0 — a fixed point in the (seed, elapsedDays) season/weather function. */
  elapsedDays: number
  /** 0..1 fraction of day, same convention as `DayNightState.timeOfDay`. 07:00. */
  timeOfDay: number
  terrainResolution: number
  loadRadius: number
}

export const BENCHMARK_FIXTURE: BenchmarkFixture = {
  version: 'tools-001-v1',
  seed: 42,
  elapsedDays: 0,
  timeOfDay: 7 / 24,
  terrainResolution: 193,
  loadRadius: 3,
}
