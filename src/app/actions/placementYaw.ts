/**
 * Pure 45° placement-rotation helpers (plan `ui-input-012`).
 * Shared by the placement-preview lifecycle and its tests — no Three.js,
 * no mutable preview state. Aim position still follows the camera; object
 * yaw is a separate snapped/stepped value.
 *
 * @domain ui-input
 */

export const PLACEMENT_YAW_STEP = Math.PI / 4

/** Rounds `yaw` to the nearest 45° (`PI/4`) step. */
export function snapPlacementYaw45(yaw: number): number {
  return Math.round(yaw / PLACEMENT_YAW_STEP) * PLACEMENT_YAW_STEP
}

/** Resulting object yaw from a already-snapped start yaw plus 45° steps. */
export function placementObjectYaw(snappedStartYaw: number, rotationSteps: number): number {
  return snappedStartYaw + rotationSteps * PLACEMENT_YAW_STEP
}

/** Aimed ground site: `x/z` follow `aimYaw`, while `yaw` uses `objectYaw`
 *  when the caller has frozen object orientation (rotatable preview). */
export function placementAimSite(
  originX: number,
  originZ: number,
  aimYaw: number,
  reach: number,
  objectYaw?: number,
): { x: number, z: number, yaw: number } {
  return {
    x: originX - Math.sin(aimYaw) * reach,
    z: originZ - Math.cos(aimYaw) * reach,
    yaw: objectYaw ?? aimYaw,
  }
}
