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
  /** FNV-1a hash of `gl.getShaderSource(program.vertexShader)` — cheap,
   *  synchronous, distinguishes "same cacheKey-relevant params but different
   *  generated GLSL" from "genuinely identical shader". `undefined` when the
   *  GL context/shader source isn't readable (e.g. in unit tests, or if the
   *  shader was already released by the time the scan ran). */
  vertexShaderHash: string | undefined
  /** Same as {@link vertexShaderHash} for the fragment stage. */
  fragmentShaderHash: string | undefined
  /** Best-effort attribution: the material whose `currentProgram` (read via
   *  `renderer.properties`) matched this program by object identity at scan
   *  time. `undefined` if no material in the scene currently points at it. */
  materialUuid: string | undefined
  materialName: string | undefined
  materialBucket: SceneBucket | undefined
  /** `material.defines` at scan time, if the material declares any — the
   *  direct cause of a cacheKey difference for `ShaderMaterial`-style
   *  variants (see `getProgramCacheKey` in three's `WebGLPrograms.js`). */
  defines: Record<string, unknown> | undefined
  /** Small curated set of cacheKey-relevant material flags, read generically
   *  (duck-typed) so this works across material subtypes without importing
   *  each one. Not exhaustive — `MeshStandardMaterial`'s cacheKey also
   *  depends on light counts/shadow types that live on the renderer, not the
   *  material, and aren't captured here. */
  flags: Record<string, string> | undefined
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

/** FNV-1a 32-bit — synchronous and good enough to tell "different generated
 *  GLSL" from "identical", which is all the diagnostic report needs. Not a
 *  cryptographic hash. */
function hashShaderSource(src: string): string {
  let h = 2166136261
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

/** Reads back the compiled shader source via the public `gl.getShaderSource`
 *  API (read-only, no Three.js patching) and hashes it. Three deletes the
 *  underlying `WebGLShader`s on a program's first use (`WebGLProgram.js`'s
 *  `onFirstUse`), but doesn't detach them from the program first (iOS
 *  crash workaround, see that file), so the source stays queryable until the
 *  program itself is destroyed. Never throws — worst case both hashes are
 *  `undefined`. */
function readShaderHashes(
  renderer: WebGLRenderer,
  p: { vertexShader?: WebGLShader, fragmentShader?: WebGLShader },
): { vertexShaderHash: string | undefined, fragmentShaderHash: string | undefined } {
  try {
    const gl = renderer.getContext()
    const vSrc = p.vertexShader ? gl.getShaderSource(p.vertexShader) : null
    const fSrc = p.fragmentShader ? gl.getShaderSource(p.fragmentShader) : null
    return {
      vertexShaderHash: vSrc ? hashShaderSource(vSrc) : undefined,
      fragmentShaderHash: fSrc ? hashShaderSource(fSrc) : undefined,
    }
  } catch {
    return { vertexShaderHash: undefined, fragmentShaderHash: undefined }
  }
}

const FLAG_KEYS = ['transparent', 'alphaTest', 'vertexColors', 'fog', 'wireframe', 'flatShading', 'skinning', 'morphTargets'] as const

/** Duck-typed so it works across `MeshStandardMaterial`/`ShaderMaterial`/etc.
 *  without importing each subtype — see the `flags` doc comment on
 *  {@link ProgramCensusFirstUseEvent}. */
function readMaterialFlags(m: Material): Record<string, string> {
  const mm = m as Material & Partial<Record<(typeof FLAG_KEYS)[number], unknown>> & { map?: unknown, normalMap?: unknown, envMap?: unknown }
  const flags: Record<string, string> = {}
  for (const key of FLAG_KEYS) {
    if (mm[key] !== undefined) flags[key] = String(mm[key])
  }
  flags.map = String(!!mm.map)
  flags.normalMap = String(!!mm.normalMap)
  flags.envMap = String(!!mm.envMap)
  return flags
}

type ProgramAttribution = {
  materialUuid: string
  materialName: string
  bucket: SceneBucket
  defines: Record<string, unknown> | undefined
  flags: Record<string, string>
}

/** Best-effort program → material attribution for the diagnostic report
 *  only. Reads `renderer.properties` (a public `WebGLRenderer` field, typed
 *  in `@types/three`'s `WebGLRenderer.d.ts`) to find which material's
 *  `currentProgram` (set in `WebGLRenderer.js` right after program
 *  acquisition) matches a just-created `WebGLProgram` by object identity.
 *  One scene traversal per call — only invoked from `scanNewPrograms`, i.e.
 *  the handful of times per benchmark the program count actually grows.
 *  Never throws: an unmatched or unavailable program simply gets no
 *  attribution. */
function buildProgramAttribution(renderer: WebGLRenderer, scene: Scene): Map<object, ProgramAttribution> {
  const map = new Map<object, ProgramAttribution>()
  const props = (renderer as unknown as { properties?: { get: (o: unknown) => unknown } }).properties
  if (!props) return map
  scene.traverse((obj) => {
    const mesh = obj as { isMesh?: boolean, material?: Material | Material[] }
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const bucket = classifyObject(obj)
    for (const m of mats) {
      let matProps: unknown
      try {
        matProps = props.get(m)
      } catch {
        continue
      }
      const program = (matProps as { currentProgram?: object } | undefined)?.currentProgram
      if (!program || map.has(program)) continue
      map.set(program, {
        materialUuid: m.uuid,
        materialName: m.name,
        bucket,
        defines: (m as unknown as { defines?: Record<string, unknown> }).defines,
        flags: readMaterialFlags(m),
      })
    }
  })
  return map
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
    const attribution = buildProgramAttribution(renderer, scene)
    programs.forEach((p, index) => {
      if (!p || seenPrograms.has(p)) return
      seenPrograms.add(p)
      // `type` is a real runtime field (`WebGLProgram.js`: `this.type = parameters.shaderType`)
      // that `@types/three` doesn't declare for this version — see the
      // `materialType` doc comment on `ProgramCensusFirstUseEvent`.
      const raw = p as unknown as { id?: number, name?: string, cacheKey?: string, usedTimes?: number, type?: string, vertexShader?: WebGLShader, fragmentShader?: WebGLShader }
      const hashes = readShaderHashes(renderer, raw)
      const attr = attribution.get(p)
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
        vertexShaderHash: hashes.vertexShaderHash,
        fragmentShaderHash: hashes.fragmentShaderHash,
        materialUuid: attr?.materialUuid,
        materialName: attr?.materialName,
        materialBucket: attr?.bucket,
        defines: attr?.defines,
        flags: attr?.flags,
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

/** Groups `program-first-use` events by frame and formats one readable
 *  report for `console.log` at the end of a benchmark run. The frame with
 *  the most new programs — the "largest transition" (e.g. the `43 → 54`
 *  first-use hitch from the 2026-09-01 census, `docs/performance/audits/
 *  2026-09-01--program-census.md`) — gets full per-program detail plus a
 *  same-materialType diff, since that's the concrete "why did these end up
 *  as separate cache entries" question the census alone could only gesture
 *  at. Read-only over `census.dumpProgramFirstUse()`/`summarize()`; does not
 *  itself touch the renderer or scene. */
export function formatProgramCensusReport(census: ProgramCensus): string {
  if (!census.enabled) return '[Seedvale Program Census] disabled'
  const dump = census.dumpProgramFirstUse()
  if (dump.length === 0) return '[Seedvale Program Census]\n\nNo new programs were created during this run.'

  const byFrame = new Map<number, ProgramCensusFirstUseEvent[]>()
  for (const ev of dump) {
    const list = byFrame.get(ev.frame) ?? []
    list.push(ev)
    byFrame.set(ev.frame, list)
  }
  const frames = [...byFrame.keys()].sort((a, b) => a - b)
  let largestFrame = frames[0]!
  for (const f of frames) {
    if (byFrame.get(f)!.length > byFrame.get(largestFrame)!.length) largestFrame = f
  }
  const largestGroup = byFrame.get(largestFrame)!

  const byFrameLines = frames.map((f) => {
    const n = byFrame.get(f)!.length
    return `  frame ${f}   +${n} program${n === 1 ? '' : 's'}${f === largestFrame ? '   <== largest transition' : ''}`
  })

  const detailLines = largestGroup.map(formatProgramFirstUseLine)

  const byType = new Map<string, ProgramCensusFirstUseEvent[]>()
  for (const ev of largestGroup) {
    const key = ev.materialType ?? 'unknown'
    const list = byType.get(key) ?? []
    list.push(ev)
    byType.set(key, list)
  }
  const diffLines: string[] = []
  for (const [type, group] of byType) {
    diffLines.push(`  ${type} (${group.length} program${group.length === 1 ? '' : 's'}):`)
    if (group.length < 2) {
      diffLines.push('    (only one program of this type in this frame — nothing to diff)')
      continue
    }
    const lines = diffProgramGroup(group)
    diffLines.push(...(lines.length > 0
      ? lines
      : ['    (no define/flag/shader-hash differences found — check cacheKey/material inputs directly)']))
  }

  const summary = census.summarize()
  return [
    '[Seedvale Program Census]',
    '',
    `Programs created: ${dump.length}`,
    `Program count: final=${summary.programCountFinal} max=${summary.programCountMax}`,
    '',
    'By frame:',
    ...byFrameLines,
    '',
    `Largest transition — frame ${largestFrame} (+${largestGroup.length} programs):`,
    ...detailLines,
    '',
    `Differences within frame ${largestFrame} (grouped by material type):`,
    ...diffLines,
  ].join('\n')
}

function formatProgramFirstUseLine(ev: ProgramCensusFirstUseEvent): string {
  const head = [
    `  #${ev.programId}`,
    `type=${ev.materialType ?? 'unknown'}`,
    `name='${ev.name}'`,
    ev.materialBucket ? `bucket=${ev.materialBucket}` : null,
    `cacheKey=${ev.cacheKey.slice(0, 24)}${ev.cacheKey.length > 24 ? '…' : ''}`,
    ev.vertexShaderHash ? `vHash=${ev.vertexShaderHash}` : null,
    ev.fragmentShaderHash ? `fHash=${ev.fragmentShaderHash}` : null,
    ev.stage ? `stage=${ev.stage}` : null,
  ].filter((p): p is string => p !== null).join(' ')
  const lines = [head]
  if (ev.defines && Object.keys(ev.defines).length > 0) lines.push(`      defines=${JSON.stringify(ev.defines)}`)
  if (ev.flags) lines.push(`      flags=${JSON.stringify(ev.flags)}`)
  if (ev.materialUuid) lines.push(`      material=${ev.materialUuid}${ev.materialName ? ` (${ev.materialName})` : ''}`)
  return lines.join('\n')
}

/** Pairwise-over-the-whole-group diff of the fields most likely to explain a
 *  separate `cacheKey`: shader hashes, scene bucket, `defines`, and the
 *  curated flag set — one line per field that isn't identical across every
 *  program in `group`. */
function diffProgramGroup(group: ProgramCensusFirstUseEvent[]): string[] {
  const lines: string[] = []
  const ids = (i: number) => `#${group[i]!.programId}`

  const vHashes = group.map((e) => e.vertexShaderHash ?? '(unknown)')
  if (new Set(vHashes).size > 1) lines.push(`    vertexShaderHash differs: ${vHashes.map((v, i) => `${ids(i)}=${v}`).join(', ')}`)

  const fHashes = group.map((e) => e.fragmentShaderHash ?? '(unknown)')
  if (new Set(fHashes).size > 1) lines.push(`    fragmentShaderHash differs: ${fHashes.map((v, i) => `${ids(i)}=${v}`).join(', ')}`)

  const buckets = group.map((e) => e.materialBucket ?? '(unknown)')
  if (new Set(buckets).size > 1) lines.push(`    bucket differs: ${buckets.map((v, i) => `${ids(i)}=${v}`).join(', ')}`)

  const defineKeys = new Set<string>()
  for (const e of group) if (e.defines) for (const k of Object.keys(e.defines)) defineKeys.add(k)
  for (const key of [...defineKeys].sort()) {
    const values = group.map((e) => String(e.defines?.[key] ?? '(unset)'))
    if (!values.every((v) => v === values[0])) {
      lines.push(`    define ${key} differs: ${values.map((v, i) => `${ids(i)}=${v}`).join(', ')}`)
    }
  }

  const flagKeys = new Set<string>()
  for (const e of group) if (e.flags) for (const k of Object.keys(e.flags)) flagKeys.add(k)
  for (const key of [...flagKeys].sort()) {
    const values = group.map((e) => e.flags?.[key] ?? '(unknown)')
    if (!values.every((v) => v === values[0])) {
      lines.push(`    flag ${key} differs: ${values.map((v, i) => `${ids(i)}=${v}`).join(', ')}`)
    }
  }
  return lines
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
