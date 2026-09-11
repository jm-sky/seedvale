/**
 * Bounded owned-sheep lookup and shepherd work selection (plan fauna-004).
 * Pure over a caller-supplied settlement-local sheep list — never scans the
 * world fauna array. Flock size RNG lives here so livestock generation can
 * reuse one salt without perturbing ordinary house rolls.
 *
 * @domain fauna
 */

export const SHEPHERD_FLOCK_MIN = 2
export const SHEPHERD_FLOCK_MAX = 6
/** Isolated from house livestock / staffing / `ensureSheep` streams. */
export const SHEPHERD_FLOCK_SALT = 0x5348464c

/** Arrival/completion radius for shearing a moving sheep. */
export const SHEARING_RANGE = 2.5
/** Owned sheep farther than this from the household home counts as separated. */
export const FLOCK_SEPARATION_RANGE = 12
/** Shepherd notices a predator committed against owned sheep within this radius. */
export const FLOCK_THREAT_RADIUS = 28

export type OwnedSheepView = {
  animalId: string
  x: number
  z: number
  ownerHouseId: string
  isAlive: boolean
  woolReady: boolean
}

export type ShepherdSheepHandle = OwnedSheepView & {
  /** Live revalidation + wool commit. Returns false without mutating state. */
  shear: (nowDays: number) => boolean
}

export type ShepherdFlockHooks = {
  listOwned: (ownerHouseId: string) => readonly OwnedSheepView[]
  resolve: (animalId: string) => ShepherdSheepHandle | null
}

/**
 * Live, household-owned sheep in deterministic `animalId` order.
 *
 * @domain fauna
 */
export function ownedSheepOf(
  sheep: readonly OwnedSheepView[],
  ownerHouseId: string,
): OwnedSheepView[] {
  return sheep
    .filter((entry) => entry.isAlive && entry.ownerHouseId === ownerHouseId)
    .sort((a, b) => (a.animalId < b.animalId ? -1 : a.animalId > b.animalId ? 1 : 0))
}

/** First wool-ready owned sheep, or null. Stable across a work action. */
export function selectReadyOwnedSheep(
  sheep: readonly OwnedSheepView[],
  ownerHouseId: string,
): OwnedSheepView | null {
  return ownedSheepOf(sheep, ownerHouseId).find((entry) => entry.woolReady) ?? null
}

/** Farthest owned sheep outside the local flock area, or null. */
export function selectSeparatedOwnedSheep(
  sheep: readonly OwnedSheepView[],
  ownerHouseId: string,
  homeX: number,
  homeZ: number,
  range = FLOCK_SEPARATION_RANGE,
): OwnedSheepView | null {
  let best: OwnedSheepView | null = null
  let bestD = range
  for (const entry of ownedSheepOf(sheep, ownerHouseId)) {
    const d = Math.hypot(entry.x - homeX, entry.z - homeZ)
    if (d > bestD) {
      bestD = d
      best = entry
    }
  }
  return best
}

/** Centroid of live owned sheep, or null when the household has none. */
export function ownedFlockCentroid(
  sheep: readonly OwnedSheepView[],
  ownerHouseId: string,
): { x: number, z: number } | null {
  const flock = ownedSheepOf(sheep, ownerHouseId)
  if (flock.length === 0) return null
  let x = 0
  let z = 0
  for (const entry of flock) {
    x += entry.x
    z += entry.z
  }
  return { x: x / flock.length, z: z / flock.length }
}

export function shepherdFlockSize(random: () => number): number {
  return SHEPHERD_FLOCK_MIN + Math.floor(random() * (SHEPHERD_FLOCK_MAX - SHEPHERD_FLOCK_MIN + 1))
}

export type FlockThreatCandidate = {
  animalId: string
  kind: string
  x: number
  z: number
  preyAnimalId?: string
  preyOwnerHouseId?: string
}

/**
 * Nearest predator whose committed prey is an owned sheep of `ownerHouseId`.
 * Unrelated hunts (wild deer, another household) are ignored.
 *
 * @domain fauna
 */
export function senseOwnedFlockThreat(
  npcX: number,
  npcZ: number,
  ownerHouseId: string | null | undefined,
  candidates: readonly FlockThreatCandidate[],
  radius = FLOCK_THREAT_RADIUS,
): FlockThreatCandidate | null {
  if (!ownerHouseId) return null
  let best: FlockThreatCandidate | null = null
  let bestD = radius
  for (const candidate of candidates) {
    if (candidate.preyOwnerHouseId !== ownerHouseId) continue
    if (!candidate.preyAnimalId) continue
    const d = Math.hypot(candidate.x - npcX, candidate.z - npcZ)
    if (d < bestD) {
      bestD = d
      best = candidate
    }
  }
  return best
}
