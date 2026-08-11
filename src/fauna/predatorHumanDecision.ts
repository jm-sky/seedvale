import { pickHighestScore, type ScoredAction } from '../simulation/scoreActions'

/**
 * Pure predator vs-human decision (plan 055 Phase 5 / seam for 056).
 * Perception stays in `playerAwareness` + fire distance; this only scores
 * competing `flee` vs `attack` intents. Deterministic for identical inputs.
 */

export type PredatorHumanIntent = 'attack' | 'flee'

export type PredatorHumanDecisionInput = {
  /** 0–1 from `AnimalLifeState.hunger`. */
  hunger: number
  /** XZ distance to the noticed human. */
  humanDistance: number
  playerNoticeRange: number
  playerPanicRange: number
  /** True when a lit fire/torch is within the animal's fire-avoid radius. */
  fireNearby: boolean
  /** Player + nearby humans; minimum 1 when the player was noticed. */
  nearbyHumanCount: number
  /** Species id — wolf more willing, fox more cautious. */
  kind: string
}

/** Hunger only starts pushing toward attack above this level. */
const HUNGER_ATTACK_FLOOR = 0.55
/** Baseline flee preference so low-hunger predators still flee. */
const FLEE_BASELINE = 0.28
const FIRE_FEAR = 0.55
const CROWD_FEAR_PER_EXTRA = 0.22

/** Species bias added to attack score (negative = more cautious). */
const ATTACK_BIAS: Record<string, number> = {
  wolf: 0.12,
  fox: -0.08,
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** Closer humans → higher fear. Panic range ≈ 1, notice edge ≈ 0. */
export function humanProximityFear(
  distance: number,
  panicRange: number,
  noticeRange: number,
): number {
  if (distance <= panicRange) return 1
  const span = Math.max(1e-4, noticeRange - panicRange)
  return clamp01(1 - (distance - panicRange) / span)
}

/** Hunger pressure that can outweigh fear (0 below floor, 1 at full hunger). */
export function hungerAttackPressure(hunger: number): number {
  return clamp01((hunger - HUNGER_ATTACK_FLOOR) / (1 - HUNGER_ATTACK_FLOOR))
}

export function scorePredatorHumanIntents(
  input: PredatorHumanDecisionInput,
): ScoredAction<PredatorHumanIntent>[] {
  const proximity = humanProximityFear(
    input.humanDistance,
    input.playerPanicRange,
    input.playerNoticeRange,
  )
  const crowd = Math.max(0, input.nearbyHumanCount - 1) * CROWD_FEAR_PER_EXTRA
  const fire = input.fireNearby ? FIRE_FEAR : 0
  const hunger = hungerAttackPressure(input.hunger)
  const bias = ATTACK_BIAS[input.kind] ?? 0

  const fleeScore = FLEE_BASELINE + proximity * 0.72 + fire + crowd
  const attackScore = hunger * 0.95 + bias - proximity * 0.2 - fire * 0.5 - crowd

  return [
    { kind: 'flee', score: fleeScore },
    { kind: 'attack', score: attackScore },
  ]
}

export function decidePredatorHumanIntent(
  input: PredatorHumanDecisionInput,
): PredatorHumanIntent {
  return pickHighestScore(scorePredatorHumanIntents(input))?.kind ?? 'flee'
}
