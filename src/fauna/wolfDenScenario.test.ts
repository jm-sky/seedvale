import { describe, expect, it } from 'vitest'
import type { PreySpawner } from './AnimalSpawner'
import { tickSpawnPointRecovery } from './AnimalSpawner'
import {
  activateWolfDenProblem,
  canOfferSettlementTrip,
  effectiveMaxPreyCount,
  effectiveRespawnIntervalDays,
  isQuestSpawnPointPermanentlyDestroyed,
  isWolfDenPermanentlyDestroyed,
  shouldActivateWolfDenProblem,
  WOLF_DEN_ACTIVE_PRESSURE,
  WOLF_DEN_PROBLEM_START_DAY,
} from './wolfDenScenario'
import { WOLF_DEN_ID } from './AnimalSpawner'

function wolfDen(overrides: Partial<PreySpawner> = {}): PreySpawner {
  return {
    id: 'home:wolfDen',
    x: 0,
    z: 0,
    type: 'wolfDen',
    kind: 'wolf',
    respawnIntervalDays: Infinity,
    maxPreyCount: 2,
    daysSinceLastRespawn: 0,
    state: 'active',
    deathsThisCycle: 0,
    disabledAtDay: null,
    pressure: 0,
    humanTaste: false,
    canRecover: false,
    lastSettlementTripOpportunityDay: null,
    ...overrides,
  }
}

describe('wolf den problem activation', () => {
  it('does not activate before day 2', () => {
    const den = wolfDen()
    expect(shouldActivateWolfDenProblem(den, WOLF_DEN_PROBLEM_START_DAY - 1)).toBe(false)
  })

  it('activates on day 2 with pressure and humanTaste', () => {
    const den = wolfDen()
    expect(shouldActivateWolfDenProblem(den, WOLF_DEN_PROBLEM_START_DAY)).toBe(true)
    activateWolfDenProblem(den)
    expect(den.pressure).toBe(WOLF_DEN_ACTIVE_PRESSURE)
    expect(den.humanTaste).toBe(true)
  })

  it('does not activate a permanently destroyed den', () => {
    const den = wolfDen({ state: 'disabled', canRecover: false })
    expect(shouldActivateWolfDenProblem(den, 10)).toBe(false)
  })
})

describe('pressure scaling', () => {
  it('keeps baseline cap at pressure 0', () => {
    expect(effectiveMaxPreyCount(wolfDen())).toBe(2)
    expect(effectiveRespawnIntervalDays(wolfDen())).toBe(Infinity)
  })

  it('scales cap and respawn at pressure 0.75', () => {
    const den = wolfDen({ pressure: 0.75 })
    expect(effectiveMaxPreyCount(den)).toBe(5)
    expect(effectiveRespawnIntervalDays(den)).toBeCloseTo(1.875, 2)
  })

  it('stays bounded for pressure in [0, 1]', () => {
    const den = wolfDen({ pressure: 1 })
    expect(effectiveMaxPreyCount(den)).toBe(6)
    expect(effectiveRespawnIntervalDays(den)).toBe(1.5)
  })
})

describe('permanent destruction', () => {
  it('detects disabled non-recoverable wolf den', () => {
    const den = wolfDen({ state: 'disabled', canRecover: false })
    expect(isWolfDenPermanentlyDestroyed(den)).toBe(true)
    expect(isQuestSpawnPointPermanentlyDestroyed([den], WOLF_DEN_ID)).toBe(true)
  })

  it('does not treat depleted as permanent destruction', () => {
    const den = wolfDen({ state: 'depleted' })
    expect(isQuestSpawnPointPermanentlyDestroyed([den], WOLF_DEN_ID)).toBe(false)
  })

  it('never recovers when canRecover is false', () => {
    const den = wolfDen({ state: 'disabled', disabledAtDay: 0, canRecover: false })
    tickSpawnPointRecovery(den, 100, 99)
    expect(den.state).toBe('disabled')
  })
})

describe('settlement trip cooldown', () => {
  it('blocks opportunities within 0.5 day', () => {
    const den = wolfDen({ pressure: 0.75, lastSettlementTripOpportunityDay: 2 })
    expect(canOfferSettlementTrip(den, 2.4)).toBe(false)
    expect(canOfferSettlementTrip(den, 2.5)).toBe(true)
  })
})
