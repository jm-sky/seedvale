import type { DefenseConfig } from '../items/itemCatalog'

/** Minimum dot(defenderForward, toAttacker) for a held item to count as
 *  blocking — attacks from behind/sides slip past (plan 150 §6). */
export const DEFENSE_FRONT_ARC_DOT = 0.2

export type DefenseOutcome = 'none' | 'full' | 'partial'

export type ResolvedDefense = {
  outcome: DefenseOutcome
  /** Damage that should reach `HealthState` after defense. */
  finalDamage: number
  /** True when a block attempt was made (item can block + attack in arc). */
  attempted: boolean
}

/** Max extra block chance from a fully trained defense skill (plan 150 §7). */
const SKILL_MAX_BLOCK_BONUS = 0.3
/** Max extra partial-reduction effectiveness from skill value 1. */
const SKILL_MAX_PARTIAL_BONUS = 0.2

/** Deterministic 0..1 roll for one incoming hit — same inputs always produce
 *  the same outcome (mirrors `trapDetectionRoll` in `world/animalTraps.ts`). */
export function defenseBlockRoll(defenderId: string, attackerKey: string, attempt: number): number {
  let h = Math.imul(hashString(defenderId) ^ hashString(attackerKey), 2654435761)
  h = Math.imul(h ^ (attempt + 0x9e3779b9), 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** True when `(attackerX, attackerZ)` lies in the defender's forward arc. */
export function isAttackFromDefensibleDirection(
  defenderX: number,
  defenderZ: number,
  defenderYaw: number,
  attackerX: number,
  attackerZ: number,
  minDot = DEFENSE_FRONT_ARC_DOT,
): boolean {
  const dx = attackerX - defenderX
  const dz = attackerZ - defenderZ
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-4) return true
  const forwardX = -Math.sin(defenderYaw)
  const forwardZ = -Math.cos(defenderYaw)
  const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
  return dot >= minDot
}

function skillBlockChanceBonus(skillValue: number): number {
  const v = Math.max(0, Math.min(1, skillValue))
  return SKILL_MAX_BLOCK_BONUS * v
}

function skillPartialBonus(skillValue: number): number {
  const v = Math.max(0, Math.min(1, skillValue))
  return SKILL_MAX_PARTIAL_BONUS * v
}

/** Resolves defense before damage application (plan 150 §6–§8). Pure and
 *  deterministic given `attempt` — no world lookups. */
export function resolveDefense(
  incomingDamage: number,
  defense: DefenseConfig | null | undefined,
  defenseSkillValue: number,
  defenderId: string,
  attackerKey: string,
  attempt: number,
  inArc: boolean,
): ResolvedDefense {
  if (incomingDamage <= 0) {
    return { outcome: 'none', finalDamage: 0, attempted: false }
  }
  if (!defense?.canBlock || !inArc) {
    return { outcome: 'none', finalDamage: incomingDamage, attempted: false }
  }

  const blockChance = Math.min(0.95, defense.baseBlockChance + skillBlockChanceBonus(defenseSkillValue))
  const roll = defenseBlockRoll(defenderId, attackerKey, attempt)
  const partialReduction = Math.min(0.9, defense.partialReduction + skillPartialBonus(defenseSkillValue))

  if (roll < blockChance) {
    return { outcome: 'full', finalDamage: 0, attempted: true }
  }

  const partialThreshold = blockChance + (1 - blockChance) * 0.5
  if (roll < partialThreshold) {
    const finalDamage = incomingDamage * (1 - partialReduction)
    return { outcome: 'partial', finalDamage, attempted: true }
  }

  return { outcome: 'none', finalDamage: incomingDamage, attempted: true }
}
