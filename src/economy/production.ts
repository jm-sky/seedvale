import type { Role } from '../ai/characters'
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

const BY_ROLE: Partial<Record<Role, ProductionDef>> = {
  farmer: FARMING_PRODUCTION,
  fisher: FISHING_PRODUCTION,
  miner: MINING_PRODUCTION,
  woodcutter: WOODCUTTING_PRODUCTION,
}

export function productionForRole(role: Role): ProductionDef | null {
  return BY_ROLE[role] ?? null
}
