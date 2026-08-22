import { Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'

/** Vertical aim/body offset above a soft-locked target's ground-level mesh
 *  origin (feet) — chest height, distinct from the taller overhead
 *  name/HP-bar label offset (`NPC_HEIGHT + 0.55` etc.). Presentation only:
 *  does not feed `resolveRangedDirection()`/accuracy. */
export const RANGED_RETICLE_TARGET_HEIGHT = 1.1

/** Viewport-fraction margin the soft-lock reticle clamps to when its
 *  projected point falls outside the visible frame. */
export const RANGED_RETICLE_VIEWPORT_MARGIN = 0.06

export type ReticleScreenPosition = { x: number, y: number }

const scratchView = new Vector3()
const scratchNdc = new Vector3()

/** Projects a world-space point to viewport fractions (0-1, y measured from
 *  the top) through the existing Three.js camera. Returns `null` when the
 *  point is behind the camera — a behind-camera projection isn't a
 *  meaningful screen position to clamp. */
export function projectToViewportFraction(
  worldX: number,
  worldY: number,
  worldZ: number,
  camera: PerspectiveCamera,
): ReticleScreenPosition | null {
  scratchView.set(worldX, worldY, worldZ).applyMatrix4(camera.matrixWorldInverse)
  if (scratchView.z >= 0) return null
  scratchNdc.set(worldX, worldY, worldZ).project(camera)
  return { x: (scratchNdc.x + 1) / 2, y: (1 - scratchNdc.y) / 2 }
}

/** Clamps an on-screen-behind-camera-checked reticle position to a small
 *  viewport margin instead of letting it render outside the visible frame. */
export function clampToViewportMargin(
  pos: ReticleScreenPosition,
  margin: number = RANGED_RETICLE_VIEWPORT_MARGIN,
): ReticleScreenPosition {
  return {
    x: Math.min(1 - margin, Math.max(margin, pos.x)),
    y: Math.min(1 - margin, Math.max(margin, pos.y)),
  }
}
