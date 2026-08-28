/**
 * Static settlement prop disks (issue 036) — wood piles, Kupiec wagon,
 * village campfire. Houses and the well stay in `createSettlement.ts`. The
 * merchant's horse is no longer a static prop here (plan fauna-003
 * follow-up) — it's a live `AnimalAgent` spawned via `spawnLivestock()`,
 * same as any other livestock, so it needs no synthetic collider (nothing
 * does for ordinary wandering fauna either). Pure: landmarks only need
 * `{ x, z }`.
 */

import type { Collider } from '../world/collision'
import { MERCHANT_WAGON_RADIUS } from './merchantWagon'
import {
  VILLAGE_CAMPFIRE_COLLISION_RADIUS,
  WOOD_PILE_COLLISION_RADIUS,
} from './propSpecs'

export type SettlementPropColliderLandmarks = {
  stockpile: { x: number, z: number }
  stockpileSecondary?: { x: number, z: number }
  merchantWagon?: { x: number, z: number }
  campfire?: { position: { x: number, z: number } }
}

export function settlementPropColliders(
  landmarks: SettlementPropColliderLandmarks,
): Collider[] {
  const colliders: Collider[] = [
    {
      type: 'circle',
      x: landmarks.stockpile.x,
      z: landmarks.stockpile.z,
      radius: WOOD_PILE_COLLISION_RADIUS,
    },
  ]
  if (landmarks.stockpileSecondary) {
    colliders.push({
      type: 'circle',
      x: landmarks.stockpileSecondary.x,
      z: landmarks.stockpileSecondary.z,
      radius: WOOD_PILE_COLLISION_RADIUS,
    })
  }
  if (landmarks.merchantWagon) {
    colliders.push({
      type: 'circle',
      x: landmarks.merchantWagon.x,
      z: landmarks.merchantWagon.z,
      radius: MERCHANT_WAGON_RADIUS,
    })
  }
  if (landmarks.campfire) {
    colliders.push({
      type: 'circle',
      x: landmarks.campfire.position.x,
      z: landmarks.campfire.position.z,
      radius: VILLAGE_CAMPFIRE_COLLISION_RADIUS,
    })
  }
  return colliders
}
