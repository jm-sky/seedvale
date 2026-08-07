import type { AnimalKind } from './AnimalAgent'

export type { HealthState } from '../shared/HealthState'
export { createHealthState } from '../shared/HealthState'

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
