/** Perpendicular-distance-squared from `(px,pz)` to segment `(ax,az)-(bx,bz)`,
 *  plus the clamped [0,1] projection fraction `t` along it. */
export function projectOntoSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { distSq: number; t: number } {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-6) {
    const ddx = px - ax
    const ddz = pz - az
    return { distSq: ddx * ddx + ddz * ddz, t: 0 }
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq))
  const cx = ax + dx * t
  const cz = az + dz * t
  const ddx = px - cx
  const ddz = pz - cz
  return { distSq: ddx * ddx + ddz * ddz, t }
}

/** Perpendicular distance from `(px,pz)` to segment `(ax,az)-(bx,bz)`. */
export function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  return Math.sqrt(projectOntoSegment(px, pz, ax, az, bx, bz).distSq)
}

/**
 * Three.js `rotation.y` so a prop whose long axis is local +X points toward
 * world direction `(dx, dz)`. (`atan2(dz, dx)` alone is wrong: Y-rotation maps
 * +X to `(cos θ, −sin θ)` in XZ.) Lives here rather than in
 * `settlement/roadNetwork.ts` (which re-exports it for its existing consumers)
 * so leaf geometry modules can use the same convention without importing back
 * into the road graph.
 */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dz, dx)
}

/** Unit world direction for a `yawToward` angle — the exact inverse. */
export function directionFromYaw(angle: number): { x: number, z: number } {
  return { x: Math.cos(angle), z: -Math.sin(angle) }
}

/** 2D corridor capsule — planner/palisade/path hit tests share this shape. */
export type CorridorSegment2D = {
  ax: number
  az: number
  bx: number
  bz: number
  halfWidth: number
}

/** True when `(x,z)` lies inside any corridor capsule (+ extra clearance). */
export function pointHitsCorridor(
  x: number,
  z: number,
  corridors: readonly CorridorSegment2D[],
  extraClearance: number,
): boolean {
  for (const seg of corridors) {
    const need = seg.halfWidth + extraClearance
    const { distSq } = projectOntoSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz)
    if (distSq < need * need) return true
  }
  return false
}
