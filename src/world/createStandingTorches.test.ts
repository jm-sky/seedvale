import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createStandingTorches } from './createStandingTorches'
import {
  STANDING_TORCH_BURN_DURATION_DAYS,
  STANDING_TORCH_REQUIRED_WORK,
} from './standingTorch'

describe('createStandingTorches burn expiry (plan items-player-022)', () => {
  const sampleHeight = (): number => 0

  it('ignite sets a six-hour deadline and resolveExpiry extinguishes at that time', () => {
    const torches = createStandingTorches(new Scene(), sampleHeight)
    const placed = torches.place(1, 2, 0)
    torches.contributeWork(placed.id, STANDING_TORCH_REQUIRED_WORK)
    expect(torches.ignite(placed.id, 10)).toBe(true)
    expect(torches.nodes()[0]).toMatchObject({
      lit: true,
      burnUntilDays: 10 + STANDING_TORCH_BURN_DURATION_DAYS,
    })
    torches.resolveExpiry(10 + STANDING_TORCH_BURN_DURATION_DAYS - 0.0001)
    expect(torches.nodes()[0]?.lit).toBe(true)
    torches.resolveExpiry(10 + STANDING_TORCH_BURN_DURATION_DAYS)
    expect(torches.nodes()[0]).toMatchObject({ lit: false, burnUntilDays: null })
    torches.update(0.016)
    expect(torches.list()[0]?.torch).toBeDefined()
    torches.dispose()
  })

  it('restores an already-expired saved torch as unlit and keeps it out of the active list', () => {
    const torches = createStandingTorches(new Scene(), sampleHeight, [{
      id: 'standingTorch:old',
      x: 0,
      z: 0,
      yaw: 0,
      lit: true,
      burnUntilDays: 1,
      completedWork: STANDING_TORCH_REQUIRED_WORK,
    }], undefined, 2)
    expect(torches.nodes()[0]).toMatchObject({ lit: false, burnUntilDays: null })
    torches.update(0.016)
    torches.dispose()
  })

  it('round-trips a still-burning deadline through nodes()', () => {
    const deadline = 4.5
    const torches = createStandingTorches(new Scene(), sampleHeight, [{
      id: 'standingTorch:live',
      x: 3,
      z: 4,
      yaw: 0.2,
      lit: true,
      burnUntilDays: deadline,
      completedWork: STANDING_TORCH_REQUIRED_WORK,
    }], undefined, 4)
    expect(torches.nodes()[0]).toEqual({
      id: 'standingTorch:live',
      x: 3,
      z: 4,
      yaw: 0.2,
      lit: true,
      burnUntilDays: deadline,
      completedWork: STANDING_TORCH_REQUIRED_WORK,
    })
    torches.dispose()
  })
})
