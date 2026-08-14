import { describe, expect, it } from 'vitest'
import {
  createMovementWatchdog,
  EMERGENCY_TELEPORT_AFTER_ABANDONS,
  registerAbandon,
  resetMovementWatchdog,
  STUCK_CHECK_INTERVAL_SEC,
  tickMovementWatchdog,
} from './npcMovementWatchdog'

/**
 * Contract tests for NPC stuck-movement detection and rescue-stage
 * escalation (movement resilience plan). `NpcAgent` is Three.js-heavy; these
 * encode the pure state-machine rules the agent must follow.
 */
describe('movement watchdog stuck detection', () => {
  function tickStill(watchdog: ReturnType<typeof createMovementWatchdog>, checks: number) {
    const stages: string[] = []
    for (let i = 0; i < checks; i++) {
      stages.push(tickMovementWatchdog(watchdog, STUCK_CHECK_INTERVAL_SEC, 0, 0))
    }
    return stages
  }

  it('first check after a reset never reports progress loss', () => {
    const watchdog = createMovementWatchdog()
    const stage = tickMovementWatchdog(watchdog, STUCK_CHECK_INTERVAL_SEC, 5, 5)
    expect(stage).toBe('none')
  })

  it('escalates none -> repath -> escape -> abandon in strict order without skipping a stage', () => {
    const watchdog = createMovementWatchdog()
    const stages = tickStill(watchdog, 5)
    // 1st check just seeds the baseline position; strikes start accumulating from the 2nd.
    expect(stages).toEqual(['none', 'none', 'repath', 'escape', 'abandon'])
  })

  it('does not escalate before the interval elapses', () => {
    const watchdog = createMovementWatchdog()
    tickMovementWatchdog(watchdog, STUCK_CHECK_INTERVAL_SEC, 0, 0)
    const stage = tickMovementWatchdog(watchdog, STUCK_CHECK_INTERVAL_SEC / 2, 0, 0)
    expect(stage).toBe('none')
  })

  it('real progress resets strikes and stage at any point', () => {
    const watchdog = createMovementWatchdog()
    tickStill(watchdog, 3) // reaches 'repath'
    expect(watchdog.rescueStage).toBe('repath')
    const stage = tickMovementWatchdog(watchdog, STUCK_CHECK_INTERVAL_SEC, 10, 10)
    expect(stage).toBe('none')
    expect(watchdog.rescueStage).toBe('none')
    expect(watchdog.lowProgressStrikes).toBe(0)
    // Escalation restarts from scratch after the reset caused by progress.
    const stagesAfter = tickStill(watchdog, 5)
    expect(stagesAfter).toEqual(['none', 'none', 'repath', 'escape', 'abandon'])
  })

  it('resetMovementWatchdog clears strikes/stage for a fresh destination', () => {
    const watchdog = createMovementWatchdog()
    tickStill(watchdog, 5) // reaches 'abandon'
    resetMovementWatchdog(watchdog)
    expect(watchdog.rescueStage).toBe('none')
    expect(watchdog.lowProgressStrikes).toBe(0)
    const stage = tickMovementWatchdog(watchdog, STUCK_CHECK_INTERVAL_SEC, 0, 0)
    expect(stage).toBe('none')
  })

  it('keeps reporting abandon on subsequent stalled checks if the caller does not reset', () => {
    const watchdog = createMovementWatchdog()
    const stages = tickStill(watchdog, 7)
    expect(stages[4]).toBe('abandon')
    expect(stages[5]).toBe('abandon')
    expect(stages[6]).toBe('abandon')
  })

  it('a caller-driven reset after abandon starts a fresh escalation', () => {
    const watchdog = createMovementWatchdog()
    tickStill(watchdog, 5) // reaches 'abandon'
    resetMovementWatchdog(watchdog)
    const stagesAfter = tickStill(watchdog, 5)
    expect(stagesAfter).toEqual(['none', 'none', 'repath', 'escape', 'abandon'])
  })
})

describe('recent-rescue tracking for emergency teleport', () => {
  it('does not escalate to emergency teleport before the abandon threshold', () => {
    const watchdog = createMovementWatchdog()
    for (let i = 0; i < EMERGENCY_TELEPORT_AFTER_ABANDONS - 1; i++) {
      expect(registerAbandon(watchdog)).toBe(false)
    }
  })

  it('escalates to emergency teleport once abandons reach the threshold within the window', () => {
    const watchdog = createMovementWatchdog()
    let escalate = false
    for (let i = 0; i < EMERGENCY_TELEPORT_AFTER_ABANDONS; i++) {
      escalate = registerAbandon(watchdog)
    }
    expect(escalate).toBe(true)
    expect(watchdog.recentRescueCount).toBe(EMERGENCY_TELEPORT_AFTER_ABANDONS)
  })

  it('recentRescueCount decays back to 0 once the rolling window elapses', () => {
    const watchdog = createMovementWatchdog()
    registerAbandon(watchdog)
    expect(watchdog.recentRescueCount).toBe(1)
    tickMovementWatchdog(watchdog, watchdog.recentRescueTimer + 1, 0, 0)
    expect(watchdog.recentRescueCount).toBe(0)
  })
})
