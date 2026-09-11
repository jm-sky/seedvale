import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { COMBAT_TARGET_RANGE } from '../app/interactables'
import { resolveMeleeHits } from '../combat/meleeAttack'
import { sweptProjectileHit } from '../combat/projectile'
import { MAX_HP } from '../fauna/faunaCombat'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { createHealthState, damageHealth } from '../shared/HealthState'
import {
  collectLivingCombatTargets,
  collectRangedAnimalCandidates,
  createPlayerCombat,
  filterWorldCycleTargets,
  livingTargetIdForAnimal,
  livingTargetIdForNpc,
  type RangedAnimalCandidate,
  resolveRangedAimYaw,
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

describe('resolveRangedAimYaw (plan 186 §1)', () => {
  const target: RangedAnimalCandidate = { id: 'animal:deer1', x: 0, z: -5, animal: {} as never }

  it('falls back to the live camera/mouse yaw when nothing is soft-locked', () => {
    expect(resolveRangedAimYaw(null, [target], 0, 0, 1.23)).toBe(1.23)
  })

  it('aims toward the locked target instead of the fallback yaw', () => {
    const yaw = resolveRangedAimYaw('animal:deer1', [target], 0, 0, 1.23)
    expect(yaw).not.toBe(1.23)
    expect(yaw).toBeCloseTo(0) // straight ahead in -Z, same convention as yawToward
  })

  it('tracks a moving locked target frame to frame', () => {
    const moved: RangedAnimalCandidate = { id: 'animal:deer1', x: 5, z: 0, animal: {} as never }
    const yaw = resolveRangedAimYaw('animal:deer1', [moved], 0, 0, 1.23)
    expect(yaw).toBeCloseTo(-Math.PI / 2)
  })

  it('falls back to the live yaw when the locked id is no longer among the candidates', () => {
    expect(resolveRangedAimYaw('animal:gone', [target], 0, 0, 1.23)).toBe(1.23)
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

function fakeCombatAnimal(
  animalId: string,
  x: number,
  z: number,
  dead = false,
): {
  animalId: string
  mesh: { position: { x: number, z: number } }
  isDead: () => boolean
  takeDamage: (amount: number) => void
  health: ReturnType<typeof createHealthState>
} {
  const health = createHealthState(MAX_HP.rat)
  if (dead) damageHealth(health, MAX_HP.rat)
  return {
    animalId,
    mesh: { position: { x, z } },
    isDead: () => health.dead,
    takeDamage: (amount: number) => damageHealth(health, amount),
    health,
  }
}

describe('collectLivingCombatTargets settlement rats (plan fauna-021)', () => {
  const fauna = { getAgents: () => [] } as never
  const playerPos = new Vector3(0, 0, 0)

  it('includes a live settlement rat and skips a dead one', () => {
    const live = fakeCombatAnimal('rat-live', 0, -3)
    const dead = fakeCombatAnimal('rat-dead', 0, -2, true)
    const settlement = { livestock: [], rats: [live, dead], npcs: [] } as never
    const targets = collectLivingCombatTargets([settlement], fauna, playerPos, 0, 'pointer', [])
    expect(targets.map((t) => t.id)).toEqual([livingTargetIdForAnimal('rat-live')])
  })

  it('still collects livestock and NPCs alongside rats', () => {
    const rat = fakeCombatAnimal('rat-1', 1, -3)
    const cow = fakeCombatAnimal('cow-1', -1, -3)
    const npc = {
      id: 'npc-anna',
      health: { dead: false },
      mesh: { position: { x: 0, z: -2 } },
    }
    const settlement = { livestock: [cow], rats: [rat], npcs: [npc] } as never
    const ids = collectLivingCombatTargets([settlement], fauna, playerPos, 0, 'pointer', []).map((t) => t.id)
    expect(ids).toContain(livingTargetIdForAnimal('rat-1'))
    expect(ids).toContain(livingTargetIdForAnimal('cow-1'))
    expect(ids).toContain(livingTargetIdForNpc('npc-anna'))
  })

  it('includes live wild fauna as before', () => {
    const deer = fakeCombatAnimal('deer-1', 0, -4)
    const wildFauna = { getAgents: () => [deer] } as never
    const settlement = { livestock: [], rats: [], npcs: [] } as never
    const ids = collectLivingCombatTargets([settlement], wildFauna, playerPos, 0, 'pointer', []).map((t) => t.id)
    expect(ids).toEqual([livingTargetIdForAnimal('deer-1')])
  })
})

describe('collectRangedAnimalCandidates settlement rats (plan fauna-021)', () => {
  const playerPos = new Vector3(0, 0, 0)

  it('includes a live rat and excludes a dead rat', () => {
    const live = fakeCombatAnimal('rat-ranged', 0, -8)
    const dead = fakeCombatAnimal('rat-dead', 0, -6, true)
    const settlement = { livestock: [], rats: [live, dead], npcs: [] } as never
    const fauna = { getAgents: () => [] } as never
    const ids = collectRangedAnimalCandidates([settlement], fauna, playerPos, 20).map((c) => c.id)
    expect(ids).toEqual([livingTargetIdForAnimal('rat-ranged')])
  })
})

describe('player combat damage against a settlement rat (plan fauna-021)', () => {
  it('melee geometry can hit a rat-shaped candidate and takeDamage uses the same HealthState', () => {
    const rat = fakeCombatAnimal('rat-melee', 0, -1.2)
    const hits = resolveMeleeHits(0, 0, 0, ITEM_CATALOG.knife.melee!, [
      { id: rat.animalId, x: 0, z: -1.2, alive: !rat.isDead() },
    ])
    expect(hits).toEqual(['rat-melee'])
    rat.takeDamage(MAX_HP.rat)
    expect(rat.isDead()).toBe(true)
    expect(rat.health.maxHp).toBe(MAX_HP.rat)
    expect(rat.health.currentHp).toBe(0)
  })

  it('a ranged swept hit can apply damage to the same rat health state', () => {
    const rat = fakeCombatAnimal('rat-proj', 0, -2)
    const hitId = sweptProjectileHit(0, 0, 0, -5, [
      { id: livingTargetIdForAnimal(rat.animalId), x: 0, z: -2, alive: true },
    ])
    expect(hitId).toBe(livingTargetIdForAnimal('rat-proj'))
    rat.takeDamage(3)
    expect(rat.isDead()).toBe(false)
    expect(rat.health.currentHp).toBe(MAX_HP.rat - 3)
    rat.takeDamage(MAX_HP.rat)
    expect(rat.isDead()).toBe(true)
  })

  it('killing a rat lowers the authoritative alive-rat count without a second HP store', () => {
    const a = fakeCombatAnimal('rat-a', 0, -2)
    const b = fakeCombatAnimal('rat-b', 1, -2)
    const countAlive = (): number => [a, b].reduce((n, rat) => n + (rat.isDead() ? 0 : 1), 0)
    expect(countAlive()).toBe(2)
    a.takeDamage(MAX_HP.rat)
    expect(countAlive()).toBe(1)
    expect(a.health.dead).toBe(true)
    expect(a.health.maxHp).toBe(MAX_HP.rat)
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
