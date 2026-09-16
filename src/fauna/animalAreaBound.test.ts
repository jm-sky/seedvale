import { describe, expect, it } from 'vitest'
import {
  clampIntoFencedArea,
  fencedAreaWanderBand,
  hasExitedFencedArea,
  isInEntranceCorridor,
  isInsideFencedArea,
} from './animalAreaBound'

const area = {
  x: 0,
  z: 0,
  radius: 10,
  entranceX: 10,
  entranceZ: 0,
  entranceWidth: 2.4,
}

describe('fenced area bound (plan settlements-013)', () => {
  it('treats the footprint interior as inside and the far exterior as outside', () => {
    expect(isInsideFencedArea(0, 0, area)).toBe(true)
    expect(isInsideFencedArea(9, 0, area)).toBe(true)
    expect(isInsideFencedArea(12, 0, area)).toBe(false)
  })

  it('keeps the planned entrance corridor as the only gap', () => {
    expect(isInEntranceCorridor(10, 0, area)).toBe(true)
    expect(isInEntranceCorridor(10, 3, area)).toBe(false)
  })

  it('clamps through-fence points back onto the radius but leaves the entrance free', () => {
    const throughFence = clampIntoFencedArea(0, 14, area)
    expect(Math.hypot(throughFence.x, throughFence.z)).toBeCloseTo(10)
    const atGap = clampIntoFencedArea(10.4, 0, area)
    expect(atGap).toEqual({ x: 10.4, z: 0 })
  })

  it('reports exit only past the footprint and outside the corridor', () => {
    expect(hasExitedFencedArea(0, 0, area)).toBe(false)
    expect(hasExitedFencedArea(10.2, 0, area)).toBe(false)
    expect(hasExitedFencedArea(0, 14, area)).toBe(true)
  })

  it('derives a roam band inside the footprint', () => {
    const [minR, maxR] = fencedAreaWanderBand(12)
    expect(minR).toBeLessThan(maxR)
    expect(maxR).toBeLessThan(12)
  })
})
