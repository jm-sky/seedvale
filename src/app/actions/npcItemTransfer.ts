import type { Inventory } from '../../items/Inventory'
import type { ItemKind } from '../../items/items'
import type { NpcAuthoritativeState } from '../../settlement/npcState'
import { transferInventoryCount, transferInventoryInstance } from '../../items/inventoryTransfer'

export type GiveItemToNpcResult =
  | { status: 'ok' }
  | { status: 'recipient_missing' }
  | { status: 'recipient_dead' }
  | { status: 'source_missing' }
  | { status: 'destination_full' }

export type GiveItemToNpcDeps = {
  playerInventory: Inventory
  getNpcState: (id: string) => NpcAuthoritativeState | undefined
}

/**
 * Explicit Player → NPC ownership transfer into `personalInventory`
 * (plan items-player-027). Re-resolves the recipient by stable `npcId` at
 * commit time; uses `inventoryTransfer` primitives so freshness / instance
 * identity stay atomic. Does not equip, consume, or force NPC use.
 *
 * @domain items-player
 */
export function giveItemCountToNpc(
  deps: GiveItemToNpcDeps,
  input: { npcId: string, kind: ItemKind, amount: number, nowDays: number },
): GiveItemToNpcResult {
  const amount = Math.floor(input.amount)
  if (amount <= 0) return { status: 'source_missing' }
  const npcState = deps.getNpcState(input.npcId)
  if (!npcState) return { status: 'recipient_missing' }
  if (npcState.health.dead) return { status: 'recipient_dead' }
  if (!deps.playerInventory.has(input.kind, amount)) return { status: 'source_missing' }
  if (!npcState.personalInventory.canAdd(input.kind, amount)) return { status: 'destination_full' }
  if (!transferInventoryCount(
    deps.playerInventory,
    npcState.personalInventory,
    input.kind,
    amount,
    input.nowDays,
  )) {
    return { status: 'destination_full' }
  }
  return { status: 'ok' }
}

/**
 * Instance-backed Player → NPC transfer (weapons, liquid containers, …).
 * Preserves concrete instance id and state.
 *
 * @domain items-player
 */
export function giveItemInstanceToNpc(
  deps: GiveItemToNpcDeps,
  input: { npcId: string, instanceId: string },
): GiveItemToNpcResult {
  const npcState = deps.getNpcState(input.npcId)
  if (!npcState) return { status: 'recipient_missing' }
  if (npcState.health.dead) return { status: 'recipient_dead' }
  const instance = deps.playerInventory.getInstance(input.instanceId)
  if (!instance) return { status: 'source_missing' }
  if (!npcState.personalInventory.canAddInstance(instance)) return { status: 'destination_full' }
  if (!transferInventoryInstance(
    deps.playerInventory,
    npcState.personalInventory,
    input.instanceId,
  )) {
    return { status: 'destination_full' }
  }
  return { status: 'ok' }
}
