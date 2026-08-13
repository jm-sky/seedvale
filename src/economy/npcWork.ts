import type { Role } from '../ai/characters'
import type { SettlementEconomy } from './settlementEconomy'
import { WOODSHED_DEVELOPMENT } from './development'
import { productionForRole, WOODCUTTING_PRODUCTION } from './production'

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
