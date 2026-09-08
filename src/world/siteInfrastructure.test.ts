import { describe, expect, it } from 'vitest'
import type { CompletedTerrainPreparation } from '../terrain/terrainPreparation'
import type { PlayerGardenRecord } from './playerGarden'
import type { PlayerWellRecord } from './playerWell'
import { querySiteInfrastructure } from './siteInfrastructure'

const site = { x: 0, z: 0, radius: 20 }

function well(overrides: Partial<PlayerWellRecord> = {}): PlayerWellRecord {
  return {
    id: 'well:1',
    x: 0,
    z: 0,
    yaw: 0,
    stage: 'well',
    workProgress: 1,
    waterDepth: 5,
    waterKind: 'groundwater',
    ...overrides,
  }
}

function garden(overrides: Partial<PlayerGardenRecord> = {}): PlayerGardenRecord {
  return {
    id: 'garden:1',
    x: 0,
    z: 0,
    yaw: 0,
    care: 80,
    lastMaintainedAtDays: 1,
    hydration: 60,
    lastHydrationUpdateAtDays: 1,
    droughtStressDays: 0,
    ...overrides,
  }
}

function prep(overrides: Partial<CompletedTerrainPreparation> = {}): CompletedTerrainPreparation {
  return { id: 'prep:1', center: { x: 0, z: 0 }, size: 6, ...overrides }
}

describe('querySiteInfrastructure (plan world-019)', () => {
  it('returns completed preparations, usable wells and live gardens inside the site', () => {
    const usableWell = well({ id: 'well:usable', stage: 'roof', workProgress: 1 })
    const result = querySiteInfrastructure(site, {
      completedPreparations: [prep(), prep({ id: 'prep:far', center: { x: 80, z: 80 }, size: 9 })],
      wells: [usableWell, well({ id: 'well:far', x: 80, z: 80, stage: 'roof', workProgress: 1 })],
      gardens: [garden(), garden({ id: 'garden:far', x: 80, z: 80 })],
    })
    expect(result.completedTerrainPreparations.map((p) => p.id)).toEqual(['prep:1'])
    expect(result.wells.map((w) => w.id)).toEqual(['well:usable'])
    expect(result.cultivationAreas.map((g) => g.id)).toEqual(['garden:1'])
  })

  it('excludes unfinished preparations by only reading the completed collection', () => {
    const result = querySiteInfrastructure(site, {
      completedPreparations: [],
      wells: [],
      gardens: [],
    })
    expect(result.completedTerrainPreparations).toEqual([])
  })

  it('does not treat an unfinished well as usable water infrastructure', () => {
    const result = querySiteInfrastructure(site, {
      completedPreparations: [],
      wells: [well({ stage: 'pit', workProgress: 0 }), well({ stage: 'well', workProgress: 0 })],
      gardens: [],
    })
    expect(result.wells).toEqual([])
  })

  it('does not return a garden that is no longer in the live store', () => {
    const result = querySiteInfrastructure(site, {
      completedPreparations: [],
      wells: [],
      gardens: [],
    })
    expect(result.cultivationAreas).toEqual([])
  })

  it('returns authoritative records rather than readiness booleans', () => {
    const completed = prep({ size: 4 })
    const usable = well({ stage: 'well', workProgress: 1 })
    const liveGarden = garden({ id: 'garden:live' })
    const result = querySiteInfrastructure(site, {
      completedPreparations: [completed],
      wells: [usable],
      gardens: [liveGarden],
    })
    expect(result.completedTerrainPreparations[0]).toBe(completed)
    expect(result.wells[0]).toBe(usable)
    expect(result.cultivationAreas[0]).toBe(liveGarden)
    expect(result).not.toHaveProperty('readyForColony')
    expect(result).not.toHaveProperty('hasWell')
  })
})
