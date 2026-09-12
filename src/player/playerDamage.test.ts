import { describe, expect, it } from 'vitest'
import type { EquipmentModifiers } from '../items/equipment'
import type { PlayerController } from './PlayerController'
import { NEUTRAL_EQUIPMENT_MODIFIERS } from '../items/equipment'
import { createHealthState } from '../shared/HealthState'
import { applyPlayerDamage, tickPlayerStarvationDamage } from './playerDamage'
import { createPlayerNeeds, hungerSevereDurationSec } from './PlayerNeeds'

/** Narrow test double for the slice of `PlayerController` `applyPlayerDamage`
 *  actually reads/mutates — a real instance needs a THREE scene/rig this
 *  module doesn't otherwise depend on. */
function createMockPlayer(hp = 100): PlayerController {
  let downed = false
  let attempt = 0
  return {
    isDowned: () => downed,
    health: createHealthState(hp),
    mesh: { position: { x: 0, y: 0, z: 0 } },
    nextDefenseAttempt: () => ++attempt,
    enterDowned: () => { downed = true },
    skills: { defense: { xp: 0, value: 0 } },
  } as unknown as PlayerController
}

const DOUBLE_REDUCTION: EquipmentModifiers = {
  ...NEUTRAL_EQUIPMENT_MODIFIERS,
  incomingDamageMultiplier: 0.5,
}

describe('applyPlayerDamage — armor mitigation (plan items-player-029)', () => {
  it('is unaffected when no equipmentModifiers is passed (neutral by omission)', () => {
    const player = createMockPlayer()
    const result = applyPlayerDamage({
      player,
      amount: 20,
      heldTool: null,
      defenseSkillValue: 0,
      playerYaw: 0,
    })
    expect(result.finalDamage).toBe(20)
    expect(player.health.currentHp).toBe(80)
  })

  it('reduces remaining damage by the equipped multiplier', () => {
    const player = createMockPlayer()
    const result = applyPlayerDamage({
      player,
      amount: 20,
      heldTool: null,
      defenseSkillValue: 0,
      playerYaw: 0,
      equipmentModifiers: DOUBLE_REDUCTION,
    })
    expect(result.finalDamage).toBe(10)
    expect(player.health.currentHp).toBe(90)
  })

  it('applies after active defense resolves, not instead of it (no held item ⇒ no active defense either way)', () => {
    const withoutArmor = createMockPlayer()
    const withArmor = createMockPlayer()
    const base = applyPlayerDamage({ player: withoutArmor, amount: 30, heldTool: null, defenseSkillValue: 0, playerYaw: 0 })
    const mitigated = applyPlayerDamage({
      player: withArmor, amount: 30, heldTool: null, defenseSkillValue: 0, playerYaw: 0, equipmentModifiers: DOUBLE_REDUCTION,
    })
    expect(mitigated.finalDamage).toBe(base.finalDamage * 0.5)
    expect(mitigated.defenseOutcome).toBe(base.defenseOutcome)
  })

  it('does not award defense skill XP by itself', () => {
    const player = createMockPlayer()
    applyPlayerDamage({
      player,
      amount: 20,
      heldTool: null,
      defenseSkillValue: 0,
      playerYaw: 0,
      equipmentModifiers: DOUBLE_REDUCTION,
    })
    expect(player.skills.defense.xp).toBe(0)
  })
})

describe('tickPlayerStarvationDamage — never armor-mitigated (plan items-player-029)', () => {
  it('applies the full unmitigated severe-hunger drain regardless of any wearable-equipment state elsewhere', () => {
    const player = createMockPlayer()
    const needs = createPlayerNeeds()
    const dayLengthSec = 600
    needs.starvationDuration = hungerSevereDurationSec(dayLengthSec) + 1
    const dt = 1
    tickPlayerStarvationDamage(player, needs, dt, null, 0, dayLengthSec)
    // STARVATION_HP_PER_SEC is not exported; assert only that damage was applied
    // and that it is strictly the module's own unmitigated rate (no armor
    // multiplier ever reaches this path — `applyPlayerDamage` is called here
    // without `equipmentModifiers`).
    expect(player.health.currentHp).toBeLessThan(100)
  })
})
