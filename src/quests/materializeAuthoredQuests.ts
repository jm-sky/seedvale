import type { SettlementNpcDescriptor } from '../settlement/npcIdentity'
import type { NpcId } from '../settlement/npcState'
import type {
  AuthoredQuestDef,
  AuthoredQuestObjective,
  AuthoredQuestStageDialogueAction,
  QuestDef,
  QuestNpcRef,
  QuestObjective,
  QuestStageDialogueAction,
} from './quests'

export class AuthoredNpcResolutionError extends Error {}

function questNpcRef(npcId: NpcId): QuestNpcRef {
  return { npcId }
}

/**
 * Resolve an authored NPC display name to the unique stable id in `descriptors`.
 * Fails on missing or ambiguous names — no runtime fallback by name.
 *
 * @domain quests-progression
 */
export function resolveAuthoredNpcId(
  name: string,
  descriptors: readonly SettlementNpcDescriptor[],
  questId: string,
): NpcId {
  const matches = descriptors.filter((descriptor) => descriptor.name === name)
  if (matches.length === 0) {
    throw new AuthoredNpcResolutionError(`Quest "${questId}" references unknown NPC "${name}"`)
  }
  if (matches.length > 1) {
    throw new AuthoredNpcResolutionError(`Quest "${questId}" references ambiguous NPC name "${name}"`)
  }
  return matches[0]!.id
}

function materializeObjective(
  objective: AuthoredQuestObjective,
  resolve: (name: string) => NpcId,
): QuestObjective {
  if (objective.type === 'talk_to_npc') {
    return { type: 'talk_to_npc', npc: questNpcRef(resolve(objective.npcName)) }
  }
  if (objective.type === 'talk_to_npc_choice') {
    return {
      type: 'talk_to_npc_choice',
      choices: objective.choices.map((choice) => ({
        npc: questNpcRef(resolve(choice.npcName)),
        outcomeId: choice.outcomeId,
        playerLine: choice.playerLine,
        npcLine: choice.npcLine,
      })),
    }
  }
  return objective
}

function materializeDialogueActions(
  actions: readonly AuthoredQuestStageDialogueAction[] | undefined,
  resolve: (name: string) => NpcId,
): readonly QuestStageDialogueAction[] | undefined {
  if (!actions) return undefined
  return actions.map((action) => ({
    npc: questNpcRef(resolve(action.npcName)),
    playerLine: action.playerLine,
    npcLine: action.npcLine,
    consequences: action.consequences
      ? {
          ...action.consequences,
          relations: action.consequences.relations?.map((rel) => ({
            npc: questNpcRef(resolve(rel.npcName)),
            delta: rel.delta,
          })),
        }
      : undefined,
  }))
}

/**
 * Bind authored NPC names to stable `QuestNpcRef` identities. `giverName`
 * remains presentation data and does not participate in matching.
 *
 * @domain quests-progression
 */
export function materializeAuthoredQuestDefs(
  defs: readonly AuthoredQuestDef[],
  descriptors: readonly SettlementNpcDescriptor[],
): QuestDef[] {
  return defs.map((def) => {
    const resolve = (name: string) => resolveAuthoredNpcId(name, descriptors, def.id)
    return {
      ...def,
      giver: questNpcRef(resolve(def.giverName)),
      stages: def.stages.map((stage) => ({
        ...stage,
        objective: materializeObjective(stage.objective, resolve),
        dialogueActions: materializeDialogueActions(stage.dialogueActions, resolve),
      })),
      availability: def.availability
        ? {
            prerequisites: def.availability.prerequisites.map((prereq) => (
              prereq.type === 'relation'
                ? { type: 'relation' as const, npc: questNpcRef(resolve(prereq.npcName)), minimum: prereq.minimum }
                : prereq
            )),
          }
        : undefined,
      outcomes: def.outcomes.map((outcome) => ({
        ...outcome,
        consequences: outcome.consequences
          ? {
              ...outcome.consequences,
              relations: outcome.consequences.relations?.map((rel) => ({
                npc: questNpcRef(resolve(rel.npcName)),
                delta: rel.delta,
              })),
            }
          : undefined,
      })),
    }
  })
}

/**
 * Convert legacy name-keyed player↔NPC relations to stable NPC ids where the
 * name uniquely matches a descriptor. Keys that already match an id pass
 * through. Ambiguous names fail rather than mapping silently.
 *
 * @domain quests-progression
 */
export function normalizeLegacyQuestRelations(
  relations: Record<string, number>,
  descriptors: readonly SettlementNpcDescriptor[],
): Record<string, number> {
  const byId = new Set(descriptors.map((descriptor) => descriptor.id))
  const byName = new Map<string, SettlementNpcDescriptor[]>()
  for (const descriptor of descriptors) {
    const list = byName.get(descriptor.name) ?? []
    list.push(descriptor)
    byName.set(descriptor.name, list)
  }

  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(relations)) {
    if (byId.has(key)) {
      out[key] = value
      continue
    }
    const named = byName.get(key)
    if (!named) {
      out[key] = value
      continue
    }
    if (named.length !== 1) {
      throw new AuthoredNpcResolutionError(`Legacy relation key "${key}" is ambiguous`)
    }
    out[named[0]!.id] = value
  }
  return out
}
