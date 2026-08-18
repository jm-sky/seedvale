import { describe, expect, it, vi } from 'vitest'
import { createHealthState } from '../shared/HealthState'
import {
  applyDownedRecovery,
  DOWNED_RECOVERY_HP_MAX,
  DOWNED_RECOVERY_HP_MIN,
  rollDownedRecoveryHp,
} from './playerDamage'

describe('downed recovery HP', () => {
  it('rolls within the configured 1–5 range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(rollDownedRecoveryHp()).toBe(DOWNED_RECOVERY_HP_MIN)
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(rollDownedRecoveryHp()).toBe(DOWNED_RECOVERY_HP_MAX)
    vi.restoreAllMocks()
  })

  it('heals a downed player from 0 HP on recovery', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const health = createHealthState(100)
    health.currentHp = 0
    const healed = applyDownedRecovery(health)
    expect(healed).toBeGreaterThanOrEqual(DOWNED_RECOVERY_HP_MIN)
    expect(healed).toBeLessThanOrEqual(DOWNED_RECOVERY_HP_MAX)
    expect(health.currentHp).toBe(healed)
    vi.restoreAllMocks()
  })
})
