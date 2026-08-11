import type { Fauna } from '../fauna/createFauna'
import type { Interactable, WorldItemRef } from '../interaction/Interactable'
import type { DroppedItems } from '../items/createDroppedItems'
import type { ItemSpawners } from '../items/createItemSpawners'
import type { Settlement } from '../settlement/createSettlement'
import type { PlacedFires } from '../settlement/PlacedFires'
import type { ChunkManager } from '../terrain/chunkManager'
import { ANIMAL_LABELS } from '../fauna/AnimalAgent'
import { SPAWNER_LABELS } from '../fauna/createFauna'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { canLevelAt, getDigProfileAt } from '../terrain/dig'
import { isChoppableStage } from '../world/treeLifecycle'
import type { Vector3 } from 'three'

/** How close (world units) the player must be to an interactable before it's
 *  picked up by `[E]`. */
export const INTERACT_RANGE = 2.5
/** Minimum dot(playerForward, toTarget) to count as "looking at" — ~60° half-angle
 *  cone, needed so a dense cluster doesn't pick whichever is merely nearest. */
export const INTERACT_MIN_DOT = 0.5
/** Gaze-highlight range — deliberately larger than `INTERACT_RANGE` so the glow
 *  reads as an "approaching" cue before the `[E]` prompt appears. */
export const GAZE_RANGE = INTERACT_RANGE * 2
/** Chance an `[E]`-inspected tree also yields a branch, on top of the
 *  renewable branch spawn points (`createItemSpawners.ts`). */
export const TREE_BRANCH_CHANCE = 0.25
/** Added to `TREE_BRANCH_CHANCE` while the player carries a knife (plan
 *  `2026-08-08--043` §9) — a bonus, not a hard requirement. */
export const KNIFE_BRANCH_BONUS = 0.15
/** How far ahead (world units) of the player the shovel's synthetic dig
 *  target sits — inside `INTERACT_RANGE` so it's always within reach once
 *  offered; see `buildDigTarget`. */
export const DIG_REACH = 1.5

/** Assembles this frame's `Interactable` candidates from every world system —
 *  NPCs, the well, nearby trees (settlement + streamed via lifecycle), live fauna,
 *  fauna spawn points, player-built campfires, and nearby pickup items
 *  (world-generated + the renewable pool + player-dropped).
 *  Cheap: a few dozen objects total near the player. */
export function buildInteractables(
  settlements: readonly Settlement[],
  fauna: Fauna,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
  placedFires: PlacedFires,
  playerPos: Vector3,
  /** When the axe is held, mature trees show a chop prompt (plan 057). */
  axeHeld = false,
): Interactable[] {
  const list: Interactable[] = []

  for (const pf of placedFires.list()) {
    list.push({
      kind: 'campfire',
      position: { x: pf.x, z: pf.z },
      promptLabel: pf.fire.isLit()
        ? 'Dołóż gałąź'
        : pf.kind === 'pit' ? 'Zapal ognisko w palenisku' : 'Zapal ognisko',
      fire: pf.fire,
    })
  }

  for (const settlement of settlements) {
    for (const npc of settlement.npcs) {
      list.push({
        kind: 'npc',
        position: npc.mesh.position,
        promptLabel: `Rozmawiaj z ${npc.displayName}`,
        npc,
        settlement,
      })
    }

    for (const animal of settlement.livestock) {
      if (animal.isDead()) continue
      list.push({
        kind: 'animal',
        position: animal.mesh.position,
        promptLabel: `Obserwuj: ${ANIMAL_LABELS[animal.def.kind]}`,
        animal,
      })
    }

    list.push({
      kind: 'well',
      position: settlement.landmarks.well,
      promptLabel: 'Zaczerpnij wody',
    })

    if (settlement.fire) {
      list.push({
        kind: 'campfire',
        position: settlement.fire.position,
        promptLabel: settlement.fire.isLit() ? 'Dołóż gałąź' : 'Zapal ognisko',
        fire: settlement.fire,
      })
    }
  }

  // Settlement + streamed trees share TreeLifecycle registration — one nearby
  // query avoids duplicates and covers chunk vegetation (plan 057).
  for (const tree of chunkManager.getNearbyTrees(playerPos, GAZE_RANGE)) {
    const canHarvest = axeHeld && isChoppableStage(tree.stage)
    let promptLabel = 'Obejrzyj drzewo'
    if (canHarvest) {
      if (tree.stage === 'mature') promptLabel = 'Oczyść gałęzie'
      else if (tree.stage === 'limbed') promptLabel = 'Ścinaj drzewo'
      else promptLabel = 'Porąb pień'
    } else if (tree.stage === 'limbed' || tree.stage === 'felled' || tree.stage === 'harvested') {
      promptLabel = 'Obejrzyj pień'
    } else if (tree.stage === 'sapling') {
      promptLabel = 'Obejrzyj drzewko'
    }
    list.push({
      kind: 'tree',
      position: { x: tree.x, z: tree.z },
      promptLabel,
      id: tree.id,
      stage: tree.stage,
      canHarvest,
    })
  }

  for (const animal of fauna.getAgents()) {
    if (animal.isDead()) continue
    list.push({
      kind: 'animal',
      position: animal.mesh.position,
      promptLabel: `Obserwuj: ${ANIMAL_LABELS[animal.def.kind]}`,
      animal,
    })
  }

  for (const spawner of fauna.getSpawners()) {
    list.push({
      kind: 'spawner',
      position: { x: spawner.x, z: spawner.z },
      promptLabel: `Zbadaj: ${SPAWNER_LABELS[spawner.type]}`,
      spawner,
    })
  }

  for (const item of chunkManager.getNearbyItems(playerPos, INTERACT_RANGE)) {
    list.push({
      kind: 'item',
      position: { x: item.x, z: item.z },
      promptLabel: `Podnieś: ${ITEM_DEFS[item.kind].label}`,
      item: { id: item.id, kind: item.kind, source: 'world' },
    })
  }

  for (const node of itemSpawners.nodes()) {
    if (node.collected) continue
    list.push({
      kind: 'item',
      position: { x: node.x, z: node.z },
      promptLabel: `Podnieś: ${ITEM_DEFS[node.kind].label}`,
      item: { id: node.id, kind: node.kind, source: 'spawner' },
    })
  }

  for (const item of droppedItems.nodes()) {
    list.push({
      kind: 'item',
      position: { x: item.x, z: item.z },
      promptLabel: `Podnieś: ${ITEM_DEFS[item.kind].label}`,
      item: { id: item.id, kind: item.kind, source: 'dropped' },
    })
  }

  return list
}

/** The shovel's ground-work target, unlike everything in `buildInteractables()`'s
 *  list, isn't a fixed world object competing for gaze priority — it's
 *  synthesized directly ahead of the player at a fixed reach. `gameLoop.ts`
 *  only asks for one when `pickInGaze` over the real candidates found
 *  nothing, so it's a fallback and can never outcompete a real target the
 *  player is glancing near. Requires the shovel to be **held** (not merely
 *  owned). `[E]` digs when diggable; `[R]` levels when depressed vs base —
 *  both can be offered together. */
export function buildDigTarget(
  playerPos: { x: number, z: number },
  playerYaw: number,
  shovelHeld: boolean,
  chunkManager: ChunkManager,
): Interactable | null {
  if (!shovelHeld) return null
  const x = playerPos.x - Math.sin(playerYaw) * DIG_REACH
  const z = playerPos.z - Math.cos(playerYaw) * DIG_REACH
  const profile = getDigProfileAt(x, z, chunkManager)
  const canLevel = canLevelAt(x, z, chunkManager)
  if (!profile && !canLevel) return null
  // Dig-only / both: FlavorDialog prefixes `[E]`. Level-only starts with `[R]`
  // so the dialog skips that prefix (see FlavorDialog.vue).
  let promptLabel: string
  if (profile && canLevel) promptLabel = 'Wykop dołek · [R] Wyrównaj'
  else if (profile) promptLabel = 'Wykop dołek'
  else promptLabel = '[R] Wyrównaj'
  return {
    kind: 'dig',
    position: { x, z },
    promptLabel,
    profile,
    canLevel,
  }
}

/** Routes a picked-up `WorldItemRef` to whichever registry it came from —
 *  world-generated (finite, id-based collected set), the renewable pool near
 *  the settlement, or a player drop. */
export function collectItem(
  ref: WorldItemRef,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
): { kind: ItemKind, x: number, z: number } | null {
  switch (ref.source) {
    case 'dropped':
      return droppedItems.collect(ref.id)
    case 'spawner':
      return itemSpawners.collect(ref.id)
    case 'world':
      return chunkManager.collectItem(ref.id)
  }
}
