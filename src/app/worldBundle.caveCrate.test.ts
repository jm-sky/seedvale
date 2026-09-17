/** Plan world-terrain-037 — pure cave crate → container composition. */

import { describe, expect, it } from 'vitest'
import type { CaveAdventureContentPolicy } from '../world/caves/caveAdventureContentPolicy'
import type { CaveContentAnchor } from '../world/createCaves'
import { generateCaveCrateLoot } from '../world/caves/caveCrateLoot'
import { caveCrateContainerSpecs, caveTreasureContainerSpecs } from './worldBundle'

function policyFor(...caveIds: string[]): CaveAdventureContentPolicy {
  const profiles = new Map(caveIds.map((id) => [id, 'DOUBLE_TREASURE' as const]))
  return {
    profileOf: (caveId) => profiles.get(caveId),
    claimOf: () => undefined,
    unresolved: [],
  }
}

function emptyPolicy(): CaveAdventureContentPolicy {
  return {
    profileOf: () => 'EMPTY',
    claimOf: () => undefined,
    unresolved: [],
  }
}

function questPolicy(): CaveAdventureContentPolicy {
  return {
    profileOf: () => 'QUEST_TREASURE',
    claimOf: () => undefined,
    unresolved: [],
  }
}

function anchor(caveId: string, role: CaveContentAnchor['role'], overrides: Partial<CaveContentAnchor> = {}): CaveContentAnchor {
  return {
    id: `${caveId}:${role}`,
    caveId,
    role,
    x: 10,
    y: -5,
    z: 20,
    yaw: 0.4,
    ...overrides,
  }
}

describe('caveCrateContainerSpecs (plan world-terrain-037)', () => {
  it('maps crate anchors to exact id/x/y/z/yaw and cave spatial context', () => {
    const anchors: CaveContentAnchor[] = [
      anchor('cave:adv1', 'crate', { id: 'cave:adv1:crate:0', x: 1.5, y: -8.25, z: 3.1, yaw: 0.7 }),
      anchor('cave:adv1', 'crate', { id: 'cave:adv1:crate:1', x: 2, y: -8.5, z: 4, yaw: 1.2 }),
      anchor('cave:adv1', 'wagon'),
      anchor('cave:adv1', 'sideTreasure'),
    ]

    const specs = caveCrateContainerSpecs(anchors, 42)

    expect(specs).toHaveLength(2)
    expect(specs[0]).toMatchObject({
      id: 'cave:adv1:crate:0',
      kind: 'chest',
      visual: 'crate',
      x: 1.5,
      y: -8.25,
      z: 3.1,
      yaw: 0.7,
      spatialContext: { kind: 'cave', caveId: 'cave:adv1' },
      initialCounts: generateCaveCrateLoot(42, 'cave:adv1:crate:0'),
    })
    expect(specs[1]).toMatchObject({
      id: 'cave:adv1:crate:1',
      visual: 'crate',
      initialCounts: generateCaveCrateLoot(42, 'cave:adv1:crate:1'),
    })
  })

  it('ignores non-crate anchors', () => {
    const anchors: CaveContentAnchor[] = [
      anchor('cave:adv1', 'wagon'),
      anchor('cave:adv1', 'support', { id: 'cave:adv1:support:0' }),
      anchor('cave:adv1', 'lantern', { id: 'cave:adv1:lantern:0' }),
      anchor('cave:adv1', 'sideTreasure'),
      anchor('cave:adv1', 'finalTreasure'),
    ]
    expect(caveCrateContainerSpecs(anchors, 1)).toEqual([])
  })

  it('materializes crates under EMPTY and QUEST_TREASURE profiles', () => {
    const anchors = [
      anchor('cave:empty', 'crate', { id: 'cave:empty:crate:0' }),
      anchor('cave:quest', 'crate', { id: 'cave:quest:crate:0' }),
    ]
    expect(caveCrateContainerSpecs(anchors, 3)).toHaveLength(2)
    // Treasure helper still respects policy — crates must not ride that filter.
    expect(caveTreasureContainerSpecs(
      [
        anchor('cave:empty', 'sideTreasure'),
        anchor('cave:quest', 'finalTreasure'),
        ...anchors,
      ],
      3,
      emptyPolicy(),
    )).toEqual([])
    expect(caveTreasureContainerSpecs(
      [
        anchor('cave:quest', 'sideTreasure'),
        anchor('cave:quest', 'finalTreasure'),
      ],
      3,
      questPolicy(),
    )).toEqual([])
  })

  it('does not change DOUBLE_TREASURE chest materialization', () => {
    const anchors = [
      anchor('cave:adv1', 'sideTreasure', { x: 1, y: -2, z: 3, yaw: 0.1 }),
      anchor('cave:adv1', 'finalTreasure', { x: 4, y: -6, z: 8, yaw: 0.9 }),
      anchor('cave:adv1', 'crate', { id: 'cave:adv1:crate:0' }),
    ]
    const treasure = caveTreasureContainerSpecs(anchors, 42, policyFor('cave:adv1'))
    expect(treasure).toHaveLength(2)
    expect(treasure.map((s) => s.id).sort()).toEqual([
      'cave:adv1:finalTreasure',
      'cave:adv1:sideTreasure',
    ])
    expect(caveCrateContainerSpecs(anchors, 42)).toHaveLength(1)
  })
})
