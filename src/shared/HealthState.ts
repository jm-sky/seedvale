export type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}

export function createHealthState(maxHp: number): HealthState {
  return { maxHp, currentHp: maxHp, dead: false }
}

/** Drains currentHp by `amount`, never below `floor`. Used by callers (e.g.
 *  NpcAgent) that never want `dead` to trigger — unlike fauna's takeDamage(),
 *  this never reaches 0 unless floor is 0. */
export function applyFatigue(health: HealthState, amount: number, floor = 0): void {
  health.currentHp = Math.max(floor, health.currentHp - amount)
}

export function rest(health: HealthState, amount: number): void {
  health.currentHp = Math.min(health.maxHp, health.currentHp + amount)
}
