import { Group, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { interactionQueueAnchorFromResolved, resolveInteractionPoint } from './resolveInteractionPoint'

describe('resolveInteractionPoint', () => {
  it('falls back when no interaction anchor exists', () => {
    const root = new Group()
    const result = resolveInteractionPoint(
      root,
      [],
      { anchor: { x: 1, y: 0, z: 2 }, lineDir: { x: 0, z: 1 } },
    )
    expect(result.source).toBe('fallback')
    expect(result.anchor.x).toBe(1)
    expect(result.lineDir.z).toBe(1)
  })

  it('uses assetLocal interaction anchor when authored', () => {
    const root = new Group()
    const result = resolveInteractionPoint(
      root,
      [{
        name: 'interaction',
        type: 'interaction',
        space: 'assetLocal',
        position: [0, 0, 3],
      }],
      { anchor: { x: 0, y: 0, z: 0 }, lineDir: { x: 0, z: 1 } },
    )
    expect(result.source).toBe('anchor')
    expect(result.anchor.z).toBeCloseTo(3, 3)
  })

  it('builds queue config from resolved point', () => {
    const point = {
      anchor: new Vector3(1, 0, 2),
      lineDir: { x: 0, z: 1 },
      source: 'anchor' as const,
    }
    const cfg = interactionQueueAnchorFromResolved(point, {
      servingOffset: 1,
      spacing: 1.2,
      maxVisibleSlots: 4,
      servingCapacity: 1,
    })
    expect(cfg.anchor.x).toBe(1)
    expect(cfg.servingOffset).toBe(1)
  })
})
