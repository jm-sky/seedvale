import { describe, expect, it } from 'vitest'
import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
import {
  createStaminaState,
  drainStamina,
  restoreStamina,
} from '../shared/StaminaState'
import {
  createVigorState,
  drainVigor,
  isCollapsed,
  restoreVigor,
} from '../shared/VigorState'
import { pickNeed } from './Needs'
import {
  applyDamageVigor,
  applySleepVigor,
  applyWorkVigor,
  DAMAGE_VIGOR_COST,
  isHeavyWorkKind,
  preferHomeSleep,
  shouldCollapseSleep,
  shouldStayAsleep,
  SLEEP_VIGOR_RESTORE_RATE,
  tickVigorForSimulatedStep,
  VIGOR_WAKE_THRESHOLD,
  WORK_VIGOR_COST,
} from './npcVigor'

/**
 * Contract tests for NPC daily vigor (plan 092). NpcAgent is Three.js-heavy;
 * these encode the physiological rules the agent must follow.
 */
describe('NPC vigor contract', () => {
  it('work drains vigor, not HP', () => {
    const health = createHealthState(100)
    const vigor = createVigorState(100)
    applyWorkVigor(vigor, 5)
    expect(health.currentHp).toBe(100)
    expect(vigor.current).toBeCloseTo(100 - WORK_VIGOR_COST * 5)
    expect(isAlive(health)).toBe(true)
  })

  it('stamina and vigor remain independent', () => {
    const stamina = createStaminaState(100)
    const vigor = createVigorState(100)
    drainStamina(stamina, 40)
    applyWorkVigor(vigor, 10)
    expect(stamina.current).toBe(60)
    expect(vigor.current).toBeCloseTo(100 - WORK_VIGOR_COST * 10)
    restoreStamina(stamina, 15)
    expect(stamina.current).toBe(75)
    expect(vigor.current).toBeCloseTo(100 - WORK_VIGOR_COST * 10)
  })

  it('ordinary rest restores stamina without restoring vigor', () => {
    const stamina = createStaminaState(100)
    const vigor = createVigorState(100)
    stamina.current = 20
    vigor.current = 40
    restoreStamina(stamina, 6 * 5)
    expect(stamina.current).toBe(50)
    expect(vigor.current).toBe(40)
  })

  it('sleep restores vigor', () => {
    const vigor = createVigorState(100)
    vigor.current = 20
    applySleepVigor(vigor, 10)
    expect(vigor.current).toBeCloseTo(20 + SLEEP_VIGOR_RESTORE_RATE * 10)
  })

  it('damage drains vigor but HP still controls death', () => {
    const health = createHealthState(100)
    const vigor = createVigorState(100)
    damageHealth(health, 25)
    applyDamageVigor(vigor)
    expect(health.currentHp).toBe(75)
    expect(health.dead).toBe(false)
    expect(vigor.current).toBe(100 - DAMAGE_VIGOR_COST)
  })

  it('zero/low vigor does not kill the NPC', () => {
    const health = createHealthState(100)
    const vigor = createVigorState(100)
    drainVigor(vigor, 10_000)
    expect(isCollapsed(vigor)).toBe(true)
    expect(vigor.current).toBe(0)
    expect(health.dead).toBe(false)
    expect(health.currentHp).toBe(100)
  })

  it('idle/wander does not rapidly consume vigor', () => {
    const vigor = createVigorState(100)
    // Idle/wander/eat/drink are not heavy work — no drain helper is applied.
    expect(isHeavyWorkKind('eat')).toBe(false)
    expect(isHeavyWorkKind('drink')).toBe(false)
    expect(isHeavyWorkKind('deposit')).toBe(false)
    expect(isHeavyWorkKind('wander')).toBe(false)
    expect(vigor.current).toBe(100)
  })

  it('chop and workplace work are the heavy-effort actions', () => {
    expect(isHeavyWorkKind('work')).toBe(true)
    expect(isHeavyWorkKind('chop')).toBe(true)
  })
})

describe('collapse sleep gate', () => {
  it('collapsed vigor requests sleep even when needs and work would win', () => {
    const vigor = createVigorState(100)
    vigor.current = 0
    const needs = { thirst: 0.9, woodDuty: 0.9, hunger: 0.9 }
    expect(shouldCollapseSleep(vigor)).toBe(true)
    expect(pickNeed(needs)).toBe('water')
    expect(shouldStayAsleep(vigor, 'work', 'collapse')).toBe(true)
  })

  it('scheduled sleep still holds while vigor is healthy', () => {
    const vigor = createVigorState(100)
    expect(shouldCollapseSleep(vigor)).toBe(false)
    expect(shouldStayAsleep(vigor, 'sleep', 'schedule')).toBe(true)
    expect(shouldStayAsleep(vigor, 'work', 'schedule')).toBe(false)
  })

  it('a collapse nap continues until the wake threshold, not just above collapse', () => {
    const vigor = createVigorState(100)
    vigor.current = VIGOR_WAKE_THRESHOLD - 1
    expect(shouldCollapseSleep(vigor)).toBe(false)
    expect(shouldStayAsleep(vigor, 'work', 'collapse')).toBe(true)
    restoreVigor(vigor, 2)
    expect(shouldStayAsleep(vigor, 'work', 'collapse')).toBe(false)
  })

  it('sleeps at home when close, otherwise allows in-place sleep', () => {
    expect(preferHomeSleep(8)).toBe(true)
    expect(preferHomeSleep(40)).toBe(false)
  })
})

describe('tickVigorForSimulatedStep (time-skip catch-up)', () => {
  it('work drains vigor; sleep restores it', () => {
    const vigor = createVigorState(100)
    vigor.current = 50
    tickVigorForSimulatedStep(vigor, 'work', 10, false)
    expect(vigor.current).toBeCloseTo(50 - WORK_VIGOR_COST * 10)
    tickVigorForSimulatedStep(vigor, 'sleep', 10, false)
    expect(vigor.current).toBeCloseTo(50 - WORK_VIGOR_COST * 10 + SLEEP_VIGOR_RESTORE_RATE * 10)
  })

  it('home/eat/wake restore no vigor', () => {
    const vigor = createVigorState(100)
    vigor.current = 50
    tickVigorForSimulatedStep(vigor, 'home', 10, false)
    tickVigorForSimulatedStep(vigor, 'eat', 10, false)
    tickVigorForSimulatedStep(vigor, 'wake', 10, false)
    expect(vigor.current).toBe(50)
  })

  it('already-collapsed work becomes sleep recovery rather than more drain', () => {
    const vigor = createVigorState(100)
    vigor.current = 4
    const result = tickVigorForSimulatedStep(vigor, 'work', 10, false)
    expect(result.slept).toBe(true)
    expect(result.napping).toBe(true)
    expect(vigor.current).toBeCloseTo(4 + SLEEP_VIGOR_RESTORE_RATE * 10)
  })

  it('a work step that crosses collapse still drained as work, then the next naps', () => {
    const vigor = createVigorState(100)
    vigor.current = 6
    const first = tickVigorForSimulatedStep(vigor, 'work', 10, false)
    expect(first.slept).toBe(false)
    expect(first.napping).toBe(true)
    expect(vigor.current).toBeCloseTo(6 - WORK_VIGOR_COST * 10)
    const second = tickVigorForSimulatedStep(vigor, 'work', 10, first.napping)
    expect(second.slept).toBe(true)
    expect(vigor.current).toBeCloseTo(6 - WORK_VIGOR_COST * 10 + SLEEP_VIGOR_RESTORE_RATE * 10)
  })
})
