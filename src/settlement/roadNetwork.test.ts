import { describe, expect, it } from 'vitest'
import { meanderRoute, yawToward } from './roadNetwork'

describe('yawToward', () => {
  it('maps local +X toward +X world (no Z flip)', () => {
    expect(yawToward(1, 0)).toBeCloseTo(0)
  })

  it('maps local +X toward +Z world', () => {
    // Three.js Y-rot: +X → (cos θ, −sin θ); want (0, 1) ⇒ θ = −π/2
    expect(yawToward(0, 1)).toBeCloseTo(-Math.PI / 2)
  })
})

describe('meanderRoute', () => {
  const sampleHeight = (x: number, z: number) => x * 0.01 + z * 0.02

  const straight = [
    { x: 0, z: 0, h: 0 },
    { x: 10, z: 0, h: 0.1 },
    { x: 20, z: 0, h: 0.2 },
    { x: 30, z: 0, h: 0.3 },
  ]

  it('keeps endpoints fixed and is deterministic for the same seed', () => {
    const a = meanderRoute(straight, sampleHeight, 2, 0.04, 123)
    const b = meanderRoute(straight, sampleHeight, 2, 0.04, 123)
    expect(a).toEqual(b)
    expect(a[0]).toEqual(straight[0])
    expect(a[a.length - 1]).toEqual(straight[straight.length - 1])
  })

  it('offsets interior points for non-zero amplitude', () => {
    const out = meanderRoute(straight, sampleHeight, 3, 0.04, 7)
    const moved = out.slice(1, -1).some((p, i) => p.x !== straight[i + 1]!.x || p.z !== straight[i + 1]!.z)
    expect(moved).toBe(true)
  })

  it('is a no-op when amplitude is 0', () => {
    expect(meanderRoute(straight, sampleHeight, 0, 0.04, 1)).toEqual(straight)
  })
})
