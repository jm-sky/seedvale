import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { generateTreasureLoot } from '../items/treasureGameplay'
import { createWorldGeneratedContainers } from './worldGeneratedContainers'

describe('worldGeneratedContainers treasure loot materialization', () => {
  it('uses initialCounts only when no saved record exists', () => {
    const loot = generateTreasureLoot(42, 'treasure:ruins:a')
    const containers = createWorldGeneratedContainers(
      new Scene(),
      () => 0,
      [{ id: 'world-container:treasure:ruins:a', kind: 'chest', x: 1, z: 2, yaw: 0.1, initialCounts: loot }],
    )
    expect(containers.containerCounts('world-container:treasure:ruins:a').coin).toBe(loot.coin)
  })

  it('does not regenerate deterministic loot for an empty materialized chest', () => {
    const loot = generateTreasureLoot(42, 'treasure:ruins:a')
    const containers = createWorldGeneratedContainers(
      new Scene(),
      () => 0,
      [{ id: 'world-container:treasure:ruins:a', kind: 'chest', x: 1, z: 2, yaw: 0.1, initialCounts: loot }],
      [{ id: 'world-container:treasure:ruins:a', x: 1, z: 2, yaw: 0.1, counts: {}, instances: [] }],
    )
    expect(containers.containerCounts('world-container:treasure:ruins:a')).toEqual({})
  })

  it('keeps the caller-supplied stable container id', () => {
    const containers = createWorldGeneratedContainers(
      new Scene(),
      () => 0,
      [{ id: 'world-container:treasure:ruins:stable', kind: 'chest', x: 0, z: 0, yaw: 0, initialCounts: { coin: 50 } }],
    )
    expect(containers.find('world-container:treasure:ruins:stable')?.id).toBe('world-container:treasure:ruins:stable')
  })
})

describe('worldGeneratedContainers explicit-Y placement (plan world-terrain-020 Stage C)', () => {
  it('places a spec with explicit y at exactly the supplied underground Y, without sampling surface height', () => {
    const sampleHeight = () => { throw new Error('surface sampleHeight must not be called for an explicit-Y spec') }
    const containers = createWorldGeneratedContainers(
      new Scene(),
      sampleHeight,
      [{ id: 'cave:x:side-treasure', kind: 'chest', x: 12, y: -7.5, z: 34, yaw: 1.1, initialCounts: { coin: 60 } }],
    )
    const entry = containers.find('cave:x:side-treasure')
    expect(entry?.mesh.position.y).toBe(-7.5)
    expect(entry?.mesh.position.x).toBe(12)
    expect(entry?.mesh.position.z).toBe(34)
  })

  it('keeps legacy surface placement for a spec without y', () => {
    const containers = createWorldGeneratedContainers(
      new Scene(),
      () => 9.25,
      [{ id: 'world-container:treasure:ruins:b', kind: 'chest', x: 3, z: 5, yaw: 0, initialCounts: { coin: 50 } }],
    )
    expect(containers.find('world-container:treasure:ruins:b')?.mesh.position.y).toBe(9.25)
  })

  it('restores contents from save while placement still comes from the explicit-Y spec', () => {
    const containers = createWorldGeneratedContainers(
      new Scene(),
      () => { throw new Error('surface sampleHeight must not be called for an explicit-Y spec') },
      [{ id: 'cave:x:final-treasure', kind: 'chest', x: 1, y: -12, z: 2, yaw: 0, initialCounts: { coin: 999 } }],
      [{ id: 'cave:x:final-treasure', x: 1, z: 2, yaw: 0, counts: {}, instances: [] }],
    )
    const entry = containers.find('cave:x:final-treasure')
    expect(entry?.mesh.position.y).toBe(-12)
    expect(containers.containerCounts('cave:x:final-treasure')).toEqual({})
  })
})
