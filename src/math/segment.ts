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

/**
 * True when finite segments `(ax,az)-(bx,bz)` and `(cx,cz)-(dx,dz)`
 * properly intersect (including endpoint touches).
 */
function segmentsIntersect2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const abx = bx - ax
  const abz = bz - az
  const cross = (px: number, pz: number, qx: number, qz: number): number =>
    px * qz - pz * qx
  const d1 = cross(abx, abz, cx - ax, cz - az)
  const d2 = cross(abx, abz, dx - ax, dz - az)
  const cdx = dx - cx
  const cdz = dz - cz
  const d3 = cross(cdx, cdz, ax - cx, az - cz)
  const d4 = cross(cdx, cdz, bx - cx, bz - cz)
  // Proper crossing: endpoints on opposite sides of each segment.
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  // Endpoint-on-segment touches (collinear or T-junction).
  const onSeg = (
    px: number, pz: number,
    sx: number, sz: number, ex: number, ez: number,
    orient: number,
  ): boolean => {
    if (Math.abs(orient) > 1e-9) return false
    return px >= Math.min(sx, ex) - 1e-9
      && px <= Math.max(sx, ex) + 1e-9
      && pz >= Math.min(sz, ez) - 1e-9
      && pz <= Math.max(sz, ez) + 1e-9
  }
  return onSeg(cx, cz, ax, az, bx, bz, d1)
    || onSeg(dx, dz, ax, az, bx, bz, d2)
    || onSeg(ax, az, cx, cz, dx, dz, d3)
    || onSeg(bx, bz, cx, cz, dx, dz, d4)
}

/**
 * Minimum distance between two finite 2D segments `(ax,az)-(bx,bz)` and
 * `(cx,cz)-(dx,dz)`. Handles intersecting, parallel, and endpoint-nearest
 * cases without sampling.
 */
export function distanceBetweenSegments2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): number {
  const abLenSq = (bx - ax) ** 2 + (bz - az) ** 2
  const cdLenSq = (dx - cx) ** 2 + (dz - cz) ** 2

  // Degenerate cases collapse to point→segment.
  if (abLenSq < 1e-12 && cdLenSq < 1e-12) {
    return Math.hypot(ax - cx, az - cz)
  }
  if (abLenSq < 1e-12) return distanceToSegment(ax, az, cx, cz, dx, dz)
  if (cdLenSq < 1e-12) return distanceToSegment(cx, cz, ax, az, bx, bz)

  // In 2D the closest points are either an intersection (dist 0) or at least
  // one endpoint projected onto the other finite segment.
  if (segmentsIntersect2D(ax, az, bx, bz, cx, cz, dx, dz)) return 0

  return Math.min(
    distanceToSegment(ax, az, cx, cz, dx, dz),
    distanceToSegment(bx, bz, cx, cz, dx, dz),
    distanceToSegment(cx, cz, ax, az, bx, bz),
    distanceToSegment(dx, dz, ax, az, bx, bz),
  )
}

/**
 * True when fence segment `(ax,az)-(bx,bz)` comes within
 * `corridor.halfWidth + extraClearance` of any corridor centerline.
 * `extraClearance` should be the physical fence footprint (e.g. wall
 * half-depth), not a pasture/paddock radius.
 * @domain settlements
 */
export function segmentHitsCorridor(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  corridors: readonly CorridorSegment2D[],
  extraClearance: number,
): boolean {
  for (const seg of corridors) {
    const need = seg.halfWidth + extraClearance
    const dist = distanceBetweenSegments2D(
      ax, az, bx, bz,
      seg.ax, seg.az, seg.bx, seg.bz,
    )
    if (dist <= need) return true
  }
  return false
}
