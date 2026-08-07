import type { AnimalKind } from './AnimalAgent'

export type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}

export function createHealthState(maxHp: number): HealthState {
  return { maxHp, currentHp: maxHp, dead: false }
}

export const MAX_HP: Record<AnimalKind, number> = {
  wolf: 50,
  fox: 25,
  deer: 30,
  stag: 40,
}

/** Predator kind -> prey kind -> damage per attack. */
const DAMAGE_TABLE: Partial<Record<AnimalKind, Partial<Record<AnimalKind, number>>>> = {
  wolf: { deer: 15, stag: 12 },
  fox: { deer: 10, stag: 6 },
}

const DEFAULT_DAMAGE = 8

export function damageFor(predator: AnimalKind, prey: AnimalKind): number {
  return DAMAGE_TABLE[predator]?.[prey] ?? DEFAULT_DAMAGE
}
