import { describe, expect, it } from 'vitest'
import type { AnimalHabitatContext, TerritorialConfig } from './animalTerritory'
import { territorialDefenseStrength } from './animalTerritory'

const wolfDenConfig: TerritorialConfig = {
  defendedSpawnerTypes: ['wolfDen'],
  radius: 16,
}

const activeWolfDen: AnimalHabitatContext = {
  id: 'wolf-den-1',
  type: 'wolfDen',
  x: 100,
  z: 100,
  state: 'active',
}

describe('territorialDefenseStrength', () => {
  it('is 1 at the habitat center', () => {
    expect(territorialDefenseStrength(wolfDenConfig, activeWolfDen, 100, 100)).toBe(1)
  })

  it('falls off continuously toward the radius', () => {
    const near = territorialDefenseStrength(wolfDenConfig, activeWolfDen, 104, 100)
    const far = territorialDefenseStrength(wolfDenConfig, activeWolfDen, 112, 100)
    expect(near).toBeGreaterThan(far)
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(0)
  })

  it('is exactly 0 at and beyond the radius', () => {
    expect(territorialDefenseStrength(wolfDenConfig, activeWolfDen, 116, 100)).toBe(0)
    expect(territorialDefenseStrength(wolfDenConfig, activeWolfDen, 200, 100)).toBe(0)
  })

  it('is 0 when config is missing (species not territorial)', () => {
    expect(territorialDefenseStrength(undefined, activeWolfDen, 100, 100)).toBe(0)
  })

  it('is 0 when habitat is missing (no resolvable spawn point)', () => {
    expect(territorialDefenseStrength(wolfDenConfig, undefined, 100, 100)).toBe(0)
  })

  it('is 0 for a spawner type this species does not defend', () => {
    const rockDen: AnimalHabitatContext = { ...activeWolfDen, type: 'rockDen' }
    expect(territorialDefenseStrength(wolfDenConfig, rockDen, 100, 100)).toBe(0)
  })

  it('is 0 for an inactive spawner (depleted/disabled/recovering)', () => {
    for (const state of ['depleted', 'disabled', 'recovering'] as const) {
      expect(territorialDefenseStrength(wolfDenConfig, { ...activeWolfDen, state }, 100, 100)).toBe(0)
    }
  })
})
