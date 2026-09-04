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
    expect(
      buildRiverRibbonGeometry([[{ x: 0, z: 0, elevation: 1, accumulation: 20 }]], 0, 0),
    ).toBeNull()
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

  it('marks gentle-slope points as zero waterfall factor', () => {
    const run = [
      { x: 0, z: 0, elevation: 10, accumulation: 20 },
      { x: 8, z: 0, elevation: 9.9, accumulation: 20 },
      { x: 16, z: 0, elevation: 9.8, accumulation: 20 },
    ]
    const geometry = buildRiverRibbonGeometry([run], 0, 0)
    const aFall = geometry!.getAttribute('aFall')
    for (let i = 0; i < aFall.count; i++) expect(aFall.getX(i)).toBe(0)
  })

  it('gives a steep drop between consecutive points a positive, bounded waterfall factor', () => {
    const run = [
      { x: 0, z: 0, elevation: 20, accumulation: 20 },
      { x: 8, z: 0, elevation: 5, accumulation: 20 }, // ~1.9 rise/run — well past the threshold
    ]
    const geometry = buildRiverRibbonGeometry([run], 0, 0)
    const aFall = geometry!.getAttribute('aFall')
    // Each point contributes 2 vertices (ribbon edges). The first point in the
    // run has no predecessor to compare against, so its pair stays 0.
    expect(aFall.getX(0)).toBe(0)
    expect(aFall.getX(1)).toBe(0)
    expect(aFall.getX(2)).toBe(1)
    expect(aFall.getX(3)).toBe(1)
  })

  it('water Y sits below each point\'s own elevation (canonical cross-section)', () => {
    const run = [
      { x: 0, z: 0, elevation: 10, accumulation: 300 },
      { x: 8, z: 0, elevation: 9, accumulation: 300 },
    ]
    const geometry = buildRiverRibbonGeometry([run], 0, 0)
    const position = geometry!.getAttribute('position')
    expect(position.getY(0)).toBeLessThan(10)
    expect(position.getY(2)).toBeLessThan(9)
  })
})
