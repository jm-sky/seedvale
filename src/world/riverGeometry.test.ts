import { describe, expect, it } from 'vitest'
import type { RiverChain } from '../terrain/riverNetwork'
import { buildRiverRibbonGeometry, clipChainToRect } from './riverGeometry'

function chain(points: { x: number; z: number }[]): RiverChain {
  return {
    points: points.map((p, i) => ({ x: p.x, z: p.z, elevation: 10 - i, accumulation: 20 + i })),
  }
}

describe('clipChainToRect', () => {
  it('returns the whole chain as one run when fully inside the rect', () => {
    const c = chain([
      { x: 0, z: 0 },
      { x: 8, z: 0 },
      { x: 16, z: 0 },
    ])
    const runs = clipChainToRect(c, { minX: -10, maxX: 30, minZ: -10, maxZ: 10 })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(3)
  })

  it('returns nothing when entirely outside the rect', () => {
    const c = chain([
      { x: 100, z: 100 },
      { x: 108, z: 100 },
    ])
    const runs = clipChainToRect(c, { minX: 0, maxX: 64, minZ: 0, maxZ: 64 })
    expect(runs).toHaveLength(0)
  })

  it('two adjacent rects sharing an edge produce identical boundary points', () => {
    const c = chain([
      { x: -20, z: 0 },
      { x: -5, z: 0 },
      { x: 5, z: 0 },
      { x: 20, z: 0 },
    ])
    const left = clipChainToRect(c, { minX: -64, maxX: 0, minZ: -32, maxZ: 32 })
    const right = clipChainToRect(c, { minX: 0, maxX: 64, minZ: -32, maxZ: 32 })
    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
    const leftLast = left[left.length - 1]![left[left.length - 1]!.length - 1]!
    const rightFirst = right[0]![0]!
    expect(leftLast.x).toBeCloseTo(0, 10)
    expect(rightFirst.x).toBeCloseTo(0, 10)
    expect(leftLast.elevation).toBeCloseTo(rightFirst.elevation, 10)
  })
})

describe('buildRiverRibbonGeometry', () => {
  it('returns null when no run has at least 2 points', () => {
    expect(buildRiverRibbonGeometry([], 0, 0)).toBeNull()
    expect(buildRiverRibbonGeometry([[{ x: 0, z: 0, elevation: 1, accumulation: 20 }]], 0, 0)).toBeNull()
  })

  it('builds a quad strip with 2 vertices per point and 2 triangles per segment', () => {
    const run = [
      { x: 0, z: 0, elevation: 1, accumulation: 20 },
      { x: 8, z: 0, elevation: 0.9, accumulation: 25 },
      { x: 16, z: 0, elevation: 0.8, accumulation: 30 },
    ]
    const geometry = buildRiverRibbonGeometry([run], 0, 0)
    expect(geometry).not.toBeNull()
    expect(geometry!.getAttribute('position').count).toBe(run.length * 2)
    expect(geometry!.getIndex()!.count).toBe((run.length - 1) * 6)
  })
})
