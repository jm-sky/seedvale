import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { FamilyDef } from './families'
import type { HouseholdStartingContext } from './household'
import { isInstanceBackedKind } from '../items/itemInstances'
import { createAcquiredInstance } from '../items/trade'
import { adultProfessionCoverage } from './professionStaffing'

/**
 * One-time specialist trade stock for profession households (plan
 * settlements-npcs-040). Goods are inserted into `Household.items` only on
 * genuine first construction — never a second shop inventory, never inferred
 * from remaining stock on restore.
 *
 * @domain settlements-npcs
 */

export const WOODCUTTER_TRADE_AXE_COUNT = 2
export const HUNTER_STARTER_TRADE_ARROWS = 16
export const HUNTER_STARTER_TRADE_SHORT_BOWS = 1
export const HUNTER_STARTER_TRADE_HUNTING_BOWS = 1
export const HUNTER_STARTER_DRIED_MEAT = 3
export const HUNTER_STARTER_HERB = 4
export const FARMER_TRADE_TOOL_COUNT = 1
export const BLACKSMITH_TRADE_SWORD_COUNT = 1
export const BLACKSMITH_TRADE_PAULDRON_COUNT = 1

type StarterGrant = { kind: ItemKind, count: number }

const HUNTER_TRADE_STOCK: readonly StarterGrant[] = [
  { kind: 'arrow', count: HUNTER_STARTER_TRADE_ARROWS },
  { kind: 'short_bow', count: HUNTER_STARTER_TRADE_SHORT_BOWS },
  { kind: 'hunting_bow', count: HUNTER_STARTER_TRADE_HUNTING_BOWS },
  { kind: 'dried_meat', count: HUNTER_STARTER_DRIED_MEAT },
  { kind: 'herb', count: HUNTER_STARTER_HERB },
  { kind: 'waterskin_small', count: 1 },
  { kind: 'backpack', count: 1 },
  { kind: 'leather_pauldron', count: 1 },
  { kind: 'leather_armor', count: 1 },
  { kind: 'saddlebags', count: 1 },
]

const WOODCUTTER_TRADE_STOCK: readonly StarterGrant[] = [
  { kind: 'axe', count: WOODCUTTER_TRADE_AXE_COUNT },
]

const FARMER_TRADE_STOCK: readonly StarterGrant[] = [
  { kind: 'pitchfork', count: FARMER_TRADE_TOOL_COUNT },
  { kind: 'sickle', count: FARMER_TRADE_TOOL_COUNT },
]

const BLACKSMITH_TRADE_STOCK: readonly StarterGrant[] = [
  { kind: 'short_sword', count: BLACKSMITH_TRADE_SWORD_COUNT },
  { kind: 'knight_pauldron_round', count: BLACKSMITH_TRADE_PAULDRON_COUNT },
]

/**
 * Profession coverage for household first-construction bootstrap, derived
 * from `FamilyDef` rather than live NPC instances.
 *
 * @domain settlements-npcs
 */
export function householdStartingContextFromFamily(family: FamilyDef): HouseholdStartingContext {
  const coverage = adultProfessionCoverage([family])
  return {
    hasHunter: family.members.some((member) => member.character.role === 'hunter'),
    hasWoodcutter: coverage.woodcutter > 0,
    hasBlacksmith: coverage.blacksmith > 0,
    adultFarmerCount: coverage.farmer,
  }
}

function addStarterGrant(items: Inventory, grant: StarterGrant): void {
  if (grant.count <= 0) return
  if (isInstanceBackedKind(grant.kind)) {
    for (let i = 0; i < grant.count; i++) {
      const instance = createAcquiredInstance(grant.kind)
      if (instance) items.addInstance(instance)
    }
    return
  }
  items.add(grant.kind, grant.count)
}

/**
 * Inserts bounded specialist trade stock into a household inventory. Caller
 * must invoke this only on genuine first construction.
 *
 * @domain settlements-npcs
 */
export function applyProfessionTradeStock(items: Inventory, starting: HouseholdStartingContext): void {
  if (starting.hasHunter) {
    for (const grant of HUNTER_TRADE_STOCK) addStarterGrant(items, grant)
  }
  if (starting.hasWoodcutter) {
    for (const grant of WOODCUTTER_TRADE_STOCK) addStarterGrant(items, grant)
  }
  if ((starting.adultFarmerCount ?? 0) > 0) {
    for (const grant of FARMER_TRADE_STOCK) addStarterGrant(items, grant)
  }
  if (starting.hasBlacksmith) {
    for (const grant of BLACKSMITH_TRADE_STOCK) addStarterGrant(items, grant)
  }
}
