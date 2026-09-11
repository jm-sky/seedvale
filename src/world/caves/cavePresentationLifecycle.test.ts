/** Plan world-terrain-008 B4.1 — presentation relevance/lifecycle seam. */

import { describe, expect, it } from 'vitest'
import {
  CAVE_ACTIVATE_DISTANCE,
  CAVE_DEACTIVATE_DISTANCE,
  type CaveStreamingHooks,
  caveWantedAtDistance,
  createCavePresentationQueue,
  createCaveStreamingController,
} from './cavePresentationLifecycle'

function recordHooks(): CaveStreamingHooks & {
  requests: { caveId: string, generation: number, distance: number }[]
  cancelled: string[]
  disposed: string[]
  reprioritised: { caveId: string, distance: number }[]
} {
  const requests: { caveId: string, generation: number, distance: number }[] = []
  const cancelled: string[] = []
  const disposed: string[] = []
  const reprioritised: { caveId: string, distance: number }[] = []
  return {
    requests,
    cancelled,
    disposed,
    reprioritised,
    requestPresentation: (caveId, generation, distance) => {
      requests.push({ caveId, generation, distance })
    },
    reprioritisePresentation: (caveId, distance) => {
      reprioritised.push({ caveId, distance })
    },
    cancelPresentation: (caveId) => { cancelled.push(caveId) },
    disposePresentation: (caveId) => { disposed.push(caveId) },
  }
}

describe('caveWantedAtDistance (plan world-terrain-008 B4.1)', () => {
  it('activates at 55 m and deactivates at 80 m without thrashing in between', () => {
    expect(caveWantedAtDistance(CAVE_ACTIVATE_DISTANCE, false)).toBe(true)
    expect(caveWantedAtDistance(CAVE_ACTIVATE_DISTANCE + 1, true)).toBe(true)
    expect(caveWantedAtDistance(CAVE_DEACTIVATE_DISTANCE - 1, true)).toBe(true)
    expect(caveWantedAtDistance(CAVE_DEACTIVATE_DISTANCE, true)).toBe(false)
    expect(caveWantedAtDistance(60, false)).toBe(false)
    expect(caveWantedAtDistance(CAVE_ACTIVATE_DISTANCE, true)).toBe(true)
  })
})

describe('createCaveStreamingController (plan world-terrain-008 B4.1)', () => {
  it('queues one presentation request on want and does not duplicate it', () => {
    const hooks = recordHooks()
    const streaming = createCaveStreamingController(hooks)
    streaming.apply('cave-a', 10)
    streaming.apply('cave-a', 10)
    expect(hooks.requests).toHaveLength(1)
    expect(streaming.snapshot('cave-a')).toMatchObject({
      phase: 'queued',
      generation: 0,
      wanted: true,
    })
    expect(streaming.accept('cave-a', 0)).toBe(true)
    expect(streaming.snapshot('cave-a')?.phase).toBe('active')
    streaming.apply('cave-a', 10)
    expect(hooks.requests).toHaveLength(1)
  })

  it('cancels and disposes on drop without requiring an active presentation, and invalidates generation', () => {
    const hooks = recordHooks()
    const streaming = createCaveStreamingController(hooks)
    streaming.apply('cave-a', 10)
    const generation = streaming.snapshot('cave-a')!.generation
    streaming.drop('cave-a')
    expect(hooks.cancelled).toEqual(['cave-a'])
    expect(hooks.disposed).toEqual(['cave-a'])
    expect(streaming.snapshot('cave-a')).toMatchObject({
      phase: 'inactive',
      wanted: false,
    })
    expect(streaming.snapshot('cave-a')!.generation).toBe(generation + 1)
    expect(streaming.accept('cave-a', generation)).toBe(false)
  })

  it('rejects a stale generation after deactivate then reactivate', () => {
    const hooks = recordHooks()
    const streaming = createCaveStreamingController(hooks)
    streaming.apply('cave-a', 10)
    streaming.markBuilding('cave-a', 0)
    streaming.drop('cave-a')
    streaming.apply('cave-a', 10)
    expect(streaming.accept('cave-a', 0)).toBe(false)
    expect(streaming.snapshot('cave-a')?.generation).toBe(1)
    expect(streaming.accept('cave-a', 1)).toBe(true)
  })

  it('dispose leaves no wanted presentation', () => {
    const hooks = recordHooks()
    const streaming = createCaveStreamingController(hooks)
    streaming.apply('cave-a', 10)
    streaming.apply('cave-b', 20)
    streaming.dispose()
    expect(streaming.stats()).toEqual({
      wanted: 0,
      activePresentations: 0,
      queued: 0,
      building: 0,
    })
    expect(streaming.trackedIds()).toEqual([])
  })
})

describe('createCavePresentationQueue (world-terrain-019 B)', () => {
  it('drains nearest first, one job per drain by default', () => {
    const built: { caveId: string, generation: number }[] = []
    const queue = createCavePresentationQueue((caveId, generation) => { built.push({ caveId, generation }) })
    queue.request('far', 0, 70)
    queue.request('near', 0, 10)
    queue.request('mid', 0, 40)
    expect(queue.queuedCount).toBe(3)
    expect(queue.drain()).toBe(1)
    expect(built).toEqual([{ caveId: 'near', generation: 0 }])
    expect(queue.queuedCount).toBe(2)
    expect(queue.drain(5)).toBe(2)
    expect(built.map((b) => b.caveId)).toEqual(['near', 'mid', 'far'])
    expect(queue.drain()).toBe(0)
  })

  it('cancel removes a pending job; reprioritise reorders; a re-request carries the new generation', () => {
    const built: { caveId: string, generation: number }[] = []
    const queue = createCavePresentationQueue((caveId, generation) => { built.push({ caveId, generation }) })
    queue.request('a', 0, 10)
    queue.request('b', 0, 20)
    queue.cancel('a')
    expect(queue.queuedCount).toBe(1)
    queue.request('c', 3, 30)
    queue.reprioritise('c', 5)
    queue.reprioritise('missing', 1) // no-op
    queue.drain(2)
    expect(built).toEqual([{ caveId: 'c', generation: 3 }, { caveId: 'b', generation: 0 }])
    queue.request('d', 1, 1)
    queue.request('d', 2, 1)
    expect(queue.queuedCount).toBe(1)
    queue.drain()
    expect(built.at(-1)).toEqual({ caveId: 'd', generation: 2 })
    queue.request('e', 0, 0)
    queue.clear()
    expect(queue.queuedCount).toBe(0)
  })

  it('with the streaming controller: repeated activate/deactivate builds once per activation and never a stale generation', () => {
    const attached: string[] = []
    const disposed: string[] = []
    const builtGenerations: number[] = []
    // Mirrors `createCaves()` wiring: synchronous build inside the drain,
    // guarded by markBuilding/accept.
    const queue = createCavePresentationQueue((caveId, generation) => {
      if (!controller.markBuilding(caveId, generation)) return
      builtGenerations.push(generation)
      attached.push(caveId)
      if (!controller.accept(caveId, generation)) disposed.push(caveId)
    })
    const controller = createCaveStreamingController({
      requestPresentation: (caveId, generation, distance) => queue.request(caveId, generation, distance),
      reprioritisePresentation: (caveId, distance) => queue.reprioritise(caveId, distance),
      cancelPresentation: (caveId) => queue.cancel(caveId),
      disposePresentation: (caveId) => { disposed.push(caveId) },
    })

    controller.apply('c', 10)
    expect(controller.snapshot('c')?.phase).toBe('queued')
    queue.drain()
    expect(controller.snapshot('c')?.phase).toBe('active')
    expect(attached).toEqual(['c'])

    // Walk out (>= 80 m): disposed, generation bumped, nothing pending.
    controller.apply('c', 90)
    expect(disposed).toEqual(['c'])
    expect(queue.queuedCount).toBe(0)

    // Queue then leave before the drain: the stale job is cancelled and a
    // later drain must not build it.
    controller.apply('c', 10)
    expect(queue.queuedCount).toBe(1)
    controller.apply('c', 90)
    expect(queue.queuedCount).toBe(0)
    queue.drain()
    expect(attached).toEqual(['c'])

    // Come back: builds again with the newer generation.
    controller.apply('c', 10)
    queue.drain()
    expect(attached).toEqual(['c', 'c'])
    expect(builtGenerations[1]!).toBeGreaterThan(builtGenerations[0]!)
    expect(controller.stats().activePresentations).toBe(1)

    // A stale generation handed straight to the build is rejected.
    queue.request('c', builtGenerations[0]!, 5)
    queue.drain()
    expect(attached).toEqual(['c', 'c'])

    controller.dispose()
    queue.clear()
    // Walk-out, the cancelled-while-queued drop (dispose is a no-op for a
    // never-attached cave in `createCaves()`), and the final dispose.
    expect(disposed.filter((id) => id === 'c').length).toBe(3)
    expect(controller.stats().activePresentations).toBe(0)
  })
})
