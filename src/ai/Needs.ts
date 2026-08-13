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

export type PickNeedOptions = {
  /** Traders keep the woodDuty meter but never act on it — they stay at the
   *  stall instead of walking off to chop. */
  skipWood?: boolean
  /** Settlement wood shortage — a light score bump, not an economic planner. */
  woodShortage?: boolean
  /** Settlement food shortage — same light bias as `woodShortage`. */
  foodShortage?: boolean
}

export function pickNeed(needs: NeedState, options: PickNeedOptions = {}): NeedId {
  const waterScore = needs.thirst > 0.35 ? needs.thirst * 1.35 : 0
  const woodThreshold = options.woodShortage ? 0.22 : 0.3
  const woodMult = options.woodShortage ? 1.35 : 1.1
  const woodScore = options.skipWood ? 0 : (needs.woodDuty > woodThreshold ? needs.woodDuty * woodMult : 0)
  const foodThreshold = options.foodShortage ? 0.24 : 0.32
  const foodMult = options.foodShortage ? 1.4 : 1.2
  const foodScore = needs.hunger > foodThreshold ? needs.hunger * foodMult : 0
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
