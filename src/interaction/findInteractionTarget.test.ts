import { describe, expect, it } from 'vitest'
import {
  compareGazeRanked,
  GAZE_CENTEREDNESS_TIE_EPSILON,
  GAZE_HYSTERESIS_MARGIN,
  type GazeRanked,
  pickInGaze,
  rankInGaze,
} from './findInteractionTarget'

describe('pickInGaze (plan ui-input-006 fishing-interaction fix)', () => {
  const playerPos = { x: 10, z: 10 }
  const facingNorth = 0

  it('never selects a candidate sitting exactly on the player position', () => {
    const candidates = [{ position: { x: playerPos.x, z: playerPos.z } }]
    expect(pickInGaze(candidates, playerPos, facingNorth, 5, 0.5)).toBeNull()
  })

  it('selects a candidate offset from the player and within the gaze cone', () => {
    const candidates = [{ position: { x: 10, z: 8 } }]
    expect(pickInGaze(candidates, playerPos, facingNorth, 5, 0.5)).toBe(candidates[0])
  })
})

describe('pickInGaze ranking (plan ui-input-015)', () => {
  const playerPos = { x: 0, z: 0 }
  const facingNorth = 0

  it('prefers a clearly more centered candidate', () => {
    const offCenter = { position: { x: 0.5, z: -2 }, id: 'off' }
    const centered = { position: { x: 0, z: -2 }, id: 'center' }
    const picked = pickInGaze([offCenter, centered], playerPos, facingNorth, 5, 0.5, {
      stableKey: (c) => c.id,
    })
    expect(picked).toBe(centered)
  })

  it('breaks near-tied dots toward actionable targets', () => {
    const flavor = { position: { x: 0, z: -2 }, id: 'flavor', actionable: false }
    const actionable = { position: { x: 0.01, z: -2 }, id: 'act', actionable: true }
    const ranked = rankInGaze([flavor, actionable], playerPos, facingNorth, 5, 0.5, {
      isActionable: (c) => c.actionable,
      stableKey: (c) => c.id,
    })
    expect(ranked[0]?.candidate).toBe(actionable)
  })

  it('breaks semantic ties by distance', () => {
    const near = { position: { x: 0, z: -1.5 }, id: 'near' }
    const far = { position: { x: 0, z: -2.4 }, id: 'far' }
    const ranked = rankInGaze([far, near], playerPos, facingNorth, 5, 0.5, {
      stableKey: (c) => c.id,
    })
    expect(ranked[0]?.candidate).toBe(near)
  })

  it('uses stable keys for exact ties', () => {
    const a: GazeRanked<{ position: { x: number, z: number }, id: string }> = {
      candidate: { position: { x: 0, z: -2 }, id: 'b' },
      dot: 0.9,
      dist: 2,
      actionable: true,
      stableKey: 'b',
    }
    const b: GazeRanked<{ position: { x: number, z: number }, id: string }> = {
      candidate: { position: { x: 0, z: -2 }, id: 'a' },
      dot: 0.9,
      dist: 2,
      actionable: true,
      stableKey: 'a',
    }
    expect(compareGazeRanked(a, b)).toBeGreaterThan(0)
  })

  it('keeps the previous target within the hysteresis margin', () => {
    const previous = { position: { x: 0, z: -2 }, id: 'prev' }
    const challenger = { position: { x: 0.05, z: -2 }, id: 'next' }
    const picked = pickInGaze([previous, challenger], playerPos, facingNorth, 5, 0.5, {
      stableKey: (c) => c.id,
      previous,
      sameCandidate: (a, b) => a.id === b.id,
    })
    const ranked = rankInGaze([previous, challenger], playerPos, facingNorth, 5, 0.5, {
      stableKey: (c) => c.id,
    })
    const margin = ranked[0]!.dot - ranked[1]!.dot
    expect(margin).toBeLessThan(GAZE_HYSTERESIS_MARGIN)
    expect(picked).toBe(previous)
  })

  it('switches when the challenger wins by a clear margin', () => {
    const previous = { position: { x: 0.8, z: -2 }, id: 'prev' }
    const challenger = { position: { x: 0, z: -2 }, id: 'next' }
    const picked = pickInGaze([previous, challenger], playerPos, facingNorth, 5, 0.5, {
      stableKey: (c) => c.id,
      previous,
      sameCandidate: (a, b) => a.id === b.id,
    })
    expect(picked).toBe(challenger)
  })

  it('excludes out-of-range and out-of-cone candidates', () => {
    const behind = { position: { x: 0, z: 2 }, id: 'behind' }
    const tooFar = { position: { x: 0, z: -20 }, id: 'far' }
    expect(rankInGaze([behind, tooFar], playerPos, facingNorth, 2.5, 0.5, {
      stableKey: (c) => c.id,
    })).toHaveLength(0)
  })

  it('honours per-candidate interactRange overrides', () => {
    const inRange = { position: { x: 0, z: -3.5 }, id: 'quest', interactRange: 4 }
    expect(pickInGaze([inRange], playerPos, facingNorth, 2.5, 0.5, {
      stableKey: (c) => c.id,
    })).toBe(inRange)
  })

  it('documents tie and hysteresis constants', () => {
    expect(GAZE_CENTEREDNESS_TIE_EPSILON).toBeGreaterThan(0)
    expect(GAZE_HYSTERESIS_MARGIN).toBeGreaterThan(GAZE_CENTEREDNESS_TIE_EPSILON)
  })
})
