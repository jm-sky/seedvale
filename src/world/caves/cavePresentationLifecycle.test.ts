/** Plan world-terrain-008 B4.1 — presentation relevance/lifecycle seam. */

import { describe, expect, it } from 'vitest'
import {
  CAVE_ACTIVATE_DISTANCE,
  CAVE_DEACTIVATE_DISTANCE,
  type CaveStreamingHooks,
  caveWantedAtDistance,
  createCaveStreamingController,
} from './cavePresentationLifecycle'

function recordHooks(): CaveStreamingHooks & {
  colliders: string[]
  requests: { caveId: string, generation: number, distance: number }[]
  cancelled: string[]
  disposed: string[]
  reprioritised: { caveId: string, distance: number }[]
} {
  const colliders: string[] = []
  const requests: { caveId: string, generation: number, distance: number }[] = []
  const cancelled: string[] = []
  const disposed: string[] = []
  const reprioritised: { caveId: string, distance: number }[] = []
  return {
    colliders,
    requests,
    cancelled,
    disposed,
    reprioritised,
    registerColliders: (caveId) => { colliders.push(caveId) },
    clearColliders: (caveId) => {
      const i = colliders.indexOf(caveId)
      if (i !== -1) colliders.splice(i, 1)
    },
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
  it('registers colliders on want before presentation is active, and does not duplicate the request', () => {
    const hooks = recordHooks()
    const streaming = createCaveStreamingController(hooks)
    streaming.apply('cave-a', 10)
    streaming.apply('cave-a', 10)
    expect(hooks.colliders).toEqual(['cave-a'])
    expect(hooks.requests).toHaveLength(1)
    expect(streaming.snapshot('cave-a')).toMatchObject({
      phase: 'queued',
      generation: 0,
      collidersRegistered: true,
      wanted: true,
    })
    expect(streaming.accept('cave-a', 0)).toBe(true)
    expect(streaming.snapshot('cave-a')?.phase).toBe('active')
    streaming.apply('cave-a', 10)
    expect(hooks.requests).toHaveLength(1)
  })

  it('clears colliders on drop without requiring an active presentation, and invalidates generation', () => {
    const hooks = recordHooks()
    const streaming = createCaveStreamingController(hooks)
    streaming.apply('cave-a', 10)
    const generation = streaming.snapshot('cave-a')!.generation
    streaming.drop('cave-a')
    expect(hooks.colliders).toEqual([])
    expect(hooks.cancelled).toEqual(['cave-a'])
    expect(hooks.disposed).toEqual(['cave-a'])
    expect(streaming.snapshot('cave-a')).toMatchObject({
      phase: 'inactive',
      collidersRegistered: false,
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

  it('dispose leaves no wanted presentation or collider registrations', () => {
    const hooks = recordHooks()
    const streaming = createCaveStreamingController(hooks)
    streaming.apply('cave-a', 10)
    streaming.apply('cave-b', 20)
    streaming.dispose()
    expect(hooks.colliders).toEqual([])
    expect(streaming.stats()).toEqual({
      wanted: 0,
      activePresentations: 0,
      queued: 0,
      building: 0,
      registeredColliders: 0,
    })
    expect(streaming.trackedIds()).toEqual([])
  })
})
