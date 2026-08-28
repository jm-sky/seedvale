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
  it('places a new, immediately-usable, fully-maintained plot', () => {
    const { gardens } = setup()
    const record = gardens.place(1, 2, 0.5, 10)
    expect(record.x).toBe(1)
    expect(record.z).toBe(2)
    expect(record.yaw).toBe(0.5)
    expect(record.care).toBe(100)
    expect(record.lastMaintainedAtDays).toBe(10)
    expect(gardens.nodes()).toEqual([record])
  })

  it('registers a collider for the new plot', () => {
    const { gardens, registered } = setup()
    const record = gardens.place(5, 5, 0, 0)
    expect(registered[`playerGarden:${record.id}`]).toBeDefined()
  })

  it('restores from initial records without re-placing', () => {
    const { gardens: seeded } = (() => {
      const registerColliders = (): void => {}
      const clearColliders = (): void => {}
      const gardens = createPlayerGardens(new Scene(), sampleHeight, registerColliders, clearColliders, [
        { id: 'garden:1', x: 2, z: 3, yaw: 0, care: 80, lastMaintainedAtDays: 1, hydration: 50, lastHydrationUpdateAtDays: 1, droughtStressDays: 0 },
      ], 1)
      return { gardens }
    })()
    expect(seeded.nodes()).toEqual([
      { id: 'garden:1', x: 2, z: 3, yaw: 0, care: 80, lastMaintainedAtDays: 1, hydration: 50, lastHydrationUpdateAtDays: 1, droughtStressDays: 0 },
    ])
  })

  it('drops an already-decayed-past-removal plot on restore instead of respawning it', () => {
    const registerColliders = (): void => {}
    const clearColliders = (): void => {}
    // care 20 at hydration 50 (normal tier, unscaled rate): degrading at
    // 8/day for 5 days = 20 - 40 = clamped to 0 → removable.
    const gardens = createPlayerGardens(new Scene(), sampleHeight, registerColliders, clearColliders, [
      { id: 'garden:decayed', x: 0, z: 0, yaw: 0, care: 20, lastMaintainedAtDays: 0, hydration: 50, lastHydrationUpdateAtDays: 0, droughtStressDays: 0 },
    ], 5)
    expect(gardens.nodes()).toEqual([])
  })

  it('dispose clears every registered collider and node', () => {
    const { gardens, registered } = setup()
    const record = gardens.place(0, 0, 0, 0)
    expect(Object.keys(registered)).toContain(`playerGarden:${record.id}`)
    gardens.dispose()
    expect(Object.keys(registered)).not.toContain(`playerGarden:${record.id}`)
    expect(gardens.nodes()).toEqual([])
  })

  it('careOf resolves lazy degradation and returns null for an unknown id', () => {
    const { gardens } = setup()
    const record = gardens.place(0, 0, 0, 0)
    expect(gardens.careOf(record.id, 0)).toBe(100)
    expect(gardens.careOf(record.id, 2)).toBe(84)
    expect(gardens.careOf('missing', 0)).toBeNull()
  })

  it('applyMaintenance restores ~50 points capped at 100, and revalidates existence', () => {
    const { gardens } = setup()
    const record = gardens.place(0, 0, 0, 0)
    // Degrade 8 days (care 100 -> 36), then tidy at day 8.
    expect(gardens.applyMaintenance(record.id, 8)).toBe(86)
    expect(gardens.careOf(record.id, 8)).toBe(86)
    // Already near-full: capped at 100, not 100+50.
    expect(gardens.applyMaintenance(record.id, 8)).toBe(100)
    expect(gardens.applyMaintenance('missing', 8)).toBeNull()
  })

  it('place() starts at the "normal" weed-pressure hydration tier, not watered', () => {
    const { gardens } = setup()
    const record = gardens.place(0, 0, 0, 0)
    expect(record.hydration).toBe(50)
    expect(record.droughtStressDays).toBe(0)
  })

  it('hydrationOf resolves lazily and returns null for an unknown id', () => {
    const { gardens } = setup()
    const record = gardens.place(0, 0, 0, 0)
    expect(gardens.hydrationOf(record.id, 0)?.hydration).toBe(50)
    expect(gardens.hydrationOf('missing', 0)).toBeNull()
  })

  it('water applies the watering gain, persists it, and revalidates existence', () => {
    const { gardens } = setup()
    const record = gardens.place(0, 0, 0, 0)
    const result = gardens.water(record.id, 0)
    expect(result?.hydration).toBe(90)
    expect(gardens.hydrationOf(record.id, 0)?.hydration).toBe(90)
    expect(gardens.water('missing', 0)).toBeNull()
  })

  it('recordHarvest resets accumulated drought stress and is a no-op for an unknown id', () => {
    const { gardens } = setup()
    const record = gardens.place(0, 0, 0, 0)
    gardens.water(record.id, 0)
    expect(() => gardens.recordHarvest('missing', 0)).not.toThrow()
    gardens.recordHarvest(record.id, 0)
    expect(gardens.hydrationOf(record.id, 0)?.droughtStressDays).toBe(0)
  })

  it('pruneDecayed removes only plots that reached the removal threshold', () => {
    const { gardens, registered } = setup()
    const fresh = gardens.place(0, 0, 0, 0)
    const decaying = gardens.place(10, 10, 0, 0)
    gardens.pruneDecayed(1) // fresh: 100 - 8 = 92, still alive.
    expect(gardens.nodes().map((g) => g.id)).toEqual(expect.arrayContaining([fresh.id, decaying.id]))
    gardens.pruneDecayed(13) // 100 - 13*8 = -4 → clamped removal for both.
    expect(gardens.nodes()).toEqual([])
    expect(registered[`playerGarden:${fresh.id}`]).toBeUndefined()
    expect(registered[`playerGarden:${decaying.id}`]).toBeUndefined()
  })
})
