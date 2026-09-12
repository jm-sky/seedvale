import type { Role } from '../ai/characters'
import type { Household } from '../settlement/household'
import type { SettlementEconomy } from './settlementEconomy'
import { WOODSHED_DEVELOPMENT } from './development'
import {
  DRESSING_PRODUCTION,
  HUNTER_ARROW_PRODUCTIONS,
  produceFirstAvailableItemRecipe,
  productionForRole,
  TEXTILE_WORKER_PRODUCTIONS,
  WOODCUTTING_PRODUCTION,
  WOOL_MATERIAL_PRODUCTION,
} from './production'
import { executeProduction } from './productionExecutor'

/**
 * Chop → deposit completion. Tree harvest stays in `NpcAgent`; this is the
 * stock mutation committed only after the deposit action succeeds.
 */
export function commitWoodcutterDeposit(economy: SettlementEconomy, simTime = 0): boolean {
  const produced = economy.produce(WOODCUTTING_PRODUCTION, simTime)
  tryAdvanceDevelopment(economy)
  return produced
}

/**
 * Scheduled workplace `work` completion for roles that share the production
 * hook. Woodcutter yield is *not* applied here — standing at a tree must not
 * mint infinite wood; harvest goes through chop → deposit.
 */
export function commitRoleWork(economy: SettlementEconomy, role: Role, simTime = 0): boolean {
  const def = productionForRole(role)
  if (!def) return false
  if (def.id === WOODCUTTING_PRODUCTION.id) return false
  return economy.produce(def, simTime)
}

/**
 * Hunter arrow production completion (settlements-npcs-003) — a thin adapter
 * from `NpcAgent`'s `work` completion to the generic item-recipe mechanism,
 * so `NpcAgent` doesn't need to know the branch/beam recipe details. Tries
 * `household.items`'s branch recipe before beam (§9); returns false when
 * neither material is available.
 */
export function commitHunterArrowProduction(household: Household, simTime = 0): boolean {
  return produceFirstAvailableItemRecipe(household.items, HUNTER_ARROW_PRODUCTIONS, simTime) !== null
}

/**
 * Textile Worker wool-processing completion (settlements-npcs-006) — a thin
 * adapter from profession `work` completion to the shared executor, so the
 * planner never calls `Inventory.applyRecipe()` itself. Live revalidation:
 * 0–3 wool, a missing owner, or a full destination all fail with zero
 * mutation.
 *
 * @domain settlements-npcs
 */
export function commitWoolMaterialProduction(household: Household, simTime = 0): boolean {
  return executeProduction(WOOL_MATERIAL_PRODUCTION, {
    inventory: household.items,
    simTime,
  }).ok
}

/**
 * Textile Worker completion (plan settlements-npcs-007) — wool, flax→linen,
 * or linen→bandage via shared executor priority order.
 *
 * @domain settlements-npcs
 */
export function commitTextileWorkProduction(household: Household, simTime = 0): boolean {
  return produceFirstAvailableItemRecipe(household.items, TEXTILE_WORKER_PRODUCTIONS, simTime) !== null
}

/**
 * Herbalist dressing completion (plan settlements-npcs-007).
 *
 * @domain settlements-npcs
 */
export function commitDressingProduction(household: Household, simTime = 0): boolean {
  return executeProduction(DRESSING_PRODUCTION, {
    inventory: household.items,
    simTime,
  }).ok
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
