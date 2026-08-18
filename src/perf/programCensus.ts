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

export type ProgramCensusFirstUseEvent = {
  kind: 'program-first-use'
  frame: number
  tMs: number
  /** Three's own monotonically-increasing `WebGLProgram.id` — stable even if
   *  `renderer.info.programs` gets reshuffled by an eviction (unused-program
   *  release swaps the freed slot with the array's last entry). */
  programId: number
  /** Index into `renderer.info.programs` at the moment this program was first
   *  observed. Not stable across evictions — correlate across snapshots via
   *  `programId`/`cacheKey`, not this. */
  index: number
  /** `WebGLProgram.name` (= `material.name`). Usually `''` — most Seedvale
   *  materials don't set an explicit name. */
  name: string
  /** `WebGLProgram.cacheKey` — Three's own program-cache key, unique per
   *  distinct shader variant. Public instance property, typed in
   *  `@types/three` 0.185.x (`WebGLProgram.d.ts`). This is the direct answer
   *  to "how many distinct program families exist". */
  cacheKey: string
  /** `WebGLProgram.type` (= `material.type`, e.g. `MeshStandardMaterial`).
   *  Present at runtime (`WebGLProgram.js` sets `this.type = parameters.shaderType`)
   *  but not declared in `@types/three`'s `WebGLProgram.d.ts` for this Three
   *  version, so it's read defensively via an inline cast and may be
   *  `undefined` on a future Three release that drops the field. Reading a
   *  plain instance property Three already sets is not a patch of Three.js —
   *  no source/node_modules/prototype modification. Best available grouping
   *  key for "material/program family" (better signal than `name`, which is
   *  usually empty). */
  materialType: string | undefined
  usedTimes: number
  /** Which stage's `renderer.render()` call first-used this program, if any
   *  (`undefined` for a program that shows up between stages, e.g. during
   *  `tickFrame`'s own count check). */
  stage: ProgramCensusStageKind | undefined
  programCountBefore: number
  programCountAfter: number
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
  | ProgramCensusFirstUseEvent

export type ProgramCensusFamilyBreakdown = {
  /** Grouping key: `materialType` when available, else `name`, else `'unknown'`. */
  key: string
  count: number
  firstFrame: number
  sampleCacheKey: string
  sampleName: string
}

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
  /** Total number of distinct `WebGLProgram`s observed (one `program-first-use`
   *  event per program, deduped by object identity — see `dumpProgramFirstUse()`
   *  for the full per-program list with `cacheKey`/`name`/`materialType`). */
  firstUseEvents: number
  /** `program-first-use` events grouped by `materialType`/`name`, sorted by
   *  count desc — the "which material/program families created the ~230
   *  programs" breakdown (plan 149 open question). */
  programFamilies: ProgramCensusFamilyBreakdown[]
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
  /** Convenience filter over `events()` for just `program-first-use` records —
   *  the full per-program `id`/`name`/`cacheKey`/`materialType`/first-use-frame
   *  dump. Same data as `events()`, just pre-filtered for console use, e.g.
   *  `window.__seedvaleProgramCensus.dumpProgramFirstUse()`. */
  dumpProgramFirstUse: () => readonly ProgramCensusFirstUseEvent[]
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
  firstUseEvents: 0,
  programFamilies: [],
}

const NOOP_CENSUS: ProgramCensus = {
  enabled: false,
  tickFrame: () => {},
  recordChunkAttach: () => {},
  beginStage: () => {},
  endStage: () => {},
  events: () => [],
  dumpProgramFirstUse: () => [],
  summarize: () => NOOP_SUMMARY,
  reset: () => {},
}

export function createProgramCensus(renderer: WebGLRenderer, scene: Scene, enabled: boolean): ProgramCensus {
  if (!enabled) return NOOP_CENSUS

  const events: ProgramCensusEvent[] = []
  const stageStart = new Map<ProgramCensusStageKind, { t0: number, before: number }>()
  let frame = 0
  let lastProgramCount = 0
  /** Dedupe key for `program-first-use`: object identity of the `WebGLProgram`
   *  instance, not `cacheKey`, so a program that's evicted and later recreated
   *  under the same `cacheKey` is correctly reported as first-used again. */
  let seenPrograms = new WeakSet<object>()

  function programCount(): number {
    return renderer.info.programs?.length ?? 0
  }

  function push(event: ProgramCensusEvent): void {
    if (events.length >= MAX_EVENTS) events.shift()
    events.push(event)
  }

  /** Diffs `renderer.info.programs` against `seenPrograms` and pushes one
   *  `program-first-use` event per never-before-seen `WebGLProgram`. Called
   *  only when the caller already knows the count grew, so this stays a
   *  single array walk at an existing measurement point (`tickFrame`/
   *  `endStage`) — no extra render-loop hook, no polling. */
  function scanNewPrograms(stage: ProgramCensusStageKind | undefined, before: number, after: number): void {
    const programs = renderer.info.programs
    if (!programs) return
    programs.forEach((p, index) => {
      if (!p || seenPrograms.has(p)) return
      seenPrograms.add(p)
      // `type` is a real runtime field (`WebGLProgram.js`: `this.type = parameters.shaderType`)
      // that `@types/three` doesn't declare for this version — see the
      // `materialType` doc comment on `ProgramCensusFirstUseEvent`.
      const raw = p as unknown as { id?: number, name?: string, cacheKey?: string, usedTimes?: number, type?: string }
      push({
        kind: 'program-first-use',
        frame,
        tMs: performance.now(),
        programId: raw.id ?? -1,
        index,
        name: raw.name ?? '',
        cacheKey: raw.cacheKey ?? '',
        materialType: raw.type,
        usedTimes: raw.usedTimes ?? 0,
        stage,
        programCountBefore: before,
        programCountAfter: after,
      })
    })
  }

  return {
    enabled: true,
    tickFrame() {
      frame++
      const count = programCount()
      const before = lastProgramCount
      const delta = count - before
      lastProgramCount = count
      push({ kind: 'frame-snapshot', frame, tMs: performance.now(), programCount: count, programDelta: delta })
      // Catches first-use programs that show up outside a mirror/postprocess
      // stage boundary (e.g. a shadow-map render triggered elsewhere in the
      // frame). `endStage` covers the common case; this is the fallback.
      if (delta > 0) scanNewPrograms(undefined, before, count)
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
      if (after > start.before) scanNewPrograms(kind, start.before, after)
    },
    events: () => events,
    dumpProgramFirstUse: () => events.filter((e): e is ProgramCensusFirstUseEvent => e.kind === 'program-first-use'),
    summarize() {
      let programCountMax = 0
      let chunkAttachEvents = 0
      let finalMaterialSnapshot: ProgramCensusMaterialSnapshot | undefined
      let firstUseEvents = 0
      const growthByKind = new Map<ProgramCensusStageKind, { events: number, totalDelta: number, maxDurationMs: number }>()
      const stageEvents: ProgramCensusStageEvent[] = []
      const familyByKey = new Map<string, ProgramCensusFamilyBreakdown>()
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
          case 'program-first-use': {
            firstUseEvents++
            const key = ev.materialType || ev.name || 'unknown'
            const existing = familyByKey.get(key)
            if (existing) {
              existing.count++
            } else {
              familyByKey.set(key, { key, count: 1, firstFrame: ev.frame, sampleCacheKey: ev.cacheKey, sampleName: ev.name })
            }
            break
          }
        }
      }
      const slowestStages = [...stageEvents].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10)
      const programFamilies = [...familyByKey.values()].sort((a, b) => b.count - a.count)
      return {
        frames: frame,
        programCountFinal: lastProgramCount,
        programCountMax,
        chunkAttachEvents,
        stageGrowth: [...growthByKind.entries()].map(([kind, g]) => ({ kind, ...g })),
        slowestStages,
        finalMaterialSnapshot,
        firstUseEvents,
        programFamilies,
      }
    },
    reset() {
      events.length = 0
      frame = 0
      lastProgramCount = programCount()
      stageStart.clear()
      seenPrograms = new WeakSet<object>()
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
