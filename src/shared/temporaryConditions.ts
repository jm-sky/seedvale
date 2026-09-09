import type { PhysicalAttributes } from './PhysicalAttributes'

/**
 * @domain shared
 * @system temporary-conditions
 * @role Shared authoritative temporary physical-condition state (plan npc-024).
 *  Lazy elapsed-game-time progression — no global manager, no per-frame tick.
 * @owns ConditionKind TemporaryConditionsState
 */

export type ConditionKind = 'poisoning'

export type ConditionEntry = {
  severity: number
  lastUpdatedAtDays: number
}

export type TemporaryConditionsState = {
  conditions: Partial<Record<ConditionKind, ConditionEntry>>
}

export type SaveTemporaryConditionsSnapshot = Partial<Record<ConditionKind, ConditionEntry>>

export const POISONING_MAX_SEVERITY = 100
/** First successful unsafe-water exposure. */
export const POISONING_INITIAL_EXPOSURE_SEVERITY = 25
/** Additional severity when already poisoned and exposed again. */
export const POISONING_REPEAT_EXPOSURE_SEVERITY = 15
/** Severity recovered per elapsed game-day (lazy resolution). */
export const POISONING_RECOVERY_PER_GAME_DAY = 10
/** Probability `[0,1]` that one direct drink from an `unsafe` source rolls exposure. */
export const UNSAFE_WATER_POISONING_EXPOSURE_CHANCE = 0.4

/** Max absolute SPEA penalty at full poisoning severity — conservative so one
 *  exposure does not disable the actor (plan npc-024). Perception untouched. */
export const POISONING_MAX_SPEA_PENALTY = 0.12

export function createEmptyTemporaryConditions(): TemporaryConditionsState {
  return { conditions: {} }
}

export function cloneTemporaryConditions(state: TemporaryConditionsState): TemporaryConditionsState {
  const conditions: TemporaryConditionsState['conditions'] = {}
  for (const [kind, entry] of Object.entries(state.conditions) as [ConditionKind, ConditionEntry][]) {
    if (entry) conditions[kind] = { ...entry }
  }
  return { conditions }
}

export function snapshotTemporaryConditions(
  state: TemporaryConditionsState,
): SaveTemporaryConditionsSnapshot | undefined {
  const out: SaveTemporaryConditionsSnapshot = {}
  for (const [kind, entry] of Object.entries(state.conditions) as [ConditionKind, ConditionEntry][]) {
    if (entry && entry.severity > 0) out[kind] = { ...entry }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function restoreTemporaryConditions(
  saved?: SaveTemporaryConditionsSnapshot | null,
): TemporaryConditionsState {
  if (!saved) return createEmptyTemporaryConditions()
  const conditions: TemporaryConditionsState['conditions'] = {}
  for (const [kind, entry] of Object.entries(saved) as [ConditionKind, ConditionEntry][]) {
    if (!entry || typeof entry.severity !== 'number' || typeof entry.lastUpdatedAtDays !== 'number') continue
    const severity = clampSeverity(entry.severity)
    if (severity <= 0) continue
    conditions[kind] = { severity, lastUpdatedAtDays: entry.lastUpdatedAtDays }
  }
  return { conditions }
}

function clampSeverity(severity: number): number {
  if (!Number.isFinite(severity)) return 0
  return Math.max(0, Math.min(POISONING_MAX_SEVERITY, severity))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function resolvePoisoningSeverity(entry: ConditionEntry, nowDays: number): number {
  const elapsed = Math.max(0, nowDays - entry.lastUpdatedAtDays)
  const recovered = elapsed * POISONING_RECOVERY_PER_GAME_DAY
  return clampSeverity(entry.severity - recovered)
}

/** Lazily advances recovery anchors to `nowDays` and removes depleted entries. */
export function resolveTemporaryConditionsProgress(state: TemporaryConditionsState, nowDays: number): void {
  for (const kind of Object.keys(state.conditions) as ConditionKind[]) {
    const entry = state.conditions[kind]
    if (!entry) continue
    const resolved = resolvePoisoningSeverity(entry, nowDays)
    if (resolved <= 0) {
      delete state.conditions[kind]
      continue
    }
    if (resolved !== entry.severity) {
      state.conditions[kind] = { severity: resolved, lastUpdatedAtDays: nowDays }
    }
  }
}

export function getResolvedPoisoningSeverity(state: TemporaryConditionsState, nowDays: number): number {
  resolveTemporaryConditionsProgress(state, nowDays)
  return state.conditions.poisoning?.severity ?? 0
}

export function hasActivePoisoning(state: TemporaryConditionsState, nowDays: number): boolean {
  return getResolvedPoisoningSeverity(state, nowDays) > 0
}

/** Human-readable severity tier for Player HUD (not a diagnosis for NPC observers). */
export function poisoningSeverityTier(severity: number): 'mild' | 'moderate' | 'severe' | null {
  if (severity <= 0) return null
  if (severity < 35) return 'mild'
  if (severity < 70) return 'moderate'
  return 'severe'
}

export function poisoningSpeaPenalties(severity: number): Pick<PhysicalAttributes, 'strength' | 'endurance' | 'agility'> {
  const t = clamp01(severity / POISONING_MAX_SEVERITY)
  const penalty = t * POISONING_MAX_SPEA_PENALTY
  return {
    strength: -penalty,
    endurance: -penalty,
    agility: -penalty,
  }
}

export function applyConditionModifiersToAttributes(
  base: PhysicalAttributes,
  state: TemporaryConditionsState,
  nowDays: number,
): PhysicalAttributes {
  resolveTemporaryConditionsProgress(state, nowDays)
  const poisoningSeverity = state.conditions.poisoning?.severity ?? 0
  if (poisoningSeverity <= 0) return base
  const penalties = poisoningSpeaPenalties(poisoningSeverity)
  return {
    strength: clamp01(base.strength + penalties.strength),
    perception: base.perception,
    endurance: clamp01(base.endurance + penalties.endurance),
    agility: clamp01(base.agility + penalties.agility),
  }
}

export function applyPoisoningExposure(
  state: TemporaryConditionsState,
  nowDays: number,
  extraSeverity = POISONING_INITIAL_EXPOSURE_SEVERITY,
): void {
  resolveTemporaryConditionsProgress(state, nowDays)
  const existing = state.conditions.poisoning
  if (!existing || existing.severity <= 0) {
    state.conditions.poisoning = {
      severity: clampSeverity(extraSeverity),
      lastUpdatedAtDays: nowDays,
    }
    return
  }
  state.conditions.poisoning = {
    severity: clampSeverity(existing.severity + POISONING_REPEAT_EXPOSURE_SEVERITY),
    lastUpdatedAtDays: nowDays,
  }
}

export function applyPoisoningTreatment(
  state: TemporaryConditionsState,
  nowDays: number,
  severityReduction: number,
): void {
  resolveTemporaryConditionsProgress(state, nowDays)
  const entry = state.conditions.poisoning
  if (!entry || entry.severity <= 0) return
  const next = clampSeverity(entry.severity - severityReduction)
  if (next <= 0) {
    delete state.conditions.poisoning
    return
  }
  state.conditions.poisoning = { severity: next, lastUpdatedAtDays: nowDays }
}

export function clearCondition(state: TemporaryConditionsState, kind: ConditionKind, nowDays: number): void {
  resolveTemporaryConditionsProgress(state, nowDays)
  delete state.conditions[kind]
}

export function applyConditionTreatment(
  state: TemporaryConditionsState,
  kind: ConditionKind,
  severityReduction: number,
  nowDays: number,
): void {
  if (kind === 'poisoning') applyPoisoningTreatment(state, nowDays, severityReduction)
}
