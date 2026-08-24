import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { QuestDialogOverride, QuestManager } from '../quests/QuestManager'
import type { Household } from '../settlement/household'
import type { LandmarkKind } from '../terrain/chunkEnvironment'
import type { Interactable } from './Interactable'
import { isDebugMode } from '../debug/debugMode'
import { ANIMAL_LABELS } from '../fauna/AnimalAgent'
import { pickAnimalFlavorLine } from '../fauna/animalDialogue'
import { SPAWNER_LABELS } from '../fauna/createFauna'
import { LANDMARK_LABELS } from '../terrain/chunkEnvironment'
import { treeInspectionFlavor } from './treeInspection'

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

const SPAWNER_FLAVOR_LINES = [
  'Widać świeże ślady zwierząt w pobliżu.',
  'Miejsce wygląda na spokojne, na razie nikogo nie widać.',
]

const LANDMARK_FLAVOR_LINES: Record<LandmarkKind, readonly string[]> = {
  monolith: ['Stary głaz, porośnięty mchem. Ktoś ustawił go tu dawno temu.'],
  stoneCircle: ['Krąg kamieni ułożony z jakimś zamysłem — trudno dziś powiedzieć, jakim.'],
  smallRuins: ['Fragment starego muru, resztki fundamentów. Nikt tu dawno nie mieszkał.'],
  cemetery: ['Ciche miejsce. Kilka nagrobków, zarośniętych chwastami.'],
}

function pickFrom(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

/** Read-only stock lines (plan 156) — queried live from the simulation owner
 *  every time the dialog opens, never cached on the prop. */
function formatHouseholdStorage(household: Household): string {
  return [
    `Drewno: ${household.stock.query('wood')}`,
    `Jedzenie: ${household.stock.query('food')}`,
    `Woda: ${household.water.current}`,
  ].join('\n')
}

/** Excludes `water` — `SettlementEconomy`'s `water` stock is unused seed
 *  data (`economy/initial.ts`), the real reserve lives on `Household.water`
 *  (plan 122) and stays out of the settlement-wide container. */
function formatSettlementStorage(economy: SettlementEconomy): string {
  return [
    `Jedzenie: ${economy.query('food')}`,
    `Drewno: ${economy.query('wood')}`,
    `Żelazo: ${economy.query('iron')}`,
    `Węgiel: ${economy.query('coal')}`,
    `Złoto: ${economy.query('gold')}`,
  ].join('\n')
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text
}

/** Dispatches an `[E]`-pressed `Interactable` (everything except `item`/`campfire`/
 *  `corpse`/`deposit`/`tent`/`waterEdge`, which `app/gameLoop.ts`/`createApp.ts`
 *  handle directly — all need `Inventory`/`PlayerNeeds` access this module
 *  doesn't have — without opening this generic dialog; `npc`, which opens the
 *  dedicated Vue dialogue menu instead — see `ui-vue/store.ts`'s
 *  `openNpcDialogueMenu`; `dig`, which `gameLoop.ts` handles directly for
 *  the same `Inventory`-access reason; `landPlot`, whose purchase
 *  (plan 129) also needs `Inventory` access and is handled directly in
 *  `gameLoop.ts`, never opening this generic dialog; `dryingRack`/`hive`
 *  (plan 159), same `Inventory`-access reason, handled directly in
 *  `gameLoop.ts`/`createApp.ts`; `container` (plan 164), which opens the
 *  generic transfer screen instead of this dialog; and `playerWell` (plan
 *  127), same `Inventory`-access reason as `dig` — advancing a stage
 *  consumes materials, handled directly in `gameLoop.ts`; `gardenPlot`
 *  (plan 176), its maintenance action also handled directly in
 *  `gameLoop.ts`/`placementActions.ts`; `terrainPreparation` (plan
 *  `world-terrain-002`), same `Inventory`-access reason as `playerWell`,
 *  handled directly in `gameLoop.ts`/`terrainPreparationActions.ts`) to the right
 *  `QuestManager` call, falling back to flavor text when no active quest
 *  cares. `well` still goes through here for its flavor line/quest hook —
 *  `gameLoop.ts` additionally handles its own drink/fill mechanics (plan 106)
 *  alongside the call. A *completed* player-built well becomes a plain
 *  `well` candidate (see `app/interactables.ts`), so it goes through here too. */
export function resolveInteraction(
  target: Exclude<Interactable, { kind: 'campfire' | 'item' | 'npc' | 'dig' | 'corpse' | 'deposit' | 'tent' | 'trap' | 'waterEdge' | 'landPlot' | 'dryingRack' | 'hive' | 'crop' | 'container' | 'playerWell' | 'gardenPlot' | 'terrainPreparation' }>,
  questManager: QuestManager,
): InteractionOutcome {
  switch (target.kind) {
    case 'animal': {
      const kind = target.animal.def.kind
      // `find_animal` (bound to this exact instance) takes priority over the
      // by-kind `spot_animal` — both can be active at once, but only the
      // specific animal a "lost sheep"-style quest cares about should clear it.
      const override = questManager.onInteractObjective({ type: 'animal_found', animalId: target.animal.animalId })
        ?? questManager.onInteractObjective({ type: 'spot_animal', kind })
      return {
        speakerName: capitalize(ANIMAL_LABELS[kind]),
        line: override?.line ?? pickAnimalFlavorLine(kind),
      }
    }
    case 'house': {
      let line = target.examine
      if (isDebugMode()) {
        const model = target.modelUrl ?? '(procedural fallback)'
        const paste = target.lampMount
          ? `lampMount: { x: ${target.lampMount.x.toFixed(3)}, y: ${target.lampMount.y.toFixed(3)}, z: ${target.lampMount.z.toFixed(3)} }`
          : null
        console.info('[house]', {
          id: target.houseId,
          model,
          label: target.label,
          lampSource: target.lampMountSource,
          lampMount: target.lampMount,
          paste,
        })
        line = paste
          ? `${line}\n\n[debug] ${target.houseId} · ${model}\n${paste} · ${target.lampMountSource ?? '?'}`
          : `${line}\n\n[debug] ${target.houseId} · ${model}`
      }
      return { speakerName: target.label, line }
    }
    case 'householdStorage':
      return { speakerName: 'Magazyn domowy', line: formatHouseholdStorage(target.household) }
    case 'landmark': {
      const override = questManager.onInteractObjective({
        type: 'interact_landmark',
        landmarkId: target.landmarkId,
      })
      return {
        speakerName: LANDMARK_LABELS[target.envKind],
        line: override?.line ?? pickFrom(LANDMARK_FLAVOR_LINES[target.envKind]),
      }
    }
    case 'settlementStorage':
      return { speakerName: 'Magazyn osady', line: formatSettlementStorage(target.economy) }
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
      const flavor = treeInspectionFlavor(target.stage, target.sizeClass)
      return { speakerName: flavor.speakerName, line: override?.line ?? flavor.line }
    }
    case 'well': {
      const override = questManager.onInteractObjective({ type: 'interact_well' })
      return { speakerName: 'Studnia', line: override?.line ?? pickFrom(WELL_FLAVOR_LINES) }
    }
  }
}
