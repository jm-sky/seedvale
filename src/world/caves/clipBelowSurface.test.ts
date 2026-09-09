import { describe, expect, it } from 'vitest'
import { clipTrianglesInFrontOfMouth } from './clipBelowSurface'

describe('clipTrianglesInFrontOfMouth', () => {
  it('drops the outward front-cap triangle and keeps interior geometry', () => {
    const entrance = { x: 0, z: 0, yaw: 0, width: 3 }
    // yaw=0 opening is +Z. Interior triangle at z=-1, front cap at z=+2.
    const positions = [
      -0.2, 1, -1,
      0.2, 1, -1,
      0, 1.4, -1.2,
      -0.2, 1, 2,
      0.2, 1, 2,
      0, 1.4, 2.2,
    ]
    const indices = [0, 1, 2, 3, 4, 5]
    const clipped = clipTrianglesInFrontOfMouth(positions, indices, entrance)
    expect(clipped.indices).toEqual([0, 1, 2])
    expect(clipped.positions.length).toBe(9)
    expect(clipped.positions[2]).toBeLessThan(0)
  })

  it('keeps outward framing off the opening centreline', () => {
    const entrance = { x: 0, z: 0, yaw: 0, width: 3 }
    const positions = [
      2.2, 1, 1,
      2.6, 1, 1,
      2.4, 1.4, 1.2,
    ]
    const indices = [0, 1, 2]
    const clipped = clipTrianglesInFrontOfMouth(positions, indices, entrance)
    expect(clipped.indices).toEqual([0, 1, 2])
  })
})
