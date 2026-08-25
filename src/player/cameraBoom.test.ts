import { describe, expect, it } from 'vitest'
import {
  CAMERA_BOOM_MIN_DISTANCE,
  CAMERA_GROUND_CLEARANCE,
  CAMERA_OCCLUDER_HEIGHT,
  resolveCameraBoom,
} from './cameraBoom'

const flat = (_x: number, _z: number) => 0

describe('resolveCameraBoom', () => {
  it('leaves an unobstructed boom at the desired camera', () => {
    const result = resolveCameraBoom({
      originX: 0,
      originY: 1,
      originZ: 0,
      camX: 0,
      camY: 5,
      camZ: 12,
      sampleHeight: flat,
      colliders: [],
    })
    expect(result.t).toBe(1)
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(5)
    expect(result.z).toBeCloseTo(12)
  })

  it('pulls the camera out of the terrain when looking up (negative pitch)', () => {
    // Mirrors PlayerController.syncCamera: pitch -0.9, distance 12, look-at y=1
    // on flat ground — unconstrained camera.y is ~-8.4 (underground).
    const pitch = -0.9
    const distance = 12
    const originY = 1
    const camY = originY + Math.sin(pitch) * distance
    const camZ = Math.cos(pitch) * distance
    expect(camY).toBeLessThan(-8)

    const result = resolveCameraBoom({
      originX: 0,
      originY,
      originZ: 0,
      camX: 0,
      camY,
      camZ,
      sampleHeight: flat,
      colliders: [],
    })
    expect(result.t).toBeLessThan(1)
    expect(result.y).toBeGreaterThanOrEqual(CAMERA_GROUND_CLEARANCE)
    expect(result.z).toBeGreaterThan(0)
    expect(result.z).toBeLessThan(camZ)
  })

  it('shortens the boom when it tunnels through a house-sized collider', () => {
    const result = resolveCameraBoom({
      originX: 0,
      originY: 1.5,
      originZ: 0,
      camX: 0,
      camY: 3,
      camZ: 12,
      sampleHeight: flat,
      colliders: [{ type: 'circle', x: 0, z: 6, radius: 2 }],
    })
    expect(result.t).toBeLessThan(1)
    expect(result.z).toBeLessThan(6)
    expect(result.z).toBeGreaterThan(0)
  })

  it('ignores tree-sized colliders so a forest does not yank the camera', () => {
    const result = resolveCameraBoom({
      originX: 0,
      originY: 1.5,
      originZ: 0,
      camX: 0,
      camY: 3,
      camZ: 12,
      sampleHeight: flat,
      colliders: [{ type: 'circle', x: 0, z: 6, radius: 0.4 }],
    })
    expect(result.t).toBe(1)
    expect(result.z).toBeCloseTo(12)
  })

  it('allows the boom to pass over a house roof', () => {
    const result = resolveCameraBoom({
      originX: 0,
      originY: CAMERA_OCCLUDER_HEIGHT + 2,
      originZ: 0,
      camX: 0,
      camY: CAMERA_OCCLUDER_HEIGHT + 2,
      camZ: 12,
      sampleHeight: flat,
      colliders: [{ type: 'circle', x: 0, z: 6, radius: 2 }],
    })
    expect(result.t).toBe(1)
    expect(result.z).toBeCloseTo(12)
  })

  it('does not collapse onto a look-at that sits below the water mesh', () => {
    // Swimming: look-at slightly under the flattened water surface (y=0).
    const result = resolveCameraBoom({
      originX: 0,
      originY: -0.3,
      originZ: 0,
      camX: 0,
      camY: 4,
      camZ: 8,
      sampleHeight: flat,
      colliders: [],
    })
    expect(result.t).toBe(1)
    expect(result.y).toBeCloseTo(4)
  })

  it('never sits closer than CAMERA_BOOM_MIN_DISTANCE along the boom', () => {
    const result = resolveCameraBoom({
      originX: 0,
      originY: 1,
      originZ: 0,
      camX: 0,
      camY: 1.2,
      camZ: 0.4,
      sampleHeight: () => 10,
      colliders: [{ type: 'circle', x: 0, z: 0, radius: 8 }],
    })
    const dist = Math.hypot(0, 0.2, 0.4)
    const along = Math.hypot(result.x, result.y - 1, result.z)
    expect(result.t).toBeGreaterThanOrEqual(Math.min(CAMERA_BOOM_MIN_DISTANCE / dist, 0.5) - 1e-6)
    expect(along).toBeGreaterThanOrEqual(CAMERA_BOOM_MIN_DISTANCE - 0.05)
  })
})
