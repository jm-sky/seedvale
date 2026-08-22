import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createPlayerGardens } from './createPlayerGardens'

const sampleHeight = (): number => 0

function setup() {
  const registered: Record<string, unknown> = {}
  const registerColliders = (ownerKey: string, colliders: readonly unknown[]): void => {
    registered[ownerKey] = colliders
  }
  const clearColliders = (ownerKey: string): void => {
    delete registered[ownerKey]
  }
  const gardens = createPlayerGardens(new Scene(), sampleHeight, registerColliders, clearColliders)
  return { gardens, registered }
}

describe('createPlayerGardens', () => {
  it('places a new, immediately-usable plot', () => {
    const { gardens } = setup()
    const record = gardens.place(1, 2, 0.5)
    expect(record.x).toBe(1)
    expect(record.z).toBe(2)
    expect(record.yaw).toBe(0.5)
    expect(gardens.nodes()).toEqual([record])
  })

  it('registers a collider for the new plot', () => {
    const { gardens, registered } = setup()
    const record = gardens.place(5, 5, 0)
    expect(registered[`playerGarden:${record.id}`]).toBeDefined()
  })

  it('restores from initial records without re-placing', () => {
    const { gardens: seeded } = (() => {
      const registerColliders = (): void => {}
      const clearColliders = (): void => {}
      const gardens = createPlayerGardens(new Scene(), sampleHeight, registerColliders, clearColliders, [
        { id: 'garden:1', x: 2, z: 3, yaw: 0 },
      ])
      return { gardens }
    })()
    expect(seeded.nodes()).toEqual([{ id: 'garden:1', x: 2, z: 3, yaw: 0 }])
  })

  it('dispose clears every registered collider and node', () => {
    const { gardens, registered } = setup()
    const record = gardens.place(0, 0, 0)
    expect(Object.keys(registered)).toContain(`playerGarden:${record.id}`)
    gardens.dispose()
    expect(Object.keys(registered)).not.toContain(`playerGarden:${record.id}`)
    expect(gardens.nodes()).toEqual([])
  })
})
