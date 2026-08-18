import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, type WebGLRenderer } from 'three'
import { describe, expect, it } from 'vitest'
import { createProgramCensus, withProgramCensusStage } from './programCensus'

function fakeRenderer(programs: unknown[]): WebGLRenderer {
  return { info: { programs } } as unknown as WebGLRenderer
}

function namedMesh(name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
  mesh.name = name
  return mesh
}

describe('createProgramCensus disabled', () => {
  it('is a no-op that never records', () => {
    const programs: unknown[] = []
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), false)
    expect(census.enabled).toBe(false)
    census.tickFrame()
    census.recordChunkAttach('chunk-mesh-attach', 'k', [namedMesh('chunk')])
    withProgramCensusStage(census, 'mirror-render', () => {})
    expect(census.events()).toHaveLength(0)
    expect(census.summarize().frames).toBe(0)
  })
})

describe('createProgramCensus enabled', () => {
  it('records a frame-snapshot with the current program count on every tick', () => {
    const programs: unknown[] = [{}, {}]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    census.tickFrame()
    const events = census.events()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'frame-snapshot', frame: 1, programCount: 2, programDelta: 2 })
  })

  it('emits a material-snapshot every 60th frame, bucketed by scene classification', () => {
    const programs: unknown[] = [{}]
    const scene = new Scene()
    const group = new Group()
    group.name = 'chunk-vegetation-tree-living'
    group.add(namedMesh('leaf'))
    scene.add(group)
    scene.add(namedMesh('chunk'))
    const census = createProgramCensus(fakeRenderer(programs), scene, true)
    for (let i = 0; i < 59; i++) census.tickFrame()
    expect(census.events().some((e) => e.kind === 'material-snapshot')).toBe(false)
    census.tickFrame()
    const snapshot = census.events().find((e) => e.kind === 'material-snapshot')
    expect(snapshot).toMatchObject({
      frame: 60,
      uniqueMaterialCount: 2,
      byBucket: { vegetation: 1, terrain: 1 },
    })
  })

  it('records chunk attach with per-root material counts and buckets, without a program-cache side effect', () => {
    const programs: unknown[] = [{}, {}, {}]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    const terrain = namedMesh('chunk')
    census.recordChunkAttach('chunk-mesh-attach', '0,0', [terrain])
    const [event] = census.events()
    expect(event).toMatchObject({
      kind: 'chunk-mesh-attach',
      chunkKey: '0,0',
      programCount: 3,
      rootMaterialCount: 1,
      rootBucketCounts: { terrain: 1 },
    })
  })

  it('ignores undefined roots passed from an optional attach slot', () => {
    const census = createProgramCensus(fakeRenderer([]), new Scene(), true)
    census.recordChunkAttach('chunk-content-attach', 'k', [undefined, namedMesh('chunk-items'), undefined])
    const [event] = census.events()
    expect(event).toMatchObject({ rootMaterialCount: 1 })
  })

  it('times a render stage and reports the program-count delta across it', () => {
    const programs: unknown[] = [{}]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    withProgramCensusStage(census, 'mirror-render', () => {
      programs.push({}, {})
    })
    const [event] = census.events()
    expect(event).toMatchObject({
      kind: 'mirror-render',
      programCountBefore: 1,
      programCountAfter: 3,
      programDelta: 2,
    })
  })

  it('summarize aggregates growth per stage and finds the slowest calls', () => {
    const programs: unknown[] = [{}]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    withProgramCensusStage(census, 'mirror-render', () => {
      programs.push({})
    })
    withProgramCensusStage(census, 'postprocess-render', () => {})
    census.recordChunkAttach('chunk-mesh-attach', '0,0', [namedMesh('chunk')])
    const summary = census.summarize()
    expect(summary.chunkAttachEvents).toBe(1)
    expect(summary.stageGrowth).toEqual([{ kind: 'mirror-render', events: 1, totalDelta: 1, maxDurationMs: expect.any(Number) }])
    expect(summary.slowestStages).toHaveLength(2)
  })
})
