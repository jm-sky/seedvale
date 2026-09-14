import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnerType } from '../fauna/AnimalSpawner'
import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { ReputationDimension, SocialConsequence } from '../reputation/ReputationManager'
import type { NpcId } from '../settlement/npcState'
import type {
  LostLivestockSourceLookup,
  WorldQuestSourceLookup,
  WorldQuestSourceStatus,
} from './opportunities/worldQuestOpportunityTypes'
import { genderForName } from '../ai/NpcAgent'
import { NPC_QUEST_COMPLETE_SOUND_URLS } from '../ai/npcVoiceLines'
import { LIVESTOCK_KINDS } from '../settlement/livestock'
import { isWithinEveningOfferWindow } from './guardEveningOfferWindow'
import {
  LOST_LIVESTOCK_DEAD_OUTCOME,
  LOST_LIVESTOCK_LIVE_OUTCOME,
  LOST_LIVESTOCK_UNAVAILABLE_OUTCOME,
  parseLostLivestockQuestId,
} from './opportunities/settlementQuestOpportunities'
import {
  externalResolutionOutcome,
  hasSocialConsequence,
  isLegacySingleObjectiveStage,
  LEGACY_QUEST_OBJECTIVE_SLOT_ID,
  matchStageTransition,
  objectiveNeedsPersistedSlotProgress,
  type QuestConsequences,
  type QuestDef,
  type QuestObjective,
  type QuestOfferRankSignal,
  type QuestOutcome,
  type QuestOutcomeId,
  type QuestPrerequisite,
  type QuestProgressEntry,
  type QuestReward,
  type QuestStage,
  type QuestStageEffect,
  questStageMode,
  type QuestStageObjectiveSlot,
  questStageObjectiveSlots,
  type QuestStageSlotProgress,
  type QuestState,
  rankQuestOfferCandidates,
  RELATION_LEVEL_THRESHOLDS,
  type RelationLevel,
  relationLevelMeetsMinimum,
  relationToLevel,
  uniqueOutcomeForState,
  validateQuestDefinitions,
} from './quests'
import {
  evaluateSettlementLightsObjective,
  type SettlementLightLookup,
} from './settlementLightLookup'
import {
  isSettlementRatInfestationResolved,
  settlementRatInfestationReminderLine,
  type SettlementRatInfestationSnapshot,
} from './settlementRatInfestation'

/** `labelMarker`'s glyphs (plan 153) — distinct per state, not color-only,
 *  so a floating NPC label reads correctly even without the CSS color that
 *  usually accompanies it. `TALK_TARGET` is a required dialogue target: an
 *  active `talk_to_npc` / `talk_to_npc_choice` NPC, or an NPC named by an
 *  active stage `dialogueActions` entry. Matching is by stable NPC id, not
 *  display name. Required dialogue targets outrank giver in-progress. */
export const QUEST_MARKER_AVAILABLE = '!'
export const QUEST_MARKER_IN_PROGRESS = '…'
export const QUEST_MARKER_READY = '✓'
export const QUEST_MARKER_TALK_TARGET = '?'

export type QuestDialogAction = {
  /** Player-facing line shown as the selectable dialogue action. */
  label: string
  /** Re-reads live quest state, then advances or resolves. Returns the NPC reply. */
  onSelect: () => string
  /**
   * Multi-quest aggregation keeps this action inside the quest's
   * `QuestDialogTopic` instead of flattening it next to other quests'
   * speech. Single-quest dialogue still shows it directly. Owned by
   * `QuestManager` — Vue only renders `label`/`onSelect`.
   *
   * @domain quests-progression
   */
  topicScoped?: boolean
}

/**
 * One selectable quest/topic entry when an NPC has more than one concurrent
 * quest context (plan quests-progression-020) — presentation-neutral: it is
 * never a `QuestDialogAction` (a conscious authored player line that can
 * mutate quest state) but purely "which quest am I talking about". UI shows
 * `label` (always `QuestDef.title`, never a questId) and calls `resolve()`
 * only on selection, re-reading live quest state rather than a value frozen
 * at menu-open time.
 */
export type QuestDialogTopic = {
  label: string
  resolve: () => QuestDialogOverride
}

/**
 * Quest-driven NPC dialogue payload. UI displays `line` / `offer` / `actions`
 * / `topics` and invokes callbacks; it must not interpret quest ids, stages
 * or outcomes.
 *
 * @domain quests-progression
 */
export type QuestDialogOverride = {
  line: string
  /** Present only when the dialog should present an accept/decline choice.
   *  `onDecline` is absent for a `QuestOfferPolicy.exposure: 'story'` offer
   *  (plan quests-progression-033) — the dialog then shows accept only, and
   *  closing/backing out of it leaves the offer standing rather than
   *  suppressing it. */
  offer?: {
    onAccept: () => void
    onDecline?: () => void
  }
  /** Conscious player speech for report / talk_to_npc / talk_to_npc_choice /
   *  stage dialogue actions / gather hand-in. Always shown directly — never
   *  hidden behind `topics` — since these are actionable right now. */
  actions?: readonly QuestDialogAction[]
  /** Other quest contexts this NPC currently has for the player, presented
   *  as a pure navigation layer alongside `offer`/`actions` (plan
   *  quests-progression-020) — e.g. a second not-yet-accepted offer, or a
   *  second active quest with only an informational reminder. Absent when
   *  this NPC has at most one quest context right now. */
  topics?: readonly QuestDialogTopic[]
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
  giverNpcId: NpcId
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
  /** Stage-local counted objective progress (plan quests-progression-020). */
  stageCount?: number
  /** Per-slot progress for the current multi-objective stage (plan quests-progression-032). */
  stageSlotProgress?: Record<string, QuestStageSlotProgress>
  /** Decline cooldown — see `QuestProgressEntry.offerSuppressedUntilDay`
   *  (plan quests-progression-033). */
  offerSuppressedUntilDay?: number
}

/** Player-only harvest report (plan quests-progression-020). */
export type PlayerAnimalHarvestContext = {
  animalId: string
  animalKind: AnimalKind
  lootKinds: readonly ItemKind[]
}

/** Successful loose-food consumption report (plan quests-progression-020). */
export type HabitatAnimalFeedContext = {
  animalId: string
  animalKind: AnimalKind
  spawnPointId?: string
  itemKind: ItemKind
}

function isCountedObjective(objective: QuestObjective | undefined): boolean {
  return objective?.type === 'harvest_animals' || objective?.type === 'feed_habitat_animals'
}

function animalTargetKey(questId: string, stageIndex: number, slotId: string): string {
  return `${questId}\n${stageIndex}\n${slotId}`
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
  | { type: 'interact_spawner', spawnerType: SpawnerType, spawnerId: string }
  | { type: 'spot_animal', kind: AnimalKind }
  | { type: 'animal_died', animalId: string, kind?: AnimalKind }
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

/** Read-only world clock for quest availability (plan quests-progression-021). */
export type QuestWorldTimeLookup = {
  getWorldSeed(): number
  getTimeOfDay(): number
  getElapsedDays(): number
}

/** Read-only settlement rat-infestation world snapshot for
 *  `resolve_storage_rat_infestation` (plan quests-progression-013). */
export type SettlementRatInfestationLookup = {
  getSnapshot: (settlementId: string) => SettlementRatInfestationSnapshot
}

const NO_SETTLEMENT_RAT_INFESTATION: SettlementRatInfestationLookup = {
  getSnapshot: () => ({ storageDamaged: false, nestDestroyed: true, aliveRatCount: 0 }),
}

/** Read-only spawn-point destruction seam for `destroy_spawn_point` (plan
 *  quests-progression-007). */
export type SpawnPointDestructionLookup = {
  isPermanentlyDestroyed: (spawnerId: string) => boolean
}

const NO_SPAWN_POINT_DESTRUCTION: SpawnPointDestructionLookup = {
  isPermanentlyDestroyed: () => false,
}

/** Read-only world-state seam for map/discovery/loot objectives (plan
 *  quests-progression-009). */
export type QuestWorldProgressLookup = {
  hasReadItem: (itemKind: ItemKind) => boolean
  hasDiscoveredLocation: (locationId: string) => boolean
  isWorldContainerLooted: (containerId: string) => boolean
  hasResolvedHiddenFindSpot: (spotId: string) => boolean
  hasAcquiredPortableContainer: (containerId: string) => boolean
}

const NO_WORLD_PROGRESS: QuestWorldProgressLookup = {
  hasReadItem: () => false,
  hasDiscoveredLocation: () => false,
  isWorldContainerLooted: () => false,
  hasResolvedHiddenFindSpot: () => false,
  hasAcquiredPortableContainer: () => false,
}

export type QuestPhysicalOutcomeContext = {
  requireCarriedContainerId?: string
  requireCarriedUnopened?: boolean
  requireItemInstanceId?: string
}

export type QuestPhysicalOutcomeResolver = {
  canResolve: (questId: string, outcomeId: QuestOutcomeId, context: QuestPhysicalOutcomeContext) => boolean
  onResolve: (questId: string, outcomeId: QuestOutcomeId) => void
}

const NO_PHYSICAL_OUTCOME: QuestPhysicalOutcomeResolver = {
  canResolve: () => false,
  onResolve: () => {},
}

export type QuestLifecycleHooks = {
  onStageAdvanced?: (questId: string, clearedStageIndex: number) => void
  /**
   * Fired once when a `find_animal` / `kill_target_animal` target is newly
   * bound. Authored narrative may start a real domain incident here (plan
   * quests-progression-030); generated world-driven quests must not.
   */
  onAnimalTargetBound?: (questId: string, animalId: string) => void
  revealLocation?: import('./quests').QuestLocationReveal
  /** Player → NPC exact-instance hand-in (plan quests-progression-029). */
  transferItemInstance?: (instanceId: string, npcId: NpcId) => boolean
  /** Consume the matching carried container (plan quests-progression-029). */
  discardCarriedContainer?: (containerId: string) => boolean
}

const NO_WORLD_QUEST_SOURCE: WorldQuestSourceLookup = {
  getStatus: () => 'untracked',
}

const NO_LOST_LIVESTOCK_SOURCE: LostLivestockSourceLookup = {
  getSnapshot: () => 'untracked',
}

export type { WorldQuestSourceLookup, WorldQuestSourceStatus }

const NO_SOCIAL_AVAILABILITY: QuestSocialAvailabilityLookup = {
  getReputationDimension: () => 0,
  getRenown: () => 0,
}

const NO_WORLD_TIME: QuestWorldTimeLookup = {
  getWorldSeed: () => 0,
  getTimeOfDay: () => 0,
  getElapsedDays: () => 0,
}

const NO_SETTLEMENT_LIGHT: SettlementLightLookup = {
  getSnapshot: () => ({ torchLit: {}, campfireLit: false, status: 'unavailable' }),
}

/** Same headroom as NPC reaction clips (NpcAgent.ts) — a one-shot "thank you", not a focal cue. */
const QUEST_COMPLETE_SOUND_VOLUME = 0.35
/** Used when a failed stage has no `failLine` of its own. */
const QUEST_FAILED_FALLBACK_LINE = 'To się już nie uda.'
/** Shown for an `abandoned` entry in the quest log when no other result text applies. */
const QUEST_ABANDONED_RESULT_TEXT = 'Zrezygnowałeś z tego zadania.'
/** Generic player line offered on an abandonable `active` giver quest (plan
 *  quests-progression-033) — see `QuestOfferPolicy`'s sibling,
 *  `QuestAbandonment`. */
const QUEST_ABANDON_PLAYER_LINE = 'Przykro mi, jednak nie dam rady ci pomóc.'
const QUEST_ABANDON_NPC_REPLY = 'Szkoda, ale rozumiem. Może innym razem.'
/** How long a declined offer stays suppressed before it can re-enter
 *  candidate discovery (plan quests-progression-033) — reuses
 *  `QuestWorldTimeLookup.getElapsedDays()` rather than a cooldown manager. */
const OFFER_DECLINE_SUPPRESSION_DAYS = 1
/** Derived ordinary giver capacity (plan quests-progression-034) — not persisted. */
const MAX_ORDINARY_ACTIVE_GIVER_QUESTS = 2
const DEFAULT_TALK_PLAYER_LINE = 'Chciałem ci coś powiedzieć.'
const DEFAULT_REPORT_PLAYER_LINE = 'Zdaję relację z zadania.'
const DEFAULT_REPORT_PROMPT = 'No i jak? Udało się?'
const DEFAULT_GATHER_PLAYER_LINE = 'Przyniosłem to, o co prosiłeś.'
const DEFAULT_NPC_PROMPT = 'Tak?'

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
      return objective.type === 'interact_spawner'
        && objective.spawnerType === ref.spawnerType
        && (objective.spawnerId == null || objective.spawnerId === ref.spawnerId)
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
  npcId: NpcId,
): { npc: { npcId: NpcId }, outcomeId: QuestOutcomeId, playerLine: string, npcLine?: string } | undefined {
  if (objective?.type !== 'talk_to_npc_choice') return undefined
  return objective.choices.find((choice) => choice.npc.npcId === npcId)
}

function matchingStageDialogueActions(
  stage: QuestStage | undefined,
  npcId: NpcId,
): readonly NonNullable<QuestStage['dialogueActions']>[number][] {
  return stage?.dialogueActions?.filter((action) => action.npc.npcId === npcId) ?? []
}

function isRequiredDialogueTarget(
  stage: QuestStage | undefined,
  npcId: NpcId,
  unfinishedSlots: readonly QuestStageObjectiveSlot[],
): boolean {
  if (!stage) return false
  for (const slot of unfinishedSlots) {
    if (matchingTalkChoice(slot.objective, npcId)) return true
    if (slot.objective.type === 'talk_to_npc' && slot.objective.npc.npcId === npcId) return true
  }
  return matchingStageDialogueActions(stage, npcId).length > 0
}

/** Drives multi-stage quests. Kept out of `NpcAgent`/world objects so they stay
 *  quest-agnostic — callers pass the resulting line/marker in as data.
 *
 * @domain quests-progression
 * @system quest-manager
 * @role Owns quest progress, objective/stage evaluation and NPC relation levels.
 * @owns QuestProgressEntry
 * @integration Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
 */
export class QuestManager {
  private readonly defs: readonly QuestDef[]
  private readonly inventory: Inventory
  private readonly states = new Map<string, QuestRuntimeProgress>()
  private readonly relations = new Map<string, number>()
  /** `questId` + stage index + slot id → `animalId`, bound when a
   *  `kill_target_animal` / `find_animal` slot becomes active — see
   *  `bindAnimalTargetIfNeeded`. */
  private readonly animalTargets = new Map<string, string>()
  /** Runtime-only feed dedupe per active counted feed stage (plan
   *  quests-progression-020) — not persisted across save/load. */
  private readonly feedContributionIds = new Map<string, Set<string>>()
  private readonly playSound: (url: string, volume?: number) => void
  private readonly grantItem: QuestItemGrant
  private readonly resolveAnimalTarget: AnimalTargetResolver
  private readonly applyDangerousTrait: DangerousTraitApplier
  private readonly applySocialConsequence: ApplySocialConsequence
  private readonly socialAvailability: QuestSocialAvailabilityLookup
  private readonly settlementRatInfestation: SettlementRatInfestationLookup
  private readonly spawnPointDestruction: SpawnPointDestructionLookup
  private readonly worldProgress: QuestWorldProgressLookup
  private readonly worldQuestSource: WorldQuestSourceLookup
  private readonly lostLivestockSource: LostLivestockSourceLookup
  private readonly transferAnimalOwnership: QuestAnimalOwnershipTransfer
  private readonly canReserveHorseReward: HorseRewardAvailability
  private readonly worldTime: QuestWorldTimeLookup
  private readonly settlementLight: SettlementLightLookup
  private readonly physicalOutcome: QuestPhysicalOutcomeResolver
  private readonly lifecycleHooks: QuestLifecycleHooks
  /** Set whenever quest state changes; consumers (gameLoop's marker refresh)
   *  clear it after recomputing labels, so per-frame work is skipped on
   *  frames where nothing quest-related happened. Starts `true` so the first
   *  frame always computes markers. */
  private dirty = true

  constructor(
    defs: readonly QuestDef[],
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
    spawnPointDestruction: SpawnPointDestructionLookup = NO_SPAWN_POINT_DESTRUCTION,
    worldProgress: QuestWorldProgressLookup = NO_WORLD_PROGRESS,
    worldQuestSource: WorldQuestSourceLookup = NO_WORLD_QUEST_SOURCE,
    lostLivestockSource: LostLivestockSourceLookup = NO_LOST_LIVESTOCK_SOURCE,
    worldTime: QuestWorldTimeLookup = NO_WORLD_TIME,
    settlementLight: SettlementLightLookup = NO_SETTLEMENT_LIGHT,
    physicalOutcome: QuestPhysicalOutcomeResolver = NO_PHYSICAL_OUTCOME,
    lifecycleHooks: QuestLifecycleHooks = {},
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
    this.spawnPointDestruction = spawnPointDestruction
    this.worldProgress = worldProgress
    this.worldQuestSource = worldQuestSource
    this.lostLivestockSource = lostLivestockSource
    this.transferAnimalOwnership = transferAnimalOwnership
    this.canReserveHorseReward = canReserveHorseReward
    this.worldTime = worldTime
    this.settlementLight = settlementLight
    this.physicalOutcome = physicalOutcome
    this.lifecycleHooks = lifecycleHooks
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
        const slots = stage ? questStageObjectiveSlots(stage) : []
        const animalSlots = slots.filter((slot) => (
          slot.objective.type === 'kill_target_animal' || slot.objective.type === 'find_animal'
        ))
        if (def && animalSlots.length > 0) {
          const wild = animalSlots.some((slot) => (
            (slot.objective.type === 'kill_target_animal' || slot.objective.type === 'find_animal')
            && !LIVESTOCK_KINDS.has(slot.objective.kind)
          ))
          if (wild) {
            this.states.set(entry.id, { state: 'invalidated', stageIndex: restored.stageIndex })
            continue
          }
          this.states.set(entry.id, runtimeProgress(restored))
          this.bindAnimalTargetIfNeeded(def, restored.stageIndex)
          continue
        }
        this.states.set(entry.id, runtimeProgress(restored))
      }
      for (const [npcId, value] of Object.entries(initial.relations)) this.relations.set(npcId, value)
      for (const def of this.defs) {
        const s = this.stateOf(def.id)
        if (s.state === 'active') this.catchUpActiveWorldObjectives(def, s)
      }
      this.recheckSettlementLightObjectives()
    }
  }

  /** Drops all progress/relations back to a fresh-start state — used on
   *  "New Game" so a new save doesn't inherit the previous playthrough's quest
   *  state (the instance itself is kept, since callers hold a `const` ref). */
  reset(): void {
    for (const def of this.defs) this.setQuestState(def.id, { state: 'not_offered', stageIndex: 0 })
    this.relations.clear()
    this.animalTargets.clear()
    this.feedContributionIds.clear()
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

  /**
   * Inventory can make a `gather_item` hand-in actionable without a quest
   * lifecycle transition. Marks dirty only when an active gather stage
   * exists, so `labelMarker` can refresh `✓` without per-frame work.
   *
   * @domain quests-progression
   */
  notifyInventoryChanged(): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      if (this.unfinishedSlots(def, s).some((slot) => slot.objective.type === 'gather_item')) {
        this.dirty = true
        return
      }
    }
  }

  private currentStage(def: QuestDef, stageIndex: number): QuestStage | undefined {
    return def.stages[stageIndex]
  }

  private unfinishedSlots(def: QuestDef, s: QuestRuntimeProgress): QuestStageObjectiveSlot[] {
    const stage = this.currentStage(def, s.stageIndex)
    if (!stage || s.state !== 'active') return []
    return questStageObjectiveSlots(stage).filter((slot) => !this.isSlotComplete(s, stage, slot))
  }

  private isSlotComplete(
    s: QuestRuntimeProgress,
    stage: QuestStage,
    slot: QuestStageObjectiveSlot,
  ): boolean {
    const progress = s.stageSlotProgress?.[slot.id]
    if (progress?.completed) return true
    if (isCountedObjective(slot.objective) && 'count' in slot.objective) {
      return this.slotCount(s, stage, slot) >= slot.objective.count
    }
    return false
  }

  private slotCount(
    s: QuestRuntimeProgress,
    stage: QuestStage,
    slot: QuestStageObjectiveSlot,
  ): number {
    const fromMap = s.stageSlotProgress?.[slot.id]?.count
    if (fromMap !== undefined) return fromMap
    if (isLegacySingleObjectiveStage(stage) && slot.id === LEGACY_QUEST_OBJECTIVE_SLOT_ID) {
      return s.stageCount ?? 0
    }
    return 0
  }

  private writeSlotProgress(
    def: QuestDef,
    s: QuestRuntimeProgress,
    slotId: string,
    patch: QuestStageSlotProgress,
  ): QuestRuntimeProgress {
    const next: QuestRuntimeProgress = {
      ...s,
      stageSlotProgress: {
        ...s.stageSlotProgress,
        [slotId]: { ...s.stageSlotProgress?.[slotId], ...patch },
      },
    }
    this.setQuestState(def.id, next)
    return this.stateOf(def.id)
  }

  /**
   * Records that one unfinished slot is satisfied, then completes the stage
   * when `any`/`all` rules say so. Ingress/polls report facts here instead of
   * branching themselves (plan quests-progression-032).
   *
   * @domain quests-progression
   */
  private completeObjectiveSlot(
    def: QuestDef,
    s: QuestRuntimeProgress,
    slot: QuestStageObjectiveSlot,
  ): void {
    if (s.state !== 'active') return
    const stage = this.currentStage(def, s.stageIndex)
    if (!stage) return
    if (s.stageSlotProgress?.[slot.id]?.completed) return

    const mode = questStageMode(stage)
    if (mode === 'any' || questStageObjectiveSlots(stage).length <= 1) {
      this.advanceStage(def, s, slot.resultId)
      return
    }

    const updated = this.writeSlotProgress(def, s, slot.id, {
      completed: true,
      ...(isCountedObjective(slot.objective) && 'count' in slot.objective
        ? { count: slot.objective.count }
        : {}),
    })
    const remaining = this.unfinishedSlots(def, updated)
    if (remaining.length === 0) this.advanceStage(def, updated, stage.resultId)
  }

  private clearFeedDedupe(questId: string, stageIndex: number): void {
    const prefix = `${questId}:${stageIndex}`
    this.feedContributionIds.delete(prefix)
    for (const key of [...this.feedContributionIds.keys()]) {
      if (key.startsWith(`${prefix}:`)) this.feedContributionIds.delete(key)
    }
  }

  private clearAnimalTargetsForQuest(questId: string): void {
    const needle = `${questId}\n`
    for (const key of [...this.animalTargets.keys()]) {
      if (key === questId || key.startsWith(needle)) this.animalTargets.delete(key)
    }
  }

  /** Interact-range override for an active `spot_animal` stage targeting
   *  `kind`, if any (plan 153) — lets a skittish species' quest objective be
   *  reachable without touching the global `INTERACT_RANGE`/`GAZE_RANGE` or
   *  the animal's own AI. `null` when nothing active needs a wider range. */
  activeSpotAnimalRange(kind: AnimalKind): number | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      for (const slot of this.unfinishedSlots(def, s)) {
        const objective = slot.objective
        if (objective.type === 'spot_animal' && objective.kind === kind && objective.range) {
          return objective.range
        }
      }
    }
    return null
  }

  getState(id: string): QuestState {
    return this.stateOf(id).state
  }

  /** Sympathy score for an NPC by stable id, bumped on quest completion. Defaults to 0. */
  getRelation(npcId: NpcId): number {
    return this.relations.get(npcId) ?? 0
  }

  /** Coarse relation tier for an NPC by stable id — see `RelationLevel`. */
  getRelationLevel(npcId: NpcId): RelationLevel {
    return relationToLevel(this.getRelation(npcId))
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
   *  currently satisfied. Absent availability = always available.
   *  World-driven quests additionally require a live `present` source. */
  private meetsAvailability(def: QuestDef): boolean {
    if (def.horseRewardAnimalId && !this.canReserveHorseReward(def.horseRewardAnimalId)) return false
    const source = this.worldQuestSource.getStatus(def.id)
    if (source !== 'untracked' && source !== 'present') return false
    const lost = this.lostLivestockSource.getSnapshot(def.id)
    if (lost !== 'untracked' && lost !== 'lost-alive' && lost !== 'corpse-uninspected') return false
    const lostParsed = parseLostLivestockQuestId(def.id)
    if (lostParsed && this.isAnimalClaimedByOtherQuest(def.id, lostParsed.animalId)) return false
    if (this.isAuthoredLivestockFindBlockedByClaimedTarget(def)) return false
    const prerequisites = def.availability?.prerequisites
    if (!prerequisites?.length) return true
    return prerequisites.every((prereq) => this.meetsPrerequisite(def, prereq))
  }

  /**
   * True when another in-flight quest already covers this livestock individual
   * (generated `recover_lost_livestock` or a bound `find_animal` target).
   * Prevents authored + generated double offers for the same stray episode.
   */
  private isAnimalClaimedByOtherQuest(questId: string, animalId: string): boolean {
    for (const other of this.defs) {
      if (other.id === questId) continue
      const state = this.stateOf(other.id).state
      if (state !== 'offered' && state !== 'active' && state !== 'ready_to_report') continue
      for (const [stageIndex, stage] of other.stages.entries()) {
        for (const slot of questStageObjectiveSlots(stage)) {
          if (
            slot.objective.type === 'recover_lost_livestock'
            && slot.objective.animalId === animalId
          ) {
            return true
          }
          if (slot.objective.type !== 'find_animal' && slot.objective.type !== 'kill_target_animal') {
            continue
          }
          const key = animalTargetKey(other.id, stageIndex, slot.id)
          if (this.animalTargets.get(key) === animalId || this.animalTargets.get(other.id) === animalId) {
            return true
          }
        }
      }
    }
    return false
  }

  /**
   * Authored livestock `find_animal` (e.g. zagubiona-owca) stays hidden when
   * the resolver's current pick is already claimed by a generated lost-livestock
   * quest for the same individual.
   */
  private isAuthoredLivestockFindBlockedByClaimedTarget(def: QuestDef): boolean {
    if (parseLostLivestockQuestId(def.id)) return false
    for (const stage of def.stages) {
      for (const slot of questStageObjectiveSlots(stage)) {
        if (slot.objective.type !== 'find_animal') continue
        if (!LIVESTOCK_KINDS.has(slot.objective.kind)) continue
        const predicted = this.resolveAnimalTarget(slot.objective.kind)
        if (predicted && this.isAnimalClaimedByOtherQuest(def.id, predicted)) return true
      }
    }
    return false
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
      case 'evening_offer_window':
        return isWithinEveningOfferWindow(
          this.worldTime.getWorldSeed(),
          prereq.giverNpcId,
          this.worldTime.getElapsedDays(),
          this.worldTime.getTimeOfDay(),
        )
      case 'quest_outcome': {
        const resolvedOutcomeId = this.stateOf(prereq.questId).resolvedOutcomeId
        if (!resolvedOutcomeId) return false
        return prereq.outcomeIds.includes(resolvedOutcomeId)
      }
      case 'relation':
        return relationLevelMeetsMinimum(this.getRelationLevel(prereq.npc.npcId), prereq.minimum)
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

  private isStoryExposure(def: QuestDef): boolean {
    return def.offer?.exposure === 'story'
  }

  private isUrgentOffer(def: QuestDef): boolean {
    return def.offer?.urgency === 'urgent'
  }

  /**
   * Explicit active-cap exception (plan quests-progression-034): urgent or
   * story-exposure metadata, never a heuristic over world facts.
   *
   * @domain quests-progression
   */
  private bypassesActiveGiverCap(def: QuestDef): boolean {
    return this.isUrgentOffer(def) || this.isStoryExposure(def)
  }

  /**
   * Ordinary `active`/`ready_to_report` quests this NPC gave — foreign-quest
   * targets never occupy this NPC's capacity.
   *
   * @domain quests-progression
   */
  private activeOrdinaryGiverQuestCount(npcId: NpcId): number {
    let count = 0
    for (const def of this.defs) {
      if (def.giver.npcId !== npcId) continue
      if (this.bypassesActiveGiverCap(def)) continue
      const state = this.stateOf(def.id).state
      if (state === 'active' || state === 'ready_to_report') count++
    }
    return count
  }

  private hasOrdinaryGiverCapacity(npcId: NpcId): boolean {
    return this.activeOrdinaryGiverQuestCount(npcId) < MAX_ORDINARY_ACTIVE_GIVER_QUESTS
  }

  private canAcceptOrdinaryGiverQuest(def: QuestDef): boolean {
    return this.bypassesActiveGiverCap(def) || this.hasOrdinaryGiverCapacity(def.giver.npcId)
  }

  /** Whether a `story`-exposure offer may be generically declined — see
   *  `QuestOfferPolicy.exposure`'s doc comment. */
  private isDeclinable(def: QuestDef): boolean {
    return !this.isStoryExposure(def)
  }

  private isOfferSuppressed(id: string): boolean {
    const until = this.stateOf(id).offerSuppressedUntilDay
    return until !== undefined && this.worldTime.getElapsedDays() < until
  }

  /** `not_offered` defs for `npcId` that meet authored availability and
   *  aren't cooling down from a recent decline — candidate discovery is
   *  read-only; callers decide what to do with the result (plan
   *  quests-progression-033). */
  private eligibleNotOfferedCandidates(npcId: NpcId): QuestDef[] {
    return this.defs.filter((def) => (
      def.giver.npcId === npcId
      && this.stateOf(def.id).state === 'not_offered'
      && this.meetsAvailability(def)
      && !this.isOfferSuppressed(def.id)
    ))
  }

  private offerRankSignal(def: QuestDef): QuestOfferRankSignal {
    return {
      def,
      urgency: this.isUrgentOffer(def) ? 'urgent' : 'normal',
      isStoryContinuation: def.availability?.prerequisites?.some((prereq) => prereq.type === 'quest_outcome') ?? false,
      relation: this.getRelation(def.giver.npcId),
      priority: def.offer?.priority ?? 0,
    }
  }

  /**
   * Which `not_offered` defs for `npcId` would enter the offer lifecycle
   * right now: at most one `normal`-urgency candidate and one `urgent`
   * candidate — each only when that slot isn't already occupied by an
   * existing `offered` def for this giver — plus every eligible
   * `story`-exposure candidate, which never competes for a slot. Ordinary
   * (`normal` urgency/exposure) candidates are also withheld when this
   * giver already has two ordinary `active`/`ready_to_report` quests (plan
   * quests-progression-034). Pure/read-only; `admitOffersForGiver` is the
   * only mutating caller (plan quests-progression-033).
   *
   * @domain quests-progression
   */
  private selectableOfferIds(npcId: NpcId): ReadonlySet<string> {
    const giverDefs = this.defs.filter((def) => def.giver.npcId === npcId)
    const normalSlotTaken = giverDefs.some((def) => (
      this.stateOf(def.id).state === 'offered' && !this.isStoryExposure(def) && !this.isUrgentOffer(def)
    ))
    const urgentSlotTaken = giverDefs.some((def) => (
      this.stateOf(def.id).state === 'offered' && !this.isStoryExposure(def) && this.isUrgentOffer(def)
    ))

    const eligible = this.eligibleNotOfferedCandidates(npcId)
    const selected = new Set<string>()
    for (const def of eligible) {
      if (this.isStoryExposure(def)) selected.add(def.id)
    }

    const capped = eligible.filter((def) => !this.isStoryExposure(def))
    const ranked = rankQuestOfferCandidates(capped.map((def) => this.offerRankSignal(def)))
    if (!normalSlotTaken && this.hasOrdinaryGiverCapacity(npcId)) {
      const pick = ranked.find((def) => !this.isUrgentOffer(def))
      if (pick) selected.add(pick.id)
    }
    if (!urgentSlotTaken) {
      const pick = ranked.find((def) => this.isUrgentOffer(def))
      if (pick) selected.add(pick.id)
    }
    return selected
  }

  /** Promotes this interaction's selected `not_offered` candidates to
   *  `offered` for `npcId` — called once at the top of `onInteract`, before
   *  any def's dialogue contribution is read, so candidate discovery and
   *  ranking stay read-only and mutation only ever touches the selected
   *  defs (plan quests-progression-033). */
  private admitOffersForGiver(npcId: NpcId): void {
    for (const id of this.selectableOfferIds(npcId)) {
      if (this.stateOf(id).state !== 'not_offered') continue
      this.setQuestState(id, { state: 'offered', stageIndex: 0 })
    }
  }

  /** `not_offered` def ids that currently count as exposed for their giver
   *  — used by `list()`/`labelMarker()` so the quest log and NPC markers
   *  agree with what dialogue actually offers, instead of leaking every
   *  eligible-but-capped candidate (plan quests-progression-033). */
  private computeExposableNotOfferedIds(): ReadonlySet<string> {
    const giverIds = new Set(this.defs.map((def) => def.giver.npcId))
    const result = new Set<string>()
    for (const npcId of giverIds) {
      for (const id of this.selectableOfferIds(npcId)) result.add(id)
    }
    return result
  }

  private objectiveDescription(stage: QuestStage, questId: string): string {
    const s = this.stateOf(questId)
    const unfinished = questStageObjectiveSlots(stage).filter((slot) => !this.isSlotComplete(s, stage, slot))
    if (unfinished.length === 1) {
      const objective = unfinished[0]!.objective
      if (objective.type === 'gather_item') {
        const { kind, count } = objective
        const have = Math.min(this.inventory.count(kind), count)
        return `${stage.description} (masz ${have}/${count})`
      }
      if (objective.type === 'harvest_animals' || objective.type === 'feed_habitat_animals') {
        const current = this.slotCount(s, stage, unfinished[0]!)
        return `${stage.description} (${current}/${objective.count})`
      }
    }
    return stage.description
  }

  /** Omits `not_offered` quests whose availability gate isn't met yet, and
   *  (plan quests-progression-033) any eligible `not_offered` candidate the
   *  offer cap doesn't currently expose — an unmet-availability or
   *  currently-capped quest stays fully hidden rather than shown as locked
   *  (plan 093 Etap C's default; a future milestone may add an explicit
   *  "locked" surface for quests the design wants to hint at). */
  list(): QuestListEntry[] {
    const exposable = this.computeExposableNotOfferedIds()
    return this.defs
      .filter((def) => this.stateOf(def.id).state !== 'not_offered' || exposable.has(def.id))
      .map((def) => {
        const s = this.stateOf(def.id)
        const stage = this.currentStage(def, s.stageIndex)
        const resolved = resolvedOutcome(def, s)
        const terminal = s.state === 'abandoned' || s.state === 'complete' || s.state === 'failed' || s.state === 'invalidated'
        return {
          id: def.id,
          title: def.title,
          description: def.description,
          giverName: def.giverName,
          giverNpcId: def.giver.npcId,
          state: s.state,
          stageIndex: s.stageIndex,
          totalStages: def.stages.length,
          currentObjective: s.state === 'active' && stage ? this.objectiveDescription(stage, def.id) : null,
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
      const slot = this.unfinishedSlots(def, s).find((entry) => entry.objective.type === 'resolve_storage_rat_infestation')
      if (!slot || !def.settlementId) continue
      const snapshot = this.settlementRatInfestation.getSnapshot(def.settlementId)
      if (isSettlementRatInfestationResolved(snapshot)) this.completeObjectiveSlot(def, s, slot)
    }
  }

  /** Polls live world state for active `destroy_spawn_point` objectives (plan
   *  quests-progression-007) — call after permanent habitat destruction. */
  pollDestroySpawnPointObjectives(): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const slot = this.unfinishedSlots(def, s).find((entry) => entry.objective.type === 'destroy_spawn_point')
      if (!slot || slot.objective.type !== 'destroy_spawn_point') continue
      if (!this.spawnPointDestruction.isPermanentlyDestroyed(slot.objective.spawnerId)) continue
      this.completeObjectiveSlot(def, s, slot)
    }
  }

  /** Polls live world-driven source status for generated settlement quests.
   *  Unaccepted offers disappear when the source problem is gone. An accepted
   *  quest whose source resolved without completing the objective takes the
   *  authored `resolved_without_player` outcome when present (else unique
   *  failed) through the same `applyOutcome` path — never invent a parallel
   *  external-resolution pipeline. A missing source binding on an active
   *  quest is `invalidated`. Call after spawn-point destruction catch-up so a
   *  player destroy still completes normally.
   *
   * @domain quests-progression
   */
  pollWorldDrivenSources(): void {
    for (const def of this.defs) {
      const status = this.worldQuestSource.getStatus(def.id)
      if (status === 'untracked') continue
      const s = this.stateOf(def.id)
      if (s.state === 'offered' && status !== 'present') {
        this.setQuestState(def.id, { state: 'not_offered', stageIndex: 0 })
        continue
      }
      if (s.state !== 'active') continue
      if (status === 'absent') {
        this.setQuestState(def.id, { state: 'invalidated', stageIndex: s.stageIndex })
        continue
      }
      if (status === 'resolved') {
        const outcome = externalResolutionOutcome(def)
        if (outcome) this.applyOutcome(def, outcome.id)
      }
    }
  }

  /**
   * Polls typed lost-livestock world snapshots. Outcomes come from fauna
   * state, never from quest-local flags.
   *
   * @domain quests-progression
   */
  pollLostLivestockSources(): void {
    for (const def of this.defs) {
      if (!parseLostLivestockQuestId(def.id)) continue
      const snapshot = this.lostLivestockSource.getSnapshot(def.id)
      if (snapshot === 'untracked') continue
      const s = this.stateOf(def.id)
      if (s.state === 'offered' && snapshot !== 'lost-alive' && snapshot !== 'corpse-uninspected') {
        this.setQuestState(def.id, { state: 'not_offered', stageIndex: 0 })
        continue
      }
      if (s.state !== 'active') continue
      if (snapshot === 'returned') {
        this.applyOutcome(def, LOST_LIVESTOCK_LIVE_OUTCOME)
        continue
      }
      if (snapshot === 'corpse-inspected') {
        this.applyOutcome(def, LOST_LIVESTOCK_DEAD_OUTCOME)
        continue
      }
      if (snapshot === 'unavailable') {
        this.applyOutcome(def, LOST_LIVESTOCK_UNAVAILABLE_OUTCOME)
      }
    }
  }

  /** Polls live knowledge/container state for active world-progression
   *  objectives (plan quests-progression-009). */
  pollWorldProgressionObjectives(): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      this.catchUpActiveWorldObjectives(def, s)
    }
  }

  /**
   * Player-only knife harvest (plan quests-progression-020). NPC harvest must
   * not call this.
   *
   * @domain quests-progression
   */
  onAnimalHarvested(context: PlayerAnimalHarvestContext): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      for (const slot of this.unfinishedSlots(def, s)) {
        const objective = slot.objective
        if (objective.type !== 'harvest_animals' || objective.kind !== context.animalKind) continue
        const stage = this.currentStage(def, s.stageIndex)
        if (!stage) continue
        const next = Math.min(this.slotCount(s, stage, slot) + 1, objective.count)
        const current = this.stateOf(def.id)
        if (isLegacySingleObjectiveStage(stage)) {
          this.setQuestState(def.id, { ...current, stageCount: next })
        } else {
          this.writeSlotProgress(def, current, slot.id, { count: next })
        }
        if (next >= objective.count) this.completeObjectiveSlot(def, this.stateOf(def.id), slot)
        break
      }
    }
  }

  /**
   * Successful loose-food consumption (plan quests-progression-020).
   *
   * @domain quests-progression
   */
  onHabitatAnimalFed(context: HabitatAnimalFeedContext): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      for (const slot of this.unfinishedSlots(def, s)) {
        const objective = slot.objective
        if (objective.type !== 'feed_habitat_animals') continue
        if (context.spawnPointId !== objective.spawnerId) continue
        if (!objective.kinds.includes(context.animalKind)) continue
        if (!objective.foodKinds.includes(context.itemKind)) continue
        const stage = this.currentStage(def, s.stageIndex)
        if (!stage) continue
        const dedupeKey = `${def.id}:${s.stageIndex}:${slot.id}`
        const seen = this.feedContributionIds.get(dedupeKey) ?? new Set<string>()
        if (seen.has(context.animalId)) continue
        seen.add(context.animalId)
        this.feedContributionIds.set(dedupeKey, seen)
        const next = Math.min(this.slotCount(s, stage, slot) + 1, objective.count)
        const current = this.stateOf(def.id)
        if (isLegacySingleObjectiveStage(stage)) {
          this.setQuestState(def.id, { ...current, stageCount: next })
        } else {
          this.writeSlotProgress(def, current, slot.id, { count: next })
        }
        if (next >= objective.count) this.completeObjectiveSlot(def, this.stateOf(def.id), slot)
        break
      }
    }
  }

  /** Inventory "Odczytaj" on a treasure-map item (plan quests-progression-009). */
  onReadItem(itemKind: ItemKind): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const slot = this.unfinishedSlots(def, s).find((entry) => (
        entry.objective.type === 'read_item' && entry.objective.itemKind === itemKind
      ))
      if (!slot) continue
      this.completeObjectiveSlot(def, s, slot)
      this.catchUpActiveWorldObjectives(def, this.stateOf(def.id))
    }
  }

  /** Authored Hidden Find spot resolved (plan quests-progression-008). */
  notifyHiddenFindSpotResolved(spotId: string): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const slot = this.unfinishedSlots(def, s).find((entry) => (
        entry.objective.type === 'recover_hidden_find' && entry.objective.spotId === spotId
      ))
      if (!slot) continue
      this.catchUpActiveWorldObjectives(def, s)
    }
  }

  /** Exact portable container entered the carry lifecycle (plan quests-progression-008). */
  notifyPortableContainerAcquired(containerId: string): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const slot = this.unfinishedSlots(def, s).find((entry) => (
        entry.objective.type === 'acquire_portable_container' && entry.objective.containerId === containerId
      ))
      if (!slot) continue
      this.catchUpActiveWorldObjectives(def, s)
    }
  }

  tryResolvePhysicalOutcome(questId: string, outcomeId: QuestOutcomeId): boolean {
    const def = this.defs.find((entry) => entry.id === questId)
    if (!def) return false
    const s = this.stateOf(questId)
    if (s.state !== 'active' || s.resolvedOutcomeId) return false
    if (!def.outcomes.some((entry) => entry.id === outcomeId)) return false
    return this.resolveQuest(questId, outcomeId)
  }

  private isWorldObjectiveSatisfied(objective: QuestObjective): boolean {
    switch (objective.type) {
      case 'acquire_portable_container':
        return this.worldProgress.hasAcquiredPortableContainer(objective.containerId)
      case 'await_quest_outcome':
        return false
      case 'discover_location':
        return this.worldProgress.hasDiscoveredLocation(objective.locationId)
      case 'light_settlement_fires':
        return evaluateSettlementLightsObjective(
          this.settlementLight.getSnapshot(objective.settlementId, objective.torchIds, objective.requireCampfire),
          objective.torchIds,
          objective.requireCampfire,
        )
      case 'loot_world_container':
        return this.worldProgress.isWorldContainerLooted(objective.containerId)
      case 'read_item':
        return this.worldProgress.hasReadItem(objective.itemKind)
      case 'recover_hidden_find':
        return this.worldProgress.hasResolvedHiddenFindSpot(objective.spotId)
      default:
        return false
    }
  }

  /** Active settlement-light objective for dusk suppression (plan quests-progression-021). */
  activeSettlementLightDuty(): {
    settlementId: string
    torchIds: readonly string[]
    requireCampfire: boolean
  } | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      for (const slot of this.unfinishedSlots(def, s)) {
        const objective = slot.objective
        if (objective.type !== 'light_settlement_fires') continue
        return {
          settlementId: objective.settlementId,
          torchIds: objective.torchIds,
          requireCampfire: objective.requireCampfire,
        }
      }
    }
    return null
  }

  /** Re-evaluates active `light_settlement_fires` stages after manual ignition. */
  recheckSettlementLightObjectives(): void {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      for (const slot of this.unfinishedSlots(def, s)) {
        const objective = slot.objective
        if (objective.type !== 'light_settlement_fires') continue
        const snapshot = this.settlementLight.getSnapshot(
          objective.settlementId,
          objective.torchIds,
          objective.requireCampfire,
        )
        if (snapshot.status === 'unavailable') {
          this.setQuestState(def.id, { state: 'invalidated', stageIndex: s.stageIndex })
          break
        }
        if (evaluateSettlementLightsObjective(snapshot, objective.torchIds, objective.requireCampfire)) {
          this.completeObjectiveSlot(def, this.stateOf(def.id), slot)
        }
      }
    }
  }

  private catchUpActiveWorldObjectives(def: QuestDef, s: QuestRuntimeProgress): void {
    const seen = new Set<number>()
    let current = s
    while (current.state === 'active') {
      if (seen.has(current.stageIndex)) break
      seen.add(current.stageIndex)
      const stage = this.currentStage(def, current.stageIndex)
      if (!stage) break
      const slot = this.unfinishedSlots(def, current).find((entry) => this.isWorldObjectiveSatisfied(entry.objective))
      if (!slot) break
      this.completeObjectiveSlot(def, current, slot)
      current = this.stateOf(def.id)
    }
  }

  private maybeAdvanceResolvedStorageRatInfestation(def: QuestDef, s: QuestRuntimeProgress): boolean {
    if (!def.settlementId) return false
    const slot = this.unfinishedSlots(def, s).find((entry) => entry.objective.type === 'resolve_storage_rat_infestation')
    if (!slot) return false
    const snapshot = this.settlementRatInfestation.getSnapshot(def.settlementId)
    if (!isSettlementRatInfestationResolved(snapshot)) return false
    this.completeObjectiveSlot(def, s, slot)
    return true
  }

  private storageRatInfestationReminder(def: QuestDef, stage: QuestStage): string {
    if (!def.settlementId) return stage.reminderLine
    return settlementRatInfestationReminderLine(this.settlementRatInfestation.getSnapshot(def.settlementId))
  }

  private bumpRelation(npcId: NpcId, amount: number): void {
    this.relations.set(npcId, this.getRelation(npcId) + amount)
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
      if (s.state !== 'active') continue
      const stage = this.currentStage(def, s.stageIndex)
      if (!stage) continue
      let invalidated = false
      for (const slot of questStageObjectiveSlots(stage)) {
        if (slot.objective.type !== 'kill_target_animal' && slot.objective.type !== 'find_animal') continue
        const key = animalTargetKey(def.id, s.stageIndex, slot.id)
        if (!this.animalTargets.has(key) && !this.animalTargets.has(def.id)) continue
        this.animalTargets.delete(key)
        this.animalTargets.delete(def.id)
        if (!LIVESTOCK_KINDS.has(slot.objective.kind)) {
          invalidated = true
          continue
        }
      }
      if (invalidated) {
        this.clearAnimalTargetsForQuest(def.id)
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
    const stage = this.currentStage(def, stageIndex)
    if (!stage) return
    for (const slot of questStageObjectiveSlots(stage)) {
      if (slot.objective.type !== 'kill_target_animal' && slot.objective.type !== 'find_animal') continue
      const key = animalTargetKey(def.id, stageIndex, slot.id)
      if (this.animalTargets.has(key)) continue
      const animalId = this.resolveAnimalTarget(slot.objective.kind)
      if (!animalId) continue
      this.animalTargets.set(key, animalId)
      this.lifecycleHooks.onAnimalTargetBound?.(def.id, animalId)
      if (slot.objective.type === 'kill_target_animal' && slot.objective.dangerous) {
        this.applyDangerousTrait(animalId)
      }
    }
  }

  /**
   * Death-time bind for an unbound `kill_target_animal` / `find_animal`
   * slot (plan quests-progression-034). Does **not** call
   * `resolveAnimalTarget`: that lookup skips already-dead animals and would
   * silently retarget a different live individual. When the world reports
   * the dying animal's `kind`, the unbound slot of that kind binds to this
   * exact `animalId` and then matches. Without `kind`, the slot stays
   * unbound — exact identity is still required.
   *
   * @domain quests-progression
   */
  private bindDyingAnimalTargetIfUnbound(
    def: QuestDef,
    stageIndex: number,
    animalId: string,
    kind: AnimalKind | undefined,
  ): void {
    if (!kind) return
    const stage = this.currentStage(def, stageIndex)
    if (!stage) return
    for (const slot of questStageObjectiveSlots(stage)) {
      if (slot.objective.type !== 'kill_target_animal' && slot.objective.type !== 'find_animal') continue
      if (slot.objective.kind !== kind) continue
      const key = animalTargetKey(def.id, stageIndex, slot.id)
      if (this.animalTargets.has(key)) continue
      this.animalTargets.set(key, animalId)
      this.lifecycleHooks.onAnimalTargetBound?.(def.id, animalId)
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
    if (
      current.state === 'abandoned' || current.state === 'complete'
      || current.state === 'failed' || current.state === 'invalidated'
    ) return null
    const outcome = def.outcomes.find((entry) => entry.id === outcomeId)
    if (!outcome) return null

    if (outcome.state === 'complete') {
      const animalId = this.completeOutcomeAnimalId(def, outcome)
      if (animalId && !this.transferAnimalOwnership(animalId)) {
        const failed = uniqueOutcomeForState(def, 'failed')
        return failed ? this.applyOutcome(def, failed.id) : null
      }
    }

    const stageIndex = outcome.state === 'complete' ? def.stages.length : current.stageIndex
    this.setQuestState(def.id, { state: outcome.state, stageIndex, resolvedOutcomeId: outcome.id })
    this.clearAnimalTargetsForQuest(def.id)

    this.applyEffects(outcome.effects, { skipAnimalOwnership: true })
    if (outcome.reward?.items) {
      for (const item of outcome.reward.items) this.grantItem(item.kind, item.count)
    }
    this.applyConsequences(def, outcome.consequences)
    if (outcome.state === 'complete') this.playQuestCompleteSound(def.giverName)
    return outcome
  }

  /** Relation/social deltas only — no reward, sound, or terminal state. */
  private applyConsequences(def: QuestDef, consequences: QuestConsequences | undefined): void {
    if (!consequences) return
    if (consequences.relations) {
      for (const rel of consequences.relations) this.bumpRelation(rel.npc.npcId, rel.delta)
    }
    if (def.settlementId && consequences.social) {
      this.applySocialConsequence({ settlementId: def.settlementId, ...consequences.social })
    }
  }

  /** Whether `def` currently allows the generic active-quest opt-out — see
   *  `QuestAbandonment`. Absent policy = allowed. */
  private canAbandon(def: QuestDef): boolean {
    return def.abandonment?.allowed !== false
  }

  /** Conscious player opt-out on an `active` giver quest: `active →
   *  abandoned`, exactly once, with the same cleanup a terminal outcome does
   *  (runtime animal-target binding, feed dedupe) and the def's own optional
   *  `QuestConsequences` — never a reward. Distinct from `failed`/
   *  `invalidated`: the binding wasn't lost, the player chose to stop (plan
   *  quests-progression-033). Re-reads `def`'s current state itself, so a
   *  stale dialogue callback invoked twice cannot apply consequences twice. */
  private applyAbandonment(def: QuestDef): boolean {
    const current = this.stateOf(def.id)
    if (current.state !== 'active' || !this.canAbandon(def)) return false
    this.setQuestState(def.id, { state: 'abandoned', stageIndex: current.stageIndex })
    this.clearAnimalTargetsForQuest(def.id)
    this.clearFeedDedupe(def.id, current.stageIndex)
    this.applyConsequences(def, def.abandonment?.consequences)
    return true
  }

  /** Public opt-out entry point — see `applyAbandonment`. */
  abandonQuest(questId: string): boolean {
    const def = this.defs.find((d) => d.id === questId)
    if (!def) return false
    return this.applyAbandonment(def)
  }

  /** Generic "give up on this active quest" dialogue action for `def`'s
   *  giver, or null when its policy disables it (plan quests-progression-033).
   *  `onSelect` re-reads live state via `abandonQuest`, so an outdated
   *  callback (e.g. a stale menu after the quest already resolved another
   *  way) cannot replay consequences. */
  private abandonDialogAction(def: QuestDef): QuestDialogAction | null {
    if (!this.canAbandon(def)) return null
    const questId = def.id
    return {
      label: QUEST_ABANDON_PLAYER_LINE,
      topicScoped: true,
      onSelect: () => {
        this.abandonQuest(questId)
        return QUEST_ABANDON_NPC_REPLY
      },
    }
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

  /** Advances past the current stage — to the next stage if any remain, a
   *  declared transition target, or `ready_to_report` once the last one
   *  clears. Does not resolve the quest unless a transition names an outcome. */
  private advanceStage(def: QuestDef, s: QuestRuntimeProgress, resultId?: string): void {
    this.clearFeedDedupe(def.id, s.stageIndex)
    const stage = this.currentStage(def, s.stageIndex)
    const clearedIndex = s.stageIndex
    const transition = matchStageTransition(stage, resultId)
    if (transition?.toOutcomeId) {
      this.applyOutcome(def, transition.toOutcomeId)
      this.lifecycleHooks.onStageAdvanced?.(def.id, clearedIndex)
      return
    }
    let nextIndex = s.stageIndex + 1
    if (transition?.toStageId) {
      const target = def.stages.findIndex((entry) => entry.id === transition.toStageId)
      if (target >= 0) nextIndex = target
    }
    const nextState = nextIndex >= def.stages.length ? 'ready_to_report' : 'active'
    this.setQuestState(def.id, { state: nextState, stageIndex: nextIndex, stageCount: 0 })
    if (nextState === 'active') this.bindAnimalTargetIfNeeded(def, nextIndex)
    this.lifecycleHooks.onStageAdvanced?.(def.id, clearedIndex)
  }

  /** Presents an already-`offered` def's offer dialogue. Promotion from
   *  `not_offered` happens once per interaction, before any def's
   *  contribution is read — see `admitOffersForGiver` (plan
   *  quests-progression-033). */
  private handleGiverOffer(def: QuestDef): QuestDialogOverride | null {
    if (this.stateOf(def.id).state !== 'offered') return null
    if (!this.canAcceptOrdinaryGiverQuest(def)) return null
    return {
      line: def.offerLine,
      offer: {
        onAccept: () => {
          if (!this.canAcceptOrdinaryGiverQuest(def)) return
          if (def.horseRewardAnimalId && !this.canReserveHorseReward(def.horseRewardAnimalId)) return
          this.setQuestState(def.id, { state: 'active', stageIndex: 0, stageCount: 0 })
          this.bindAnimalTargetIfNeeded(def, 0)
          this.catchUpActiveWorldObjectives(def, this.stateOf(def.id))
        },
        ...(this.isDeclinable(def) ? { onDecline: () => this.declineOffer(def) } : {}),
      },
    }
  }

  /** Returns a declined offer to `not_offered` with a short suppression so
   *  the very next conversation doesn't re-admit it (plan
   *  quests-progression-033) — the world problem this offer represents is
   *  unaffected; only the quest layer's offer bookkeeping changes. */
  private declineOffer(def: QuestDef): void {
    this.setQuestState(def.id, {
      state: 'not_offered',
      stageIndex: 0,
      offerSuppressedUntilDay: this.worldTime.getElapsedDays() + OFFER_DECLINE_SUPPRESSION_DAYS,
    })
  }

  private handleGiverReminder(def: QuestDef): QuestDialogOverride | null {
    const s = this.stateOf(def.id)
    if (s.state !== 'active') return null
    const stage = this.currentStage(def, s.stageIndex)
    if (!stage) return null
    if (this.unfinishedSlots(def, s).some((slot) => slot.objective.type === 'resolve_storage_rat_infestation')) {
      return { line: this.storageRatInfestationReminder(def, stage) }
    }
    return { line: stage.reminderLine }
  }

  /**
   * Read-only: the current unfinished `gather_item` slot is ready to hand
   * in at the giver. Shared by `collectGiverActions` and `labelMarker` so
   * the `✓` glyph matches the live dialogue action (plan
   * quests-progression-034). Does not mutate quest state.
   *
   * @domain quests-progression
   */
  private gatherHandInSlot(def: QuestDef): QuestStageObjectiveSlot | undefined {
    const s = this.stateOf(def.id)
    if (s.state !== 'active') return undefined
    const stage = this.currentStage(def, s.stageIndex)
    if (!stage) return undefined
    const gatherSlot = this.unfinishedSlots(def, s).find((slot) => slot.objective.type === 'gather_item')
    if (!gatherSlot || gatherSlot.objective.type !== 'gather_item') return undefined
    const isFinalStage = s.stageIndex >= def.stages.length - 1
      && this.unfinishedSlots(def, s).length === 1
      && !stage.transitions
    if (isFinalStage && !uniqueOutcomeForState(def, 'complete')) return undefined
    if (!this.inventory.has(gatherSlot.objective.kind, gatherSlot.objective.count)) return undefined
    return gatherSlot
  }

  /**
   * Giver has a completion/hand-in/report action available right now —
   * `ready_to_report` or a live gather turn-in — without calling
   * `onInteract()` (plan quests-progression-034).
   *
   * @domain quests-progression
   */
  private hasGiverCompletionActionNow(def: QuestDef, npcId: NpcId): boolean {
    if (npcId !== def.giver.npcId) return false
    if (this.stateOf(def.id).state === 'ready_to_report') return true
    return this.gatherHandInSlot(def) !== undefined
  }

  /** Active giver contribution: report/gather-turn-in actions when ready,
   *  plus (plan quests-progression-033) a generic opt-out action so an
   *  `active` quest's reminder is never action-less just because its
   *  objective isn't gather/report-driven — unless the def's own
   *  `QuestAbandonment` disables it. */
  private collectGiverActions(def: QuestDef, npcId: NpcId): QuestDialogOverride | null {
    if (npcId !== def.giver.npcId) return null
    const s = this.stateOf(def.id)
    if (s.state === 'active') {
      const stage = this.currentStage(def, s.stageIndex)
      if (!stage) return null
      const abandonAction = this.abandonDialogAction(def)
      if (this.unfinishedSlots(def, s).some((slot) => slot.objective.type === 'resolve_storage_rat_infestation')) {
        if (this.maybeAdvanceResolvedStorageRatInfestation(def, s)) {
          const updated = this.stateOf(def.id)
          if (updated.state === 'ready_to_report') return this.reportOverride(def)
        }
        return abandonAction ? { line: this.storageRatInfestationReminder(def, stage), actions: [abandonAction] } : null
      }
      const unfinishedGather = this.unfinishedSlots(def, s).find((slot) => slot.objective.type === 'gather_item')
      if (unfinishedGather && unfinishedGather.objective.type === 'gather_item') {
        const readySlot = this.gatherHandInSlot(def)
        if (!readySlot) {
          return abandonAction ? { line: stage.reminderLine, actions: [abandonAction] } : null
        }
        const stageIndex = s.stageIndex
        const slotId = readySlot.id
        const actions: QuestDialogAction[] = [{
          label: stage.playerLine ?? def.reportPlayerLine ?? DEFAULT_GATHER_PLAYER_LINE,
          onSelect: () => this.selectGatherTurnIn(def, stageIndex, slotId),
        }]
        if (abandonAction) actions.push(abandonAction)
        return { line: stage.reminderLine, actions }
      }
      return abandonAction ? { line: stage.reminderLine, actions: [abandonAction] } : null
    }
    if (s.state === 'ready_to_report') return this.reportOverride(def)
    return null
  }

  /**
   * Active `talk_to_npc_choice`: talking to a matching NPC presents that
   * choice's player action. Selecting the action resolves through
   * `applyOutcome`.
   *
   * @domain quests-progression
   */
  private resolveTalkToNpcChoice(def: QuestDef, npcId: NpcId): QuestDialogOverride | null {
    const s = this.stateOf(def.id)
    if (s.state !== 'active') return null
    const choiceSlot = this.unfinishedSlots(def, s).find((slot) => matchingTalkChoice(slot.objective, npcId))
    const choice = matchingTalkChoice(choiceSlot?.objective, npcId)
    if (!choice) return null
    if (!def.outcomes.some((outcome) => outcome.id === choice.outcomeId)) return null
    const stageIndex = s.stageIndex
    return {
      line: choice.npcLine ?? DEFAULT_NPC_PROMPT,
      actions: [{
        label: choice.playerLine,
        onSelect: () => this.selectTalkToNpcChoice(def, npcId, choice.outcomeId, stageIndex),
      }],
    }
  }

  private reportOverride(def: QuestDef): QuestDialogOverride | null {
    if (!uniqueOutcomeForState(def, 'complete')) return null
    return {
      line: def.reportPromptLine ?? DEFAULT_REPORT_PROMPT,
      actions: [{
        label: def.reportPlayerLine ?? DEFAULT_REPORT_PLAYER_LINE,
        onSelect: () => this.selectSuccessfulTurnIn(def),
      }],
    }
  }

  private resolveTalkToNpc(def: QuestDef, npcId: NpcId): QuestDialogOverride | null {
    const s = this.stateOf(def.id)
    if (s.state !== 'active') return null
    const stage = this.currentStage(def, s.stageIndex)
    if (!stage) return null
    const slot = this.unfinishedSlots(def, s).find((entry) => (
      entry.objective.type === 'talk_to_npc' && entry.objective.npc.npcId === npcId
    ))
    if (!slot || slot.objective.type !== 'talk_to_npc') return null
    const stageIndex = s.stageIndex
    const progressLine = stage.progressLine ?? stage.description
    return {
      line: DEFAULT_NPC_PROMPT,
      actions: [{
        label: stage.playerLine ?? DEFAULT_TALK_PLAYER_LINE,
        onSelect: () => this.selectTalkToNpc(def, npcId, stageIndex, slot.id, progressLine),
      }],
    }
  }

  private resolveStageDialogueActions(def: QuestDef, npcId: NpcId): QuestDialogOverride | null {
    const s = this.stateOf(def.id)
    if (s.state !== 'active') return null
    const stage = this.currentStage(def, s.stageIndex)
    const matching = matchingStageDialogueActions(stage, npcId).filter((action) => {
      if (!action.physicalOutcomeId) return true
      return this.physicalOutcome.canResolve(def.id, action.physicalOutcomeId, {
        requireCarriedContainerId: action.requireCarriedContainerId,
        requireCarriedUnopened: action.requireCarriedUnopened,
        requireItemInstanceId: action.requireItemInstanceId,
      })
    })
    if (!stage || matching.length === 0) return null
    const stageIndex = s.stageIndex
    return {
      line: stage.reminderLine,
      actions: matching.map((action) => ({
        label: action.playerLine,
        onSelect: () => this.selectStageDialogueAction(
          def,
          npcId,
          stageIndex,
          stage.dialogueActions?.indexOf(action) ?? -1,
        ),
      })),
    }
  }

  private selectStageDialogueAction(
    def: QuestDef,
    npcId: NpcId,
    stageIndex: number,
    actionIndex: number,
  ): string {
    const current = this.stateOf(def.id)
    const stage = this.currentStage(def, current.stageIndex)
    const action = stage?.dialogueActions?.[actionIndex]
    const fallback = action?.npcLine ?? stage?.reminderLine ?? def.reportLine
    if (current.state !== 'active' || current.stageIndex !== stageIndex) return fallback
    if (!action || action.npc.npcId !== npcId) return fallback
    if (action.physicalOutcomeId) {
      const ctx: QuestPhysicalOutcomeContext = {
        requireCarriedContainerId: action.requireCarriedContainerId,
        requireCarriedUnopened: action.requireCarriedUnopened,
        requireItemInstanceId: action.requireItemInstanceId,
      }
      if (!this.physicalOutcome.canResolve(def.id, action.physicalOutcomeId, ctx)) return fallback
      this.applyEffects(action.effects)
      this.physicalOutcome.onResolve(def.id, action.physicalOutcomeId)
      if (!this.resolveQuest(def.id, action.physicalOutcomeId)) return fallback
      return action.npcLine ?? def.reportLine ?? fallback
    }
    this.applyEffects(action.effects)
    this.applyConsequences(def, action.consequences)
    this.advanceStage(def, current)
    return action.npcLine
      ?? this.currentStage(def, this.stateOf(def.id).stageIndex)?.reminderLine
      ?? fallback
  }

  /**
   * Collect explicit quest dialogue actions for `npcId` from one definition.
   * Does not present offers or informational reminders.
   */
  private collectQuestActionsForNpc(def: QuestDef, npcId: NpcId): QuestDialogOverride | null {
    const actions: QuestDialogAction[] = []
    let line: string | undefined
    const push = (override: QuestDialogOverride | null): void => {
      if (!override?.actions?.length) return
      line ??= override.line
      actions.push(...override.actions)
    }
    push(this.resolveTalkToNpcChoice(def, npcId))
    push(this.resolveTalkToNpc(def, npcId))
    push(this.resolveStageDialogueActions(def, npcId))
    push(this.collectGiverActions(def, npcId))
    if (actions.length === 0) return null
    return { line: line ?? DEFAULT_NPC_PROMPT, actions }
  }

  private selectSuccessfulTurnIn(def: QuestDef): string {
    const current = this.stateOf(def.id)
    if (current.state !== 'ready_to_report') {
      return current.state === 'complete' ? def.reportLine : (def.reportPromptLine ?? DEFAULT_REPORT_PROMPT)
    }
    return this.resolveSuccessfulTurnIn(def) ?? def.reportLine
  }

  private selectTalkToNpc(
    def: QuestDef,
    npcId: NpcId,
    stageIndex: number,
    slotId: string,
    progressLine: string,
  ): string {
    const current = this.stateOf(def.id)
    if (current.state !== 'active' || current.stageIndex !== stageIndex) return progressLine
    const stage = this.currentStage(def, current.stageIndex)
    const slot = this.unfinishedSlots(def, current).find((entry) => entry.id === slotId)
    if (!stage || !slot || slot.objective.type !== 'talk_to_npc' || slot.objective.npc.npcId !== npcId) {
      return progressLine
    }
    this.applyEffects(stage.effects)
    this.completeObjectiveSlot(def, current, slot)
    return progressLine
  }

  private completeOutcomeAnimalId(def: QuestDef, outcome: QuestOutcome): string | undefined {
    const fromEffect = outcome.effects?.find((effect) => effect.type === 'transfer_animal_ownership')
    if (fromEffect?.type === 'transfer_animal_ownership') return fromEffect.animalId
    return def.horseRewardAnimalId
  }

  private applyEffects(
    effects: readonly QuestStageEffect[] | undefined,
    options?: { skipAnimalOwnership?: boolean },
  ): void {
    if (!effects?.length) return
    for (const effect of effects) {
      switch (effect.type) {
        case 'discard_carried_container':
          this.lifecycleHooks.discardCarriedContainer?.(effect.containerId)
          break
        case 'reveal_location':
          this.lifecycleHooks.revealLocation?.(effect.locationId, { setNavigation: effect.setNavigation })
          break
        case 'transfer_animal_ownership':
          if (!options?.skipAnimalOwnership) this.transferAnimalOwnership(effect.animalId)
          break
        case 'transfer_item_instance':
          this.lifecycleHooks.transferItemInstance?.(effect.instanceId, effect.toNpc.npcId)
          break
      }
    }
  }

  private selectTalkToNpcChoice(
    def: QuestDef,
    npcId: NpcId,
    outcomeId: QuestOutcomeId,
    stageIndex: number,
  ): string {
    const current = this.stateOf(def.id)
    const outcome = def.outcomes.find((entry) => entry.id === outcomeId)
    const resolvedLine = outcome?.resultText ?? def.reportLine
    if (current.state !== 'active' || current.stageIndex !== stageIndex) return resolvedLine
    const choice = matchingTalkChoice(
      this.unfinishedSlots(def, current).find((slot) => matchingTalkChoice(slot.objective, npcId))?.objective,
      npcId,
    )
    if (!choice || choice.outcomeId !== outcomeId) return resolvedLine
    const applied = this.applyOutcome(def, outcomeId)
    return applied ? (applied.resultText ?? def.reportLine) : resolvedLine
  }

  private selectGatherTurnIn(def: QuestDef, stageIndex: number, slotId: string): string {
    const current = this.stateOf(def.id)
    const stage = this.currentStage(def, current.stageIndex)
    const slot = this.unfinishedSlots(def, current).find((entry) => entry.id === slotId)
    if (
      current.state !== 'active'
      || current.stageIndex !== stageIndex
      || !stage
      || !slot
      || slot.objective.type !== 'gather_item'
    ) {
      return stage?.reminderLine ?? def.reportLine
    }
    const { kind, count } = slot.objective
    if (!this.inventory.has(kind, count)) return stage.reminderLine
    if (!this.inventory.remove(kind, count)) return stage.reminderLine
    const remainingBefore = this.unfinishedSlots(def, current).length
    this.completeObjectiveSlot(def, current, slot)
    const after = this.stateOf(def.id)
    if (after.state === 'ready_to_report' && remainingBefore === 1 && current.stageIndex >= def.stages.length - 1 && !stage.transitions) {
      const outcome = uniqueOutcomeForState(def, 'complete')
      if (outcome && this.applyOutcome(def, outcome.id)) return def.reportLine
    }
    if (after.state === 'complete' || after.state === 'failed') return def.reportLine
    return this.currentStage(def, after.stageIndex)?.reminderLine ?? def.reportLine
  }

  /** One definition's whole contribution to talking to `npcId` right now:
   *  explicit actions first (talk targets / stage dialogue actions / gather
   *  hand-in / report), else — only when `npcId` is this def's giver — an
   *  offer, else a giver reminder. Mirrors the old per-def precedence inside
   *  `onInteract`, factored out so both the top-level pass and a selected
   *  `QuestDialogTopic.resolve()` re-read live state through the exact same
   *  path (plan quests-progression-020). */
  private resolveNpcQuestContribution(def: QuestDef, npcId: NpcId): QuestDialogOverride | null {
    const actionable = this.collectQuestActionsForNpc(def, npcId)
    if (actionable) return actionable
    if (npcId !== def.giver.npcId) return null
    return this.handleGiverOffer(def) ?? this.handleGiverReminder(def)
  }

  /** Quest-driven line/offer for talking to `npcId` right now, or null if
   *  this NPC has nothing quest-related to say (caller falls back to normal
   *  dialogue). Matching is by stable NPC id, not display name.
   *
   *  Arbitrates every definition's contribution globally (plan
   *  quests-progression-020) instead of first-match: explicit actionable
   *  contributions (talk targets / stage dialogue actions / gather hand-in /
   *  report) from every definition are always merged into one flat `actions`
   *  list (unchanged aggregation from plan quests-progression-018) — never
   *  hidden behind topic selection. Generic abandon actions are
   *  `topicScoped` (plan quests-progression-034): with multiple quest
   *  contexts they stay behind `QuestDialogTopic` labelled with
   *  `QuestDef.title`, so they are never flattened into indistinguishable
   *  buttons. With exactly one quest context total, the single-quest UX is
   *  unchanged (no `topics` wrapper). `completedFallback` (plan 153) — an
   *  already-turned-in quest's `reportLine`, used only when no definition
   *  has any contribution at all.
   *
   *  Selected `not_offered` candidates are admitted to `offered` once up
   *  front — see `admitOffersForGiver` — so the per-def loop below only ever
   *  reads state, never mutates it into existence (plan
   *  quests-progression-033). */
  onInteract(npcId: NpcId): QuestDialogOverride | null {
    this.admitOffersForGiver(npcId)
    const contexts: { def: QuestDef, override: QuestDialogOverride }[] = []
    let completedFallback: QuestDialogOverride | null = null

    for (const def of this.defs) {
      const contribution = this.resolveNpcQuestContribution(def, npcId)
      if (contribution) {
        contexts.push({ def, override: contribution })
        continue
      }
      const s = this.stateOf(def.id)
      if (npcId === def.giver.npcId && s.state === 'complete' && !completedFallback) {
        completedFallback = { line: def.reportLine }
      }
    }

    if (contexts.length === 0) return completedFallback
    if (contexts.length === 1) return contexts[0]!.override

    const immediate = contexts.flatMap(({ override }) => (
      (override.actions ?? []).filter((action) => !action.topicScoped)
        .map((action) => ({ line: override.line, action }))
    ))
    const topics: QuestDialogTopic[] = contexts
      .filter(({ override }) => {
        const actions = override.actions ?? []
        const hasImmediate = actions.some((action) => !action.topicScoped)
        return !hasImmediate || actions.some((action) => action.topicScoped)
      })
      .map(({ def }) => ({
        label: def.title,
        resolve: () => this.resolveNpcQuestContribution(def, npcId) ?? { line: def.reportLine },
      }))

    if (immediate.length > 0) {
      return {
        line: immediate[0]!.line,
        actions: immediate.map((entry) => entry.action),
        ...(topics.length > 0 ? { topics } : {}),
      }
    }

    return { line: DEFAULT_NPC_PROMPT, topics }
  }

  /** Quest-driven line for interacting with a non-NPC world object (well/tree/
   *  spawner/live animal) matching `ref`, or null if no active quest cares. */
  onInteractObjective(ref: ObjectiveRef): QuestDialogOverride | null {
    let presentation: QuestDialogOverride | null = null
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue

      const stage = this.currentStage(def, s.stageIndex)
      if (!stage) continue

      if (ref.type === 'animal_died') {
        this.bindDyingAnimalTargetIfUnbound(def, s.stageIndex, ref.animalId, ref.kind)
      } else {
        this.bindAnimalTargetIfNeeded(def, s.stageIndex)
      }

      let matched = false
      for (const slot of this.unfinishedSlots(def, this.stateOf(def.id))) {
        const boundAnimalId = this.animalTargets.get(animalTargetKey(def.id, s.stageIndex, slot.id))
        if (ref.type === 'animal_died' && slot.objective.type === 'find_animal' && boundAnimalId === ref.animalId) {
          const line = this.resolveFailedFind(def, stage)
          if (line && presentation === null) presentation = { line }
          matched = true
          break
        }
        if (!objectiveMatchesRef(slot.objective, ref, boundAnimalId)) continue
        this.completeObjectiveSlot(def, this.stateOf(def.id), slot)
        if (presentation === null) {
          presentation = { line: stage.progressLine ?? stage.description }
        }
        matched = true
        break
      }
      if (!matched) continue
    }
    return presentation
  }

  /** Whether `animalId` is right now the bound target of an active
   *  `kill_target_animal` stage whose quest authors a real social
   *  consequence on at least one `complete` outcome (plan
   *  quests-progression-019) — the animal-deed reputation resolver suppresses
   *  its own generic reward when this is true, so a quest-owned kill is never
   *  rewarded twice.
   *
   *  Must be called *before* dealing the lethal hit, not from the post-kill
   *  toast/dialogue line: `AnimalAgent.collapse()` synchronously reports
   *  `animal_died` to `onInteractObjective` while `takeDamage()` is still on
   *  the stack, which already advances the bound stage past
   *  `kill_target_animal` before control returns to the caller. Reads
   *  `animalTargets` directly (unaffected by that advance — only terminal
   *  `applyOutcome` clears it) rather than reusing `objectiveMatchesRef`,
   *  which depends on the stage not having moved on yet. */
  hasSocialOutcomeClaim(animalId: string): boolean {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const stage = this.currentStage(def, s.stageIndex)
      if (!stage) continue
      const claimed = questStageObjectiveSlots(stage).some((slot) => {
        if (slot.objective.type !== 'kill_target_animal') return false
        return this.animalTargets.get(animalTargetKey(def.id, s.stageIndex, slot.id)) === animalId
      })
      if (!claimed) continue
      if (def.outcomes.some((outcome) => outcome.state === 'complete' && hasSocialConsequence(outcome.consequences))) {
        return true
      }
    }
    return false
  }

  /** Label suffix for `npcId`, or null when no quest wants to flag them.
   *  Matching is by stable NPC id, not display name.
   *  Three visually distinct giver states (plan 153) — available/in-progress
   *  used to share `'!'`, making a quest already accepted indistinguishable
   *  from one not yet offered at a glance.
   *
   *  A global reduction over every definition touching `npcId` (plan
   *  quests-progression-020), not first-match: one NPC can be the giver of
   *  several concurrent quests, and an earlier `active` one must not hide a
   *  later one that is `ready_to_report`. Priority — independent of `defs`
   *  order — is `?` (required dialogue target) > `✓` (completion / hand-in /
   *  report available now, including an `active` gather turn-in) > `!` (any
   *  quest `offered`/exposable `not_offered`) > `…` (any quest `active`) >
   *  `null`. `not_offered` counts only when the offer cap would actually
   *  expose it right now — see `selectableOfferIds` (plan
   *  quests-progression-033) — so a capped/suppressed candidate doesn't flag
   *  an NPC with `!` for an offer dialogue won't actually show. */
  labelMarker(npcId: NpcId): string | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      if (isRequiredDialogueTarget(this.currentStage(def, s.stageIndex), npcId, this.unfinishedSlots(def, s))) {
        return QUEST_MARKER_TALK_TARGET
      }
    }
    let hasReady = false
    let hasAvailable = false
    let hasActive = false
    const exposable = this.selectableOfferIds(npcId)
    for (const def of this.defs) {
      if (this.hasGiverCompletionActionNow(def, npcId)) hasReady = true
      if (npcId !== def.giver.npcId) continue
      const s = this.stateOf(def.id)
      if (s.state === 'active') hasActive = true
      else if (s.state === 'offered' && this.canAcceptOrdinaryGiverQuest(def)) hasAvailable = true
      else if (s.state === 'not_offered' && exposable.has(def.id)) hasAvailable = true
    }
    if (hasReady) return QUEST_MARKER_READY
    if (hasAvailable) return QUEST_MARKER_AVAILABLE
    if (hasActive) return QUEST_MARKER_IN_PROGRESS
    return null
  }

  /** Label suffix for a fauna spawner, or null when no active quest's
   *  current stage targets it. When the objective binds `spawnerId`, only
   *  that identity matches; otherwise any habitat of `spawnerType` does. */
  spawnerMarker(spawnerType: SpawnerType, spawnerId?: string): string | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      for (const slot of this.unfinishedSlots(def, s)) {
        const objective = slot.objective
        if (objective.type !== 'interact_spawner') continue
        if (objective.spawnerType !== spawnerType) continue
        if (objective.spawnerId != null && objective.spawnerId !== spawnerId) continue
        return '?'
      }
    }
    return null
  }

  exportProgress(): QuestProgressEntry[] {
    return this.defs.map((def) => {
      const s = this.stateOf(def.id)
      const entry: QuestProgressEntry = { id: def.id, state: s.state, stageIndex: s.stageIndex }
      if (s.state === 'active') {
        const stage = this.currentStage(def, s.stageIndex)
        if (stage && isLegacySingleObjectiveStage(stage)) {
          if (isCountedObjective(stage.objective) && s.stageCount !== undefined) {
            entry.stageCount = s.stageCount
          }
        } else if (stage) {
          const slotProgress = exportedStageSlotProgress(stage, s)
          if (slotProgress) entry.stageSlotProgress = slotProgress
        }
      }
      if ((s.state === 'complete' || s.state === 'failed') && s.resolvedOutcomeId) {
        entry.resolvedOutcomeId = s.resolvedOutcomeId
      }
      if (s.state === 'not_offered' && s.offerSuppressedUntilDay !== undefined) {
        entry.offerSuppressedUntilDay = s.offerSuppressedUntilDay
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
  if (entry.stageCount !== undefined) progress.stageCount = entry.stageCount
  if (entry.stageSlotProgress !== undefined) progress.stageSlotProgress = entry.stageSlotProgress
  if ((entry.state === 'complete' || entry.state === 'failed') && entry.resolvedOutcomeId) {
    progress.resolvedOutcomeId = entry.resolvedOutcomeId
  }
  if (entry.state === 'not_offered' && entry.offerSuppressedUntilDay !== undefined) {
    progress.offerSuppressedUntilDay = entry.offerSuppressedUntilDay
  }
  return progress
}

/** Legacy terminal entries without an outcome id take the unique matching
 *  authored outcome; 0 or >1 matches are left unresolved. */
function normalizeRestoredProgress(def: QuestDef, entry: QuestProgressEntry): QuestProgressEntry {
  const base: QuestProgressEntry = {
    id: entry.id,
    state: entry.state,
    stageIndex: entry.stageIndex,
    ...(entry.stageCount !== undefined ? { stageCount: entry.stageCount } : {}),
    ...(entry.stageSlotProgress !== undefined ? { stageSlotProgress: entry.stageSlotProgress } : {}),
    ...(entry.offerSuppressedUntilDay !== undefined ? { offerSuppressedUntilDay: entry.offerSuppressedUntilDay } : {}),
  }
  if (entry.state !== 'complete' && entry.state !== 'failed') return base
  if (entry.resolvedOutcomeId) {
    return { ...base, resolvedOutcomeId: entry.resolvedOutcomeId }
  }
  const outcome = uniqueOutcomeForState(def, entry.state)
  if (!outcome) return base
  return { ...base, resolvedOutcomeId: outcome.id }
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
  if (progress.state === 'abandoned') return QUEST_ABANDONED_RESULT_TEXT
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

function exportedStageSlotProgress(
  stage: QuestStage,
  s: QuestRuntimeProgress,
): Record<string, QuestStageSlotProgress> | undefined {
  const out: Record<string, QuestStageSlotProgress> = {}
  for (const slot of questStageObjectiveSlots(stage)) {
    const progress = s.stageSlotProgress?.[slot.id]
    if (!progress) continue
    const exported: QuestStageSlotProgress = {}
    if (isCountedObjective(slot.objective) && progress.count !== undefined) exported.count = progress.count
    if (progress.completed && objectiveNeedsPersistedSlotProgress(slot.objective)) exported.completed = true
    if (exported.completed || exported.count !== undefined) out[slot.id] = exported
  }
  return Object.keys(out).length > 0 ? out : undefined
}
