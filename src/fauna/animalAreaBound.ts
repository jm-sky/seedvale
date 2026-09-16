/**
 * Data-driven fenced-area roam/need leash (plan settlements-013). Vendor
 * paddock is the first consumer; the seam is not horse-kind branching.
 *
 * @domain fauna
 * @domain settlements
 */

export type FencedAreaBound = {
  x: number
  z: number
  radius: number
  entranceX: number
  entranceZ: number
  entranceWidth: number
}

export function isInsideFencedArea(
  x: number,
  z: number,
  area: FencedAreaBound,
  slack = 0,
): boolean {
  return Math.hypot(x - area.x, z - area.z) <= area.radius + slack
}

export function isInEntranceCorridor(x: number, z: number, area: FencedAreaBound): boolean {
  return Math.hypot(x - area.entranceX, z - area.entranceZ) <= area.entranceWidth
}

/**
 * Pull a point back onto the footprint unless it sits in the planned
 * entrance corridor (the only boundary transition route).
 */
export function clampIntoFencedArea(
  x: number,
  z: number,
  area: FencedAreaBound,
): { x: number, z: number } {
  if (isInEntranceCorridor(x, z, area)) return { x, z }
  const dx = x - area.x
  const dz = z - area.z
  const dist = Math.hypot(dx, dz)
  if (dist <= area.radius || dist < 1e-6) return { x, z }
  const scale = area.radius / dist
  return { x: area.x + dx * scale, z: area.z + dz * scale }
}

/** True once the animal is clearly outside the footprint and not in the gap. */
export function hasExitedFencedArea(x: number, z: number, area: FencedAreaBound): boolean {
  return !isInsideFencedArea(x, z, area, 0.85) && !isInEntranceCorridor(x, z, area)
}

export function fencedAreaWanderBand(radius: number): readonly [number, number] {
  return [Math.min(2.5, radius * 0.18), Math.max(4, radius * 0.72)]
}
