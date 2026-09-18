// @vitest-environment jsdom
import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { EMPTY_INVENTORY_CONTENTS } from '../items/Inventory'
import { createPlacedContainers } from './createPlacedContainers'

const sampleHeight = () => 0

describe('createPlacedContainers materialize/remove (plan fauna-039)', () => {
  it('materializes a container at a caller-supplied stable id, idempotently', () => {
    const containers = createPlacedContainers(new Scene(), sampleHeight)
    const id = 'animal-pack:home:horse-house0-0'
    const created = containers.materialize(id, 'saddlebags', 3, 4, 0.5, { counts: { rope: 2 }, instances: [] })
    expect(created).toBe(true)
    expect(containers.find(id)?.contents.count('rope')).toBe(2)

    // Idempotent: an existing entry is never replaced/duplicated.
    const createdAgain = containers.materialize(id, 'saddlebags', 3, 4, 0.5, { counts: { rope: 99 }, instances: [] })
    expect(createdAgain).toBe(false)
    expect(containers.find(id)?.contents.count('rope')).toBe(2)
    expect(containers.list().filter((entry) => entry.id === id)).toHaveLength(1)
  })

  it('remove() deletes the entry without ever entering carried state', () => {
    const containers = createPlacedContainers(new Scene(), sampleHeight)
    const id = 'animal-pack:home:horse-house0-1'
    containers.materialize(id, 'saddlebags', 0, 0, 0, EMPTY_INVENTORY_CONTENTS)
    expect(containers.remove(id)).toBe(true)
    expect(containers.find(id)).toBeUndefined()
    expect(containers.hasCarried()).toBe(false)
  })

  it('remove() returns false for an unknown id', () => {
    const containers = createPlacedContainers(new Scene(), sampleHeight)
    expect(containers.remove('nope')).toBe(false)
  })

  it('pickUp() (carry-container semantics) is refused for a saddlebags entry', () => {
    const containers = createPlacedContainers(new Scene(), sampleHeight)
    const id = 'animal-pack:home:horse-house0-2'
    containers.materialize(id, 'saddlebags', 0, 0, 0, EMPTY_INVENTORY_CONTENTS)
    expect(containers.pickUp(id)).toBe(false)
    expect(containers.hasCarried()).toBe(false)
    expect(containers.find(id)).toBeTruthy()
  })

  it('pickUp() still works normally for a chest (unchanged behaviour)', () => {
    const containers = createPlacedContainers(new Scene(), sampleHeight)
    const record = containers.place('chest', 0, 0, 0)
    expect(containers.pickUp(record.id)).toBe(true)
    expect(containers.hasCarried()).toBe(true)
    expect(containers.carriedKind()).toBe('chest')
  })
})
