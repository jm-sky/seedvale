import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { Inventory } from '../../items/Inventory'
import { createNpcAuthoritativeState } from '../../settlement/npcState'
import { createWorkContracts } from '../../world/createWorkContracts'
import { payWorkContractAssignment } from './workContractPayment'

const sampleHeight = (): number => 0

function settlePayable(contracts: ReturnType<typeof createWorkContracts>, npcId = 'npc:1') {
  const record = contracts.create({
    employer: 'player',
    target: { kind: 'construction', targetId: 'well:1' },
    x: 0,
    z: 0,
    rewardCoins: 25,
    requestedWorkShare: 1,
    remainingWorkAtCreation: 6,
    now: 1,
  })!
  contracts.post(record.id, 'noticeBoard:home', 2)
  contracts.accept(record.id, npcId, 3)
  contracts.beginTravel(record.id, npcId)
  contracts.beginWork(record.id, npcId, 9)
  contracts.creditNpcWork(record.id, npcId, 2)
  contracts.completeWork(record.id, npcId, { now: 10 })
  return record.id
}

describe('payWorkContractAssignment', () => {
  it('transfers player coins into the worker personalInventory and marks the claim paid', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const contractId = settlePayable(contracts)
    const playerInventory = new Inventory({ coin: 20 })
    const npcState = createNpcAuthoritativeState('npc:1', 0)
    const result = payWorkContractAssignment(
      { workContracts: contracts, getNpcState: () => npcState, playerInventory },
      { contractId, npcId: 'npc:1', nowDays: 11 },
    )
    expect(result).toEqual({ status: 'paid', coins: 8, npcCoinCount: 8 })
    expect(playerInventory.count('coin')).toBe(12)
    expect(npcState.personalInventory.count('coin')).toBe(8)
    expect(contracts.find(contractId)?.assignments[0]?.state).toBe('paid')
    expect(contracts.find(contractId)?.state).toBe('completed')
  })

  it('leaves both inventories and the claim unchanged when the player is short', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const contractId = settlePayable(contracts)
    const playerInventory = new Inventory({ coin: 3 })
    const npcState = createNpcAuthoritativeState('npc:1', 0)
    const result = payWorkContractAssignment(
      { workContracts: contracts, getNpcState: () => npcState, playerInventory },
      { contractId, npcId: 'npc:1', nowDays: 11 },
    )
    expect(result).toEqual({ status: 'insufficient_coins' })
    expect(playerInventory.count('coin')).toBe(3)
    expect(npcState.personalInventory.count('coin')).toBe(0)
    expect(contracts.find(contractId)?.assignments[0]?.state).toBe('payment_due')
  })

  it('leaves both inventories and the claim unchanged when the destination cannot accept coins', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const contractId = settlePayable(contracts)
    const playerInventory = new Inventory({ coin: 20 })
    const npcState = createNpcAuthoritativeState('npc:1', 0)
    npcState.personalInventory.setBaseMaxWeight(0.0005)
    const result = payWorkContractAssignment(
      { workContracts: contracts, getNpcState: () => npcState, playerInventory },
      { contractId, npcId: 'npc:1', nowDays: 11 },
    )
    expect(result).toEqual({ status: 'destination_full' })
    expect(playerInventory.count('coin')).toBe(20)
    expect(npcState.personalInventory.count('coin')).toBe(0)
    expect(contracts.find(contractId)?.assignments[0]?.state).toBe('payment_due')
  })

  it('is idempotent on a repeated or stale Pay', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const contractId = settlePayable(contracts)
    const playerInventory = new Inventory({ coin: 20 })
    const npcState = createNpcAuthoritativeState('npc:1', 0)
    const deps = { workContracts: contracts, getNpcState: () => npcState, playerInventory }
    expect(payWorkContractAssignment(deps, { contractId, npcId: 'npc:1', nowDays: 11 }).status).toBe('paid')
    expect(payWorkContractAssignment(deps, { contractId, npcId: 'npc:1', nowDays: 11 })).toEqual({ status: 'not_payable' })
    expect(playerInventory.count('coin')).toBe(12)
    expect(npcState.personalInventory.count('coin')).toBe(8)
  })

  it('rejects a non-player employer', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create({
      employer: 'npc:boss',
      target: { kind: 'construction', targetId: 'well:2' },
      x: 1,
      z: 1,
      rewardCoins: 25,
      requestedWorkShare: 1,
      remainingWorkAtCreation: 6,
      now: 1,
    })!
    contracts.post(record.id, 'noticeBoard:home', 2)
    contracts.accept(record.id, 'npc:1', 3)
    contracts.beginTravel(record.id, 'npc:1')
    contracts.beginWork(record.id, 'npc:1', 9)
    contracts.creditNpcWork(record.id, 'npc:1', 2)
    contracts.completeWork(record.id, 'npc:1', { now: 10 })
    const playerInventory = new Inventory({ coin: 20 })
    const npcState = createNpcAuthoritativeState('npc:1', 0)
    expect(payWorkContractAssignment(
      { workContracts: contracts, getNpcState: () => npcState, playerInventory },
      { contractId: record.id, npcId: 'npc:1', nowDays: 11 },
    )).toEqual({ status: 'not_payable' })
    expect(playerInventory.count('coin')).toBe(20)
  })

  it('reports worker_missing when live NPC state cannot be resolved', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const contractId = settlePayable(contracts)
    const playerInventory = new Inventory({ coin: 20 })
    expect(payWorkContractAssignment(
      { workContracts: contracts, getNpcState: () => undefined, playerInventory },
      { contractId, npcId: 'npc:1', nowDays: 11 },
    )).toEqual({ status: 'worker_missing' })
    expect(playerInventory.count('coin')).toBe(20)
    expect(contracts.find(contractId)?.assignments[0]?.state).toBe('payment_due')
  })
})
