import type { Inventory } from '../items/Inventory'
import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { NpcId } from '../settlement/npcState'
import type { ExpeditionAssignments } from './createExpeditionAssignments'
import type { ExpeditionAssignmentResult } from './expeditionAssignment'
import {
  inventoryFromContents,
  snapshotInventoryContents,
} from '../items/Inventory'
import { transferInventoryCount, transferInventoryInstance } from '../items/inventoryTransfer'
import { isLiquidContainerInstance } from '../items/itemInstances'
import { liquidContainerCapacity } from '../items/liquidContainer'

const PER_NPC_FOOD = 3
const BANDAGES_PER_NPC = 2

type CountMove = {
  type: 'count'
  source: Inventory
  destination: Inventory
  kind: ItemKind
  n: number
}

type InstanceMove = {
  type: 'instance'
  source: Inventory
  destination: Inventory
  instanceId: string
}

type InventoryMove = CountMove | InstanceMove

function cloneInventory(inventory: Inventory): Inventory {
  return inventoryFromContents(
    snapshotInventoryContents(inventory),
    inventory.maxWeight,
    inventory.maxSize,
    inventory.decayModifier,
  )
}

function compareInstanceId(a: ItemInstance, b: ItemInstance): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function filledWaterskinScore(instance: ItemInstance): number {
  if (!isLiquidContainerInstance(instance) || instance.kind !== 'waterskin_medium') return -1
  if (instance.liquid !== 'water' || instance.amountLitres <= 0) return -1
  const capacity = liquidContainerCapacity('waterskin_medium')
  return instance.amountLitres >= capacity ? 2 : 1
}

function pickInstanceIds(
  source: Inventory,
  kind: ItemKind,
  count: number,
  predicate: (instance: ItemInstance) => boolean,
  rank: (instance: ItemInstance) => number,
): string[] | null {
  const matches = source.getInstances(kind).filter(predicate).sort((a, b) => {
    const delta = rank(b) - rank(a)
    return delta !== 0 ? delta : compareInstanceId(a, b)
  })
  if (matches.length < count) return null
  return matches.slice(0, count).map((row) => row.id)
}

function foodUnits(source: Inventory): { meat: number, fish: number } {
  const need = PER_NPC_FOOD * 3
  const meatAvailable = source.count('dried_meat')
  const fishAvailable = source.count('dried_fish')
  const meat = Math.min(meatAvailable, need)
  const remaining = need - meat
  const fish = Math.min(fishAvailable, remaining)
  return { meat, fish }
}

function allocateFood(meat: number, fish: number): { meat: number, fish: number }[] {
  let remainingMeat = meat
  let remainingFish = fish
  const out: { meat: number, fish: number }[] = []
  for (let i = 0; i < 3; i++) {
    const takeMeat = Math.min(PER_NPC_FOOD, remainingMeat)
    remainingMeat -= takeMeat
    const takeFish = Math.min(PER_NPC_FOOD - takeMeat, remainingFish)
    remainingFish -= takeFish
    out.push({ meat: takeMeat, fish: takeFish })
  }
  return out
}

function applyMove(move: InventoryMove, nowDays: number): boolean {
  if (move.type === 'count') {
    return transferInventoryCount(move.source, move.destination, move.kind, move.n, nowDays)
  }
  return transferInventoryInstance(move.source, move.destination, move.instanceId)
}

function reverseMove(move: InventoryMove, nowDays: number): void {
  if (move.type === 'count') {
    transferInventoryCount(move.destination, move.source, move.kind, move.n, nowDays)
    return
  }
  transferInventoryInstance(move.destination, move.source, move.instanceId)
}

function buildMoves(params: {
  source: Inventory
  destinations: readonly [Inventory, Inventory, Inventory]
}): { ok: true, moves: InventoryMove[] } | { ok: false, reason: 'missing-equipment' | 'inventory-capacity' } {
  const { source, destinations } = params
  const knives = pickInstanceIds(source, 'knife', 3, () => true, () => 0)
  const waterskins = pickInstanceIds(
    source,
    'waterskin_medium',
    3,
    (instance) => filledWaterskinScore(instance) > 0,
    filledWaterskinScore,
  )
  const tents = pickInstanceIds(source, 'tent', 1, () => true, () => 0)
  const food = foodUnits(source)
  if (food.meat + food.fish < PER_NPC_FOOD * 3) {
    return { ok: false, reason: 'missing-equipment' }
  }
  if (
    !source.has('pickaxe', 3)
    || !source.has('blanket', 3)
    || !source.has('bandage', BANDAGES_PER_NPC * 3)
    || !source.has('shovel', 1)
    || !source.has('firestarter', 1)
    || !knives
    || !waterskins
    || !tents
  ) {
    return { ok: false, reason: 'missing-equipment' }
  }

  const foodPerNpc = allocateFood(food.meat, food.fish)
  const moves: InventoryMove[] = []
  for (let i = 0; i < 3; i++) {
    const dest = destinations[i]!
    moves.push({ type: 'count', source, destination: dest, kind: 'pickaxe', n: 1 })
    moves.push({ type: 'instance', source, destination: dest, instanceId: knives[i]! })
    moves.push({ type: 'count', source, destination: dest, kind: 'blanket', n: 1 })
    moves.push({ type: 'count', source, destination: dest, kind: 'bandage', n: BANDAGES_PER_NPC })
    if (foodPerNpc[i]!.meat > 0) {
      moves.push({ type: 'count', source, destination: dest, kind: 'dried_meat', n: foodPerNpc[i]!.meat })
    }
    if (foodPerNpc[i]!.fish > 0) {
      moves.push({ type: 'count', source, destination: dest, kind: 'dried_fish', n: foodPerNpc[i]!.fish })
    }
    moves.push({ type: 'instance', source, destination: dest, instanceId: waterskins[i]! })
    if (i === 0) {
      moves.push({ type: 'count', source, destination: dest, kind: 'shovel', n: 1 })
      moves.push({ type: 'count', source, destination: dest, kind: 'firestarter', n: 1 })
      moves.push({ type: 'instance', source, destination: dest, instanceId: tents[0]! })
    }
  }
  return { ok: true, moves }
}

/**
 * All-or-nothing expedition loadout transfer from settlement storage into
 * the three members' personal inventories (plan settlements-npcs-027).
 *
 * @domain settlements-npcs
 */
export function provisionExpeditionAssignment(params: {
  assignments: ExpeditionAssignments
  assignmentId: string
  source: Inventory | undefined
  personalInventory: (npcId: NpcId) => Inventory | undefined
  nowDays: number
}): ExpeditionAssignmentResult {
  const assignment = params.assignments.find(params.assignmentId)
  if (!assignment) return { ok: false, reason: 'conflicting-assignment' }
  if (assignment.state === 'provisioned' || assignment.state === 'ready') {
    return { ok: true, assignment }
  }
  if (assignment.state !== 'forming') return { ok: false, reason: 'conflicting-assignment' }
  if (!params.source) return { ok: false, reason: 'missing-settlement-storage' }

  const destinations: Inventory[] = []
  for (const npcId of assignment.memberNpcIds) {
    const inventory = params.personalInventory(npcId)
    if (!inventory) return { ok: false, reason: 'inventory-capacity' }
    destinations.push(inventory)
  }
  const destTuple = destinations as [Inventory, Inventory, Inventory]

  const planned = buildMoves({ source: params.source, destinations: destTuple })
  if (!planned.ok) return { ok: false, reason: planned.reason }

  const trialSource = cloneInventory(params.source)
  const trialDests = destTuple.map(cloneInventory) as [Inventory, Inventory, Inventory]
  const trialMoves = planned.moves.map((move) => {
    const destIndex = destTuple.indexOf(move.destination)
    return {
      ...move,
      source: trialSource,
      destination: trialDests[destIndex]!,
    }
  })
  for (const move of trialMoves) {
    if (applyMove(move, params.nowDays)) continue
    return {
      ok: false,
      reason: move.type === 'count'
        ? (trialSource.has(move.kind, move.n) ? 'inventory-capacity' : 'missing-equipment')
        : (trialSource.getInstance(move.instanceId) ? 'inventory-capacity' : 'missing-equipment'),
    }
  }

  const committed: InventoryMove[] = []
  for (const move of planned.moves) {
    if (applyMove(move, params.nowDays)) {
      committed.push(move)
      continue
    }
    for (let i = committed.length - 1; i >= 0; i--) reverseMove(committed[i]!, params.nowDays)
    return { ok: false, reason: 'inventory-capacity' }
  }

  const updated = params.assignments.markProvisioned(assignment.id, params.nowDays)
  if (!updated) {
    for (let i = committed.length - 1; i >= 0; i--) reverseMove(committed[i]!, params.nowDays)
    return { ok: false, reason: 'conflicting-assignment' }
  }
  return { ok: true, assignment: updated }
}

export function readyExpeditionAssignment(
  assignments: ExpeditionAssignments,
  assignmentId: string,
  nowDays: number,
): ExpeditionAssignmentResult {
  const assignment = assignments.find(assignmentId)
  if (!assignment) return { ok: false, reason: 'conflicting-assignment' }
  if (assignment.state === 'ready') return { ok: true, assignment }
  const updated = assignments.markReady(assignmentId, nowDays)
  if (!updated) return { ok: false, reason: 'conflicting-assignment' }
  return { ok: true, assignment: updated }
}
