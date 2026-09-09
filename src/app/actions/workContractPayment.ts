import type { Inventory } from '../../items/Inventory'
import type { NpcAuthoritativeState } from '../../settlement/npcState'
import type { WorkContracts } from '../../world/createWorkContracts'
import { transferInventoryCount } from '../../items/inventoryTransfer'
import { isAssignmentPayable } from '../../world/workContract'

const PLAYER_EMPLOYER = 'player'

export type PayWorkContractResult =
  | { status: 'paid', coins: number, npcCoinCount: number }
  | { status: 'not_payable' }
  | { status: 'insufficient_coins' }
  | { status: 'destination_full' }
  | { status: 'worker_missing' }

export type PayWorkContractDeps = {
  workContracts: WorkContracts
  getNpcState: (id: string) => NpcAuthoritativeState | undefined
  playerInventory: Inventory
}

/**
 * Exactly-once employer wage payment (plan npc-016 §16) — re-resolves
 * contract, assignment, employer and live NPC belongings immediately
 * before `transferInventoryCount`. UI must call this rather than debiting
 * inventories itself.
 *
 * @domain npc
 */
export function payWorkContractAssignment(
  deps: PayWorkContractDeps,
  input: { contractId: string, npcId: string, nowDays: number },
): PayWorkContractResult {
  const contract = deps.workContracts.find(input.contractId)
  if (!contract || contract.employer !== PLAYER_EMPLOYER) return { status: 'not_payable' }
  const assignment = contract.assignments.find((entry) => entry.npcId === input.npcId)
  if (!assignment || !isAssignmentPayable(assignment)) return { status: 'not_payable' }
  const due = assignment.rewardCoinsDue
  const npcState = deps.getNpcState(input.npcId)
  if (!npcState) return { status: 'worker_missing' }
  if (!deps.playerInventory.has('coin', due)) return { status: 'insufficient_coins' }
  if (!npcState.personalInventory.canAdd('coin', due)) return { status: 'destination_full' }
  if (!transferInventoryCount(deps.playerInventory, npcState.personalInventory, 'coin', due, input.nowDays)) {
    return { status: 'destination_full' }
  }
  const paid = deps.workContracts.markPaid(input.contractId, input.npcId)
  if (!paid) {
    transferInventoryCount(npcState.personalInventory, deps.playerInventory, 'coin', due, input.nowDays)
    return { status: 'not_payable' }
  }
  return {
    status: 'paid',
    coins: due,
    npcCoinCount: npcState.personalInventory.count('coin'),
  }
}
