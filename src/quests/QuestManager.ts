import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnerType } from '../fauna/AnimalSpawner'
import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { ReputationDimension, SocialConsequence } from '../reputation/ReputationManager'
import { genderForName } from '../ai/NpcAgent'
import { NPC_QUEST_COMPLETE_SOUND_URLS } from '../ai/npcVoiceLines'
import { LIVESTOCK_KINDS } from '../settlement/livestock'
import {
  type QuestDef,
  type QuestObjective,
  type QuestOutcome,
  type QuestOutcomeId,
  type QuestPrerequisite,
  type QuestProgressEntry,
  type QuestReward,
  QUESTS,
  type QuestStage,
  type QuestState,
  RELATION_LEVEL_THRESHOLDS,
  type RelationLevel,
  relationLevelMeetsMinimum,
  relationToLevel,
  uniqueOutcomeForState,
  validateQuestDefinitions,
} from './quests'
import {
  isSettlementRatInfestationResolved,
  settlementRatInfestationReminderLine,
  type SettlementRatInfestationSnapshot,
} from './settlementRatInfestation'

/** `labelMarker`'s glyphs (plan 153) — distinct per state, not color-only,
 *  so a floating NPC label reads correctly even without the CSS color that
 *  usually accompanies it. `TALK_TARGET` is a separate case (a non-giver NPC
 *  named by an active `talk_to_npc` objective, or any NPC named by an active
 *  `talk_to_npc_choice`) from the giver's own 3 states. */
export const QUEST_MARKER_AVAILABLE = '!'
export const QUEST_MARKER_IN_PROGRESS = '…'
export const QUEST_MARKER_READY = '✓'
export const QUEST_MARKER_TALK_TARGET = '?'

export type QuestDialogOverride = {
  line: string
  /** Present only when the dialog should present an accept/decline choice. */
  offer?: {
    onAccept: () => void
    onDecline: () => void
  }
}

export type { QuestProgressEntry }

export type QuestPromisedReward = {
  items: ReadonlyArray<{ kind: ItemKind, count: number }>
}

export type QuestListEntry = {
  id: string
  title: string
  description: string
  giverName: string
  state: QuestState
  stageIndex: number
  totalStages: number
  /** Description of the current stage's objective (with a live count for
   *  `gather_item`), or null when not `active`. */
  currentObjective: string | null
  resolvedOutcomeId?: QuestOutcomeId
  /** Presentation line after resolution — from the outcome, else the
   *  giver `reportLine` / stage `failLine`. */
  resultText?: string
  /** Unambiguous shown reward among complete outcomes; null when hidden,
   *  mixed, or already resolved. */
  promisedReward: QuestPromisedReward | null
}

export type QuestManagerInitial = {
  progress: readonly QuestProgressEntry[]
  relations: Record<string, number>
}

type QuestRuntimeProgress = {
  state: QuestState
  stageIndex: number
  resolvedOutcomeId?: QuestOutcomeId
}

export type QuestItemGrant = (kind: ItemKind, count: number) => void

/** Transfers one persistent animal to the player — fauna-owned seam (plan
 *  quests-progression-012). */
export type QuestAnimalOwnershipTransfer = (animalId: string) => boolean

/** Whether a horse-reward target may still be reserved or purchased (plan
 *  quests-progression-012) — derived outside `QuestManager`. */
export type HorseRewardAvailability = (animalId: string) => boolean

/** What a non-NPC world interaction (well/tree/spawner/live animal) reports to
 *  `onInteractObjective`. `gather_item` has no interaction point of its own —
 *  it's resolved lazily when talking to the giver — so it's excluded here. */
export type ObjectiveRef =
  | { type: 'interact_well' }
  | { type: 'interact_tree' }
  | { type: 'interact_spawner', spawnerType: SpawnerType }
  | { type: 'spot_animal', kind: AnimalKind }
  | { type: 'animal_died', animalId: string }
  | { type: 'wolf_den_cleared', denId: string }
  /** A live `[E]`-interacted animal matches this exact instance — reported
   *  by `resolveInteraction.ts`'s `animal` case alongside `spot_animal`
   *  (plan 093 Etap G). */
  | { type: 'animal_found', animalId: string }
  /** An `[E]`-interacted procedural landmark matches this exact id (plan 132)
   *  — reported by `resolveInteraction.ts`'s `landmark` case. */
  | { type: 'interact_landmark', landmarkId: string }

/** Looks up a live individual of `kind` to bind a `kill_target_animal` stage
 *  to (its `AnimalAgent.animalId`), or `undefined` if none is available right
 *  now. Implemented by the world layer (has `Fauna`/`AnimalAgent` access) and
 *  injected — `QuestManager` never imports fauna to scan it itself. */
export type AnimalTargetResolver = (kind: AnimalKind) => string | undefined

/** Applies the "dangerous" visual/gameplay trait to one bound `animalId`
 *  (plan 110's `AnimalAgent.markDangerous()`) — implemented by the world
 *  layer and injected, same reasoning as `AnimalTargetResolver`. */
export type DangerousTraitApplier = (animalId: string) => void

/** The persistent seam a quest completion uses to reach `ReputationManager`
 *  without `QuestManager` importing it directly (plan quests-progression-001
 *  §10) — the composition root maps this straight onto
 *  `ReputationManager`'s `applySocialConsequence`. Defaults to a no-op so
 *  every existing construction site (tests included) is unaffected. */
export type ApplySocialConsequence = (consequence: SocialConsequence) => void

/** Read-only settlement social standing for availability prerequisites —
 *  keyed by the resolved `QuestDef.settlementId`, never by giver name
 *  (plan quests-progression-004). */
export type QuestSocialAvailabilityLookup = {
  getReputationDimension(settlementId: string, dimension: ReputationDimension): number
  getRenown(settlementId: string): number
}

/** Read-only settlement rat-infestation world snapshot for
 *  `resolve_storage_rat_infestation` (plan quests-progression-013). */
export type SettlementRatInfestationLookup = {
  getSnapshot: (settlementId: string) => SettlementRatInfestationSnapshot
}

const NO_SETTLEMENT_RAT_INFESTATION: SettlementRatInfestationLookup = {
  getSnapshot: () => ({ storageDamaged: false, nestDestroyed: true, aliveRatCount: 0 }),
}

const NO_SOCIAL_AVAILABILITY: QuestSocialAvailabilityLookup = {
  getReputationDimension: () => 0,
  getRenown: () => 0,
}

/** Same headroom as NPC reaction clips (NpcAgent.ts) — a one-shot "thank you", not a focal cue. */
const QUEST_COMPLETE_SOUND_VOLUME = 0.35
/** Used when a failed stage has no `failLine` of its own. */
const QUEST_FAILED_FALLBACK_LINE = 'To się już nie uda.'

/** `boundAnimalId` is the specific individual this quest's `kill_target_animal`
 *  stage was bound to (if any) — an `animal_died` ref only matches that one
 *  animal, never any animal of the right kind. */
function objectiveMatchesRef(objective: QuestObjective, ref: ObjectiveRef, boundAnimalId?: string): boolean {
  switch (ref.type) {
    case 'animal_died':
      return objective.type === 'kill_target_animal' && boundAnimalId === ref.animalId
    case 'animal_found':
      return objective.type === 'find_animal' && boundAnimalId === ref.animalId
    case 'interact_landmark':
      return objective.type === 'interact_landmark' && objective.landmarkId === ref.landmarkId
    case 'interact_spawner':
      return objective.type === 'interact_spawner' && objective.spawnerType === ref.spawnerType
    case 'interact_tree':
      return objective.type === 'interact_tree'
    case 'interact_well':
      return objective.type === 'interact_well'
    case 'spot_animal':
      return objective.type === 'spot_animal' && objective.kind === ref.kind
    case 'wolf_den_cleared':
      return objective.type === 'clear_wolf_den' && objective.denId === ref.denId
  }
}

function matchingTalkChoice(
  objective: QuestObjective | undefined,
  npcName: string,
): { npcName: string, outcomeId: QuestOutcomeId } | undefined {
  if (objective?.type !== 'talk_to_npc_choice') return undefined
  return objective.choices.find((choice) => choice.npcName === npcName)
}

/** Drives multi-stage quests. Kept out of `NpcAgent`/world objects so they stay
 *  quest-agnostic — callers pass the resulting line/marker in as data.
 *
 * @domain quests-progression
 * @system quest-manager
 * @role Owns quest progress, objective/stage evaluation and NPC relation levels.
 * @owns QuestProgressEntry
 * @integration Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
 */
export class QuestManager {
  private readonly defs: readonly QuestDef[]
  private readonly inventory: Inventory
  private readonly states = new Map<string, QuestRuntimeProgress>()
  private readonly relations = new Map<string, number>()
  /** `questId → animalId` bound the moment a `kill_target_animal` stage
   *  becomes active — see `bindAnimalTargetIfNeeded`. */
  private readonly animalTargets = new Map<string, string>()
  private readonly playSound: (url: string, volume?: number) => void
  private readonly grantItem: QuestItemGrant
  private readonly resolveAnimalTarget: AnimalTargetResolver
  private readonly applyDangerousTrait: DangerousTraitApplier
  private readonly applySocialConsequence: ApplySocialConsequence
  private readonly socialAvailability: QuestSocialAvailabilityLookup
  private readonly settlementRatInfestation: SettlementRatInfestationLookup
  private readonly transferAnimalOwnership: QuestAnimalOwnershipTransfer
  private readonly canReserveHorseReward: HorseRewardAvailability
  /** Set whenever quest state changes; consumers (gameLoop's marker refresh)
   *  clear it after recomputing labels, so per-frame work is skipped on
   *  frames where nothing quest-related happened. Starts `true` so the first
   *  frame always computes markers. */
  private dirty = true

  constructor(
    defs: readonly QuestDef[] = QUESTS,
    playSound: (url: string, volume?: number) => void = () => {},
    inventory: Inventory,
    initial?: QuestManagerInitial,
    grantItem: QuestItemGrant = () => {},
    resolveAnimalTarget: AnimalTargetResolver = () => undefined,
    applyDangerousTrait: DangerousTraitApplier = () => {},
    applySocialConsequence: ApplySocialConsequence = () => {},
    socialAvailability: QuestSocialAvailabilityLookup = NO_SOCIAL_AVAILABILITY,
    settlementRatInfestation: SettlementRatInfestationLookup = NO_SETTLEMENT_RAT_INFESTATION,
    transferAnimalOwnership: QuestAnimalOwnershipTransfer = () => false,
    canReserveHorseReward: HorseRewardAvailability = () => false,
  ) {
    validateQuestDefinitions(defs)
    this.defs = defs
    this.playSound = playSound
    this.inventory = inventory
    this.grantItem = grantItem
    this.resolveAnimalTarget = resolveAnimalTarget
    this.applyDangerousTrait = applyDangerousTrait
    this.applySocialConsequence = applySocialConsequence
    this.socialAvailability = socialAvailability
    this.settlementRatInfestation = settlementRatInfestation
    this.transferAnimalOwnership = transferAnimalOwnership
    this.canReserveHorseReward = canReserveHorseReward
    for (const def of defs) this.states.set(def.id, { state: 'not_offered', stageIndex: 0 })
    if (initial) {
      for (const entry of initial.progress) {
        if (!this.states.has(entry.id)) continue
        const def = this.defs.find((d) => d.id === entry.id)
        const restored = def ? normalizeRestoredProgress(def, entry) : entry
        // `animalTargets` is never persisted (see its field comment), so an
        // `active` animal-bound quest needs to either rebind or be flagged as
        // unrecoverable on restore. Wild fauna's `animalId`/dead-alive state
        // isn't persisted either, so a naive rebind could silently retarget a
        // different individual — only livestock's deterministic spawn makes
        // rebinding trustworthy (plan 110).
        const stage = restored.state === 'active' ? def?.stages[restored.stageIndex] : undefined
        const objective = stage?.objective
        if (def && (objective?.type === 'kill_target_animal' || objective?.type === 'find_animal')) {
          if (!LIVESTOCK_KINDS.has(objective.kind)) {
            this.states.set(entry.id, { state: 'invalidated', stageIndex: restored.stageIndex })
            continue
          }
          this.states.set(entry.id, runtimeProgress(restored))
          this.bindAnimalTargetIfNeeded(def, restored.stageIndex)
          continue
        }
        this.states.set(entry.id, runtimeProgress(restored))
      }
      for (const [name, value] of Object.entries(initial.relations)) this.relations.set(name, value)
    }
  }

  /** Drops all progress/relations back to a fresh-start state — used on
   *  "New Game" so a new save doesn't inherit the previous playthrough's quest
   *  state (the instance itself is kept, since callers hold a `const` ref). */
  reset(): void {
    for (const def of this.defs) this.setQuestState(def.id, { state: 'not_offered', stageIndex: 0 })
    this.relations.clear()
    this.animalTargets.clear()
  }

  private stateOf(id: string): QuestRuntimeProgress {
    return this.states.get(id) ?? { state: 'not_offered', stageIndex: 0 }
  }

  private setQuestState(id: string, value: QuestRuntimeProgress): void {
    this.states.set(id, value)
    this.dirty = true
  }

  /** True when quest state changed since the last `clearDirty()` — callers
   *  should recompute anything derived from `labelMarker`/`spawnerMarker`. */
  isDirty(): boolean {
    return this.dirty
  }

  clearDirty(): void {
    this.dirty = false
  }

  private currentStage(def: QuestDef, stageIndex: number): QuestStage | undefined {
    return def.stages[stageIndex]
  }

  /** Interact-range override for an active `spot_animal` stage targeting
   *  `kind`, if any (plan 153) — lets a skittish species' quest objective be
   *  reachable without touching the global `INTERACT_RANGE`/`GAZE_RANGE` or
   *  the animal's own AI. `null` when nothing active needs a wider range. */
  activeSpotAnimalRange(kind: AnimalKind): number | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const objective = this.currentStage(def, s.stageIndex)?.objective
      if (objective?.type === 'spot_animal' && objective.kind === kind && objective.range) {
        return objective.range
      }
    }
    return null
  }

  getState(id: string): QuestState {
    return this.stateOf(id).state
  }

  /** Sympathy score for an NPC by name, bumped on quest completion. Defaults to 0. */
  getRelation(npcName: string): number {
    return this.relations.get(npcName) ?? 0
  }

  /** Coarse relation tier for an NPC by name — see `RelationLevel`. */
  getRelationLevel(npcName: string): RelationLevel {
    return relationToLevel(this.getRelation(npcName))
  }

  /** How well-known/liked the player is across every NPC met so far, derived
   *  from the existing per-NPC `relations` — not a separate reputation store
   *  (plan 117). `0..1`, normalized against `trusted`'s threshold; `0` before
   *  any relation exists. */
  getPlayerStanding(): number {
    if (this.relations.size === 0) return 0
    let sum = 0
    for (const value of this.relations.values()) sum += value
    const average = sum / this.relations.size
    return Math.min(1, Math.max(0, average / RELATION_LEVEL_THRESHOLDS.trusted))
  }

  /** Whether every authored `availability` prerequisite on `def` is
   *  currently satisfied. Absent availability = always available. */
  private meetsAvailability(def: QuestDef): boolean {
    if (def.horseRewardAnimalId && !this.canReserveHorseReward(def.horseRewardAnimalId)) return false
    const prerequisites = def.availability?.prerequisites
    if (!prerequisites?.length) return true
    return prerequisites.every((prereq) => this.meetsPrerequisite(def, prereq))
  }

  /** True while a horse-reward quest has reserved its target (plan
   *  quests-progression-012). */
  isHorseRewardReserving(animalId: string): boolean {
    for (const def of this.defs) {
      if (def.horseRewardAnimalId !== animalId) continue
      const s = this.stateOf(def.id)
      if (s.state === 'active' || s.state === 'ready_to_report') return true
    }
    return false
  }

  /** Terminal failure when a reserved horse-reward target dies (plan
   *  quests-progression-012). */
  onHorseRewardTargetDied(animalId: string): void {
    for (const def of this.defs) {
      if (def.horseRewardAnimalId !== animalId) continue
      const s = this.stateOf(def.id)
      if (s.state !== 'active' && s.state !== 'ready_to_report') continue
      const failed = uniqueOutcomeForState(def, 'failed')
      if (failed) this.applyOutcome(def, failed.id)
    }
  }

  private meetsPrerequisite(def: QuestDef, prereq: QuestPrerequisite): boolean {
    switch (prereq.type) {
      case 'quest_outcome': {
        const resolvedOutcomeId = this.stateOf(prereq.questId).resolvedOutcomeId
        if (!resolvedOutcomeId) return false
        return prereq.outcomeIds.includes(resolvedOutcomeId)
      }
      case 'relation':
        return relationLevelMeetsMinimum(this.getRelationLevel(prereq.npcName), prereq.minimum)
      case 'renown':
        if (!def.settlementId) return false
        return this.socialAvailability.getRenown(def.settlementId) >= prereq.minimum
      case 'reputation':
        if (!def.settlementId) return false
        return this.socialAvailability.getReputationDimension(def.settlementId, prereq.dimension) >= prereq.minimum
    }
  }

  /** Whether `id`'s authored prerequisites are currently satisfied —
   *  independent of lifecycle state (a quest past `not_offered` may still
   *  return false here after relation/reputation drops). */
  isQuestAvailable(id: string): boolean {
    const def = this.defs.find((d) => d.id === id)
    if (!def) return false
    return this.meetsAvailability(def)
  }

  private objectiveDescription(stage: QuestStage): string {
    if (stage.objective.type === 'gather_item') {
      const { kind, count } = stage.objective
      const have = Math.min(this.inventory.count(kind), count)
      return `${stage.description} (masz ${have}/${count})`
    }
    return stage.description
  }

  /** Omits `not_offered` quests whose availability gate isn't met yet — an
   *  unmet-availability quest stays fully hidden rather than shown as locked
   *  (plan 093 Etap C's default; a future milestone may add an explicit
   *  "locked" surface for quests the design wants to hint at). */
  list(): QuestListEntry[] {
    return this.defs
      .filter((def) => this.stateOf(def.id).state !== 'not_offered' || this.meetsAvailability(def))
      .map((def) => {
        const s = this.stateOf(def.id)
        const stage = this.currentStage(def, s.stageIndex)
        const resolved = resolvedOutcome(def, s)
        const terminal = s.state === 'complete' || s.state === 'failed' || s.state === 'invalidated'
        return {
          id: def.id,
          title: def.title,
          description: def.description,
          giverName: def.giverName,
          state: s.state,
          stageIndex: s.stageIndex,
          totalStages: def.stages.length,
          currentObjective: s.state === 'active' && stage ? this.objectiveDescription(stage) : null,
          resolvedOutcomeId: s.resolvedOutcomeId,
          resultText: resultPresentation(def, s, resolved, stage),
          promisedReward: terminal ? null : promisedShownReward(def),
        }
      })
  }

  /** Polls live world state for active `resolve_storage_rat_infestation`
   *  objectives — call after rat deaths, storage repair, or nest destruction
   *  (plan quests-progression-006 / quests-progression-013). Does not re-poll
   *  already-completed quests on restore. */
  pollSettlementRatInfestationObjectives(): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const stage = this.currentStage(def, s.stageIndex)
      if (stage?.objective.type !== 'resolve_storage_rat_infestation') continue
      if (!def.settlementId) continue
      const snapshot = this.settlementRatInfestation.getSnapshot(def.settlementId)
      if (isSettlementRatInfestationResolved(snapshot)) this.advanceStage(def, s)
    }
  }

  private handleStorageRatInfestationGiver(
    def: QuestDef,
    s: QuestRuntimeProgress,
    stage: QuestStage,
  ): QuestDialogOverride {
    if (!def.settlementId) return { line: stage.reminderLine }
    const snapshot = this.settlementRatInfestation.getSnapshot(def.settlementId)
    const line = settlementRatInfestationReminderLine(snapshot)
    if (isSettlementRatInfestationResolved(snapshot)) {
      this.advanceStage(def, s)
      const updated = this.stateOf(def.id)
      if (updated.state === 'ready_to_report') {
        const reportLine = this.resolveSuccessfulTurnIn(def)
        return reportLine ? { line: reportLine } : { line }
      }
    }
    return { line }
  }

  private bumpRelation(npcName: string, amount: number): void {
    this.relations.set(npcName, this.getRelation(npcName) + amount)
  }

  /** Plays a "thank you" clip matching the giver's gender, or a random one if
   *  the name falls outside the placeholder NPC pool. */
  private playQuestCompleteSound(giverName: string): void {
    const gender = genderForName(giverName) ?? (Math.random() < 0.5 ? 'male' : 'female')
    const pool = NPC_QUEST_COMPLETE_SOUND_URLS[gender]
    const url = pool[Math.floor(Math.random() * pool.length)]
    if (url) this.playSound(url, QUEST_COMPLETE_SOUND_VOLUME)
  }

  /** Plan 199 — invalidates or rebinds any `active` wild-fauna
   *  `kill_target_animal`/`find_animal` quest after a same-session
   *  `WorldBundle` rebuild. Fauna is fully disposed and recreated on rebuild
   *  with each kind's id counter restarting from 0 (`createFauna.ts`), so a
   *  stale `animalTargets` entry risks silently binding to an unrelated new
   *  animal that happens to reuse the same id string — the same "Animal A
   *  dies → Animal B spawns → quest must not silently target B" invariant
   *  this plan requires, just reached via a rebuild instead of a death.
   *  Mirrors the constructor's save/load-restore handling of the identical
   *  case above; livestock stays exempt (deterministically re-derivable via
   *  `homePlaceId`, see `AnimalTargetResolver`) and is rebound instead of
   *  invalidated. Caller: `rebuildWorld()` only when it *doesn't* already
   *  call `reset()` (a genuinely new seed clears `animalTargets` anyway). */
  invalidateStaleAnimalTargets(): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active' || !this.animalTargets.has(def.id)) continue
      const objective = this.currentStage(def, s.stageIndex)?.objective
      if (objective?.type !== 'kill_target_animal' && objective?.type !== 'find_animal') continue
      this.animalTargets.delete(def.id)
      if (!LIVESTOCK_KINDS.has(objective.kind)) {
        this.setQuestState(def.id, { state: 'invalidated', stageIndex: s.stageIndex })
        continue
      }
      this.bindAnimalTargetIfNeeded(def, s.stageIndex)
    }
  }

  /** Binds `stageIndex`'s objective to one concrete `animalId` if it's a
   *  `kill_target_animal`/`find_animal` stage and isn't bound yet — a no-op
   *  otherwise (including when `resolveAnimalTarget` has no live candidate
   *  right now; it's retried the next time this is called for the same
   *  quest, since `animalTargets` only gets an entry once resolution
   *  succeeds). */
  private bindAnimalTargetIfNeeded(def: QuestDef, stageIndex: number): void {
    if (this.animalTargets.has(def.id)) return
    const objective = this.currentStage(def, stageIndex)?.objective
    if (objective?.type !== 'kill_target_animal' && objective?.type !== 'find_animal') return
    const animalId = this.resolveAnimalTarget(objective.kind)
    if (animalId) {
      this.animalTargets.set(def.id, animalId)
      if (objective.type === 'kill_target_animal' && objective.dangerous) this.applyDangerousTrait(animalId)
    }
  }

  /** Terminal resolution. Callers pick the outcome; this never scans for a
   *  "best" result. Returns false when the quest or outcome is unknown, or
   *  the quest is already terminal (`complete`/`failed`/`invalidated`). */
  resolveQuest(questId: string, outcomeId: QuestOutcomeId): boolean {
    const def = this.defs.find((d) => d.id === questId)
    if (!def) return false
    return this.applyOutcome(def, outcomeId) !== null
  }

  /** Applies `outcomeId` exactly once: terminal state, reward, consequences.
   *  Presentation (spoken line / complete sound) is the caller's job except
   *  the existing successful-turn-in thank-you clip. */
  private applyOutcome(def: QuestDef, outcomeId: QuestOutcomeId): QuestOutcome | null {
    const current = this.stateOf(def.id)
    if (current.state === 'complete' || current.state === 'failed' || current.state === 'invalidated') return null
    const outcome = def.outcomes.find((entry) => entry.id === outcomeId)
    if (!outcome) return null

    if (outcome.state === 'complete' && def.horseRewardAnimalId) {
      if (!this.transferAnimalOwnership(def.horseRewardAnimalId)) {
        const failed = uniqueOutcomeForState(def, 'failed')
        return failed ? this.applyOutcome(def, failed.id) : null
      }
    }

    const stageIndex = outcome.state === 'complete' ? def.stages.length : current.stageIndex
    this.setQuestState(def.id, { state: outcome.state, stageIndex, resolvedOutcomeId: outcome.id })
    this.animalTargets.delete(def.id)

    if (outcome.reward?.items) {
      for (const item of outcome.reward.items) this.grantItem(item.kind, item.count)
    }
    if (outcome.consequences?.relations) {
      for (const rel of outcome.consequences.relations) this.bumpRelation(rel.npcName, rel.delta)
    }
    if (def.settlementId && outcome.consequences?.social) {
      this.applySocialConsequence({ settlementId: def.settlementId, ...outcome.consequences.social })
    }
    if (outcome.state === 'complete') this.playQuestCompleteSound(def.giverName)
    return outcome
  }

  private resolveSuccessfulTurnIn(def: QuestDef): string | null {
    const outcome = uniqueOutcomeForState(def, 'complete')
    if (!outcome) return null
    if (!this.applyOutcome(def, outcome.id)) return null
    return def.reportLine
  }

  private resolveFailedFind(def: QuestDef, stage: QuestStage | undefined): string | null {
    const outcome = uniqueOutcomeForState(def, 'failed')
    if (!outcome) return null
    if (!this.applyOutcome(def, outcome.id)) return null
    return outcome.resultText ?? stage?.failLine ?? QUEST_FAILED_FALLBACK_LINE
  }

  /** Advances past the current stage — to the next stage if any remain, or to
   *  `ready_to_report` once the last one clears. Does not resolve the quest. */
  private advanceStage(def: QuestDef, s: QuestRuntimeProgress): void {
    const nextIndex = s.stageIndex + 1
    const nextState = nextIndex >= def.stages.length ? 'ready_to_report' : 'active'
    this.setQuestState(def.id, { state: nextState, stageIndex: nextIndex })
    if (nextState === 'active') this.bindAnimalTargetIfNeeded(def, nextIndex)
  }

  private handleGiverInteract(
    def: QuestDef,
    s: QuestRuntimeProgress,
  ): QuestDialogOverride | null {
    if (s.state === 'not_offered') {
      if (!this.meetsAvailability(def)) return null
      this.setQuestState(def.id, { state: 'offered', stageIndex: 0 })
    }
    const current = this.stateOf(def.id)
    if (current.state === 'offered') {
      return {
        line: def.offerLine,
        offer: {
          onAccept: () => {
            if (def.horseRewardAnimalId && !this.canReserveHorseReward(def.horseRewardAnimalId)) return
            this.setQuestState(def.id, { state: 'active', stageIndex: 0 })
            this.bindAnimalTargetIfNeeded(def, 0)
          },
          onDecline: () => this.setQuestState(def.id, { state: 'not_offered', stageIndex: 0 }),
        },
      }
    }
    if (s.state === 'active') {
      const stage = this.currentStage(def, s.stageIndex)
      if (!stage) return null
      if (stage.objective.type === 'resolve_storage_rat_infestation') {
        return this.handleStorageRatInfestationGiver(def, s, stage)
      }
      if (stage.objective.type === 'gather_item') {
        const { kind, count } = stage.objective
        const isFinalStage = s.stageIndex >= def.stages.length - 1
        if (isFinalStage) {
          const outcome = uniqueOutcomeForState(def, 'complete')
          if (!outcome) return { line: stage.reminderLine }
          if (!this.inventory.has(kind, count)) return { line: stage.reminderLine }
          if (!this.inventory.remove(kind, count)) return { line: stage.reminderLine }
          const applied = this.applyOutcome(def, outcome.id)
          return applied ? { line: def.reportLine } : { line: stage.reminderLine }
        }
        if (!this.inventory.has(kind, count)) return { line: stage.reminderLine }
        if (!this.inventory.remove(kind, count)) return { line: stage.reminderLine }
        this.advanceStage(def, s)
        const updated = this.stateOf(def.id)
        return { line: this.currentStage(def, updated.stageIndex)?.reminderLine ?? def.reportLine }
      }
      return { line: stage.reminderLine }
    }
    if (s.state === 'ready_to_report') {
      const line = this.resolveSuccessfulTurnIn(def)
      return line ? { line } : null
    }
    return null
  }

  /**
   * Active `talk_to_npc_choice`: talking to a matching NPC selects that
   * choice's outcome and resolves through `applyOutcome`. Must run before
   * giver reminder handling because the giver may also be a choice target
   * (plan quests-progression-005).
   *
   * @domain quests-progression
   */
  private resolveTalkToNpcChoice(def: QuestDef, npcName: string): QuestDialogOverride | null {
    const s = this.stateOf(def.id)
    if (s.state !== 'active') return null
    const stage = this.currentStage(def, s.stageIndex)
    const choice = matchingTalkChoice(stage?.objective, npcName)
    if (!choice) return null
    if (!def.outcomes.some((outcome) => outcome.id === choice.outcomeId)) return null
    const applied = this.applyOutcome(def, choice.outcomeId)
    if (!applied) return null
    return { line: applied.resultText ?? def.reportLine }
  }

  /** Quest-driven line/offer for talking to `npcName` right now, or null if
   *  this NPC has nothing quest-related to say (caller falls back to normal
   *  dialogue). `completedFallback` (plan 153) — an already-turned-in
   *  quest's `reportLine`, used only if nothing else this giver offers
   *  (a new quest, a reminder, a report) takes priority; a giver of several
   *  quests (Anna, Piotr) must still offer their next quest normally once
   *  it becomes available, not get stuck repeating an old completion line. */
  onInteract(npcName: string): QuestDialogOverride | null {
    let completedFallback: QuestDialogOverride | null = null
    for (const def of this.defs) {
      const s = this.stateOf(def.id)

      const choiceResult = this.resolveTalkToNpcChoice(def, npcName)
      if (choiceResult) return choiceResult

      if (npcName === def.giverName) {
        const result = this.handleGiverInteract(def, s)
        if (result) return result
        if (s.state === 'complete' && !completedFallback) {
          completedFallback = { line: def.reportLine }
        }
      }

      if (s.state === 'active' && npcName !== def.giverName) {
        const stage = this.currentStage(def, s.stageIndex)
        if (stage?.objective.type === 'talk_to_npc' && stage.objective.npcName === npcName) {
          this.advanceStage(def, s)
          return { line: stage.progressLine ?? stage.description }
        }
      }
    }
    return completedFallback
  }

  /** Quest-driven line for interacting with a non-NPC world object (well/tree/
   *  spawner/live animal) matching `ref`, or null if no active quest cares. */
  onInteractObjective(ref: ObjectiveRef): QuestDialogOverride | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue

      const stage = this.currentStage(def, s.stageIndex)
      if (!stage) continue

      this.bindAnimalTargetIfNeeded(def, s.stageIndex)

      const boundAnimalId = this.animalTargets.get(def.id)
      // `find_animal`'s bound target dying is failure, not progress — unlike
      // `kill_target_animal`, where the same `animal_died` ref means success
      // (handled below via `objectiveMatchesRef`).
      if (ref.type === 'animal_died' && stage.objective.type === 'find_animal' && boundAnimalId === ref.animalId) {
        const line = this.resolveFailedFind(def, stage)
        return line ? { line } : null
      }
      if (!objectiveMatchesRef(stage.objective, ref, boundAnimalId)) continue
      this.advanceStage(def, s)
      return { line: stage.progressLine ?? stage.description }
    }
    return null
  }

  /** Label suffix for `npcName`, or null when no quest wants to flag them.
   *  Three visually distinct giver states (plan 153) — available/in-progress
   *  used to share `'!'`, making a quest already accepted indistinguishable
   *  from one not yet offered at a glance. */
  labelMarker(npcName: string): string | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state === 'active') {
        const stage = this.currentStage(def, s.stageIndex)
        if (matchingTalkChoice(stage?.objective, npcName)) return QUEST_MARKER_TALK_TARGET
      }
      if (npcName === def.giverName) {
        if (s.state === 'ready_to_report') return QUEST_MARKER_READY
        if (s.state === 'active') return QUEST_MARKER_IN_PROGRESS
        if (s.state === 'offered') return QUEST_MARKER_AVAILABLE
        if (s.state === 'not_offered' && this.meetsAvailability(def)) return QUEST_MARKER_AVAILABLE
      }
      if (s.state === 'active') {
        const stage = this.currentStage(def, s.stageIndex)
        if (stage?.objective.type === 'talk_to_npc' && stage.objective.npcName === npcName) return QUEST_MARKER_TALK_TARGET
      }
    }
    return null
  }

  /** Label suffix for a fauna spawner type, or null when no active quest's
   *  current stage targets it. */
  spawnerMarker(spawnerType: SpawnerType): string | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const stage = this.currentStage(def, s.stageIndex)
      if (stage?.objective.type === 'interact_spawner' && stage.objective.spawnerType === spawnerType) {
        return '?'
      }
    }
    return null
  }

  exportProgress(): QuestProgressEntry[] {
    return this.defs.map((def) => {
      const s = this.stateOf(def.id)
      const entry: QuestProgressEntry = { id: def.id, state: s.state, stageIndex: s.stageIndex }
      if ((s.state === 'complete' || s.state === 'failed') && s.resolvedOutcomeId) {
        entry.resolvedOutcomeId = s.resolvedOutcomeId
      }
      return entry
    })
  }

  exportRelations(): Record<string, number> {
    return Object.fromEntries(this.relations)
  }
}

function runtimeProgress(entry: QuestProgressEntry): QuestRuntimeProgress {
  const progress: QuestRuntimeProgress = { state: entry.state, stageIndex: entry.stageIndex }
  if ((entry.state === 'complete' || entry.state === 'failed') && entry.resolvedOutcomeId) {
    progress.resolvedOutcomeId = entry.resolvedOutcomeId
  }
  return progress
}

/** Legacy terminal entries without an outcome id take the unique matching
 *  authored outcome; 0 or >1 matches are left unresolved. */
function normalizeRestoredProgress(def: QuestDef, entry: QuestProgressEntry): QuestProgressEntry {
  if (entry.state !== 'complete' && entry.state !== 'failed') {
    return { id: entry.id, state: entry.state, stageIndex: entry.stageIndex }
  }
  if (entry.resolvedOutcomeId) {
    return {
      id: entry.id,
      state: entry.state,
      stageIndex: entry.stageIndex,
      resolvedOutcomeId: entry.resolvedOutcomeId,
    }
  }
  const outcome = uniqueOutcomeForState(def, entry.state)
  if (!outcome) return { id: entry.id, state: entry.state, stageIndex: entry.stageIndex }
  return { id: entry.id, state: entry.state, stageIndex: entry.stageIndex, resolvedOutcomeId: outcome.id }
}

function resolvedOutcome(def: QuestDef, progress: QuestRuntimeProgress): QuestOutcome | undefined {
  if (!progress.resolvedOutcomeId) return undefined
  return def.outcomes.find((outcome) => outcome.id === progress.resolvedOutcomeId)
}

function resultPresentation(
  def: QuestDef,
  progress: QuestRuntimeProgress,
  outcome: QuestOutcome | undefined,
  stage: QuestStage | undefined,
): string | undefined {
  if (outcome?.resultText) return outcome.resultText
  if (progress.state === 'complete') return def.reportLine
  if (progress.state === 'failed') return stage?.failLine
  return undefined
}

function sameShownReward(a: QuestReward | undefined, b: QuestReward): boolean {
  if (!a || a.visibility !== 'shown' || b.visibility !== 'shown') return false
  const aItems = a.items ?? []
  const bItems = b.items ?? []
  if (aItems.length !== bItems.length) return false
  return aItems.every((item, i) => item.kind === bItems[i]?.kind && item.count === bItems[i]?.count)
}

function promisedShownReward(def: QuestDef): QuestPromisedReward | null {
  const complete = def.outcomes.filter((outcome) => outcome.state === 'complete')
  if (complete.length === 0) return null
  const first = complete[0]?.reward
  if (!first || first.visibility !== 'shown') return null
  for (const outcome of complete.slice(1)) {
    if (!sameShownReward(outcome.reward, first)) return null
  }
  return { items: first.items ?? [] }
}
