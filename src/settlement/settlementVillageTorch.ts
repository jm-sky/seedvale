import type * as THREE from 'three'
import type { VillageTorch } from './houseLighting'

/**
 * Canonical settlement-owned village torch with a stable id (plan
 * quests-progression-021) — identity is `settlementId` + semantic slot, never
 * mesh uuid or array index.
 *
 * @domain settlements
 * @system settlement-lighting
 */
export type SettlementVillageTorch = {
  id: string
  position: THREE.Vector3
  torch: VillageTorch
}

/** Builds a stable torch id for quest/persistence references. */
export function settlementVillageTorchId(settlementId: string, slot: string): string {
  return `${settlementId}:village-torch:${slot}`
}
