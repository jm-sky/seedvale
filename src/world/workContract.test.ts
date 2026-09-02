import { describe, expect, it } from 'vitest'
import {
  cancelWorkContract,
  canPostContract,
  contractHasActiveTarget,
  createWorkContractRecord,
  invalidateWorkContract,
  isContractTerminal,
  noticeBoardId,
  postWorkContract,
} from './workContract'

function makeRecord() {
  return createWorkContractRecord({
    id: 'workContract:1',
    employer: 'player',
    targetId: 'contractTarget:1',
    x: 5,
    z: -3,
    rewardCoins: 25,
    now: 1,
  })
}

describe('createWorkContractRecord', () => {
  it('starts available/not_posted, unassigned', () => {
    const record = makeRecord()
    expect(record.state).toBe('available')
    expect(record.advertisement).toBe('not_posted')
    expect(record.postedBoardId).toBeNull()
    expect(record.postedAt).toBeNull()
    expect(record.target).toEqual({ kind: 'construction', targetId: 'contractTarget:1' })
  })
})

describe('canPostContract / postWorkContract', () => {
  it('posts an available/not_posted contract', () => {
    const record = makeRecord()
    expect(canPostContract(record)).toBe(true)
    const posted = postWorkContract(record, 'noticeBoard:home', 2)
    expect(posted).not.toBeNull()
    expect(posted!.state).toBe('advertised')
    expect(posted!.advertisement).toBe('posted')
    expect(posted!.postedBoardId).toBe('noticeBoard:home')
    expect(posted!.postedAt).toBe(2)
  })

  it('rejects posting an already-advertised contract (no duplicate publication)', () => {
    const record = makeRecord()
    const posted = postWorkContract(record, 'noticeBoard:home', 2)!
    expect(canPostContract(posted)).toBe(false)
    expect(postWorkContract(posted, 'noticeBoard:other', 3)).toBeNull()
  })

  it('rejects posting a cancelled or invalidated contract', () => {
    const cancelled = cancelWorkContract(makeRecord())!
    expect(postWorkContract(cancelled, 'noticeBoard:home', 2)).toBeNull()
    const invalidated = invalidateWorkContract(makeRecord())!
    expect(postWorkContract(invalidated, 'noticeBoard:home', 2)).toBeNull()
  })

  it('never mutates the input record', () => {
    const record = makeRecord()
    postWorkContract(record, 'noticeBoard:home', 2)
    expect(record.state).toBe('available')
    expect(record.advertisement).toBe('not_posted')
  })
})

describe('cancelWorkContract', () => {
  it('cancels an available contract and clears publication fields', () => {
    const cancelled = cancelWorkContract(makeRecord())
    expect(cancelled!.state).toBe('cancelled')
    expect(cancelled!.advertisement).toBe('not_posted')
    expect(cancelled!.postedBoardId).toBeNull()
  })

  it('cancels an already-posted contract, removing its advertisement', () => {
    const posted = postWorkContract(makeRecord(), 'noticeBoard:home', 2)!
    const cancelled = cancelWorkContract(posted)
    expect(cancelled!.state).toBe('cancelled')
    expect(cancelled!.advertisement).toBe('not_posted')
    expect(cancelled!.postedBoardId).toBeNull()
  })

  it('is a no-op on an already-terminal contract', () => {
    const cancelled = cancelWorkContract(makeRecord())!
    expect(cancelWorkContract(cancelled)).toBeNull()
  })
})

describe('invalidateWorkContract', () => {
  it('invalidates a posted contract, clearing its advertisement', () => {
    const posted = postWorkContract(makeRecord(), 'noticeBoard:home', 2)!
    const invalidated = invalidateWorkContract(posted)
    expect(invalidated!.state).toBe('invalidated')
    expect(invalidated!.advertisement).toBe('not_posted')
    expect(invalidated!.postedBoardId).toBeNull()
  })

  it('is a no-op on an already-terminal contract', () => {
    const invalidated = invalidateWorkContract(makeRecord())!
    expect(invalidateWorkContract(invalidated)).toBeNull()
  })
})

describe('isContractTerminal / contractHasActiveTarget', () => {
  it('treats completed/cancelled/invalidated as terminal, everything else as active', () => {
    expect(isContractTerminal('completed')).toBe(true)
    expect(isContractTerminal('cancelled')).toBe(true)
    expect(isContractTerminal('invalidated')).toBe(true)
    expect(isContractTerminal('available')).toBe(false)
    expect(isContractTerminal('advertised')).toBe(false)
  })

  it('contractHasActiveTarget mirrors the terminal check', () => {
    const record = makeRecord()
    expect(contractHasActiveTarget(record)).toBe(true)
    expect(contractHasActiveTarget(cancelWorkContract(record)!)).toBe(false)
  })
})

describe('noticeBoardId', () => {
  it('derives a stable id from the settlement id', () => {
    expect(noticeBoardId('home')).toBe('noticeBoard:home')
    expect(noticeBoardId('home')).toBe(noticeBoardId('home'))
  })
})
