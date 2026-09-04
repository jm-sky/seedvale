import type { PlayerSkills, SkillId } from '../player/PlayerSkills'
import type { ItemKind } from './items'
import { raiseSkillToValue } from '../player/PlayerSkills'
import { ITEM_CATALOG } from './itemCatalog'

/**
 * @domain items-player
 * @role Interprets the "Czytaj" inventory action against `ITEM_CATALOG[kind].book`
 *   metadata and `PlayerSkills` — the only place that decides what reading a
 *   book actually does. Owns no state of its own: the book stays in
 *   inventory either way, and the only lasting effect is the XP change
 *   `raiseSkillToValue` makes.
 */

export type BookReadOutcome =
  /** `kind` has no `book` metadata — not a book, caller should no-op. */
  | 'not_a_book'
  /** Current skill is below `requiredSkillValue` — too advanced to learn from yet. */
  | 'too_low'
  /** Current skill already meets/exceeds `targetSkillValue` — nothing new. */
  | 'known'
  /** Requirement met and skill was actually raised toward `targetSkillValue`. */
  | 'learned'

export type BookReadResult = {
  outcome: BookReadOutcome
  skill?: SkillId
  previousValue?: number
  value?: number
  requiredValue?: number
  targetValue?: number
}

/** Reads `kind` against the player's current skills — pure aside from the
 *  single `raiseSkillToValue` mutation on a `learned` outcome. Never mutates
 *  anything on `too_low`/`known`/`not_a_book`. */
export function readBook(skills: PlayerSkills, kind: ItemKind): BookReadResult {
  const book = ITEM_CATALOG[kind].book
  if (!book) return { outcome: 'not_a_book' }
  const current = skills[book.skill].value
  if (current < book.requiredSkillValue) {
    return {
      outcome: 'too_low',
      skill: book.skill,
      previousValue: current,
      requiredValue: book.requiredSkillValue,
    }
  }
  if (current >= book.targetSkillValue) {
    return {
      outcome: 'known',
      skill: book.skill,
      previousValue: current,
      value: current,
      targetValue: book.targetSkillValue,
    }
  }
  const result = raiseSkillToValue(skills, book.skill, book.targetSkillValue)
  return {
    outcome: result.changed ? 'learned' : 'known',
    skill: book.skill,
    previousValue: result.previousValue,
    value: result.value,
    targetValue: book.targetSkillValue,
  }
}
