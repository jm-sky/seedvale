// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import { ANIMAL_DEFS } from './animalDefs'
import { harvestAnimalIntoInventory } from './animalHarvest'
import { stagAntlerDropChance, trophyLootKindsForHarvest } from './animalTrophyLoot'

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

describe('stagAntlerDropChance (plan fauna-044)', () => {
  it('maps Survival input to the agreed balance curve', () => {
    expect(stagAntlerDropChance()).toBe(0.75)
    expect(stagAntlerDropChance(undefined)).toBe(0.75)
    expect(stagAntlerDropChance(Number.NaN)).toBe(0.75)
    expect(stagAntlerDropChance(0)).toBe(0.75)
    expect(stagAntlerDropChance(0.2)).toBe(0.78)
    expect(stagAntlerDropChance(0.5)).toBe(0.825)
    expect(stagAntlerDropChance(1)).toBe(0.9)
    expect(stagAntlerDropChance(-1)).toBe(0.75)
    expect(stagAntlerDropChance(2)).toBe(0.9)
  })
})

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

  it('uses the 75% actor-neutral baseline when Survival is omitted', () => {
    let baselineDrop = 0
    let baselineNoDrop = 0
    for (let i = 0; i < 200; i++) {
      const id = `stag-baseline-${i}`
      if (trophyLootKindsForHarvest(deadStag(id)).includes('antler')) baselineDrop++
      else baselineNoDrop++
    }
    expect(baselineDrop).toBeGreaterThan(baselineNoDrop)
  })

  it('forwards Survival to trophy resolution without rerolling the same corpse', () => {
    for (let i = 0; i < 500; i++) {
      const id = `stag-skill-${i}`
      const agent = deadStag(id)
      const roll = trophyLootKindsForHarvest(agent, { survivalValue: 0 })
      const mastery = trophyLootKindsForHarvest(agent, { survivalValue: 1 })
      if (roll.length === 0 && mastery.includes('antler')) {
        const inv = new Inventory({})
        expect(harvestAnimalIntoInventory(agent, inv, 1, { survivalValue: 1 })?.lootKinds).toEqual(['antler'])
        expect(harvestAnimalIntoInventory(agent, inv, 1, { survivalValue: 1 })).toBeNull()
        return
      }
    }
    throw new Error('could not find borderline stag id for Survival influence')
  })
})
