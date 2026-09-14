import { describe, expect, it } from 'vitest'
import { setActiveMonitor } from './active'
import {
  buildGrassFinalizationReport,
  createGrassFinalizationDiag,
  formatGrassFinalizationReport,
} from './grassFinalizationDiag'
import { createPerfMonitor } from './monitor'

describe('grassFinalizationDiag', () => {
  it('is a no-op while perf monitoring is disabled', () => {
    const monitor = createPerfMonitor()
    setActiveMonitor(monitor)
    const diag = createGrassFinalizationDiag()
    diag.recordBuild({
      durationMs: 20,
      allocationSetupMs: 5,
      instanceMatrixBindMs: 1,
      boundsMs: 12,
      buckets: 4,
      instancedMeshes: 4,
      geometriesCreated: 4,
      instancedAttributesCreated: 20,
      instancesFull: 1000,
      instancesFiller: 200,
      matrixInstancesBound: 1200,
      sharedMaterialRefs: 4,
    })
    expect(diag.snapshot().chunksBuilt).toBe(0)
    setActiveMonitor(null)
  })

  it('accumulates per-chunk stages and formats a benchmark section', () => {
    const monitor = createPerfMonitor()
    monitor.setSource('benchmark', true)
    setActiveMonitor(monitor)
    const diag = createGrassFinalizationDiag()

    diag.recordBucket({
      id: 'tri',
      instances: 800,
      filler: false,
      allocationSetupMs: 4,
      instanceMatrixBindMs: 0.5,
      boundsMs: 8,
    })
    diag.recordBucket({
      id: 'filler',
      instances: 200,
      filler: true,
      allocationSetupMs: 1,
      instanceMatrixBindMs: 0.2,
      boundsMs: 2,
    })
    diag.recordBuild({
      durationMs: 17,
      allocationSetupMs: 5,
      instanceMatrixBindMs: 0.7,
      boundsMs: 10,
      buckets: 2,
      instancedMeshes: 2,
      geometriesCreated: 2,
      instancedAttributesCreated: 10,
      instancesFull: 800,
      instancesFiller: 200,
      matrixInstancesBound: 1000,
      sharedMaterialRefs: 2,
    })
    diag.recordLodApply(1.5, 4)
    diag.recordSceneAttach(0.4)
    diag.recordCallback(19, 4096)
    diag.recordDiscarded('unloaded')

    const report = buildGrassFinalizationReport(diag.snapshot())
    expect(report).not.toBeNull()
    expect(report!.chunks).toBe(1)
    expect(report!.build.avgMs).toBe(17)
    expect(report!.boundsFinalize.avgMs).toBe(10)
    expect(report!.bySpecies.tri.instances).toBe(800)
    expect(report!.discardedUnloaded).toBe(1)
    const text = formatGrassFinalizationReport(report!)
    expect(text).toContain('[Seedvale Grass Finalization]')
    expect(text).toContain('buildGrassChunkMeshes')
    expect(text).toContain('computeBoundingSphere')
    expect(text).toContain('scene.add')
    expect(text).toContain('tri:')
    setActiveMonitor(null)
  })
})
