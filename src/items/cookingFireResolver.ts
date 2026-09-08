import type { Settlement } from '../settlement/createSettlement'
import type { PlacedFireEntry, PlacedFires } from '../settlement/PlacedFires'
import type { VillageFire } from '../settlement/VillageFire'
import { INTERACT_RANGE } from '../app/interactables'
import { isPlayerPlacedFire } from '../settlement/PlacedFires'

export type CookingFireRef =
  | { source: 'placed', id: string }
  | { source: 'settlement', settlementId: string }

export type NearbyCookingFire = {
  ref: CookingFireRef
  fire: VillageFire
  lit: boolean
  distanceSq: number
  sortKey: string
}

function distanceSq(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x1 - x2
  const dz = z1 - z2
  return dx * dx + dz * dz
}

function withinRange(x: number, z: number, playerX: number, playerZ: number, range: number): boolean {
  return distanceSq(x, z, playerX, playerZ) <= range * range
}

/**
 * Bounded local resolver for a player-usable cooking fire near the player.
 * Lit fires win over unlit; then nearest; then stable id tie-break.
 *
 * @domain ui-input
 */
export function resolveNearbyCookingFire(
  playerX: number,
  playerZ: number,
  placedFires: PlacedFires,
  settlements: readonly Settlement[],
  range = INTERACT_RANGE,
): NearbyCookingFire | null {
  const candidates: NearbyCookingFire[] = []

  for (const entry of placedFires.list()) {
    if (!isPlayerPlacedFire(entry)) continue
    if (!withinRange(entry.x, entry.z, playerX, playerZ, range)) continue
    candidates.push({
      ref: { source: 'placed', id: entry.id },
      fire: entry.fire,
      lit: entry.fire.isLit(),
      distanceSq: distanceSq(entry.x, entry.z, playerX, playerZ),
      sortKey: entry.id,
    })
  }

  for (const settlement of settlements) {
    const fire = settlement.fire
    if (!fire) continue
    const x = fire.position.x
    const z = fire.position.z
    if (!withinRange(x, z, playerX, playerZ, range)) continue
    candidates.push({
      ref: { source: 'settlement', settlementId: settlement.id },
      fire,
      lit: fire.isLit(),
      distanceSq: distanceSq(x, z, playerX, playerZ),
      sortKey: `settlement:${settlement.id}`,
    })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.lit !== b.lit) return a.lit ? -1 : 1
    if (a.distanceSq !== b.distanceSq) return a.distanceSq - b.distanceSq
    return a.sortKey.localeCompare(b.sortKey)
  })
  return candidates[0]!
}

export function resolveCookingFireByRef(
  ref: CookingFireRef,
  placedFires: PlacedFires,
  settlements: readonly Settlement[],
): VillageFire | null {
  if (ref.source === 'placed') {
    return placedFires.list().find((entry) => entry.id === ref.id)?.fire ?? null
  }
  return settlements.find((settlement) => settlement.id === ref.settlementId)?.fire ?? null
}

export function resolvePlacedFireById(placedFires: PlacedFires, id: string): PlacedFireEntry | null {
  return placedFires.list().find((entry) => entry.id === id) ?? null
}
