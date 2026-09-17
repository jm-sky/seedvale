import { describe, expect, it } from 'vitest'
import { createHealthState, healHealth } from './HealthState'
import { clampPhysicalInjuryToMissingHp, type InjuryRecoveryState } from './injuryRecovery'
import {
  criticalInjuryFloor,
  resolveInjurySeverity,
  seriousInjuryFloor,
} from './injurySeverity'
import { resolvePhysicalInjuryTreatment } from './physicalInjuryTreatment'

describe('seriousInjuryFloor (plan items-player-045)', () => {
  it('uses the shared serious threshold', () => {
    expect(seriousInjuryFloor(100)).toBe(25)
    expect(seriousInjuryFloor(0)).toBe(0)
  })
})

describe('resolvePhysicalInjuryTreatment (plan items-player-045)', () => {
  it('rejects when there is no injury', () => {
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 0,
      maxHp: 100,
      mode: 'stabilize',
      requestedHp: 10,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('no-injury')
    expect(result.requestedHpRestore).toBe(0)
  })

  it('lets minor stabilization reach 0 within requested potency', () => {
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 20,
      maxHp: 100,
      mode: 'stabilize',
      requestedHp: 50,
    })
    expect(result.allowed).toBe(true)
    expect(result.resultingInjuryFloor).toBe(0)
    expect(result.requestedHpRestore).toBe(20)
    expect(result.projectedInjury).toBe(0)
  })

  it('does not let serious stabilization drop below the serious → minor floor', () => {
    const floor = seriousInjuryFloor(100)
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 40,
      maxHp: 100,
      mode: 'stabilize',
      requestedHp: 100,
    })
    expect(result.allowed).toBe(true)
    expect(result.resultingInjuryFloor).toBe(floor)
    expect(result.requestedHpRestore).toBe(40 - floor)
    expect(result.projectedInjury).toBe(floor)
    expect(resolveInjurySeverity(result.projectedInjury, 100)).toBe('serious')
  })

  it('does not let critical stabilization drop below criticalInjuryFloor', () => {
    const floor = criticalInjuryFloor(100)
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 80,
      maxHp: 100,
      mode: 'stabilize',
      requestedHp: 100,
    })
    expect(result.allowed).toBe(true)
    expect(result.resultingInjuryFloor).toBe(floor)
    expect(result.requestedHpRestore).toBe(80 - floor)
    expect(result.projectedInjury).toBe(floor)
    expect(resolveInjurySeverity(result.projectedInjury, 100)).toBe('critical')
  })

  it('clamps stabilize potency below the distance to the floor', () => {
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 40,
      maxHp: 100,
      mode: 'stabilize',
      requestedHp: 5,
    })
    expect(result.requestedHpRestore).toBe(5)
    expect(result.projectedInjury).toBe(35)
  })

  it('lets material treatment with sufficient maxSeverity cross the stabilize floor', () => {
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 80,
      maxHp: 100,
      mode: 'material',
      material: { immediateHp: 35, maxSeverity: 'critical' },
    })
    expect(result.allowed).toBe(true)
    expect(result.resultingInjuryFloor).toBe(0)
    expect(result.requestedHpRestore).toBe(35)
    expect(result.projectedInjury).toBe(45)
    expect(resolveInjurySeverity(result.projectedInjury, 100)).toBe('serious')
  })

  it('rejects material treatment with insufficient maxSeverity', () => {
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 80,
      maxHp: 100,
      mode: 'material',
      material: { immediateHp: 35, maxSeverity: 'minor' },
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('insufficient-severity')
    expect(result.requestedHpRestore).toBe(0)
    expect(result.projectedInjury).toBe(80)
  })

  it('never projects negative injury from over-heal potency', () => {
    const result = resolvePhysicalInjuryTreatment({
      physicalInjury: 10,
      maxHp: 100,
      mode: 'material',
      material: { immediateHp: 50, maxSeverity: 'critical' },
    })
    expect(result.projectedInjury).toBe(0)
    expect(result.requestedHpRestore).toBe(10)
  })
})

describe('clampPhysicalInjuryToMissingHp (plan items-player-045)', () => {
  it('reduces injury when generic HP recovery leaves injury above missing HP', () => {
    const health = createHealthState(100)
    health.currentHp = 70
    const state: InjuryRecoveryState = {
      health,
      physicalInjury: 40,
      injuryRecoveryUpdatedAtDays: 0,
    }
    healHealth(state.health, 20)
    clampPhysicalInjuryToMissingHp(state)
    expect(state.health.currentHp).toBe(90)
    expect(state.physicalInjury).toBe(10)
  })
})
