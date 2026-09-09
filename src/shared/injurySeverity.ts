import type { PhysicalAttributes } from './PhysicalAttributes'

/**
 * @domain shared
 * @system health
 * @role Pure derived physical-injury severity (plan npc-025). `physicalInjury`
 *  remains the single authoritative wound amount — severity, SPEA modifiers
 *  and recovery policy are re-derived from it and are never persisted.
 * @owns InjurySeverity
 */

export type InjurySeverity = 'critical' | 'minor' | 'none' | 'serious'

/** Highest severity a catalog treatment is allowed to declare. */
export type TreatableInjurySeverity = Exclude<InjurySeverity, 'none'>

/**
 * Relative outstanding injury (`physicalInjury / maxHp`) thresholds.
 * `none` is `physicalInjury <= 0` — not a relative cutoff, so a scratch is
 * still `minor` rather than a second independent attention floor.
 */
export const INJURY_SEVERITY_THRESHOLDS = {
  critical: 0.55,
  serious: 0.25,
} as const

/** Conservative Strength/Endurance/Agility penalties per derived severity.
 *  Perception is never reduced for injury. Critical is substantial but
 *  bounded so capability consumers do not collapse to near zero. */
export const INJURY_SPEA_PENALTY: Record<InjurySeverity, number> = {
  critical: 0.14,
  minor: 0.04,
  none: 0,
  serious: 0.08,
}

/** Natural HP recovered per elapsed game-day at the current severity band.
 *  Serious is substantially slower than minor; critical uses the same slow
 *  rate but is clamped at the serious boundary. */
export const INJURY_NATURAL_RECOVERY_HP_PER_DAY: Record<InjurySeverity, number> = {
  critical: 2,
  minor: 10,
  none: 0,
  serious: 2.5,
}

const SEVERITY_RANK: Record<InjurySeverity, number> = {
  none: 0,
  minor: 1,
  serious: 2,
  critical: 3,
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function relativeInjury(physicalInjury: number, maxHp: number): number {
  if (physicalInjury <= 0 || maxHp <= 0) return 0
  return physicalInjury / maxHp
}

/** Deterministic derived severity — the single resolver for decision, UI and treatment. */
export function resolveInjurySeverity(physicalInjury: number, maxHp: number): InjurySeverity {
  if (physicalInjury <= 0 || maxHp <= 0) return 'none'
  const relative = relativeInjury(physicalInjury, maxHp)
  if (relative >= INJURY_SEVERITY_THRESHOLDS.critical) return 'critical'
  if (relative >= INJURY_SEVERITY_THRESHOLDS.serious) return 'serious'
  return 'minor'
}

export function injurySeverityRank(severity: InjurySeverity): number {
  return SEVERITY_RANK[severity]
}

/** Outstanding injury amount at the critical → serious boundary. Natural
 *  recovery may reach this amount but cannot cross below it. */
export function criticalInjuryFloor(maxHp: number): number {
  if (maxHp <= 0) return 0
  return INJURY_SEVERITY_THRESHOLDS.critical * maxHp
}

export function injurySpeaPenalties(
  severity: InjurySeverity,
): Pick<PhysicalAttributes, 'agility' | 'endurance' | 'strength'> {
  const penalty = INJURY_SPEA_PENALTY[severity]
  return {
    agility: -penalty,
    endurance: -penalty,
    strength: -penalty,
  }
}

export function applyInjuryModifiersToAttributes(
  base: PhysicalAttributes,
  physicalInjury: number,
  maxHp: number,
): PhysicalAttributes {
  const severity = resolveInjurySeverity(physicalInjury, maxHp)
  if (severity === 'none') return base
  const penalties = injurySpeaPenalties(severity)
  return {
    agility: clamp01(base.agility + penalties.agility),
    endurance: clamp01(base.endurance + penalties.endurance),
    perception: base.perception,
    strength: clamp01(base.strength + penalties.strength),
  }
}

/**
 * Natural-recovery request for `elapsedDays` at the current severity band's
 * rate. Critical recovery is clamped so the result cannot cross into
 * serious; serious/minor may fully resolve.
 */
export function naturalInjuryRecoveryHp(physicalInjury: number, maxHp: number, elapsedDays: number): number {
  if (physicalInjury <= 0 || maxHp <= 0 || elapsedDays <= 0) return 0
  let remainingDays = elapsedDays
  let current = physicalInjury
  let recovered = 0
  while (remainingDays > 0 && current > 0) {
    const severity = resolveInjurySeverity(current, maxHp)
    const rate = INJURY_NATURAL_RECOVERY_HP_PER_DAY[severity]
    if (rate <= 0) break
    const floor = severity === 'critical' ? criticalInjuryFloor(maxHp) : 0
    const room = current - floor
    if (room <= 0) break
    const daysToFloor = room / rate
    if (remainingDays <= daysToFloor) {
      recovered += remainingDays * rate
      break
    }
    recovered += room
    current -= room
    remainingDays -= daysToFloor
  }
  return Math.min(physicalInjury, recovered)
}

/**
 * Injury accounting deltas (plan npc-002 / npc-025) — `physicalInjury` only
 * ever tracks *healable physical* HP loss/gain, never derived from
 * `maxHp - currentHp`.
 */
export function increaseInjuryFromDamage(injury: number, actualHpLoss: number): number {
  if (actualHpLoss <= 0) return injury
  return injury + actualHpLoss
}

/** Clamps at 0 — an over-heal never drives injury negative. */
export function decreaseInjuryFromHeal(injury: number, actualHpRestored: number): number {
  if (actualHpRestored <= 0) return injury
  return Math.max(0, injury - actualHpRestored)
}

/** Mid-band representative amounts for debug apply-injury controls. */
export function representativeInjuryAmount(severity: TreatableInjurySeverity, maxHp: number): number {
  if (maxHp <= 0) return 0
  switch (severity) {
    case 'critical':
      return Math.min(maxHp * 0.75, maxHp - 1)
    case 'minor':
      return Math.max(1, maxHp * (INJURY_SEVERITY_THRESHOLDS.serious * 0.5))
    case 'serious':
      return maxHp * ((INJURY_SEVERITY_THRESHOLDS.serious + INJURY_SEVERITY_THRESHOLDS.critical) / 2)
  }
}
