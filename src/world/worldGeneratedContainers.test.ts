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
