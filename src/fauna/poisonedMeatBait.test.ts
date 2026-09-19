import { describe, expect, it } from 'vitest'
import {
  POISONED_MEAT_DETECTION_CHANCE,
  poisonedMeatDetected,
  poisonedMeatDetectionRoll,
} from './poisonedMeatBait'

describe('poisonedMeatBait detection (plan items-player-049)', () => {
  it('is deterministic for the same animal and dropped item', () => {
    const input = { worldSeed: 42, animalId: 'wolf-1', droppedItemId: 'drop-a' }
    expect(poisonedMeatDetectionRoll(input)).toBe(poisonedMeatDetectionRoll(input))
  })

  it('can differ for another dropped item id', () => {
    const base = { worldSeed: 42, animalId: 'wolf-1' }
    const a = poisonedMeatDetectionRoll({ ...base, droppedItemId: 'drop-a' })
    const b = poisonedMeatDetectionRoll({ ...base, droppedItemId: 'drop-b' })
    expect(a === b).toBe(false)
  })

  it('uses the configured detection threshold', () => {
    expect(poisonedMeatDetected(POISONED_MEAT_DETECTION_CHANCE - 0.001)).toBe(true)
    expect(poisonedMeatDetected(POISONED_MEAT_DETECTION_CHANCE)).toBe(false)
  })
})
