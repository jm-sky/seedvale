import type { Interactable } from './Interactable'
import { ITEM_DEFS } from '../items/items'
import { SKILL_LABEL, type SkillId } from '../player/PlayerSkills'
import { type PlacedTrapRecord, TRAP_DEFS, type TrapState } from '../world/animalTraps'

/**
 * Live domain lookups for targeted skill query/execute (plan items-player-021).
 * Query must not mutate these owners.
 *
 * @domain items-player
 * @system interaction
 */
export type TargetedSkillQueryContext = {
  getTrap: (id: string) => PlacedTrapRecord | null
}

export type TargetedSkillActionId = 'inspect-trap'

/**
 * Contextual skill action resolved for the current `(skill, Interactable)`.
 * Identity fields are stable ids for revalidation — not a copied snapshot of
 * durability, bait, or other owner state.
 *
 * @domain items-player
 * @system interaction
 */
export type TargetedSkillAction = {
  id: TargetedSkillActionId
  skill: SkillId
  targetId: string
  targetKind: Interactable['kind']
  promptLabel: string
}

export type TargetedSkillExecuteResult =
  | { ok: true, title: string, line: string }
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

/**
 * Availability only — never mutates the world. Returns no action when the
 * selected skill has no consumer for this target.
 */
export function queryTargetedSkillAction(
  skill: SkillId,
  target: Interactable,
  context: TargetedSkillQueryContext,
): TargetedSkillAction | null {
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
 * facts and awards no XP.
 */
export function executeTargetedSkillAction(
  skill: SkillId,
  target: Interactable,
  context: TargetedSkillQueryContext,
): TargetedSkillExecuteResult {
  const action = queryTargetedSkillAction(skill, target, context)
  if (!action) return { ok: false, reason: 'unavailable' }
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
