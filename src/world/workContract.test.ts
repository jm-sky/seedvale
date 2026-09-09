import { describe, expect, it } from 'vitest'
import {
  acceptWorkContract,
  activeWorkAssignmentCount,
  assignmentRewardCoinsDue,
  beginContractTravel,
  beginContractWork,
  canAcceptContract,
  cancelWorkContract,
  canPostContract,
  completeContractWork,
  contractHasActiveTarget,
  createWorkContractRecord,
  expectedCandidateWork,
  expireWorkAssignmentPayment,
  findAssignment,
  frozenAssignmentClaimSum,
  groupRemainingWork,
  hasUnresolvedPaymentClaims,
  invalidateWorkContract,
  isContractDiscoverable,
  isContractTerminal,
  isNpcCommitmentFulfilled,
  isPaymentRequestEligible,
  markWorkAssignmentPaid,
  markWorkAssignmentUncollectable,
  noticeBoardId,
  PAYMENT_REQUEST_INTERVAL_DAYS,
  postWorkContract,
  recordNpcWorkContribution,
  recordWorkAssignmentPaymentRequest,
  releaseWorkContract,
  sameContractTarget,
} from './workContract'

function makeRecord(overrides: {
  requestedWorkShare?: number
  remainingWorkAtCreation?: number
  requestedWorkerCount?: number
} = {}) {
  return createWorkContractRecord({
    id: 'workContract:1',
    employer: 'player',
    target: { kind: 'construction', targetId: 'contractTarget:1' },
    x: 5,
    z: -3,
    rewardCoins: 25,
    requestedWorkShare: overrides.requestedWorkShare ?? 1,
    remainingWorkAtCreation: overrides.remainingWorkAtCreation ?? 6,
    requestedWorkerCount: overrides.requestedWorkerCount,
    now: 1,
  })
}

function makeAdvertised(overrides: Parameters<typeof makeRecord>[0] = {}) {
  return postWorkContract(makeRecord(overrides), 'noticeBoard:home', 2)!
}

describe('createWorkContractRecord', () => {
  it('starts available/not_posted, with no assignments', () => {
    const record = makeRecord()
    expect(record.state).toBe('available')
    expect(record.advertisement).toBe('not_posted')
    expect(record.postedBoardId).toBeNull()
    expect(record.postedAt).toBeNull()
    expect(record.target).toEqual({ kind: 'construction', targetId: 'contractTarget:1' })
    expect(record.requestedWorkerCount).toBe(1)
    expect(record.assignments).toEqual([])
  })

  it('snapshots the work commitment exactly once (plan npc-018 §5)', () => {
    const record = makeRecord({ requestedWorkShare: 0.5, remainingWorkAtCreation: 6 })
    expect(record.requestedWorkShare).toBe(0.5)
    expect(record.remainingWorkAtCreation).toBe(6)
    expect(record.committedWork).toBe(3)
    expect(record.npcWorkCompleted).toBe(0)
  })

  it('clamps requestedWorkShare to [0, 1] and remainingWorkAtCreation to ≥ 0', () => {
    const over = makeRecord({ requestedWorkShare: 1.5, remainingWorkAtCreation: -4 })
    expect(over.requestedWorkShare).toBe(1)
    expect(over.remainingWorkAtCreation).toBe(0)
    expect(over.committedWork).toBe(0)
  })

  it('normalizes requestedWorkerCount to an integer ≥ 1 (plan npc-028 §4)', () => {
    expect(makeRecord({ requestedWorkerCount: 3 }).requestedWorkerCount).toBe(3)
    expect(makeRecord({ requestedWorkerCount: 0 }).requestedWorkerCount).toBe(1)
    expect(makeRecord({ requestedWorkerCount: 2.9 }).requestedWorkerCount).toBe(2)
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
    expect(isContractTerminal('active')).toBe(false)
    expect(isContractTerminal('settling')).toBe(false)
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

describe('NPC assignment lifecycle (plan npc-028)', () => {
  it('accepts an advertised contract by adding an assignment and moving to active', () => {
    const advertised = makeAdvertised()
    expect(canAcceptContract(advertised, 'npc:1')).toBe(true)
    const accepted = acceptWorkContract(advertised, 'npc:1', 5)!
    expect(accepted.state).toBe('active')
    expect(findAssignment(accepted, 'npc:1')).toMatchObject({
      npcId: 'npc:1',
      state: 'accepted',
      acceptedAt: 5,
      workStartedAt: null,
      workCompleted: 0,
    })
  })

  it('rejects accepting a not-yet-posted, terminal, or already-assigned-to-this-NPC contract', () => {
    expect(acceptWorkContract(makeRecord(), 'npc:1', 5)).toBeNull()
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(canAcceptContract(accepted, 'npc:1')).toBe(false)
    expect(acceptWorkContract(accepted, 'npc:1', 6)).toBeNull()
    const cancelled = cancelWorkContract(makeAdvertised())!
    expect(acceptWorkContract(cancelled, 'npc:1', 5)).toBeNull()
  })

  it('walks accepted → travelling → working → settling for the assigned worker only', () => {
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(beginContractTravel(accepted, 'npc:2')).toBeNull()
    const travelling = beginContractTravel(accepted, 'npc:1')!
    expect(findAssignment(travelling, 'npc:1')?.state).toBe('travelling')
    expect(beginContractWork(travelling, 'npc:2', 9)).toBeNull()
    const working = beginContractWork(travelling, 'npc:1', 9)!
    expect(findAssignment(working, 'npc:1')).toMatchObject({ state: 'working', workStartedAt: 9 })
    expect(completeContractWork(working, 'npc:2')).toBeNull()
    const settled = completeContractWork(working, 'npc:1')!
    expect(settled.state).toBe('completed')
    expect(findAssignment(settled, 'npc:1')?.state).toBe('released')
    expect(findAssignment(settled, 'npc:1')?.rewardCoinsDue).toBe(0)
  })

  it('rejects skipping a lifecycle step', () => {
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(beginContractWork(accepted, 'npc:1', 9)).toBeNull()
    expect(completeContractWork(accepted, 'npc:1')).not.toBeNull() // work-active may settle early (target finished while travelling)
  })

  it('releases a work-active assignment, keeping the posting and contribution', () => {
    const working = beginContractWork(
      beginContractTravel(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!, 'npc:1')!,
      'npc:1',
      9,
    )!
    const credited = recordNpcWorkContribution(working, 'npc:1', 2)!
    expect(releaseWorkContract(working, 'npc:2')).toBeNull()
    const released = releaseWorkContract(credited, 'npc:1')!
    expect(released.state).toBe('advertised')
    expect(findAssignment(released, 'npc:1')).toMatchObject({
      state: 'payment_due',
      workCompleted: 2,
      rewardCoinsDue: 8,
    })
    expect(released.npcWorkCompleted).toBe(2)
    expect(released.advertisement).toBe('posted')
    expect(released.postedBoardId).toBe('noticeBoard:home')
    expect(isContractDiscoverable(released)).toBe(true)
  })

  it('cannot release an unassigned or terminal contract', () => {
    expect(releaseWorkContract(makeAdvertised(), 'npc:1')).toBeNull()
    const cancelled = cancelWorkContract(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!)!
    expect(releaseWorkContract(cancelled, 'npc:1')).toBeNull()
  })

  it('cancelling or invalidating an assigned contract releases work-active assignments without dropping history', () => {
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    const cancelled = cancelWorkContract(accepted)!
    expect(findAssignment(cancelled, 'npc:1')?.state).toBe('released')
    const invalidated = invalidateWorkContract(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!)!
    expect(findAssignment(invalidated, 'npc:1')?.state).toBe('released')
  })
})

describe('multiple workers (plan npc-028)', () => {
  it('allows simultaneous assignments up to requestedWorkerCount and rejects a duplicate NPC', () => {
    const advertised = makeAdvertised({ requestedWorkerCount: 3 })
    const a = acceptWorkContract(advertised, 'npc:1', 5)!
    expect(isContractDiscoverable(a)).toBe(true)
    const b = acceptWorkContract(a, 'npc:2', 6)!
    const c = acceptWorkContract(b, 'npc:3', 7)!
    expect(activeWorkAssignmentCount(c)).toBe(3)
    expect(canAcceptContract(c, 'npc:4')).toBe(false)
    expect(acceptWorkContract(c, 'npc:4', 8)).toBeNull()
    expect(acceptWorkContract(c, 'npc:1', 8)).toBeNull()
  })

  it('lets workers progress independently', () => {
    const advertised = makeAdvertised({ requestedWorkerCount: 3 })
    let record = acceptWorkContract(advertised, 'npc:a', 5)!
    record = acceptWorkContract(record, 'npc:b', 6)!
    record = acceptWorkContract(record, 'npc:c', 7)!
    record = beginContractTravel(record, 'npc:a')!
    record = beginContractWork(record, 'npc:a', 8)!
    record = beginContractTravel(record, 'npc:b')!
    expect(findAssignment(record, 'npc:a')?.state).toBe('working')
    expect(findAssignment(record, 'npc:b')?.state).toBe('travelling')
    expect(findAssignment(record, 'npc:c')?.state).toBe('accepted')
    expect(record.state).toBe('active')
  })

  it('does not multiply group commitment by worker count', () => {
    const record = makeRecord({ requestedWorkShare: 0.75, remainingWorkAtCreation: 12, requestedWorkerCount: 3 })
    expect(record.committedWork).toBe(9)
  })

  it('credits per-assignment work into the aggregate without double-counting', () => {
    let record = beginContractWork(
      beginContractTravel(acceptWorkContract(makeAdvertised({ requestedWorkerCount: 2 }), 'npc:1', 5)!, 'npc:1')!,
      'npc:1',
      9,
    )!
    record = acceptWorkContract(record, 'npc:2', 6)!
    record = beginContractTravel(record, 'npc:2')!
    record = beginContractWork(record, 'npc:2', 10)!
    record = recordNpcWorkContribution(record, 'npc:1', 5)!
    record = recordNpcWorkContribution(record, 'npc:2', 3)!
    expect(findAssignment(record, 'npc:1')?.workCompleted).toBe(5)
    expect(findAssignment(record, 'npc:2')?.workCompleted).toBe(3)
    expect(record.npcWorkCompleted).toBe(8)
    expect(groupRemainingWork(record)).toBe(0) // committedWork defaults to 6; 5+3 overshoots
  })

  it('releasing one worker reopens a slot without touching others', () => {
    let record = acceptWorkContract(makeAdvertised({ requestedWorkerCount: 3 }), 'npc:1', 5)!
    record = acceptWorkContract(record, 'npc:2', 6)!
    record = acceptWorkContract(record, 'npc:3', 7)!
    record = beginContractTravel(record, 'npc:1')!
    record = beginContractWork(record, 'npc:1', 8)!
    record = recordNpcWorkContribution(record, 'npc:1', 2)!
    const released = releaseWorkContract(record, 'npc:1')!
    expect(findAssignment(released, 'npc:1')?.state).toBe('payment_due')
    expect(findAssignment(released, 'npc:1')?.workCompleted).toBe(2)
    expect(findAssignment(released, 'npc:1')?.rewardCoinsDue).toBe(8)
    expect(findAssignment(released, 'npc:2')?.state).toBe('accepted')
    expect(findAssignment(released, 'npc:3')?.state).toBe('accepted')
    expect(released.npcWorkCompleted).toBe(2)
    expect(released.state).toBe('active')
    expect(isContractDiscoverable(released)).toBe(true)
    const replacement = acceptWorkContract(released, 'npc:4', 9)!
    expect(findAssignment(replacement, 'npc:4')?.state).toBe('accepted')
    expect(replacement.committedWork).toBe(record.committedWork)
  })

  it('completeContractWork settles every still-work-active assignment', () => {
    let record = acceptWorkContract(makeAdvertised({ requestedWorkerCount: 2 }), 'npc:1', 5)!
    record = acceptWorkContract(record, 'npc:2', 6)!
    record = beginContractTravel(record, 'npc:1')!
    record = beginContractWork(record, 'npc:1', 8)!
    record = beginContractTravel(record, 'npc:2')!
    record = beginContractWork(record, 'npc:2', 9)!
    record = recordNpcWorkContribution(record, 'npc:1', 2)!
    record = recordNpcWorkContribution(record, 'npc:2', 1)!
    const settled = completeContractWork(record, 'npc:1', { now: 12 })!
    expect(settled.state).toBe('settling')
    expect(findAssignment(settled, 'npc:1')?.state).toBe('payment_due')
    expect(findAssignment(settled, 'npc:2')?.state).toBe('payment_due')
    expect(isContractDiscoverable(settled)).toBe(false)
  })

  it('cancellation releases every work-active assignment and keeps contribution', () => {
    let record = beginContractWork(
      beginContractTravel(acceptWorkContract(makeAdvertised({ requestedWorkerCount: 2 }), 'npc:1', 5)!, 'npc:1')!,
      'npc:1',
      8,
    )!
    record = acceptWorkContract(record, 'npc:2', 6)!
    record = recordNpcWorkContribution(record, 'npc:1', 1)!
    const cancelled = cancelWorkContract(record)!
    expect(cancelled.state).toBe('cancelled')
    expect(findAssignment(cancelled, 'npc:1')).toMatchObject({ state: 'payment_due', workCompleted: 1 })
    expect(findAssignment(cancelled, 'npc:2')?.state).toBe('released')
    expect(cancelled.npcWorkCompleted).toBe(1)
  })
})

describe('shared-work commitment accounting (plan npc-018 / npc-028)', () => {
  it('recordNpcWorkContribution adds to assignment and aggregate without mutating the input', () => {
    const working = beginContractWork(
      beginContractTravel(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!, 'npc:1')!,
      'npc:1',
      9,
    )!
    const credited = recordNpcWorkContribution(working, 'npc:1', 2)!
    expect(credited.npcWorkCompleted).toBe(2)
    expect(findAssignment(credited, 'npc:1')?.workCompleted).toBe(2)
    expect(working.npcWorkCompleted).toBe(0)
    expect(recordNpcWorkContribution(credited, 'npc:1', 1.5)!.npcWorkCompleted).toBe(3.5)
  })

  it('recordNpcWorkContribution is a no-op for a non-positive amount', () => {
    const working = beginContractWork(
      beginContractTravel(acceptWorkContract(makeAdvertised(), 'npc:1', 5)!, 'npc:1')!,
      'npc:1',
      9,
    )!
    expect(recordNpcWorkContribution(working, 'npc:1', 0)).toBe(working)
    expect(recordNpcWorkContribution(working, 'npc:1', -1)).toBe(working)
  })

  it('rejects crediting a worker who is not currently working', () => {
    const accepted = acceptWorkContract(makeAdvertised(), 'npc:1', 5)!
    expect(recordNpcWorkContribution(accepted, 'npc:1', 2)).toBeNull()
    expect(recordNpcWorkContribution(accepted, 'npc:2', 2)).toBeNull()
  })

  it('isNpcCommitmentFulfilled compares npcWorkCompleted against committedWork, not the target\'s total work', () => {
    const record = makeRecord({ requestedWorkShare: 0.5, remainingWorkAtCreation: 6 }) // committedWork = 3
    expect(isNpcCommitmentFulfilled(record)).toBe(false)
    const working = beginContractWork(
      beginContractTravel(acceptWorkContract(postWorkContract(record, 'noticeBoard:home', 2)!, 'npc:1', 5)!, 'npc:1')!,
      'npc:1',
      9,
    )!
    expect(isNpcCommitmentFulfilled(recordNpcWorkContribution(working, 'npc:1', 2)!)).toBe(false)
    expect(isNpcCommitmentFulfilled(recordNpcWorkContribution(working, 'npc:1', 3)!)).toBe(true)
    expect(isNpcCommitmentFulfilled(recordNpcWorkContribution(working, 'npc:1', 10)!)).toBe(true)
  })

  it('expectedCandidateWork splits remaining group work across remaining slots', () => {
    const advertised = makeAdvertised({ requestedWorkerCount: 3, remainingWorkAtCreation: 12, requestedWorkShare: 0.75 })
    expect(advertised.committedWork).toBe(9)
    expect(expectedCandidateWork(advertised)).toBe(3)
    const one = acceptWorkContract(advertised, 'npc:1', 5)!
    expect(expectedCandidateWork(one)).toBe(3)
  })

  it('sameContractTarget compares kind + targetId, not object identity', () => {
    expect(sameContractTarget({ kind: 'construction', targetId: 'a' }, { kind: 'construction', targetId: 'a' })).toBe(true)
    expect(sameContractTarget({ kind: 'construction', targetId: 'a' }, { kind: 'construction', targetId: 'b' })).toBe(false)
    expect(sameContractTarget({ kind: 'construction', targetId: 'a' }, { kind: 'terrain_preparation', targetId: 'a' })).toBe(false)
  })
})

function workingWith(npcId: string, work: number, record = makeAdvertised({ requestedWorkerCount: 3 })) {
  let next = acceptWorkContract(record, npcId, 5)!
  next = beginContractTravel(next, npcId)!
  next = beginContractWork(next, npcId, 9)!
  if (work > 0) next = recordNpcWorkContribution(next, npcId, work)!
  return next
}

describe('assignment payment claims (plan npc-016)', () => {
  it('freezes a proportional integer claim from accepted useful work', () => {
    const settled = completeContractWork(workingWith('npc:1', 2), 'npc:1', { now: 10 })!
    const assignment = findAssignment(settled, 'npc:1')!
    expect(assignment.state).toBe('payment_due')
    expect(assignment.rewardCoinsDue).toBe(8) // floor(2 * 25 / 6)
    expect(assignment.paymentDeadline).toBe(11)
    expect(assignment.lastPaymentRequestAt).toBeNull()
    expect(settled.state).toBe('settling')
  })

  it('does not create a positive claim when workCompleted is 0', () => {
    const settled = completeContractWork(workingWith('npc:1', 0), 'npc:1')!
    expect(findAssignment(settled, 'npc:1')).toMatchObject({ state: 'released', rewardCoinsDue: 0 })
    expect(settled.state).toBe('completed')
    expect(hasUnresolvedPaymentClaims(settled)).toBe(false)
  })

  it('never lets frozen claims exceed the contract reward ceiling', () => {
    let record = makeAdvertised({ requestedWorkerCount: 2 })
    record = workingWith('npc:1', 5, record)
    record = acceptWorkContract(record, 'npc:2', 6)!
    record = beginContractTravel(record, 'npc:2')!
    record = beginContractWork(record, 'npc:2', 10)!
    record = recordNpcWorkContribution(record, 'npc:2', 3)!
    const settled = completeContractWork(record, 'npc:1')!
    expect(frozenAssignmentClaimSum(settled)).toBeLessThanOrEqual(settled.rewardCoins)
    expect(assignmentRewardCoinsDue(settled, 5) + assignmentRewardCoinsDue(settled, 3, 20)).toBeLessThanOrEqual(25)
  })

  it('keeps a payment_due claim while another assignment is still working', () => {
    let record = workingWith('npc:1', 2)
    record = acceptWorkContract(record, 'npc:2', 6)!
    record = beginContractTravel(record, 'npc:2')!
    const released = releaseWorkContract(record, 'npc:1', 'abandoned', { now: 11 })!
    expect(released.state).toBe('active')
    expect(findAssignment(released, 'npc:1')?.state).toBe('payment_due')
    expect(findAssignment(released, 'npc:2')?.state).toBe('travelling')
    expect(activeWorkAssignmentCount(released)).toBe(1)
    expect(isContractDiscoverable(released)).toBe(true)
  })

  it('marks a dead worker uncollectable without creating a payable claim for the player', () => {
    const dead = releaseWorkContract(workingWith('npc:1', 2), 'npc:1', 'death', { now: 10 })!
    expect(findAssignment(dead, 'npc:1')).toMatchObject({
      state: 'uncollectable',
      workCompleted: 2,
      rewardCoinsDue: 8,
    })
    expect(hasUnresolvedPaymentClaims(dead)).toBe(false)
    expect(dead.state).toBe('advertised')
  })

  it('completes the contract only after every positive claim is terminal', () => {
    const settled = completeContractWork(workingWith('npc:1', 2), 'npc:1', { now: 10 })!
    expect(settled.state).toBe('settling')
    expect(markWorkAssignmentPaid(settled, 'npc:1')?.state).toBe('completed')
  })

  it('expires a payable claim to unpaid after the frozen deadline', () => {
    const settled = completeContractWork(workingWith('npc:1', 2), 'npc:1', { now: 10 })!
    expect(expireWorkAssignmentPayment(settled, 'npc:1', 10.9)).toEqual(settled)
    const unpaid = expireWorkAssignmentPayment(settled, 'npc:1', 11)!
    expect(findAssignment(unpaid, 'npc:1')?.state).toBe('unpaid')
    expect(unpaid.state).toBe('completed')
    expect(markWorkAssignmentPaid(unpaid, 'npc:1')).toBeNull()
  })

  it('does not re-pay a claim that is already paid or uncollectable', () => {
    const settled = completeContractWork(workingWith('npc:1', 2), 'npc:1', { now: 10 })!
    const paid = markWorkAssignmentPaid(settled, 'npc:1')!
    expect(markWorkAssignmentPaid(paid, 'npc:1')).toBeNull()
    expect(markWorkAssignmentUncollectable(paid, 'npc:1')).toBeNull()
  })

  it('throttles payment requests per assignment', () => {
    const settled = completeContractWork(workingWith('npc:1', 2), 'npc:1', { now: 10 })!
    const assignment = findAssignment(settled, 'npc:1')!
    expect(isPaymentRequestEligible(assignment, 10)).toBe(true)
    const requested = recordWorkAssignmentPaymentRequest(settled, 'npc:1', 10)!
    const after = findAssignment(requested, 'npc:1')!
    expect(isPaymentRequestEligible(after, 10 + PAYMENT_REQUEST_INTERVAL_DAYS - 0.001)).toBe(false)
    expect(isPaymentRequestEligible(after, 10 + PAYMENT_REQUEST_INTERVAL_DAYS)).toBe(true)
  })
})
