import { describe, expect, it } from 'vitest'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { createStaminaState } from '../shared/StaminaState'
import {
  createPlayerMelee,
  type MeleeHitCandidate,
  meleeSwingAngle,
  resolveMeleeHits,
} from './playerMelee'

const KNIFE = ITEM_CATALOG.knife.melee!
const SWORD = ITEM_CATALOG.long_sword.melee!
const AXE = ITEM_CATALOG.axe.melee!
const PITCHFORK = ITEM_CATALOG.pitchfork.melee!
const SICKLE = ITEM_CATALOG.sickle.melee!
const SHOVEL = ITEM_CATALOG.shovel.melee!

describe('itemCatalog melee config (plan 123 — single source of truth)', () => {
  it('every plan-123 melee tool has a config with the preserved damage values', () => {
    expect(KNIFE.damage).toBe(12)
    expect(SWORD.damage).toBe(28)
    expect(AXE.damage).toBe(20)
    expect(PITCHFORK.damage).toBe(14)
    expect(SICKLE.damage).toBe(12)
    expect(SHOVEL.damage).toBe(8)
  })

  it('different weapons have different attack timing', () => {
    const totalDuration = (c: typeof KNIFE) => c.windUp + c.hitWindow + c.recovery
    expect(totalDuration(KNIFE)).toBeLessThan(totalDuration(SWORD))
    expect(totalDuration(KNIFE)).toBeLessThan(totalDuration(AXE))
    expect(totalDuration(SWORD)).not.toBe(totalDuration(AXE))
  })

  it('non-melee tools have no melee config', () => {
    expect(ITEM_CATALOG.pickaxe.melee).toBeNull()
    expect(ITEM_CATALOG.firestarter.melee).toBeNull()
  })
})

describe('createPlayerMelee lifecycle', () => {
  it('rejects an attack request with insufficient stamina', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(KNIFE.staminaCost - 1)
    expect(melee.requestAttack(KNIFE, stamina)).toBe(false)
    expect(melee.isAttacking()).toBe(false)
    expect(stamina.current).toBe(KNIFE.staminaCost - 1)
  })

  it('drains stamina exactly once on a successful attack request', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    expect(melee.requestAttack(KNIFE, stamina)).toBe(true)
    expect(stamina.current).toBe(100 - KNIFE.staminaCost)
    // A second request mid-attack must not drain stamina again.
    expect(melee.requestAttack(KNIFE, stamina)).toBe(false)
    expect(stamina.current).toBe(100 - KNIFE.staminaCost)
  })

  it('cannot be requested again during recovery (no spamming past the configured timing)', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    expect(melee.requestAttack(KNIFE, stamina)).toBe(true)
    // Advance almost through the whole attack but not quite.
    melee.update(KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery - 0.001)
    expect(melee.requestAttack(KNIFE, stamina)).toBe(false)
  })

  it('reaches idle again and accepts a new attack once recovery completes', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    melee.requestAttack(KNIFE, stamina)
    melee.update(KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery + 0.001)
    expect(melee.state()).toBe('idle')
    expect(melee.requestAttack(KNIFE, stamina)).toBe(true)
  })

  it('signals hitReady exactly once per attack, at the wind-up -> hit-window edge', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    melee.requestAttack(KNIFE, stamina)

    let hits = 0
    const step = 0.01
    let elapsed = 0
    const total = KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery
    while (elapsed < total + 0.05) {
      const tick = melee.update(step)
      if (tick.hitReady) hits++
      elapsed += step
    }
    expect(hits).toBe(1)
  })

  it('a large dt cascades through every remaining phase in one update call', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    melee.requestAttack(KNIFE, stamina)
    const tick = melee.update(KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery + 1)
    expect(tick.hitReady).toBe(true)
    expect(melee.state()).toBe('idle')
  })

  it('reset() cancels an in-flight attack (pause/modal safety)', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    melee.requestAttack(KNIFE, stamina)
    melee.update(KNIFE.windUp * 0.5)
    expect(melee.isAttacking()).toBe(true)
    melee.reset()
    expect(melee.isAttacking()).toBe(false)
    expect(melee.state()).toBe('idle')
  })
})

describe('resolveMeleeHits', () => {
  const config = KNIFE

  it('hits a target directly ahead, within range and arc', () => {
    const candidates: MeleeHitCandidate[] = [{ id: 'a', x: 0, z: -1, alive: true }]
    // Player at origin facing -Z (yaw 0, matching pickInGaze's convention).
    expect(resolveMeleeHits(0, 0, 0, config, candidates)).toEqual(['a'])
  })

  it('does not resolve a target outside range', () => {
    const candidates: MeleeHitCandidate[] = [{ id: 'a', x: 0, z: -(config.range + 1), alive: true }]
    expect(resolveMeleeHits(0, 0, 0, config, candidates)).toEqual([])
  })

  it('does not resolve a target outside the facing arc', () => {
    // Directly behind the player facing -Z.
    const candidates: MeleeHitCandidate[] = [{ id: 'a', x: 0, z: 1, alive: true }]
    expect(resolveMeleeHits(0, 0, 0, config, candidates)).toEqual([])
  })

  it('ignores dead/inactive candidates', () => {
    const candidates: MeleeHitCandidate[] = [{ id: 'a', x: 0, z: -1, alive: false }]
    expect(resolveMeleeHits(0, 0, 0, config, candidates)).toEqual([])
  })

  it('can hit multiple targets within the arc in one resolution', () => {
    const candidates: MeleeHitCandidate[] = [
      { id: 'a', x: -0.3, z: -1, alive: true },
      { id: 'b', x: 0.3, z: -1, alive: true },
    ]
    expect(resolveMeleeHits(0, 0, 0, config, candidates).sort()).toEqual(['a', 'b'])
  })
})

describe('meleeSwingAngle', () => {
  it('starts and ends the full attack at zero (rest pose)', () => {
    expect(meleeSwingAngle('windUp', 0)).toBe(0)
    expect(meleeSwingAngle('recovery', 1)).toBe(0)
    expect(meleeSwingAngle('idle', 0)).toBe(0)
  })

  it('is continuous across the wind-up -> hit-window boundary', () => {
    expect(meleeSwingAngle('windUp', 1)).toBeCloseTo(meleeSwingAngle('hitWindow', 0), 5)
  })

  it('is continuous across the hit-window -> recovery boundary', () => {
    expect(meleeSwingAngle('hitWindow', 1)).toBeCloseTo(meleeSwingAngle('recovery', 0), 5)
  })
})
