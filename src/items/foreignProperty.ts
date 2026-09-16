import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { Interactable } from '../interaction/Interactable'
import type { InteractionActionView, InteractionConsequenceTone } from '../interaction/interactionView'
import type { RelationLevel } from '../quests/quests'
import type { NpcId } from '../settlement/npcState'
import { resolveMerchantHorseAnimal } from '../settlement/horseAcquisition'

/** Gaze/HUD copy for a foreign merchant-horse mount action (plan items-player-042). */
export const FOREIGN_PROPERTY_MOUNT_REASON = 'To cudzy koń'

/**
 * Distance from this ride's mount-start before unauthorized use is evaluated.
 * SM village footprint is 40 m and the wagon+horse hitch is ~4.4 m from the
 * stall crate; 16 m is leaving the stall/market without requiring a village exit.
 */
export const FOREIGN_MERCHANT_HORSE_REMOVAL_DISTANCE = 16

/** Player↔merchant relation delta for unauthorized horse use — same order as
 *  existing authored social penalties (`-1`/`-2`). */
export const UNAUTHORIZED_PROPERTY_RELATION_DELTA = -2

export const UNAUTHORIZED_PROPERTY_MARKUP_MILD = 0.10
export const UNAUTHORIZED_PROPERTY_MARKUP_NEUTRAL = 0.15
export const UNAUTHORIZED_PROPERTY_MARKUP_POOR = 0.25

export type ActionConsequencePreview = {
  tone: InteractionConsequenceTone
  reasonLabel: string
}

/** Identified merchant-horse foreign-use context. Origin is filled at mount
 *  start — not the hitch spawn — so a wandered horse does not instantly trip
 *  the removal threshold. */
export type MerchantHorseForeignUse = {
  animalId: string
  merchantNpcId: NpcId
}

export type MountedPropertyIncident = {
  animalId: string
  merchantNpcId: NpcId
  originX: number
  originZ: number
  /** Threshold crossing has been processed for this ride (penalty or not). */
  resolved: boolean
}

export type ForeignPropertyMountAction = 'mount'

type SettlementMerchantLook = {
  id: string
  npcs: readonly { id: string, role: string, health: { dead: boolean } }[]
}

/**
 * @domain items-player
 * @role Picks the settlement trader used for merchant-horse social/trade
 *  consequences; does not invent a second owner id on the animal.
 */
export function settlementMerchantNpc(settlement: SettlementMerchantLook): { id: NpcId } | null {
  const traders = settlement.npcs.filter((npc) => npc.role === 'trader' && !npc.health.dead)
  if (traders.length === 0) return null
  const ordered = [...traders].sort((a, b) => a.id.localeCompare(b.id))
  return { id: ordered[0]!.id }
}

/**
 * @domain items-player
 * @role Derives whether `animal` is the live unresolved merchant horse via
 *  `resolveMerchantHorseAnimal`; does not parse `merchant-horse-*` ids.
 */
export function resolveMerchantHorseForeignUse(
  animal: AnimalAgent,
  settlements: readonly SettlementMerchantLook[],
  resolveAnimal: (animalId: string) => AnimalAgent | null,
): MerchantHorseForeignUse | null {
  if (animal.isPlayerOwned()) return null
  for (const settlement of settlements) {
    const horse = resolveMerchantHorseAnimal(resolveAnimal, settlement.id)
    if (horse !== animal) continue
    const trader = settlementMerchantNpc(settlement)
    if (!trader) return null
    return { animalId: animal.animalId, merchantNpcId: trader.id }
  }
  return null
}

/** `friendly` / `trusted` may borrow without a social/trade penalty. */
export function isForeignPropertyBorrowingPermitted(level: RelationLevel): boolean {
  return level === 'friendly' || level === 'trusted'
}

/**
 * Markup band from live `RelationLevel` at incident time. Borrowing-permitted
 * tiers return 0 — callers must still skip the whole consequence.
 */
export function unauthorizedPropertyMarkup(relation: number, level: RelationLevel): number {
  if (isForeignPropertyBorrowingPermitted(level)) return 0
  if (level === 'acquainted') return UNAUTHORIZED_PROPERTY_MARKUP_MILD
  if (relation < 0) return UNAUTHORIZED_PROPERTY_MARKUP_POOR
  return UNAUTHORIZED_PROPERTY_MARKUP_NEUTRAL
}

function isMountActionLabel(label: string): boolean {
  return label.includes('Dosiądź')
}

/**
 * @domain items-player
 * @role Derives action-level foreign-property consequence preview; does not
 *  own entity ownership.
 */
export function previewMerchantHorseMount(
  animal: AnimalAgent,
  resolveContext: (animal: AnimalAgent) => MerchantHorseForeignUse | null,
): ActionConsequencePreview | null {
  if (animal.isPlayerOwned()) return null
  if (!resolveContext(animal)) return null
  return { tone: 'negative', reasonLabel: FOREIGN_PROPERTY_MOUNT_REASON }
}

export function previewForeignPropertyAction(
  target: Interactable,
  action: Pick<InteractionActionView, 'slot' | 'label'>,
  resolveContext: (animal: AnimalAgent) => MerchantHorseForeignUse | null,
): ActionConsequencePreview | null {
  if (target.kind !== 'animal' || action.slot !== 'primary') return null
  if (!isMountActionLabel(action.label)) return null
  return previewMerchantHorseMount(target.animal, resolveContext)
}

export function beginMountedForeignUse(
  animal: AnimalAgent,
  resolveContext: (animal: AnimalAgent) => MerchantHorseForeignUse | null,
): MountedPropertyIncident | null {
  const ctx = resolveContext(animal)
  if (!ctx || animal.isPlayerOwned()) return null
  return {
    animalId: ctx.animalId,
    merchantNpcId: ctx.merchantNpcId,
    originX: animal.mesh.position.x,
    originZ: animal.mesh.position.z,
    resolved: false,
  }
}

export type MountedForeignUseEvaluation = {
  merchantNpcId: NpcId
  markup: number
} | null

/**
 * Evaluates the ride once the mount has left the mount-start radius.
 * Returns a penalty payload only for unauthorized use; friendly/trusted
 * borrowing resolves the incident without a payload.
 */
export function evaluateMountedForeignUse(
  incident: MountedPropertyIncident,
  animal: { animalId: string, x: number, z: number, isPlayerOwned: boolean },
  relation: { value: number, level: RelationLevel },
  distanceThreshold = FOREIGN_MERCHANT_HORSE_REMOVAL_DISTANCE,
): MountedForeignUseEvaluation {
  if (incident.resolved) return null
  if (animal.animalId !== incident.animalId) return null
  if (animal.isPlayerOwned) {
    incident.resolved = true
    return null
  }
  const dist = Math.hypot(animal.x - incident.originX, animal.z - incident.originZ)
  if (dist < distanceThreshold) return null
  incident.resolved = true
  if (isForeignPropertyBorrowingPermitted(relation.level)) return null
  return {
    merchantNpcId: incident.merchantNpcId,
    markup: unauthorizedPropertyMarkup(relation.value, relation.level),
  }
}

export type ForeignPropertyUse = {
  previewAnimalAction: (animal: AnimalAgent, action: ForeignPropertyMountAction) => ActionConsequencePreview | null
  previewInteractableAction: (
    target: Interactable,
    action: Pick<InteractionActionView, 'slot' | 'label'>,
  ) => ActionConsequencePreview | null
  beginMountedUse: (animal: AnimalAgent) => MountedPropertyIncident | null
  updateMountedUse: (incident: MountedPropertyIncident, animal: AnimalAgent) => void
  endMountedUse: (incident: MountedPropertyIncident) => void
}

export type ForeignPropertyUseDeps = {
  resolveContext: (animal: AnimalAgent) => MerchantHorseForeignUse | null
  getRelation: (npcId: NpcId) => number
  getRelationLevel: (npcId: NpcId) => RelationLevel
  adjustRelation: (npcId: NpcId, amount: number) => void
  applyGrievance: (merchantKey: string, markup: number, elapsedDays: number) => void
  nowDays: () => number
  playNegativeConsequence: () => void
}

/**
 * @domain items-player
 * @role Shared foreign-property preview/incident evaluator for merchant-horse
 *  use. Mount code reports threshold crossings; this owns social/trade commit.
 */
export function createForeignPropertyUse(deps: ForeignPropertyUseDeps): ForeignPropertyUse {
  const previewAnimalAction = (
    animal: AnimalAgent,
    action: ForeignPropertyMountAction,
  ): ActionConsequencePreview | null => {
    if (action !== 'mount') return null
    return previewMerchantHorseMount(animal, deps.resolveContext)
  }

  const commit = (evaluation: NonNullable<MountedForeignUseEvaluation>): void => {
    deps.adjustRelation(evaluation.merchantNpcId, UNAUTHORIZED_PROPERTY_RELATION_DELTA)
    deps.applyGrievance(evaluation.merchantNpcId, evaluation.markup, deps.nowDays())
    deps.playNegativeConsequence()
  }

  return {
    previewAnimalAction,
    previewInteractableAction: (target, action) => previewForeignPropertyAction(target, action, deps.resolveContext),
    beginMountedUse: (animal) => beginMountedForeignUse(animal, deps.resolveContext),
    updateMountedUse: (incident, animal) => {
      const evaluation = evaluateMountedForeignUse(
        incident,
        {
          animalId: animal.animalId,
          x: animal.mesh.position.x,
          z: animal.mesh.position.z,
          isPlayerOwned: animal.isPlayerOwned(),
        },
        {
          value: deps.getRelation(incident.merchantNpcId),
          level: deps.getRelationLevel(incident.merchantNpcId),
        },
      )
      if (evaluation) commit(evaluation)
    },
    endMountedUse: () => {},
  }
}
