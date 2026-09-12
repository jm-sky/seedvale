// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import { ANIMAL_DEFS } from './animalDefs'
import { harvestAnimalIntoInventory } from './animalHarvest'
import { trophyLootKindsForHarvest } from './animalTrophyLoot'

function makeDeps(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgentDeps {
  return {
    def: ANIMAL_DEFS.stag,
    animalId: 'stag-test',
    sampleHeight: () => 0,
    waterLevel: -10,
    sampleLocalWater: () => DRY_WATER_SAMPLE,
    collidersNear: () => [],
    x: 0,
    z: 0,
    ...overrides,
  }
}

function deadStag(animalId: string, juvenile = false): AnimalAgent {
  const agent = new AnimalAgent(makeDeps({
    animalId,
    lifeStage: juvenile ? 'juvenile' : 'adult',
  }))
  agent.takeDamage(999, 'player')
  return agent
}

function findStagId(expectAntler: boolean): string {
  for (let i = 0; i < 500; i++) {
    const id = `stag-roll-${i}`
    const kinds = trophyLootKindsForHarvest(deadStag(id))
    if (expectAntler ? kinds.includes('antler') : kinds.length === 0) return id
  }
  throw new Error('could not find stag id for antler expectation')
}

describe('harvestAnimalIntoInventory antler trophy (plan quests-progression-020)', () => {
  it('never drops antler from juvenile stag', () => {
    const inv = new Inventory({})
    const agent = deadStag('stag-juv', true)
    const result = harvestAnimalIntoInventory(agent, inv, 1)
    expect(result?.lootKinds).toEqual([])
    expect(inv.count('antler')).toBe(0)
  })

  it('uses a deterministic per-corpse antler roll for adult stag', () => {
    const withAntler = deadStag(findStagId(true))
    const withoutAntler = deadStag(findStagId(false))
    const invA = new Inventory({})
    const invB = new Inventory({})
    expect(harvestAnimalIntoInventory(withAntler, invA, 1)?.lootKinds).toEqual(['antler'])
    expect(harvestAnimalIntoInventory(withoutAntler, invB, 1)?.lootKinds).toEqual([])
  })

  it('does not reroll antler on a second harvest call for the same corpse', () => {
    const agent = deadStag(findStagId(true))
    const inv = new Inventory({})
    expect(harvestAnimalIntoInventory(agent, inv, 1)?.lootKinds).toEqual(['antler'])
    expect(harvestAnimalIntoInventory(agent, inv, 1)).toBeNull()
  })
})
