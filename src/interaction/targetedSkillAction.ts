import type { CampRepairTargetKind } from '../items/campRepair'
import type { Interactable } from './Interactable'
import { ITEM_DEFS } from '../items/items'
import { SKILL_LABEL, type SkillId } from '../player/PlayerSkills'
import { type PlacedTrapRecord, TRAP_DEFS, type TrapState } from '../world/animalTraps'

/**
 * Live domain lookups for targeted skill query/execute (plan items-player-021).
 * Query must not mutate these owners. `startCampRepair` is execute-only.
 *
 * @domain items-player
 * @system interaction
 */
export type TargetedSkillQueryContext = {
  getTrap: (id: string) => PlacedTrapRecord | null
  campRepairAvailable: (kind: CampRepairTargetKind, id: string) => { mode: 'start' | 'continue' } | null
  startCampRepair: (kind: CampRepairTargetKind, id: string) => void
}

export type TargetedSkillActionId = 'inspect-trap' | 'repair-camp'

export type TargetedSkillAction = {
  id: TargetedSkillActionId
  skill: SkillId
  targetId: string
  targetKind: Interactable['kind']
  promptLabel: string
}

export type TargetedSkillExecuteResult =
  | { ok: true, title: string, line: string }
  | { ok: true, started: true }
  | { ok: false, reason: 'invalid-target' | 'unavailable' }

const TRAP_STATE_LABEL: Record<TrapState, string> = {
  placed: 'rozbrojona',
  active: 'uzbrojona',
  broken: 'zniszczona',
}

function formatDurability(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatTrapInspection(trap: PlacedTrapRecord): { title: string, line: string } {
  const def = TRAP_DEFS[trap.kind]
  const bait = trap.baitKind ? ITEM_DEFS[trap.baitKind].label : 'brak'
  return {
    title: def.label.charAt(0).toUpperCase() + def.label.slice(1),
    line: [
      `Stan: ${TRAP_STATE_LABEL[trap.state]}`,
      `Wytrzymałość: ${formatDurability(trap.durability)}/${def.maxDurability}`,
      `Przynęta: ${bait}`,
    ].join('\n'),
  }
}

function campRepairTarget(target: Interactable): { kind: CampRepairTargetKind, id: string } | null {
  if (target.kind === 'tent' || target.kind === 'bedroll' || target.kind === 'platform') {
    return { kind: target.kind, id: target.id }
  }
  return null
}

function campRepairLabel(kind: CampRepairTargetKind): string {
  if (kind === 'tent') return 'namiot'
  if (kind === 'bedroll') return 'posłanie'
  return 'podest'
}

/**
 * Availability only — never mutates the world. Returns no action when the
 * selected skill has no consumer for this target.
 */
export function queryTargetedSkillAction(
  skill: SkillId,
  target: Interactable,
  context: TargetedSkillQueryContext,
): TargetedSkillAction | null {
  if (skill === 'repair') {
    const camp = campRepairTarget(target)
    if (!camp) return null
    const available = context.campRepairAvailable(camp.kind, camp.id)
    if (!available) return null
    return {
      id: 'repair-camp',
      skill,
      targetId: camp.id,
      targetKind: camp.kind,
      promptLabel: available.mode === 'continue'
        ? `[E] Kontynuuj naprawę: ${campRepairLabel(camp.kind)}`
        : `[E] Napraw: ${campRepairLabel(camp.kind)}`,
    }
  }
  if (skill !== 'traps' || target.kind !== 'trap') return null
  const trap = context.getTrap(target.id)
  if (!trap) return null
  return {
    id: 'inspect-trap',
    skill,
    targetId: trap.id,
    targetKind: 'trap',
    promptLabel: `[E] Sprawdź: ${TRAP_DEFS[trap.kind].label}`,
  }
}

/**
 * Revalidates live domain state at execute time. Inspect reports current trap
 * facts and awards no XP. Camp repair starts/resumes the same domain action
 * the inspection dialog uses.
 */
export function executeTargetedSkillAction(
  skill: SkillId,
  target: Interactable,
  context: TargetedSkillQueryContext,
): TargetedSkillExecuteResult {
  const action = queryTargetedSkillAction(skill, target, context)
  if (!action) return { ok: false, reason: 'unavailable' }
  if (action.id === 'repair-camp') {
    const camp = campRepairTarget(target)
    if (!camp || action.targetId !== camp.id) return { ok: false, reason: 'invalid-target' }
    const available = context.campRepairAvailable(camp.kind, action.targetId)
    if (!available) return { ok: false, reason: 'unavailable' }
    context.startCampRepair(camp.kind, action.targetId)
    return { ok: true, started: true }
  }
  if (action.id === 'inspect-trap') {
    const trap = context.getTrap(action.targetId)
    if (!trap) return { ok: false, reason: 'invalid-target' }
    const view = formatTrapInspection(trap)
    return { ok: true, title: view.title, line: view.line }
  }
  return { ok: false, reason: 'unavailable' }
}

/** HUD prompt while a targeted skill is selected. */
export function targetedSkillPrompt(
  skill: SkillId,
  action: TargetedSkillAction | null,
  hasTarget: boolean,
): string {
  if (action) return action.promptLabel
  if (hasTarget) return `${SKILL_LABEL[skill]} — brak akcji`
  return `${SKILL_LABEL[skill]} — wybierz cel`
}
