import { describe, expect, it } from 'vitest'
import type { MeleeConfig } from '../items/itemCatalog'
import { COMBAT_TARGET_CONE_DOT } from '../app/interactables'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { createStaminaState, type StaminaState } from '../shared/StaminaState'
import { createVigorState } from '../shared/VigorState'
import {
  createPlayerMelee,
  FALLBACK_APPROACH_DISTANCE,
  LUNGE_STAMINA_COST,
  MAX_LUNGE_DISTANCE,
  type MeleeHitCandidate,
  meleeSwingAngle,
  pickCombatTarget,
  resolveMeleeHits,
  yawToward,
} from './playerMelee'

/** Arbitrary real-seconds-per-game-day used by every test below — only the
 *  Vigor-cost tests care about its actual value. */
const DAY_LENGTH_SEC = 600

/** Attacks a target 1m directly ahead (-Z, yaw 0) — inside every plan-123
 *  weapon's range, so existing lifecycle tests are unaffected by plan 124's
 *  gap-close unless a test deliberately places the target elsewhere. */
function attackNearbyTarget(
  melee: ReturnType<typeof createPlayerMelee>,
  config: MeleeConfig,
  stamina: StaminaState,
) {
  return melee.requestAttack(config, stamina, createVigorState(100), DAY_LENGTH_SEC, 0, 0, 0, -1)
}

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

  it('plan 160 high-quality weapons sit above their base counterparts', () => {
    expect(ITEM_CATALOG.damascus_knife.melee!.damage).toBeGreaterThan(KNIFE.damage)
    expect(ITEM_CATALOG.damascus_short_sword.melee!.damage).toBeGreaterThan(ITEM_CATALOG.short_sword.melee!.damage)
    expect(ITEM_CATALOG.masterwork_sword.melee!.damage).toBeGreaterThan(SWORD.damage)
    expect(ITEM_CATALOG.damascus_long_sword.melee!.damage).toBeGreaterThan(ITEM_CATALOG.masterwork_sword.melee!.damage)
    expect(ITEM_CATALOG.battle_axe.melee!.damage).toBeGreaterThan(AXE.damage)
    expect(ITEM_CATALOG.obsidian_sword.melee!.damage).toBeGreaterThan(ITEM_CATALOG.damascus_long_sword.melee!.damage)
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
    expect(attackNearbyTarget(melee, KNIFE, stamina).started).toBe(false)
    expect(melee.isAttacking()).toBe(false)
    expect(stamina.current).toBe(KNIFE.staminaCost - 1)
  })

  it('drains stamina exactly once on a successful attack request', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    expect(attackNearbyTarget(melee, KNIFE, stamina).started).toBe(true)
    expect(stamina.current).toBe(100 - KNIFE.staminaCost)
    // A second request mid-attack must not drain stamina again.
    expect(attackNearbyTarget(melee, KNIFE, stamina).started).toBe(false)
    expect(stamina.current).toBe(100 - KNIFE.staminaCost)
  })

  it('cannot be requested again during recovery (no spamming past the configured timing)', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    expect(attackNearbyTarget(melee, KNIFE, stamina).started).toBe(true)
    // Advance almost through the whole attack but not quite.
    melee.update(KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery - 0.001)
    expect(attackNearbyTarget(melee, KNIFE, stamina).started).toBe(false)
  })

  it('reaches idle again and accepts a new attack once recovery completes', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    attackNearbyTarget(melee, KNIFE, stamina)
    melee.update(KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery + 0.001)
    expect(melee.state()).toBe('idle')
    expect(attackNearbyTarget(melee, KNIFE, stamina).started).toBe(true)
  })

  it('signals hitReady exactly once per attack, at the wind-up -> hit-window edge', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    attackNearbyTarget(melee, KNIFE, stamina)

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
    attackNearbyTarget(melee, KNIFE, stamina)
    const tick = melee.update(KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery + 1)
    expect(tick.hitReady).toBe(true)
    expect(melee.state()).toBe('idle')
  })

  it('reset() cancels an in-flight attack (pause/modal safety)', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    attackNearbyTarget(melee, KNIFE, stamina)
    melee.update(KNIFE.windUp * 0.5)
    expect(melee.isAttacking()).toBe(true)
    melee.reset()
    expect(melee.isAttacking()).toBe(false)
    expect(melee.state()).toBe('idle')
  })
})

describe('createPlayerMelee gap close (plan 124 §3)', () => {
  it('does not move the player when the target is already within range', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    // Target 1m ahead, well within the knife's 1.6 range.
    const result = melee.requestAttack(KNIFE, stamina, createVigorState(100), DAY_LENGTH_SEC, 0, 0, 0, -1)
    expect(result.started).toBe(true)
    expect(result.moveX).toBe(0)
    expect(result.moveZ).toBe(0)
  })

  it('lunges toward a target beyond range when stamina covers the lunge cost', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    // Target 5m ahead (-Z), well beyond the knife's 1.6 range.
    const result = melee.requestAttack(KNIFE, stamina, createVigorState(100), DAY_LENGTH_SEC, 0, 0, 0, -5)
    expect(result.started).toBe(true)
    expect(result.moveZ).toBeLessThan(0) // moves toward -Z, i.e. toward the target
    expect(Math.abs(result.moveZ)).toBeLessThanOrEqual(MAX_LUNGE_DISTANCE)
    expect(stamina.current).toBe(100 - KNIFE.staminaCost - LUNGE_STAMINA_COST)
  })

  it('never lunges further than MAX_LUNGE_DISTANCE even for a very distant target', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(100)
    const result = melee.requestAttack(KNIFE, stamina, createVigorState(100), DAY_LENGTH_SEC, 0, 0, 0, -50)
    expect(Math.abs(result.moveZ)).toBeCloseTo(MAX_LUNGE_DISTANCE, 5)
  })

  it('falls back to a <=1m approach when stamina cannot cover the lunge, without an extra stamina cost', () => {
    const melee = createPlayerMelee()
    // Enough for the base attack, not enough for the lunge on top of it.
    const stamina = createStaminaState(KNIFE.staminaCost + LUNGE_STAMINA_COST - 1)
    const result = melee.requestAttack(KNIFE, stamina, createVigorState(100), DAY_LENGTH_SEC, 0, 0, 0, -5)
    expect(result.started).toBe(true)
    expect(Math.abs(result.moveZ)).toBeLessThanOrEqual(FALLBACK_APPROACH_DISTANCE)
    // Only the base attack cost was drained — no lunge cost on top of it.
    expect(stamina.current).toBe(LUNGE_STAMINA_COST - 1)
  })

  it('still starts the attack (and still whiffs) when the 1m fallback leaves the target out of range', () => {
    const melee = createPlayerMelee()
    const stamina = createStaminaState(KNIFE.staminaCost)
    // Target 5m ahead (-Z); the target itself never moves.
    const result = melee.requestAttack(KNIFE, stamina, createVigorState(100), DAY_LENGTH_SEC, 0, 0, 0, -5)
    expect(result.started).toBe(true)
    expect(Math.abs(result.moveZ)).toBeLessThanOrEqual(FALLBACK_APPROACH_DISTANCE)
    // Player only moved to (0, result.moveZ); the target at (0, -5) is still
    // well beyond KNIFE.range from there — the geometric hit test at the
    // (later) hit window independently confirms no hit lands.
    const candidates: MeleeHitCandidate[] = [{ id: 'a', x: 0, z: -5, alive: true }]
    expect(resolveMeleeHits(0, result.moveZ, 0, KNIFE, candidates)).toEqual([])
  })
})

describe('rememberHit / recentTargetIds (plan 124 §1)', () => {
  it('starts empty and records hits, most recent first', () => {
    const melee = createPlayerMelee()
    expect(melee.recentTargetIds()).toEqual([])
    melee.rememberHit('a')
    melee.rememberHit('b')
    expect(melee.recentTargetIds()).toEqual(['b', 'a'])
  })

  it('moves a re-hit id back to the front instead of duplicating it', () => {
    const melee = createPlayerMelee()
    melee.rememberHit('a')
    melee.rememberHit('b')
    melee.rememberHit('a')
    expect(melee.recentTargetIds()).toEqual(['a', 'b'])
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

describe('pickCombatTarget (plan 124 §1)', () => {
  // Player at origin, facing -Z (yaw 0), matching resolveMeleeHits'/pickInGaze's convention.
  const RANGE = 7
  const CONE_DOT = Math.SQRT1_2

  it('prefers the more centered target over an equidistant off-center one', () => {
    const candidates: MeleeHitCandidate[] = [
      { id: 'center', x: 0, z: -5, alive: true }, // dot 1, dist 5
      { id: 'side', x: 3, z: -4, alive: true }, // dot 0.8, dist 5 — same distance, less centered
    ]
    expect(pickCombatTarget(candidates, 0, 0, 0, RANGE, CONE_DOT, [])).toBe('center')
  })

  it('prefers the closer target when both are similarly centered', () => {
    const candidates: MeleeHitCandidate[] = [
      { id: 'near', x: 0, z: -2, alive: true },
      { id: 'far', x: 0, z: -6, alive: true },
    ]
    expect(pickCombatTarget(candidates, 0, 0, 0, RANGE, CONE_DOT, [])).toBe('near')
  })

  it('prefers a recently-hit target over an (approximately) equally centered/close one', () => {
    // Mirrored across the forward axis: identical dot and distance, so only
    // the memory tie-break can decide between them.
    const candidates: MeleeHitCandidate[] = [
      { id: 'a', x: 0.5, z: -3, alive: true },
      { id: 'b', x: -0.5, z: -3, alive: true },
    ]
    expect(pickCombatTarget(candidates, 0, 0, 0, RANGE, CONE_DOT, ['b'])).toBe('b')
  })

  it('ignores dead, out-of-range, and out-of-cone candidates', () => {
    const candidates: MeleeHitCandidate[] = [
      { id: 'dead', x: 0, z: -2, alive: false },
      { id: 'too-far', x: 0, z: -(RANGE + 1), alive: true },
      { id: 'behind', x: 0, z: 2, alive: true },
    ]
    expect(pickCombatTarget(candidates, 0, 0, 0, RANGE, CONE_DOT, [])).toBeNull()
  })

  it('returns null when there are no candidates', () => {
    expect(pickCombatTarget([], 0, 0, 0, RANGE, CONE_DOT, [])).toBeNull()
  })
})

describe('mobile target acquisition & auto-facing (plan 142)', () => {
  const RANGE = 7
  /** 60° off the forward axis at 3m — outside the pointer cone (45°), inside
   *  the touch one, and outside the knife's own 53° hit arc. */
  const OFF_AXIS: MeleeHitCandidate = { id: 'off-axis', x: 3 * Math.sin(Math.PI / 3), z: -3 * Math.cos(Math.PI / 3), alive: true }

  it('keeps the pointer cone at its plan-124 width', () => {
    expect(COMBAT_TARGET_CONE_DOT.pointer).toBe(Math.SQRT1_2)
    expect(pickCombatTarget([OFF_AXIS], 0, 0, 0, RANGE, COMBAT_TARGET_CONE_DOT.pointer, [])).toBeNull()
  })

  it('acquires an off-axis target on touch that the pointer cone rejects', () => {
    expect(pickCombatTarget([OFF_AXIS], 0, 0, 0, RANGE, COMBAT_TARGET_CONE_DOT.touch, [])).toBe('off-axis')
  })

  it('acquires a ~75° off-axis target on touch that the old 0.3 cone rejected', () => {
    const wideOffAxis: MeleeHitCandidate = {
      id: 'wide-off-axis',
      x: 3 * Math.sin((75 * Math.PI) / 180),
      z: -3 * Math.cos((75 * Math.PI) / 180),
      alive: true,
    }
    expect(pickCombatTarget([wideOffAxis], 0, 0, 0, RANGE, COMBAT_TARGET_CONE_DOT.pointer, [])).toBeNull()
    expect(pickCombatTarget([wideOffAxis], 0, 0, 0, RANGE, 0.3, [])).toBeNull()
    expect(pickCombatTarget([wideOffAxis], 0, 0, 0, RANGE, COMBAT_TARGET_CONE_DOT.touch, [])).toBe('wide-off-axis')
  })

  it('still rejects targets outside any sensible attack direction on touch', () => {
    const candidates: MeleeHitCandidate[] = [
      { id: 'perpendicular', x: 3, z: 0, alive: true },
      { id: 'behind', x: 0, z: 3, alive: true },
    ]
    expect(pickCombatTarget(candidates, 0, 0, 0, RANGE, COMBAT_TARGET_CONE_DOT.touch, [])).toBeNull()
  })

  it('keeps the existing ranking inside the wider touch cone', () => {
    const candidates: MeleeHitCandidate[] = [OFF_AXIS, { id: 'center', x: 0, z: -3, alive: true }]
    expect(pickCombatTarget(candidates, 0, 0, 0, RANGE, COMBAT_TARGET_CONE_DOT.touch, [])).toBe('center')
    expect(pickCombatTarget([...candidates].reverse(), 0, 0, 0, RANGE, COMBAT_TARGET_CONE_DOT.touch, [])).toBe('center')
  })

  it('yawToward aims straight at the target in the hit test convention', () => {
    // Forward is (-sin(yaw), -cos(yaw)): -Z is yaw 0, +X is yaw -90°.
    expect(yawToward(0, 0, 0, -5)).toBeCloseTo(0, 6)
    expect(yawToward(0, 0, 5, 0)).toBeCloseTo(-Math.PI / 2, 6)
    expect(yawToward(2, 2, 2, -3)).toBeCloseTo(0, 6)
  })

  it('returns null instead of a direction when the target is on top of the player', () => {
    expect(yawToward(1, 1, 1, 1)).toBeNull()
  })

  it('lets an auto-faced attack connect with a target outside the weapon arc', () => {
    const target: MeleeHitCandidate = { id: 'off-axis', x: 1.5 * Math.sin(Math.PI / 3), z: -1.5 * Math.cos(Math.PI / 3), alive: true }
    expect(resolveMeleeHits(0, 0, 0, KNIFE, [target])).toEqual([])
    const yaw = yawToward(0, 0, target.x, target.z)!
    expect(resolveMeleeHits(0, 0, yaw, KNIFE, [target])).toEqual(['off-axis'])
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
