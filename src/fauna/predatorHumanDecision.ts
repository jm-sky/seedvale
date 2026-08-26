import { pickHighestScore, type ScoredAction } from '../simulation/scoreActions'

/**
 * Pure predator vs-human decision (plan 055 Phase 5 / seam for 056).
 * Perception stays in `playerAwareness` + fire distance; this only scores
 * competing `flee` vs `attack` intents. Deterministic for identical inputs
 * (including the injected `aggressionRoll`).
 */

/** `'ignore'` (playtest fixes plan §3) — a bold predator (bear) noticing a
 *  distant, non-threatening human neither flees nor attacks; it just keeps
 *  doing whatever it was already doing. Never returned for a species without
 *  a `CALM_SCORE_THRESHOLD` entry (wolf/fox keep their exact prior
 *  attack-vs-flee behaviour). */
export type PredatorHumanIntent = 'attack' | 'flee' | 'ignore'

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
  /** 0–1 current HP ratio — used for provoked retaliation. */
  selfHpRatio: number
  /** True when the player recently damaged this animal. */
  provoked: boolean
  /**
   * Caller-supplied 0–1 roll for wolf close/retaliation branches.
   * Tests pass a fixed value; runtime rolls once per decision refresh.
   */
  aggressionRoll: number
}

/** Hunger only starts pushing toward attack above this level. */
const HUNGER_ATTACK_FLOOR = 0.55
/** Baseline flee preference so low-hunger predators still flee. */
const FLEE_BASELINE = 0.28
const FIRE_FEAR = 0.55
const CROWD_FEAR_PER_EXTRA = 0.22

/** Species bias added to attack score (negative = more cautious). Bear is
 *  deliberately more cautious than wolf here (playtest fixes plan §3) —
 *  it isn't a hunger-driven hunter of humans; its own aggression comes from
 *  the close/retaliation roll branches below instead. */
const ATTACK_BIAS: Record<string, number> = {
  wolf: 0.12,
  fox: -0.08,
  bear: -0.3,
}

/** Species bias added to flee score (negative = bolder, less skittish).
 *  Only bear opts in (playtest fixes plan §3 — "zbyt łatwe płoszenie
 *  niedźwiedzia"): wolf/fox keep the shared `FLEE_BASELINE` unmodified. */
const FLEE_BIAS: Record<string, number> = {
  bear: -0.55,
}

/** A species opts in by having its winning score fall below this — instead
 *  of the usual binary attack/flee pick, `decidePredatorHumanIntent` returns
 *  `'ignore'` (playtest fixes plan §3). Left unset (`-Infinity` fallback) for
 *  every other species, so wolf/fox never see this branch: their weakest
 *  possible flee score (`FLEE_BASELINE`, no proximity/fire/crowd) already
 *  sits at 0.28, comfortably above any threshold that would still make sense
 *  for a genuinely nervous species. */
const CALM_SCORE_THRESHOLD: Record<string, number> = {
  bear: 0.05,
}

/** Species that get the close-range/retaliation roll branches below, instead
 *  of pure score comparison — originally wolf-only; bear opts in too
 *  (playtest fixes plan §3) so "player very close" / "just hit it" resolves
 *  to the same defend-or-flee roll a cornered/provoked wolf already uses,
 *  rather than a second bespoke mechanic. */
const CLOSE_AGGRESSION_SPECIES = new Set(['bear', 'wolf'])

/** Wolf close territorial attack chance when inside panic range. */
export const CLOSE_ATTACK_CHANCE = 0.3
/** Wolf retaliation attack chance when provoked and still healthy. */
export const RETALIATION_ATTACK_CHANCE = 0.75
/** Below this HP ratio a provoked wolf always flees. */
export const PROVOKED_FLEE_HP_RATIO = 0.4
/** Crowd size at which close/retaliation attack rolls are suppressed. */
export const CROWD_ATTACK_BLOCK_COUNT = 3
/** How long a player hit keeps the animal provoked (seconds). */
export const PROVOCATION_SECONDS = 8

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

/** Fire or a sizable crowd blocks wolf close/retaliation attack rolls. */
export function isAttackRollSuppressed(input: PredatorHumanDecisionInput): boolean {
  return input.fireNearby || input.nearbyHumanCount >= CROWD_ATTACK_BLOCK_COUNT
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
  const fleeBias = FLEE_BIAS[input.kind] ?? 0

  const fleeScore = FLEE_BASELINE + proximity * 0.72 + fire + crowd + fleeBias
  const attackScore = hunger * 0.95 + bias - proximity * 0.2 - fire * 0.5 - crowd

  return [
    { kind: 'flee', score: fleeScore },
    { kind: 'attack', score: attackScore },
  ]
}

/**
 * Wolf close aggression + retaliation branches first; otherwise hunger vs fear.
 * Fox never uses the roll branches. Close roll only applies when hunger scoring
 * would flee (non-hungry territorial chance); hungry wolves still attack up close.
 */
export function decidePredatorHumanIntent(
  input: PredatorHumanDecisionInput,
): PredatorHumanIntent {
  const roll = clamp01(input.aggressionRoll)
  const suppressed = isAttackRollSuppressed(input)
  const hasCloseAggression = CLOSE_AGGRESSION_SPECIES.has(input.kind)

  if (hasCloseAggression && input.provoked && !suppressed) {
    if (input.selfHpRatio < PROVOKED_FLEE_HP_RATIO) return 'flee'
    return roll < RETALIATION_ATTACK_CHANCE ? 'attack' : 'flee'
  }

  const best = pickHighestScore(scorePredatorHumanIntents(input))
  const scored = best?.kind ?? 'flee'

  // Calm/bold species (bear — playtest fixes plan §3): a winning score this
  // weak means neither flee nor attack pressure is actually meaningful yet
  // (far/uninterested), so it just keeps doing whatever it was doing instead
  // of a binary attack-vs-flee pick forcing a reaction it doesn't have.
  const calmThreshold = CALM_SCORE_THRESHOLD[input.kind]
  if (calmThreshold !== undefined && (best?.score ?? -Infinity) < calmThreshold) {
    return 'ignore'
  }

  if (
    hasCloseAggression
    && !input.provoked
    && !suppressed
    && input.humanDistance <= input.playerPanicRange
    && scored === 'flee'
  ) {
    return roll < CLOSE_ATTACK_CHANCE ? 'attack' : 'flee'
  }

  return scored
}

/** XZ radius around the player for counting nearby NPCs into crowd fear.
 *  Tuned near notice range so only humans at the encounter matter. */
export const NEARBY_HUMAN_RADIUS = 12

/**
 * Player (always 1) + alive NPCs within `radius` of the player.
 * Precomputed once per frame by the caller — avoids O(animals × NPCs).
 */
export function countNearbyHumans(
  playerX: number,
  playerZ: number,
  npcPositions: readonly { x: number, z: number }[],
  radius: number = NEARBY_HUMAN_RADIUS,
): number {
  let count = 1
  const r2 = radius * radius
  for (const p of npcPositions) {
    const dx = p.x - playerX
    const dz = p.z - playerZ
    if (dx * dx + dz * dz <= r2) count++
  }
  return count
}
