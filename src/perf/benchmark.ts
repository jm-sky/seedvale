import type { QualityPreset } from '../config/qualityProfiles'
import type { WorldConfig } from '../config/worldConfig'
import type { DayNightState } from '../world/dayNight'
import type { BenchmarkScenarioId } from './benchmarkScenarios'
import type { IsolationHost } from './isolationProbe'
import type { PerfMonitor } from './monitor'
import type { PerfReportJson } from './types'
import { worldToChunk } from '../terrain/chunkGrid'
import { runIsolationProbes } from './isolationProbe'
import { buildReport, formatReport } from './report'
import { censusScene } from './sceneCensus'

const SETTLE_MS = 1000
const DEFAULT_DURATION_SEC = 30

export type BenchmarkRunner = {
  running: () => boolean
  run: (id: BenchmarkScenarioId, durationSec?: number) => Promise<PerfReportJson | null>
}

type TerrainProbe = {
  waitForChunks: (coords: { cx: number; cz: number }[]) => Promise<void>
  sampleForestFactor: (x: number, z: number) => number
  sampleHeight: (x: number, z: number) => number
  waterLevel: number
}

export type BenchmarkHost = {
  config: WorldConfig
  chunkManager: TerrainProbe
  home: () => { x: number; z: number }
  dayNight: DayNightState
  player: { setPosition: (x: number, z: number) => void; mesh: { position: { x: number; z: number } } }
  monitor: PerfMonitor
  applyQualityPreset: (preset: Exclude<QualityPreset, 'Custom'>) => void
  isolation: IsolationHost
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function loadRing(x: number, z: number, chunkSize: number, loadRadius: number) {
  const center = worldToChunk(x, z, chunkSize)
  const coords: { cx: number; cz: number }[] = []
  for (let dz = -loadRadius; dz <= loadRadius; dz++) {
    for (let dx = -loadRadius; dx <= loadRadius; dx++) {
      coords.push({ cx: center.cx + dx, cz: center.cz + dz })
    }
  }
  return coords
}

function seekForest(probe: TerrainProbe, originX: number, originZ: number): { x: number; z: number } {
  let best = { x: originX, z: originZ, score: probe.sampleForestFactor(originX, originZ) }
  for (let r = 32; r <= 384; r += 32) {
    for (let a = 0; a < 12; a++) {
      const x = originX + Math.cos((a / 12) * Math.PI * 2) * r
      const z = originZ + Math.sin((a / 12) * Math.PI * 2) * r
      const score = probe.sampleForestFactor(x, z)
      if (score > best.score) best = { x, z, score }
    }
  }
  return best
}

function seekWater(probe: TerrainProbe, originX: number, originZ: number): { x: number; z: number } {
  const waterLevel = probe.waterLevel
  let best = { x: originX, z: originZ, score: Infinity }
  for (let r = 16; r <= 384; r += 16) {
    for (let a = 0; a < 16; a++) {
      const x = originX + Math.cos((a / 16) * Math.PI * 2) * r
      const z = originZ + Math.sin((a / 16) * Math.PI * 2) * r
      const h = probe.sampleHeight(x, z)
      const score = Math.abs(h - waterLevel)
      if (score < best.score) best = { x, z, score }
    }
  }
  return best
}

export function createBenchmarkRunner(host: BenchmarkHost): BenchmarkRunner {
  let inFlight = false

  async function waitSettled(x: number, z: number): Promise<void> {
    const { chunkSize, loadRadius } = host.config.terrain
    await host.chunkManager.waitForChunks(loadRing(x, z, chunkSize, loadRadius))
    await sleep(SETTLE_MS)
  }

  return {
    running: () => inFlight,
    async run(id, durationSec = DEFAULT_DURATION_SEC) {
      if (inFlight) return null
      inFlight = true
      const { chunkManager, player, dayNight, config, monitor } = host
      const saved = {
        x: player.mesh.position.x,
        z: player.mesh.position.z,
        timeOfDay: dayNight.timeOfDay,
        preset: config.quality.preset,
      }
      try {
        const home = host.home()
        let x = saved.x
        let z = saved.z
        let timeOfDay = saved.timeOfDay
        if (id === 'settlement') {
          x = home.x
          z = home.z
        } else if (id === 'forest' || id === 'stress') {
          const found = seekForest(chunkManager, home.x, home.z)
          x = found.x
          z = found.z
        } else if (id === 'water') {
          const found = seekWater(chunkManager, home.x, home.z)
          x = found.x
          z = found.z
        }
        if (id === 'night' || id === 'stress') timeOfDay = 0.05
        host.applyQualityPreset('High')
        if (id === 'stream') {
          x = home.x
          z = home.z
        }

        if (x !== saved.x || z !== saved.z) player.setPosition(x, z)
        dayNight.timeOfDay = timeOfDay
        await waitSettled(x, z)

        let streamTimer = 0
        if (id === 'stream') {
          const sprintMps = 8 * 1.8
          let streamX = x
          streamTimer = window.setInterval(() => {
            streamX += sprintMps * 0.1
            player.setPosition(streamX, z)
          }, 100)
        }

        monitor.setSource('benchmark', true)
        monitor.beginSession()
        await sleep(durationSec * 1000)
        const totals = monitor.endSession()
        if (streamTimer) window.clearInterval(streamTimer)

        const scene = censusScene(host.isolation.scene)
        const isolation = id === 'stream'
          ? undefined
          : await runIsolationProbes(host.isolation, monitor)
        monitor.setSource('benchmark', false)

        const report = buildReport({
          durationSec,
          scenario: id,
          totals,
          context: monitor.getContext(),
          scene,
          isolation,
        })
        console.log(formatReport(report))
        console.log(report)
        if (typeof window !== 'undefined') {
          window.__seedvalePerfLastReport = report
          const previous = window.__seedvalePerfReports ?? []
          window.__seedvalePerfReports = [...previous, report]
        }
        return report
      } finally {
        if (saved.preset === 'Low' || saved.preset === 'Medium' || saved.preset === 'High') {
          host.applyQualityPreset(saved.preset)
        }
        player.setPosition(saved.x, saved.z)
        dayNight.timeOfDay = saved.timeOfDay
        inFlight = false
      }
    },
  }
}

declare global {
  interface Window {
    __seedvalePerfLastReport?: PerfReportJson
    __seedvalePerfReports?: PerfReportJson[]
    __seedvaleRunBenchmark?: (id: BenchmarkScenarioId, durationSec?: number) => Promise<PerfReportJson | null>
    __seedvaleReady?: boolean
  }
}
