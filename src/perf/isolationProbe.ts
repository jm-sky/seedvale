import type { PerfMonitor } from './monitor'
import type { IsolationProbeRow } from './types'
import {
  hideBuckets,
  restoreVisibility,
  type SceneBucket,
} from './sceneCensus'
import { PERF_CATEGORY_INDEX } from './types'
import type { Scene } from 'three'

const PROBE_SETTLE_MS = 150
const PROBE_SAMPLE_MS = 400

export type IsolationHost = {
  scene: Scene
  sun: { castShadow: boolean }
  applyPostConfig: () => void
  setAoEnabled: (on: boolean) => void
  setReflections: (on: boolean) => void
  setBloomEnabled: (on: boolean) => void
  setSmaaEnabled: (on: boolean) => void
  setGodRaysEnabled: (on: boolean) => void
  setFilmGradeEnabled: (on: boolean) => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function sampleProbe(monitor: PerfMonitor, id: string): Promise<IsolationProbeRow> {
  await sleep(PROBE_SETTLE_MS)
  monitor.beginSession()
  await sleep(PROBE_SAMPLE_MS)
  const totals = monitor.endSession()
  const n = Math.max(1, totals.frames)
  return {
    id,
    renderMsAvg: totals.frames > 0 ? totals.categoryMsSum[PERF_CATEGORY_INDEX.RENDER]! / n : 0,
    drawCallsAvg: Math.round(totals.drawCallsSum / n),
    trianglesAvg: Math.round(totals.trianglesSum / n),
  }
}

/** Short visibility / graphics toggles after a benchmark. Restores state. */
export async function runIsolationProbes(
  host: IsolationHost,
  monitor: PerfMonitor,
): Promise<IsolationProbeRow[]> {
  const results: IsolationProbeRow[] = []
  const hideProbes: { id: string; buckets: SceneBucket[] }[] = [
    { id: 'hide-grass', buckets: ['grass'] },
    { id: 'hide-vegetation', buckets: ['vegetation'] },
    { id: 'hide-environment', buckets: ['environment'] },
    { id: 'hide-settlement', buckets: ['settlement'] },
    { id: 'hide-water', buckets: ['water'] },
    { id: 'hide-terrain', buckets: ['terrain'] },
    { id: 'hide-npc-fauna', buckets: ['npc', 'fauna'] },
  ]

  results.push(await sampleProbe(monitor, 'full'))

  for (const probe of hideProbes) {
    const tokens = hideBuckets(host.scene, probe.buckets)
    try {
      results.push(await sampleProbe(monitor, probe.id))
    } finally {
      restoreVisibility(tokens)
    }
  }

  const shadowWas = host.sun.castShadow
  host.sun.castShadow = false
  try {
    results.push(await sampleProbe(monitor, 'no-shadows'))
  } finally {
    host.sun.castShadow = shadowWas
  }

  host.setAoEnabled(false)
  try {
    results.push(await sampleProbe(monitor, 'no-ao'))
  } finally {
    host.applyPostConfig()
  }

  host.setBloomEnabled(false)
  try {
    results.push(await sampleProbe(monitor, 'no-bloom'))
  } finally {
    host.applyPostConfig()
  }

  host.setSmaaEnabled(false)
  try {
    results.push(await sampleProbe(monitor, 'no-smaa'))
  } finally {
    host.applyPostConfig()
  }

  host.setGodRaysEnabled(false)
  try {
    results.push(await sampleProbe(monitor, 'no-god-rays'))
  } finally {
    host.applyPostConfig()
  }

  host.setFilmGradeEnabled(false)
  try {
    results.push(await sampleProbe(monitor, 'no-film-grade'))
  } finally {
    host.applyPostConfig()
  }

  host.setReflections(false)
  try {
    results.push(await sampleProbe(monitor, 'no-reflections'))
  } finally {
    host.applyPostConfig()
  }

  return results
}
