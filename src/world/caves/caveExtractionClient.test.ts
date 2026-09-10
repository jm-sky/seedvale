/** Plan world-terrain-008 B4.2 — extraction client scheduling. */

import { describe, expect, it } from 'vitest'
import type { CaveExtractionRequest, CaveExtractionResult } from './caveExtractionProtocol'
import type { Bounds } from './caveSdfField'
import type { CaveTopology } from './caveTopology'
import {
  type CaveExtractionJobRunner,
  createCaveExtractionClient,
} from './caveExtractionClient'
import { DEFAULT_SDF_PARAMS } from './caveSdfField'

function stubTopology(caveId: string): CaveTopology {
  const p = { x: 0, y: 0, z: 0 }
  return {
    caveId,
    seed: 1,
    entrance: { x: 0, y: 0, z: 0, yaw: 0, width: 3, height: 2.6 },
    nodes: [{ id: 'entrance', kind: 'entrance', position: p, targetWidth: 3, targetHeight: 2.6 }],
    segments: [],
    features: [],
    minClearance: 1.8,
  }
}

const MESH_BOUNDS: Bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }

function request(caveId: string, requestId: number, distance: number): CaveExtractionRequest {
  return {
    caveId,
    requestId,
    topology: stubTopology(caveId),
    params: DEFAULT_SDF_PARAMS,
    detailEnabled: false,
    meshBounds: MESH_BOUNDS,
    distance,
  }
}

function emptyResult(caveId: string, requestId: number): CaveExtractionResult {
  return {
    caveId,
    requestId,
    positions: new Float32Array([0, 0, 0]),
    indices: new Uint32Array([0, 0, 0]),
    metrics: {
      representationMs: 0,
      sdfSamplingMs: 1,
      surfaceNetsMs: 1,
      vertices: 1,
      triangles: 1,
      peakTempBytes: 4,
      gridCells: 1,
    },
  }
}

function createDeferredRunner(): CaveExtractionJobRunner & {
  pending: { request: CaveExtractionRequest, resolve: (result: CaveExtractionResult) => void, reject: (err: Error) => void }[]
  disposed: boolean
  resolveNext: (result: CaveExtractionResult) => void
} {
  const pending: { request: CaveExtractionRequest, resolve: (result: CaveExtractionResult) => void, reject: (err: Error) => void }[] = []
  let disposed = false
  return {
    pending,
    get disposed() { return disposed },
    run(req) {
      return new Promise<CaveExtractionResult>((resolve, reject) => {
        pending.push({ request: req, resolve, reject })
      })
    },
    resolveNext(result) {
      const job = pending.shift()
      job?.resolve(result)
    },
    dispose() {
      disposed = true
      for (const job of pending) job.reject(new Error('disposed'))
      pending.length = 0
    },
  }
}

describe('createCaveExtractionClient (plan world-terrain-008 B4.2)', () => {
  it('coalesces a duplicate request into one in-flight job', async () => {
    const runner = createDeferredRunner()
    const completed: CaveExtractionResult[] = []
    const client = createCaveExtractionClient({
      runner,
      onComplete: (result) => { completed.push(result) },
    })
    client.request(request('a', 0, 10))
    client.request(request('a', 0, 8))
    expect(client.inFlightCount).toBe(1)
    expect(client.queuedCount).toBe(0)
    expect(runner.pending).toHaveLength(1)
    runner.resolveNext(emptyResult('a', 0))
    await Promise.resolve()
    expect(completed).toHaveLength(1)
    client.dispose()
  })

  it('discards a stale result after cancel', async () => {
    const runner = createDeferredRunner()
    const completed: CaveExtractionResult[] = []
    const client = createCaveExtractionClient({
      runner,
      onComplete: (result) => { completed.push(result) },
    })
    client.request(request('a', 0, 10))
    client.cancel('a')
    runner.resolveNext(emptyResult('a', 0))
    await Promise.resolve()
    expect(completed).toEqual([])
    client.dispose()
  })

  it('does not let an older generation override a newer request', async () => {
    const runner = createDeferredRunner()
    const completed: CaveExtractionResult[] = []
    const client = createCaveExtractionClient({
      runner,
      onComplete: (result) => { completed.push(result) },
    })
    client.request(request('a', 0, 10))
    client.cancel('a')
    client.request(request('a', 1, 10))
    expect(runner.pending).toHaveLength(1)
    runner.resolveNext(emptyResult('a', 0))
    await Promise.resolve()
    expect(completed).toEqual([])
    expect(client.inFlightCount).toBe(1)
    runner.resolveNext(emptyResult('a', 1))
    await Promise.resolve()
    expect(completed.map((r) => r.requestId)).toEqual([1])
    client.dispose()
  })

  it('ignores completion after dispose', async () => {
    const runner = createDeferredRunner()
    const completed: CaveExtractionResult[] = []
    const client = createCaveExtractionClient({
      runner,
      onComplete: (result) => { completed.push(result) },
    })
    client.request(request('a', 0, 10))
    const pending = runner.pending[0]!
    client.dispose()
    pending.resolve(emptyResult('a', 0))
    await Promise.resolve()
    expect(completed).toEqual([])
  })

  it('runs at most one job and starts the nearest queued cave next', async () => {
    const runner = createDeferredRunner()
    const started: string[] = []
    const client = createCaveExtractionClient({
      runner,
      onStarted: (caveId) => { started.push(caveId) },
      onComplete: () => {},
    })
    client.request(request('busy', 0, 1))
    client.request(request('far', 0, 40))
    client.request(request('near', 0, 5))
    expect(client.inFlightCount).toBe(1)
    expect(client.queuedCount).toBe(2)
    expect(started).toEqual(['busy'])
    runner.resolveNext(emptyResult('busy', 0))
    await Promise.resolve()
    expect(started).toEqual(['busy', 'near'])
    client.dispose()
  })
})
