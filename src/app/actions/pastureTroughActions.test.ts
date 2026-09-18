import { describe, expect, it, vi } from 'vitest'
import type { PlayerActionContext } from './actionContext'
import { createHousehold, householdIdFor } from '../../settlement/household'
import { createPastureTroughActions } from './pastureTroughActions'

function fakeBusy() {
  let onComplete: (() => void) | null = null
  return {
    isActive: () => onComplete !== null,
    start: (_duration: number, _label: string, cb: () => void) => {
      if (onComplete) return
      onComplete = cb
    },
    complete: () => {
      const cb = onComplete
      onComplete = null
      cb?.()
    },
    cancel: () => {
      onComplete = null
    },
  }
}

function makeCtx(settlements: { id: string, resolvePastureWaterUse: () => unknown }[]) {
  const toast = { show: vi.fn() }
  const busy = fakeBusy()
  const ctx = {
    bundle: { settlementsManager: { getLoaded: () => settlements } },
    toast,
    busy,
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
  } as unknown as PlayerActionContext
  return { ctx, toast, busy }
}

describe('createPastureTroughActions (plan settlements-npcs-046)', () => {
  it('does not mutate the household reserve on start, only on completion', () => {
    const household = createHousehold(householdIdFor('s', 0), 's', 's:home:0')
    household.water.remove(household.water.current)
    household.water.add(3)
    const settlement = {
      id: 's',
      resolvePastureWaterUse: () => ({
        troughPosition: { x: 0, z: 0 },
        wellPosition: { x: 1, z: 0 },
        household,
      }),
    }
    const { ctx, busy } = makeCtx([settlement])
    const actions = createPastureTroughActions(ctx)

    actions.fillPastureTrough('s')
    expect(household.water.current).toBe(3)

    busy.complete()
    expect(household.water.current).toBe(household.water.capacity)
  })

  it('cancellation grants no water', () => {
    const household = createHousehold(householdIdFor('s', 0), 's', 's:home:0')
    household.water.remove(household.water.current)
    household.water.add(3)
    const settlement = {
      id: 's',
      resolvePastureWaterUse: () => ({ troughPosition: { x: 0, z: 0 }, wellPosition: { x: 1, z: 0 }, household }),
    }
    const { ctx, busy } = makeCtx([settlement])
    const actions = createPastureTroughActions(ctx)

    actions.fillPastureTrough('s')
    busy.cancel()
    expect(household.water.current).toBe(3)
  })

  it('does not start when the reserve is already full', () => {
    const household = createHousehold(householdIdFor('s', 0), 's', 's:home:0')
    household.water.fillToCapacity()
    const settlement = {
      id: 's',
      resolvePastureWaterUse: () => ({ troughPosition: { x: 0, z: 0 }, wellPosition: { x: 1, z: 0 }, household }),
    }
    const { ctx, busy, toast } = makeCtx([settlement])
    const actions = createPastureTroughActions(ctx)

    actions.fillPastureTrough('s')
    expect(busy.isActive()).toBe(false)
    expect(toast.show).toHaveBeenCalled()
  })

  it('grants no water when the settlement/pasture binding disappears before completion', () => {
    const household = createHousehold(householdIdFor('s', 0), 's', 's:home:0')
    household.water.remove(household.water.current)
    household.water.add(3)
    let streamedOut = false
    const settlement = {
      id: 's',
      resolvePastureWaterUse: () => (streamedOut ? null : { troughPosition: { x: 0, z: 0 }, wellPosition: { x: 1, z: 0 }, household }),
    }
    const { ctx, busy } = makeCtx([settlement])
    const actions = createPastureTroughActions(ctx)

    actions.fillPastureTrough('s')
    streamedOut = true
    busy.complete()
    expect(household.water.current).toBe(3)
  })

  it('grants no water when the reserve filled up from elsewhere while the action was running', () => {
    const household = createHousehold(householdIdFor('s', 0), 's', 's:home:0')
    household.water.remove(household.water.current)
    household.water.add(3)
    const settlement = {
      id: 's',
      resolvePastureWaterUse: () => ({ troughPosition: { x: 0, z: 0 }, wellPosition: { x: 1, z: 0 }, household }),
    }
    const { ctx, busy } = makeCtx([settlement])
    const actions = createPastureTroughActions(ctx)

    actions.fillPastureTrough('s')
    household.water.fillToCapacity()
    const before = household.water.current
    busy.complete()
    expect(household.water.current).toBe(before)
  })

  it('does nothing for an unknown settlement id', () => {
    const { ctx, busy } = makeCtx([])
    const actions = createPastureTroughActions(ctx)
    actions.fillPastureTrough('missing')
    expect(busy.isActive()).toBe(false)
  })
})
