import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createWorkContracts } from './createWorkContracts'
import { postWorkContract, type WorkContractRecord } from './workContract'

const sampleHeight = (): number => 0

describe('createWorkContracts', () => {
  it('creates a new available/not_posted contract with a stable id and target', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 5, -3, 25, 1)
    expect(record.state).toBe('available')
    expect(record.advertisement).toBe('not_posted')
    expect(record.x).toBe(5)
    expect(record.z).toBe(-3)
    expect(record.rewardCoins).toBe(25)
    expect(contracts.nodes()).toEqual([record])
    expect(contracts.find(record.id)).toEqual(record)
  })

  it('posts an available contract at a board, transitioning it to advertised', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    const posted = contracts.post(record.id, 'noticeBoard:home', 2)
    expect(posted?.state).toBe('advertised')
    expect(posted?.advertisement).toBe('posted')
    expect(posted?.postedBoardId).toBe('noticeBoard:home')
    expect(contracts.postedAt('noticeBoard:home')).toEqual([posted])
  })

  it('rejects posting the same contract twice (no duplicate publication)', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    expect(contracts.post(record.id, 'noticeBoard:home', 2)).not.toBeNull()
    expect(contracts.post(record.id, 'noticeBoard:home', 3)).toBeNull()
    expect(contracts.postedAt('noticeBoard:home')).toHaveLength(1)
  })

  it('post/cancel/invalidateTarget on an unknown id are no-ops', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    expect(contracts.post('nope', 'noticeBoard:home', 1)).toBeNull()
    expect(contracts.cancel('nope')).toBe(false)
    expect(contracts.invalidateTarget('nope')).toBe(false)
  })

  it('cancel removes an available contract from the postable set and clears any prior posting', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    contracts.post(record.id, 'noticeBoard:home', 2)
    expect(contracts.cancel(record.id)).toBe(true)
    expect(contracts.find(record.id)?.state).toBe('cancelled')
    expect(contracts.postedAt('noticeBoard:home')).toEqual([])
    // A cancelled contract can never be posted again.
    expect(contracts.post(record.id, 'noticeBoard:home', 3)).toBeNull()
  })

  it('invalidateTarget removes a posted contract from the board query', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    contracts.post(record.id, 'noticeBoard:home', 2)
    expect(contracts.invalidateTarget(record.id)).toBe(true)
    expect(contracts.find(record.id)?.state).toBe('invalidated')
    expect(contracts.postedAt('noticeBoard:home')).toEqual([])
  })

  it('cancel/invalidateTarget on an already-terminal contract are no-ops', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    contracts.cancel(record.id)
    expect(contracts.cancel(record.id)).toBe(false)
    expect(contracts.invalidateTarget(record.id)).toBe(false)
  })

  it('restores contracts from `initial` on construction, preserving lifecycle/publication', () => {
    const seedRecords: WorkContractRecord[] = []
    const contractsA = createWorkContracts(new Scene(), sampleHeight)
    const created = contractsA.create('player', 1, 2, 15, 1)
    const posted = postWorkContract(created, 'noticeBoard:home', 2)!
    seedRecords.push(posted)

    const contractsB = createWorkContracts(new Scene(), sampleHeight, seedRecords)
    expect(contractsB.nodes()).toEqual(seedRecords)
    expect(contractsB.postedAt('noticeBoard:home')).toEqual(seedRecords)
  })

  it('dispose clears every record and its runtime flag', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    contracts.create('player', 0, 0, 10, 1)
    contracts.dispose()
    expect(contracts.nodes()).toEqual([])
  })

  it('create accepts an explicit targetId (plan npc-015 — the real buildable object placed alongside it)', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1, 'well:123')
    expect(record.target).toEqual({ kind: 'construction', targetId: 'well:123' })
  })
})

describe('createWorkContracts NPC commitment lifecycle (plan npc-015)', () => {
  it('discoverableAt only returns still-open (advertised) contracts at that board', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    expect(contracts.discoverableAt('noticeBoard:home')).toEqual([])
    contracts.post(record.id, 'noticeBoard:home', 2)
    expect(contracts.discoverableAt('noticeBoard:home')).toEqual([contracts.find(record.id)])
    contracts.accept(record.id, 'npc:1', 3)
    // Accepted — still posted, but no longer offered to anyone else.
    expect(contracts.discoverableAt('noticeBoard:home')).toEqual([])
    expect(contracts.postedAt('noticeBoard:home')).toEqual([contracts.find(record.id)])
  })

  it('accept/beginTravel/beginWork/completeWork drive one contract end to end', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    contracts.post(record.id, 'noticeBoard:home', 2)
    expect(contracts.accept(record.id, 'npc:1', 3)?.state).toBe('accepted')
    expect(contracts.findByWorker('npc:1')?.id).toBe(record.id)
    expect(contracts.beginTravel(record.id, 'npc:1')?.state).toBe('travelling')
    expect(contracts.beginWork(record.id, 'npc:1', 9)?.state).toBe('working')
    expect(contracts.completeWork(record.id, 'npc:1')?.state).toBe('payment_due')
    // payment_due is still findable by worker (npc-016's own lookup) — just
    // no longer something NpcAgent actively pursues.
    expect(contracts.findByWorker('npc:1')?.state).toBe('payment_due')
  })

  it('accept rejects a second worker once one is already assigned', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    contracts.post(record.id, 'noticeBoard:home', 2)
    contracts.accept(record.id, 'npc:1', 3)
    expect(contracts.accept(record.id, 'npc:2', 4)).toBeNull()
  })

  it('release returns the contract to advertised and findByWorker stops returning it', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    const record = contracts.create('player', 0, 0, 10, 1)
    contracts.post(record.id, 'noticeBoard:home', 2)
    contracts.accept(record.id, 'npc:1', 3)
    expect(contracts.release(record.id, 'npc:1')).toBe(true)
    expect(contracts.findByWorker('npc:1')).toBeUndefined()
    expect(contracts.discoverableAt('noticeBoard:home')).toEqual([contracts.find(record.id)])
  })

  it('accept/beginTravel/beginWork/completeWork/release on an unknown id are no-ops', () => {
    const contracts = createWorkContracts(new Scene(), sampleHeight)
    expect(contracts.accept('nope', 'npc:1', 1)).toBeNull()
    expect(contracts.beginTravel('nope', 'npc:1')).toBeNull()
    expect(contracts.beginWork('nope', 'npc:1', 1)).toBeNull()
    expect(contracts.completeWork('nope', 'npc:1')).toBeNull()
    expect(contracts.release('nope', 'npc:1')).toBe(false)
  })
})
