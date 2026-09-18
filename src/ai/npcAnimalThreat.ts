import type { CombatTargetHandle } from '../combat/combatIntent'
import { pickHighestScore, type ScoredAction } from '../simulation/scoreActions'

/**
 * NPC-side "immediate animal threat" pressure + defend/flee decision (plan
 * 179 §6/§7/§8/§10). `ImmediateAnimalThreat` describes a situation, never a
 * command — it is not itself `defend` or `flee`. `decideAnimalThreatResponse`
 * scores `defend` against `flee` from this NPC's own carried-weapon
 * capability and health, the same `pickHighestScore` shape
 * `fauna/predatorHumanDecision.ts` already uses for the animal side of the
 * same encounter. `NpcAgent` owns applying the result (`beginCombat()` /
 * the existing `wander` movement phase) — this module holds no simulation
 * state and never references `NpcAgent`/`AnimalAgent` directly.
 */

export type ThreateningAnimalCandidate = {
  animalId: string
  kind: string
  x: number
  z: number
  /** Already-built combat target seam (`fauna/faunaCombat.ts`'s
   *  `combatTargetForAnimal()`) — carried through perception so a `defend`
   *  decision can hand it straight to `NpcAgent.beginCombat()` without a
   *  second animal lookup/registry. */
  target: CombatTargetHandle
  /** When false, this candidate is flock-prey information only and must not
   *  count as an immediate threat to a non-shepherd NPC. Omitted/`true` keeps
   *  the existing human-threat list behaviour. */
  threateningHuman?: boolean
  /** Committed livestock prey, when this predator is hunting an animal. */
  preyAnimalId?: string
  preyOwnerHouseId?: string
}

export type ImmediateAnimalThreat = {
  animalId: string
  kind: string
  x: number
  z: number
  distance: number
  target: CombatTargetHandle
}

/** Bounded local radius (world units) within which an NPC notices an
 *  actively-threatening animal — smaller than fauna's own player-notice
 *  ranges (10-18): this fires only for an animal already close enough to be
 *  an immediate concern, not general wildlife awareness. */
export const IMMEDIATE_ANIMAL_THREAT_RADIUS = 10

/** Bounded local-assistance awareness radius for a role responsible for
 *  settlement protection (currently: guard, plan npc-048) — wider than
 *  `IMMEDIATE_ANIMAL_THREAT_RADIUS` so a guard can notice and respond to live
 *  danger threatening a nearby human or committed against nearby livestock
 *  without being personally attacked first. Still spatially bounded, never a
 *  settlement-wide scan. */
export const GUARD_LOCAL_THREAT_ASSISTANCE_RADIUS = 30

/** Nearest currently-threatening animal within range, or `null`. Pure/
 *  deterministic given `candidates` — the caller (`NpcAgent`) is
 *  responsible for keeping `candidates` small (bounded to animals actively
 *  targeting a human this frame, see `AnimalAgent.isThreateningHuman()`). */
export function senseImmediateAnimalThreat(
  npcX: number,
  npcZ: number,
  candidates: readonly ThreateningAnimalCandidate[],
  radius: number = IMMEDIATE_ANIMAL_THREAT_RADIUS,
): ImmediateAnimalThreat | null {
  let best: ImmediateAnimalThreat | null = null
  let bestD = radius
  for (const c of candidates) {
    if (c.threateningHuman === false) continue
    if (!c.target.isAlive()) continue
    const d = Math.hypot(c.x - npcX, c.z - npcZ)
    if (d < bestD) {
      bestD = d
      best = { animalId: c.animalId, kind: c.kind, x: c.x, z: c.z, distance: d, target: c.target }
    }
  }
  return best
}

/** Nearest live local danger within `radius` that a settlement-protection
 *  role (guard, plan npc-048) should notice and may go assist — unlike
 *  `senseImmediateAnimalThreat`, this also counts a predator committed
 *  against nearby livestock (`preyAnimalId` set, see `fauna/shepherdFlock.ts`)
 *  as a real local danger, not only one actively threatening a human. Pure/
 *  deterministic given `candidates`; the caller keeps `candidates` bounded
 *  (same `nearbyAnimalThreats` list every consumer already receives). */
export function senseLocalThreatAssistance(
  npcX: number,
  npcZ: number,
  candidates: readonly ThreateningAnimalCandidate[],
  radius: number = GUARD_LOCAL_THREAT_ASSISTANCE_RADIUS,
): ImmediateAnimalThreat | null {
  let best: ImmediateAnimalThreat | null = null
  let bestD = radius
  for (const c of candidates) {
    if (c.threateningHuman === false && !c.preyAnimalId) continue
    if (!c.target.isAlive()) continue
    const d = Math.hypot(c.x - npcX, c.z - npcZ)
    if (d < bestD) {
      bestD = d
      best = { animalId: c.animalId, kind: c.kind, x: c.x, z: c.z, distance: d, target: c.target }
    }
  }
  return best
}

export type AnimalThreatResponse = 'defend' | 'flee'

export type AnimalThreatDecisionInput = {
  hasMeleeCapability: boolean
  hasRangedCapability: boolean
  /** 0–1 current HP ratio. */
  healthRatio: number
  /** 0–1 Big Five neuroticism (plan ai-002) — sensitivity to this already-
   *  existing risk/threat signal. Optional, defaults to 0.5 (neutral, no
   *  bias) so every existing caller/test keeps its exact prior behaviour. */
  neuroticism?: number
  /** Settlement-protection role responsibility (plan npc-048, currently:
   *  guard) — shifts `defend` score up when combat capability is actually
   *  usable. Never turns an unarmed/critically-hurt guard into a fighter:
   *  `defend` still requires `canFight`, and the health-driven swing still
   *  dominates. Optional, defaults to `false` so every existing caller/test
   *  keeps its exact prior behaviour. */
  guardResponsibility?: boolean
}

const DEFEND_BASELINE = 0.5
const DEFEND_HEALTH_WEIGHT = 0.4
const FLEE_BASELINE = 0.3
const FLEE_HEALTH_WEIGHT = 0.6
/** How far neuroticism can shift `defend` vs `flee` around the 0.5 neutral
 *  point — modest next to the health-driven swing above so a badly-hurt or
 *  unarmed NPC still flees regardless of personality, and a healthy armed
 *  one still defends unless neuroticism is meaningfully above average. */
const NEUROTICISM_RISK_WEIGHT = 0.5
/** Modest next to the health-driven swing above so a critically hurt or
 *  unarmed guard still flees, and a healthy armed one already leans defend
 *  without the bias — this only firms up an existing lean. */
const GUARD_RESPONSIBILITY_DEFEND_BIAS = 0.15

export function scoreAnimalThreatIntents(
  input: AnimalThreatDecisionInput,
): ScoredAction<AnimalThreatResponse>[] {
  const canFight = input.hasMeleeCapability || input.hasRangedCapability
  const riskBias = ((input.neuroticism ?? 0.5) - 0.5) * NEUROTICISM_RISK_WEIGHT
  const guardBias = canFight && input.guardResponsibility ? GUARD_RESPONSIBILITY_DEFEND_BIAS : 0
  // No usable weapon → defend is not a real option at all (`-Infinity`, not
  // just a low score) so `flee` always wins regardless of health/personality.
  const defendScore = canFight ? DEFEND_BASELINE + input.healthRatio * DEFEND_HEALTH_WEIGHT - riskBias + guardBias : -Infinity
  const fleeScore = FLEE_BASELINE + (1 - input.healthRatio) * FLEE_HEALTH_WEIGHT + (canFight ? 0 : 1) + riskBias
  return [
    { kind: 'defend', score: defendScore },
    { kind: 'flee', score: fleeScore },
  ]
}

/** Authoritative defend/flee arbitration for one threat decision (plan
 *  tools-013) — scores once and returns the chosen response plus the exact
 *  candidate scores used by `pickHighestScore`. */
export type AnimalThreatArbitration = {
  response: AnimalThreatResponse
  defendScore: number
  fleeScore: number
  hasMeleeCapability: boolean
  hasRangedCapability: boolean
  healthRatio: number
  neuroticism: number
  guardResponsibility: boolean
}

export function arbitrateAnimalThreat(input: AnimalThreatDecisionInput): AnimalThreatArbitration {
  const scored = scoreAnimalThreatIntents(input)
  const defendScore = scored.find((c) => c.kind === 'defend')!.score
  const fleeScore = scored.find((c) => c.kind === 'flee')!.score
  return {
    response: pickHighestScore(scored)?.kind ?? 'flee',
    defendScore,
    fleeScore,
    hasMeleeCapability: input.hasMeleeCapability,
    hasRangedCapability: input.hasRangedCapability,
    healthRatio: input.healthRatio,
    neuroticism: input.neuroticism ?? 0.5,
    guardResponsibility: input.guardResponsibility ?? false,
  }
}

/** JSON-safe defend score — `null` when defend was not a real option. */
export function serializableDefendScore(score: number): number | null {
  return Number.isFinite(score) ? score : null
}

/** Minimal V1 rule (plan 179 §14): a capable, healthy combatant leans
 *  `defend`; an unarmed or badly-hurt NPC leans `flee`. `defend` requires
 *  *some* usable combat capability — an unarmed/out-of-ammo NPC always
 *  flees rather than producing a combat intent 177 would immediately reject
 *  (plan 179 §15). */
export function decideAnimalThreatResponse(input: AnimalThreatDecisionInput): AnimalThreatResponse {
  return arbitrateAnimalThreat(input).response
}
