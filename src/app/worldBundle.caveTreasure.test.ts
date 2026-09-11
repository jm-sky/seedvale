/** Plan world-terrain-020 Stage C — pure cave→container composition.
 *  Uses fabricated `CaveContentAnchor`s rather than a full `WorldBundle`
 *  fixture (see `createCaves.contentAnchors.test.ts` for the real
 *  anchor-resolution coverage from Stage B). */

import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../world/createCaves'
import { generateTreasureLoot } from '../items/treasureGameplay'
import { caveTreasureContainerSpecs } from './worldBundle'

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

    const specs = caveTreasureContainerSpecs(anchors, 42)

    expect(specs).toHaveLength(2)
    const side = specs.find((s) => s.id === 'cave:adv1:sideTreasure')
    const final = specs.find((s) => s.id === 'cave:adv1:finalTreasure')
    expect(side).toBeDefined()
    expect(final).toBeDefined()
    expect(side).toMatchObject({ kind: 'chest', x: 1, y: -2, z: 3, yaw: 0.1 })
    expect(final).toMatchObject({ kind: 'chest', x: 4, y: -6, z: 8, yaw: 0.9 })
  })

  it('gives a natural cave (no anchors) zero cave treasure chests', () => {
    expect(caveTreasureContainerSpecs([], 42)).toEqual([])
  })

  it('uses the anchor x/y/z/yaw exactly, with no re-grounding', () => {
    const anchors = [anchor('cave:adv2', 'sideTreasure', { x: 100, y: -33.5, z: -7, yaw: 2.2 })]
    const [spec] = caveTreasureContainerSpecs(anchors, 1)
    expect(spec).toMatchObject({ x: 100, y: -33.5, z: -7, yaw: 2.2 })
  })

  it('derives stable ids from caveId + role, independent of anchor array order', () => {
    const anchors: CaveContentAnchor[] = [
      anchor('cave:adv3', 'finalTreasure'),
      anchor('cave:adv3', 'sideTreasure'),
    ]
    const reversed = [...anchors].reverse()
    const specs = caveTreasureContainerSpecs(anchors, 7).map((s) => s.id).sort()
    const specsReversed = caveTreasureContainerSpecs(reversed, 7).map((s) => s.id).sort()
    expect(specs).toEqual(['cave:adv3:finalTreasure', 'cave:adv3:sideTreasure'])
    expect(specsReversed).toEqual(specs)
  })

  it('assigns the caveSide profile to side treasure and caveFinal to final treasure', () => {
    const anchors = [
      anchor('cave:adv4', 'sideTreasure'),
      anchor('cave:adv4', 'finalTreasure'),
    ]
    const specs = caveTreasureContainerSpecs(anchors, 42)
    const side = specs.find((s) => s.id === 'cave:adv4:sideTreasure')!
    const final = specs.find((s) => s.id === 'cave:adv4:finalTreasure')!
    expect(side.initialCounts).toEqual(generateTreasureLoot(42, side.id, { profile: 'caveSide' }))
    expect(final.initialCounts).toEqual(generateTreasureLoot(42, final.id, { profile: 'caveFinal' }))
    expect(final.initialCounts.coin!).toBeGreaterThan(side.initialCounts.coin!)
  })
})
