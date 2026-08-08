import type { QuestDialogOverride, QuestManager } from '../quests/QuestManager'
import type { Interactable } from './Interactable'
import { ANIMAL_LABELS } from '../fauna/AnimalAgent'
import { pickAnimalFlavorLine } from '../fauna/animalDialogue'
import { SPAWNER_LABELS } from '../fauna/createFauna'

export type InteractionOutcome = {
  speakerName: string
  line: string
  offer?: QuestDialogOverride['offer']
}

const WELL_FLAVOR_LINES = [
  'Woda w studni jest czysta i chłodna.',
  'Cembrowina wygląda na solidną robotę.',
  'Ktoś zostawił tu wiadro.',
]

const TREE_FLAVOR_LINES = [
  'Stare, sękate drzewo.',
  'Liście szumią na wietrze.',
  'Kora pachnie żywicą.',
]

const SPAWNER_FLAVOR_LINES = [
  'Widać świeże ślady zwierząt w pobliżu.',
  'Miejsce wygląda na spokojne, na razie nikogo nie widać.',
]

function pickFrom(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text
}

/** Dispatches an `[E]`-pressed `Interactable` (everything except `item`/`campfire`,
 *  which `app/createApp.ts` handles directly — both need `Inventory` access this
 *  module doesn't have — without opening this generic dialog) to the right
 *  `QuestManager` call, falling back to flavor text when no active quest cares. */
export function resolveInteraction(
  target: Exclude<Interactable, { kind: 'item' | 'campfire' }>,
  questManager: QuestManager,
): InteractionOutcome {
  switch (target.kind) {
    case 'animal': {
      const kind = target.animal.def.kind
      const override = questManager.onInteractObjective({ type: 'spot_animal', kind })
      return {
        speakerName: capitalize(ANIMAL_LABELS[kind]),
        line: override?.line ?? pickAnimalFlavorLine(kind),
      }
    }
    case 'npc': {
      const override = questManager.onInteract(target.npc.name)
      if (override) return { speakerName: target.npc.displayName, line: override.line, offer: override.offer }
      return { speakerName: target.npc.displayName, line: target.npc.getDialogueLine() }
    }
    case 'spawner': {
      const override = questManager.onInteractObjective({
        type: 'interact_spawner',
        spawnerType: target.spawner.type,
      })
      return {
        speakerName: capitalize(SPAWNER_LABELS[target.spawner.type]),
        line: override?.line ?? pickFrom(SPAWNER_FLAVOR_LINES),
      }
    }
    case 'tree': {
      const override = questManager.onInteractObjective({ type: 'interact_tree' })
      return { speakerName: 'Drzewo', line: override?.line ?? pickFrom(TREE_FLAVOR_LINES) }
    }
    case 'well': {
      const override = questManager.onInteractObjective({ type: 'interact_well' })
      return { speakerName: 'Studnia', line: override?.line ?? pickFrom(WELL_FLAVOR_LINES) }
    }
  }
}
