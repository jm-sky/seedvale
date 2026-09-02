import { describe, expect, it } from 'vitest'
import { createGpuTimer } from './gpuTimer'
import type { WebGLRenderer } from 'three'

const TIME_ELAPSED_EXT = 0x88bf
const GPU_DISJOINT_EXT = 0x8fbb
const QUERY_RESULT_AVAILABLE = 0x8867
const QUERY_RESULT = 0x8866

type FakeQuery = { __id: number }

/** Fake WebGL2 context. Every `createQuery()` call is recorded in creation
 *  order (`queries`); a test resolves one via `resolve(index, ns)` to
 *  simulate the GPU finishing that query, then `poll()` picks it up —
 *  mirrors how `EXT_disjoint_timer_query_webgl2` results become available
 *  asynchronously, some frames after `endQuery()`. */
function fakeGl2(opts: { hasExtension?: boolean, hasQueryApi?: boolean } = {}) {
  const { hasExtension = true, hasQueryApi = true } = opts
  let nextId = 1
  const queries: FakeQuery[] = []
  const resolved = new Set<number>()
  const nsForQuery = new Map<number, number>()
  let disjoint = false

  const gl: Record<string, unknown> = {
    QUERY_RESULT_AVAILABLE,
    QUERY_RESULT,
    getExtension: (name: string) => (hasExtension && name === 'EXT_disjoint_timer_query_webgl2'
      ? { TIME_ELAPSED_EXT, GPU_DISJOINT_EXT }
      : null),
    createQuery: hasQueryApi
      ? () => {
        const q: FakeQuery = { __id: nextId++ }
        queries.push(q)
        return q
      }
      : undefined,
    beginQuery: () => {},
    endQuery: () => {},
    deleteQuery: (q: FakeQuery) => { resolved.delete(q.__id) },
    getParameter: (pname: number) => (pname === GPU_DISJOINT_EXT ? disjoint : false),
    getQueryParameter: (q: FakeQuery, pname: number) => {
      if (pname === QUERY_RESULT_AVAILABLE) return resolved.has(q.__id)
      if (pname === QUERY_RESULT) return nsForQuery.get(q.__id) ?? 0
      return null
    },
  }

  return {
    gl: gl as unknown as WebGL2RenderingContext,
    queries,
    resolve(index: number, ns: number) {
      const q = queries[index]!
      nsForQuery.set(q.__id, ns)
      resolved.add(q.__id)
    },
    setDisjoint(v: boolean) { disjoint = v },
  }
}

function rendererWith(gl: WebGL2RenderingContext): WebGLRenderer {
  return { getContext: () => gl } as unknown as WebGLRenderer
}

describe('createGpuTimer disabled/unsupported', () => {
  it('is a no-op when not enabled', () => {
    const { gl } = fakeGl2()
    const timer = createGpuTimer(rendererWith(gl), false)
    expect(timer.available).toBe(false)
    timer.beginFrame()
    timer.endFrame()
    timer.poll()
    expect(timer.samples()).toEqual([])
  })

  it('is a no-op when EXT_disjoint_timer_query_webgl2 is unavailable', () => {
    const { gl } = fakeGl2({ hasExtension: false })
    const timer = createGpuTimer(rendererWith(gl), true)
    expect(timer.available).toBe(false)
  })

  it('is a no-op when the context lacks the WebGL2 query API', () => {
    const { gl } = fakeGl2({ hasQueryApi: false })
    const timer = createGpuTimer(rendererWith(gl), true)
    expect(timer.available).toBe(false)
  })
})

describe('createGpuTimer enabled', () => {
  it('does not report a sample until the query actually resolves', () => {
    const fake = fakeGl2()
    const timer = createGpuTimer(rendererWith(fake.gl), true)
    timer.beginFrame()
    timer.endFrame()
    timer.poll()
    expect(timer.samples()).toEqual([]) // pending — must not fabricate a result
  })

  it('collects a resolved query result converted from ns to ms', () => {
    const fake = fakeGl2()
    const timer = createGpuTimer(rendererWith(fake.gl), true)

    timer.beginFrame()
    timer.endFrame()
    fake.resolve(0, 2_500_000) // 2.5 ms
    timer.poll()

    expect(timer.samples()).toEqual([2.5])
  })

  it('drains multiple completed queries across separate frames, in order', () => {
    const fake = fakeGl2()
    const timer = createGpuTimer(rendererWith(fake.gl), true)

    timer.beginFrame()
    timer.endFrame()
    timer.beginFrame()
    timer.endFrame()

    fake.resolve(0, 1_000_000)
    fake.resolve(1, 3_000_000)
    timer.poll()

    expect(timer.samples()).toEqual([1, 3])
  })

  it('discards pending results after a disjoint event instead of reporting them', () => {
    const fake = fakeGl2()
    const timer = createGpuTimer(rendererWith(fake.gl), true)
    timer.beginFrame()
    timer.endFrame()
    fake.resolve(0, 5_000_000)
    fake.setDisjoint(true)
    timer.poll()
    expect(timer.samples()).toEqual([])
  })

  it('reset clears already-collected samples without touching in-flight queries', () => {
    const fake = fakeGl2()
    const timer = createGpuTimer(rendererWith(fake.gl), true)
    timer.beginFrame()
    timer.endFrame()
    fake.resolve(0, 4_000_000)
    timer.poll()
    expect(timer.samples()).toEqual([4])

    timer.reset()
    expect(timer.samples()).toEqual([])
  })

  it('skips starting a new query once MAX_PENDING in-flight queries are outstanding', () => {
    const fake = fakeGl2()
    const timer = createGpuTimer(rendererWith(fake.gl), true)
    // 8 is MAX_PENDING; none resolve, so at most 8 queries should ever be created.
    for (let i = 0; i < 20; i++) {
      timer.beginFrame()
      timer.endFrame()
    }
    expect(fake.queries.length).toBe(8)
    expect(() => timer.poll()).not.toThrow()
  })
})
