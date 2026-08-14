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
