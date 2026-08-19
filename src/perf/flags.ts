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

/** Production `NUM_POINT_LIGHTS` cap (plan 157). Review 024 rejected 8 and 12
 *  (visible night cull) and kept 16 as the only visual-safe budget on the
 *  measured curve. Override or disable via `?pointLightBudget`. */
export const DEFAULT_POINT_LIGHT_BUDGET = 16

/**
 * Parse `?pointLightBudget` into the pad/cull cap, or `null` to leave the
 * registry running without padding.
 *
 * Production default is {@link DEFAULT_POINT_LIGHT_BUDGET} (16) when the
 * param is absent. QA/rollback:
 *  - `?pointLightBudget=N` → that integer (≥ 1)
 *  - bare / `true` / `yes` → {@link DEFAULT_POINT_LIGHT_BUDGET}
 *  - `0` / `false` / `no` / `off` → pad/cull off (`null`)
 */
export function parsePointLightBudgetFlag(raw: string | null, present: boolean): number | null {
  if (!present) return DEFAULT_POINT_LIGHT_BUDGET
  if (raw === null || raw.trim() === '') return DEFAULT_POINT_LIGHT_BUDGET
  const v = raw.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return null
  if (v === 'true' || v === 'yes') return DEFAULT_POINT_LIGHT_BUDGET
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

/** Production PointLight budget, overridable from the URL. See
 *  {@link parsePointLightBudgetFlag}. */
export function pointLightBudgetFromUrl(): number | null {
  const p = params()
  if (!p) return DEFAULT_POINT_LIGHT_BUDGET
  return parsePointLightBudgetFlag(p.get('pointLightBudget'), p.has('pointLightBudget'))
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
