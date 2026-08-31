import { describe, expect, it } from 'vitest'
import {
  blockPlan,
  completePlan,
  createNpcPlan,
  goalForNeed,
  interruptPlan,
  isPlanTerminal,
  needForGoal,
  obsoletePlan,
  planIsResumable,
  progressPlan,
  resumePlan,
  setPlanStrategy,
} from './npcPlan'

describe('goalForNeed / needForGoal', () => {
  it('maps every plan-tracked need to a Goal and back', () => {
    expect(goalForNeed('food')).toBe('secureFood')
    expect(goalForNeed('water')).toBe('secureWater')
    expect(goalForNeed('waterDuty')).toBe('fulfilWorkDuty')
    expect(goalForNeed('wood')).toBe('obtainWood')
    expect(goalForNeed('idle')).toBeNull()
    expect(needForGoal('secureFood')).toBe('food')
    expect(needForGoal('secureWater')).toBe('water')
    expect(needForGoal('fulfilWorkDuty')).toBe('waterDuty')
    expect(needForGoal('obtainWood')).toBe('wood')
  })
})

describe('createNpcPlan', () => {
  it('starts active, with no strategy and zero progress — no action list/history', () => {
    const plan = createNpcPlan('obtainWood')
    expect(plan).toEqual({
      goal: 'obtainWood',
      strategy: null,
      state: 'active',
      progress: { amount: 0 },
      currentStep: 'findNextTarget',
    })
  })
})

describe('active → interrupted → active', () => {
  it('interrupting preserves goal/strategy/progress, then resumes', () => {
    let plan = createNpcPlan('secureFood')
    plan = setPlanStrategy(plan, 'hunt')
    plan = progressPlan(plan, 1)

    const interrupted = interruptPlan(plan)
    expect(interrupted.state).toBe('interrupted')
    expect(interrupted.goal).toBe('secureFood')
    expect(interrupted.strategy).toBe('hunt')
    expect(interrupted.progress.amount).toBe(1)

    const resumed = resumePlan(interrupted)
    // Real progress already happened this pursuit — resumes into
    // `partially_completed`, not a fresh `active`.
    expect(resumed.state).toBe('partially_completed')
    expect(resumed.progress.amount).toBe(1)
  })

  it('resumes a no-progress plan straight back to active', () => {
    const plan = createNpcPlan('secureWater')
    const resumed = resumePlan(interruptPlan(plan))
    expect(resumed.state).toBe('active')
  })
})

describe('partial progress', () => {
  it('accumulates without resetting on repeated calls, never a history list', () => {
    let plan = createNpcPlan('obtainWood')
    plan = progressPlan(plan, 8)
    plan = progressPlan(plan, 12)
    expect(plan.progress).toEqual({ amount: 20 })
    expect(plan.state).toBe('partially_completed')
    expect(Object.keys(plan)).not.toContain('history')
    expect(Object.keys(plan)).not.toContain('actions')
  })

  it('ignores a non-positive amount', () => {
    const plan = createNpcPlan('obtainWood')
    expect(progressPlan(plan, 0)).toBe(plan)
    expect(progressPlan(plan, -5)).toBe(plan)
  })
})

describe('goal completion', () => {
  it('marks completed regardless of accumulated progress', () => {
    const plan = progressPlan(createNpcPlan('secureFood'), 3)
    const completed = completePlan(plan)
    expect(completed.state).toBe('completed')
    expect(isPlanTerminal(completed)).toBe(true)
  })

  it('is a no-op once already terminal', () => {
    const obsolete = obsoletePlan(createNpcPlan('secureFood'))
    expect(progressPlan(obsolete, 5)).toBe(obsolete)
    expect(interruptPlan(obsolete)).toBe(obsolete)
    expect(resumePlan(obsolete)).toBe(obsolete)
    expect(blockPlan(obsolete)).toBe(obsolete)
  })
})

describe('obsolete goal', () => {
  it('is terminal and no longer resumable', () => {
    const plan = obsoletePlan(createNpcPlan('obtainWood'))
    expect(plan.state).toBe('obsolete')
    expect(planIsResumable(plan, 'obtainWood')).toBe(false)
  })
})

describe('blocked strategy', () => {
  it('marks blocked without discarding the goal, and can be resumed', () => {
    const plan = createNpcPlan('obtainWood')
    const blocked = blockPlan(plan)
    expect(blocked.state).toBe('blocked')
    expect(blocked.goal).toBe('obtainWood')
    expect(planIsResumable(blocked, 'obtainWood')).toBe(true)
    expect(resumePlan(blocked).state).toBe('active')
  })
})

describe('currentStep persistence', () => {
  it('keeps currentStep across interruption/resume unless a new strategy sets it', () => {
    let plan = createNpcPlan('secureFood', 'travelToSource')
    plan = interruptPlan(plan)
    plan = resumePlan(plan)
    expect(plan.currentStep).toBe('travelToSource')

    const withStrategy = setPlanStrategy(plan, 'hunt')
    expect(withStrategy.currentStep).toBe('hunt')
  })
})

describe('planIsResumable', () => {
  it('is false for a different goal, null plan, or a terminal plan', () => {
    const plan = createNpcPlan('secureFood')
    expect(planIsResumable(null, 'secureFood')).toBe(false)
    expect(planIsResumable(plan, 'obtainWood')).toBe(false)
    expect(planIsResumable(completePlan(plan), 'secureFood')).toBe(false)
    expect(planIsResumable(plan, 'secureFood')).toBe(true)
  })
})
