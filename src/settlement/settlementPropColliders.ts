/**
 * Static settlement prop disks (issue 036) — wood piles, Kupiec wagon/horse,
 * village campfire. Houses and the well stay in `createSettlement.ts`.
 * Pure: landmarks only need `{ x, z }`.
 */

import type { Collider } from '../world/collision'
import { MERCHANT_HORSE_RADIUS, MERCHANT_WAGON_RADIUS } from './merchantWagon'
import {
  VILLAGE_CAMPFIRE_COLLISION_RADIUS,
  WOOD_PILE_COLLISION_RADIUS,
} from './propSpecs'

export type SettlementPropColliderLandmarks = {
  stockpile: { x: number, z: number }
  stockpileSecondary?: { x: number, z: number }
  merchantWagon?: { x: number, z: number }
  merchantHorse?: { x: number, z: number }
  campfire?: { position: { x: number, z: number } }
}

export function settlementPropColliders(
  landmarks: SettlementPropColliderLandmarks,
): Collider[] {
  const colliders: Collider[] = [
    {
      x: landmarks.stockpile.x,
      z: landmarks.stockpile.z,
      radius: WOOD_PILE_COLLISION_RADIUS,
    },
  ]
  if (landmarks.stockpileSecondary) {
    colliders.push({
      x: landmarks.stockpileSecondary.x,
      z: landmarks.stockpileSecondary.z,
      radius: WOOD_PILE_COLLISION_RADIUS,
    })
  }
  if (landmarks.merchantWagon) {
    colliders.push({
      x: landmarks.merchantWagon.x,
      z: landmarks.merchantWagon.z,
      radius: MERCHANT_WAGON_RADIUS,
    })
  }
  if (landmarks.merchantHorse) {
    colliders.push({
      x: landmarks.merchantHorse.x,
      z: landmarks.merchantHorse.z,
      radius: MERCHANT_HORSE_RADIUS,
    })
  }
  if (landmarks.campfire) {
    colliders.push({
      x: landmarks.campfire.position.x,
      z: landmarks.campfire.position.z,
      radius: VILLAGE_CAMPFIRE_COLLISION_RADIUS,
    })
  }
  return colliders
}
