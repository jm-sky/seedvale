import { describe, expect, it } from 'vitest'
import {
  PLACEMENT_YAW_STEP,
  placementAimSite,
  placementObjectYaw,
  snapPlacementYaw45,
} from './placementYaw'

describe('snapPlacementYaw45', () => {
  it('leaves an already-snapped yaw unchanged', () => {
    expect(snapPlacementYaw45(0)).toBe(0)
    expect(snapPlacementYaw45(Math.PI / 2)).toBeCloseTo(Math.PI / 2)
    expect(snapPlacementYaw45(-Math.PI / 4)).toBeCloseTo(-Math.PI / 4)
  })

  it('rounds to the nearest 45° step', () => {
    expect(snapPlacementYaw45(0.1)).toBeCloseTo(0)
    expect(snapPlacementYaw45(Math.PI / 4 - 0.05)).toBeCloseTo(Math.PI / 4)
    expect(snapPlacementYaw45(Math.PI / 3)).toBeCloseTo(Math.PI / 4)
  })
})

describe('placementObjectYaw', () => {
  it('starts at the snapped base with zero steps', () => {
    const start = snapPlacementYaw45(0.2)
    expect(placementObjectYaw(start, 0)).toBe(start)
  })

  it('steps by exactly 45° and returns to the start after 8 right rotations', () => {
    const start = 0
    expect(placementObjectYaw(start, 1)).toBeCloseTo(PLACEMENT_YAW_STEP)
    expect(placementObjectYaw(start, -1)).toBeCloseTo(-PLACEMENT_YAW_STEP)
    expect(placementObjectYaw(start, 8)).toBeCloseTo(Math.PI * 2)
  })

  it('does not re-snap after the base is frozen — later camera yaw is ignored', () => {
    const start = snapPlacementYaw45(0)
    const rotated = placementObjectYaw(start, 2)
    expect(rotated).toBeCloseTo(Math.PI / 2)
    expect(placementObjectYaw(start, 2)).toBe(rotated)
  })
})

describe('placementAimSite', () => {
  it('uses aim yaw for the reach point and object yaw for orientation', () => {
    const aimYaw = Math.PI / 2
    const objectYaw = 0
    const site = placementAimSite(0, 0, aimYaw, 2, objectYaw)
    expect(site.x).toBeCloseTo(-2)
    expect(site.z).toBeCloseTo(0)
    expect(site.yaw).toBe(objectYaw)
  })

  it('falls back to aim yaw when object yaw is omitted (preview and confirm agree)', () => {
    const yaw = Math.PI / 4
    const preview = placementAimSite(1, 2, yaw, 1.8)
    const confirm = placementAimSite(1, 2, yaw, 1.8)
    expect(preview).toEqual(confirm)
    expect(preview.yaw).toBe(yaw)
  })

  it('keeps the same object yaw when the camera aim changes', () => {
    const objectYaw = snapPlacementYaw45(0)
    const first = placementAimSite(0, 0, 0, 2, objectYaw)
    const afterLook = placementAimSite(0, 0, Math.PI / 2, 2, objectYaw)
    expect(afterLook.yaw).toBe(objectYaw)
    expect(afterLook.x).not.toBeCloseTo(first.x)
  })
})
