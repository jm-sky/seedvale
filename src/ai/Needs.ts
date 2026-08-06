export type NeedId = 'idle' | 'water' | 'wood'

export type NeedState = {
  thirst: number
  woodDuty: number
}

export function createNeedState(offset = 0): NeedState {
  return {
    thirst: 0.3 + offset * 0.2,
    woodDuty: 0.2 + (1 - offset) * 0.25,
  }
}

/** Tick needs upward over time (0–1). */
export function tickNeeds(needs: NeedState, dt: number): void {
  needs.thirst = Math.min(1, needs.thirst + dt * 0.04)
  needs.woodDuty = Math.min(1, needs.woodDuty + dt * 0.03)
}

export function pickNeed(needs: NeedState): NeedId {
  const waterScore = needs.thirst > 0.35 ? needs.thirst * 1.35 : 0
  const woodScore = needs.woodDuty > 0.3 ? needs.woodDuty * 1.1 : 0
  const idleScore = 0.15

  if (waterScore >= woodScore && waterScore >= idleScore) return 'water'
  if (woodScore >= idleScore) return 'wood'
  return 'idle'
}

export function needColor(need: NeedId): number {
  switch (need) {
    case 'water':
      return 0x3a9ad9
    case 'wood':
      return 0xb56b2a
    default:
      return 0xc45c26
  }
}
