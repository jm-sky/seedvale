import { describe, expect, it } from 'vitest'
import { cellRingSteps, type RingStep, searchNearest, worldRingSteps } from './locationSearch'

describe('searchNearest', () => {
  it('returns the first qualifying candidate in ring order, not the globally nearest one', () => {
    // Ring 1 has a match at distance 10; ring 2 has a closer match at
    // distance 5 — ring order must still win, per the "nearest-by-ring, not
    // globally nearest" contract.
    const steps: RingStep<{ x: number, z: number }>[] = [
      { points: [{ x: 0, z: 0 }] },
      { points: [{ x: 10, z: 0 }, { x: -10, z: 0 }] },
      { points: [{ x: 0, z: 5 }] },
    ]
    const found = searchNearest(steps, (p) => (p.x === -10 || p.x === 0 && p.z === 5 ? 'match' : null))
    expect(found?.point).toEqual({ x: -10, z: 0 })
  })

  it('breaks ties within a ring by fixed index order, not by re-measuring distance', () => {
    const steps: RingStep<{ x: number, z: number }>[] = [
      { points: [{ x: 1, z: 1 }, { x: -1, z: -1 }] },
    ]
    const found = searchNearest(steps, () => 'match')
    expect(found?.point).toEqual({ x: 1, z: 1 })
  })

  it('returns null when no step ever qualifies', () => {
    const steps: RingStep<{ x: number, z: number }>[] = [
      { points: [{ x: 0, z: 0 }] },
      { points: [{ x: 10, z: 0 }] },
    ]
    const found = searchNearest(steps, () => null)
    expect(found).toBeNull()
  })
})

describe('worldRingSteps', () => {
  it('ring 0 is just the origin point', () => {
    const steps = worldRingSteps({ x: 100, z: 200 }, 10, 30)
    expect(steps[0]).toEqual({ points: [{ x: 100, z: 200 }] })
  })

  it('ring N has baseDirections * N points at radius N * stepSize', () => {
    const steps = worldRingSteps({ x: 0, z: 0 }, 10, 30)
    expect(steps).toHaveLength(4) // ring 0 + rings at radius 10, 20, 30
    expect(steps[1]!.points).toHaveLength(8)
    expect(steps[2]!.points).toHaveLength(16)
    expect(steps[3]!.points).toHaveLength(24)
    for (const p of steps[1]!.points) {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(10)
    }
    for (const p of steps[2]!.points) {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(20)
    }
  })

  it('first point of each ring is at angle 0 (directly +x from origin)', () => {
    const steps = worldRingSteps({ x: 5, z: 5 }, 10, 10)
    expect(steps[1]!.points[0]).toEqual({ x: 15, z: 5 })
  })

  it('is deterministic across calls', () => {
    const a = worldRingSteps({ x: 3, z: 4 }, 12, 40)
    const b = worldRingSteps({ x: 3, z: 4 }, 12, 40)
    expect(a).toEqual(b)
  })
})

describe('cellRingSteps', () => {
  type Cell = { gx: number, gz: number }
  const offset = (o: Cell, dx: number, dz: number): Cell => ({ gx: o.gx + dx, gz: o.gz + dz })

  it('ring 0 is just the origin cell', () => {
    const steps = cellRingSteps({ gx: 0, gz: 0 }, 2, offset)
    expect(steps[0]).toEqual({ points: [{ gx: 0, gz: 0 }] })
  })

  it('ring N is exactly the N-th Chebyshev shell, in fixed row-major order', () => {
    const steps = cellRingSteps({ gx: 0, gz: 0 }, 2, offset)
    expect(steps).toHaveLength(3)
    expect(steps[1]!.points).toEqual([
      { gx: -1, gz: -1 }, { gx: 0, gz: -1 }, { gx: 1, gz: -1 },
      { gx: -1, gz: 0 }, { gx: 1, gz: 0 },
      { gx: -1, gz: 1 }, { gx: 0, gz: 1 }, { gx: 1, gz: 1 },
    ])
    expect(steps[2]!.points).toHaveLength(16)
    for (const p of steps[2]!.points) {
      expect(Math.max(Math.abs(p.gx), Math.abs(p.gz))).toBe(2)
    }
  })

  it('is generic over any cell shape via the offset function', () => {
    type Tile = { tx: number, tz: number }
    const tileOffset = (o: Tile, dx: number, dz: number): Tile => ({ tx: o.tx + dx, tz: o.tz + dz })
    const steps = cellRingSteps({ tx: 5, tz: -5 }, 1, tileOffset)
    expect(steps[1]!.points).toContainEqual({ tx: 6, tz: -5 })
  })

  it('is deterministic across calls', () => {
    const a = cellRingSteps({ gx: 2, gz: -1 }, 3, offset)
    const b = cellRingSteps({ gx: 2, gz: -1 }, 3, offset)
    expect(a).toEqual(b)
  })
})
