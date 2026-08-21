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
}

const DEFEND_BASELINE = 0.5
const DEFEND_HEALTH_WEIGHT = 0.4
const FLEE_BASELINE = 0.3
const FLEE_HEALTH_WEIGHT = 0.6

export function scoreAnimalThreatIntents(
  input: AnimalThreatDecisionInput,
): ScoredAction<AnimalThreatResponse>[] {
  const canFight = input.hasMeleeCapability || input.hasRangedCapability
  // No usable weapon → defend is not a real option at all (`-Infinity`, not
  // just a low score) so `flee` always wins regardless of health.
  const defendScore = canFight ? DEFEND_BASELINE + input.healthRatio * DEFEND_HEALTH_WEIGHT : -Infinity
  const fleeScore = FLEE_BASELINE + (1 - input.healthRatio) * FLEE_HEALTH_WEIGHT + (canFight ? 0 : 1)
  return [
    { kind: 'defend', score: defendScore },
    { kind: 'flee', score: fleeScore },
  ]
}

/** Minimal V1 rule (plan 179 §14): a capable, healthy combatant leans
 *  `defend`; an unarmed or badly-hurt NPC leans `flee`. `defend` requires
 *  *some* usable combat capability — an unarmed/out-of-ammo NPC always
 *  flees rather than producing a combat intent 177 would immediately reject
 *  (plan 179 §15). */
export function decideAnimalThreatResponse(input: AnimalThreatDecisionInput): AnimalThreatResponse {
  return pickHighestScore(scoreAnimalThreatIntents(input))?.kind ?? 'flee'
}
