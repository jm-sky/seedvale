import type { Fauna } from '../fauna/createFauna'
import type { Interactable, WorldItemRef } from '../interaction/Interactable'
import type { DroppedItems } from '../items/createDroppedItems'
import type { ItemSpawners } from '../items/createItemSpawners'
import type { PlacedTents } from '../items/createPlacedTents'
import type { ToolKind } from '../items/HeldTool'
import type { Settlement } from '../settlement/createSettlement'
import type { PlacedFires } from '../settlement/PlacedFires'
import type { ChunkManager } from '../terrain/chunkManager'
import type { ResourceDeposits } from '../terrain/resourceDeposits'
import { ANIMAL_LABELS, type AnimalKind } from '../fauna/AnimalAgent'
import { SPAWNER_LABELS } from '../fauna/createFauna'
import { isMeleeTool } from '../fauna/faunaCombat'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { ORE_YIELD_LABEL } from '../terrain/depositMining'
import { canLevelAt, getDigProfileAt, getRockDigProfileAt, isRockGround } from '../terrain/dig'
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

function animalPromptLabel(kind: AnimalKind, heldTool: ToolKind | null): string {
  const label = ANIMAL_LABELS[kind]
  return isMeleeTool(heldTool) ? `Atakuj: ${label}` : `Obserwuj: ${label}`
}

/** True if `(x, z)` is within `range` of `playerPos` (XZ plane, squared distance). */
function withinRange(x: number, z: number, playerPos: Vector3, range: number): boolean {
  const dx = x - playerPos.x
  const dz = z - playerPos.z
  return dx * dx + dz * dz <= range * range
}

/** Assembles this frame's `Interactable` candidates from every world system —
 *  NPCs, the well, nearby trees (settlement + streamed via lifecycle), live fauna,
 *  fauna spawn points, player-built campfires, and nearby pickup items
 *  (world-generated + the renewable pool + player-dropped). Settlement/fauna
 *  candidates aren't pre-filtered by their source systems (unlike trees/items,
 *  which already query `chunkManager` by range), so each is checked against
 *  `GAZE_RANGE` here before allocating its description object — `GAZE_RANGE`
 *  is the largest range any consumer of this list picks against, so nothing
 *  a caller could select is dropped. */
export function buildInteractables(
  settlements: readonly Settlement[],
  fauna: Fauna,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
  placedFires: PlacedFires,
  placedTents: PlacedTents,
  resourceDeposits: ResourceDeposits,
  playerPos: Vector3,
  /** Currently held tool — drives axe harvest prompts and animal attack prompts. */
  heldTool: ToolKind | null = null,
): Interactable[] {
  const list: Interactable[] = []
  const axeHeld = heldTool === 'axe'
  const shovelHeld = heldTool === 'shovel'
  const pickaxeHeld = heldTool === 'pickaxe'

  for (const pf of placedFires.list()) {
    if (!withinRange(pf.x, pf.z, playerPos, GAZE_RANGE)) continue
    list.push({
      kind: 'campfire',
      position: { x: pf.x, z: pf.z },
      promptLabel: pf.fire.isLit()
        ? 'Dołóż gałąź'
        : pf.kind === 'pit' ? 'Zapal ognisko w palenisku' : 'Zapal ognisko',
      fire: pf.fire,
    })
  }

  for (const tent of placedTents.list()) {
    if (!withinRange(tent.x, tent.z, playerPos, GAZE_RANGE)) continue
    list.push({
      kind: 'tent',
      position: { x: tent.x, z: tent.z },
      promptLabel: '[E] Odpocznij · [R] Złóż namiot',
      id: tent.id,
    })
  }

  for (const settlement of settlements) {
    for (const npc of settlement.npcs) {
      if (!withinRange(npc.mesh.position.x, npc.mesh.position.z, playerPos, GAZE_RANGE)) continue
      list.push({
        kind: 'npc',
        position: npc.mesh.position,
        promptLabel: `Rozmawiaj z ${npc.displayName}`,
        npc,
        settlement,
      })
    }

    for (const animal of settlement.livestock) {
      if (!withinRange(animal.mesh.position.x, animal.mesh.position.z, playerPos, GAZE_RANGE)) continue
      if (animal.isDead()) {
        if (shovelHeld && !animal.readyToRemove()) {
          list.push({
            kind: 'corpse',
            position: animal.mesh.position,
            promptLabel: `Zakop zwłoki: ${ANIMAL_LABELS[animal.def.kind]}`,
            animal,
          })
        }
        continue
      }
      list.push({
        kind: 'animal',
        position: animal.mesh.position,
        promptLabel: animalPromptLabel(animal.def.kind, heldTool),
        animal,
      })
    }

    if (withinRange(settlement.landmarks.well.x, settlement.landmarks.well.z, playerPos, GAZE_RANGE)) {
      list.push({
        kind: 'well',
        position: settlement.landmarks.well,
        promptLabel: 'Zaczerpnij wody',
      })
    }

    for (const house of settlement.landmarks.houses) {
      if (!withinRange(house.position.x, house.position.z, playerPos, GAZE_RANGE)) continue
      list.push({
        kind: 'house',
        position: house.position,
        promptLabel: `Obejrzyj: ${house.label}`,
        houseId: house.houseId,
        modelUrl: house.modelUrl,
        label: house.label,
        examine: house.examine,
        lampMount: house.lampMount,
        lampMountSource: house.lampMountSource,
      })
    }

    if (
      settlement.fire &&
      withinRange(settlement.fire.position.x, settlement.fire.position.z, playerPos, GAZE_RANGE)
    ) {
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
      if (tree.stage === 'mature' || tree.stage === 'old') promptLabel = 'Oczyść gałęzie'
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
      sizeClass: tree.sizeClass,
      canHarvest,
    })
  }

  for (const animal of fauna.getAgents()) {
    if (!withinRange(animal.mesh.position.x, animal.mesh.position.z, playerPos, GAZE_RANGE)) continue
    if (animal.isDead()) {
      if (shovelHeld && !animal.readyToRemove()) {
        list.push({
          kind: 'corpse',
          position: animal.mesh.position,
          promptLabel: `Zakop zwłoki: ${ANIMAL_LABELS[animal.def.kind]}`,
          animal,
        })
      }
      continue
    }
    list.push({
      kind: 'animal',
      position: animal.mesh.position,
      promptLabel: animalPromptLabel(animal.def.kind, heldTool),
      animal,
    })
  }

  for (const spawner of fauna.getSpawners()) {
    if (!withinRange(spawner.x, spawner.z, playerPos, GAZE_RANGE)) continue
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

  if (pickaxeHeld) {
    const deposit = resourceDeposits.queryNearest(playerPos.x, playerPos.z, GAZE_RANGE)
    if (deposit) {
      list.push({
        kind: 'deposit',
        position: { x: deposit.x, z: deposit.z },
        promptLabel: `Wydobądź: ${ORE_YIELD_LABEL[deposit.type]}`,
        id: deposit.id,
        oreType: deposit.type,
      })
    }
  }

  return list
}

function groundWorkPrompt(
  digLabel: string,
  profile: ReturnType<typeof getDigProfileAt>,
  canLevel: boolean,
): string {
  if (profile && canLevel) return `${digLabel} · [R] Wyrównaj`
  if (profile) return digLabel
  return '[R] Wyrównaj'
}

/** Ground-work target ahead of the player. Unlike everything in
 *  `buildInteractables()`, this isn't a fixed world object competing for gaze
 *  — `gameLoop.ts` only asks for one when `pickInGaze` found nothing, so it
 *  never outcompetes a real target (including ore deposits). Shovel: soil/sand
 *  only. Pickaxe: mountain rock only. `[E]` digs when a profile exists;
 *  `[R]` levels a depression on the same surface. */
export function buildDigTarget(
  playerPos: { x: number, z: number },
  playerYaw: number,
  heldTool: ToolKind | null,
  chunkManager: ChunkManager,
): Interactable | null {
  const x = playerPos.x - Math.sin(playerYaw) * DIG_REACH
  const z = playerPos.z - Math.cos(playerYaw) * DIG_REACH
  const rock = isRockGround(x, z, chunkManager)

  if (heldTool === 'shovel') {
    const profile = getDigProfileAt(x, z, chunkManager)
    const canLevel = !rock && canLevelAt(x, z, chunkManager)
    if (!profile && !canLevel) return null
    return {
      kind: 'dig',
      position: { x, z },
      promptLabel: groundWorkPrompt('Wykop dołek', profile, canLevel),
      profile,
      canLevel,
    }
  }

  if (heldTool === 'pickaxe') {
    const profile = getRockDigProfileAt(x, z, chunkManager)
    const canLevel = rock && canLevelAt(x, z, chunkManager)
    if (!profile && !canLevel) return null
    return {
      kind: 'dig',
      position: { x, z },
      promptLabel: groundWorkPrompt('Wykop skałę', profile, canLevel),
      profile,
      canLevel,
    }
  }

  return null
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
