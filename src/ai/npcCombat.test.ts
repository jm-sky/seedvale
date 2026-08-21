import { describe, expect, it } from 'vitest'
import type { CombatTargetHandle } from '../combat/combatIntent'
import { Inventory } from '../items/Inventory'
import { ITEM_CATALOG } from '../items/itemCatalog'
import {
  applyNpcMeleeHit,
  resolveIncomingNpcDamage,
  resolveNpcDefenseConfig,
  resolveNpcMeleeWeapon,
} from './npcCombat'

const KNIFE = ITEM_CATALOG.knife.melee!

function fakeTarget(overrides: Partial<CombatTargetHandle> = {}): CombatTargetHandle & { damages: number[] } {
  const damages: number[] = []
  return {
    ref: { id: 'target', kind: 'animal' },
    getPosition: () => ({ x: 0, z: 0 }),
    isAlive: () => true,
    applyDamage: (amount) => damages.push(amount),
    damages,
    ...overrides,
  }
}

describe('resolveNpcMeleeWeapon', () => {
  it('returns null when carrying nothing melee-capable', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('stone', 1)
    expect(resolveNpcMeleeWeapon(carried)).toBeNull()
  })

  it('resolves a melee-capable carried kind straight from ITEM_CATALOG', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('knife', 1)
    const weapon = resolveNpcMeleeWeapon(carried)
    expect(weapon?.kind).toBe('knife')
    expect(weapon?.melee).toBe(KNIFE)
  })
})

describe('resolveNpcDefenseConfig', () => {
  it('returns null when carrying nothing that can block', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('branch', 1)
    expect(resolveNpcDefenseConfig(carried)).toBeNull()
  })

  it('resolves a defense config from a carried blocking item', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('long_sword', 1)
    const defense = resolveNpcDefenseConfig(carried)
    expect(defense?.canBlock).toBe(true)
  })
})

describe('applyNpcMeleeHit', () => {
  it('applies damage to the target exactly once', () => {
    const target = fakeTarget()
    const result = applyNpcMeleeHit(target, KNIFE, 'npc:1', 'melee:target', 1)
    expect(target.damages).toHaveLength(1)
    expect(target.damages[0]).toBe(result.damage)
    expect(result.damage).toBeGreaterThanOrEqual(KNIFE.damage)
  })

  it('is deterministic for the same attacker/attackKey/attempt', () => {
    const a = applyNpcMeleeHit(fakeTarget(), KNIFE, 'npc:1', 'melee:target', 7)
    const b = applyNpcMeleeHit(fakeTarget(), KNIFE, 'npc:1', 'melee:target', 7)
    expect(a).toEqual(b)
  })
})

describe('resolveIncomingNpcDamage', () => {
  const baseParams = {
    amount: 20,
    carried: new Inventory(undefined, 5),
    defenderId: 'npc:1',
    defenderX: 0,
    defenderZ: 0,
    defenderFacingYaw: 0,
    attackerKey: 'wolf',
    attempt: 1,
  }

  it('deals full damage with no carried defense item', () => {
    const result = resolveIncomingNpcDamage(baseParams)
    expect(result).toEqual({ outcome: 'none', finalDamage: 20, attempted: false })
  })

  it('converts steerTo facing convention correctly — an attacker ahead of a forward-facing NPC is in arc', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('long_sword', 1)
    // defenderFacingYaw 0 means facing +Z under steerTo's atan2(dirX, dirZ)
    // convention — an attacker further along +Z stands in front.
    let attempt = 1
    let result = resolveIncomingNpcDamage({
      ...baseParams, carried, defenderFacingYaw: 0, attackerX: 0, attackerZ: 2, attempt,
    })
    while (!result.attempted && attempt < 200) {
      attempt += 1
      result = resolveIncomingNpcDamage({ ...baseParams, carried, defenderFacingYaw: 0, attackerX: 0, attackerZ: 2, attempt })
    }
    expect(result.attempted).toBe(true)
  })

  it('an attacker behind a forward-facing NPC is out of arc — never attempted', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('long_sword', 1)
    for (let attempt = 1; attempt < 50; attempt++) {
      const result = resolveIncomingNpcDamage({
        ...baseParams, carried, defenderFacingYaw: 0, attackerX: 0, attackerZ: -2, attempt,
      })
      expect(result.attempted).toBe(false)
      expect(result.finalDamage).toBe(20)
    }
  })
})
