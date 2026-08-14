import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnerType } from '../fauna/AnimalSpawner'
import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import { genderForName, NPC_QUEST_COMPLETE_SOUND_URLS } from '../ai/NpcAgent'
import {
  type QuestDef,
  type QuestObjective,
  QUESTS,
  type QuestStage,
  type QuestState,
  type RelationLevel,
  relationToLevel,
} from './quests'

export type QuestDialogOverride = {
  line: string
  /** Present only when the dialog should present an accept/decline choice. */
  offer?: {
    onAccept: () => void
    onDecline: () => void
  }
}

export type QuestListEntry = {
  id: string
  giverName: string
  state: QuestState
  stageIndex: number
  totalStages: number
  /** Description of the current stage's objective (with a live count for
   *  `gather_item`), or null when not `active`. */
  currentObjective: string | null
}

export type QuestProgressEntry = { id: string, state: QuestState, stageIndex: number }

export type QuestManagerInitial = {
  progress: readonly QuestProgressEntry[]
  exp: number
  relations: Record<string, number>
}

export type QuestItemGrant = (kind: ItemKind, count: number) => void

/** What a non-NPC world interaction (well/tree/spawner/live animal) reports to
 *  `onInteractObjective`. `gather_item` has no interaction point of its own —
 *  it's resolved lazily when talking to the giver — so it's excluded here. */
export type ObjectiveRef =
  | { type: 'interact_well' }
  | { type: 'interact_tree' }
  | { type: 'interact_spawner', spawnerType: SpawnerType }
  | { type: 'spot_animal', kind: AnimalKind }
  | { type: 'animal_died', animalId: string }

/** Looks up a live individual of `kind` to bind a `kill_target_animal` stage
 *  to (its `AnimalAgent.animalId`), or `undefined` if none is available right
 *  now. Implemented by the world layer (has `Fauna`/`AnimalAgent` access) and
 *  injected — `QuestManager` never imports fauna to scan it itself. */
export type AnimalTargetResolver = (kind: AnimalKind) => string | undefined

/** Exp granted on turning in a quest. Flat for v1 — no per-quest tuning yet. */
const QUEST_EXP_REWARD = 10
/** Relation bump for the giver and any NPC named in a `talk_to_npc` stage. */
const QUEST_RELATION_REWARD = 1
/** Same headroom as NPC reaction clips (NpcAgent.ts) — a one-shot "thank you", not a focal cue. */
const QUEST_COMPLETE_SOUND_VOLUME = 0.35

/** `boundAnimalId` is the specific individual this quest's `kill_target_animal`
 *  stage was bound to (if any) — an `animal_died` ref only matches that one
 *  animal, never any animal of the right kind. */
function objectiveMatchesRef(objective: QuestObjective, ref: ObjectiveRef, boundAnimalId?: string): boolean {
  switch (ref.type) {
    case 'animal_died':
      return objective.type === 'kill_target_animal' && boundAnimalId === ref.animalId
    case 'interact_spawner':
      return objective.type === 'interact_spawner' && objective.spawnerType === ref.spawnerType
    case 'interact_tree':
      return objective.type === 'interact_tree'
    case 'interact_well':
      return objective.type === 'interact_well'
    case 'spot_animal':
      return objective.type === 'spot_animal' && objective.kind === ref.kind
  }
}

/** Drives multi-stage quests. Kept out of `NpcAgent`/world objects so they stay
 *  quest-agnostic — callers pass the resulting line/marker in as data. */
export class QuestManager {
  private readonly defs: readonly QuestDef[]
  private readonly inventory: Inventory
  private readonly states = new Map<string, { state: QuestState, stageIndex: number }>()
  private readonly relations = new Map<string, number>()
  /** `questId → animalId` bound the moment a `kill_target_animal` stage
   *  becomes active — see `bindAnimalTargetIfNeeded`. */
  private readonly animalTargets = new Map<string, string>()
  private readonly playSound: (url: string, volume?: number) => void
  private readonly grantItem: QuestItemGrant
  private readonly resolveAnimalTarget: AnimalTargetResolver
  private exp = 0
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
  ) {
    this.defs = defs
    this.playSound = playSound
    this.inventory = inventory
    this.grantItem = grantItem
    this.resolveAnimalTarget = resolveAnimalTarget
    for (const def of defs) this.states.set(def.id, { state: 'not_offered', stageIndex: 0 })
    if (initial) {
      for (const entry of initial.progress) {
        if (this.states.has(entry.id)) {
          this.states.set(entry.id, { state: entry.state, stageIndex: entry.stageIndex })
        }
      }
      this.exp = initial.exp
      for (const [name, value] of Object.entries(initial.relations)) this.relations.set(name, value)
    }
  }

  /** Drops all progress/exp/relations back to a fresh-start state — used on
   *  "New Game" so a new save doesn't inherit the previous playthrough's quest
   *  state (the instance itself is kept, since callers hold a `const` ref). */
  reset(): void {
    for (const def of this.defs) this.setQuestState(def.id, { state: 'not_offered', stageIndex: 0 })
    this.relations.clear()
    this.animalTargets.clear()
    this.exp = 0
  }

  private stateOf(id: string): { state: QuestState, stageIndex: number } {
    return this.states.get(id) ?? { state: 'not_offered', stageIndex: 0 }
  }

  private setQuestState(id: string, value: { state: QuestState, stageIndex: number }): void {
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

  getState(id: string): QuestState {
    return this.stateOf(id).state
  }

  getExp(): number {
    return this.exp
  }

  /** Sympathy score for an NPC by name, bumped on quest completion. Defaults to 0. */
  getRelation(npcName: string): number {
    return this.relations.get(npcName) ?? 0
  }

  /** Coarse relation tier for an NPC by name — see `RelationLevel`. */
  getRelationLevel(npcName: string): RelationLevel {
    return relationToLevel(this.getRelation(npcName))
  }

  /** Whether `def`'s `availability` gate (if any) is currently satisfied.
   *  Absent gate = always available, matching existing v2 quests. */
  private meetsAvailability(def: QuestDef): boolean {
    const required = def.availability?.relation
    if (!required) return true
    const order: readonly RelationLevel[] = ['stranger', 'acquainted', 'friendly', 'trusted']
    const have = order.indexOf(this.getRelationLevel(required.npcName))
    const need = order.indexOf(required.minimum)
    return have >= need
  }

  /** Whether `id` can currently be offered — false either because it's past
   *  `not_offered`/`offered` already, or its availability gate isn't met yet. */
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
        return {
          id: def.id,
          giverName: def.giverName,
          state: s.state,
          stageIndex: s.stageIndex,
          totalStages: def.stages.length,
          currentObjective: s.state === 'active' && stage ? this.objectiveDescription(stage) : null,
        }
      })
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

  /** Binds `stageIndex`'s objective to one concrete `animalId` if it's a
   *  `kill_target_animal` stage and isn't bound yet — a no-op otherwise
   *  (including when `resolveAnimalTarget` has no live candidate right now;
   *  it's retried the next time this is called for the same quest, since
   *  `animalTargets` only gets an entry once resolution succeeds). */
  private bindAnimalTargetIfNeeded(def: QuestDef, stageIndex: number): void {
    if (this.animalTargets.has(def.id)) return
    const objective = this.currentStage(def, stageIndex)?.objective
    if (objective?.type !== 'kill_target_animal') return
    const animalId = this.resolveAnimalTarget(objective.kind)
    if (animalId) this.animalTargets.set(def.id, animalId)
  }

  private completeQuest(def: QuestDef): string {
    this.setQuestState(def.id, { state: 'complete', stageIndex: def.stages.length })
    this.animalTargets.delete(def.id)
    const relationReward = def.effects?.relation ?? QUEST_RELATION_REWARD
    this.exp += def.effects?.exp ?? QUEST_EXP_REWARD
    this.bumpRelation(def.giverName, relationReward)
    for (const stage of def.stages) {
      if (stage.objective.type === 'talk_to_npc') {
        this.bumpRelation(stage.objective.npcName, relationReward)
      }
    }
    this.playQuestCompleteSound(def.giverName)
    if (def.reward) this.grantItem(def.reward.kind, def.reward.count)
    return def.reportLine
  }

  /** Advances past the current stage — to the next stage if any remain, or to
   *  `ready_to_report` once the last one clears. */
  private advanceStage(def: QuestDef, s: { state: QuestState, stageIndex: number }): void {
    const nextIndex = s.stageIndex + 1
    const nextState = nextIndex >= def.stages.length ? 'ready_to_report' : 'active'
    this.setQuestState(def.id, { state: nextState, stageIndex: nextIndex })
    if (nextState === 'active') this.bindAnimalTargetIfNeeded(def, nextIndex)
  }

  private handleGiverInteract(
    def: QuestDef,
    s: { state: QuestState, stageIndex: number },
  ): QuestDialogOverride | null {
    if (s.state === 'not_offered' || s.state === 'offered') {
      if (!this.meetsAvailability(def)) return null
      this.setQuestState(def.id, { state: 'offered', stageIndex: 0 })
      return {
        line: def.offerLine,
        offer: {
          onAccept: () => {
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
      if (stage.objective.type === 'gather_item') {
        const { kind, count } = stage.objective
        if (this.inventory.has(kind, count)) {
          this.inventory.remove(kind, count)
          this.advanceStage(def, s)
          const updated = this.stateOf(def.id)
          if (updated.state === 'ready_to_report') return { line: this.completeQuest(def) }
          return { line: this.currentStage(def, updated.stageIndex)?.reminderLine ?? def.reportLine }
        }
        return { line: stage.reminderLine }
      }
      return { line: stage.reminderLine }
    }
    if (s.state === 'ready_to_report') {
      return { line: this.completeQuest(def) }
    }
    return null
  }

  /** Quest-driven line/offer for talking to `npcName` right now, or null if
   *  this NPC has nothing quest-related to say (caller falls back to normal dialogue). */
  onInteract(npcName: string): QuestDialogOverride | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)

      if (npcName === def.giverName) {
        const result = this.handleGiverInteract(def, s)
        if (result) return result
      }

      if (s.state === 'active' && npcName !== def.giverName) {
        const stage = this.currentStage(def, s.stageIndex)
        if (stage?.objective.type === 'talk_to_npc' && stage.objective.npcName === npcName) {
          this.advanceStage(def, s)
          return { line: stage.progressLine ?? stage.description }
        }
      }
    }
    return null
  }

  /** Quest-driven line for interacting with a non-NPC world object (well/tree/
   *  spawner/live animal) matching `ref`, or null if no active quest cares. */
  onInteractObjective(ref: ObjectiveRef): QuestDialogOverride | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (s.state !== 'active') continue
      const stage = this.currentStage(def, s.stageIndex)
      if (!stage || !objectiveMatchesRef(stage.objective, ref, this.animalTargets.get(def.id))) continue
      this.advanceStage(def, s)
      return { line: stage.progressLine ?? stage.description }
    }
    return null
  }

  /** Label suffix for `npcName`, or null when no quest wants to flag them. */
  labelMarker(npcName: string): string | null {
    for (const def of this.defs) {
      const s = this.stateOf(def.id)
      if (npcName === def.giverName) {
        if (s.state === 'ready_to_report') return '?'
        if (s.state === 'offered' || s.state === 'active') return '!'
        if (s.state === 'not_offered' && this.meetsAvailability(def)) return '!'
      }
      if (s.state === 'active') {
        const stage = this.currentStage(def, s.stageIndex)
        if (stage?.objective.type === 'talk_to_npc' && stage.objective.npcName === npcName) return '?'
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
      return { id: def.id, state: s.state, stageIndex: s.stageIndex }
    })
  }

  exportRelations(): Record<string, number> {
    return Object.fromEntries(this.relations)
  }
}
