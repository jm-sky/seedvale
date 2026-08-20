/**
 * Minimal ranged-projectile runtime model (plan 162) — lightweight
 * simulation data owned by `app/gameLoop.ts`, not an `Object3D` and not an
 * `Inventory` entity. Deliberately not `ArrowSystem`/`ProjectileManager`:
 * this file only has pure step/collision math; the caller (`gameLoop.ts`)
 * owns the live array, world-side consequences (damage, quests, audio) and
 * cleanup.
 */

export type Projectile = {
  id: string
  /** `livingTargetIdForAnimal`-style attacker key, for deterministic rolls. */
  sourceId: string
  x: number
  z: number
  /** Unit direction — already includes any accuracy-driven deviation. */
  dirX: number
  dirZ: number
  speed: number
  maxDistance: number
  travelled: number
  damage: number
  criticalChance: number
  criticalMultiplier: number
  /** Deterministic-roll key, e.g. the ammo `ItemKind` + shot index. */
  attackKey: string
  attempt: number
}

/** World-unit radius a projectile's swept path must pass within to count as
 *  a hit — a small fixed hitbox stand-in, not per-species collision. */
export const PROJECTILE_HIT_RADIUS = 0.6

/** Advances `p` in place by `dt` seconds, clamped to `maxDistance`. Returns
 *  true once `travelled` has reached `maxDistance` (caller should drop it
 *  after this tick's collision test). */
export function advanceProjectile(p: Projectile, dt: number): boolean {
  const remaining = p.maxDistance - p.travelled
  const step = Math.min(p.speed * dt, Math.max(0, remaining))
  p.x += p.dirX * step
  p.z += p.dirZ * step
  p.travelled += step
  return p.travelled >= p.maxDistance - 1e-6
}

/** Shortest distance from point `(px,pz)` to segment `(ax,az)-(bx,bz)` —
 *  swept collision instead of a per-arrow `Raycaster` allocation. */
export function segmentPointDistance(
  ax: number, az: number, bx: number, bz: number, px: number, pz: number,
): number {
  const abx = bx - ax
  const abz = bz - az
  const abLenSq = abx * abx + abz * abz
  const t = abLenSq > 1e-9
    ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / abLenSq))
    : 0
  const cx = ax + abx * t
  const cz = az + abz * t
  return Math.hypot(px - cx, pz - cz)
}

export type ProjectileCandidate = { id: string, x: number, z: number, alive: boolean }

/** Nearest candidate whose position lies within `radius` of the swept
 *  segment `(prevX,prevZ)-(x,z)` — the single per-tick collision test a
 *  live `Projectile` needs against this frame's animal candidates. */
export function sweptProjectileHit(
  prevX: number, prevZ: number, x: number, z: number,
  candidates: readonly ProjectileCandidate[],
  radius: number = PROJECTILE_HIT_RADIUS,
): string | null {
  let bestId: string | null = null
  let bestDist = radius
  for (const candidate of candidates) {
    if (!candidate.alive) continue
    const dist = segmentPointDistance(prevX, prevZ, x, z, candidate.x, candidate.z)
    if (dist <= bestDist) {
      bestDist = dist
      bestId = candidate.id
    }
  }
  return bestId
}
