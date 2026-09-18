import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { PlacedContainers } from './createPlacedContainers'
import { animalPackGroundContainerId, resolveDroppedPackPosition } from '../fauna/animalPack'

/**
 * @domain world
 * @role Composition-layer seam for the animal-pack death handoff (plan
 *  fauna-039 §19-§21) — `AnimalAgent`/`animalPack.ts` own the pack's
 *  *state*, but only this layer may materialize a `PlacedContainer`, so the
 *  handoff itself lives here, not in `fauna/`. A single idempotent function
 *  covers both call sites: immediately on death (`onAnimalDeath`) and during
 *  detached player-owned livestock restore reconciliation — re-running it on
 *  an animal that already handed its pack off is always a safe no-op.
 */

/** If `animal` is dead and still carries a pack, hands its contents off to a
 *  persistent ground `saddlebags` container at a stable id namespaced by
 *  `settlementId` (the animal's *origin* settlement — `animalId` alone is
 *  not globally unique). Always clears the animal's own pack first
 *  (`takePackForHandoff`); `PlacedContainers.materialize` is itself
 *  idempotent, so calling this again after a successful handoff — or after
 *  restoring a save taken mid-handoff — never duplicates the ground
 *  container or loses cargo. No-op for a live animal or one with no pack. */
export function reconcileAnimalPackHandoff(
  animal: AnimalAgent,
  settlementId: string,
  placedContainers: PlacedContainers,
): void {
  if (!animal.isDead()) return
  const snapshot = animal.takePackForHandoff()
  if (!snapshot) return
  const id = animalPackGroundContainerId(settlementId, animal.animalId)
  const { x, z } = animal.mesh.position
  const yaw = animal.mesh.rotation.y
  const dropAt = resolveDroppedPackPosition(x, z, yaw)
  placedContainers.materialize(id, 'saddlebags', dropAt.x, dropAt.z, yaw, snapshot.contents)
}
