import { describe, expect, it } from 'vitest'
import {
  acceptWorkContract,
  beginContractTravel,
  beginContractWork,
  canAcceptContract,
  cancelWorkContract,
  canPostContract,
  completeContractWork,
  contractHasActiveTarget,
  createWorkContractRecord,
  invalidateWorkContract,
  isContractTerminal,
  noticeBoardId,
  postWorkContract,
  releaseWorkContract,
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

function makeAdvertised() {
  return postWorkContract(makeRecord(), 'noticeBoard:home', 2)!
}

describe('createWorkContractRecord', () => {
  it('starts available/not_posted, unassigned', () => {
    const record = makeRecord()
    expect(record.state).toBe('available')
    expect(record.advertisement).toBe('not_posted')
    expect(record.postedBoardId).toBeNull()
    expect(record.postedAt).toBeNull()
    expect(record.target).toEqual({ kind: 'construction', targetId: 'contractTarget:1' })
    expect(record.workerNpcId).toBeNull()
    expect(record.acceptedAt).toBeNull()
    expect(record.workStartedAt).toBeNull()
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

describe('NPC commitment lifecycle (plan npc-015)', () => {
  it('accepts an advertised, unassigned contract', () => {
    const advertised = makeAdvertised()
    expect(canAcceptContract(advertised)).toBe(true)
    const accepted = acceptWorkContract(advertised, 'npc:1', 5)
    expect(accepted!.state).toBe('accepted')
    expect(accepted!.workerNpcId).toBe('npc:1')
    expect(accepted!.acceptedAt).toBe(5)
  })

  it('rejects accepting an already-assigned, not-yet-posted, or terminal contract', () => {
    expect(acceptWorkContract(makeRecord(), 'npc:1', 5)).toBeNull() // not posted
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(canAcceptContract(accepted)).toBe(false)
    expect(acceptWorkContract(accepted, 'npc:2', 6)).toBeNull() // already taken
    const cancelled = cancelWorkContract(makeAdvertised())!
    expect(acceptWorkContract(cancelled, 'npc:1', 5)).toBeNull()
  })

  it('walks accepted → travelling → working → payment_due for the assigned worker only', () => {
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(beginContractTravel(accepted, 'npc:2')).toBeNull() // wrong worker
    const travelling = beginContractTravel(accepted, 'npc:1')!
    expect(travelling.state).toBe('travelling')
    expect(beginContractWork(travelling, 'npc:2', 9)).toBeNull()
    const working = beginContractWork(travelling, 'npc:1', 9)!
    expect(working.state).toBe('working')
    expect(working.workStartedAt).toBe(9)
    expect(completeContractWork(working, 'npc:2')).toBeNull()
    const paymentDue = completeContractWork(working, 'npc:1')!
    expect(paymentDue.state).toBe('payment_due')
  })

  it('rejects skipping a lifecycle step', () => {
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(beginContractWork(accepted, 'npc:1', 9)).toBeNull() // still accepted, not travelling
    expect(completeContractWork(accepted, 'npc:1')).toBeNull()
  })

  it('releases a commitment back to advertised, keeping the posting, only for the assigned worker', () => {
    const working = beginContractWork(beginContractTravel(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!, 'npc:1')!, 'npc:1', 9)!
    expect(releaseWorkContract(working, 'npc:2')).toBeNull()
    const released = releaseWorkContract(working, 'npc:1')!
    expect(released.state).toBe('advertised')
    expect(released.workerNpcId).toBeNull()
    expect(released.acceptedAt).toBeNull()
    expect(released.workStartedAt).toBeNull()
    expect(released.advertisement).toBe('posted')
    expect(released.postedBoardId).toBe('noticeBoard:home')
  })

  it('cannot release an unassigned or terminal contract', () => {
    expect(releaseWorkContract(makeAdvertised(), 'npc:1')).toBeNull()
    const cancelled = cancelWorkContract(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!)!
    expect(releaseWorkContract(cancelled, 'npc:1')).toBeNull()
  })

  it('cancelling or invalidating an assigned contract also clears the worker', () => {
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(cancelWorkContract(accepted)!.workerNpcId).toBeNull()
    expect(invalidateWorkContract(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!)!.workerNpcId).toBeNull()
  })
})
