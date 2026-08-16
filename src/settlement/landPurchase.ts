import type { Inventory } from '../items/Inventory'
import type { LandOwnershipRegistry } from './landOwnership'
import type { SettlementLandPlot } from './props'

export type LandPurchaseResult =
  | 'ok'
  | 'not_found'
  | 'already_owned'
  | 'invalid_price'
  | 'cannot_afford'

/** Narrowest shape the purchase transaction actually needs from a
 *  `Settlement` (`createSettlement.ts`) — only its stable id and materialized
 *  sale plots, not the full runtime settlement (NPCs, livestock, economy…).
 *  A real `Settlement` satisfies this structurally, no adapter needed. */
export type LandPurchaseTarget = {
  id: string
  landmarks: { landPlots: readonly SettlementLandPlot[] }
}

/**
 * Plan 129 §10 — the one domain operation that validates every purchase
 * condition before mutating anything. `Inventory.remove()` is already safe
 * on insufficient funds, but every world condition (plot exists, is a sale
 * plot, isn't already owned, has a positive price) must hold before either
 * the coin removal or the ownership write happens — a failed purchase must
 * leave both untouched.
 */
export function purchaseLandPlot(
  settlement: LandPurchaseTarget,
  plotId: string,
  inventory: Inventory,
  ownership: LandOwnershipRegistry,
): LandPurchaseResult {
  const plot = settlement.landmarks.landPlots.find((p) => p.plotId === plotId)
  if (!plot) return 'not_found'
  if (ownership.isOwned(settlement.id, plotId)) return 'already_owned'
  if (!(plot.price > 0)) return 'invalid_price'
  if (!inventory.has('coin', plot.price)) return 'cannot_afford'

  inventory.remove('coin', plot.price)
  ownership.setOwned(settlement.id, plotId)
  return 'ok'
}
