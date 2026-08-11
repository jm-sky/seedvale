export type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}

export function createHealthState(maxHp: number): HealthState {
  return { maxHp, currentHp: maxHp, dead: false }
}

/** Subtracts `amount` from HP. Clamps at 0 and sets `dead` when HP reaches 0.
 *  Combat-agnostic — does not know the attacker, weapon, or AI policy. */
export function damageHealth(health: HealthState, amount: number): void {
  if (health.dead || amount <= 0) return
  health.currentHp = Math.max(0, health.currentHp - amount)
  if (health.currentHp <= 0) {
    health.dead = true
  }
}

/** Adds `amount` to HP, capped at `maxHp`. Does not revive the dead. */
export function healHealth(health: HealthState, amount: number): void {
  if (health.dead || amount <= 0) return
  health.currentHp = Math.min(health.maxHp, health.currentHp + amount)
}

export function isAlive(health: HealthState): boolean {
  return !health.dead
}
