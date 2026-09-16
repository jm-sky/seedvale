import type { Inventory } from '../items/Inventory'
import type { Household } from '../settlement/household'
import type { Role } from './characters'
import { isInstanceBackedKind } from '../items/itemInstances'
import { hasItemKindCategory, type ItemKind } from '../items/items'
import { HUNT_RESUPPLY_ARROW_TARGET } from './NpcAgent'
import { isNpcLoadoutBelonging } from './npcLoadout'

/** Which authoritative inventory an ordinary-NPC offer is taken from.
 *  Household production surplus and personal belongings stay distinct
 *  owners — never merged with `carried` or `transportCargo`.
 *
 * @domain settlements-npcs
 */
export type NpcTradeOwnerSource = 'household' | 'personal'

/**
 * One live sellable good for an ordinary NPC trade session. Quantity is
 * owned stock minus any protected reserve; `owner` names the real
 * inventory that still holds it until a successful commit.
 *
 * @domain settlements-npcs
 */
export type NpcTradeOffer = {
  kind: ItemKind
  /** Live sellable quantity — owned quantity minus the protected reserve, if any. */
  quantity: number
  owner: NpcTradeOwnerSource
}

/** Minimal NPC shape household-reserve policy needs — decoupled from the
 *  full `NpcAgent` class so it stays unit-testable with plain objects; a
 *  real `NpcAgent` satisfies this structurally without any adapter. */
export type TradeReserveNpc = {
  household: Household | null
  role: Role
}

/** Counterparty the trade resolver inspects — household membership, role
 *  (for loadout protection) and the NPC's own persistent personal
 *  inventory. Transient `carried` and `transportCargo` are deliberately
 *  absent so they cannot become generic stock.
 *
 *  A real `NpcAgent` satisfies this structurally.
 *
 * @domain settlements-npcs
 */
export type NpcTradeCounterparty = {
  role: Role
  household: Household | null
  personalInventory: Inventory
}

/** Reserve resolver for one household-trade-eligible `ItemKind` — owned
 *  quantity minus this is what's actually offered to the player. Kept
 *  separate per kind so each reserve rule stays legible and reuses its own
 *  domain's semantics instead of a shared "surplus" formula that would fit
 *  none of them well. */
type ReserveResolver = (household: Household, settlementNpcs: readonly TradeReserveNpc[]) => number

/** Hunter arrow reserve (plan settlements-npcs-033 §3) — reuses
 *  `HUNT_RESUPPLY_ARROW_TARGET`, the same per-hunter resupply target
 *  `NpcAgent.attemptHuntKill` already tops carried arrows up to, rather than
 *  a second independent trade-only magic number. Scales with the number of
 *  actual Hunter members sharing this household so trade never starves a
 *  multi-hunter household's combined resupply demand; zero when the
 *  household has no hunter (nothing to protect the stock for). */
function hunterArrowReserve(household: Household, settlementNpcs: readonly TradeReserveNpc[]): number {
  const hunterCount = settlementNpcs.filter((npc) => npc.household === household && npc.role === 'hunter').length
  return hunterCount * HUNT_RESUPPLY_ARROW_TARGET
}

/** V1 household outputs with no existing self-consumption/reserve demand
 *  (plan settlements-npcs-036). Production inputs, food, seeds and wood
 *  stay off the allowlist rather than getting a zero-reserve rule. */
const noHouseholdReserve: ReserveResolver = () => 0

/** Intentionally narrow positive allowlist (plans settlements-npcs-033 §2,
 *  settlements-npcs-036 and settlements-npcs-040) — only kinds with an
 *  explicit, safe eligibility + reserve rule are ever offered from
 *  `Household.items`. Inventory presence alone never means sellable.
 *  Extending this to a future profession's output is meant to be exactly
 *  one new entry here. */
const HOUSEHOLD_TRADE_RESERVES: Partial<Record<ItemKind, ReserveResolver>> = {
  arrow: hunterArrowReserve,
  wool_material: noHouseholdReserve,
  linen_material: noHouseholdReserve,
  bandage: noHouseholdReserve,
  dressing: noHouseholdReserve,
  iron_rod: noHouseholdReserve,
  short_bow: noHouseholdReserve,
  hunting_bow: noHouseholdReserve,
  dried_meat: noHouseholdReserve,
  herb: noHouseholdReserve,
  waterskin_small: noHouseholdReserve,
  backpack: noHouseholdReserve,
  leather_pauldron: noHouseholdReserve,
  leather_armor: noHouseholdReserve,
  saddlebags: noHouseholdReserve,
  axe: noHouseholdReserve,
  pitchfork: noHouseholdReserve,
  sickle: noHouseholdReserve,
  short_sword: noHouseholdReserve,
  long_sword: noHouseholdReserve,
  knife: noHouseholdReserve,
  pickaxe: noHouseholdReserve,
  chainmail: noHouseholdReserve,
  masterwork_sword: noHouseholdReserve,
  damascus_short_sword: noHouseholdReserve,
  damascus_knife: noHouseholdReserve,
  broadhead_arrow: noHouseholdReserve,
  long_bow: noHouseholdReserve,
  knight_pauldron_round: noHouseholdReserve,
  knight_pauldron_spike: noHouseholdReserve,
}

/** Personal-inventory allowlist (plan settlements-npcs-036). Loadout,
 *  `coin`, story/identity items and anything not listed stay unsellable
 *  even when they happen to sit in `personalInventory`. Same production
 *  outputs as household so a player-given surplus can be bought back;
 *  arrows stay household-only because their reserve lives there. */
const PERSONAL_TRADE_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'bandage',
  'dressing',
  'iron_rod',
  'linen_material',
  'wool_material',
])

function ownedCount(inventory: Inventory, kind: ItemKind): number {
  return isInstanceBackedKind(kind) ? inventory.countInstances(kind) : inventory.count(kind)
}

function householdQuantityAvailable(
  kind: ItemKind,
  household: Household,
  settlementNpcs: readonly TradeReserveNpc[],
): number {
  const reserveOf = HOUSEHOLD_TRADE_RESERVES[kind]
  if (!reserveOf) return 0
  const owned = ownedCount(household.items, kind)
  if (owned <= 0) return 0
  return Math.max(0, owned - reserveOf(household, settlementNpcs))
}

function isProtectedPersonalKind(kind: ItemKind, role: Role): boolean {
  if (kind === 'coin') return true
  if (hasItemKindCategory(kind, 'story')) return true
  return isNpcLoadoutBelonging(kind, role)
}

function personalQuantityAvailable(kind: ItemKind, npc: NpcTradeCounterparty): number {
  if (!PERSONAL_TRADE_KINDS.has(kind)) return 0
  if (isProtectedPersonalKind(kind, npc.role)) return 0
  const owned = ownedCount(npc.personalInventory, kind)
  return owned > 0 ? owned : 0
}

/** Live sellable quantity of one `ItemKind` from one named owner. Called
 *  both to build the trade-offer preview and again, on the current live
 *  state, right before commit — never cached. Returns 0 for an ineligible
 *  kind, a missing household, or stock that is entirely reserved/protected.
 *
 * @domain settlements-npcs
 */
export function npcTradeQuantityAvailable(
  kind: ItemKind,
  owner: NpcTradeOwnerSource,
  npc: NpcTradeCounterparty,
  settlementNpcs: readonly TradeReserveNpc[],
): number {
  if (owner === 'household') {
    if (!npc.household) return 0
    return householdQuantityAvailable(kind, npc.household, settlementNpcs)
  }
  return personalQuantityAvailable(kind, npc)
}

/** Authoritative inventory that still holds an offer's stock, or `null`
 *  when that owner cannot be resolved (no household / no personal bag).
 *
 * @domain settlements-npcs
 */
export function npcTradeSourceInventory(
  owner: NpcTradeOwnerSource,
  npc: NpcTradeCounterparty,
): Inventory | null {
  if (owner === 'household') return npc.household?.items ?? null
  return npc.personalInventory
}

/** Every currently sellable good for one counterparty — what the "Handel"
 *  dialogue action and the trade screen's BUY column are built from.
 *  Household rows come first in allowlist order; a personal row for the
 *  same kind is omitted while household still has surplus, so the BUY
 *  column keeps a single quantity per `ItemKind`.
 *
 * @domain settlements-npcs
 */
export function resolveNpcTradeOffers(
  npc: NpcTradeCounterparty,
  settlementNpcs: readonly TradeReserveNpc[],
): readonly NpcTradeOffer[] {
  const offers: NpcTradeOffer[] = []
  const offered = new Set<ItemKind>()
  for (const kind of Object.keys(HOUSEHOLD_TRADE_RESERVES) as ItemKind[]) {
    const quantity = npcTradeQuantityAvailable(kind, 'household', npc, settlementNpcs)
    if (quantity <= 0) continue
    offers.push({ kind, quantity, owner: 'household' })
    offered.add(kind)
  }
  for (const kind of PERSONAL_TRADE_KINDS) {
    if (offered.has(kind)) continue
    const quantity = npcTradeQuantityAvailable(kind, 'personal', npc, settlementNpcs)
    if (quantity <= 0) continue
    offers.push({ kind, quantity, owner: 'personal' })
  }
  return offers
}
