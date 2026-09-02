import type { ScoredAction } from '../simulation/scoreActions'
import type { AnimalRole } from './AnimalAgent'
import type { PredatorHumanIntent } from './predatorHumanDecision'

/**
 * Pure fauna behaviour arbitration (npc-008) — mirrors `predatorHumanDecision.ts`
 * in shape and testability. This only encodes today's `AnimalAgent.update()`
 * `if / else if` order (implementation notes §2.1/§5) as data; it does not
 * change which behaviour wins for any given input. Three.js-free, no
 * `AnimalAgent` import at runtime (`AnimalRole`/`PredatorHumanIntent` are
 * type-only imports, erased by `verbatimModuleSyntax`).
 */

/** Lifecycle overrides that replace the whole decision, evaluated by the
 *  caller before `decideFaunaBehaviour` — `'dead'`/`'mounted'` return early
 *  in `AnimalAgent.update()` and never reach this module; `'rabid'` is
 *  still evaluated as a gate above the ranking (implementation notes §2.2). */
export type FaunaDecisionGate = 'dead' | 'mounted' | 'rabid'

/** Rankable behaviours — identical to `AnimalAgent`'s `FaunaAiBranch` minus
 *  the `'rabid'` gate. `AnimalAgent.ts` derives `FaunaAiBranch` from this
 *  type instead of duplicating the list. */
export type FaunaBehaviourKind =
  | 'player-attack'
  | 'player-ignore'
  | 'player-flee'
  | 'player-flee-prey'
  | 'npc-attack-frenzied'
  | 'npc-attack'
  | 'npc-ignore'
  | 'npc-flee'
  | 'fire-avoid'
  | 'frenzy-beeline'
  | 'predator-normal'
  | 'prey-normal'

export type FaunaDecisionInput = {
  role: AnimalRole
  frenzied: boolean
  playerActive: boolean
  /** Throttled `decidePredatorHumanIntent()` result, `null` unless
   *  `playerActive && role === 'predator'` (see implementation notes F4 —
   *  the caller must compute this under exactly that condition, same as
   *  today's branch #2). */
  playerIntent: PredatorHumanIntent | null
  /** Whether a bounded NPC target was resolved this tick (caller-bounded
   *  `nearbyNpcs`, see `AnimalAgent.resolveNpcTarget`) — resolved for any
   *  predator, frenzied or not (npc-008 step 6). */
  npcThreat: boolean
  /** Throttled intent for the non-frenzied NPC-threat path (`npc-attack` /
   *  `npc-ignore` / `npc-flee`), live since npc-008 step 6. `null` for a
   *  frenzied predator, which resolves via `npc-attack-frenzied` instead and
   *  never scores (implementation notes F1). */
  npcIntent: PredatorHumanIntent | null
  fireNearby: boolean
  hasStrategicVillage: boolean
  arrivedAtStrategicVillage: boolean
}

/** Priority ranks — encode today's `if / else if` order 1:1 (higher wins,
 *  ties keep the earlier entry in `BEHAVIOUR_ORDER`, same rule as
 *  `pickHighestScore`). Gaps of 10 leave room to insert a new behaviour
 *  between two existing ones without renumbering the table. */
export const FAUNA_BEHAVIOUR_PRIORITY: Record<FaunaBehaviourKind, number> = {
  'player-attack': 90,
  'player-ignore': 90,
  'player-flee': 90,
  'player-flee-prey': 80,
  'npc-attack-frenzied': 70,
  'npc-attack': 60,
  'npc-ignore': 60,
  'npc-flee': 60,
  'fire-avoid': 50,
  'frenzy-beeline': 40,
  'predator-normal': 30,
  'prey-normal': 20,
}

/** Descending-priority scan order, built once from `FAUNA_BEHAVIOUR_PRIORITY`
 *  — `decideFaunaBehaviour` walks this without allocating per call. */
const BEHAVIOUR_ORDER: readonly FaunaBehaviourKind[] = (
  Object.keys(FAUNA_BEHAVIOUR_PRIORITY) as FaunaBehaviourKind[]
).sort((a, b) => FAUNA_BEHAVIOUR_PRIORITY[b] - FAUNA_BEHAVIOUR_PRIORITY[a])

/** Single source of truth for validity, shared by the runtime scan and the
 *  debug/test scoring path so the two can never drift apart. Mirrors
 *  `AnimalAgent.update()`'s current guards exactly (implementation notes
 *  §2.1) — `player-attack`/`-ignore`/`-flee` are mutually exclusive via
 *  `playerIntent`, likewise `npc-attack`/`-ignore`/`-flee` via `npcIntent`,
 *  so only one candidate per priority group is ever valid at once. */
function isBehaviourValid(kind: FaunaBehaviourKind, input: FaunaDecisionInput): boolean {
  switch (kind) {
    case 'fire-avoid':
      return input.fireNearby && !input.frenzied
    case 'frenzy-beeline':
      return input.role === 'predator' && input.frenzied
        && input.hasStrategicVillage && !input.arrivedAtStrategicVillage
    case 'npc-attack':
      return input.npcThreat && !input.frenzied && input.npcIntent === 'attack'
    case 'npc-attack-frenzied':
      return input.npcThreat && input.frenzied
    case 'npc-flee':
      return input.npcThreat && !input.frenzied && input.npcIntent === 'flee'
    case 'npc-ignore':
      return input.npcThreat && !input.frenzied && input.npcIntent === 'ignore'
    case 'player-attack':
      return input.playerActive && input.role === 'predator' && input.playerIntent === 'attack'
    case 'player-flee':
      return input.playerActive && input.role === 'predator' && input.playerIntent === 'flee'
    case 'player-flee-prey':
      return input.playerActive && input.role !== 'predator'
    case 'player-ignore':
      return input.playerActive && input.role === 'predator' && input.playerIntent === 'ignore'
    case 'predator-normal':
      return input.role === 'predator'
    case 'prey-normal':
      return true
  }
}

/** Runtime path: allocation-free ordered scan over `isBehaviourValid` —
 *  called every tick from `AnimalAgent.update()` (implementation notes
 *  §2.3: branch *selection* itself is untimed, only the intent inputs feeding
 *  it are throttled). `prey-normal` is always valid, so this never returns
 *  `null` and no `fallback` argument is needed. */
export function decideFaunaBehaviour(input: FaunaDecisionInput): FaunaBehaviourKind {
  for (const kind of BEHAVIOUR_ORDER) {
    if (isBehaviourValid(kind, input)) return kind
  }
  // Unreachable: 'prey-normal' is always valid.
  return 'prey-normal'
}

/** Debug/test path only — materializes the valid candidates with their
 *  ranks so the ordering is inspectable (`?debug=1`) and assertable in
 *  tests. Not called from the per-tick runtime path (see `decideFaunaBehaviour`). */
export function scoreFaunaBehaviours(input: FaunaDecisionInput): ScoredAction<FaunaBehaviourKind>[] {
  const scored: ScoredAction<FaunaBehaviourKind>[] = []
  for (const kind of BEHAVIOUR_ORDER) {
    if (isBehaviourValid(kind, input)) {
      scored.push({ kind, score: FAUNA_BEHAVIOUR_PRIORITY[kind] })
    }
  }
  return scored
}
