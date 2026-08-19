import { describe, expect, it } from 'vitest'
import {
  depletionThreshold,
  EMPTY_HABITAT_RESPAWN_MULTIPLIER,
  MIN_RECOVERY_POPULATION,
  type PreySpawner,
  RECOVERY_DAYS,
  respawnIntervalDaysFor,
  restoreSpawnPointState,
  shouldDeplete,
  snapshotSpawnPointState,
  tickSpawnPointRecovery,
  updateSpawners,
} from './AnimalSpawner'

function spawner(overrides: Partial<PreySpawner> = {}): PreySpawner {
  return {
    id: 'settlement-a:cave',
    x: 0,
    z: 0,
    type: 'cave',
    kind: 'deer',
    respawnIntervalDays: 1,
    maxPreyCount: 3,
    daysSinceLastRespawn: 0,
    state: 'active',
    deathsThisCycle: 0,
    disabledAtDay: null,
    ...overrides,
  }
}

describe('depletionThreshold / shouldDeplete', () => {
  it('is the smallest integer strictly greater than half the limit', () => {
    expect(depletionThreshold(2)).toBe(2)
    expect(depletionThreshold(3)).toBe(2)
    expect(depletionThreshold(4)).toBe(3)
    expect(depletionThreshold(6)).toBe(4)
  })

  it('does not deplete below the threshold, does at/above it', () => {
    expect(shouldDeplete(1, 3)).toBe(false)
    expect(shouldDeplete(2, 3)).toBe(true)
    expect(shouldDeplete(3, 3)).toBe(true)
  })
})

describe('respawnIntervalDaysFor', () => {
  it('doubles the wait when the habitat is empty', () => {
    expect(respawnIntervalDaysFor(1, 0)).toBe(EMPTY_HABITAT_RESPAWN_MULTIPLIER)
    expect(respawnIntervalDaysFor(1, 1)).toBe(1)
    expect(respawnIntervalDaysFor(2, 0)).toBe(4)
  })
})

describe('updateSpawners', () => {
  it('does not spawn on a zero dayDelta (load / first frame)', () => {
    const s = spawner({ daysSinceLastRespawn: 10 })
    let respawned = 0
    updateSpawners([s], 0, [], () => { respawned++ })
    expect(respawned).toBe(0)
    expect(s.daysSinceLastRespawn).toBe(10)
  })

  it('waits the empty-habitat interval before the first animal', () => {
    const s = spawner()
    let respawned = 0
    updateSpawners([s], 1, [], () => { respawned++ })
    expect(respawned).toBe(0)
    updateSpawners([s], 1, [], () => { respawned++ })
    expect(respawned).toBe(1)
  })

  it('replaces a loss after one interval when the habitat is not empty', () => {
    const s = spawner()
    let respawned = 0
    updateSpawners([s], 1, [{ kind: 'deer', x: 1, z: 1 }], () => { respawned++ })
    expect(respawned).toBe(1)
  })

  it('catch-up on a large dayDelta fills up to the cap, not beyond', () => {
    const s = spawner({ maxPreyCount: 3 })
    let respawned = 0
    // empty: 2 + 1 + 1 = 4 days for 3 animals; 5 days still caps at 3
    updateSpawners([s], 5, [], () => { respawned++ })
    expect(respawned).toBe(3)
    expect(s.daysSinceLastRespawn).toBe(0)
  })

  it('does not bank time while at the live-nearby cap', () => {
    const s = spawner({ maxPreyCount: 1 })
    let respawned = 0
    updateSpawners([s], 10, [{ kind: 'deer', x: 1, z: 1 }], () => { respawned++ })
    expect(respawned).toBe(0)
    expect(s.daysSinceLastRespawn).toBe(0)
  })

  it('never respawns a depleted/disabled/recovering spawner', () => {
    for (const state of ['depleted', 'disabled', 'recovering'] as const) {
      const s = spawner({ state, daysSinceLastRespawn: 100 })
      let respawned = 0
      updateSpawners([s], 10, [], () => { respawned++ })
      expect(respawned).toBe(0)
    }
  })

  it('skips Infinity intervals (wolfDen)', () => {
    const s = spawner({ respawnIntervalDays: Infinity, daysSinceLastRespawn: 100 })
    let respawned = 0
    updateSpawners([s], 10, [], () => { respawned++ })
    expect(respawned).toBe(0)
  })

  it('caps by same-kind animals regardless of prey/predator role', () => {
    const s = spawner({ kind: 'wolf', maxPreyCount: 1 })
    let respawned = 0
    updateSpawners([s], 10, [{ kind: 'wolf', x: 1, z: 1 }], () => { respawned++ })
    expect(respawned).toBe(0)
    expect(s.daysSinceLastRespawn).toBe(0)
  })

  it('ignores other kinds when counting the live cap', () => {
    const s = spawner({ kind: 'wolf', maxPreyCount: 1 })
    let respawned = 0
    updateSpawners([s], 2, [{ kind: 'deer', x: 1, z: 1 }], () => { respawned++ })
    expect(respawned).toBe(1)
  })
})

describe('tickSpawnPointRecovery', () => {
  it('stays disabled before RECOVERY_DAYS elapse, even with enough nearby population', () => {
    const s = spawner({ state: 'disabled', disabledAtDay: 10 })
    tickSpawnPointRecovery(s, 10 + RECOVERY_DAYS - 1, MIN_RECOVERY_POPULATION)
    expect(s.state).toBe('disabled')
  })

  it('moves to recovering once RECOVERY_DAYS elapse but population is short', () => {
    const s = spawner({ state: 'disabled', disabledAtDay: 10 })
    tickSpawnPointRecovery(s, 10 + RECOVERY_DAYS, MIN_RECOVERY_POPULATION - 1)
    expect(s.state).toBe('recovering')
  })

  it('becomes active and resets cycle counters once population is sufficient', () => {
    const s = spawner({ state: 'recovering', disabledAtDay: 10, deathsThisCycle: 2 })
    tickSpawnPointRecovery(s, 10 + RECOVERY_DAYS, MIN_RECOVERY_POPULATION)
    expect(s.state).toBe('active')
    expect(s.deathsThisCycle).toBe(0)
    expect(s.disabledAtDay).toBeNull()
  })

  it('is a no-op for active/depleted spawners', () => {
    const active = spawner({ state: 'active' })
    tickSpawnPointRecovery(active, 1_000_000, 99)
    expect(active.state).toBe('active')

    const depleted = spawner({ state: 'depleted', deathsThisCycle: 2 })
    tickSpawnPointRecovery(depleted, 1_000_000, 99)
    expect(depleted.state).toBe('depleted')
  })
})

describe('snapshotSpawnPointState / restoreSpawnPointState (persistence follow-up)', () => {
  it('snapshots only the minimal lifecycle fields', () => {
    const s = spawner({ state: 'disabled', deathsThisCycle: 2, disabledAtDay: 12.5 })
    expect(snapshotSpawnPointState(s)).toEqual({
      state: 'disabled',
      deathsThisCycle: 2,
      disabledAtDay: 12.5,
    })
  })

  it('is a no-op when nothing was saved for this spawn point', () => {
    const s = spawner({ state: 'active', deathsThisCycle: 0, disabledAtDay: null })
    restoreSpawnPointState(s, undefined)
    expect(s.state).toBe('active')
    expect(s.deathsThisCycle).toBe(0)
    expect(s.disabledAtDay).toBeNull()
  })

  it('round-trips active/depleted/disabled/recovering through snapshot + restore', () => {
    for (const state of ['active', 'depleted', 'disabled', 'recovering'] as const) {
      const original = spawner({ state, deathsThisCycle: 2, disabledAtDay: state === 'active' ? null : 5 })
      const saved = snapshotSpawnPointState(original)
      // Fresh spawner as `createFauna()` would construct it on rebuild — always
      // starts `active`/0/null before the saved snapshot is applied.
      const restored = spawner({ state: 'active', deathsThisCycle: 0, disabledAtDay: null })
      restoreSpawnPointState(restored, saved)
      expect(restored.state).toBe(state)
      expect(restored.deathsThisCycle).toBe(2)
      expect(restored.disabledAtDay).toBe(state === 'active' ? null : 5)
    }
  })
})
