import type { GrassSpeciesId } from '../terrain/grassPlacement'
import { GRASS_SPECIES_ORDER } from '../terrain/grassPlacement'
import { getMonitor } from './active'

/**
 * Main-thread grass *finalization* diagnostics — the work after a worker
 * `GrassChunkData` lands (`buildGrassChunkMeshes`, LOD apply, `scene.add`),
 * not worker placement. Only records while `getMonitor().isEnabled()`.
 *
 * Stage names match `grass.ts` / `chunkManager.ensureGrass`:
 *   allocation/setup     Group + InstancedBufferAttributes + BufferGeometry
 *                        + InstancedMesh + flags/layers (`buildGrassChunkMeshes`)
 *   instanceMatrix bind  wrap transferred `bucket.matrices` (no JS write loop)
 *   bounds/finalize      assign worker-computed `bucket.bounds` onto the mesh
 *   lod apply            `setLodFraction` + `setGeometryLod` + debug visibility
 *   scene attach         `scene.add(grass.mesh)`
 */

export type GrassFinalizationStageStats = {
  count: number
  sumMs: number
  maxMs: number
}

export type GrassSpeciesFinalizationStats = {
  buckets: number
  instances: number
  instancesMax: number
  meshes: number
  allocationSetupMs: GrassFinalizationStageStats
  instanceMatrixBindMs: GrassFinalizationStageStats
  boundsMs: GrassFinalizationStageStats
}

export type GrassFinalizationDiagTotals = {
  chunksBuilt: number
  chunksEmpty: number
  discardedUnloaded: number
  discardedOutOfRange: number
  buildMs: GrassFinalizationStageStats
  allocationSetupMs: GrassFinalizationStageStats
  instanceMatrixBindMs: GrassFinalizationStageStats
  boundsMs: GrassFinalizationStageStats
  lodApplyMs: GrassFinalizationStageStats
  sceneAttachMs: GrassFinalizationStageStats
  callbackMs: GrassFinalizationStageStats
  buckets: number
  instancedMeshes: number
  instancedMeshesMax: number
  geometriesCreated: number
  geometriesCreatedMax: number
  geometriesAfterLod: number
  geometriesAfterLodMax: number
  instancedAttributesCreated: number
  instancesFull: number
  instancesFullMax: number
  instancesFiller: number
  instancesFillerMax: number
  instancesPerChunkMax: number
  matrixInstancesBound: number
  sharedMaterialRefs: number
  heapDeltaSumBytes: number
  heapDeltaMaxBytes: number
  heapSamples: number
  bySpecies: Record<GrassSpeciesId, GrassSpeciesFinalizationStats>
}

export type GrassFinalizationReport = {
  chunks: number
  chunksEmpty: number
  discardedUnloaded: number
  discardedOutOfRange: number
  build: { avgMs: number; maxMs: number }
  allocationSetup: { avgMs: number; maxMs: number }
  instanceMatrixBind: { avgMs: number; maxMs: number }
  boundsFinalize: { avgMs: number; maxMs: number }
  lodApply: { avgMs: number; maxMs: number }
  sceneAttach: { avgMs: number; maxMs: number }
  callback: { avgMs: number; maxMs: number }
  perChunk: {
    instancesAvg: number
    instancesMax: number
    meshesAvg: number
    meshesMax: number
    geometriesAvg: number
    geometriesMax: number
    geometriesAfterLodAvg: number
    geometriesAfterLodMax: number
  }
  instancesFull: number
  instancesFiller: number
  matrixInstancesBound: number
  instancedAttributesCreated: number
  sharedMaterialRefs: number
  heapDeltaAvgKb: number | null
  heapDeltaMaxKb: number | null
  bySpecies: Record<
    GrassSpeciesId,
    {
      buckets: number
      instances: number
      instancesMax: number
      meshes: number
      allocationSetupAvgMs: number
      allocationSetupMaxMs: number
      instanceMatrixBindAvgMs: number
      instanceMatrixBindMaxMs: number
      boundsAvgMs: number
      boundsMaxMs: number
    }
  >
}

export type GrassBucketStageSample = {
  id: GrassSpeciesId
  instances: number
  filler: boolean
  allocationSetupMs: number
  instanceMatrixBindMs: number
  boundsMs: number
}

export type GrassBuildSample = {
  durationMs: number
  allocationSetupMs: number
  instanceMatrixBindMs: number
  boundsMs: number
  buckets: number
  instancedMeshes: number
  geometriesCreated: number
  instancedAttributesCreated: number
  instancesFull: number
  instancesFiller: number
  matrixInstancesBound: number
  sharedMaterialRefs: number
}

export type GrassFinalizationDiag = {
  isEnabled: () => boolean
  recordDiscarded: (reason: 'unloaded' | 'outOfRange') => void
  recordEmptyBuild: () => void
  recordBucket: (sample: GrassBucketStageSample) => void
  recordBuild: (sample: GrassBuildSample) => void
  recordLodApply: (durationMs: number, geometriesAfterLod?: number) => void
  recordSceneAttach: (durationMs: number) => void
  recordCallback: (durationMs: number, heapDeltaBytes: number | null) => void
  snapshot: () => GrassFinalizationDiagTotals
  reset: () => void
}

function emptyStage(): GrassFinalizationStageStats {
  return { count: 0, sumMs: 0, maxMs: 0 }
}

function emptySpecies(): GrassSpeciesFinalizationStats {
  return {
    buckets: 0,
    instances: 0,
    instancesMax: 0,
    meshes: 0,
    allocationSetupMs: emptyStage(),
    instanceMatrixBindMs: emptyStage(),
    boundsMs: emptyStage(),
  }
}

function emptyTotals(): GrassFinalizationDiagTotals {
  const bySpecies = {} as Record<GrassSpeciesId, GrassSpeciesFinalizationStats>
  for (const id of GRASS_SPECIES_ORDER) bySpecies[id] = emptySpecies()
  return {
    chunksBuilt: 0,
    chunksEmpty: 0,
    discardedUnloaded: 0,
    discardedOutOfRange: 0,
    buildMs: emptyStage(),
    allocationSetupMs: emptyStage(),
    instanceMatrixBindMs: emptyStage(),
    boundsMs: emptyStage(),
    lodApplyMs: emptyStage(),
    sceneAttachMs: emptyStage(),
    callbackMs: emptyStage(),
    buckets: 0,
    instancedMeshes: 0,
    instancedMeshesMax: 0,
    geometriesCreated: 0,
    geometriesCreatedMax: 0,
    geometriesAfterLod: 0,
    geometriesAfterLodMax: 0,
    instancedAttributesCreated: 0,
    instancesFull: 0,
    instancesFullMax: 0,
    instancesFiller: 0,
    instancesFillerMax: 0,
    instancesPerChunkMax: 0,
    matrixInstancesBound: 0,
    sharedMaterialRefs: 0,
    heapDeltaSumBytes: 0,
    heapDeltaMaxBytes: 0,
    heapSamples: 0,
    bySpecies,
  }
}

function addStage(stage: GrassFinalizationStageStats, ms: number): void {
  stage.count += 1
  stage.sumMs += ms
  if (ms > stage.maxMs) stage.maxMs = ms
}

function stageAvgMax(stage: GrassFinalizationStageStats): { avgMs: number; maxMs: number } {
  return {
    avgMs: round2(stage.count > 0 ? stage.sumMs / stage.count : 0),
    maxMs: round2(stage.maxMs),
  }
}

export function createGrassFinalizationDiag(): GrassFinalizationDiag {
  let totals = emptyTotals()

  return {
    isEnabled: () => getMonitor().isEnabled(),
    recordDiscarded(reason) {
      if (!this.isEnabled()) return
      if (reason === 'unloaded') totals.discardedUnloaded += 1
      else totals.discardedOutOfRange += 1
    },
    recordEmptyBuild() {
      if (!this.isEnabled()) return
      totals.chunksEmpty += 1
    },
    recordBucket(sample) {
      if (!this.isEnabled()) return
      const row = totals.bySpecies[sample.id]
      row.buckets += 1
      row.instances += sample.instances
      if (sample.instances > row.instancesMax) row.instancesMax = sample.instances
      row.meshes += 1
      addStage(row.allocationSetupMs, sample.allocationSetupMs)
      addStage(row.instanceMatrixBindMs, sample.instanceMatrixBindMs)
      addStage(row.boundsMs, sample.boundsMs)
    },
    recordBuild(sample) {
      if (!this.isEnabled()) return
      totals.chunksBuilt += 1
      addStage(totals.buildMs, sample.durationMs)
      addStage(totals.allocationSetupMs, sample.allocationSetupMs)
      addStage(totals.instanceMatrixBindMs, sample.instanceMatrixBindMs)
      addStage(totals.boundsMs, sample.boundsMs)
      totals.buckets += sample.buckets
      totals.instancedMeshes += sample.instancedMeshes
      if (sample.instancedMeshes > totals.instancedMeshesMax) {
        totals.instancedMeshesMax = sample.instancedMeshes
      }
      totals.geometriesCreated += sample.geometriesCreated
      if (sample.geometriesCreated > totals.geometriesCreatedMax) {
        totals.geometriesCreatedMax = sample.geometriesCreated
      }
      totals.instancedAttributesCreated += sample.instancedAttributesCreated
      totals.instancesFull += sample.instancesFull
      if (sample.instancesFull > totals.instancesFullMax) {
        totals.instancesFullMax = sample.instancesFull
      }
      totals.instancesFiller += sample.instancesFiller
      if (sample.instancesFiller > totals.instancesFillerMax) {
        totals.instancesFillerMax = sample.instancesFiller
      }
      const instancesThisChunk = sample.instancesFull + sample.instancesFiller
      if (instancesThisChunk > totals.instancesPerChunkMax) {
        totals.instancesPerChunkMax = instancesThisChunk
      }
      totals.matrixInstancesBound += sample.matrixInstancesBound
      totals.sharedMaterialRefs += sample.sharedMaterialRefs
    },
    recordLodApply(durationMs, geometriesAfterLod) {
      if (!this.isEnabled()) return
      addStage(totals.lodApplyMs, durationMs)
      if (geometriesAfterLod != null) {
        totals.geometriesAfterLod += geometriesAfterLod
        if (geometriesAfterLod > totals.geometriesAfterLodMax) {
          totals.geometriesAfterLodMax = geometriesAfterLod
        }
      }
    },
    recordSceneAttach(durationMs) {
      if (!this.isEnabled()) return
      addStage(totals.sceneAttachMs, durationMs)
    },
    recordCallback(durationMs, heapDeltaBytes) {
      if (!this.isEnabled()) return
      addStage(totals.callbackMs, durationMs)
      if (heapDeltaBytes != null && Number.isFinite(heapDeltaBytes)) {
        totals.heapSamples += 1
        totals.heapDeltaSumBytes += heapDeltaBytes
        if (heapDeltaBytes > totals.heapDeltaMaxBytes) totals.heapDeltaMaxBytes = heapDeltaBytes
      }
    },
    snapshot() {
      return totals
    },
    reset() {
      totals = emptyTotals()
    },
  }
}

const NOOP: GrassFinalizationDiag = {
  isEnabled: () => false,
  recordDiscarded: () => {},
  recordEmptyBuild: () => {},
  recordBucket: () => {},
  recordBuild: () => {},
  recordLodApply: () => {},
  recordSceneAttach: () => {},
  recordCallback: () => {},
  snapshot: () => emptyTotals(),
  reset: () => {},
}

let active: GrassFinalizationDiag = createGrassFinalizationDiag()

export function setActiveGrassFinalizationDiag(diag: GrassFinalizationDiag | null): void {
  active = diag ?? NOOP
}

export function getGrassFinalizationDiag(): GrassFinalizationDiag {
  return active
}

export function readJsHeapUsedBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
  const used = memory?.usedJSHeapSize
  return typeof used === 'number' && Number.isFinite(used) ? used : null
}

export function buildGrassFinalizationReport(
  totals: GrassFinalizationDiagTotals,
): GrassFinalizationReport | null {
  if (
    totals.chunksBuilt === 0
    && totals.chunksEmpty === 0
    && totals.discardedUnloaded === 0
    && totals.discardedOutOfRange === 0
  ) {
    return null
  }
  const n = Math.max(1, totals.chunksBuilt)
  const instancesTotal = totals.instancesFull + totals.instancesFiller
  const bySpecies = {} as GrassFinalizationReport['bySpecies']
  for (const id of GRASS_SPECIES_ORDER) {
    const row = totals.bySpecies[id]
    bySpecies[id] = {
      buckets: row.buckets,
      instances: row.instances,
      instancesMax: row.instancesMax,
      meshes: row.meshes,
      allocationSetupAvgMs: stageAvgMax(row.allocationSetupMs).avgMs,
      allocationSetupMaxMs: stageAvgMax(row.allocationSetupMs).maxMs,
      instanceMatrixBindAvgMs: stageAvgMax(row.instanceMatrixBindMs).avgMs,
      instanceMatrixBindMaxMs: stageAvgMax(row.instanceMatrixBindMs).maxMs,
      boundsAvgMs: stageAvgMax(row.boundsMs).avgMs,
      boundsMaxMs: stageAvgMax(row.boundsMs).maxMs,
    }
  }
  return {
    chunks: totals.chunksBuilt,
    chunksEmpty: totals.chunksEmpty,
    discardedUnloaded: totals.discardedUnloaded,
    discardedOutOfRange: totals.discardedOutOfRange,
    build: stageAvgMax(totals.buildMs),
    allocationSetup: stageAvgMax(totals.allocationSetupMs),
    instanceMatrixBind: stageAvgMax(totals.instanceMatrixBindMs),
    boundsFinalize: stageAvgMax(totals.boundsMs),
    lodApply: stageAvgMax(totals.lodApplyMs),
    sceneAttach: stageAvgMax(totals.sceneAttachMs),
    callback: stageAvgMax(totals.callbackMs),
    perChunk: {
      instancesAvg: round1(instancesTotal / n),
      instancesMax: totals.instancesPerChunkMax,
      meshesAvg: round2(totals.instancedMeshes / n),
      meshesMax: totals.instancedMeshesMax,
      geometriesAvg: round2(totals.geometriesCreated / n),
      geometriesMax: totals.geometriesCreatedMax,
      geometriesAfterLodAvg: round2(totals.geometriesAfterLod / Math.max(1, totals.lodApplyMs.count)),
      geometriesAfterLodMax: totals.geometriesAfterLodMax,
    },
    instancesFull: totals.instancesFull,
    instancesFiller: totals.instancesFiller,
    matrixInstancesBound: totals.matrixInstancesBound,
    instancedAttributesCreated: totals.instancedAttributesCreated,
    sharedMaterialRefs: totals.sharedMaterialRefs,
    heapDeltaAvgKb: totals.heapSamples > 0
      ? round1(totals.heapDeltaSumBytes / totals.heapSamples / 1024)
      : null,
    heapDeltaMaxKb: totals.heapSamples > 0
      ? round1(totals.heapDeltaMaxBytes / 1024)
      : null,
    bySpecies,
  }
}

export function formatGrassFinalizationReport(report: GrassFinalizationReport): string {
  const heapLine = report.heapDeltaAvgKb == null
    ? '  heap delta: (performance.memory unavailable)'
    : `  heap delta avg/max: ${report.heapDeltaAvgKb.toFixed(1)} / ${report.heapDeltaMaxKb!.toFixed(1)} KB`
  const speciesLines = GRASS_SPECIES_ORDER.map((id) => {
    const row = report.bySpecies[id]
    return [
      `  ${id}:`,
      `    buckets/meshes: ${row.buckets}/${row.meshes}`,
      `    instances: ${row.instances} (max ${row.instancesMax})`,
      `    allocation/setup avg/max: ${row.allocationSetupAvgMs.toFixed(2)} / ${row.allocationSetupMaxMs.toFixed(2)} ms`,
      `    instanceMatrix bind avg/max: ${row.instanceMatrixBindAvgMs.toFixed(2)} / ${row.instanceMatrixBindMaxMs.toFixed(2)} ms`,
      `    bounds/finalize avg/max: ${row.boundsAvgMs.toFixed(2)} / ${row.boundsMaxMs.toFixed(2)} ms`,
    ].join('\n')
  })
  return [
    '[Seedvale Grass Finalization]',
    '',
    'Grass finalization:',
    `  chunks: ${report.chunks}`,
    `  empty builds (no instances): ${report.chunksEmpty}`,
    `  discarded unloaded/out-of-range: ${report.discardedUnloaded}/${report.discardedOutOfRange}`,
    '',
    '  build total (`buildGrassChunkMeshes`):',
    `    avg ${report.build.avgMs.toFixed(2)} ms`,
    `    max ${report.build.maxMs.toFixed(2)} ms`,
    '',
    '  allocation/setup:',
    `    avg ${report.allocationSetup.avgMs.toFixed(2)} ms`,
    `    max ${report.allocationSetup.maxMs.toFixed(2)} ms`,
    '  instanceMatrix bind:',
    `    avg ${report.instanceMatrixBind.avgMs.toFixed(2)} ms`,
    `    max ${report.instanceMatrixBind.maxMs.toFixed(2)} ms`,
    '  bounds/finalize (apply worker bounds):',
    `    avg ${report.boundsFinalize.avgMs.toFixed(2)} ms`,
    `    max ${report.boundsFinalize.maxMs.toFixed(2)} ms`,
    '  lod apply (`setLodFraction` / `setGeometryLod`):',
    `    avg ${report.lodApply.avgMs.toFixed(2)} ms`,
    `    max ${report.lodApply.maxMs.toFixed(2)} ms`,
    '  scene attach (`scene.add`):',
    `    avg ${report.sceneAttach.avgMs.toFixed(2)} ms`,
    `    max ${report.sceneAttach.maxMs.toFixed(2)} ms`,
    '  callback total (build + lod + attach):',
    `    avg ${report.callback.avgMs.toFixed(2)} ms`,
    `    max ${report.callback.maxMs.toFixed(2)} ms`,
    '',
    '  per chunk:',
    `    instances avg/max ${report.perChunk.instancesAvg.toFixed(1)} / ${report.perChunk.instancesMax}`,
    `    meshes avg/max ${report.perChunk.meshesAvg.toFixed(2)} / ${report.perChunk.meshesMax}`,
    `    geometries avg/max ${report.perChunk.geometriesAvg.toFixed(2)} / ${report.perChunk.geometriesMax}`,
    `    geometries after lod apply avg/max ${report.perChunk.geometriesAfterLodAvg.toFixed(2)} / ${report.perChunk.geometriesAfterLodMax}`,
    `    instances full/filler: ${report.instancesFull} / ${report.instancesFiller}`,
    `    matrix instances bound: ${report.matrixInstancesBound}`,
    `    instanced attributes created: ${report.instancedAttributesCreated}`,
    `    shared material refs: ${report.sharedMaterialRefs}`,
    heapLine,
    '',
    '  by species bucket:',
    ...speciesLines,
  ].join('\n')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
