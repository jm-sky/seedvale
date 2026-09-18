import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NpcAgent } from '../ai/NpcAgent'
import type { Settlement } from '../settlement/createSettlement'
import { HUNT_RESUPPLY_ARROW_TARGET } from '../ai/NpcAgent'
import { type NpcTradeCounterparty, resolveNpcTradeOffers, type TradeReserveNpc } from '../ai/npcTradeAvailability'
import { npcDialogueCanTrade } from '../app/inventoryWiring'
import { Inventory } from '../items/Inventory'
import { type ItemKind } from '../items/items'
import { QuestManager } from '../quests/QuestManager'
import { createHousehold, type Household } from '../settlement/household'
import {
  closeMerchant,
  closeNpcDialogueMenu,
  configureNpcDialogueMenu,
  isMerchantOpen,
  openMerchantFromDialogue,
  openNpcDialogueMenu,
  ui,
} from './store'

function stubNpc(partial: Partial<NpcAgent> & Pick<NpcAgent, 'id' | 'displayName'>): NpcAgent {
  return {
    name: partial.displayName,
    role: 'farmer',
    gender: 'male',
    age: 40,
    health: { dead: false },
    getDialogueLine: () => 'hello',
    preparePaymentRequest: () => null,
    pendingVoluntaryJoinProposal: () => null,
    pendingPlayerFollowUp: () => null,
    voiceActor: 'alex',
    mesh: { position: { x: 0, y: 0, z: 0 } },
    stopPlayerReactionVoice: () => {},
    ...partial,
  } as NpcAgent
}

function householdWith(counts: Partial<Record<ItemKind, number>>): Household {
  return createHousehold('h-stock', 's1', 'home1', {
    water: 0,
    items: { counts, instances: [] },
  })
}

function hunter(household: Household): TradeReserveNpc {
  return { household, role: 'hunter' }
}

function counterparty(
  household: Household,
  role: NpcTradeCounterparty['role'] = 'farmer',
): NpcTradeCounterparty {
  return { role, household, personalInventory: new Inventory() }
}

const stubSettlement = { isHome: true, name: 'Test' } as Settlement
const emptyHandlers = {
  onClaimGuardReward: () => '',
  getCanClaimGuardReward: () => false,
  onRequestFood: () => '',
  onRequestWater: () => '',
  onAskAboutArea: () => '',
  onPayWage: () => '',
  onGiveItem: () => {},
  onRespondToJoinProposal: () => '',
  onProposeJoin: () => '',
}

describe('npcDialogueCanTrade', () => {
  it('is true for a living ordinary NPC even without trade-eligible stock', () => {
    expect(npcDialogueCanTrade(stubNpc({ id: 'npc-1', displayName: 'Jan' }))).toBe(true)
  })

  it('is true for a living merchant', () => {
    expect(npcDialogueCanTrade(stubNpc({ id: 'trader-1', displayName: 'Kasia', role: 'trader' }))).toBe(true)
  })

  it('is false for a dead NPC', () => {
    expect(npcDialogueCanTrade(stubNpc({
      id: 'npc-dead',
      displayName: 'Jan',
      health: { dead: true } as NpcAgent['health'],
    }))).toBe(false)
  })

  it('is false when no NPC is in dialogue', () => {
    expect(npcDialogueCanTrade(null)).toBe(false)
  })
})

describe('dialogue Handel and empty npcGoods session', () => {
  afterEach(() => {
    closeMerchant()
    closeNpcDialogueMenu({ decline: false })
  })

  it('shows Handel and opens npcGoods with an empty live stock', () => {
    const npc = stubNpc({ id: 'npc-1', displayName: 'Jan', role: 'farmer' })
    const onOpenTrade = vi.fn(() => {
      if (npc.health.dead) return
      openMerchantFromDialogue({}, [], 'npcGoods', null, null, [])
    })
    configureNpcDialogueMenu({
      ...emptyHandlers,
      getCanTrade: () => npcDialogueCanTrade(ui.npcDialogueMenu.npc as NpcAgent | null),
      onOpenTrade,
    })

    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)

    expect(ui.npcDialogueMenu.canTrade).toBe(true)
    expect(resolveNpcTradeOffers(counterparty(householdWith({}), 'farmer'), [])).toEqual([])

    ui.npcDialogueMenu.onOpenTrade?.()
    expect(onOpenTrade).toHaveBeenCalledTimes(1)
    expect(isMerchantOpen()).toBe(true)
    expect(ui.merchant.mode).toBe('npcGoods')
    expect(ui.merchant.npcStock).toEqual([])
    expect(ui.npcDialogueMenu.open).toBe(false)
  })

  it('keeps Handel for a hunter whose arrows sit at the protected reserve', () => {
    const household = householdWith({ arrow: HUNT_RESUPPLY_ARROW_TARGET })
    const npc = stubNpc({ id: 'hunter-1', displayName: 'Marek', role: 'hunter' })
    configureNpcDialogueMenu({
      ...emptyHandlers,
      getCanTrade: () => npcDialogueCanTrade(ui.npcDialogueMenu.npc as NpcAgent | null),
      onOpenTrade: () => openMerchantFromDialogue({}, [], 'npcGoods', null, null, []),
    })
    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)

    expect(resolveNpcTradeOffers(counterparty(household, 'hunter'), [hunter(household)])).toEqual([])
    expect(ui.npcDialogueMenu.canTrade).toBe(true)
  })

  it('keeps Handel when a hunter has arrow surplus', () => {
    const household = householdWith({ arrow: HUNT_RESUPPLY_ARROW_TARGET + 4 })
    const npc = stubNpc({ id: 'hunter-2', displayName: 'Marek', role: 'hunter' })
    configureNpcDialogueMenu({
      ...emptyHandlers,
      getCanTrade: () => npcDialogueCanTrade(ui.npcDialogueMenu.npc as NpcAgent | null),
      onOpenTrade: () => {},
    })
    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)

    expect(resolveNpcTradeOffers(counterparty(household, 'hunter'), [hunter(household)])).toEqual([
      { kind: 'arrow', quantity: 4, owner: 'household' },
    ])
    expect(ui.npcDialogueMenu.canTrade).toBe(true)
  })

  it('opens merchant mode for a living trader without changing catalog specials', () => {
    const npc = stubNpc({ id: 'trader-1', displayName: 'Kasia', role: 'trader' })
    configureNpcDialogueMenu({
      ...emptyHandlers,
      getCanTrade: () => npcDialogueCanTrade(ui.npcDialogueMenu.npc as NpcAgent | null),
      onOpenTrade: () => {
        if (npc.role === 'trader') {
          openMerchantFromDialogue({}, [], 'merchant', null, null, [{ kind: 'herb', quantity: 2, unitPrice: 5 }])
          return
        }
        openMerchantFromDialogue({}, [], 'npcGoods', null, null, [])
      },
    })
    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)

    expect(ui.npcDialogueMenu.canTrade).toBe(true)
    ui.npcDialogueMenu.onOpenTrade?.()
    expect(ui.merchant.mode).toBe('merchant')
    expect(ui.merchant.npcStock).toEqual([{ kind: 'herb', quantity: 2, unitPrice: 5 }])
  })

  it('does not open trade for a dead NPC', () => {
    const npc = stubNpc({
      id: 'npc-dead',
      displayName: 'Jan',
      health: { dead: true } as NpcAgent['health'],
    })
    const onOpenTrade = vi.fn(() => {
      if (npc.health.dead) return
      openMerchantFromDialogue({}, [], 'npcGoods', null, null, [])
    })
    configureNpcDialogueMenu({
      ...emptyHandlers,
      getCanTrade: () => npcDialogueCanTrade(ui.npcDialogueMenu.npc as NpcAgent | null),
      onOpenTrade,
    })
    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)

    expect(ui.npcDialogueMenu.canTrade).toBe(false)
    ui.npcDialogueMenu.onOpenTrade?.()
    expect(isMerchantOpen()).toBe(false)
  })
})
