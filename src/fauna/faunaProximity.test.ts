// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import { ANIMAL_DEFS } from './animalDefs'
import { createFaunaProximityIndex, FAUNA_PROXIMITY_CELL_SIZE } from './faunaProximity'

const sampleHeight = () => 0
const sampleLocalWater = () => DRY_WATER_SAMPLE
const collidersNear = () => []

function makeDeps(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgentDeps {
  return {
    def: ANIMAL_DEFS.deer,
    animalId: 'test-animal',
    sampleHeight,
    waterLevel: -10,
    sampleLocalWater,
    collidersNear,
    x: 0,
    z: 0,
    ...overrides,
  }
}

function collectNear(
  index: ReturnType<typeof createFaunaProximityIndex>,
  x: number,
  z: number,
  radius: number,
): string[] {
  const ids: string[] = []
  index.forEachNear(x, z, radius, (agent) => ids.push(agent.animalId))
  return ids
}

describe('createFaunaProximityIndex (plan fauna-042)', () => {
  it('rebuilds membership from the wild pool and does not invent livestock', () => {
    const wolf = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 0, z: 0 }))
    const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'deer', x: 4, z: 0 }))
    const sheep = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.sheep, animalId: 'sheep', x: 3, z: 0 }))
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, deer])
    expect(index.has(wolf)).toBe(true)
    expect(index.has(deer)).toBe(true)
    expect(index.has(sheep)).toBe(false)
    expect(collectNear(index, 0, 0, 10)).toEqual(['wolf', 'deer'])
  })

  it('still visits an agent on a cell boundary', () => {
    const wolf = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 0.1, z: 0 }))
    const deer = new AnimalAgent(makeDeps({
      def: ANIMAL_DEFS.deer,
      animalId: 'boundary-deer',
      x: FAUNA_PROXIMITY_CELL_SIZE,
      z: 0,
    }))
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, deer])
    expect(collectNear(index, wolf.mesh.position.x, wolf.mesh.position.z, ANIMAL_DEFS.wolf.detectRange))
      .toContain('boundary-deer')
  })

  it('does not visit a distant agent in the common case', () => {
    const wolf = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 0, z: 0 }))
    const far = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'far-deer', x: 400, z: 0 }))
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, far])
    expect(collectNear(index, 0, 0, ANIMAL_DEFS.wolf.detectRange)).toEqual(['wolf'])
    expect(index.has(far)).toBe(true)
  })

  it('keeps dead agents in the view so carcass queries can see them', () => {
    const corpse = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'corpse', x: 2, z: 0 }))
    corpse.takeDamage(9999)
    const index = createFaunaProximityIndex()
    index.rebuild([corpse])
    expect(collectNear(index, 0, 0, 14)).toEqual(['corpse'])
  })

  it('counts only in-radius agents that pass the caller predicate', () => {
    const inside = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'in', x: 4, z: 0 }))
    const outside = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'out', x: 20, z: 0 }))
    const otherKind = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 3, z: 0 }))
    const index = createFaunaProximityIndex()
    index.rebuild([inside, outside, otherKind])
    expect(index.countNear(0, 0, 12, (a) => a.def.kind === 'deer')).toBe(1)
  })
})
