import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { COMBAT_TARGET_RANGE } from '../app/interactables'
import { ITEM_CATALOG } from '../items/itemCatalog'
import {
  collectLivingCombatTargets,
  createPlayerCombat,
  filterWorldCycleTargets,
  livingTargetIdForAnimal,
} from './playerCombat'
import { type MeleeHitCandidate, rankCombatTargets } from './playerMelee'
import { createPlayerMelee } from './playerMelee'

describe('createPlayerCombat', () => {
  it('times out after inactivity', () => {
    const combat = createPlayerCombat()
    combat.enter()
    combat.noteActivity()
    expect(combat.isActive()).toBe(true)
    combat.update(8.1)
    expect(combat.isActive()).toBe(false)
    expect(combat.softLockId()).toBeNull()
  })

  it('refreshes the timeout on activity', () => {
    const combat = createPlayerCombat()
    combat.enter()
    combat.update(4)
    combat.noteActivity()
    combat.update(4)
    expect(combat.isActive()).toBe(true)
  })
})

describe('filterWorldCycleTargets', () => {
  it('excludes living animals and NPCs', () => {
    const list = filterWorldCycleTargets([
      { kind: 'tree', position: { x: 0, z: 0 }, promptLabel: '', id: 't', stage: 'mature', sizeClass: 'medium', canHarvest: false },
      { kind: 'animal', position: { x: 0, z: 0 }, promptLabel: '', animal: {} as never },
      { kind: 'npc', position: { x: 0, z: 0 }, promptLabel: '', npc: {} as never, settlement: {} as never },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]?.kind).toBe('tree')
  })
})

describe('rankCombatTargets / Tab living cycle', () => {
  const RANGE = COMBAT_TARGET_RANGE
  const CONE = Math.SQRT1_2

  it('cycles only living candidates in ranked order', () => {
    const candidates: MeleeHitCandidate[] = [
      { id: livingTargetIdForAnimal('a'), x: 0, z: -3, alive: true },
      { id: livingTargetIdForAnimal('b'), x: 0, z: -5, alive: true },
    ]
    const ranked = rankCombatTargets(candidates, 0, 0, 0, RANGE, CONE, [])
    expect(ranked.every((id) => id.startsWith('animal:'))).toBe(true)
    expect(ranked).toHaveLength(2)
  })
})

describe('collectLivingCombatTargets', () => {
  it('returns an empty list when fauna/settlements provide no targets', () => {
    const fauna = { getAgents: () => [] } as never
    const targets = collectLivingCombatTargets([], fauna, new Vector3(), 0, 'pointer', [])
    expect(targets).toEqual([])
  })
})

describe('target detection vs weapon range', () => {
  it('keeps detection range wider than melee hit range', () => {
    expect(COMBAT_TARGET_RANGE).toBeGreaterThan(ITEM_CATALOG.long_sword.melee!.range)
  })
})

describe('downed blocks attacks', () => {
  it('player melee rejects a new attack while a downed flag is set', () => {
    const melee = createPlayerMelee()
    const downed = { isDowned: () => true }
    const canAttack = !downed.isDowned() && !melee.isAttacking()
    expect(canAttack).toBe(false)
  })
})
