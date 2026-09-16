import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { FamilyDef, VillageSize } from './families'
import type { HouseholdStartingContext, HouseholdTradeStockContext } from './household'
import { createArmorInstance, isArmorKind } from '../items/armorItemInstances'
import { type ArmorKind, type ArmorQuality, isInstanceBackedKind } from '../items/itemInstances'
import { createAcquiredInstance } from '../items/trade'
import { createSeededRandom } from '../world/parseSeed'
import { adultProfessionCoverage } from './professionStaffing'
import { resolveSettlementArmorQuality } from './settlementArmorQuality'

/**
 * One-time specialist trade stock for profession households (plans
 * settlements-npcs-040 / settlements-npcs-042). Goods are inserted into
 * `Household.items` only on genuine first construction — never a second
 * shop inventory, never inferred from remaining stock on restore.
 *
 * @domain settlements-npcs
 */

export const WOODCUTTER_TRADE_AXE_COUNT = 2
export const HUNTER_STARTER_TRADE_SHORT_BOWS = 1
export const FARMER_TRADE_TOOL_COUNT = 1
export const BLACKSMITH_TRADE_SWORD_COUNT = 1
export const BLACKSMITH_TRADE_PAULDRON_COUNT = 1

/** SM hunter arrow floor — larger settlements scale up from this. */
export const HUNTER_STARTER_TRADE_ARROWS = 12
export const HUNTER_STARTER_DRIED_MEAT = 2
export const HUNTER_STARTER_HERB = 3

export type StarterGrant = {
  kind: ItemKind
  count: number
  armorQuality?: ArmorQuality
}

function sizeRank(size: VillageSize): number {
  switch (size) {
    case 'LG':
      return 3
    case 'MD':
      return 2
    case 'OUTPOST':
      return 0
    case 'SM':
      return 1
    case 'XL':
      return 4
    default:
      return 1
  }
}

function stockContext(starting: HouseholdStartingContext): HouseholdTradeStockContext | undefined {
  return starting.tradeStock
}

function stockSize(starting: HouseholdStartingContext): VillageSize {
  return stockContext(starting)?.size ?? 'SM'
}

function huntingBias(ctx: HouseholdTradeStockContext | undefined): boolean {
  return ctx?.terrain === 'forest'
}

function metalBias(ctx: HouseholdTradeStockContext | undefined): boolean {
  const type = ctx?.dominantResource?.type
  return ctx?.terrain === 'mountain' || type === 'iron' || type === 'coal' || type === 'gold'
}

function specialistRng(starting: HouseholdStartingContext, householdId: string, salt: number): () => number {
  const seed = stockContext(starting)?.seed ?? 0
  let h = 2166136261
  for (const value of [householdId]) {
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return createSeededRandom((seed ^ salt ^ (h >>> 0)) >>> 0)
}

function armorQualityFor(
  starting: HouseholdStartingContext,
  householdId: string,
  kind: ArmorKind,
  unitIndex: number,
): ArmorQuality {
  return resolveSettlementArmorQuality({
    size: stockSize(starting),
    seed: stockContext(starting)?.seed ?? 0,
    ownerId: householdId,
    kind,
    unitIndex,
  })
}

function pushGrant(grants: StarterGrant[], kind: ItemKind, count: number, armorQuality?: ArmorQuality): void {
  if (count <= 0) return
  grants.push(armorQuality ? { kind, count, armorQuality } : { kind, count })
}

function hunterArrows(size: VillageSize): number {
  switch (size) {
    case 'LG':
      return 20
    case 'MD':
      return 16
    case 'OUTPOST':
      return 8
    case 'SM':
      return HUNTER_STARTER_TRADE_ARROWS
    case 'XL':
      return 24
    default:
      return HUNTER_STARTER_TRADE_ARROWS
  }
}

function hunterDriedMeat(size: VillageSize): number {
  return sizeRank(size) <= 1 ? HUNTER_STARTER_DRIED_MEAT : sizeRank(size) === 2 ? 3 : sizeRank(size) === 3 ? 4 : 5
}

function hunterHerb(size: VillageSize): number {
  return sizeRank(size) <= 1 ? HUNTER_STARTER_HERB : sizeRank(size) === 2 ? 4 : sizeRank(size) === 3 ? 5 : 6
}

function resolveHunterGrants(starting: HouseholdStartingContext, householdId: string): StarterGrant[] {
  const grants: StarterGrant[] = []
  const size = stockSize(starting)
  const rank = sizeRank(size)
  const ctx = stockContext(starting)
  const forest = huntingBias(ctx)

  pushGrant(grants, 'arrow', hunterArrows(size) + (forest ? 4 : 0))
  pushGrant(grants, 'dried_meat', hunterDriedMeat(size))
  pushGrant(grants, 'herb', hunterHerb(size))
  pushGrant(grants, 'short_bow', HUNTER_STARTER_TRADE_SHORT_BOWS)
  pushGrant(grants, 'waterskin_small', 1)
  pushGrant(grants, 'leather_pauldron', 1, armorQualityFor(starting, householdId, 'leather_pauldron', 0))

  if (rank >= 2 || forest) {
    pushGrant(grants, 'hunting_bow', 1)
  }
  if (rank >= 2) {
    pushGrant(grants, 'backpack', 1)
  }
  if (rank >= 3 || (rank >= 2 && forest)) {
    pushGrant(grants, 'leather_armor', 1, armorQualityFor(starting, householdId, 'leather_armor', 0))
  }
  if (rank >= 3) {
    pushGrant(grants, 'broadhead_arrow', forest ? 6 : 4)
  }
  if (rank >= 4) {
    pushGrant(grants, 'saddlebags', 1)
    if (forest) pushGrant(grants, 'long_bow', 1)
  }
  return grants
}

function resolveBlacksmithGrants(starting: HouseholdStartingContext, householdId: string): StarterGrant[] {
  const grants: StarterGrant[] = []
  const size = stockSize(starting)
  const rank = sizeRank(size)
  const ctx = stockContext(starting)
  const metal = metalBias(ctx)
  const rng = specialistRng(starting, householdId, 0x42534d54)

  pushGrant(grants, 'knife', 1)
  const smSword: ItemKind = rng() < 0.5 ? 'short_sword' : 'long_sword'
  pushGrant(grants, smSword, BLACKSMITH_TRADE_SWORD_COUNT)
  if (rank >= 2 && smSword !== 'short_sword') pushGrant(grants, 'short_sword', 1)
  if (rank >= 2 && smSword !== 'long_sword') pushGrant(grants, 'long_sword', 1)

  const smTool: ItemKind = metal || rng() < 0.5 ? 'pickaxe' : 'axe'
  pushGrant(grants, smTool, 1)
  if (rank >= 2) {
    if (smTool !== 'axe') pushGrant(grants, 'axe', 1)
    if (smTool !== 'pickaxe') pushGrant(grants, 'pickaxe', 1)
  } else if (metal && smTool !== 'axe') {
    pushGrant(grants, 'axe', 1)
  }

  pushGrant(
    grants,
    'knight_pauldron_round',
    BLACKSMITH_TRADE_PAULDRON_COUNT,
    armorQualityFor(starting, householdId, 'knight_pauldron_round', 0),
  )
  if (rank >= 2) {
    pushGrant(
      grants,
      'knight_pauldron_spike',
      1,
      armorQualityFor(starting, householdId, 'knight_pauldron_spike', 0),
    )
  }
  if (rank >= 3 || (rank >= 2 && metal)) {
    pushGrant(grants, 'chainmail', 1, armorQualityFor(starting, householdId, 'chainmail', 0))
  }
  if (rank >= 4 && (metal || rng() < 0.18)) {
    pushGrant(grants, rng() < 0.5 ? 'masterwork_sword' : 'damascus_short_sword', 1)
  }
  return grants
}

/**
 * Deterministic profession starter grants for genuine first construction.
 * Pure — callers materialize through `applyProfessionTradeStock`.
 *
 * @domain settlements-npcs
 */
export function resolveProfessionStarterGrants(
  starting: HouseholdStartingContext,
  householdId: string,
): readonly StarterGrant[] {
  const grants: StarterGrant[] = []
  if (starting.hasHunter) grants.push(...resolveHunterGrants(starting, householdId))
  if (starting.hasWoodcutter) pushGrant(grants, 'axe', WOODCUTTER_TRADE_AXE_COUNT)
  if ((starting.adultFarmerCount ?? 0) > 0) {
    pushGrant(grants, 'pitchfork', FARMER_TRADE_TOOL_COUNT)
    pushGrant(grants, 'sickle', FARMER_TRADE_TOOL_COUNT)
  }
  if (starting.hasBlacksmith) grants.push(...resolveBlacksmithGrants(starting, householdId))
  return grants
}

/**
 * Profession coverage for household first-construction bootstrap, derived
 * from `FamilyDef` rather than live NPC instances.
 *
 * @domain settlements-npcs
 */
export function householdStartingContextFromFamily(
  family: FamilyDef,
  tradeStock?: HouseholdTradeStockContext,
): HouseholdStartingContext {
  const coverage = adultProfessionCoverage([family])
  return {
    hasHunter: family.members.some((member) => member.character.role === 'hunter'),
    hasWoodcutter: coverage.woodcutter > 0,
    hasBlacksmith: coverage.blacksmith > 0,
    adultFarmerCount: coverage.farmer,
    ...(tradeStock ? { tradeStock } : {}),
  }
}

function addStarterGrant(items: Inventory, grant: StarterGrant): void {
  if (grant.count <= 0) return
  if (isArmorKind(grant.kind)) {
    const quality = grant.armorQuality ?? 'common'
    for (let i = 0; i < grant.count; i++) {
      items.addInstance(createArmorInstance(grant.kind, quality))
    }
    return
  }
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
export function applyProfessionTradeStock(
  items: Inventory,
  starting: HouseholdStartingContext,
  householdId: string,
): void {
  for (const grant of resolveProfessionStarterGrants(starting, householdId)) {
    addStarterGrant(items, grant)
  }
}
