/** Plan world-terrain-020 Stage C — pure cave→container composition.
 *  Uses fabricated `CaveContentAnchor`s rather than a full `WorldBundle`
 *  fixture (see `createCaves.contentAnchors.test.ts` for the real
 *  anchor-resolution coverage from Stage B). */

import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../world/createCaves'
import { generateTreasureLoot } from '../items/treasureGameplay'
import type { CaveAdventureContentPolicy } from '../world/caves/caveAdventureContentPolicy'
import { caveTreasureContainerSpecs } from './worldBundle'

function policyFor(...caveIds: string[]): CaveAdventureContentPolicy {
  const profiles = new Map(caveIds.map((id) => [id, 'DOUBLE_TREASURE' as const]))
  return {
    profileOf: (caveId) => profiles.get(caveId),
    claimOf: () => undefined,
    unresolved: [],
  }
}

const DOUBLE_TREASURE_ONLY = policyFor('cave:adv1', 'cave:adv2', 'cave:adv3', 'cave:adv4')

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

describe('caveTreasureContainerSpecs (plan world-terrain-020 Stage C)', () => {
  it('materializes exactly one side chest and one final chest for an adventure cave', () => {
    const anchors: CaveContentAnchor[] = [
      anchor('cave:adv1', 'sideTreasure', { x: 1, y: -2, z: 3, yaw: 0.1 }),
      anchor('cave:adv1', 'finalTreasure', { x: 4, y: -6, z: 8, yaw: 0.9 }),
      anchor('cave:adv1', 'wagon'),
      anchor('cave:adv1', 'support', { id: 'cave:adv1:support:0' }),
      anchor('cave:adv1', 'crate', { id: 'cave:adv1:crate:0' }),
      anchor('cave:adv1', 'lantern', { id: 'cave:adv1:lantern:0' }),
    ]

    const specs = caveTreasureContainerSpecs(anchors, 42, DOUBLE_TREASURE_ONLY)

    expect(specs).toHaveLength(2)
    const side = specs.find((s) => s.id === 'cave:adv1:sideTreasure')
    const final = specs.find((s) => s.id === 'cave:adv1:finalTreasure')
    expect(side).toBeDefined()
    expect(final).toBeDefined()
    expect(side).toMatchObject({
      kind: 'chest',
      x: 1,
      y: -2,
      z: 3,
      yaw: 0.1,
      spatialContext: { kind: 'cave', caveId: 'cave:adv1' },
    })
    expect(final).toMatchObject({
      kind: 'chest',
      x: 4,
      y: -6,
      z: 8,
      yaw: 0.9,
      spatialContext: { kind: 'cave', caveId: 'cave:adv1' },
    })
  })

  it('gives a natural cave (no anchors) zero cave treasure chests', () => {
    expect(caveTreasureContainerSpecs([], 42, DOUBLE_TREASURE_ONLY)).toEqual([])
  })

  it('uses the anchor x/y/z/yaw exactly, with no re-grounding', () => {
    const anchors = [anchor('cave:adv2', 'sideTreasure', { x: 100, y: -33.5, z: -7, yaw: 2.2 })]
    const [spec] = caveTreasureContainerSpecs(anchors, 1, policyFor('cave:adv2'))
    expect(spec).toMatchObject({ x: 100, y: -33.5, z: -7, yaw: 2.2 })
  })

  it('derives stable ids from caveId + role, independent of anchor array order', () => {
    const anchors: CaveContentAnchor[] = [
      anchor('cave:adv3', 'finalTreasure'),
      anchor('cave:adv3', 'sideTreasure'),
    ]
    const reversed = [...anchors].reverse()
    const specs = caveTreasureContainerSpecs(anchors, 7, policyFor('cave:adv3')).map((s) => s.id).sort()
    const specsReversed = caveTreasureContainerSpecs(reversed, 7, policyFor('cave:adv3')).map((s) => s.id).sort()
    expect(specs).toEqual(['cave:adv3:finalTreasure', 'cave:adv3:sideTreasure'])
    expect(specsReversed).toEqual(specs)
  })

  it('materializes zero generic chests for EMPTY and QUEST_TREASURE profiles', () => {
    const anchors = [
      anchor('cave:empty', 'sideTreasure'),
      anchor('cave:empty', 'finalTreasure'),
      anchor('cave:quest', 'sideTreasure'),
      anchor('cave:quest', 'finalTreasure'),
    ]
    const policy: CaveAdventureContentPolicy = {
      profileOf: (id) => (id === 'cave:quest' ? 'QUEST_TREASURE' : 'EMPTY'),
      claimOf: () => undefined,
      unresolved: [],
    }
    expect(caveTreasureContainerSpecs(anchors, 42, policy)).toEqual([])
  })

  it('does not materialize dungeon side/final treasure roles as adventure loot', () => {
    const anchors: CaveContentAnchor[] = [
      {
        id: 'cave:dungeon:sideTreasure:dungeon-side-chamber-0',
        caveId: 'cave:dungeon',
        role: 'sideTreasure',
        sourceNodeId: 'dungeon-side-chamber-0',
        x: 1,
        y: -2,
        z: 3,
        yaw: 0,
      },
      {
        id: 'cave:dungeon:finalTreasure:dungeon-final-chamber',
        caveId: 'cave:dungeon',
        role: 'finalTreasure',
        sourceNodeId: 'dungeon-final-chamber',
        x: 4,
        y: -6,
        z: 8,
        yaw: 0,
      },
    ]
    const policy: CaveAdventureContentPolicy = {
      profileOf: () => undefined,
      claimOf: () => undefined,
      unresolved: [],
    }
    expect(caveTreasureContainerSpecs(anchors, 42, policy)).toEqual([])
  })

  it('assigns the caveSide profile to side treasure and caveFinal to final treasure', () => {
    const anchors = [
      anchor('cave:adv4', 'sideTreasure'),
      anchor('cave:adv4', 'finalTreasure'),
    ]
    const specs = caveTreasureContainerSpecs(anchors, 42, DOUBLE_TREASURE_ONLY)
    const side = specs.find((s) => s.id === 'cave:adv4:sideTreasure')!
    const final = specs.find((s) => s.id === 'cave:adv4:finalTreasure')!
    expect(side.initialCounts).toEqual(generateTreasureLoot(42, side.id, { profile: 'caveSide' }))
    expect(final.initialCounts).toEqual(generateTreasureLoot(42, final.id, { profile: 'caveFinal' }))
    expect(final.initialCounts.coin!).toBeGreaterThan(side.initialCounts.coin!)
  })
})
