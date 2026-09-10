import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { CorpsePhase } from '../fauna/animalCorpse'

/**
 * Settlement-local animal-corpse sanitation (plan settlements-npcs-029).
 * Fauna remains the owner of corpse lifecycle; this module only derives
 * whether a loaded settlement has a local cleanup problem and which
 * household is responsible. No persisted sanitation state.
 *
 * @domain settlements-npcs
 */

export type HouseholdAnchor = {
  id: string
  x: number
  z: number
}

export type SettlementInfluence = {
  x: number
  z: number
  radius: number
}

/** Plain view of one animal corpse for settlement-bounded candidate collection. */
export type AnimalCorpseView = {
  animalId: string
  kind: string
  x: number
  z: number
  dead: boolean
  buried: boolean
  held: boolean
  meatHarvested: boolean
  readyToRemove: boolean
  phase: CorpsePhase
  foodClaimed: boolean
  cleanupClaimantNpcId: string | null
}

export type AnimalCorpseCleanupCandidate = {
  animalId: string
  kind: string
  x: number
  z: number
  phase: CorpsePhase
  meatHarvested: boolean
  held: boolean
  foodClaimed: boolean
  cleanupClaimantNpcId: string | null
  responsibleHouseholdId: string | null
}

export type AnimalCorpseCleanupHandle = {
  readonly animalId: string
  readonly kind: string
  position: () => { x: number, z: number }
  isDead: () => boolean
  isBuried: () => boolean
  isHeld: () => boolean
  meatHarvested: () => boolean
  corpsePhase: () => CorpsePhase
  foodClaimedBy: () => unknown
  cleanupClaimantNpcId: () => string | null
  readyToRemove: () => boolean
  claimForCleanup: (npcId: string) => boolean
  releaseCleanupClaim: (npcId: string) => void
  holdCorpse: () => void
  releaseCorpseHold: () => void
  bury: () => void
}

export type SettlementCorpseCleanupHooks = {
  /** Settlement-bounded, already influence-filtered candidate list —
   *  refreshed once per settlement tick, never a per-NPC world scan. */
  listCandidates: () => readonly AnimalCorpseCleanupCandidate[]
  resolve: (animalId: string) => AnimalCorpseCleanupHandle | null
}

export type AnimalCorpseCleanupRejection =
  | 'buried'
  | 'cleanup-claimed'
  | 'food-claimed'
  | 'held'
  | 'not-dead'
  | 'other-household'
  | 'outside-influence'
  | 'ready-to-remove'

export function isInsideSettlementInfluence(
  x: number,
  z: number,
  influence: SettlementInfluence,
): boolean {
  const dx = x - influence.x
  const dz = z - influence.z
  return dx * dx + dz * dz <= influence.radius * influence.radius
}

/**
 * Nearest household home/anchor to the corpse, with a deterministic id
 * tie-break. `null` when the corpse is outside settlement influence or no
 * household exists. Re-derived; never stored on Household.
 */
export function resolveResponsibleHousehold(
  corpseX: number,
  corpseZ: number,
  anchors: readonly HouseholdAnchor[],
  influence: SettlementInfluence,
): string | null {
  if (!isInsideSettlementInfluence(corpseX, corpseZ, influence)) return null
  if (anchors.length === 0) return null

  let bestId: string | null = null
  let bestDistSq = Infinity
  for (const anchor of anchors) {
    const dx = corpseX - anchor.x
    const dz = corpseZ - anchor.z
    const distSq = dx * dx + dz * dz
    if (bestId == null || distSq < bestDistSq || (distSq === bestDistSq && anchor.id < bestId)) {
      bestDistSq = distSq
      bestId = anchor.id
    }
  }
  return bestId
}

/**
 * Caller-bounded candidate view: dead, still-present, in-influence corpses
 * with a (possibly null) responsible household. Does not mutate corpse state.
 */
export function collectAnimalCorpseCleanupCandidates(
  views: readonly AnimalCorpseView[],
  anchors: readonly HouseholdAnchor[],
  influence: SettlementInfluence,
): AnimalCorpseCleanupCandidate[] {
  const out: AnimalCorpseCleanupCandidate[] = []
  for (const view of views) {
    if (!view.dead || view.buried || view.readyToRemove) continue
    if (!isInsideSettlementInfluence(view.x, view.z, influence)) continue
    out.push({
      animalId: view.animalId,
      kind: view.kind,
      x: view.x,
      z: view.z,
      phase: view.phase,
      meatHarvested: view.meatHarvested,
      held: view.held,
      foodClaimed: view.foodClaimed,
      cleanupClaimantNpcId: view.cleanupClaimantNpcId,
      responsibleHouseholdId: resolveResponsibleHousehold(view.x, view.z, anchors, influence),
    })
  }
  return out
}

export function animalCorpseViewFromAgent(animal: AnimalAgent): AnimalCorpseView {
  return {
    animalId: animal.animalId,
    kind: animal.def.kind,
    x: animal.mesh.position.x,
    z: animal.mesh.position.z,
    dead: animal.isDead(),
    buried: animal.isCorpseBuried(),
    held: animal.isCorpseHeld(),
    meatHarvested: animal.meatHarvested,
    readyToRemove: animal.readyToRemove(),
    phase: animal.corpsePhase(),
    foodClaimed: animal.foodClaimedBy != null,
    cleanupClaimantNpcId: animal.cleanupClaimantNpcId(),
  }
}

export function animalCorpseCleanupHandle(animal: AnimalAgent): AnimalCorpseCleanupHandle {
  return {
    animalId: animal.animalId,
    kind: animal.def.kind,
    position: () => ({ x: animal.mesh.position.x, z: animal.mesh.position.z }),
    isDead: () => animal.isDead(),
    isBuried: () => animal.isCorpseBuried(),
    isHeld: () => animal.isCorpseHeld(),
    meatHarvested: () => animal.meatHarvested,
    corpsePhase: () => animal.corpsePhase(),
    foodClaimedBy: () => animal.foodClaimedBy,
    cleanupClaimantNpcId: () => animal.cleanupClaimantNpcId(),
    readyToRemove: () => animal.readyToRemove(),
    claimForCleanup: (npcId) => animal.claimForCleanup(npcId),
    releaseCleanupClaim: (npcId) => animal.releaseCleanupClaim(npcId),
    holdCorpse: () => animal.holdCorpse(),
    releaseCorpseHold: () => animal.releaseCorpseHold(),
    bury: () => animal.bury(),
  }
}

export function resolveAnimalCorpseCleanupHandle(
  animalId: string,
  sources: readonly (readonly AnimalAgent[])[],
): AnimalCorpseCleanupHandle | null {
  for (const agents of sources) {
    for (const animal of agents) {
      if (animal.animalId === animalId) return animalCorpseCleanupHandle(animal)
    }
  }
  return null
}
