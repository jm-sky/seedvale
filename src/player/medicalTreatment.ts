import type { NpcAgent } from '../ai/NpcAgent'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import { isHouseholdOwned, isPlayerOwned } from '../fauna/animalOwnership'
import type { Interactable } from '../interaction/Interactable'
import { ITEM_CATALOG } from '../items/itemCatalog'
import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import { ITEM_DEFS } from '../items/items'
import {
  type InjurySeverity,
  resolveInjurySeverity,
} from '../shared/injurySeverity'
import {
  type PhysicalInjuryTreatmentMode,
  resolvePhysicalInjuryTreatment,
} from '../shared/physicalInjuryTreatment'
import { scaleMedicinalTreatmentAmount } from './medicinalTreatmentEffectiveness'
import type { PlayerController } from './PlayerController'
import type { PlayerSkills } from './PlayerSkills'

/**
 * Player-facing Medicine wound treatment (plan items-player-046).
 * Query/selection only here — Busy Action mutation lives in
 * `app/actions/medicalTreatmentActions.ts`. Shares the 045 resolver and
 * target-owned apply seams; does not invent parallel heal math.
 *
 * @domain items-player
 * @system player-skills
 */

/** Base bare-hands stabilize potency before Medicine scaling. */
export const BARE_HANDS_STABILIZE_BASE_HP = 10

/** Real-time Busy Action duration for player wound treatment. */
export const MEDICAL_TREATMENT_DURATION_SEC = 2.5

export type TreatableTargetKind = 'livestock' | 'npc' | 'self'

/**
 * Thin adapter over Player / NpcAgent / owned AnimalAgent treatment seams.
 * Query must not mutate health/inventory/XP; `applyTreatment` is complete-only.
 */
export type TreatableTarget = {
  applyTreatment: (requestedHpRestore: number, nowDays: number) => number
  getMaxHp: () => number
  getPhysicalInjury: () => number
  id: string
  isAlive: () => boolean
  kind: TreatableTargetKind
  label: string
  resolveInjuryRecovery: (nowDays: number) => void
}

export type MedicalTreatmentPlan = {
  materialKind: ItemKind | null
  mode: PhysicalInjuryTreatmentMode
  /** Prompt verb without the `[E]` prefix — gaze HUD adds it. */
  promptVerb: 'Opatrz' | 'Ustabilizuj'
  requestedHpRestore: number
  severity: InjurySeverity
}

/**
 * Availability / mode selection for one treatable target.
 * Does not mutate inventory, health, injury, or XP. Material choice is
 * advisory — completion must revalidate (and may call
 * `target.resolveInjuryRecovery` first).
 */
export function resolveMedicalTreatmentPlan(
  target: TreatableTarget,
  inventory: Inventory,
  skills: PlayerSkills,
): MedicalTreatmentPlan | null {
  if (!target.isAlive()) return null
  const physicalInjury = target.getPhysicalInjury()
  const maxHp = target.getMaxHp()
  if (physicalInjury <= 0 || maxHp <= 0) return null

  const severity = resolveInjurySeverity(physicalInjury, maxHp)
  if (severity === 'none') return null

  const materialKind = inventory.findInjuryTreatment(severity)
  if (materialKind) {
    const material = ITEM_CATALOG[materialKind].injuryTreatment
    if (material) {
      const requestedHp = scaleMedicinalTreatmentAmount(material.immediateHp, skills)
      const resolved = resolvePhysicalInjuryTreatment({
        physicalInjury,
        maxHp,
        mode: 'material',
        material,
        requestedHp,
      })
      if (resolved.allowed && resolved.requestedHpRestore > 0) {
        return {
          mode: 'material',
          materialKind,
          requestedHpRestore: resolved.requestedHpRestore,
          severity,
          promptVerb: 'Opatrz',
        }
      }
    }
  }

  const stabilizeRequested = scaleMedicinalTreatmentAmount(BARE_HANDS_STABILIZE_BASE_HP, skills)
  const stabilized = resolvePhysicalInjuryTreatment({
    physicalInjury,
    maxHp,
    mode: 'stabilize',
    requestedHp: stabilizeRequested,
  })
  if (stabilized.allowed && stabilized.requestedHpRestore > 0) {
    return {
      mode: 'stabilize',
      materialKind: null,
      requestedHpRestore: stabilized.requestedHpRestore,
      severity,
      promptVerb: 'Ustabilizuj',
    }
  }

  return null
}

export function medicalTreatmentPromptLabel(plan: MedicalTreatmentPlan, targetLabel: string): string {
  return `[E] ${plan.promptVerb}: ${targetLabel}`
}

export function treatableFromPlayer(player: PlayerController): TreatableTarget {
  return {
    id: 'player',
    kind: 'self',
    label: 'siebie',
    isAlive: () => !player.health.dead,
    getPhysicalInjury: () => player.physicalInjury,
    getMaxHp: () => player.health.maxHp,
    resolveInjuryRecovery: (nowDays) => player.resolveInjuryRecovery(nowDays),
    applyTreatment: (requested, nowDays) => player.applyPhysicalInjuryTreatment(requested, nowDays),
  }
}

export function treatableFromNpc(npc: NpcAgent): TreatableTarget | null {
  if (npc.health.dead) return null
  return {
    id: npc.id,
    kind: 'npc',
    label: npc.displayName,
    isAlive: () => !npc.health.dead,
    getPhysicalInjury: () => npc.physicalInjury,
    getMaxHp: () => npc.health.maxHp,
    resolveInjuryRecovery: (nowDays) => npc.resolveInjuryRecovery(nowDays),
    applyTreatment: (requested, nowDays) => npc.applyPhysicalInjuryTreatment(requested, nowDays),
  }
}

/**
 * Livestock / owned domestic only — wild fauna (`owner === null`) is out of
 * scope for Medicine v1. Uses ownership, not a species allowlist.
 */
export function treatableFromLivestock(animal: AnimalAgent): TreatableTarget | null {
  if (animal.health.dead) return null
  const owner = animal.getOwner()
  if (!isPlayerOwned(owner) && !isHouseholdOwned(owner)) return null
  return {
    id: animal.animalId,
    kind: 'livestock',
    label: animal.getDisplayName(),
    isAlive: () => !animal.health.dead,
    getPhysicalInjury: () => animal.physicalInjury,
    getMaxHp: () => animal.health.maxHp,
    resolveInjuryRecovery: (nowDays) => animal.resolveInjuryRecoveryAt(nowDays),
    applyTreatment: (requested, nowDays) => animal.applyPhysicalInjuryTreatment(requested, nowDays),
  }
}

/**
 * Maps a world Interactable to a treatable target, or null when Medicine
 * cannot act on it (dead, wild fauna, wrong kind).
 */
export function treatableFromInteractable(target: Interactable): TreatableTarget | null {
  if (target.kind === 'npc') return treatableFromNpc(target.npc)
  if (target.kind === 'animal') return treatableFromLivestock(target.animal)
  return null
}

/** Human-readable material label for toast feedback. */
export function medicalMaterialLabel(kind: ItemKind): string {
  return ITEM_DEFS[kind]?.label ?? kind
}
