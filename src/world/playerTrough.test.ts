import { describe, expect, it } from 'vitest'
import { createPlayerTroughs } from './createPlayerTroughs'
import {
  isPlayerTroughConstructionComplete,
  PLAYER_TROUGH_CAPACITY_LITRES,
  PLAYER_TROUGH_REQUIRED_WORK,
  playerTroughFreeCapacity,
  playerTroughRemainingWork,
} from './playerTrough'

describe('playerTrough domain', () => {
  it('starts unfinished with zero water', () => {
    expect(playerTroughRemainingWork({ completedWork: 0 })).toBe(PLAYER_TROUGH_REQUIRED_WORK)
    expect(isPlayerTroughConstructionComplete({ completedWork: 0 })).toBe(false)
    expect(playerTroughFreeCapacity({ waterLitres: 0 })).toBe(PLAYER_TROUGH_CAPACITY_LITRES)
  })

  it('clamps water to capacity', () => {
    expect(playerTroughFreeCapacity({ waterLitres: PLAYER_TROUGH_CAPACITY_LITRES })).toBe(0)
  })
})

describe('createPlayerTroughs runtime owner', () => {
  const sampleHeight = () => 0

  it('places with completedWork=0 and waterLitres=0', () => {
    const troughs = createPlayerTroughs({ add: () => {}, removeFromParent: () => {} } as never, sampleHeight)
    const record = troughs.place(1, 2, 0.3)
    expect(record.completedWork).toBe(0)
    expect(record.waterLitres).toBe(0)
    troughs.dispose()
  })

  it('unfinished trough does not appear in provider query', () => {
    const troughs = createPlayerTroughs({ add: () => {}, removeFromParent: () => {} } as never, sampleHeight)
    const record = troughs.place(0, 0, 0)
    troughs.addWater(record.id, 5)
    expect(troughs.queryAvailableNear(0, 0, 10)).toEqual([])
    troughs.dispose()
  })

  it('addWater and consumeWater keep exact litre balance', () => {
    const troughs = createPlayerTroughs({ add: () => {}, removeFromParent: () => {} } as never, sampleHeight)
    const record = troughs.place(0, 0, 0)
    troughs.contributeWork(record.id, PLAYER_TROUGH_REQUIRED_WORK)
    expect(troughs.addWater(record.id, 7)).toBe(7)
    expect(troughs.nodes()[0]?.waterLitres).toBe(7)
    expect(troughs.consumeWater(record.id, 3)).toBe(true)
    expect(troughs.nodes()[0]?.waterLitres).toBe(4)
    troughs.dispose()
  })

  it('consume is first-wins for competing drinkers', () => {
    const troughs = createPlayerTroughs({ add: () => {}, removeFromParent: () => {} } as never, sampleHeight)
    const record = troughs.place(0, 0, 0)
    troughs.contributeWork(record.id, PLAYER_TROUGH_REQUIRED_WORK)
    troughs.addWater(record.id, 1)
    expect(troughs.consumeWater(record.id, 1)).toBe(true)
    expect(troughs.consumeWater(record.id, 1)).toBe(false)
    troughs.dispose()
  })
})
