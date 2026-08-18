import type { BenchmarkScenarioId } from './benchmarkScenarios'

function params(): URLSearchParams | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search)
  } catch {
    return null
  }
}

function flagOn(raw: string | null): boolean {
  if (raw === null || raw.trim() === '') return true
  const v = raw.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

/** `?perf` / `?perf=1` — enable per-system timings without opening lil-gui. */
export function isPerfUrlEnabled(): boolean {
  const p = params()
  if (!p?.has('perf')) return false
  return flagOn(p.get('perf'))
}

/** `?programCensus=1` — plan 149 Phase 0 WebGLProgram/material census
 *  (`src/perf/programCensus.ts`), usable standalone (e.g. under manual play
 *  or agent-browser) without running the full 30s `stream` benchmark. The
 *  `stream` benchmark itself enables the census automatically. */
export function isProgramCensusUrlEnabled(): boolean {
  const p = params()
  if (!p?.has('programCensus')) return false
  return flagOn(p.get('programCensus'))
}

/** Fallback used only when `?pointLightBudget` is bare / `true` with no
 *  explicit number. Provisional (review 024's diagnostic pick, not a
 *  measured production value) — plan 157 §10 requires a real-GPU benchmark
 *  of the true concurrently-lit count (after the `light.visible` fix,
 *  `houseLighting.ts`) before any number is frozen for production. */
export const DEFAULT_POINT_LIGHT_BUDGET = 16

/** `?pointLightBudget=16` — plan 157: pad/cull the visible `PointLight`
 *  count to a constant so Three's `NUM_POINT_LIGHTS` program cache axis
 *  can't change as settlements stream in (see `src/world/pointLightBudget.ts`).
 *  Off by default — the registry itself always runs (cheap census), but no
 *  padding/culling happens unless this flag is set, since the production
 *  number isn't frozen yet (plan 157 §10).
 *  Bare `?pointLightBudget` / `true` / `yes` → {@link DEFAULT_POINT_LIGHT_BUDGET}.
 *  `0` / `false` / `no` → disabled. Any other integer ≥ 1 is that budget. */
export function pointLightBudgetFromUrl(): number | null {
  const p = params()
  if (!p?.has('pointLightBudget')) return null
  const raw = p.get('pointLightBudget')
  if (raw === null || raw.trim() === '') return DEFAULT_POINT_LIGHT_BUDGET
  const v = raw.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return null
  if (v === 'true' || v === 'yes') return DEFAULT_POINT_LIGHT_BUDGET
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

export function benchmarkScenarioFromUrl(): BenchmarkScenarioId | null {
  const raw = params()?.get('benchmark')
  if (!raw) return null
  const id = raw.trim().toLowerCase()
  if (
    id === 'current'
    || id === 'forest'
    || id === 'settlement'
    || id === 'water'
    ||     id === 'night'
    || id === 'stress'
    || id === 'stream'
  ) {
    return id
  }
  return null
}
