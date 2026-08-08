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
