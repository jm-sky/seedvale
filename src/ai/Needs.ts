export type NeedId = 'food' | 'idle' | 'water' | 'wood'

export type NeedState = {
  thirst: number
  woodDuty: number
  hunger: number
}

export function createNeedState(offset = 0): NeedState {
  return {
    thirst: 0.25 + offset * 0.2,
    woodDuty: 0.2 + (1 - offset) * 0.2,
    hunger: 0.15 + ((offset + 0.3) % 1) * 0.25,
  }
}

/** Tick needs upward over time (0–1). */
export function tickNeeds(needs: NeedState, dt: number): void {
  needs.thirst = Math.min(1, needs.thirst + dt * 0.04)
  needs.woodDuty = Math.min(1, needs.woodDuty + dt * 0.028)
  needs.hunger = Math.min(1, needs.hunger + dt * 0.035)
}

export function pickNeed(needs: NeedState): NeedId {
  const waterScore = needs.thirst > 0.35 ? needs.thirst * 1.35 : 0
  const woodScore = needs.woodDuty > 0.3 ? needs.woodDuty * 1.1 : 0
  const foodScore = needs.hunger > 0.32 ? needs.hunger * 1.2 : 0
  const idleScore = 0.12

  const best = Math.max(waterScore, woodScore, foodScore, idleScore)
  if (best === waterScore && waterScore > 0) return 'water'
  if (best === woodScore && woodScore > 0) return 'wood'
  if (best === foodScore && foodScore > 0) return 'food'
  return 'idle'
}

export function needColor(need: NeedId): number {
  switch (need) {
    case 'food':
      return 0x5faa3a
    case 'water':
      return 0x3a9ad9
    case 'wood':
      return 0xb56b2a
    default:
      return 0xc45c26
  }
}

export function needLabel(need: NeedId): string {
  switch (need) {
    case 'food':
      return 'jedzenie'
    case 'water':
      return 'woda'
    case 'wood':
      return 'drewno'
    default:
      return '…'
  }
}
