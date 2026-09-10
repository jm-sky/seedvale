import type { Inventory } from '../items/Inventory'
import { ITEM_DEFS } from '../items/items'

/** Closed V1 repair cost (plan quests-progression-006 §4). */
export const SETTLEMENT_STORAGE_REPAIR_BEAM_COST = 2

/** Wall-clock busy duration for the one-shot storage repair action. */
export const SETTLEMENT_STORAGE_REPAIR_DURATION_SEC = 5

export type SettlementStorageRepairView = {
  title: string
  description: string
  canRepair: boolean
  reasonLabel: string
}

/** Read-only repair panel copy for settlement storage (plan
 *  quests-progression-006 §4). */
export function describeSettlementStorageRepair(
  storageDamaged: boolean,
  inventory: Inventory,
): SettlementStorageRepairView | null {
  if (!storageDamaged) return null
  const have = inventory.count('beam')
  const canRepair = inventory.has('beam', SETTLEMENT_STORAGE_REPAIR_BEAM_COST)
  const missing = SETTLEMENT_STORAGE_REPAIR_BEAM_COST - have
  return {
    title: 'Naprawa magazynu',
    description: [
      'W ścianie magazynu widać rozszarpane deski i dziury — stamtąd wchodzą szczury.',
      `Potrzebujesz ${SETTLEMENT_STORAGE_REPAIR_BEAM_COST}× ${ITEM_DEFS.beam.label}, żeby to zabezpieczyć.`,
    ].join('\n\n'),
    canRepair,
    reasonLabel: canRepair
      ? ''
      : `Brakuje ${missing}× ${ITEM_DEFS.beam.label}`,
  }
}

export function formatSettlementStorageInspection(
  stockLines: string,
  storageDamaged: boolean,
): string {
  if (!storageDamaged) return stockLines
  return [
    stockLines,
    '',
    'W ścianie magazynu widać rozszarpane deski i szczeliny — wygląda na to, że stamtąd wchodzą szczury.',
  ].join('\n')
}
