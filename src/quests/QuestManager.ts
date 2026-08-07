import { genderForName, NPC_QUEST_COMPLETE_SOUND_URLS } from '../ai/NpcAgent'
import { type QuestDef, QUESTS, type QuestState } from './quests'

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
  targetName: string
  state: QuestState
}

/** Exp granted on turning in a quest. Flat for v1 — one hardcoded quest, no tuning needed yet. */
const QUEST_EXP_REWARD = 10
/** Relation bump for giver + target on quest completion. */
const QUEST_RELATION_REWARD = 1
/** Same headroom as NPC reaction clips (NpcAgent.ts) — a one-shot "thank you", not a focal cue. */
const QUEST_COMPLETE_SOUND_VOLUME = 0.35

/** Drives the v1 hardcoded relay quest(s). Kept out of `NpcAgent` so NPCs stay
 *  quest-agnostic — callers pass the resulting line/marker in as data. */
export class QuestManager {
  private readonly defs: readonly QuestDef[]
  private readonly states = new Map<string, QuestState>()
  private readonly relations = new Map<string, number>()
  private readonly playSound: (url: string, volume?: number) => void
  private exp = 0

  constructor(
    defs: readonly QuestDef[] = QUESTS,
    playSound: (url: string, volume?: number) => void = () => {},
  ) {
    this.defs = defs
    this.playSound = playSound
    for (const def of defs) this.states.set(def.id, 'not_offered')
  }

  getState(id: string): QuestState {
    return this.states.get(id) ?? 'not_offered'
  }

  getExp(): number {
    return this.exp
  }

  /** Sympathy score for an NPC by name, bumped on quest completion. Defaults to 0. */
  getRelation(npcName: string): number {
    return this.relations.get(npcName) ?? 0
  }

  list(): QuestListEntry[] {
    return this.defs.map((def) => ({
      id: def.id,
      giverName: def.giverName,
      targetName: def.targetName,
      state: this.getState(def.id),
    }))
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

  /** Quest-driven line/offer for talking to `npcName` right now, or null if
   *  this NPC has nothing quest-related to say (caller falls back to normal dialogue). */
  onInteract(npcName: string): QuestDialogOverride | null {
    for (const def of this.defs) {
      const state = this.getState(def.id)
      if (npcName === def.giverName) {
        if (state === 'not_offered' || state === 'offered') {
          this.states.set(def.id, 'offered')
          return {
            line: def.offerLine,
            offer: {
              onAccept: () => this.states.set(def.id, 'active'),
              onDecline: () => this.states.set(def.id, 'not_offered'),
            },
          }
        }
        if (state === 'active') return { line: def.activeReminderLine }
        if (state === 'ready_to_report') {
          this.states.set(def.id, 'complete')
          this.exp += QUEST_EXP_REWARD
          this.bumpRelation(def.giverName, QUEST_RELATION_REWARD)
          this.bumpRelation(def.targetName, QUEST_RELATION_REWARD)
          this.playQuestCompleteSound(def.giverName)
          return { line: def.reportLine }
        }
      }
      if (npcName === def.targetName && state === 'active') {
        this.states.set(def.id, 'ready_to_report')
        return { line: def.targetLine }
      }
    }
    return null
  }

  /** Label suffix for `npcName`, or null when no quest wants to flag them. */
  labelMarker(npcName: string): string | null {
    for (const def of this.defs) {
      const state = this.getState(def.id)
      if (npcName === def.giverName) {
        if (state === 'ready_to_report') return '?'
        if (state === 'not_offered' || state === 'offered' || state === 'active') return '!'
      }
      if (npcName === def.targetName && state === 'active') return '?'
    }
    return null
  }
}
