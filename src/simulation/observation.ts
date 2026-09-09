import type { InjurySeverity } from '../shared/injurySeverity'

/**
 * @domain npc
 * @system observation
 * @role Pure observation-level resolution from observer Perception and distance.
 *  Intended for presentation now and simulation consumers later — no DOM/UI dependency.
 */

export type ObservationLevel = 'none' | 'basic' | 'assessed' | 'detailed'

export type ObservationInput = {
  perception: number
  distance: number
}

export type PlayerObservationInput = {
  perception: number
  /** Debug-only bypass — when true, observation information gating is skipped. */
  fullLabelInfo: boolean
}

export const NEUTRAL_PERCEPTION = 0.5

export const NPC_BROAD_IDENTITY_LABEL = 'Osoba'

export const DEFAULT_PLAYER_OBSERVATION: PlayerObservationInput = {
  perception: NEUTRAL_PERCEPTION,
  fullLabelInfo: false,
}

const DETAILED_BASELINE = 20
const ASSESSED_BASELINE = 26
const BASIC_BASELINE = 32
const DOWNGRADE_HYSTERESIS_M = 0.75

const LEVEL_RANK: Record<ObservationLevel, number> = {
  none: 0,
  basic: 1,
  assessed: 2,
  detailed: 3,
}

export type QualitativeHealth = 'healthy' | 'hurt' | 'badlyWounded' | 'critical'
export type QualitativeStamina = 'fresh' | 'tired' | 'exhausted'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Mild bounded scale — `0.5` stays neutral, `0.6` only modestly better. */
export function observationRangeScale(perception: number): number {
  return 0.8 + clamp01(perception) * 0.4
}

/** Resolves the raw observation level from Perception and distance only. */
export function resolveObservationLevel(input: ObservationInput): ObservationLevel {
  const scale = observationRangeScale(input.perception)
  const distance = input.distance
  if (distance <= DETAILED_BASELINE * scale) return 'detailed'
  if (distance <= ASSESSED_BASELINE * scale) return 'assessed'
  if (distance <= BASIC_BASELINE * scale) return 'basic'
  return 'none'
}

/** Keeps downgrade transitions stable without persisting global hysteresis. */
export function stabilizeObservationLevel(
  candidate: ObservationLevel,
  previous: ObservationLevel | null,
  input: ObservationInput,
): ObservationLevel {
  if (previous === null) return candidate
  if (LEVEL_RANK[candidate] >= LEVEL_RANK[previous]) return candidate

  const scale = observationRangeScale(input.perception)
  const distance = input.distance
  if (previous === 'detailed' && distance <= DETAILED_BASELINE * scale + DOWNGRADE_HYSTERESIS_M) return 'detailed'
  if (previous === 'assessed' && distance <= ASSESSED_BASELINE * scale + DOWNGRADE_HYSTERESIS_M) return 'assessed'
  if (previous === 'basic' && distance <= BASIC_BASELINE * scale + DOWNGRADE_HYSTERESIS_M) return 'basic'
  return candidate
}

export function resolveStableObservationLevel(
  input: ObservationInput,
  previous: ObservationLevel | null,
): ObservationLevel {
  return stabilizeObservationLevel(resolveObservationLevel(input), previous, input)
}

export function assessHealthRatio(ratio: number): QualitativeHealth {
  if (ratio >= 0.75) return 'healthy'
  if (ratio >= 0.40) return 'hurt'
  if (ratio >= 0.15) return 'badlyWounded'
  return 'critical'
}

/** Maps derived injury severity onto the existing qualitative health vocabulary
 *  (plan npc-025) — no second injury-label system. */
export function qualitativeHealthFromInjurySeverity(severity: InjurySeverity): QualitativeHealth {
  switch (severity) {
    case 'critical': return 'critical'
    case 'minor': return 'hurt'
    case 'none': return 'healthy'
    case 'serious': return 'badlyWounded'
  }
}

export function formatPhysicalAssessmentFromQualitative(
  health: QualitativeHealth,
  staminaRatio: number,
): string {
  return `${qualitativeHealthLabel(health)} · ${qualitativeStaminaLabel(assessStaminaRatio(staminaRatio))}`
}

export function assessStaminaRatio(ratio: number): QualitativeStamina {
  if (ratio >= 0.60) return 'fresh'
  if (ratio >= 0.25) return 'tired'
  return 'exhausted'
}

export function qualitativeHealthLabel(level: QualitativeHealth): string {
  switch (level) {
    case 'badlyWounded': return 'Ciężko ranny'
    case 'critical': return 'Krytyczny'
    case 'healthy': return 'Zdrowy'
    case 'hurt': return 'Ranny'
  }
}

export function qualitativeStaminaLabel(level: QualitativeStamina): string {
  switch (level) {
    case 'exhausted': return 'Wyczerpany'
    case 'fresh': return 'Wypoczęty'
    case 'tired': return 'Zmęczony'
  }
}

export function formatPhysicalAssessment(healthRatio: number, staminaRatio: number): string {
  const health = qualitativeHealthLabel(assessHealthRatio(healthRatio))
  const stamina = qualitativeStaminaLabel(assessStaminaRatio(staminaRatio))
  return `${health} · ${stamina}`
}
