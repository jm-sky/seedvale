import type { Inventory } from '../../items/Inventory'
import type { InjurySeverity } from '../../shared/injurySeverity'
import type { ActionResult } from './actionContracts'
import {
  MEDICAL_TREATMENT_DURATION_SEC,
  medicalMaterialLabel,
  medicalTreatmentPromptLabel,
  resolveMedicalTreatmentPlan,
  type TreatableTarget,
} from '../../player/medicalTreatment'
import { awardSkillXp, type PlayerSkills, SKILL_XP_AWARD } from '../../player/PlayerSkills'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/**
 * Player Medicine Busy Action — wound treatment for self / NPC / livestock
 * (plan items-player-046). Query stays pure in `medicalTreatment.ts`;
 * this module owns start → revalidate → apply → consume → XP.
 *
 * @domain items-player
 * @system player-actions
 */

export type MedicalTreatmentActions = {
  /**
   * Starts a timed treatment on an already-resolved treatable target.
   * Query/availability must have succeeded before calling.
   */
  startMedicalTreatment: (target: TreatableTarget) => ActionResult
}

function woundTreatmentXp(severity: InjurySeverity): number {
  if (severity === 'critical') return SKILL_XP_AWARD.woundTreatmentCritical
  if (severity === 'serious') return SKILL_XP_AWARD.woundTreatmentSerious
  if (severity === 'minor') return SKILL_XP_AWARD.woundTreatmentMinor
  return 0
}

function completeMedicalTreatment(
  ctx: PlayerActionContext,
  target: TreatableTarget,
): void {
  const { inventory, player, toast, hud, dayNight } = ctx
  const nowDays = dayNight.elapsedDays
  if (!target.isAlive()) {
    toast.show('Cel jest już niedostępny.', 'error')
    return
  }

  target.resolveInjuryRecovery(nowDays)
  const plan = resolveMedicalTreatmentPlan(target, inventory, player.skills)
  if (!plan || plan.requestedHpRestore <= 0) {
    toast.show('Leczenie nie przyniosło skutku.', 'error')
    return
  }

  const actualRestored = target.applyTreatment(plan.requestedHpRestore, nowDays)
  if (actualRestored <= 0) {
    toast.show('Leczenie nie przyniosło skutku.', 'error')
    return
  }

  // Settlement Known Deeds (plan quests-progression-059) — only a real,
  // settlement-affiliated treatment counts; self-treatment and player-owned
  // livestock have no `settlementId` (see `medicalTreatment.ts`) and never
  // fire this hook.
  if (target.settlementId) {
    ctx.onPlayerMedicalTreatmentCompleted?.({
      targetId: target.id,
      targetKind: target.kind,
      settlementId: target.settlementId,
      actualRestored,
    })
  }

  // World-driven animal-treatment quest report (plan quests-progression-057)
  // — livestock only, unconditional on settlement affiliation (unlike the
  // Known Deeds hook above), since matching is purely by exact `animalId`.
  if (target.kind === 'livestock' && target.animalKind) {
    ctx.onAnimalTreatmentCompleted?.({
      animalId: target.id,
      animalKind: target.animalKind,
      treatmentMode: plan.mode,
      actualHpRestored: actualRestored,
      severityBefore: plan.severity,
    })
  }

  if (plan.mode === 'material' && plan.materialKind) {
    if (!inventory.remove(plan.materialKind, 1)) {
      toast.show(`Opatrzono: ${target.label}.`, 'pickup')
    } else {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      ctx.refreshInventoryScreen()
      toast.show(
        `Opatrzono: ${target.label} (${medicalMaterialLabel(plan.materialKind)}).`,
        'pickup',
      )
    }
  } else {
    toast.show(`Ustabilizowano: ${target.label}.`, 'pickup')
  }

  const xp = woundTreatmentXp(plan.severity)
  if (xp > 0) awardSkillXp(player.skills, 'medicine', xp)
}

export function createMedicalTreatmentActions(ctx: PlayerActionContext): MedicalTreatmentActions {
  const { busy, toast } = ctx

  const startMedicalTreatment = (target: TreatableTarget): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    const plan = resolveMedicalTreatmentPlan(target, ctx.inventory, ctx.player.skills)
    if (!plan) {
      toast.show('Brak obrażeń wymagających leczenia.', 'error')
      return { ok: false, missing: [] }
    }

    const label = plan.mode === 'material'
      ? `Opatrywanie: ${target.label}…`
      : `Stabilizacja: ${target.label}…`

    busy.start(MEDICAL_TREATMENT_DURATION_SEC, label, () => {
      completeMedicalTreatment(ctx, target)
    }, { blurred: true })

    return { ok: true }
  }

  return { startMedicalTreatment }
}

/** Pure query helper exported for targeted-skill / self seams. */
export function queryMedicalTreatmentAvailability(
  target: TreatableTarget,
  inventory: Inventory,
  skills: PlayerSkills,
): { promptLabel: string, planMode: 'material' | 'stabilize' } | null {
  const plan = resolveMedicalTreatmentPlan(target, inventory, skills)
  if (!plan) return null
  return {
    promptLabel: medicalTreatmentPromptLabel(plan, target.label),
    planMode: plan.mode,
  }
}
