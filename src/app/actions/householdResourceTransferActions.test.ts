import { describe, expect, it, vi } from 'vitest'

vi.mock('../../input/MouseLook', () => ({ exitGamePointerLock: vi.fn() }))
import { createSettlementEconomy } from '../../economy/settlementEconomy'
import { Inventory } from '../../items/Inventory'
import { createHousehold, householdIdFor } from '../../settlement/household'
import type { PlayerActionContext } from './actionContext'
import { createHouseholdResourceTransferActions } from './householdResourceTransferActions'

function makeCtx(inventory: Inventory, economy = createSettlementEconomy('s', {}, [])) {
  const household = createHousehold(householdIdFor('s', 0), 's', 's:home:0')
  const vueUi = {
    configureHouseholdTransferScreen: vi.fn(),
    openHouseholdTransferScreen: vi.fn(),
    refreshHouseholdTransferScreen: vi.fn(),
  }
  const ctx = {
    bundle: {
      settlementsManager: {
        getEconomy: (id: string) => (id === 's' ? economy : undefined),
      },
    },
    inventory,
    hud: { setInventoryWeight: vi.fn() },
    toast: { show: vi.fn() },
    busy: { isActive: () => false },
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
    dayNight: { elapsedDays: 0 },
    onInventoryChanged: vi.fn(),
  } as unknown as PlayerActionContext
  const actions = createHouseholdResourceTransferActions(ctx, {
    vueUi: vueUi as never,
    rendererElement: {} as HTMLElement,
  })
  return { actions, household, inventory, vueUi, ctx, toast: ctx.toast, economy }
}

describe('createHouseholdResourceTransferActions', () => {
  it('opens the transfer screen against the live household and economy', () => {
    const inventory = new Inventory({ carrot: 2 })
    const { actions, household, vueUi } = makeCtx(inventory)
    actions.openHouseholdResourceTransfer(household)
    expect(vueUi.openHouseholdTransferScreen).toHaveBeenCalled()
    const groups = vueUi.openHouseholdTransferScreen.mock.calls[0]![3] as { kind: string }[]
    expect(groups.some((g) => g.kind === 'carrot')).toBe(true)
  })

  it('does not open when settlement economy is missing', () => {
    const inventory = new Inventory({ carrot: 1 })
    const household = createHousehold(householdIdFor('missing', 0), 'missing', 'missing:home:0')
    const vueUi = {
      configureHouseholdTransferScreen: vi.fn(),
      openHouseholdTransferScreen: vi.fn(),
      refreshHouseholdTransferScreen: vi.fn(),
    }
    const toast = { show: vi.fn() }
    const ctx = {
      bundle: { settlementsManager: { getEconomy: () => undefined } },
      inventory,
      hud: { setInventoryWeight: vi.fn() },
      toast,
      busy: { isActive: () => false },
      timeSkip: { isActive: () => false },
      restCamp: { isActive: () => false },
      dayNight: { elapsedDays: 0 },
      onInventoryChanged: vi.fn(),
    } as unknown as PlayerActionContext
    const actions = createHouseholdResourceTransferActions(ctx, {
      vueUi: vueUi as never,
      rendererElement: {} as HTMLElement,
    })
    actions.openHouseholdResourceTransfer(household)
    expect(vueUi.openHouseholdTransferScreen).not.toHaveBeenCalled()
    expect(toast.show).toHaveBeenCalled()
  })
})
