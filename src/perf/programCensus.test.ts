import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, type WebGLRenderer } from 'three'
import { describe, expect, it } from 'vitest'
import { createProgramCensus, formatProgramCensusReport, withProgramCensusStage } from './programCensus'

function fakeRenderer(programs: unknown[]): WebGLRenderer {
  return { info: { programs } } as unknown as WebGLRenderer
}

function namedMesh(name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
  mesh.name = name
  return mesh
}

function fakeProgram(overrides: Partial<{ id: number, name: string, cacheKey: string, type: string, usedTimes: number }> = {}): unknown {
  return { id: 0, name: '', cacheKey: '', type: 'MeshStandardMaterial', usedTimes: 1, ...overrides }
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
    expect(census.dumpProgramFirstUse()).toHaveLength(0)
    expect(census.summarize().frames).toBe(0)
  })
})

describe('createProgramCensus enabled', () => {
  it('records a frame-snapshot with the current program count on every tick', () => {
    const programs: unknown[] = [{}, {}]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    census.tickFrame()
    const frameSnapshot = census.events().find((e) => e.kind === 'frame-snapshot')
    expect(frameSnapshot).toMatchObject({ kind: 'frame-snapshot', frame: 1, programCount: 2, programDelta: 2 })
  })

  it('records a program-first-use event per newly observed WebGLProgram, and never re-records the same one', () => {
    const programs: unknown[] = [fakeProgram({ id: 1, cacheKey: 'terrain-key', type: 'MeshStandardMaterial' })]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    census.tickFrame()
    programs.push(fakeProgram({ id: 2, cacheKey: 'water-key', type: 'ShaderMaterial', name: 'water' }))
    census.tickFrame()
    census.tickFrame() // no new programs — must not re-record ids 1 or 2

    const dump = census.dumpProgramFirstUse()
    expect(dump).toHaveLength(2)
    expect(dump[0]).toMatchObject({ programId: 1, cacheKey: 'terrain-key', materialType: 'MeshStandardMaterial', name: '', frame: 1 })
    expect(dump[1]).toMatchObject({ programId: 2, cacheKey: 'water-key', materialType: 'ShaderMaterial', name: 'water', frame: 2 })
  })

  it('summarize groups program-first-use events into families by materialType, sorted by count', () => {
    const programs: unknown[] = [
      fakeProgram({ id: 1, cacheKey: 'a', type: 'MeshStandardMaterial' }),
      fakeProgram({ id: 2, cacheKey: 'b', type: 'MeshStandardMaterial' }),
      fakeProgram({ id: 3, cacheKey: 'c', type: 'ShaderMaterial' }),
    ]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    census.tickFrame()
    const summary = census.summarize()
    expect(summary.firstUseEvents).toBe(3)
    expect(summary.programFamilies).toEqual([
      { key: 'MeshStandardMaterial', count: 2, firstFrame: 1, sampleCacheKey: 'a', sampleName: '' },
      { key: 'ShaderMaterial', count: 1, firstFrame: 1, sampleCacheKey: 'c', sampleName: '' },
    ])
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

  it('attributes a first-use program to its material (defines/flags/shader hashes) via renderer.properties + gl.getShaderSource', () => {
    const scene = new Scene()
    const mesh = namedMesh('chunk')
    const material = mesh.material as MeshBasicMaterial & { defines?: Record<string, unknown> }
    material.defines = { USE_FOG: '1' }
    material.transparent = true
    scene.add(mesh)

    const program = fakeProgram({ id: 1, cacheKey: 'k', type: 'ShaderMaterial' }) as { vertexShader: unknown, fragmentShader: unknown }
    program.vertexShader = { tag: 'vs' }
    program.fragmentShader = { tag: 'fs' }
    const programs: unknown[] = [program]

    const renderer = {
      info: { programs },
      properties: { get: (o: unknown) => (o === material ? { currentProgram: program } : {}) },
      getContext: () => ({
        getShaderSource: (shader: unknown) => (shader === program.vertexShader ? 'VS SOURCE' : 'FS SOURCE'),
      }),
    } as unknown as WebGLRenderer

    const census = createProgramCensus(renderer, scene, true)
    census.tickFrame()

    const [event] = census.dumpProgramFirstUse()
    expect(event).toMatchObject({
      materialUuid: material.uuid,
      defines: { USE_FOG: '1' },
      flags: expect.objectContaining({ transparent: 'true' }),
      vertexShaderHash: expect.any(String),
      fragmentShaderHash: expect.any(String),
    })
    expect(event!.vertexShaderHash).not.toBe(event!.fragmentShaderHash)
  })
})

describe('formatProgramCensusReport', () => {
  it('flags the frame with the most first-use programs as the largest transition and diffs same-type programs within it', () => {
    const programs: unknown[] = [
      fakeProgram({ id: 1, cacheKey: 'a', type: 'MeshStandardMaterial' }),
    ]
    const census = createProgramCensus(fakeRenderer(programs), new Scene(), true)
    census.tickFrame() // frame 1: +1

    programs.push(
      fakeProgram({ id: 2, cacheKey: 'b', type: 'MeshStandardMaterial' }),
      fakeProgram({ id: 3, cacheKey: 'c', type: 'MeshStandardMaterial' }),
    )
    census.tickFrame() // frame 2: +2 — the largest transition

    const report = formatProgramCensusReport(census)
    expect(report).toContain('Programs created: 3')
    expect(report).toContain('frame 1   +1 program')
    expect(report).toContain('frame 2   +2 programs   <== largest transition')
    expect(report).toContain('Largest transition — frame 2 (+2 programs):')
    expect(report).toContain('#2')
    expect(report).toContain('#3')
  })

  it('reports disabled/empty census without throwing', () => {
    expect(formatProgramCensusReport(createProgramCensus(fakeRenderer([]), new Scene(), false))).toBe('[Seedvale Program Census] disabled')
    expect(formatProgramCensusReport(createProgramCensus(fakeRenderer([]), new Scene(), true)))
      .toBe('[Seedvale Program Census]\n\nNo new programs were created during this run.')
  })
})
