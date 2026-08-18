import { classifyObject, type SceneBucket } from './sceneCensus'
import type { Material, Object3D, Scene, WebGLRenderer } from 'three'

/** Plan 149 Phase 0: dev/benchmark-only instrumentation for the shader/program
 *  first-use hitch investigation. Read-only against `renderer.info` (a public
 *  Three.js API — no source/node_modules patching) plus timing around calls
 *  the caller already makes. Never changes renderer/scene behaviour and is a
 *  no-op unless explicitly enabled. Intended to be deleted once Phase 0's two
 *  open questions (small-number-of-heavy-programs vs many-new-variants; are
 *  streamed program/material families stable enough to prewarm) are answered —
 *  nothing here is a long-term production system. */

export type ProgramCensusAttachKind = 'chunk-mesh-attach' | 'chunk-content-attach'
export type ProgramCensusStageKind = 'mirror-render' | 'postprocess-render'

export type ProgramCensusAttachEvent = {
  kind: ProgramCensusAttachKind
  frame: number
  tMs: number
  chunkKey: string
  /** `renderer.info.programs.length` at the moment of attach — attach itself
   *  never compiles a program (that happens lazily on first render), so this
   *  is a "before" baseline to diff against the next stage event. */
  programCount: number
  rootMaterialCount: number
  rootBucketCounts: Partial<Record<SceneBucket, number>>
}

export type ProgramCensusStageEvent = {
  kind: ProgramCensusStageKind
  frame: number
  tMs: number
  durationMs: number
  programCountBefore: number
  programCountAfter: number
  programDelta: number
}

export type ProgramCensusFrameSnapshot = {
  kind: 'frame-snapshot'
  frame: number
  tMs: number
  programCount: number
  programDelta: number
}

export type ProgramCensusMaterialSnapshot = {
  kind: 'material-snapshot'
  frame: number
  tMs: number
  programCount: number
  uniqueMaterialCount: number
  byBucket: Partial<Record<SceneBucket, number>>
  byType: Record<string, number>
}

export type ProgramCensusEvent =
  | ProgramCensusAttachEvent
  | ProgramCensusStageEvent
  | ProgramCensusFrameSnapshot
  | ProgramCensusMaterialSnapshot

export type ProgramCensusSummary = {
  frames: number
  programCountFinal: number
  programCountMax: number
  chunkAttachEvents: number
  /** Stage events whose program count changed during the call — the direct
   *  answer to "did first-use happen during mirror render, postprocess
   *  render, or neither". */
  stageGrowth: {
    kind: ProgramCensusStageKind
    events: number
    totalDelta: number
    maxDurationMs: number
  }[]
  /** The 10 slowest stage calls, for manual correlation against nearby
   *  chunk-attach events (same/adjacent `frame`). */
  slowestStages: ProgramCensusStageEvent[]
  finalMaterialSnapshot?: ProgramCensusMaterialSnapshot
}

export type ProgramCensus = {
  readonly enabled: boolean
  tickFrame: () => void
  recordChunkAttach: (
    kind: ProgramCensusAttachKind,
    chunkKey: string,
    roots: readonly (Object3D | undefined)[],
  ) => void
  beginStage: (kind: ProgramCensusStageKind) => void
  endStage: (kind: ProgramCensusStageKind) => void
  events: () => readonly ProgramCensusEvent[]
  summarize: () => ProgramCensusSummary
  reset: () => void
}

/** ~1/sec at 60 FPS. The full scene traversal this drives is only worth
 *  paying for occasionally — per-frame program-count deltas already come
 *  from the cheap `frame-snapshot` (a single array-length read). */
const MATERIAL_SNAPSHOT_EVERY_FRAMES = 60
/** Safety cap for a long-running session; a 30s `stream` benchmark stays
 *  well under this (frame-snapshots + stage events + attach events + ~30
 *  material-snapshots is a few thousand entries). */
const MAX_EVENTS = 20000

function collectMaterials(
  roots: Iterable<Object3D>,
): { count: number, byBucket: Partial<Record<SceneBucket, number>>, byType: Record<string, number> } {
  const seen = new Set<string>()
  const byBucket: Partial<Record<SceneBucket, number>> = {}
  const byType: Record<string, number> = {}
  for (const root of roots) {
    root.traverse((obj) => {
      const mesh = obj as { isMesh?: boolean, material?: Material | Material[] }
      if (!mesh.isMesh || !mesh.material) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const bucket = classifyObject(obj)
      for (const m of mats) {
        if (seen.has(m.uuid)) continue
        seen.add(m.uuid)
        byBucket[bucket] = (byBucket[bucket] ?? 0) + 1
        byType[m.type] = (byType[m.type] ?? 0) + 1
      }
    })
  }
  return { count: seen.size, byBucket, byType }
}

const NOOP_SUMMARY: ProgramCensusSummary = {
  frames: 0,
  programCountFinal: 0,
  programCountMax: 0,
  chunkAttachEvents: 0,
  stageGrowth: [],
  slowestStages: [],
}

const NOOP_CENSUS: ProgramCensus = {
  enabled: false,
  tickFrame: () => {},
  recordChunkAttach: () => {},
  beginStage: () => {},
  endStage: () => {},
  events: () => [],
  summarize: () => NOOP_SUMMARY,
  reset: () => {},
}

export function createProgramCensus(renderer: WebGLRenderer, scene: Scene, enabled: boolean): ProgramCensus {
  if (!enabled) return NOOP_CENSUS

  const events: ProgramCensusEvent[] = []
  const stageStart = new Map<ProgramCensusStageKind, { t0: number, before: number }>()
  let frame = 0
  let lastProgramCount = 0

  function programCount(): number {
    return renderer.info.programs?.length ?? 0
  }

  function push(event: ProgramCensusEvent): void {
    if (events.length >= MAX_EVENTS) events.shift()
    events.push(event)
  }

  return {
    enabled: true,
    tickFrame() {
      frame++
      const count = programCount()
      const delta = count - lastProgramCount
      lastProgramCount = count
      push({ kind: 'frame-snapshot', frame, tMs: performance.now(), programCount: count, programDelta: delta })
      if (frame % MATERIAL_SNAPSHOT_EVERY_FRAMES === 0) {
        const mats = collectMaterials([scene])
        push({
          kind: 'material-snapshot',
          frame,
          tMs: performance.now(),
          programCount: count,
          uniqueMaterialCount: mats.count,
          byBucket: mats.byBucket,
          byType: mats.byType,
        })
      }
    },
    recordChunkAttach(kind, chunkKey, roots) {
      const defined = roots.filter((r): r is Object3D => r !== undefined)
      const { count, byBucket } = collectMaterials(defined)
      push({
        kind,
        frame,
        tMs: performance.now(),
        chunkKey,
        programCount: programCount(),
        rootMaterialCount: count,
        rootBucketCounts: byBucket,
      })
    },
    beginStage(kind) {
      stageStart.set(kind, { t0: performance.now(), before: programCount() })
    },
    endStage(kind) {
      const start = stageStart.get(kind)
      if (!start) return
      stageStart.delete(kind)
      const after = programCount()
      push({
        kind,
        frame,
        tMs: performance.now(),
        durationMs: performance.now() - start.t0,
        programCountBefore: start.before,
        programCountAfter: after,
        programDelta: after - start.before,
      })
    },
    events: () => events,
    summarize() {
      let programCountMax = 0
      let chunkAttachEvents = 0
      let finalMaterialSnapshot: ProgramCensusMaterialSnapshot | undefined
      const growthByKind = new Map<ProgramCensusStageKind, { events: number, totalDelta: number, maxDurationMs: number }>()
      const stageEvents: ProgramCensusStageEvent[] = []
      for (const ev of events) {
        switch (ev.kind) {
          case 'chunk-content-attach':
          case 'chunk-mesh-attach':
            chunkAttachEvents++
            break
          case 'frame-snapshot':
            programCountMax = Math.max(programCountMax, ev.programCount)
            break
          case 'material-snapshot':
            programCountMax = Math.max(programCountMax, ev.programCount)
            finalMaterialSnapshot = ev
            break
          case 'mirror-render':
          case 'postprocess-render':
            stageEvents.push(ev)
            if (ev.programDelta > 0) {
              const g = growthByKind.get(ev.kind) ?? { events: 0, totalDelta: 0, maxDurationMs: 0 }
              g.events++
              g.totalDelta += ev.programDelta
              g.maxDurationMs = Math.max(g.maxDurationMs, ev.durationMs)
              growthByKind.set(ev.kind, g)
            }
            break
        }
      }
      const slowestStages = [...stageEvents].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10)
      return {
        frames: frame,
        programCountFinal: lastProgramCount,
        programCountMax,
        chunkAttachEvents,
        stageGrowth: [...growthByKind.entries()].map(([kind, g]) => ({ kind, ...g })),
        slowestStages,
        finalMaterialSnapshot,
      }
    },
    reset() {
      events.length = 0
      frame = 0
      lastProgramCount = programCount()
      stageStart.clear()
    },
  }
}

export function withProgramCensusStage(census: ProgramCensus, kind: ProgramCensusStageKind, fn: () => void): void {
  if (!census.enabled) {
    fn()
    return
  }
  census.beginStage(kind)
  try {
    fn()
  } finally {
    census.endStage(kind)
  }
}

let active: ProgramCensus = NOOP_CENSUS

export function setActiveProgramCensus(census: ProgramCensus | null): void {
  active = census ?? NOOP_CENSUS
}

export function getProgramCensus(): ProgramCensus {
  return active
}

declare global {
  interface Window {
    __seedvaleProgramCensus?: ProgramCensus
  }
}
