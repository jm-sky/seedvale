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

export type QuestState =
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

/** Gates whether a quest is offered at all. Absent = always available
 *  (existing v2 quests keep their current behaviour). */
export type QuestAvailability = {
  prerequisites: readonly QuestPrerequisite[]
}

const RELATION_LEVEL_ORDER: readonly RelationLevel[] = ['stranger', 'acquainted', 'friendly', 'trusted']

/** Whether `current` meets or exceeds the authored `minimum` tier. */
export function relationLevelMeetsMinimum(current: RelationLevel, minimum: RelationLevel): boolean {
  return RELATION_LEVEL_ORDER.indexOf(current) >= RELATION_LEVEL_ORDER.indexOf(minimum)
}

const REPUTATION_MIN = -100
const REPUTATION_MAX = 100
const RENOWN_MIN = 0
const RENOWN_MAX = 100

export class QuestDefinitionValidationError extends Error {}

/** Validates final runtime quest definitions once, after composition-root
 *  settlement binding. Throws `QuestDefinitionValidationError` on invalid
 *  authored prerequisites, `talk_to_npc_choice` objectives, or stage
 *  dialogue actions — never clamps thresholds at runtime. */
export function validateQuestDefinitions(defs: readonly QuestDef[]): void {
  const byId = new Map(defs.map((def) => [def.id, def]))
  for (const def of defs) {
    validatePlayerDialogueLines(def)
    validateTalkToNpcChoiceObjective(def)
    validateStageDialogueActions(def)
    const prerequisites = def.availability?.prerequisites
    if (!prerequisites?.length) continue
    for (const prereq of prerequisites) {
      switch (prereq.type) {
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
  for (const stage of def.stages) {
    const objective = stage.objective
    if (objective.type !== 'talk_to_npc_choice') continue
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
}

/** Persisted/runtime quest progress. `resolvedOutcomeId` is set only for
 *  `complete`/`failed`; `invalidated` and in-progress states omit it. */
export type QuestProgressEntry = {
  id: string
  state: QuestState
  stageIndex: number
  resolvedOutcomeId?: QuestOutcomeId
}

export const QUEST_STATES: ReadonlySet<QuestState> = new Set([
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

/**
 * Player-facing speech available while this stage is active. Selection
 * advances the current stage through `QuestManager.advanceStage()` without
 * resolving the quest. Optional consequences apply on selection only.
 *
 * @domain quests-progression
 */
export type QuestStageDialogueAction = {
  npc: QuestNpcRef
  playerLine: string
  npcLine?: string
  consequences?: QuestConsequences
}

export type QuestStage = {
  objective: QuestObjective
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
      }[]
    }
  | Exclude<QuestObjective, { type: 'talk_to_npc' } | { type: 'talk_to_npc_choice' }>

export type AuthoredQuestPrerequisite =
  | { type: 'relation', npcName: string, minimum: RelationLevel }
  | Exclude<QuestPrerequisite, { type: 'relation' }>

export type AuthoredQuestConsequences = Omit<QuestConsequences, 'relations'> & {
  relations?: ReadonlyArray<{ npcName: string, delta: number }>
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
}

export type AuthoredQuestStage = Omit<QuestStage, 'objective' | 'dialogueActions'> & {
  objective: AuthoredQuestObjective
  dialogueActions?: readonly AuthoredQuestStageDialogueAction[]
}

export type AuthoredQuestOutcome = Omit<QuestOutcome, 'consequences'> & {
  consequences?: AuthoredQuestConsequences
}

/** Name-keyed authored quest content. Identity-bearing fields become
 *  `QuestNpcRef` at composition-root materialization — never matched by
 *  display name at runtime.
 *
 *  @domain quests-progression */
export type AuthoredQuestDef = Omit<QuestDef, 'giver' | 'stages' | 'availability' | 'outcomes'> & {
  stages: readonly AuthoredQuestStage[]
  availability?: { prerequisites: readonly AuthoredQuestPrerequisite[] }
  outcomes: readonly AuthoredQuestOutcome[]
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
        objective: { type: 'interact_spawner', spawnerType: 'cave' },
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
    description: 'Anna potrzebuje trzech ziół do domowych zapasów.',
    giverName: 'Anna',
    offerLine:
      'Zbierasz zioła w okolicy? Przydałyby mi się trzy sztuki — zapłacę osiem monet.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'herb', count: 3 },
        description: 'Zbierz 3 zioła.',
        reminderLine: 'Masz już trzy zioła?',
        playerLine: 'Tak. Zebrałem trzy zioła — proszę.',
      },
    ],
    reportPromptLine: 'Masz już te zioła?',
    reportPlayerLine: 'Tak. Zebrałem trzy zioła — proszę.',
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
    title: 'Sprawdzenie jaskini',
    description:
      'Kasia prosi o sprawdzenie jaskini znajdującej się {cavePlace}. Ostatnio zauważono tam świeże ślady zwierząt.',
    giverName: 'Kasia',
    offerLine:
      'Ostatnio ktoś widział świeże ślady przy jaskini {cavePlace}. Możesz tam zajrzeć i sprawdzić, czy nie kręci się tam coś niebezpiecznego? Zapłacę ci za fatygę.',
    stages: [
      {
        objective: { type: 'interact_spawner', spawnerType: 'cave' },
        description: 'Sprawdź jaskinię wskazaną przez Kasię.',
        reminderLine: 'Jaskinia jest {cavePlace}. Sprawdź tylko, co się tam dzieje, i wróć do mnie.',
        progressLine:
          'Wokół wejścia widać świeże ślady zwierząt. To miejsce zdecydowanie nie jest opuszczone.',
      },
    ],
    reportPromptLine: 'I jak? Udało ci się sprawdzić jaskinię?',
    reportPlayerLine:
      'Tak. Są tam świeże ślady. Wygląda na to, że coś regularnie korzysta z tej jaskini.',
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
      'Kasia zgubiła handlową przesyłkę przy jaskini {cavePlace}. Sprawdź jaskinię i zdecyduj, komu ją oddać.',
    giverName: 'Kasia',
    offerLine:
      'Zgubiłam przesyłkę przy jaskini {cavePlace}. To prywatne listy i rachunki — bez nich nie ogarnę dostawy. Marek już o tym słyszał i chętnie by to przejął „dla porządku”. Dasz radę tam zajrzeć?',
    stages: [
      {
        objective: { type: 'interact_spawner', spawnerType: 'cave' },
        description: 'Sprawdź jaskinię wskazaną przez Kasię.',
        reminderLine: 'Jaskinia jest {cavePlace}. Szukaj przesyłki przy wejściu.',
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
            },
            {
              npcName: 'Marek',
              outcomeId: 'turned_over_to_guard',
              npcLine:
                'Kasia zgubiła przesyłkę na szlaku. Jeśli ją masz — oddaj mi ją. Straż powinna sprawdzić, skąd przyszła i czy na pewno jest tym, za co ją podaje.',
              playerLine: 'Znalazłem przesyłkę Kasi. Przekazuję ją straży.',
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
    description: 'Anna i Piotr chcą pierwszeństwa do tej samej pomocy przy materiale. Porozmawiaj z obojgiem i zdecyduj, komu pomożesz.',
    giverName: 'Anna',
    offerLine:
      'Potrzebujemy materiału na gospodarstwo, ale Piotr też na niego liczy. Porozmawiaj z nim i zdecyduj, komu pomożesz.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npcName: 'Piotr' },
        description: 'Porozmawiaj z Piotrem.',
        reminderLine: 'Rozmawiałeś już z Piotrem?',
        playerLine: 'Anna mówiła, że ty też chcesz to samo drewno.',
        progressLine:
          'Potrzebuję go na naprawy, bez których stoję. Anna chce je na gospodarstwo. Zdecyduj, komu pomożesz — nie wystarczy dla obojga.',
      },
      {
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            {
              npcName: 'Anna',
              outcomeId: 'support_anna',
              npcLine: 'No i jak? Piotr cię przekonał, czy zostajesz przy gospodarstwie?',
              playerLine: 'Pomożę tobie. Gospodarstwo nie może czekać.',
            },
            {
              npcName: 'Piotr',
              outcomeId: 'support_piotr',
              npcLine: 'No? Pomagasz mi, czy Annie?',
              playerLine: 'Pomożę tobie. Najpierw naprawy, potem reszta.',
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
        resultText: 'Dziękuję. Przyda nam się każda pomoc przy gospodarstwie.',
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
        resultText: 'Dobra, skoro tak. Będę miał czym robić.',
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
    description: 'Anna czeka na gałęzie na potrzeby gospodarstwa.',
    giverName: 'Anna',
    offerLine: 'Skoro zdecydowałeś — przyniesiesz pięć gałęzi? Przyda się na gospodarstwie.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'branch', count: 5 },
        description: 'Zbierz 5 gałęzi.',
        reminderLine: 'Masz już pięć gałęzi?',
        playerLine: 'Przyniosłem pięć gałęzi na gospodarstwo.',
      },
    ],
    reportPromptLine: 'Masz już gałęzie?',
    reportPlayerLine: 'Przyniosłem pięć gałęzi na gospodarstwo.',
    reportLine: 'Dziękuję, to wystarczy.',
    availability: {
      prerequisites: [
        { type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_anna'] },
      ],
    },
    outcomes: [
      {
        id: 'delivered_to_anna',
        state: 'complete',
        resultText: 'Dziękuję, to wystarczy.',
        reward: { visibility: 'hidden', items: [{ kind: 'seed_carrot', count: 3 }] },
        consequences: { relations: [{ npcName: 'Anna', delta: 1 }] },
      },
    ],
  },
  {
    id: 'drewno-dla-piotra',
    title: 'Drewno dla Piotra',
    description: 'Piotr czeka na gałęzie do swoich prac.',
    giverName: 'Piotr',
    offerLine: 'Skoro tak — zbierzesz pięć gałęzi? Zapłacę osiem monet.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'branch', count: 5 },
        description: 'Zbierz 5 gałęzi.',
        reminderLine: 'Masz już pięć gałęzi?',
        playerLine: 'Przyniosłem pięć gałęzi do twoich prac.',
      },
    ],
    reportPromptLine: 'Masz już gałęzie?',
    reportPlayerLine: 'Przyniosłem pięć gałęzi do twoich prac.',
    reportLine: 'To starczy. Weź zapłatę.',
    availability: {
      prerequisites: [
        { type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_piotr'] },
      ],
    },
    outcomes: [
      {
        id: 'delivered_to_piotr',
        state: 'complete',
        resultText: 'To starczy. Weź zapłatę.',
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
 *  established NPCs' problems, resolved once at world setup via `resolve`
 *  rather than hardcoded, so the same lines bind to a different real
 *  placement per world seed (see `interact_landmark`'s doc comment). A kind
 *  `resolve` can't find within its search bound is simply omitted this
 *  session rather than offered broken — not every world is guaranteed to
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

  const monolithId = resolve('monolith')
  if (monolithId) {
    quests.push({
      id: 'slad-przy-monolicie',
      title: 'Ślad przy monolicie',
      description: 'Ktoś z osady nie wrócił — ostatni raz widziano go przy starym monolicie.',
      giverName: 'Anna',
      offerLine:
        'Jeden z naszych wyruszył w stronę wzgórz kilka dni temu i wciąż nie wrócił. Podobno ostatni raz widziano go przy starym monolicie — sprawdzisz to miejsce?',
      stages: [
        {
          objective: { type: 'interact_landmark', landmarkId: monolithId },
          description: 'Zbadaj monolit, gdzie ostatnio go widziano.',
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
      ],
    })
  }

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

  return quests
}

/** Merchant horse reward quest (plan quests-progression-012) — bound to one
 *  concrete `animalId` resolved at composition root. Omitted when the home
 *  settlement has no merchant horse acquisition target this session. */
/** Deep-forest ruins treasure map quest (plan quests-progression-009). */
export function buildDarkForestTreasureQuest(): AuthoredQuestDef {
  return {
    id: 'mapa-do-skarbu',
    title: 'Mapa do skarbu',
    description: 'Piotr słyszał o starych ruinach głęboko w ciemnym lesie i o skarbie, który tam spoczywa.',
    giverName: 'Piotr',
    offerLine:
      'Słyszałem o starych ruinach głęboko w ciemnym lesie. Podobno ktoś zostawił tam skarb i mapę, która do niego prowadzi. Jeśli mapę odczytasz i wrócisz żywy — opowiedz, co tam znalazłeś.',
    stages: [
      {
        objective: { type: 'read_item', itemKind: 'treasure_map_dark_forest' },
        description: 'Znajdź mapę do skarbu i odczytaj ją.',
        reminderLine: 'Bez mapy nie wiesz, gdzie szukać ruin.',
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

/** Binds exact home-cave identity and cheap direction prose onto the
 *  authored cave quests. Direction is already-resolved presentation data
 *  — never persisted. */
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
        objective: stage.objective.type === 'interact_spawner' && caveId
          ? { ...stage.objective, spawnerId: caveId }
          : stage.objective,
      })),
    }
  })
}
