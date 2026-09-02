import type { QualityPreset } from '../config/qualityProfiles'
import type { WorldConfig } from '../config/worldConfig'
import type { DayNightState } from '../world/dayNight'
import type { BenchmarkScenarioId } from './benchmarkScenarios'
import type { IsolationHost } from './isolationProbe'
import type { PerfMonitor } from './monitor'
import type { PerfReportJson } from './types'
import { worldToChunk } from '../terrain/chunkGrid'
import { runIsolationProbes } from './isolationProbe'
import { formatProgramCensusReport, getProgramCensus } from './programCensus'
import { buildReport, formatReport } from './report'
import { censusScene } from './sceneCensus'

/** Post-preload settle window (plan tools-001 §3) — lets lazy
 *  initialization/first-use costs that `waitForChunks()` doesn't cover (GC,
 *  first-frame allocations) fall outside the measured session. Not a
 *  cold-start eliminator; a separate cold-start mode would be a distinct,
 *  explicitly-named benchmark, not a weaker version of this one. */
const WARMUP_MS = 1000
const DEFAULT_DURATION_SEC = 30
/** `stream` scenario route (plan tools-001 §2) — encoded here so a report's
 *  `context.route` reflects the actual constants used, not just "some
 *  interval". */
const STREAM_SPEED_MPS = 8 * 1.8
const STREAM_UPDATE_MS = 100
/** Shore margin for `seekWater` (plan tools-001 §2) — a candidate must stand
 *  this close above `waterLevel` (dry) to count as "at the water's edge". */
const WATER_SHORE_MARGIN = 1.5

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
  // Accessor, not a value — `bundle.chunkManager` is replaced wholesale on a
  // `WorldBundle` rebuild (terrain-config change, New Game); a captured value
  // would silently keep probing a disposed instance (plan 195 data-consistency
  // audit, finding A). Read live at each call site, matching the rest of the
  // codebase's `WorldContext`/`bundle.x` accessor convention.
  chunkManager: () => TerrainProbe
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

/** Finds a scene that is actually water-adjacent, not just close in height
 *  to `waterLevel` (plan tools-001 §2 — proximity-to-waterLevel alone can
 *  land on dry high ground that merely happens to sit near that elevation).
 *  A candidate must be dry land within `WATER_SHORE_MARGIN` above
 *  `waterLevel`, with at least one sample a few units away that is actually
 *  submerged — i.e. visibly at the water's edge. */
function seekWater(probe: TerrainProbe, originX: number, originZ: number): { x: number; z: number } {
  const waterLevel = probe.waterLevel
  let best: { x: number; z: number; score: number } | null = null
  for (let r = 16; r <= 384; r += 16) {
    for (let a = 0; a < 16; a++) {
      const x = originX + Math.cos((a / 16) * Math.PI * 2) * r
      const z = originZ + Math.sin((a / 16) * Math.PI * 2) * r
      const h = probe.sampleHeight(x, z)
      if (h < waterLevel || h > waterLevel + WATER_SHORE_MARGIN) continue
      const nearWater = [0, 90, 180, 270].some((deg) => {
        const rad = (deg / 180) * Math.PI
        const hx = x + Math.cos(rad) * 6
        const hz = z + Math.sin(rad) * 6
        return probe.sampleHeight(hx, hz) < waterLevel
      })
      if (!nearWater) continue
      const score = h - waterLevel
      if (!best || score < best.score) best = { x, z, score }
    }
  }
  return best ?? { x: originX, z: originZ }
}

export function createBenchmarkRunner(host: BenchmarkHost): BenchmarkRunner {
  let inFlight = false

  // Phase: required chunk preload, ahead of the measured session (plan
  // tools-001 §3 — `setup → required chunk preload → warm-up → measured run`).
  async function preloadChunks(x: number, z: number): Promise<void> {
    const { chunkSize, loadRadius } = host.config.terrain
    await host.chunkManager().waitForChunks(loadRing(x, z, chunkSize, loadRadius))
  }

  return {
    running: () => inFlight,
    async run(id, durationSec = DEFAULT_DURATION_SEC) {
      if (inFlight) return null
      inFlight = true
      const { player, dayNight, config, monitor } = host
      const saved = {
        x: player.mesh.position.x,
        z: player.mesh.position.z,
        timeOfDay: dayNight.timeOfDay,
        preset: config.quality.preset,
      }
      try {
        // Phase: setup — resolve the scenario anchor from the (deterministic,
        // fixture-derived) home settlement position, not from wherever the
        // player/camera happened to be before the run. `current` is the one
        // exception: it deliberately keeps the pre-run position and is
        // reported as non-canonical (plan tools-001 §2).
        const home = host.home()
        let x = saved.x
        let z = saved.z
        let timeOfDay = saved.timeOfDay
        let anchor: { x: number; z: number } | undefined
        if (id === 'settlement') {
          x = home.x
          z = home.z
          anchor = { x, z }
        } else if (id === 'forest' || id === 'stress') {
          const found = seekForest(host.chunkManager(), home.x, home.z)
          x = found.x
          z = found.z
          anchor = found
        } else if (id === 'water') {
          const found = seekWater(host.chunkManager(), home.x, home.z)
          x = found.x
          z = found.z
          anchor = found
        } else if (id === 'stream') {
          x = home.x
          z = home.z
          anchor = { x, z }
        }
        if (id === 'night' || id === 'stress') timeOfDay = 0.05
        host.applyQualityPreset('High')

        if (x !== saved.x || z !== saved.z) player.setPosition(x, z)
        dayNight.timeOfDay = timeOfDay

        // Phase: required chunk preload.
        await preloadChunks(x, z)
        // Phase: warm-up — outside the measured session (see WARMUP_MS doc).
        await sleep(WARMUP_MS)

        // Stream route is derived from elapsed wall-clock time each tick,
        // not accumulated per-tick — `setInterval`'s delivered delay isn't
        // exactly `STREAM_UPDATE_MS`, and a fixed per-tick step would drift
        // the actual distance travelled away from `STREAM_SPEED_MPS ×
        // durationSec` (plan tools-001 §2/traps §10).
        let streamTimer = 0
        const streamStart = performance.now()
        if (id === 'stream') {
          streamTimer = window.setInterval(() => {
            const elapsedSec = (performance.now() - streamStart) / 1000
            player.setPosition(x + STREAM_SPEED_MPS * elapsedSec, z)
          }, STREAM_UPDATE_MS)
        }

        // Phase: measured session.
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

        const baseContext = monitor.getContext()
        const report = buildReport({
          durationSec,
          scenario: id,
          totals,
          canonical: id !== 'current',
          context: {
            ...baseContext,
            timeOfDay,
            scenarioAnchor: anchor,
            route: id === 'stream'
              ? { startX: x, startZ: z, speedMps: STREAM_SPEED_MPS, updateMs: STREAM_UPDATE_MS, durationSec }
              : undefined,
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
            viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
          },
          scene,
          isolation,
        })
        console.log(formatReport(report))
        console.log(report)
        // Plan 149 Phase 0 program-census diagnostic (docs/performance/audits/
        // 2026-09-01--program-census.md) — the census (`?programCensus=1` or
        // `?benchmark=stream`, see `src/perf/flags.ts`) accumulates for the
        // whole app session, not just this call's measured window, matching
        // how that census's dumps were produced.
        const programCensus = getProgramCensus()
        if (programCensus.enabled) console.log(formatProgramCensusReport(programCensus))
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
