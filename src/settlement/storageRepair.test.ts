import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import {
  describeSettlementStorageRepair,
  SETTLEMENT_STORAGE_REPAIR_BEAM_COST,
} from './storageRepair'

describe('describeSettlementStorageRepair (plan quests-progression-006)', () => {
  it('returns null when infestation is not active', () => {
    const inventory = new Inventory({ beam: 5 })
    expect(describeSettlementStorageRepair(false, inventory)).toBeNull()
  })

  it('requires exactly two beams before repair is allowed', () => {
    const without = new Inventory({ beam: SETTLEMENT_STORAGE_REPAIR_BEAM_COST - 1 })
    const withEnough = new Inventory({ beam: SETTLEMENT_STORAGE_REPAIR_BEAM_COST })
    expect(describeSettlementStorageRepair(true, without)?.canRepair).toBe(false)
    expect(describeSettlementStorageRepair(true, withEnough)?.canRepair).toBe(true)
  })
})
