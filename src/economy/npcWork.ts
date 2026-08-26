import type { Role } from '../ai/characters'
import type { Household } from '../settlement/household'
import type { SettlementEconomy } from './settlementEconomy'
import { WOODSHED_DEVELOPMENT } from './development'
import {
  HUNTER_ARROW_PRODUCTIONS,
  produceFirstAvailableItemRecipe,
  productionForRole,
  WOODCUTTING_PRODUCTION,
} from './production'

/**
 * Chop → deposit completion. Tree harvest stays in `NpcAgent`; this is the
 * stock mutation committed only after the deposit action succeeds.
 */
export function commitWoodcutterDeposit(economy: SettlementEconomy): boolean {
  const produced = economy.produce(WOODCUTTING_PRODUCTION)
  tryAdvanceDevelopment(economy)
  return produced
}

/**
 * Scheduled workplace `work` completion for roles that share the production
 * hook. Woodcutter yield is *not* applied here — standing at a tree must not
 * mint infinite wood; harvest goes through chop → deposit.
 */
export function commitRoleWork(economy: SettlementEconomy, role: Role): boolean {
  const def = productionForRole(role)
  if (!def) return false
  if (def.id === WOODCUTTING_PRODUCTION.id) return false
  return economy.produce(def)
}

/**
 * Hunter arrow production completion (settlements-npcs-003) — a thin adapter
 * from `NpcAgent`'s `work` completion to the generic item-recipe mechanism,
 * so `NpcAgent` doesn't need to know the branch/beam recipe details. Tries
 * `household.items`'s branch recipe before beam (§9); returns false when
 * neither material is available.
 */
export function commitHunterArrowProduction(household: Household): boolean {
  return produceFirstAvailableItemRecipe(household.items, HUNTER_ARROW_PRODUCTIONS) !== null
}

/** Reserve then pay the woodshed once stock can cover it. Idempotent. */
export function tryAdvanceDevelopment(economy: SettlementEconomy): boolean {
  if (economy.developmentStatus(WOODSHED_DEVELOPMENT.id) === 'unmet') {
    economy.reserveDevelopment(WOODSHED_DEVELOPMENT)
  }
  if (economy.developmentStatus(WOODSHED_DEVELOPMENT.id) === 'reserved') {
    return economy.payDevelopment(WOODSHED_DEVELOPMENT)
  }
  return false
}
