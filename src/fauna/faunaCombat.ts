import type { AnimalKind } from './AnimalAgent'

export type { HealthState } from '../shared/HealthState'
export { createHealthState } from '../shared/HealthState'

export const MAX_HP: Record<AnimalKind, number> = {
  wolf: 50,
  fox: 25,
  deer: 30,
  stag: 40,
  rabbit: 10,
  duck: 8,
  boar: 35,
  horse: 80,
  cow: 70,
  sheep: 22,
  chicken: 6,
}

/** Predator kind -> prey kind -> damage per attack. */
const DAMAGE_TABLE: Partial<Record<AnimalKind, Partial<Record<AnimalKind, number>>>> = {
  wolf: { deer: 15, stag: 12, boar: 10, sheep: 14, chicken: 20 },
  fox: { deer: 10, stag: 6, rabbit: 20, duck: 18, chicken: 20 },
}

const DEFAULT_DAMAGE = 8

/** Flat predator → human damage (plan 056). Not keyed by prey kind — humans
 *  are not `AnimalKind`. Keep local until shared combat (045) replaces it. */
const HUMAN_DAMAGE: Partial<Record<AnimalKind, number>> = {
  wolf: 12,
  fox: 6,
}

export function damageFor(predator: AnimalKind, prey: AnimalKind): number {
  return DAMAGE_TABLE[predator]?.[prey] ?? DEFAULT_DAMAGE
}

export function damageVsHuman(predator: AnimalKind): number {
  return HUMAN_DAMAGE[predator] ?? DEFAULT_DAMAGE
}
