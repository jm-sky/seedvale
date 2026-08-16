import { describe, expect, it } from 'vitest'
import {
  depletionThreshold,
  MIN_RECOVERY_POPULATION,
  type PreySpawner,
  RECOVERY_DAYS,
  shouldDeplete,
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
    respawnTime: 8,
    maxPreyCount: 3,
    timeSinceLastRespawn: 0,
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

describe('updateSpawners', () => {
  it('only respawns active spawners below their live-nearby cap once the timer elapses', () => {
    const s = spawner({ timeSinceLastRespawn: 8 })
    let respawned = 0
    updateSpawners([s], 0, [], () => { respawned++ })
    expect(respawned).toBe(1)
  })

  it('never respawns a depleted/disabled/recovering spawner', () => {
    for (const state of ['depleted', 'disabled', 'recovering'] as const) {
      const s = spawner({ state, timeSinceLastRespawn: 100 })
      let respawned = 0
      updateSpawners([s], 0, [], () => { respawned++ })
      expect(respawned).toBe(0)
    }
  })

  it('still respects the live-nearby cap for active spawners', () => {
    const s = spawner({ timeSinceLastRespawn: 8, maxPreyCount: 1 })
    let respawned = 0
    updateSpawners([s], 0, [{ kind: 'deer', x: 1, z: 1 }], () => { respawned++ })
    expect(respawned).toBe(0)
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
