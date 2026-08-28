/**
 * @domain shared
 * @system stamina
 * @role Shared physical-effort capacity used by the player, NPCs and fauna.
 * @owns StaminaState
 */
export type StaminaState = {
  max: number
  current: number
}

export function createStaminaState(max: number): StaminaState {
  return { max, current: max }
}

export function drainStamina(stamina: StaminaState, amount: number): void {
  if (amount <= 0) return
  stamina.current = Math.max(0, stamina.current - amount)
}

export function restoreStamina(stamina: StaminaState, amount: number): void {
  if (amount <= 0) return
  stamina.current = Math.min(stamina.max, stamina.current + amount)
}

export function isExhausted(stamina: StaminaState): boolean {
  return stamina.current <= 0
}

export function getStaminaRatio(stamina: StaminaState): number {
  if (stamina.max <= 0) return 0
  return stamina.current / stamina.max
}
