import { describe, expect, it } from 'vitest'
import { ITEM_CATALOG } from '../items/itemCatalog'
import {
  DEFENSE_FRONT_ARC_DOT,
  defenseBlockRoll,
  isAttackFromDefensibleDirection,
  resolveDefense,
} from './defenseResolver'

const SWORD_DEFENSE = ITEM_CATALOG.long_sword.defense!

describe('isAttackFromDefensibleDirection', () => {
  it('accepts attacks from the front', () => {
    expect(isAttackFromDefensibleDirection(0, 0, 0, 0, -2)).toBe(true)
  })

  it('rejects attacks from behind', () => {
    expect(isAttackFromDefensibleDirection(0, 0, 0, 0, 2)).toBe(false)
  })
})

describe('resolveDefense', () => {
  it('returns full damage when no defense item is held', () => {
    const result = resolveDefense(20, null, 0, 'player', 'wolf', 1, true)
    expect(result).toEqual({ outcome: 'none', finalDamage: 20, attempted: false })
  })

  it('returns full damage when the attack is outside the defense arc', () => {
    const result = resolveDefense(20, SWORD_DEFENSE, 0, 'player', 'wolf', 1, false)
    expect(result.finalDamage).toBe(20)
    expect(result.attempted).toBe(false)
  })

  it('can fully block when the roll is below block chance', () => {
    let attempt = 1
    let result = resolveDefense(20, SWORD_DEFENSE, 0, 'player', 'wolf', attempt, true)
    while (result.outcome !== 'full' && attempt < 200) {
      attempt += 1
      result = resolveDefense(20, SWORD_DEFENSE, 0, 'player', 'wolf', attempt, true)
    }
    expect(result.outcome).toBe('full')
    expect(result.finalDamage).toBe(0)
  })

  it('can partially block between block and partial thresholds', () => {
    let attempt = 1
    let result = resolveDefense(20, SWORD_DEFENSE, 0, 'player', 'wolf', attempt, true)
    while (result.outcome !== 'partial' && attempt < 500) {
      attempt += 1
      result = resolveDefense(20, SWORD_DEFENSE, 0, 'player', 'wolf', attempt, true)
    }
    expect(result.outcome).toBe('partial')
    expect(result.finalDamage).toBeGreaterThan(0)
    expect(result.finalDamage).toBeLessThan(20)
  })

  it('improves block odds with higher defense skill', () => {
    const low = resolveDefense(20, SWORD_DEFENSE, 0.2, 'player', 'wolf', 42, true)
    const high = resolveDefense(20, SWORD_DEFENSE, 1, 'player', 'wolf', 42, true)
    expect(high.finalDamage).toBeLessThanOrEqual(low.finalDamage)
  })

  it('uses deterministic rolls per attempt', () => {
    expect(defenseBlockRoll('player', 'wolf', 3)).toBe(defenseBlockRoll('player', 'wolf', 3))
    expect(defenseBlockRoll('player', 'wolf', 3)).not.toBe(defenseBlockRoll('player', 'wolf', 4))
  })
})

describe('defense catalog coverage', () => {
  it('melee tools that can block expose defense config', () => {
    for (const kind of ['knife', 'long_sword', 'axe', 'pitchfork', 'sickle', 'shovel'] as const) {
      expect(ITEM_CATALOG[kind].defense?.canBlock).toBe(true)
    }
  })

  it('target detection range exceeds every melee weapon range', () => {
    const detection = 7
    for (const kind of ['knife', 'long_sword', 'axe', 'pitchfork', 'sickle', 'shovel'] as const) {
      expect(detection).toBeGreaterThan(ITEM_CATALOG[kind].melee!.range)
    }
  })
})

describe('DEFENSE_FRONT_ARC_DOT', () => {
  it('is a sensible forward cone', () => {
    expect(DEFENSE_FRONT_ARC_DOT).toBeGreaterThan(0)
    expect(DEFENSE_FRONT_ARC_DOT).toBeLessThan(1)
  })
})
