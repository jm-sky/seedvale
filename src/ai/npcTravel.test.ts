import { describe, expect, it } from 'vitest'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import { startNpcAccompanyCommitment } from './npcAccompanyCommitment'
import {
  beginOffscreenNpcTravel,
  cloneNpcTravel,
  interpolateNpcTravelPosition,
  markNpcTravelReached,
  observeNpcTravelArrival,
  reifyNpcTravel,
  resolveOffscreenNpcTravel,
  stampNpcTravelCheckpoint,
} from './npcTravel'

describe('npcTravel continuity', () => {
  it('captures a stationary checkpoint when from and dest are the same (stay)', () => {
    const travel = beginOffscreenNpcTravel({ x: 4, z: 5 }, { x: 4, z: 5 }, 10, 600)
    expect(travel.execution).toBeUndefined()
    expect(travel.lastPosition).toEqual({ x: 4, z: 5 })
    expect(interpolateNpcTravelPosition(travel, 99)).toEqual({ x: 4, z: 5 })
  })

  it('interpolates physically toward dest and does not double-progress on reify', () => {
    const travel = beginOffscreenNpcTravel({ x: 0, z: 0 }, { x: 100, z: 0 }, 0, 600)
    expect(travel.execution).toBeDefined()
    const midDays = (travel.execution!.departedAtDays + travel.execution!.arrivesAtDays) / 2
    const mid = interpolateNpcTravelPosition(travel, midDays)
    expect(mid.x).toBeGreaterThan(40)
    expect(mid.x).toBeLessThan(60)
    expect(mid.z).toBe(0)
    const reified = reifyNpcTravel(travel, midDays)
    expect(reified.execution).toBeUndefined()
    expect(reified.lastPosition.x).toBeCloseTo(mid.x)
    expect(interpolateNpcTravelPosition(reified, midDays + 10).x).toBeCloseTo(mid.x)
  })

  it('places at dest once the captured arrival time has elapsed, never teleporting past it', () => {
    const travel = beginOffscreenNpcTravel({ x: 0, z: 0 }, { x: 50, z: 0 }, 1, 600)
    const arrived = interpolateNpcTravelPosition(travel, travel.execution!.arrivesAtDays)
    expect(arrived).toEqual({ x: 50, z: 0 })
    expect(interpolateNpcTravelPosition(travel, travel.execution!.arrivesAtDays + 5)).toEqual({ x: 50, z: 0 })
  })

  it('does not complete an accompanying NPC off-screen; return-without-commitment is idempotent', () => {
    const accompanying = createNpcAuthoritativeState('npc:a', 0)
    startNpcAccompanyCommitment(accompanying, { source: { kind: 'voluntary' }, startedAtDays: 1 })
    accompanying.travel = beginOffscreenNpcTravel({ x: 0, z: 0 }, { x: 80, z: 0 }, 0, 600)
    resolveOffscreenNpcTravel(accompanying, 99)
    expect(accompanying.travel?.execution?.mode).toBe('off-screen')

    const returning = createNpcAuthoritativeState('npc:b', 0)
    returning.travel = beginOffscreenNpcTravel({ x: 0, z: 0 }, { x: 80, z: 0 }, 0, 600)
    const arrives = returning.travel.execution!.arrivesAtDays
    resolveOffscreenNpcTravel(returning, arrives - 0.0001)
    expect(returning.travel).not.toBeNull()
    resolveOffscreenNpcTravel(returning, arrives)
    expect(returning.travel).toBeNull()
    resolveOffscreenNpcTravel(returning, arrives + 1)
    expect(returning.travel).toBeNull()
  })

  it('stamps a detailed checkpoint without taking off-screen ownership', () => {
    const stamped = stampNpcTravelCheckpoint(null, { x: 2, z: 3 }, { x: 9, z: 1 })
    expect(stamped.execution).toBeUndefined()
    expect(stamped.lastPosition).toEqual({ x: 2, z: 3 })
    expect(stamped.destination).toEqual({ x: 9, z: 1 })
  })

  it('preserves purpose across off-screen handoff, reify, stamp and clone', () => {
    const purpose = { kind: 'expedition' as const, assignmentId: 'exp:1' }
    const started = beginOffscreenNpcTravel(
      { x: 0, z: 0 },
      { x: 80, z: 0 },
      2,
      600,
      { destination: { x: 80, z: 0 }, lastPosition: { x: 0, z: 0 }, purpose },
    )
    expect(started.purpose).toEqual(purpose)
    const reified = reifyNpcTravel(started, 2.1)
    expect(reified.purpose).toEqual(purpose)
    expect(reified.execution).toBeUndefined()
    const stamped = stampNpcTravelCheckpoint(reified, { x: 12, z: 0 })
    expect(stamped.purpose).toEqual(purpose)
    expect(stamped.execution).toBeUndefined()
    const cloned = cloneNpcTravel(started)
    expect(cloned?.purpose).toEqual(purpose)
    expect(cloned?.purpose).not.toBe(started.purpose)
  })

  it('marks purpose-backed arrival without clearing until observed exactly once', () => {
    const state = createNpcAuthoritativeState('npc:e', 0)
    state.travel = beginOffscreenNpcTravel(
      { x: 0, z: 0 },
      { x: 80, z: 0 },
      0,
      600,
      {
        destination: { x: 80, z: 0 },
        lastPosition: { x: 0, z: 0 },
        purpose: { kind: 'expedition', assignmentId: 'exp:1' },
      },
    )
    const arrives = state.travel.execution!.arrivesAtDays
    expect(resolveOffscreenNpcTravel(state, arrives - 0.0001).kind).toBe('in-progress')
    expect(state.travel?.arrival).toBeUndefined()
    expect(resolveOffscreenNpcTravel(state, arrives).kind).toBe('arrived')
    expect(state.travel?.arrival).toBe('reached')
    expect(state.travel?.execution).toBeUndefined()
    expect(observeNpcTravelArrival(state)).toBe(true)
    expect(state.travel).toBeNull()
    expect(observeNpcTravelArrival(state)).toBe(false)
  })

  it('does not treat death as arrival', () => {
    const state = createNpcAuthoritativeState('npc:dead', 0)
    state.health.dead = true
    state.travel = beginOffscreenNpcTravel(
      { x: 0, z: 0 },
      { x: 80, z: 0 },
      0,
      600,
      {
        destination: { x: 80, z: 0 },
        lastPosition: { x: 0, z: 0 },
        purpose: { kind: 'expedition', assignmentId: 'exp:1' },
      },
    )
    const arrives = state.travel.execution!.arrivesAtDays
    expect(resolveOffscreenNpcTravel(state, arrives).kind).toBe('cannot-progress')
    expect(state.travel?.arrival).toBeUndefined()
    expect(state.travel?.blocked).toBe(true)
    expect(observeNpcTravelArrival(state)).toBe(false)
  })

  it('markNpcTravelReached is idempotent and keeps the destination', () => {
    const reached = markNpcTravelReached({
      destination: { x: 9, z: 1 },
      lastPosition: { x: 8, z: 1 },
      purpose: { kind: 'expedition', assignmentId: 'exp:1' },
    })
    expect(reached.arrival).toBe('reached')
    expect(reached.lastPosition).toEqual({ x: 9, z: 1 })
    expect(markNpcTravelReached(reached).arrival).toBe('reached')
  })
})
