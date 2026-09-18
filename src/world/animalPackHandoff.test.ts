// @vitest-environment jsdom
import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { AnimalAgent, type AnimalAgentDeps } from '../fauna/AnimalAgent'
import { ANIMAL_DEFS } from '../fauna/animalDefs'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { reconcileAnimalPackHandoff } from './animalPackHandoff'
import { createPlacedContainers } from './createPlacedContainers'

const sampleHeight = () => 0
const sampleLocalWater = () => DRY_WATER_SAMPLE
const collidersNear = () => []

function makeHorse(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgent {
  return new AnimalAgent({
    def: ANIMAL_DEFS.horse,
    animalId: 'handoff-horse',
    sampleHeight,
    waterLevel: -10,
    sampleLocalWater,
    collidersNear,
    x: 5,
    z: 7,
    ...overrides,
  })
}

describe('reconcileAnimalPackHandoff (plan fauna-039 §19-§21)', () => {
  it('does nothing for a live animal, even with an equipped pack', () => {
    const animal = makeHorse()
    animal.transferOwnershipToPlayer()
    animal.equipPack()
    animal.getPackContents()?.add('rope', 1)
    const containers = createPlacedContainers(new Scene(), sampleHeight)
    reconcileAnimalPackHandoff(animal, 'home', containers)
    expect(animal.hasPack()).toBe(true)
    expect(containers.list()).toHaveLength(0)
  })

  it('does nothing for a dead animal with no pack', () => {
    const animal = makeHorse()
    animal.hydrate({ ...animal.snapshot(), health: { current: 0, max: 100, dead: true } })
    const containers = createPlacedContainers(new Scene(), sampleHeight)
    reconcileAnimalPackHandoff(animal, 'home', containers)
    expect(containers.list()).toHaveLength(0)
  })

  it('hands off a dead animal pack to a namespaced, positioned ground container and clears the animal pack', () => {
    const animal = makeHorse()
    animal.transferOwnershipToPlayer()
    animal.equipPack()
    animal.getPackContents()?.add('rope', 5)
    animal.hydrate({ ...animal.snapshot(), health: { current: 0, max: 100, dead: true } })
    // `hydrate()` restored a fresh equipped-and-loaded pack from the
    // snapshot taken above (round-trip through save), same as a real
    // death → save → load sequence.
    expect(animal.hasPack()).toBe(true)

    const containers = createPlacedContainers(new Scene(), sampleHeight)
    reconcileAnimalPackHandoff(animal, 'home', containers)

    expect(animal.hasPack()).toBe(false)
    const id = 'animal-pack:home:handoff-horse'
    const ground = containers.find(id)
    expect(ground).toBeTruthy()
    expect(ground?.kind).toBe('saddlebags')
    expect(ground?.contents.count('rope')).toBe(5)
    // Dropped away from the animal's exact position (plan §22).
    expect(ground?.x !== 5 || ground?.z !== 7).toBe(true)
  })

  it('is idempotent across repeated calls (runtime death + restore reconciliation)', () => {
    const animal = makeHorse()
    animal.transferOwnershipToPlayer()
    animal.equipPack()
    animal.getPackContents()?.add('rope', 5)
    animal.hydrate({ ...animal.snapshot(), health: { current: 0, max: 100, dead: true } })

    const containers = createPlacedContainers(new Scene(), sampleHeight)
    reconcileAnimalPackHandoff(animal, 'home', containers)
    const id = 'animal-pack:home:handoff-horse'
    expect(containers.find(id)?.contents.count('rope')).toBe(5)

    // A second run (e.g. restore reconciliation after the runtime handoff
    // already happened) must not duplicate or touch the ground container.
    reconcileAnimalPackHandoff(animal, 'home', containers)
    expect(containers.list().filter((entry) => entry.id === id)).toHaveLength(1)
    expect(containers.find(id)?.contents.count('rope')).toBe(5)
  })
})
