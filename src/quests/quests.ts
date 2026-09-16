import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnerType } from '../fauna/AnimalSpawner'
import type { ItemKind } from '../items/items'
import type { ReputationDimension } from '../reputation/ReputationManager'
import type { NpcId } from '../settlement/npcState'
import type { LandmarkKind } from '../terrain/chunkEnvironment'
import { WOLF_DEN_ID } from '../fauna/AnimalSpawner'
import {
  DARK_FOREST_TREASURE_LOCATION_ID,
  darkForestTreasureChestId,
} from '../world/locations/darkForestTreasureSite'
import { treasureMapBearCaveReturnPayout } from '../world/locations/treasureMapBearCave'

export type QuestState =
  /** Conscious player opt-out of an accepted quest (plan
   *  quests-progression-033) — terminal, distinct from `failed`/`invalidated`:
   *  the player chose to stop, the binding wasn't lost and the objective
   *  wasn't missed. See `QuestManager.abandonQuest()`. */
  | 'abandoned'
  | 'active'
  | 'complete'
  /** The stage's bound world entity can no longer be completed (e.g. a
   *  `find_animal` target died before being found) — terminal, no reward. */
  | 'failed'
  /** Set on save/load restore, or on a same-session `WorldBundle` rebuild
   *  (plan 199), when the quest's world binding can't be trusted to still
   *  refer to the same entity (e.g. an `active` quest bound to a wild-fauna
   *  `animalId`, which isn't stable across either boundary) — terminal, no
   *  reward. See `QuestManager`'s constructor and
   *  `invalidateStaleAnimalTargets()`. */
  | 'invalidated'
  | 'not_offered'
  | 'offered'
  | 'ready_to_report'

/** Coarse sympathy tiers derived from `QuestManager`'s numeric relation —
 *  see `RELATION_LEVEL_THRESHOLDS`. Ordered low to high. */
export type RelationLevel = 'stranger' | 'acquainted' | 'friendly' | 'trusted'

/** Minimum numeric relation for each level. Centralized here so availability
 *  gating and UI/tuning read a single source of truth (plan 093 Etap A/B). */
export const RELATION_LEVEL_THRESHOLDS: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 1,
  friendly: 3,
  trusted: 6,
}

/** Highest level first, so `relationToLevel` can return on the first match. */
const RELATION_LEVELS_DESCENDING: readonly RelationLevel[] = ['trusted', 'friendly', 'acquainted', 'stranger']

export function relationToLevel(relation: number): RelationLevel {
  for (const level of RELATION_LEVELS_DESCENDING) {
    if (relation >= RELATION_LEVEL_THRESHOLDS[level]) return level
  }
  return 'stranger'
}

/**
 * Quest-facing reference to a specific NPC.
 * Stable `npcId` is authoritative identity. Display name is not identity.
 * Runtime NPC objects are not quest state.
 *
 * @domain quests-progression
 */
export type QuestNpcRef = {
  npcId: NpcId
}

/** One authored gate on whether a `not_offered` quest may enter the offer
 *  lifecycle. All prerequisites on a quest combine with AND semantics;
 *  `quest_outcome.outcomeIds` is the only local OR (membership check). */
export type QuestPrerequisite =
  | { type: 'relation', npc: QuestNpcRef, minimum: RelationLevel }
  | { type: 'quest_outcome', questId: string, outcomeIds: readonly QuestOutcomeId[] }
  | { type: 'reputation', dimension: ReputationDimension, minimum: number }
  | { type: 'renown', minimum: number }
  /** One-hour deterministic evening window for quest offer only (plan
   *  quests-progression-021) — does not expire an accepted quest. */
  | { type: 'evening_offer_window', giverNpcId: NpcId }

/** Gates whether a quest is offered at all. Absent = always available
 *  (existing v2 quests keep their current behaviour). */
export type QuestAvailability = {
  prerequisites: readonly QuestPrerequisite[]
}

/**
 * Small optional offer-selection and active-capacity policy (plans
 * quests-progression-033 / quests-progression-034).
 * `QuestManager` exposes at most one `normal`-urgency offer per giver plus
 * one `urgent` offer beyond that cap; `priority` only breaks ties among
 * otherwise-equal ranked candidates (continuation/relation still dominate —
 * see `rankQuestOfferCandidates`). `exposure: 'story'` marks an authored
 * linear-history exception: it is never capped or delayed by the ranking,
 * and — since it represents a scripted beat rather than a spam-prone errand
 * — its offer cannot be generically declined (`QuestManager` omits
 * `QuestDialogOverride.offer.onDecline` for it).
 *
 * Ordinary `active`/`ready_to_report` giver quests also occupy a derived
 * per-giver slot (max 2). `urgency: 'urgent'` or `exposure: 'story'` is the
 * explicit bypass for that active cap — not every world-driven quest, and
 * never a heuristic inside `QuestManager`. Absent = `{ urgency: 'normal',
 * exposure: 'normal' }`.
 *
 * @domain quests-progression
 */
export type QuestOfferPolicy = {
  priority?: number
  urgency?: 'normal' | 'urgent'
  exposure?: 'normal' | 'story'
}

/**
 * Small optional opt-out policy for an `active` quest (plan
 * quests-progression-033). Absent = `{ allowed: true }` — ordinary quests
 * may be abandoned by the player with no automatic penalty. A story quest
 * that must not be generically abandoned sets `allowed: false` and instead
 * resolves withdrawal through its own authored outcomes/transitions.
 * `consequences` reuses `QuestConsequences` and applies exactly once, the
 * same way outcome consequences do — see `QuestManager.abandonQuest()`.
 *
 * @domain quests-progression
 */
export type QuestAbandonment = {
  allowed: boolean
  consequences?: QuestConsequences
}

const RELATION_LEVEL_ORDER: readonly RelationLevel[] = ['stranger', 'acquainted', 'friendly', 'trusted']
const RELATION_LEVEL_SET: ReadonlySet<RelationLevel> = new Set(RELATION_LEVEL_ORDER)
const REPUTATION_DIMENSIONS: ReadonlySet<ReputationDimension> = new Set([
  'benevolence',
  'competence',
  'courage',
  'integrity',
  'trust',
])

/** Whether `current` meets or exceeds the authored `minimum` tier. */
export function relationLevelMeetsMinimum(current: RelationLevel, minimum: RelationLevel): boolean {
  return RELATION_LEVEL_ORDER.indexOf(current) >= RELATION_LEVEL_ORDER.indexOf(minimum)
}

function relationLevelIndex(level: RelationLevel): number {
  return RELATION_LEVEL_ORDER.indexOf(level)
}

/**
 * Inclusive relation-tier window. Missing `minimum`/`maximum` is unbounded
 * on that side (plan quests-progression-050).
 *
 * @domain quests-progression
 */
export function relationLevelInInclusiveRange(
  current: RelationLevel,
  minimum?: RelationLevel,
  maximum?: RelationLevel,
): boolean {
  const idx = relationLevelIndex(current)
  if (minimum !== undefined && idx < relationLevelIndex(minimum)) return false
  if (maximum !== undefined && idx > relationLevelIndex(maximum)) return false
  return true
}

/**
 * Inclusive live-social gate on a quest dialogue reaction
 * (plan quests-progression-050). Conditions inside one reaction are ANDed.
 *
 * @domain quests-progression
 */
export type QuestDialogueReactionCondition =
  | { type: 'relation', npc: QuestNpcRef, minimum?: RelationLevel, maximum?: RelationLevel }
  | { type: 'reputation', dimension: ReputationDimension, minimum?: number, maximum?: number }

export type QuestDialogueCooldownSpec = {
  hours: number
  line: string
}

/**
 * Authored overlay on a conscious quest dialogue action or talk choice.
 * First matching `when` wins; no match keeps the base line/consequences.
 *
 * @domain quests-progression
 */
export type QuestDialogueReaction = {
  when: readonly QuestDialogueReactionCondition[]
  npcLine?: string
  consequences?: QuestConsequences
  cooldown?: QuestDialogueCooldownSpec
}

/**
 * Live values used to match `QuestDialogueReaction.when` at selection time.
 *
 * @domain quests-progression
 */
export type QuestDialogueReactionReads = {
  relationLevel: (npcId: NpcId) => RelationLevel
  reputation: (dimension: ReputationDimension) => number
}

function reactionConditionMatches(
  condition: QuestDialogueReactionCondition,
  reads: QuestDialogueReactionReads,
): boolean {
  if (condition.type === 'relation') {
    return relationLevelInInclusiveRange(
      reads.relationLevel(condition.npc.npcId),
      condition.minimum,
      condition.maximum,
    )
  }
  const value = reads.reputation(condition.dimension)
  if (condition.minimum !== undefined && value < condition.minimum) return false
  if (condition.maximum !== undefined && value > condition.maximum) return false
  return true
}

/**
 * First fully matching reaction, or `undefined` when none match.
 *
 * @domain quests-progression
 */
export function selectMatchingQuestDialogueReaction(
  reactions: readonly QuestDialogueReaction[] | undefined,
  reads: QuestDialogueReactionReads,
): { reaction: QuestDialogueReaction, index: number } | undefined {
  if (!reactions?.length) return undefined
  for (const [index, reaction] of reactions.entries()) {
    if (reaction.when.every((condition) => reactionConditionMatches(condition, reads))) {
      return { reaction, index }
    }
  }
  return undefined
}

const REPUTATION_MIN = -100
const REPUTATION_MAX = 100
const RENOWN_MIN = 0
const RENOWN_MAX = 100

export class QuestDefinitionValidationError extends Error {}

/** Validates final runtime quest definitions once, after composition-root
 *  settlement binding. Throws `QuestDefinitionValidationError` on invalid
 *  authored prerequisites, `talk_to_npc_choice` objectives, stage
 *  dialogue actions, dialogue reactions, or nonlinear stage flow — never
 *  clamps thresholds at runtime. */
export function validateQuestDefinitions(defs: readonly QuestDef[]): void {
  const byId = new Map(defs.map((def) => [def.id, def]))
  for (const def of defs) {
    validatePlayerDialogueLines(def)
    validateTalkToNpcChoiceObjective(def)
    validateStageDialogueActions(def)
    validateNonlinearStageFlow(def)
    validateWorldKnowledge(def)
    const prerequisites = def.availability?.prerequisites
    if (!prerequisites?.length) continue
    for (const prereq of prerequisites) {
      switch (prereq.type) {
        case 'evening_offer_window':
          break
        case 'quest_outcome': {
          if (prereq.questId === def.id) {
            throw new QuestDefinitionValidationError(`Quest "${def.id}" cannot depend on its own outcome`)
          }
          if (prereq.outcomeIds.length === 0) {
            throw new QuestDefinitionValidationError(`Quest "${def.id}" has an empty quest_outcome.outcomeIds`)
          }
          const referenced = byId.get(prereq.questId)
          if (!referenced) {
            throw new QuestDefinitionValidationError(`Quest "${def.id}" references unknown quest "${prereq.questId}"`)
          }
          for (const outcomeId of prereq.outcomeIds) {
            if (!referenced.outcomes.some((outcome) => outcome.id === outcomeId)) {
              throw new QuestDefinitionValidationError(
                `Quest "${def.id}" references unknown outcome "${outcomeId}" on "${prereq.questId}"`,
              )
            }
          }
          break
        }
        case 'relation':
          break
        case 'renown':
          if (!def.settlementId) {
            throw new QuestDefinitionValidationError(`Quest "${def.id}" has a renown prerequisite but no settlementId`)
          }
          if (prereq.minimum < RENOWN_MIN || prereq.minimum > RENOWN_MAX) {
            throw new QuestDefinitionValidationError(
              `Quest "${def.id}" renown minimum ${prereq.minimum} is outside ${RENOWN_MIN}..${RENOWN_MAX}`,
            )
          }
          break
        case 'reputation':
          if (!def.settlementId) {
            throw new QuestDefinitionValidationError(`Quest "${def.id}" has a reputation prerequisite but no settlementId`)
          }
          if (prereq.minimum < REPUTATION_MIN || prereq.minimum > REPUTATION_MAX) {
            throw new QuestDefinitionValidationError(
              `Quest "${def.id}" reputation minimum ${prereq.minimum} is outside ${REPUTATION_MIN}..${REPUTATION_MAX}`,
            )
          }
          break
      }
    }
  }
}

function validatePlayerDialogueLines(def: QuestDef): void {
  if (def.reportPlayerLine !== undefined && def.reportPlayerLine.trim().length === 0) {
    throw new QuestDefinitionValidationError(`Quest "${def.id}" reportPlayerLine is empty`)
  }
  if (def.reportPromptLine !== undefined && def.reportPromptLine.trim().length === 0) {
    throw new QuestDefinitionValidationError(`Quest "${def.id}" reportPromptLine is empty`)
  }
  for (const stage of def.stages) {
    if (stage.playerLine !== undefined && stage.playerLine.trim().length === 0) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" stage playerLine is empty`)
    }
  }
}

function validateTalkToNpcChoiceObjective(def: QuestDef): void {
  for (const [stageIndex, stage] of def.stages.entries()) {
    const slots = questStageObjectiveSlots(stage)
    for (const slot of slots) {
      const objective = slot.objective
      if (objective.type !== 'talk_to_npc_choice') continue
      if (slots.length > 1) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} talk_to_npc_choice is legacy/single-objective only`,
        )
      }
      if (objective.choices.length < 2) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" talk_to_npc_choice needs at least 2 choices`,
        )
      }
      const ids = objective.choices.map((choice) => choice.npc.npcId)
      if (new Set(ids).size !== ids.length) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" talk_to_npc_choice has duplicate npcId`,
        )
      }
      for (const choice of objective.choices) {
        if (choice.playerLine.trim().length === 0) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" talk_to_npc_choice is missing a playerLine for "${choice.npc.npcId}"`,
          )
        }
        if (!def.outcomes.some((outcome) => outcome.id === choice.outcomeId)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" talk_to_npc_choice references unknown outcome "${choice.outcomeId}"`,
          )
        }
        validateQuestDialogueReactions(
          def,
          choice.reactions,
          `talk_to_npc_choice "${choice.npc.npcId}"`,
        )
      }
    }
  }
}

function validateStageDialogueActions(def: QuestDef): void {
  for (const [stageIndex, stage] of def.stages.entries()) {
    const actions = stage.dialogueActions
    if (!actions) continue
    if (actions.length === 0) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" stage ${stageIndex} dialogueActions is empty`,
      )
    }
    for (const action of actions) {
      if (action.playerLine.trim().length === 0) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage dialogue action is missing a playerLine`,
        )
      }
      if (action.npcLine !== undefined && action.npcLine.trim().length === 0) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage dialogue action npcLine is empty`,
        )
      }
      if (!action.npc.npcId) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage dialogue action is missing an npc target`,
        )
      }
      if (action.blockedLine !== undefined && action.blockedLine.trim().length === 0) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage dialogue action blockedLine is empty`,
        )
      }
      if (action.transferItemCount) {
        if (!action.transferItemCount.toNpc.npcId) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage dialogue action transferItemCount is missing an npc target`,
          )
        }
        if (!Number.isFinite(action.transferItemCount.count) || action.transferItemCount.count <= 0) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage dialogue action transferItemCount count must be finite and > 0`,
          )
        }
      }
      validateQuestDialogueReactions(def, action.reactions, `stage ${stageIndex} dialogue action`)
    }
  }
}

function numericBoundInReputationRange(value: number | undefined, label: string, defId: string): void {
  if (value === undefined) return
  if (!Number.isFinite(value) || value < REPUTATION_MIN || value > REPUTATION_MAX) {
    throw new QuestDefinitionValidationError(
      `Quest "${defId}" ${label} ${value} is outside ${REPUTATION_MIN}..${REPUTATION_MAX}`,
    )
  }
}

function validateQuestDialogueReactions(
  def: QuestDef,
  reactions: readonly QuestDialogueReaction[] | undefined,
  context: string,
): void {
  if (!reactions) return
  for (const [reactionIndex, reaction] of reactions.entries()) {
    const where = `${context} reaction ${reactionIndex}`
    if (reaction.when.length === 0) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" ${where} has empty when`)
    }
    for (const condition of reaction.when) {
      if (condition.minimum === undefined && condition.maximum === undefined) {
        throw new QuestDefinitionValidationError(`Quest "${def.id}" ${where} condition needs a bound`)
      }
      if (condition.type === 'relation') {
        if (condition.minimum !== undefined && !RELATION_LEVEL_SET.has(condition.minimum)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" ${where} has unknown relation minimum "${String(condition.minimum)}"`,
          )
        }
        if (condition.maximum !== undefined && !RELATION_LEVEL_SET.has(condition.maximum)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" ${where} has unknown relation maximum "${String(condition.maximum)}"`,
          )
        }
        if (
          condition.minimum !== undefined
          && condition.maximum !== undefined
          && relationLevelIndex(condition.minimum) > relationLevelIndex(condition.maximum)
        ) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" ${where} relation minimum exceeds maximum`,
          )
        }
        if (!condition.npc.npcId) {
          throw new QuestDefinitionValidationError(`Quest "${def.id}" ${where} relation condition is missing an npc`)
        }
        continue
      }
      if (!REPUTATION_DIMENSIONS.has(condition.dimension)) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" ${where} has unknown reputation dimension "${String(condition.dimension)}"`,
        )
      }
      numericBoundInReputationRange(condition.minimum, `${where} reputation minimum`, def.id)
      numericBoundInReputationRange(condition.maximum, `${where} reputation maximum`, def.id)
      if (
        condition.minimum !== undefined
        && condition.maximum !== undefined
        && condition.minimum > condition.maximum
      ) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" ${where} reputation minimum exceeds maximum`,
        )
      }
    }
    if (reaction.npcLine !== undefined && reaction.npcLine.trim().length === 0) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" ${where} npcLine is empty`)
    }
    if (!reaction.cooldown) continue
    if (!Number.isFinite(reaction.cooldown.hours) || reaction.cooldown.hours <= 0) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" ${where} cooldown hours must be finite and > 0`,
      )
    }
    if (reaction.cooldown.line.trim().length === 0) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" ${where} cooldown line is empty`)
    }
  }
}

/**
 * Validates deferred world-knowledge slots, references and delays
 * (plan quests-progression-047).
 *
 * @domain quests-progression
 */
function validateWorldKnowledge(def: QuestDef): void {
  const slots = def.worldKnowledge ?? []
  const ids = new Set<string>()
  for (const slot of slots) {
    if (!slot.id || slot.id.trim().length === 0) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" has an empty world-knowledge id`)
    }
    if (ids.has(slot.id)) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" has duplicate world-knowledge id "${slot.id}"`)
    }
    ids.add(slot.id)
    if (!Number.isFinite(slot.revealDelayDays) || slot.revealDelayDays < 0) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" world-knowledge "${slot.id}" revealDelayDays must be finite and non-negative`,
      )
    }
    if (slot.bind.type !== 'landmark' || !slot.bind.kind) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" world-knowledge "${slot.id}" needs a landmark bind`,
      )
    }
    if (!slot.pendingPhrase.trim() || !slot.unavailablePhrase.trim()) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" world-knowledge "${slot.id}" is missing pending/unavailable copy`,
      )
    }
    if (slot.unavailablePolicy !== 'fail' && slot.unavailablePolicy !== 'ignore') {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" world-knowledge "${slot.id}" has an unknown unavailablePolicy`,
      )
    }
    if (slot.unavailablePolicy === 'fail') {
      const outcomeId = slot.unavailableOutcomeId
      const outcome = outcomeId
        ? def.outcomes.find((entry) => entry.id === outcomeId)
        : uniqueOutcomeForState(def, 'failed')
      if (!outcome || outcome.state !== 'failed') {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" world-knowledge "${slot.id}" fail policy needs a failed outcome`,
        )
      }
    }
  }

  const referenced = new Set<string>()
  const receiveIds = new Set<string>()
  const boundIds = new Set<string>()

  const noteEffect = (effect: QuestStageEffect): void => {
    if (effect.type !== 'request_world_knowledge') return
    referenced.add(effect.knowledgeId)
    if (!ids.has(effect.knowledgeId)) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" request_world_knowledge references unknown knowledge "${effect.knowledgeId}"`,
      )
    }
  }

  for (const effect of def.acceptEffects ?? []) noteEffect(effect)

  for (const [stageIndex, stage] of def.stages.entries()) {
    for (const effect of stage.effects ?? []) noteEffect(effect)
    for (const action of stage.dialogueActions ?? []) {
      for (const effect of action.effects ?? []) noteEffect(effect)
      const readyId = action.requireWorldKnowledgeReady
      if (readyId) {
        referenced.add(readyId)
        if (!ids.has(readyId)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} dialogue action references unknown knowledge "${readyId}"`,
          )
        }
      }
    }
    for (const slot of questStageObjectiveSlots(stage)) {
      const objective = slot.objective
      if (objective.type === 'receive_world_knowledge') {
        referenced.add(objective.knowledgeId)
        receiveIds.add(objective.knowledgeId)
        if (!ids.has(objective.knowledgeId)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" receive_world_knowledge references unknown knowledge "${objective.knowledgeId}"`,
          )
        }
        if (!objective.npc.npcId) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" receive_world_knowledge "${objective.knowledgeId}" is missing an npc target`,
          )
        }
      }
      if (objective.type === 'interact_bound_landmark') {
        referenced.add(objective.knowledgeId)
        boundIds.add(objective.knowledgeId)
        if (!ids.has(objective.knowledgeId)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" interact_bound_landmark references unknown knowledge "${objective.knowledgeId}"`,
          )
        }
      }
    }
  }

  for (const outcome of def.outcomes) {
    for (const effect of outcome.effects ?? []) noteEffect(effect)
  }

  for (const knowledgeId of boundIds) {
    if (receiveIds.has(knowledgeId)) continue
    throw new QuestDefinitionValidationError(
      `Quest "${def.id}" interact_bound_landmark "${knowledgeId}" has no receive_world_knowledge stage`,
    )
  }

  for (const slot of slots) {
    if (!referenced.has(slot.id)) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" world-knowledge "${slot.id}" is never referenced`,
      )
    }
  }
}

/**
 * Validates multi-objective slots, result ids and forward-only transitions
 * (plan quests-progression-032).
 *
 * @domain quests-progression
 */
function validateNonlinearStageFlow(def: QuestDef): void {
  const stageIds = new Map<string, number>()
  for (const [stageIndex, stage] of def.stages.entries()) {
    if (stage.id === undefined) continue
    if (stage.id.trim().length === 0) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" stage ${stageIndex} id is empty`)
    }
    if (stageIds.has(stage.id)) {
      throw new QuestDefinitionValidationError(`Quest "${def.id}" has duplicate stage id "${stage.id}"`)
    }
    stageIds.set(stage.id, stageIndex)
  }

  for (const [stageIndex, stage] of def.stages.entries()) {
    if (stage.objectives) {
      if (stage.objectives.length < 2) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} objectives must have at least 2 slots`,
        )
      }
      if (stage.mode !== 'all' && stage.mode !== 'any') {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} with multiple objectives requires mode 'all' or 'any'`,
        )
      }
    }

    const slots = questStageObjectiveSlots(stage)
    const slotIds = new Set<string>()
    const slotResultIds = new Set<string>()
    for (const slot of slots) {
      if (!slot.id || slot.id.trim().length === 0) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} has an empty objective slot id`,
        )
      }
      if (slotIds.has(slot.id)) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} has duplicate objective slot id "${slot.id}"`,
        )
      }
      slotIds.add(slot.id)
      if (slot.resultId !== undefined) {
        if (slot.resultId.trim().length === 0) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} slot "${slot.id}" resultId is empty`,
          )
        }
        if (slotResultIds.has(slot.resultId)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} has duplicate slot resultId "${slot.resultId}"`,
          )
        }
        slotResultIds.add(slot.resultId)
      }
      if (
        slots.length > 1
        && (slot.objective.type === 'talk_to_npc_choice' || slot.objective.type === 'await_quest_outcome')
      ) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} ${slot.objective.type} is legacy/single-objective only`,
        )
      }
    }

    const transitions = stage.transitions
    if (!transitions) continue
    if (transitions.length === 0) {
      throw new QuestDefinitionValidationError(
        `Quest "${def.id}" stage ${stageIndex} transitions is empty`,
      )
    }

    const transitionResultIds = new Set<string>()
    let hasDefault = false
    for (const transition of transitions) {
      const hasStage = transition.toStageId !== undefined
      const hasOutcome = transition.toOutcomeId !== undefined
      if (hasStage === hasOutcome) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} transition must target exactly one of toStageId or toOutcomeId`,
        )
      }
      if (transition.resultId !== undefined) {
        if (transition.resultId.trim().length === 0) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} transition resultId is empty`,
          )
        }
        if (transitionResultIds.has(transition.resultId)) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} has duplicate transition resultId "${transition.resultId}"`,
          )
        }
        transitionResultIds.add(transition.resultId)
        const allowed = questStageMode(stage) === 'all'
          ? stage.resultId === transition.resultId
          : slotResultIds.has(transition.resultId)
        if (!allowed) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} transition references unknown resultId "${transition.resultId}"`,
          )
        }
      } else if (hasDefault) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} has more than one default transition`,
        )
      } else {
        hasDefault = true
      }
      if (transition.toStageId !== undefined) {
        const targetIndex = stageIds.get(transition.toStageId)
        if (targetIndex === undefined) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} transition references unknown stage "${transition.toStageId}"`,
          )
        }
        if (targetIndex <= stageIndex) {
          throw new QuestDefinitionValidationError(
            `Quest "${def.id}" stage ${stageIndex} transition to "${transition.toStageId}" is not forward-only`,
          )
        }
      }
      if (
        transition.toOutcomeId !== undefined
        && !def.outcomes.some((outcome) => outcome.id === transition.toOutcomeId)
      ) {
        throw new QuestDefinitionValidationError(
          `Quest "${def.id}" stage ${stageIndex} transition references unknown outcome "${transition.toOutcomeId}"`,
        )
      }
    }
  }
}

export type QuestOutcomeId = string

/** Direct player compensation — items/coins. Relation/reputation/renown
 *  belong on `QuestConsequences`, never here. */
export type QuestReward = {
  visibility: 'shown' | 'hidden'
  items?: ReadonlyArray<{ kind: ItemKind, count: number }>
}

/** Changes to other systems: player↔NPC relation and settlement
 *  reputation/renown. Applied by `QuestManager` on terminal resolution or
 *  non-terminal stage dialogue-action selection. */
export type QuestConsequences = {
  relations?: ReadonlyArray<{ npc: QuestNpcRef, delta: number }>
  social?: {
    reputation?: Partial<Record<ReputationDimension, number>>
    renown?: number
  }
}

export type QuestOutcome = {
  id: QuestOutcomeId
  state: 'complete' | 'failed'
  resultText?: string
  reward?: QuestReward
  consequences?: QuestConsequences
  /** World mutations applied exactly once with this terminal outcome
   *  (plan quests-progression-029). `reward` / `consequences` stay sugar. */
  effects?: readonly QuestStageEffect[]
}

/** Stage-local progress for one objective slot (plan quests-progression-032).
 *
 *  @domain quests-progression */
export type QuestStageSlotProgress = {
  completed?: boolean
  count?: number
}

/** One heard-line stamp (plan ui-input-021). Content is never persisted —
 *  `list()` projects it from the live `QuestDef`. */
export type QuestJournalKind = 'offer' | 'progress' | 'result'

export type QuestJournalEvent = {
  kind: QuestJournalKind
  /** Completing stage for `progress`. */
  stageIndex?: number
  /** Selected `dialogueActions` index when the stamp is that NPC line, not `progressLine`. */
  dialogueActionIndex?: number
  /**
   * Selected reaction overlay on that dialogue action
   * (plan quests-progression-050). Absent on older saves; `list()` then
   * projects the base `npcLine`.
   */
  dialogueReactionIndex?: number
  /**
   * Distinguishes multiple progress stamps on the same stage (plan
   * quests-progression-047) — pending research vs later reveal. Absent on
   * older saves; `list()` projects text from the live def.
   */
  stampId?: string
  speakerNpcId?: NpcId
  atDays: number
  timeOfDay: number
}

/** One world-hour expressed in `QuestWorldTimeLookup.getElapsedDays()` units. */
export const WORLD_KNOWLEDGE_HOUR_DAYS = 1 / 24

/**
 * Stable knowledge about a static world place. V1 is landmark-only; later
 * settlement/cave refs can extend this union without replacing the mechanism.
 *
 * @domain quests-progression
 */
export type QuestWorldKnowledgeRef = {
  kind: 'landmark'
  landmarkId: string
  landmarkKind: LandmarkKind
  /** Presentation pose from the research result; omitted on older saves. */
  x?: number
  z?: number
}

/**
 * How QuestManager binds a knowledge slot to the world. `landmarkId` is the
 * already-chosen identity (generated quests / story truth); absent id means
 * the injected resolver searches by `kind`.
 *
 * @domain quests-progression
 */
export type QuestWorldKnowledgeBind = {
  type: 'landmark'
  kind: LandmarkKind
  landmarkId?: string
}

/**
 * Authored deferred-knowledge slot. Terrain lookup stays in the injected
 * world resolver — this is identity, delay and fallback copy only.
 *
 * @domain quests-progression
 */
export type QuestWorldKnowledgeDef = {
  id: string
  revealDelayDays: number
  bind: QuestWorldKnowledgeBind
  pendingPhrase: string
  unavailablePhrase: string
  /** `fail` applies `unavailableOutcomeId` or the unique failed outcome. */
  unavailablePolicy: 'fail' | 'ignore'
  unavailableOutcomeId?: QuestOutcomeId
}

/**
 * Persisted research/binding progress for one knowledge slot. Promises and
 * worker handles are never stored (plan quests-progression-047).
 *
 * @domain quests-progression
 */
export type QuestWorldKnowledgeProgress = {
  requestedAtDays: number
  revealAtDays: number
  status: 'requested' | 'resolved' | 'unavailable'
  /** Player has received the concrete clue. */
  revealed?: boolean
  ref?: QuestWorldKnowledgeRef
}

/** Persisted/runtime quest progress. `resolvedOutcomeId` is set only for
 *  `complete`/`failed`; `invalidated` and in-progress states omit it. */
export type QuestProgressEntry = {
  id: string
  state: QuestState
  stageIndex: number
  resolvedOutcomeId?: QuestOutcomeId
  /** Stage-local counted objective progress (plan quests-progression-020).
   *  Legacy single-objective stages only; multi-objective stages use
   *  `stageSlotProgress`. */
  stageCount?: number
  /** Per-slot progress for the current multi-objective stage, keyed by
   *  stable slot id (plan quests-progression-032). Absent = empty. */
  stageSlotProgress?: Record<string, QuestStageSlotProgress>
  /** Decline cooldown (plan quests-progression-033) — world-clock day
   *  (`QuestWorldTimeLookup.getElapsedDays()`) before which this `not_offered`
   *  entry is skipped by offer-candidate discovery, so a just-declined offer
   *  doesn't reappear on the very next conversation. Only ever set on a
   *  `not_offered` entry; cleared implicitly once the offer is re-admitted.
   *  Absent on older saves = unsuppressed. */
  offerSuppressedUntilDay?: number
  /** Heard-line timestamps (plan ui-input-021). Absent on older saves = none. */
  journal?: readonly QuestJournalEvent[]
  /**
   * Deferred world-knowledge slots keyed by authored knowledge id
   * (plan quests-progression-047). Absent on older saves = unrequested.
   */
  worldKnowledge?: Record<string, QuestWorldKnowledgeProgress>
  /**
   * Quest-topic dialogue cooldown keyed by NPC id
   * (plan quests-progression-050). Absolute `untilDay` from
   * `QuestWorldTimeLookup.getElapsedDays()`. Absent on older saves = none.
   */
  dialogueCooldowns?: Record<NpcId, QuestDialogueCooldown>
}

/**
 * Persisted quest-topic cooldown coordinates. Copy is projected from the
 * live def; quote text is not stored.
 *
 * @domain quests-progression
 */
export type QuestDialogueCooldown = {
  untilDay: number
  stageIndex: number
  actionIndex: number
  reactionIndex: number
}

export const QUEST_STATES: ReadonlySet<QuestState> = new Set([
  'abandoned',
  'active',
  'complete',
  'failed',
  'invalidated',
  'not_offered',
  'offered',
  'ready_to_report',
])

/** The single authored outcome whose `state` matches, or `undefined` when
 *  zero or more than one match — callers must not guess. */
export function uniqueOutcomeForState(
  def: { outcomes: readonly QuestOutcome[] },
  state: 'complete' | 'failed',
): QuestOutcome | undefined {
  const matches = def.outcomes.filter((outcome) => outcome.state === state)
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * Outcome id for a world source that resolved without the player completing
 * the objective (plan quests-progression-030). Prefer this named outcome over
 * `uniqueOutcomeForState(..., 'failed')` when multiple failed outcomes exist.
 *
 * @domain quests-progression
 */
export const RESOLVED_WITHOUT_PLAYER_OUTCOME = 'resolved_without_player'

/**
 * Selects the terminal outcome when a world-driven source becomes `resolved`
 * while the quest is still `active`. Prefers an authored
 * `resolved_without_player` id; otherwise the unique failed outcome.
 *
 * @domain quests-progression
 */
export function externalResolutionOutcome(
  def: { outcomes: readonly QuestOutcome[] },
): QuestOutcome | undefined {
  return def.outcomes.find((outcome) => outcome.id === RESOLVED_WITHOUT_PLAYER_OUTCOME)
    ?? uniqueOutcomeForState(def, 'failed')
}

/** Whether `consequences` carries an actual reputation/renown delta, not
 *  just an authored-but-empty `social` field (plan quests-progression-019) —
 *  used by `QuestManager.hasSocialOutcomeClaim` to decide whether a quest
 *  "owns" the social outcome of a kill it also tracks. */
export function hasSocialConsequence(consequences: QuestConsequences | undefined): boolean {
  const social = consequences?.social
  if (!social) return false
  if (social.renown !== undefined && social.renown !== 0) return true
  return Object.values(social.reputation ?? {}).some((delta) => delta !== undefined && delta !== 0)
}

export type QuestObjective =
  | { type: 'talk_to_npc', npc: QuestNpcRef }
  /** Talking to one of the authored NPCs presents a player dialogue action
   *  (plan quests-progression-014). Selecting that action resolves through
   *  the same outcome path as other terminals — not a dialogue tree. The
   *  giver may also be a choice target, so `QuestManager.onInteract`
   *  dispatches this before the giver reminder. Mere `[E]` / menu open does
   *  not select the outcome. */
  | {
      type: 'talk_to_npc_choice'
      choices: readonly {
        npc: QuestNpcRef
        outcomeId: QuestOutcomeId
        /** Player-facing declaration shown as the dialogue action. */
        playerLine: string
        /** Optional NPC prompt shown before the player speaks. */
        npcLine?: string
        /**
         * Selection-time relation/reputation overlays
         * (plan quests-progression-050). First match wins.
         */
        reactions?: readonly QuestDialogueReaction[]
      }[]
    }
  | { type: 'interact_well' }
  | { type: 'interact_tree' }
  /** `spawnerId` binds this stage to one stable `PreySpawner.id`. Absent =
   *  any habitat of `spawnerType` (plan quests-progression-014). */
  | { type: 'interact_spawner', spawnerType: SpawnerType, spawnerId?: string }
  /** `range` (plan 153) overrides the flat `INTERACT_RANGE`/`GAZE_RANGE` for
   *  this one objective's target — needed for skittish species (e.g. the
   *  stag's `fleeRange: 15`, `fauna/AnimalAgent.ts`) that would otherwise
   *  flee before the player can ever get within normal interact range.
   *  Threaded through `buildInteractables`/`pickInGaze`, not a change to the
   *  global constants or the animal's own AI. */
  | { type: 'spot_animal', kind: AnimalKind, range?: number }
  | { type: 'gather_item', kind: ItemKind, count: number }
  /** Player knife-harvest count for a species (plan quests-progression-020) —
   *  incremented from a player-only reporting seam, not inventory counts. */
  | { type: 'harvest_animals', kind: AnimalKind, count: number }
  /** Successful loose-food consumption near a habitat spawner (plan
   *  quests-progression-020 / fauna-023). */
  | {
      type: 'feed_habitat_animals'
      spawnerId: string
      kinds: readonly AnimalKind[]
      count: number
      foodKinds: readonly ItemKind[]
    }
  /** "A dangerous wolf" (plan 093 Etap D) — defined by kind, but
   *  `QuestManager` binds it to one concrete `AnimalAgent.animalId` the
   *  moment this stage becomes active (via an injected resolver, not by
   *  importing fauna itself), so only that individual's death clears it. */
  | {
      type: 'kill_target_animal'
      kind: AnimalKind
      /** When true, `QuestManager` marks the bound individual with
       *  `AnimalAgent.markDangerous()` at bind time (plan 110) — a visible,
       *  gameplay-distinct individual, not a separate animal type. */
      dangerous?: boolean
    }
  /** The wolf den's whole initial pack is dead (plan 093 Etap E) — reported
   *  by `Fauna.isWolfDenCleared()`, not per-individual like `animal_died`,
   *  since the den (not one wolf) is the world entity with identity here. */
  | { type: 'clear_wolf_den', denId: string }
  /** "A lost farm animal" (plan 093 Etap G) — like `kill_target_animal`,
   *  defined by kind and bound to one concrete `AnimalAgent.animalId` when
   *  the stage becomes active, but cleared by the player finding it (an
   *  `[E]` interact reporting `animal_found`) rather than killing it. The
   *  resolver searches settlement livestock as well as wild fauna, so
   *  `kind` alone is enough to pick the right population (sheep/chicken/etc.
   *  only ever exist as livestock; wolf/deer/etc. only ever exist as wild
   *  fauna) — no separate "owned" objective shape needed. If the bound
   *  individual dies before being found, `QuestManager` transitions the
   *  quest to `failed` instead of `ready_to_report` (plan 110). */
  | { type: 'find_animal', kind: AnimalKind }
  /** Investigate/report on one specific procedural landmark (plan 132) —
   *  cleared by an `[E]` interact within range while this is the active
   *  stage. `landmarkId` is resolved once, before the quest is added to
   *  `QuestManager`, by a bounded deterministic world-layer search
   *  (`ChunkManager.findLandmarkNear`, see `buildLandmarkQuests` below) —
   *  never a hardcoded world coordinate, so the same quest binds to a
   *  different real placement per world seed. Landmarks never change once
   *  generated, so unlike `kill_target_animal`/`find_animal` this needs no
   *  runtime resolver injected into `QuestManager` and no restore-time
   *  rebinding/invalidation: `buildLandmarkQuests` re-resolves the identical
   *  `landmarkId` on every app boot (same seed, same deterministic search),
   *  so a persisted `active` quest matches its rebuilt `QuestDef` by `id`
   *  exactly like every other quest. */
  | { type: 'interact_landmark', landmarkId: string }
  /**
   * Return to `npc` to receive a deferred world-knowledge clue after both
   * binding resolution and the authored world-time delay (plan
   * quests-progression-047). Pending talk is informational; the conscious
   * action appears only when both conditions are met.
   */
  | { type: 'receive_world_knowledge', knowledgeId: string, npc: QuestNpcRef }
  /**
   * Investigate the landmark persisted in knowledge slot `knowledgeId`.
   * Distinct from `interact_landmark` so definitions never use placeholder ids.
   *
   * @domain quests-progression
   */
  | { type: 'interact_bound_landmark', knowledgeId: string }
  /** Settlement storage rat infestation resolved (plan quests-progression-006) —
   *  satisfied when the bound settlement's storage infestation is repaired and
   *  alive rat count is <= 1. `QuestManager` reads live world state through
   *  an injected lookup, never by importing settlement/fauna managers. */
  | { type: 'resolve_storage_rat_infestation' }
  /** Permanent habitat destruction (plan quests-progression-007) — cleared when
   *  the real spawn point is `disabled` with no recovery (`canRecover === false`).
   *  `spawnerId` may be a stable logical id such as `WOLF_DEN_ID`. */
  | { type: 'destroy_spawn_point', spawnerId: string }
  /** Physical item read action (plan quests-progression-009) — cleared when the
   *  player uses the item's inventory action while this stage is active, or
   *  on restore when the persisted read flag is already set. */
  | { type: 'read_item', itemKind: ItemKind }
  /** Player knowledge includes the location (plan quests-progression-009) —
   *  satisfied by proximity discovery, map reveal, or other knowledge seams. */
  | { type: 'discover_location', locationId: string }
  /** Authored treasure payload removed from a world-generated container (plan
   *  quests-progression-009) — not satisfied by merely opening the UI. */
  | { type: 'loot_world_container', containerId: string }
  /** One-shot Hidden Find / authored grave spot resolved (plan quests-progression-008). */
  | { type: 'recover_hidden_find', spotId: string }
  /** Player inventory currently holds this exact item instance. */
  | { type: 'own_item_instance', instanceId: string }
  /** Player picked up the exact portable container (plan quests-progression-008). */
  | { type: 'acquire_portable_container', containerId: string }
  /** Terminal stage — only `resolveQuest` / physical hooks may finish the quest. */
  | { type: 'await_quest_outcome' }
  /** Lost household livestock recovered from world state (plan fauna-024) —
   *  not `find_animal` (death is not failure). `animalId` is the existing
   *  persistent livestock identity bound at materialization. */
  | { type: 'recover_lost_livestock', animalId: string }
  /** Manual lighting of canonical settlement torches and campfire (plan
   *  quests-progression-021) — reads settlement-owned lit state only. */
  | {
      type: 'light_settlement_fires'
      settlementId: string
      torchIds: readonly string[]
      requireCampfire: boolean
    }

/**
 * Player-facing speech available while this stage is active. Selection
 * advances the current stage through `QuestManager.advanceStage()` without
 * resolving the quest. Optional consequences apply on selection only.
 *
 * @domain quests-progression
 */
/** Side effect applied once when a stage dialogue action or `talk_to_npc`
 *  selection advances the quest, or when a terminal outcome is applied
 *  (plan quests-progression-023 / quests-progression-029). */
export type QuestStageEffect =
  | { type: 'reveal_location', locationId: string, setNavigation?: boolean }
  | { type: 'transfer_item_instance', instanceId: string, toNpc: QuestNpcRef }
  | { type: 'transfer_animal_ownership', animalId: string }
  | { type: 'discard_carried_container', containerId: string }
  /**
   * Start one deferred world-knowledge request exactly once
   * (plan quests-progression-047).
   */
  | { type: 'request_world_knowledge', knowledgeId: string }

export type QuestStageDialogueAction = {
  npc: QuestNpcRef
  playerLine: string
  npcLine?: string
  consequences?: QuestConsequences
  /** When set, selecting this action tries resolving the outcome physically first. */
  physicalOutcomeId?: QuestOutcomeId
  requireCarriedContainerId?: string
  requireCarriedUnopened?: boolean
  /** Player must own this exact item instance (plan quests-progression-023). */
  requireItemInstanceId?: string
  /**
   * Atomic Player → NPC stacked transfer before effects/outcome
   * (plan quests-progression-039). Does not hide the action when the player
   * cannot pay — selection fails with `blockedLine` and mutates nothing.
   */
  transferItemCount?: { kind: ItemKind, count: number, toNpc: QuestNpcRef }
  /** Spoken when `transferItemCount` cannot complete. */
  blockedLine?: string
  effects?: readonly QuestStageEffect[]
  /**
   * Show this action only when knowledge `id` is resolved, the authored delay
   * has elapsed, and the clue has not yet been received
   * (plan quests-progression-047).
   */
  requireWorldKnowledgeReady?: string
  /**
   * Apply effects/journal without advancing the stage — used when a clue is
   * optional alongside an already-active world investigation.
   */
  skipAdvance?: boolean
  /**
   * Selection-time relation/reputation overlays
   * (plan quests-progression-050). First match wins.
   */
  reactions?: readonly QuestDialogueReaction[]
}

export type QuestLocationReveal = (
  locationId: string,
  options?: { setNavigation?: boolean },
) => void

/** Legacy single-`objective` stages normalize to this slot id. */
export const LEGACY_QUEST_OBJECTIVE_SLOT_ID = 'primary'

export type QuestObjectiveSlotId = string

export type QuestStageMode = 'all' | 'any'

/**
 * One objective in a stage. Multi-objective stages declare these explicitly;
 * a legacy `QuestStage.objective` normalizes to `{ id: 'primary', objective }`.
 *
 * @domain quests-progression
 */
export type QuestStageObjectiveSlot = {
  id: QuestObjectiveSlotId
  objective: QuestObjective
  /** Used by `any` transitions when this slot is the one that completes the stage. */
  resultId?: string
}

/**
 * Declarative jump after a stage completes. Exactly one of `toStageId` or
 * `toOutcomeId`. Absent `resultId` is the default path. Targets are
 * forward-only stage ids or authored outcomes — not a graph engine.
 *
 * @domain quests-progression
 */
export type QuestStageTransition = {
  resultId?: string
  toStageId?: string
  toOutcomeId?: QuestOutcomeId
}

export type QuestStage = {
  /** Stable id for transition targets. Required only when referenced. */
  id?: string
  objective: QuestObjective
  /**
   * Full objective list. When present it is the authority and must have at
   * least two slots; otherwise `objective` is the sole legacy slot.
   *
   * @domain quests-progression
   */
  objectives?: readonly QuestStageObjectiveSlot[]
  /** Required when `objectives` has two or more entries. */
  mode?: QuestStageMode
  /** Stage-level result used when an `all` stage completes. */
  resultId?: string
  /** Forward jumps after this stage completes. Absent = linear next stage. */
  transitions?: readonly QuestStageTransition[]
  /** Shown in the quest log for this stage. */
  description: string
  /** Giver's line while this stage is the active one (not yet cleared). */
  reminderLine: string
  /** Spoken at the point the objective is cleared — by the target NPC for
   *  `talk_to_npc` after the player dialogue action, or as discovery text
   *  at the world object for world-interaction objectives. Not used for
   *  `gather_item` (cleared and reported in the same giver conversation —
   *  see `QuestManager`). */
  progressLine?: string
  /** Player-facing line for a conscious `talk_to_npc` / gather hand-in
   *  action (plan quests-progression-014). Absent = a generic spoken action. */
  playerLine?: string
  /** Reported when the stage transitions to `failed` (e.g. a `find_animal`
   *  target dies before being found). Falls back to a generic line in
   *  `QuestManager` when absent. */
  failLine?: string
  /** Alternate conscious replies while this stage is active
   *  (plan quests-progression-018). Not a second objective. */
  dialogueActions?: readonly QuestStageDialogueAction[]
  /** Executed once when this stage's primary `talk_to_npc` action advances
   *  (plan quests-progression-023). */
  effects?: readonly QuestStageEffect[]
}

/**
 * Normalized objective slots for a stage. Legacy `objective` becomes one
 * slot named `primary`. Accepts authored or runtime stages.
 *
 * @domain quests-progression
 */
export function questStageObjectiveSlots<O>(stage: {
  objective: O
  objectives?: readonly { id: string, objective: O, resultId?: string }[]
  resultId?: string
}): readonly { id: string, objective: O, resultId?: string }[] {
  if (stage.objectives && stage.objectives.length > 0) return stage.objectives
  return [{
    id: LEGACY_QUEST_OBJECTIVE_SLOT_ID,
    objective: stage.objective,
    ...(stage.resultId ? { resultId: stage.resultId } : {}),
  }]
}

/** `all` for legacy/single-objective stages; otherwise the authored mode. */
export function questStageMode(stage: QuestStage): QuestStageMode {
  return questStageObjectiveSlots(stage).length <= 1 ? 'all' : (stage.mode ?? 'all')
}

export function isLegacySingleObjectiveStage(stage: QuestStage): boolean {
  return !stage.objectives || stage.objectives.length === 0
}

/**
 * Event-based slots persist completion/count. World-state slots are
 * reconstructed from authoritative domain lookups after restore.
 *
 * @domain quests-progression
 */
export function objectiveNeedsPersistedSlotProgress(objective: QuestObjective): boolean {
  switch (objective.type) {
    case 'acquire_portable_container':
    case 'destroy_spawn_point':
    case 'discover_location':
    case 'light_settlement_fires':
    case 'loot_world_container':
    case 'own_item_instance':
    case 'read_item':
    case 'recover_hidden_find':
    case 'recover_lost_livestock':
    case 'resolve_storage_rat_infestation':
      return false
    default:
      return true
  }
}

export function matchStageTransition(
  stage: QuestStage | undefined,
  resultId: string | undefined,
): QuestStageTransition | undefined {
  const transitions = stage?.transitions
  if (!transitions?.length) return undefined
  if (resultId) {
    const named = transitions.find((transition) => transition.resultId === resultId)
    if (named) return named
  }
  return transitions.find((transition) => transition.resultId === undefined)
}

export type QuestDef = {
  id: string
  title: string
  description: string
  /** Presentation-only giver display name. Not identity — see `giver`. */
  giverName: string
  /**
   * Stable NPC identity of the quest giver. Display name is not identity;
   * runtime NPC references are not quest state.
   *
   * @domain quests-progression
   */
  giver: QuestNpcRef
  offerLine: string
  stages: readonly QuestStage[]
  /** Giver's line once every stage is cleared and the player reports back. */
  reportLine: string
  /** Player-facing report / hand-in line (plan quests-progression-014). */
  reportPlayerLine?: string
  /** NPC prompt shown before the player reports (plan quests-progression-014). */
  reportPromptLine?: string
  /** Availability prerequisites; quest stays `not_offered` and hidden from
   *  the giver/log until every prerequisite is met (plan 093 Etap A,
   *  quests-progression-004). */
  availability?: QuestAvailability
  /** Which settlement this quest's giver/story belongs to — absent for every
   *  quest defined here (this file stays world-agnostic); the composition
   *  root attaches it once per quest, from the real settlement the giver
   *  lives in, before constructing `QuestManager` (plan quests-progression-001,
   *  see `createApp.ts`). Required for an outcome's `consequences.social` to
   *  ever apply — a quest with deltas but no resolved settlement applies
   *  nothing. */
  settlementId?: string
  /** When set, a successful `complete` outcome transfers this persistent
   *  animal to the player before terminal quest state is committed (plan
   *  quests-progression-012). Bound at composition root — never parsed from
   *  naming conventions in authored data here. */
  horseRewardAnimalId?: string
  /** Authored terminal results. Objective completion is not resolution —
   *  a caller picks one of these. `invalidated` is not an outcome. */
  outcomes: readonly QuestOutcome[]
  /** Offer-selection policy (plan quests-progression-033). Absent = normal
   *  urgency/exposure, no authored priority. */
  offer?: QuestOfferPolicy
  /**
   * Live offer text derived from current relation/reputation/outcomes.
   * When set, presentation uses this instead of the static `offerLine`.
   * The result is never persisted.
   *
   * @domain quests-progression
   */
  resolveOfferLine?: (input: {
    getNpcRelation: (npcId: NpcId) => number
    resolvedOutcomeId: (questId: string) => QuestOutcomeId | undefined
    getReputationDimension: (dimension: ReputationDimension) => number
  }) => string
  /** Active-quest opt-out policy (plan quests-progression-033). Absent =
   *  abandonable with no automatic consequence. */
  abandonment?: QuestAbandonment
  /**
   * Authored deferred world-knowledge slots (plan quests-progression-047).
   * Immediate-known-place quests omit this entirely.
   */
  worldKnowledge?: readonly QuestWorldKnowledgeDef[]
  /** Applied exactly once when the player accepts the offer. */
  acceptEffects?: readonly QuestStageEffect[]
}

/** Small quest-facing facts `QuestManager` computes per `not_offered`
 *  candidate before ranking — never world-domain detail (wolf counts, water
 *  stock, …); a source system that wants to influence ranking expresses it
 *  through `QuestOfferPolicy.priority`/`urgency` on the materialized def
 *  instead (plan quests-progression-033).
 *
 * @domain quests-progression
 */
export type QuestOfferRankSignal = {
  def: QuestDef
  urgency: 'normal' | 'urgent'
  /** Whether this candidate authored-continues an already-resolved quest
   *  (a `quest_outcome` availability prerequisite) — ranked above a fresh
   *  errand competing for the same giver's offer slot. */
  isStoryContinuation: boolean
  /** Player↔NPC relation toward the giver — see `QuestManager.getRelation`. */
  relation: number
  /** Authored/source tie-break signal — `QuestOfferPolicy.priority`, default 0. */
  priority: number
}

/**
 * Deterministic offer-candidate order — pure, no quest state of its own.
 * `urgent` candidates sort above `normal` ones; within a tier: story
 * continuation, then relation, then authored `priority`, then a stable
 * `QuestDef.id` tie-break. No randomness (plan quests-progression-033).
 *
 * @domain quests-progression
 */
export function rankQuestOfferCandidates(
  candidates: readonly QuestOfferRankSignal[],
): readonly QuestDef[] {
  return [...candidates]
    .sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === 'urgent' ? -1 : 1
      if (a.isStoryContinuation !== b.isStoryContinuation) return a.isStoryContinuation ? -1 : 1
      if (a.relation !== b.relation) return b.relation - a.relation
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0
    })
    .map((signal) => signal.def)
}

export type AuthoredQuestObjective =
  | { type: 'talk_to_npc', npcName: string }
  | {
      type: 'talk_to_npc_choice'
      choices: readonly {
        npcName: string
        outcomeId: QuestOutcomeId
        playerLine: string
        npcLine?: string
        reactions?: readonly AuthoredQuestDialogueReaction[]
      }[]
    }
  | { type: 'receive_world_knowledge', knowledgeId: string, npcName: string }
  | Exclude<
      QuestObjective,
      | { type: 'talk_to_npc' }
      | { type: 'talk_to_npc_choice' }
      | { type: 'receive_world_knowledge' }
    >

export type AuthoredQuestPrerequisite =
  | { type: 'relation', npcName: string, minimum: RelationLevel }
  | Exclude<QuestPrerequisite, { type: 'relation' }>

export type AuthoredQuestConsequences = Omit<QuestConsequences, 'relations'> & {
  relations?: ReadonlyArray<{ npcName: string, delta: number }>
}

export type AuthoredQuestDialogueReactionCondition =
  | { type: 'relation', npcName: string, minimum?: RelationLevel, maximum?: RelationLevel }
  | { type: 'reputation', dimension: ReputationDimension, minimum?: number, maximum?: number }

/**
 * Authored overlay on a dialogue action or talk choice. NPC names bind at
 * composition-root materialization (plan quests-progression-050).
 *
 * @domain quests-progression
 */
export type AuthoredQuestDialogueReaction = {
  when: readonly AuthoredQuestDialogueReactionCondition[]
  npcLine?: string
  consequences?: AuthoredQuestConsequences
  cooldown?: QuestDialogueCooldownSpec
}

/**
 * Authored stage dialogue action. `npcName` is bound to `QuestNpcRef` at
 * composition-root materialization — never matched by display name at runtime.
 *
 * @domain quests-progression
 */
export type AuthoredQuestStageDialogueAction = {
  npcName: string
  playerLine: string
  npcLine?: string
  consequences?: AuthoredQuestConsequences
  physicalOutcomeId?: string
  requireCarriedContainerId?: string
  requireCarriedUnopened?: boolean
  requireItemInstanceId?: string
  effects?: readonly QuestStageEffect[]
  requireWorldKnowledgeReady?: string
  skipAdvance?: boolean
  reactions?: readonly AuthoredQuestDialogueReaction[]
}

export type AuthoredQuestStageObjectiveSlot = {
  id: QuestObjectiveSlotId
  objective: AuthoredQuestObjective
  resultId?: string
}

export type AuthoredQuestStage = Omit<QuestStage, 'objective' | 'objectives' | 'dialogueActions'> & {
  objective: AuthoredQuestObjective
  objectives?: readonly AuthoredQuestStageObjectiveSlot[]
  dialogueActions?: readonly AuthoredQuestStageDialogueAction[]
}

export type AuthoredQuestOutcome = Omit<QuestOutcome, 'consequences'> & {
  consequences?: AuthoredQuestConsequences
}

export type AuthoredQuestAbandonment = Omit<QuestAbandonment, 'consequences'> & {
  consequences?: AuthoredQuestConsequences
}

/** Name-keyed authored quest content. Identity-bearing fields become
 *  `QuestNpcRef` at composition-root materialization — never matched by
 *  display name at runtime.
 *
 *  @domain quests-progression */
export type AuthoredQuestDef = Omit<QuestDef, 'giver' | 'stages' | 'availability' | 'outcomes' | 'abandonment'> & {
  stages: readonly AuthoredQuestStage[]
  availability?: { prerequisites: readonly AuthoredQuestPrerequisite[] }
  outcomes: readonly AuthoredQuestOutcome[]
  abandonment?: AuthoredQuestAbandonment
}

export const QUESTS: readonly AuthoredQuestDef[] = [
  {
    id: 'relay-anna-piotr',
    title: 'Wiadomość dla Piotra',
    description: 'Anna prosi, żebyś przekazał Piotrowi, że jutro idą na ryby o świcie.',
    giverName: 'Anna',
    offerLine:
      'Możesz przekazać wiadomość Piotrowi? Powiedz mu, że jutro idziemy na ryby o świcie.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npcName: 'Piotr' },
        description: 'Porozmawiaj z Piotrem.',
        reminderLine: 'Powiedziałeś już Piotrowi o rybach o świcie?',
        playerLine: 'Anna mówiła, że jutro idziecie na ryby o świcie.',
        progressLine: 'Dzięki, że przekazałeś. Będę o świcie.',
      },
    ],
    reportPromptLine: 'Przekazałeś już Piotrowi?',
    reportPlayerLine: 'Tak. Będzie o świcie.',
    reportLine: 'Świetnie, dziękuję za przekazanie wiadomości!',
    outcomes: [
      {
        id: 'delivered',
        state: 'complete',
        consequences: {
          relations: [
            { npcName: 'Anna', delta: 1 },
            { npcName: 'Piotr', delta: 1 },
          ],
        },
      },
    ],
  },
  {
    id: 'shells-dla-kasi',
    title: 'Muszle dla Kasi',
    description: 'Kasia potrzebuje trzech muszli do ozdobienia progu.',
    giverName: 'Kasia',
    offerLine: 'Zbierasz muszle nad morzem? Przydałyby mi się trzy do ozdobienia progu.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'shell', count: 3 },
        description: 'Zbierz 3 muszle.',
        reminderLine: 'Znalazłeś już trzy muszle?',
        playerLine: 'Tak. Znalazłem trzy muszle — proszę.',
      },
    ],
    reportPromptLine: 'Masz już te muszle?',
    reportPlayerLine: 'Tak. Znalazłem trzy muszle — proszę.',
    reportLine: 'Piękne! Dziękuję, teraz próg będzie ładniejszy.',
    outcomes: [
      {
        id: 'delivered',
        state: 'complete',
        consequences: { relations: [{ npcName: 'Kasia', delta: 1 }] },
      },
    ],
  },
  {
    id: 'woda-dla-marka',
    title: 'Woda dla Marka',
    description: 'Marek ma zajęte ręce i prosi, żebyś zaczerpnął dla niego wody ze studni.',
    giverName: 'Marek',
    offerLine: 'Ręce mam zajęte — zaczerpniesz dla mnie wody ze studni?',
    stages: [
      {
        objective: { type: 'interact_well' },
        description: 'Zaczerpnij wody ze studni.',
        reminderLine: 'Zaczerpnąłeś już wody?',
        progressLine: 'Woda ze studni jest czysta i chłodna. Czas wrócić do Marka.',
      },
    ],
    reportPromptLine: 'Udało ci się zaczerpnąć wody?',
    reportPlayerLine: 'Tak. Zaczerpnąłem wody ze studni.',
    reportLine: 'Dzięki, akurat mi się przydała. Weź te monety.',
    outcomes: [
      {
        id: 'delivered',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 5 }] },
        consequences: { relations: [{ npcName: 'Marek', delta: 1 }] },
      },
    ],
  },
  {
    id: 'zwiadowca',
    title: 'Zwiad okolicy',
    description:
      'Piotr chce wiedzieć, czy za osadą jest spokojnie. Sprawdź jaskinię, wypatrz jelenia i przynieś kamienie z gór na znak, że naprawdę tam byłeś.',
    giverName: 'Piotr',
    offerLine:
      'Chcę wiedzieć, co się dzieje za osadą. Zajrzyj do jaskini, wypatrz jelenia po drodze i przynieś dwa kamienie z gór — wtedy będę pewien, że naprawdę tam byłeś.',
    stages: [
      {
        objective: { type: 'interact_spawner', spawnerType: 'rockDen' },
        description: 'Sprawdź jaskinię za osadą.',
        reminderLine: 'Byłeś już przy jaskini?',
        progressLine: 'Przy wejściu widać świeże tropy. To miejsce nie jest puste. Teraz wypatrz jelenia.',
      },
      {
        // range 16 > stag's fleeRange (15, `fauna/AnimalAgent.ts`) — the
        // player can trigger "spot" from just outside the distance that
        // would make the stag flee, instead of needing to close in past its
        // own alert radius (plan 153).
        objective: { type: 'spot_animal', kind: 'stag', range: 16 },
        description: 'Wypatrz jelenia w terenie.',
        reminderLine: 'Widziałeś już jelenia?',
        progressLine: 'Jeleń zerwał się z miejsca i zniknął między drzewami. Zostały kamienie z gór.',
        // Seed-dependent stag spawn must not block the quest: talking to
        // Piotr while this stage is still active is itself proof the real
        // `spot_animal` did not happen (plan quests-progression-018).
        dialogueActions: [
          {
            npcName: 'Piotr',
            playerLine: 'Tak, widziałem jelenia.',
            npcLine: 'Skoro tak. Zostały kamienie z gór — przynieś dwa.',
            consequences: { social: { reputation: { integrity: -2 } } },
            reactions: [
              {
                when: [{ type: 'relation', npcName: 'Piotr', maximum: 'acquainted' }],
                npcLine: 'Nie widziałem cię na tej grani. Kamienie pokaż — wtedy pogadamy.',
                consequences: { relations: [{ npcName: 'Piotr', delta: -1 }] },
              },
              {
                when: [{ type: 'relation', npcName: 'Piotr', minimum: 'trusted' }],
                npcLine: 'Dobra. Biorę cię za słowo. Nie każ mi żałować.',
              },
            ],
          },
          {
            npcName: 'Piotr',
            playerLine: 'Nie widziałem jelenia.',
            npcLine: 'Trudno. Przynieś przynajmniej dwa kamienie z gór, żebym wiedział, że tam byłeś.',
          },
        ],
      },
      {
        objective: { type: 'gather_item', kind: 'stone', count: 2 },
        description: 'Przynieś 2 kamienie z gór.',
        reminderLine: 'Masz już kamienie z gór?',
        playerLine: 'Przyniosłem kamienie z gór — byłem tam, gdzie prosiłeś.',
      },
    ],
    reportPromptLine: 'No i jak? Co tam zastałeś?',
    reportPlayerLine: 'Jaskinia jest używana, jeleń kręci się w okolicy, a kamienie przyniosłem z gór.',
    reportLine: 'Dobra robota. Teraz wiem, że okolica żyje — i że ktoś wreszcie na nią spojrzał.',
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        consequences: { relations: [{ npcName: 'Piotr', delta: 1 }] },
      },
    ],
  },
  {
    // Authored narrative may start a real fauna stray on accept via
    // `QuestLifecycleHooks.onAnimalTargetBound` in createApp (plan
    // quests-progression-030). Generated `world:lost-livestock:*` must not.
    id: 'zagubiona-owca',
    title: 'Zagubiona owca',
    description: 'Annie zawieruszyła się owca. Znajdź ją i daj znać.',
    giverName: 'Anna',
    offerLine:
      'Owca gdzieś mi się zawieruszyła. Rozejrzysz się po okolicy i ją znajdziesz?',
    stages: [
      {
        objective: { type: 'find_animal', kind: 'sheep' },
        description: 'Znajdź zagubioną owcę.',
        reminderLine: 'Owca wciąż się gdzieś włóczy.',
        progressLine: 'Owca pasze się w trawie, jakby nigdy nic. Trzeba powiedzieć Annie.',
        failLine: 'Zbyt późno... to na pewno była ona. Przykro mi, Anno.',
      },
    ],
    reportPromptLine: 'Znalazłeś ją?',
    reportPlayerLine: 'Tak. Widziałem ją — pasła się niedaleko, cała i zdrowa.',
    reportLine: 'Uff, dzięki. Już się bałam, że coś ją spotkało.',
    outcomes: [
      {
        id: 'found_and_reported',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 10 }] },
        consequences: { relations: [{ npcName: 'Anna', delta: 1 }] },
      },
      {
        id: 'sheep_died',
        state: 'failed',
        resultText: 'Zbyt późno... to na pewno była ona. Przykro mi, Anno.',
      },
    ],
  },
  {
    id: 'drewno-na-naprawe',
    title: 'Drewno na naprawę',
    description: 'Piotrowi rozłazi się płot — zbierz kilka gałęzi na naprawę.',
    giverName: 'Piotr',
    offerLine:
      'Płot mi się rozłazi — zbierzesz pięć gałęzi na naprawę? Zapłacę osiem monet.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'branch', count: 5 },
        description: 'Zbierz 5 gałęzi.',
        reminderLine: 'Masz już dość gałęzi na naprawę?',
        playerLine: 'Przyniosłem pięć gałęzi. Tyle powinno wystarczyć na płot.',
      },
    ],
    reportPromptLine: 'Masz już gałęzie?',
    reportPlayerLine: 'Przyniosłem pięć gałęzi. Tyle powinno wystarczyć na płot.',
    reportLine: 'To starczy w zupełności. Płot znów będzie trzymał się kupy.',
    outcomes: [
      {
        id: 'delivered',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 8 }] },
      },
    ],
  },
  {
    id: 'ziola-dla-anny',
    title: 'Zioła dla Anny',
    description: 'Anna potrzebuje trzech rzadkich ziół leczniczych do domowych zapasów.',
    giverName: 'Anna',
    offerLine:
      'Zbierasz rzadkie zioła w okolicy? Przydałyby mi się trzy sztuki — zapłacę osiem monet.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'herb', count: 3 },
        description: 'Zbierz 3 rzadkie zioła lecznicze.',
        reminderLine: 'Masz już trzy rzadkie zioła?',
        playerLine: 'Tak. Zebrałem trzy rzadkie zioła — proszę.',
      },
    ],
    reportPromptLine: 'Masz już te zioła?',
    reportPlayerLine: 'Tak. Zebrałem trzy rzadkie zioła — proszę.',
    reportLine: 'Dziękuję, dokładnie tyle mi trzeba.',
    outcomes: [
      {
        id: 'delivered',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 8 }] },
      },
    ],
  },
  {
    id: 'kamienie-dla-piotra',
    title: 'Kamienie dla Piotra',
    description: 'Piotrowi brakuje kamieni na naprawy w osadzie.',
    giverName: 'Piotr',
    offerLine:
      'Potrzebuję sześciu kamieni na naprawy — przyniesiesz? Zapłacę dziewięć monet.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'stone', count: 6 },
        description: 'Zbierz 6 kamieni.',
        reminderLine: 'Masz już sześć kamieni?',
        playerLine: 'Przyniosłem sześć kamieni na naprawy.',
      },
    ],
    reportPromptLine: 'Masz już kamienie?',
    reportPlayerLine: 'Przyniosłem sześć kamieni na naprawy.',
    reportLine: 'To wystarczy. Dzięki za dostawę.',
    outcomes: [
      {
        id: 'delivered',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 9 }] },
      },
    ],
  },
  {
    id: 'sprawdz-szlak',
    title: 'Sprawdzenie skalnej groty',
    description:
      'Kasia prosi o sprawdzenie skalnej groty znajdującej się {cavePlace}. Ostatnio zauważono tam świeże ślady zwierząt.',
    giverName: 'Kasia',
    offerLine:
      'Ostatnio ktoś widział świeże ślady przy skalnej grocie {cavePlace}. Możesz tam zajrzeć i sprawdzić, czy nie kręci się tam coś niebezpiecznego? Zapłacę ci za fatygę.',
    stages: [
      {
        objective: { type: 'interact_spawner', spawnerType: 'rockDen' },
        description: 'Sprawdź skalną grotę wskazaną przez Kasię.',
        reminderLine: 'Skalna grota jest {cavePlace}. Sprawdź tylko, co się tam dzieje, i wróć do mnie.',
        progressLine:
          'Wokół wejścia widać świeże ślady zwierząt. To miejsce zdecydowanie nie jest opuszczone.',
      },
    ],
    reportPromptLine: 'I jak? Udało ci się sprawdzić skalną grotę?',
    reportPlayerLine:
      'Tak. Są tam świeże ślady. Wygląda na to, że coś regularnie korzysta z tej groty.',
    reportLine:
      'Dobrze, że to sprawdziłeś. Przynajmniej wiemy, że trzeba tam uważać. Dzięki — proszę, to za pomoc.',
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 12 }] },
      },
    ],
  },
  {
    id: 'lis-przy-osadzie',
    title: 'Lis przy osadzie',
    description: 'Marek prosi o pozbycie się lisa grasującego przy osadzie.',
    giverName: 'Marek',
    offerLine:
      'Przy osadzie grasuje lis. Trzeba go zabić, zanim weźmie się za kury — zapłacę dwadzieścia monet.',
    stages: [
      {
        objective: { type: 'kill_target_animal', kind: 'fox' },
        description: 'Zabij lisa przy osadzie.',
        reminderLine: 'Lis wciąż grasuje w okolicy.',
        progressLine: 'Lis nie żyje. Wróć do Marka.',
      },
    ],
    reportPromptLine: 'Co z lisem?',
    reportPlayerLine: 'Zabiłem lisa. Nie będzie już grasował przy osadzie.',
    reportLine: 'Dzięki — teraz będzie spokojniej. Weź monety.',
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 20 }] },
        consequences: {
          social: { reputation: { competence: 3, courage: 3 }, renown: 3 },
        },
      },
    ],
  },
  {
    id: 'grozny-wilk',
    title: 'Groźny wilk',
    description: 'W okolicy wioski pojawił się groźny wilk. Ludzie boją się wychodzić poza osadę.',
    giverName: 'Anna',
    offerLine:
      'W okolicy wioski pojawił się groźny wilk. Ludzie boją się wychodzić poza osadę — zajmiesz się nim?',
    stages: [
      {
        objective: { type: 'kill_target_animal', kind: 'wolf', dangerous: true },
        description: 'Znajdź i pokonaj groźnego wilka.',
        reminderLine: 'Wilk wciąż grasuje w okolicy.',
        progressLine: 'Groźny wilk nie żyje. Wróć do Anny.',
      },
    ],
    reportPromptLine: 'Udało ci się znaleźć tego wilka?',
    reportPlayerLine: 'Wilk nie żyje. Można znowu wychodzić poza osadę.',
    reportLine: 'Dzięki Tobie znowu można spokojnie wychodzić poza osadę. Weź ten damasceński miecz — zasłużyłeś.',
    availability: {
      prerequisites: [
        { type: 'relation', npcName: 'Anna', minimum: 'trusted' },
      ],
    },
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'damascus_long_sword', count: 1 }] },
        consequences: {
          relations: [{ npcName: 'Anna', delta: 2 }],
          social: { reputation: { competence: 10, courage: 12, benevolence: 4 }, renown: 15 },
        },
      },
    ],
  },
  {
    id: 'wilcza-jama',
    title: 'Wilcza jama',
    description: 'Wilki mają jamę niedaleko. Znajdź ją i rozwiąż ten problem raz na zawsze.',
    giverName: 'Anna',
    offerLine:
      'Te wilki skądś się biorą — mają jamę niedaleko. Znajdź ją i rozwiąż ten problem raz na zawsze.',
    stages: [
      {
        objective: { type: 'clear_wolf_den', denId: WOLF_DEN_ID },
        description: 'Znajdź wilczą jamę i zlikwiduj zagrożenie.',
        reminderLine: 'Jama wciąż jest zamieszkana.',
        progressLine: 'W jamie nie zostało żadnego wilka. Wróć do Anny.',
      },
    ],
    reportPromptLine: 'Co z jamą?',
    reportPlayerLine: 'Jama jest pusta. Wilki stamtąd już nie wrócą.',
    reportLine: 'Teraz w okolicy będzie spokojniej. Weź ten obsydianowy miecz z wulkanicznego szkła.',
    availability: {
      prerequisites: [
        { type: 'relation', npcName: 'Anna', minimum: 'trusted' },
        { type: 'quest_outcome', questId: 'grozny-wilk', outcomeIds: ['reported'] },
      ],
    },
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'obsidian_sword', count: 1 }] },
        consequences: {
          relations: [{ npcName: 'Anna', delta: 3 }],
          social: { reputation: { competence: 15, courage: 18, benevolence: 6 }, renown: 25 },
        },
      },
    ],
  },
  {
    id: 'wilki-pod-osada',
    title: 'Wilki pod osadą',
    description:
      'Wilki coraz częściej podchodzą pod osadę i atakują ludzi. Anna podejrzewa, że źródłem jest pobliskie siedlisko — samo zabijanie pojedynczych wilków nie wystarczy.',
    giverName: 'Anna',
    offerLine:
      'Wilki coraz częściej podchodzą pod osadę i atakują ludzi. Chyba mają jamę niedaleko — samo zabijanie pojedynczych wilków nie wystarczy. Znajdź siedlisko i zniszcz je na zawsze.',
    stages: [
      {
        objective: { type: 'destroy_spawn_point', spawnerId: WOLF_DEN_ID },
        description: 'Znajdź wilczą jamę i trwale zniszcz siedlisko.',
        reminderLine: 'Dopóki jama stoi, wilki będą wracać — musisz zniszczyć siedlisko.',
        progressLine: 'Siedlisko zniszczone. Wróć do Anny.',
      },
    ],
    reportPromptLine: 'Udało ci się zniszczyć to siedlisko?',
    reportPlayerLine: 'Zniszczyłem siedlisko. Wilki nie mają już skąd wracać pod osadę.',
    reportLine: 'Dzięki — źródło zagrożenia zniknęło. Osada może odetchnąć.',
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        consequences: {
          relations: [{ npcName: 'Anna', delta: 2 }],
          social: {
            reputation: { competence: 20, courage: 22, benevolence: 8 },
            renown: 35,
          },
        },
      },
    ],
  },
  {
    id: 'zaginiona-przesylka',
    title: 'Zaginiona przesyłka',
    description:
      'Kasia zgubiła handlową przesyłkę przy skalnej grocie {cavePlace}. Sprawdź grotę i zdecyduj, komu ją oddać.',
    giverName: 'Kasia',
    offerLine:
      'Zgubiłam przesyłkę przy skalnej grocie {cavePlace}. To prywatne listy i rachunki — bez nich nie ogarnę dostawy. Marek już o tym słyszał i chętnie by to przejął „dla porządku”. Dasz radę tam zajrzeć?',
    stages: [
      {
        objective: { type: 'interact_spawner', spawnerType: 'rockDen' },
        description: 'Sprawdź skalną grotę wskazaną przez Kasię.',
        reminderLine: 'Skalna grota jest {cavePlace}. Szukaj przesyłki przy wejściu.',
        progressLine: 'Przy wejściu leży zawinięta przesyłka. Kasia jej szuka — Marek też o niej wie.',
      },
      {
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            {
              npcName: 'Kasia',
              outcomeId: 'returned_sealed',
              npcLine:
                'Znalazłeś przesyłkę? Oddaj mi ją, zanim ktoś obcy zajrzy do środka. To moja korespondencja i bez niej stoję na szlaku z pustymi rękami.',
              playerLine: 'Znalazłem przesyłkę. Proszę, jest twoja.',
              reactions: [
                {
                  when: [{ type: 'relation', npcName: 'Kasia', maximum: 'acquainted' }],
                  npcLine: 'Oddajesz. Pieczęć cała — na razie tyle mi wystarczy.',
                },
                {
                  when: [{ type: 'relation', npcName: 'Kasia', minimum: 'friendly' }],
                  npcLine: 'Dziękuję. Gdybyś zajrzał do środka, szlak by o tym usłyszał szybciej niż ja.',
                },
              ],
            },
            {
              npcName: 'Marek',
              outcomeId: 'turned_over_to_guard',
              npcLine:
                'Kasia zgubiła przesyłkę na szlaku. Jeśli ją masz — oddaj mi ją. Straż powinna sprawdzić, skąd przyszła i czy na pewno jest tym, za co ją podaje.',
              playerLine: 'Znalazłem przesyłkę Kasi. Przekazuję ją straży.',
              reactions: [
                {
                  when: [{ type: 'relation', npcName: 'Kasia', minimum: 'friendly' }],
                  npcLine: 'Kasia będzie czekała przy grocie. Otworzymy to przy świadkach, zanim ktokolwiek zgadnie, co jest w środku.',
                  consequences: { relations: [{ npcName: 'Kasia', delta: -1 }] },
                },
                {
                  when: [{ type: 'reputation', dimension: 'integrity', minimum: 5 }],
                  npcLine: 'Dobrze. Otworzymy ją przy świadkach i będzie jasne, co dalej.',
                },
              ],
            },
          ],
        },
        description: 'Oddaj przesyłkę Kasi albo przekaż ją Markowi.',
        reminderLine: 'Oddałeś już przesyłkę? Kasia albo Marek.',
      },
    ],
    reportLine: 'Przesyłka wróciła tam, gdzie powinna.',
    outcomes: [
      {
        id: 'returned_sealed',
        state: 'complete',
        resultText: 'Dziękuję, że przyniosłeś przesyłkę nietkniętą. To dla mnie dużo znaczy.',
        reward: { visibility: 'hidden', items: [{ kind: 'coin', count: 15 }] },
        consequences: {
          relations: [{ npcName: 'Kasia', delta: 2 }],
          social: { reputation: { trust: 5, integrity: 6 }, renown: 3 },
        },
      },
      {
        id: 'turned_over_to_guard',
        state: 'complete',
        resultText: 'Dobrze, że mi to oddałeś. Sprawdzę, skąd ta przesyłka.',
        reward: { visibility: 'hidden', items: [{ kind: 'bandage', count: 2 }] },
        consequences: {
          relations: [
            { npcName: 'Kasia', delta: -1 },
            { npcName: 'Marek', delta: 2 },
          ],
          social: { reputation: { competence: 4, courage: 2, integrity: 1 }, renown: 2 },
        },
      },
    ],
  },
  {
    id: 'sporne-drewno',
    title: 'Sporne drewno',
    description:
      'Anna potrzebuje drewna do pilnych napraw w gospodarstwie. Piotr chce wykorzystać ten sam zapas, żeby naprawić wóz potrzebny przy wyrębie. Wysłuchaj obojga i zdecyduj, komu pomożesz.',
    giverName: 'Anna',
    offerLine:
      'Przy pastwisku ogrodzenie ledwo się trzyma, a przy stodole też jest co łatać. Potrzebuję drewna, zanim coś naprawdę się rozpadnie. Tylko że Piotr prosi o ten sam zapas. Porozmawiaj z nim, zanim zdecydujesz.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npcName: 'Piotr' },
        description: 'Porozmawiaj z Piotrem.',
        reminderLine: 'Rozmawiałeś już z Piotrem?',
        playerLine: 'Anna mówiła, że oboje potrzebujecie tego samego drewna. Do czego jest ci potrzebne?',
        progressLine:
          'Wóz ledwo wytrzymuje drogę do lasu, a bez niego nie przewiozę większego ładunku. Jeśli teraz go nie naprawię, niedługo wszystkim zacznie brakować drewna. Anna ma swój problem, ja mam swój.',
      },
      {
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            {
              npcName: 'Anna',
              outcomeId: 'support_anna',
              npcLine: 'No i jak? Piotr cię przekonał, czy zostajesz przy gospodarstwie?',
              playerLine: 'Drewno dostanie Anna. Gospodarstwo nie powinno dłużej czekać na naprawy.',
              reactions: [
                {
                  when: [{ type: 'relation', npcName: 'Piotr', minimum: 'friendly' }],
                  npcLine:
                    'Dobrze. Piotr będzie musiał jeszcze trochę pojeździć starym wozem. Tutaj naprawy nie mogły już czekać.',
                  consequences: { relations: [{ npcName: 'Piotr', delta: -1 }] },
                },
              ],
            },
            {
              npcName: 'Piotr',
              outcomeId: 'support_piotr',
              npcLine: 'No? Pomagasz mi, czy Annie?',
              playerLine: 'Drewno dostanie Piotr. Jeśli stanie jego praca, problem szybko odczuje cała osada.',
              reactions: [
                {
                  when: [{ type: 'relation', npcName: 'Piotr', maximum: 'acquainted' }],
                  npcLine:
                    'Dobrze. Naprawię wóz i wracam do pracy. Im szybciej będzie sprawny, tym szybciej przywiozę kolejne drewno.',
                },
                {
                  when: [{ type: 'relation', npcName: 'Anna', minimum: 'friendly' }],
                  npcLine:
                    'Wezmę je. Wiem, że Anna się nie ucieszy, ale bez sprawnego wozu niedługo wszyscy będziemy mieli większy problem.',
                  consequences: { relations: [{ npcName: 'Anna', delta: -1 }] },
                },
              ],
            },
          ],
        },
        description: 'Zdecyduj, czy pomożesz Annie, czy Piotrowi.',
        reminderLine: 'Zdecydowałeś już, komu pomożesz?',
      },
    ],
    reportLine: 'Wiem już, na kogo liczyć.',
    outcomes: [
      {
        id: 'support_anna',
        state: 'complete',
        resultText: 'Dobrze. Przyda się każda deska. Dopilnuję, żeby nic się tu nie rozpadło.',
        consequences: {
          relations: [
            { npcName: 'Anna', delta: 2 },
            { npcName: 'Piotr', delta: -1 },
          ],
          social: { reputation: { benevolence: 3, trust: 1 }, renown: 2 },
        },
      },
      {
        id: 'support_piotr',
        state: 'complete',
        resultText:
          'Dobrze. Naprawię wóz i wracam do pracy. Im szybciej będzie sprawny, tym szybciej przywiozę kolejne drewno.',
        consequences: {
          relations: [
            { npcName: 'Piotr', delta: 2 },
            { npcName: 'Anna', delta: -1 },
          ],
          social: { reputation: { competence: 3, trust: 1 }, renown: 2 },
        },
      },
    ],
  },
  {
    id: 'drewno-dla-anny',
    title: 'Drewno dla Anny',
    description:
      'Anna potrzebuje pięciu gałęzi na najpilniejsze naprawy w gospodarstwie, po tym jak drewno trafiło najpierw do niej.',
    giverName: 'Anna',
    offerLine:
      'Skoro zdecydowałeś, że najpierw zajmiemy się gospodarstwem, potrzebuję pięciu porządnych gałęzi. Z tego przygotujemy materiał do najpilniejszych napraw.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'branch', count: 5 },
        description: 'Zbierz 5 gałęzi.',
        reminderLine: 'Masz już pięć gałęzi?',
        playerLine: 'Przyniosłem pięć gałęzi na najpilniejsze naprawy w gospodarstwie.',
      },
    ],
    reportPromptLine: 'Masz już gałęzie?',
    reportPlayerLine: 'Przyniosłem pięć gałęzi na najpilniejsze naprawy w gospodarstwie.',
    reportLine: 'To wystarczy. Teraz można wreszcie zabrać się za naprawy. Dziękuję.',
    availability: {
      prerequisites: [
        { type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_anna'] },
      ],
    },
    outcomes: [
      {
        id: 'delivered_to_anna',
        state: 'complete',
        resultText: 'To wystarczy. Teraz można wreszcie zabrać się za naprawy. Dziękuję.',
        reward: { visibility: 'hidden', items: [{ kind: 'seed_carrot', count: 3 }] },
        consequences: { relations: [{ npcName: 'Anna', delta: 1 }] },
      },
    ],
  },
  {
    id: 'drewno-dla-piotra',
    title: 'Drewno dla Piotra',
    description:
      'Piotr potrzebuje pięciu gałęzi do naprawy wozu, po tym jak drewno trafiło najpierw do niego.',
    giverName: 'Piotr',
    offerLine:
      'Skoro drewno ma najpierw trafić do mnie, przynieś pięć porządnych gałęzi. Przygotuję z nich to, czego potrzebuję do naprawy wozu. Zapłacę osiem monet.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'branch', count: 5 },
        description: 'Zbierz 5 gałęzi.',
        reminderLine: 'Masz już pięć gałęzi?',
        playerLine: 'Przyniosłem pięć gałęzi do naprawy wozu.',
      },
    ],
    reportPromptLine: 'Masz już gałęzie?',
    reportPlayerLine: 'Przyniosłem pięć gałęzi do naprawy wozu.',
    reportLine: 'Tyle wystarczy. Naprawię, co trzeba, i będę mógł normalnie wrócić do pracy. Weź zapłatę.',
    availability: {
      prerequisites: [
        { type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_piotr'] },
      ],
    },
    outcomes: [
      {
        id: 'delivered_to_piotr',
        state: 'complete',
        resultText: 'Tyle wystarczy. Naprawię, co trzeba, i będę mógł normalnie wrócić do pracy. Weź zapłatę.',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 8 }] },
        consequences: { relations: [{ npcName: 'Piotr', delta: 1 }] },
      },
    ],
  },
  {
    id: 'dzik-przy-szlaku',
    title: 'Dzik przy szlaku',
    description:
      'Mieszkańcy omijają część lasu przy szlaku, gdzie regularnie widywany jest duży dzik. Marek prosi o pomoc i radzi najpierw porozmawiać z Piotrem, który dobrze zna tę okolicę.',
    giverName: 'Marek',
    offerLine:
      'Przy szlaku regularnie widują dużego dzika, ludzie omijają tamtędy. Piotr lepiej zna las — najpierw z nim pogadaj, potem zajmij się bestią.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npcName: 'Piotr' },
        description: 'Porozmawiaj z Piotrem i dowiedz się, gdzie widywano dzika.',
        reminderLine: 'Porozmawiaj z Piotrem — wie, gdzie kręci się dzik przy szlaku.',
        playerLine: 'Marek mówi, że przy szlaku kręci się duży dzik. Wiesz, gdzie go szukać?',
        progressLine: 'Tak. Przy szlaku w lesie, tam gdzie ludzie już nie chodzą. Bestia nie odpuszcza — uważaj na siebie.',
      },
      {
        objective: { type: 'kill_target_animal', kind: 'boar' },
        description: 'Pozbądź się dzika przy szlaku.',
        reminderLine: 'Dzik wciąż kręci się przy szlaku.',
        progressLine: 'Dzik nie żyje. Szlak znów jest przejezdny. Wróć do Marka.',
      },
    ],
    reportPromptLine: 'Co z dzikiem?',
    reportPlayerLine: 'Dzika już nie ma. Szlak jest znowu przejezdny.',
    reportLine: 'Dzięki. Weź tę książkę — przyda ci się, zanim znów wyjdziesz poza osadę.',
    availability: {
      prerequisites: [
        { type: 'renown', minimum: 10 },
      ],
    },
    outcomes: [
      {
        id: 'boar_removed',
        state: 'complete',
        resultText: 'Dzięki. Weź tę książkę — przyda ci się, zanim znów wyjdziesz poza osadę.',
        reward: { visibility: 'hidden', items: [{ kind: 'book_defense_intermediate', count: 1 }] },
        consequences: {
          relations: [{ npcName: 'Marek', delta: 2 }],
          social: { reputation: { competence: 6, courage: 6, benevolence: 2 }, renown: 8 },
        },
      },
    ],
  },
  {
    id: 'plaga-szcurow',
    title: 'Plaga szczurów',
    description:
      'Marek zgłasza plagę szczurów wokół magazynu osady. Napraw uszkodzony magazyn, zniszcz gniazdo za domem i doprowadź liczbę żywych szczurów w osadzie do jednego albo mniej.',
    giverName: 'Marek',
    offerLine:
      'Szczury roi się przy magazynie i zżerają zapasy. Ktoś musi naprawić dziury, znaleźć gniazdo za domem i ograniczyć ich liczbę. Pomożesz?',
    stages: [
      {
        objective: { type: 'resolve_storage_rat_infestation' },
        description:
          'Napraw magazyn osady, zniszcz gniazdo szczurów za jednym z domów i doprowadź liczbę żywych szczurów w osadzie do co najwyżej jednego.',
        reminderLine: 'Plaga wciąż nie wygasła — sprawdź magazyn, gniazdo za domem i szczury w osadzie.',
        progressLine: 'Magazyn jest łatany, gniazdo spalone, szczurów prawie nie widać.',
      },
    ],
    reportPromptLine: 'Udało ci się opanować tę plagę?',
    reportPlayerLine: 'Plaga wygasła. Magazyn jest znowu bezpieczny.',
    reportLine: 'Dzięki — magazyn jest znowu bezpieczny, a szczurów prawie nie ma.',
    outcomes: [
      {
        id: 'infestation_cleared',
        state: 'complete',
        resultText: 'Dzięki — magazyn jest znowu bezpieczny, a szczurów prawie nie ma.',
        consequences: {
          relations: [{ npcName: 'Marek', delta: 2 }],
          social: { reputation: { competence: 4, benevolence: 3 }, renown: 5 },
        },
      },
    ],
  },
]

/** Finds an existing `kind` landmark to bind a landmark quest's stage to —
 *  implemented by the world layer (`ChunkManager.findLandmarkNear`, has
 *  terrain/chunk access `QuestManager`/`quests.ts` deliberately don't) and
 *  injected into `buildLandmarkQuests`. `undefined` means no matching
 *  landmark exists within the resolver's bounded search this session. */
export type LandmarkResolver = (kind: LandmarkKind) => string | undefined

/** World-driven landmark quests (plan 132) — each hooks an existing
 *  procedural landmark (`terrain/chunkEnvironment.ts`) to one of the four
 *  established NPCs' problems. Immediate-known places still resolve once at
 *  world setup via `resolve`; `slad-przy-monolicie` opts into deferred
 *  world knowledge instead (plan quests-progression-047) and is always
 *  offered. A kind `resolve` can't find within its search bound is omitted
 *  this session rather than offered broken — not every world is guaranteed to
 *  roll every landmark kind near the home settlement. Callers append the
 *  result to `QUESTS` before constructing `QuestManager`. */
export function buildLandmarkQuests(resolve: LandmarkResolver): AuthoredQuestDef[] {
  const quests: AuthoredQuestDef[] = []

  const ruinsId = resolve('smallRuins')
  if (ruinsId) {
    quests.push({
      id: 'stare-ruiny',
      title: 'Stare ruiny',
      description: 'Piotr natknął się na stare ruiny podczas zwiadu i nie miał czasu ich zbadać.',
      giverName: 'Piotr',
      offerLine:
        'Podczas ostatniego zwiadu natknąłem się na jakieś stare ruiny, ale nie miałem czasu się im przyjrzeć. Sprawdzisz je?',
      stages: [
        {
          objective: { type: 'interact_landmark', landmarkId: ruinsId },
          description: 'Zbadaj stare ruiny.',
          reminderLine: 'Byłeś już przy ruinach?',
          progressLine:
            'Mur porośnięty mchem, resztki paleniska. Ktoś tu kiedyś mieszkał, ale dawno. Ślady nie są świeże.',
        },
      ],
      reportPromptLine: 'Co znalazłeś w tych ruinach?',
      reportPlayerLine: 'Ruiny są puste. Ktoś tu kiedyś mieszkał, ale dawno.',
      reportLine: 'Dobrze wiedzieć, co tam jest, zanim ktoś natknie się na to nieprzygotowany. Dzięki.',
      outcomes: [
        {
          id: 'reported',
          state: 'complete',
          consequences: { relations: [{ npcName: 'Piotr', delta: 1 }] },
        },
      ],
    })
  }

  quests.push({
    id: 'slad-przy-monolicie',
    title: 'Ślad przy monolicie',
    description: 'Ktoś z osady nie wrócił — ostatni raz widziano go przy starym monolicie.',
    giverName: 'Anna',
    offerLine:
      'Jeden z naszych wyruszył w stronę wzgórz kilka dni temu i wciąż nie wrócił. Podobno ostatni raz widziano go przy starym monolicie, ale muszę odtworzyć tamtą trasę z zapisków. Sprawdzisz to, jak będę pewna miejsca?',
    worldKnowledge: [{
      id: 'target',
      revealDelayDays: WORLD_KNOWLEDGE_HOUR_DAYS,
      bind: { type: 'landmark', kind: 'monolith' },
      pendingPhrase: 'Muszę zajrzeć do starych papierów. Wróć za godzinę.',
      unavailablePhrase: 'Nie udało mi się odtworzyć trasy do monolitu. Ślad urwał się.',
      unavailablePolicy: 'fail',
      unavailableOutcomeId: 'route_lost',
    }],
    acceptEffects: [{ type: 'request_world_knowledge', knowledgeId: 'target' }],
    stages: [
      {
        objective: { type: 'receive_world_knowledge', knowledgeId: 'target', npcName: 'Anna' },
        description: 'Wróć do Anny, gdy sprawdzi stare zapiski.',
        reminderLine: 'Muszę zajrzeć do starych papierów. Wróć za godzinę.',
        playerLine: 'Udało ci się odtworzyć trasę do monolitu?',
        progressLine: 'Odtworzyłam trasę. Szukaj {worldKnowledgeClue:target}.',
      },
      {
        objective: { type: 'interact_bound_landmark', knowledgeId: 'target' },
        description: 'Zbadaj {worldKnowledgeClue:target}.',
        reminderLine: 'Byłeś już przy monolicie?',
        progressLine:
          'Przy kamieniu widać zdeptaną trawę i wygasłe palenisko. Ktoś tu nocował niedawno.',
      },
    ],
    reportPromptLine: 'Byłeś już przy monolicie?',
    reportPlayerLine: 'Przy monolicie było obozowisko. Ktoś tam nocował, zanim zniknął.',
    reportLine: 'Ślady obozowiska... więc żył jeszcze, kiedy tam był. To już coś. Dziękuję, że sprawdziłeś.',
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        consequences: { relations: [{ npcName: 'Anna', delta: 2 }] },
      },
      {
        id: 'route_lost',
        state: 'failed',
        resultText: 'Anna nie odtworzyła trasy do monolitu. Ślad urwał się.',
      },
    ],
  })

  const cemeteryId = resolve('cemetery')
  if (cemeteryId) {
    quests.push({
      id: 'zapomniany-cmentarz',
      title: 'Zapomniany cmentarz',
      description: 'Kasia prosi, żebyś sprawdził, czy groby na zaniedbanym cmentarzu jeszcze stoją.',
      giverName: 'Kasia',
      offerLine:
        'Cmentarzyk na skraju wioski od dawna zarasta chwastami, nikt tam już nie zagląda. Poszedłbyś sprawdzić, czy groby jeszcze stoją?',
      stages: [
        {
          objective: { type: 'interact_landmark', landmarkId: cemeteryId },
          description: 'Odwiedź zaniedbany cmentarz.',
          reminderLine: 'Byłeś już na cmentarzu?',
          progressLine: 'Nagrobki stoją, choć chwasty prawie je zakryły. Nikt tu od dawna nie przychodził.',
        },
      ],
      reportPromptLine: 'Sprawdziłeś już ten cmentarz?',
      reportPlayerLine: 'Groby jeszcze stoją, tylko cmentarz mocno zarósł.',
      reportLine: 'To dobrze, że ktoś jeszcze o nich pamięta. Dziękuję, że sprawdziłeś.',
      outcomes: [
        {
          id: 'reported',
          state: 'complete',
          consequences: { relations: [{ npcName: 'Kasia', delta: 1 }] },
        },
      ],
    })
  }

  const shipwreckId = resolve('shipwreck')
  if (shipwreckId) {
    quests.push({
      id: 'zaginiony-ladunek',
      title: 'Zaginiony ładunek',
      description: 'Marek prosi o odnalezienie wraku, z którego miał nadejść ładunek.',
      giverName: 'Marek',
      offerLine:
        'Miał nadejść transport z wybrzeża, a zamiast tego nadeszły plotki o wraku. Odnajdziesz ten statek i sprawdzisz, co zostało z ładunku?',
      stages: [
        {
          objective: { type: 'interact_landmark', landmarkId: shipwreckId },
          description: 'Odnajdź i zbadaj wrak na wybrzeżu.',
          reminderLine: 'Udało ci się znaleźć ten wrak?',
          progressLine:
            'Wrak leży przy brzegu. Część ładowni jest zalana, śladów świeżej załogi nie widać.',
        },
      ],
      reportPromptLine: 'Wiedziałeś już coś o tym wraku?',
      reportPlayerLine: 'Znalazłem wrak. Ładunek jest rozrzucony albo zniszczony — załogi nie ma.',
      reportLine: 'Wiedziałem, że to źle się skończyło. Dzięki, że sprawdziłeś na własne oczy.',
      outcomes: [
        {
          id: 'reported',
          state: 'complete',
          consequences: { relations: [{ npcName: 'Marek', delta: 1 }] },
        },
      ],
    })
  }

  const towerId = resolve('tower')
  if (towerId) {
    quests.push({
      id: 'samotna-wieza',
      title: 'Samotna wieża',
      description: 'Piotr widział światło albo ruch przy samotnej wieży i chce, żebyś to sprawdził.',
      giverName: 'Piotr',
      offerLine:
        'Z daleka widać samotną wieżę. Ktoś przysięgał, że w nocy coś tam migotało. Podejdziesz bliżej i sprawdzisz, czy ktoś tam jest?',
      stages: [
        {
          objective: { type: 'interact_landmark', landmarkId: towerId },
          description: 'Zbadaj samotną wieżę.',
          reminderLine: 'Byłeś już przy tej wieży?',
          progressLine: 'Wieża stoi pusta. Schody kruszą się, nikogo nie ma — i nie było od dawna.',
        },
      ],
      reportPromptLine: 'Co jest z tą wieżą?',
      reportPlayerLine: 'Wieża jest opuszczona. Żadnego ruchu, żadnego światła.',
      reportLine: 'Czasem cisza też jest odpowiedzią. Dzięki za sprawdzenie.',
      outcomes: [
        {
          id: 'reported',
          state: 'complete',
          consequences: { relations: [{ npcName: 'Piotr', delta: 1 }] },
        },
      ],
    })
  }

  return quests
}

/** Merchant horse reward quest (plan quests-progression-012) — bound to one
 *  concrete `animalId` resolved at composition root. Omitted when the home
 *  settlement has no merchant horse acquisition target this session. */
/** Placeholder replaced once at composition with a concrete map-source
 *  place phrase (cave/cemetery + cheap direction from the home settlement). */
export const MAP_SOURCE_PLACE_TOKEN = '{mapSourcePlace}'

/** Deep-forest ruins treasure map quest (plan quests-progression-009). */
export function buildDarkForestTreasureQuest(): AuthoredQuestDef {
  return {
    id: 'mapa-do-skarbu',
    title: 'Mapa do skarbu',
    description: 'Piotr słyszał o starych ruinach głęboko w ciemnym lesie i o skarbie, który tam spoczywa.',
    giverName: 'Piotr',
    offerLine:
      `Słyszałem, że starą mapę ukryto ${MAP_SOURCE_PLACE_TOKEN}. Podobno prowadzi do ruin głęboko w ciemnym lesie. Jeśli mapę odczytasz i wrócisz żywy — opowiedz, co tam znalazłeś.`,
    stages: [
      {
        objective: { type: 'read_item', itemKind: 'treasure_map_dark_forest' },
        description: `Znajdź mapę ${MAP_SOURCE_PLACE_TOKEN} i odczytaj ją.`,
        reminderLine: `Mapa miała być ukryta ${MAP_SOURCE_PLACE_TOKEN}.`,
        progressLine: 'Na mapie widać ruiny głęboko w ciemnym lesie. Teraz trzeba tam dotrzeć.',
      },
      {
        objective: { type: 'discover_location', locationId: DARK_FOREST_TREASURE_LOCATION_ID },
        description: 'Dotrzyj do ruin w ciemnym lesie.',
        reminderLine: 'Ruiny wciąż czekają głęboko w lesie.',
        progressLine: 'Ruiny stoją tam, gdzie mapa wskazywała. Została skrzynia.',
      },
      {
        objective: { type: 'loot_world_container', containerId: darkForestTreasureChestId() },
        description: 'Zabierz skarb ze skrzyni w ruinach.',
        reminderLine: 'Skrzynia w ruinach wciąż może coś kryć.',
        progressLine: 'W skrzyni był skarb. Czas wrócić do Piotra.',
      },
    ],
    reportPromptLine: 'Dotarłeś do tych ruin?',
    reportPlayerLine: 'Byłem w ruinach. Mapa nie kłamała — skarb był na miejscu.',
    reportLine: 'Wiedziałem, że tam coś jest. Dzięki, że to sprawdziłeś.',
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        consequences: {
          relations: [{ npcName: 'Piotr', delta: 2 }],
          social: { reputation: { competence: 6, courage: 8 }, renown: 6 },
        },
      },
    ],
    availability: {
      prerequisites: [{ type: 'relation', npcName: 'Piotr', minimum: 'acquainted' }],
    },
  }
}

export function buildHorseAcquisitionQuest(horseRewardAnimalId: string): AuthoredQuestDef {
  return {
    id: 'wilki-u-kupca',
    title: 'Wilki u kupca',
    description: 'Kupiec ma problem z wilkami przy szlaku. Pomóż mu, a w nagrodę dostaniesz jego konia.',
    giverName: 'Kasia',
    offerLine:
      'Wilki straszą przy szlaku — mój koń nie może spokojnie stać przy wozie. Znajdź ich jamę i zniszcz ją na zawsze, a oddam ci tego konia.',
    stages: [
      {
        objective: { type: 'destroy_spawn_point', spawnerId: WOLF_DEN_ID },
        description: 'Znajdź wilczą jamę i trwale zniszcz siedlisko.',
        reminderLine: 'Dopóki jama stoi, wilki będą wracać — mój koń czeka na spokój.',
        progressLine: 'Siedlisko zniszczone. Wróć do Kasi po konia.',
        failLine: 'Koń nie przeżył — nie ma już czego oddać.',
      },
    ],
    reportPromptLine: 'Udało ci się zniszczyć tamtą jamę?',
    reportPlayerLine: 'Zniszczyłem siedlisko. Twój koń może spokojnie stać przy wozie.',
    reportLine: 'Dzięki. Ten koń jest twój — trzymaj go przy sobie.',
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        reward: { visibility: 'shown' },
        consequences: {
          relations: [{ npcName: 'Kasia', delta: 2 }],
          social: { reputation: { competence: 8, courage: 10 }, renown: 8 },
        },
      },
      {
        id: 'horse_lost',
        state: 'failed',
        resultText: 'Koń padł, zanim zdążyłeś go odebrać. Nie ma już nagrody do przekazania.',
      },
    ],
    horseRewardAnimalId,
  }
}

/** Placeholder in authored cave-quest prose, replaced once at composition
 *  with either a cheap 8-way direction or a neutral fallback
 *  (plan quests-progression-014). */
export const CAVE_PLACE_TOKEN = '{cavePlace}'

const CAVE_BOUND_QUEST_IDS = new Set(['sprawdz-szlak', 'zaginiona-przesylka'])

export function cavePlacePhrase(directionFromSettlement: string | null): string {
  return directionFromSettlement ?? 'poza osadą'
}

function applyCavePlaceToken(text: string, phrase: string): string {
  return text.replaceAll(CAVE_PLACE_TOKEN, phrase)
}

function applyMapSourcePlaceToken(text: string, phrase: string): string {
  return text.replaceAll(MAP_SOURCE_PLACE_TOKEN, phrase)
}

/**
 * Polish phrase naming the treasure-map source place, e.g.
 * `w jaskini na północny zachód od osady`.
 */
export function treasureMapSourcePlacePhrase(
  kind: 'cave' | 'cemetery' | null,
  directionFromSettlement: string | null,
): string {
  const where = directionFromSettlement ?? 'poza osadą'
  if (kind === 'cemetery') return `na cmentarzu ${where}`
  if (kind === 'cave') return `w jaskini ${where}`
  return where
}

function bindCaveObjective<T extends { type: string, spawnerId?: string }>(objective: T, caveId: string | undefined): T {
  if (objective.type === 'interact_spawner' && caveId) {
    return { ...objective, spawnerId: caveId }
  }
  return objective
}

/** Binds exact home `rockDen` identity and cheap direction prose onto the
 *  authored cave quests. Direction is already-resolved presentation data
 *  — never persisted. Player-facing copy treats that den as a skalna grota,
 *  not a walk-in Cave V2. */
export function bindExactCaveQuests(
  defs: readonly AuthoredQuestDef[],
  cave: { id: string, directionPhrase: string | null } | undefined,
): AuthoredQuestDef[] {
  const cavePlace = cavePlacePhrase(cave?.directionPhrase ?? null)
  const caveId = cave?.id
  return defs.map((def) => {
    if (!CAVE_BOUND_QUEST_IDS.has(def.id)) return def
    return {
      ...def,
      description: applyCavePlaceToken(def.description, cavePlace),
      offerLine: applyCavePlaceToken(def.offerLine, cavePlace),
      stages: def.stages.map((stage) => ({
        ...stage,
        reminderLine: applyCavePlaceToken(stage.reminderLine, cavePlace),
        objective: bindCaveObjective(stage.objective, caveId),
        objectives: stage.objectives?.map((slot) => ({
          ...slot,
          objective: bindCaveObjective(slot.objective, caveId),
        })),
      })),
    }
  })
}

/** Binds cheap direction prose for `mapa-do-skarbu` onto the actual
 *  cave/cemetery source place chosen for this seed. */
export function bindDarkForestTreasureQuest(
  def: AuthoredQuestDef,
  source: { kind: 'cave' | 'cemetery', directionPhrase: string | null } | null,
): AuthoredQuestDef {
  if (def.id !== 'mapa-do-skarbu') return def
  const phrase = treasureMapSourcePlacePhrase(source?.kind ?? null, source?.directionPhrase ?? null)
  return {
    ...def,
    offerLine: applyMapSourcePlaceToken(def.offerLine, phrase),
    stages: def.stages.map((stage) => ({
      ...stage,
      description: applyMapSourcePlaceToken(stage.description, phrase),
      reminderLine: applyMapSourcePlaceToken(stage.reminderLine, phrase),
    })),
  }
}

export type TreasureMapBearCaveQuestBinding = {
  mapGraveSpotId: string
  casketId: string
  locationId: string
  directionPhrase: string | null
  authoredCoinAmount: number
}

/** Treasure map bear cave (plan quests-progression-008). */
export function buildTreasureMapBearCaveQuest(binding: TreasureMapBearCaveQuestBinding): AuthoredQuestDef {
  const cavePlace = cavePlacePhrase(binding.directionPhrase)
  return {
    id: 'skarb-jaskini-niedzwiedzia',
    title: 'Stary skarb w jaskini',
    description: `Marek wie o mapie ukrytej na cmentarzu, która prowadzi do jaskini ${cavePlace} ze starym skarbem.`,
    giverName: 'Marek',
    offerLine:
      `Słyszałem, że przed laty ukryto starą mapę skarbu w grobie na naszym cmentarzu. Podobno prowadzi do jaskini ${cavePlace}, gdzie podobno leży zapieczętowana trumna. Odszukaj mapę i zobacz, czy legenda ma sens.`,
    stages: [
      {
        objective: { type: 'recover_hidden_find', spotId: binding.mapGraveSpotId },
        description: 'Odszukaj na cmentarzu grób ze starą mapą skarbu.',
        reminderLine: 'Mapa miała być ukryta w grobie na cmentarzu.',
        progressLine: 'W grobie leżała stara mapa. Marek wie, co dalej.',
      },
      {
        objective: { type: 'talk_to_npc', npcName: 'Marek' },
        description: `Porozmawiaj z Markiem o mapie i jaskini ${cavePlace}.`,
        reminderLine: 'Marek czeka na wieści o mapie.',
        playerLine: 'Znalazłem mapę w grobie. Dokąd prowadzi?',
        progressLine: `Mapa wskazuje jaskinię ${cavePlace}. Trzeba tam zajrzeć.`,
        effects: [{ type: 'reveal_location', locationId: binding.locationId }],
      },
      {
        objective: { type: 'discover_location', locationId: binding.locationId },
        description: `Dotrzyj do jaskini ${cavePlace} wskazanej na mapie.`,
        reminderLine: `Jaskinia ze skarbem jest ${cavePlace}.`,
        progressLine: 'To ta jaskinia. Gdzieś w środku musi być trumna.',
      },
      {
        objective: { type: 'acquire_portable_container', containerId: binding.casketId },
        description: 'Zabierz zapieczętowaną trumnę ze skarbem.',
        reminderLine: 'Musisz znaleźć i zabrać trumnę ze skarbem.',
        progressLine: 'Masz trumnę. Możesz ją otworzyć albo oddać Markowi nietkniętą.',
      },
      {
        objective: { type: 'await_quest_outcome' },
        description: 'Otwórz trumnę albo oddaj ją Marcowi.',
        reminderLine: 'Otwórz trumnę, żeby zatrzymać cały skarb, albo oddaj ją Marcowi za część zapłaty.',
        dialogueActions: [
          {
            npcName: 'Marek',
            playerLine: 'Mam trumnę. Weź ją — zostawiam resztę tobie.',
            npcLine: 'Dobrze. Zostawię ci część tego, co w niej było.',
            physicalOutcomeId: 'treasure_returned',
            requireCarriedContainerId: binding.casketId,
            requireCarriedUnopened: true,
          },
        ],
      },
    ],
    reportLine: 'Legenda okazała się prawdziwa.',
    outcomes: [
      {
        id: 'treasure_kept',
        state: 'complete',
        resultText: 'Cały skarb jest twój — otworzyłeś trumnę sam.',
      },
      {
        id: 'treasure_returned',
        state: 'complete',
        resultText: 'Uczciwy układ. Dzięki, że oddałeś trumnę bez otwierania.',
        effects: [{ type: 'discard_carried_container', containerId: binding.casketId }],
        reward: {
          visibility: 'hidden',
          items: [{ kind: 'coin', count: treasureMapBearCaveReturnPayout(binding.authoredCoinAmount) }],
        },
        consequences: {
          relations: [{ npcName: 'Marek', delta: 2 }],
          social: { reputation: { trust: 4, integrity: 3 }, renown: 4 },
        },
      },
    ],
    // The carried casket's own physical open/return choice IS the
    // resolution (plan quests-progression-033) — a generic opt-out here
    // would strand that carried instance outside any quest tracking.
    abandonment: { allowed: false },
  }
}

export function bindTreasureMapBearCaveQuest(
  def: AuthoredQuestDef,
  binding: TreasureMapBearCaveQuestBinding | null,
): AuthoredQuestDef {
  if (def.id !== 'skarb-jaskini-niedzwiedzia' || !binding) return def
  const cavePlace = cavePlacePhrase(binding.directionPhrase)
  return {
    ...def,
    description: applyCavePlaceToken(def.description, cavePlace),
    offerLine: applyCavePlaceToken(def.offerLine, cavePlace),
    stages: def.stages.map((stage) => ({
      ...stage,
      description: applyCavePlaceToken(stage.description, cavePlace),
      reminderLine: applyCavePlaceToken(stage.reminderLine, cavePlace),
      progressLine: stage.progressLine ? applyCavePlaceToken(stage.progressLine, cavePlace) : stage.progressLine,
    })),
  }
}
