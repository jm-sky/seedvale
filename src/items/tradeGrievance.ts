import { roundSellPrice } from './tradeCatalog'

/** Temporary merchant-price grievance length in world days. */
export const UNAUTHORIZED_PROPERTY_USE_DURATION_DAYS = 2

/** Temporary merchant pricing modifier — owns only reason/markup/expiry, not
 *  relation or catalog list prices (plan items-player-042). */
export type TradeGrievanceReason = 'unauthorized_property_use'

export type TradeGrievance = {
  reason: TradeGrievanceReason
  merchantKey: string
  markup: number
  expiresAtElapsedDays: number
}

const REASONS: ReadonlySet<string> = new Set(['unauthorized_property_use'])

/**
 * @domain items-player
 * @role Integer coin price after a temporary purchase markup. `markup` 0 is
 *  identity so display and commit can share one helper.
 */
export function applyPurchaseMarkup(unitPrice: number, markup: number): number {
  if (markup <= 0) return unitPrice
  return roundSellPrice(unitPrice * (1 + markup))
}

export function isTradeGrievance(value: unknown): value is TradeGrievance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.reason === 'string' && REASONS.has(v.reason)
    && typeof v.merchantKey === 'string' && v.merchantKey.length > 0
    && typeof v.markup === 'number' && Number.isFinite(v.markup) && v.markup >= 0
    && typeof v.expiresAtElapsedDays === 'number' && Number.isFinite(v.expiresAtElapsedDays)
  )
}

export function isTradeGrievanceList(value: unknown): value is TradeGrievance[] {
  return Array.isArray(value) && value.every(isTradeGrievance)
}

function cloneGrievance(entry: TradeGrievance): TradeGrievance {
  return {
    reason: entry.reason,
    merchantKey: entry.merchantKey,
    markup: entry.markup,
    expiresAtElapsedDays: entry.expiresAtElapsedDays,
  }
}

export type TradeGrievanceStore = {
  /** Active markup for `merchantKey` at `elapsedDays`, else 0. Expired rows
   *  do not affect pricing; they are pruned lazily on read/apply. */
  markupFor: (merchantKey: string, elapsedDays: number) => number
  applyUnauthorizedUse: (merchantKey: string, markup: number, elapsedDays: number) => void
  serialize: () => TradeGrievance[]
  reset: () => void
}

/**
 * @domain items-player
 * @role Owns temporary merchant grievances only — not relation, reputation,
 *  or `MERCHANT_PRICES`.
 */
export function createTradeGrievanceStore(initial?: readonly TradeGrievance[]): TradeGrievanceStore {
  const entries = new Map<string, TradeGrievance>()
  for (const entry of initial ?? []) {
    if (!isTradeGrievance(entry)) continue
    entries.set(entry.merchantKey, cloneGrievance(entry))
  }

  const pruneExpired = (elapsedDays: number): void => {
    for (const [key, entry] of entries) {
      if (elapsedDays >= entry.expiresAtElapsedDays) entries.delete(key)
    }
  }

  return {
    markupFor(merchantKey, elapsedDays) {
      pruneExpired(elapsedDays)
      const entry = entries.get(merchantKey)
      if (!entry) return 0
      return entry.markup
    },
    applyUnauthorizedUse(merchantKey, markup, elapsedDays) {
      pruneExpired(elapsedDays)
      const expiresAtElapsedDays = elapsedDays + UNAUTHORIZED_PROPERTY_USE_DURATION_DAYS
      const existing = entries.get(merchantKey)
      if (!existing) {
        entries.set(merchantKey, {
          reason: 'unauthorized_property_use',
          merchantKey,
          markup,
          expiresAtElapsedDays,
        })
        return
      }
      existing.markup = Math.max(existing.markup, markup)
      existing.expiresAtElapsedDays = Math.max(existing.expiresAtElapsedDays, expiresAtElapsedDays)
    },
    serialize() {
      return [...entries.values()].map(cloneGrievance)
    },
    reset() {
      entries.clear()
    },
  }
}
