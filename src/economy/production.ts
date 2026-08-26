import type { Role } from '../ai/characters'
import type { Inventory, ItemAmount } from '../items/Inventory'
import type { StockAmount } from './stock'

/**
 * Shared production/processing operation (plan 071). 069 should add farming
 * as another `ProductionDef` rather than a second resource model.
 */
export type ProductionDef = {
  id: string
  /** When set, only this role's completed work should apply the recipe. */
  role?: Role
  inputs: readonly StockAmount[]
  outputs: readonly StockAmount[]
  /** Item-based inputs/outputs (settlements-npcs-003) — for recipes whose
   *  materials/products are plain `Inventory` items (household-held
   *  branch/beam/arrow) rather than settlement `EconomicKind` stock. Applied
   *  via `Inventory.applyRecipe`/`produceFirstAvailableItemRecipe` below,
   *  never `SettlementEconomy`. Optional so every existing stock-only
   *  `ProductionDef` is unaffected. */
  itemInputs?: readonly ItemAmount[]
  itemOutputs?: readonly ItemAmount[]
}

/** Wood source → woodcutter chop/deposit → wood stock. */
export const WOODCUTTING_PRODUCTION: ProductionDef = {
  id: 'woodcutter.harvest',
  role: 'woodcutter',
  inputs: [],
  outputs: [{ kind: 'wood', amount: 2 }],
}

/**
 * Placeholders so 069 / mining / fishing can fill inputs/outputs without a
 * new production scheduler. Empty recipes are successful no-ops.
 */
export const FARMING_PRODUCTION: ProductionDef = {
  id: 'farmer.work',
  role: 'farmer',
  inputs: [],
  outputs: [],
}

export const FISHING_PRODUCTION: ProductionDef = {
  id: 'fisher.work',
  role: 'fisher',
  inputs: [],
  outputs: [],
}

export const MINING_PRODUCTION: ProductionDef = {
  id: 'miner.work',
  role: 'miner',
  inputs: [],
  outputs: [],
}

/**
 * Hunter arrow production (settlements-npcs-003, completing plan 178's
 * `beginArrowCrafting`) — item-for-item recipes against `Household.items`,
 * not `EconomicStock`: `branch`/`beam`/`arrow` are `ItemKind`s, not
 * `EconomicKind`s (plan 187 split `branch`/`beam` out of the old wood
 * model). Two alternative recipes rather than one `BY_ROLE` entry because
 * the hunter must prefer branch over beam (§9) — see
 * `produceFirstAvailableItemRecipe`.
 */
export const ARROWS_FROM_BRANCH_PRODUCTION: ProductionDef = {
  id: 'hunter.arrows.branch',
  role: 'hunter',
  inputs: [],
  outputs: [],
  itemInputs: [{ kind: 'branch', amount: 1 }],
  itemOutputs: [{ kind: 'arrow', amount: 1 }],
}

export const ARROWS_FROM_BEAM_PRODUCTION: ProductionDef = {
  id: 'hunter.arrows.beam',
  role: 'hunter',
  inputs: [],
  outputs: [],
  itemInputs: [{ kind: 'beam', amount: 1 }],
  itemOutputs: [{ kind: 'arrow', amount: 8 }],
}

/** Priority order (branch before beam) — deterministic, no random pick. */
export const HUNTER_ARROW_PRODUCTIONS: readonly ProductionDef[] = [
  ARROWS_FROM_BRANCH_PRODUCTION,
  ARROWS_FROM_BEAM_PRODUCTION,
]

/**
 * Applies the first recipe in `defs` whose item inputs are available in
 * `inventory`, atomically consuming inputs and producing outputs via
 * `Inventory.applyRecipe`. Returns the applied def, or null when none of
 * them can run. Generic priority-ordered item production — not hunter/arrow
 * specific, so a future item recipe with more than one viable material can
 * reuse it directly.
 */
export function produceFirstAvailableItemRecipe(
  inventory: Inventory,
  defs: readonly ProductionDef[],
): ProductionDef | null {
  for (const def of defs) {
    if (inventory.applyRecipe(def.itemInputs ?? [], def.itemOutputs ?? [])) return def
  }
  return null
}

const BY_ROLE: Partial<Record<Role, ProductionDef>> = {
  farmer: FARMING_PRODUCTION,
  fisher: FISHING_PRODUCTION,
  miner: MINING_PRODUCTION,
  woodcutter: WOODCUTTING_PRODUCTION,
}

export function productionForRole(role: Role): ProductionDef | null {
  return BY_ROLE[role] ?? null
}
