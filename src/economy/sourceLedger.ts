import type { EconomicKind, EconomicSourceId } from './kinds'
import type { EconomicStock } from './stock'

/**
 * Source-attribution ledger and entitlement accrual (plan settlements-004).
 *
 * Owns three sparse, persistent records layered on top of a settlement's
 * aggregate `EconomicStock`, never replacing it:
 *
 * - unrealized attributed quantity per `(sourceId, kind)` — the part of
 *   aggregate stock still traceable to a real production source;
 * - exact-once realization records, keyed by caller-supplied `eventId`;
 * - persistent `SourceEntitlement` definitions and their integer
 *   basis-point accrual.
 *
 * `SettlementEconomy` is the sole owner/caller — this module never touches
 * `EconomicStock` except through the `stock` argument `realize()` receives,
 * so the stock mutation and the ledger mutation stay one atomic step.
 *
 * @domain settlements
 */

export type SourceEntitlementBeneficiary = { kind: 'player' }

/**
 * Persistent per-source revenue-share agreement. `shareBps` is basis points
 * (2000 = 20%) — never a runtime float accumulator. `accruedWholeCoins` is
 * claimable now; `remainderNumerator` carries the sub-coin fraction between
 * realization events so many small realizations do not lose value.
 *
 * @domain settlements
 */
export type SourceEntitlement = {
  id: string
  sourceId: EconomicSourceId
  beneficiary: SourceEntitlementBeneficiary
  shareBps: number
  accruedWholeCoins: number
  remainderNumerator: number
}

export type SourceEntitlementSnapshot = SourceEntitlement

export type SourceRealizationSnapshot = {
  eventId: string
  sourceId: EconomicSourceId
  kind: EconomicKind
  amount: number
  unitValue: number
  grossValue: number
  simTime: number
}

/** Plain-data carry/persist shape — see `SettlementEconomySnapshot`'s
 *  `sourceAccounting` field. Omitted entirely when every part is empty. */
export type SourceAccountingSnapshot = {
  unrealized: Record<EconomicSourceId, Partial<Record<EconomicKind, number>>>
  entitlements: readonly SourceEntitlementSnapshot[]
  realizations: readonly SourceRealizationSnapshot[]
}

export type RealizeAttributedInput = {
  kind: EconomicKind
  sourceId: EconomicSourceId
  amount: number
  unitValue: number
  /** Stable operation key — exact-once. A repeat replays the original
   *  result without mutating stock or entitlement accrual. */
  eventId: string
  simTime?: number
}

export type RealizationResult =
  | {
      ok: true
      eventId: string
      sourceId: EconomicSourceId
      kind: EconomicKind
      amount: number
      unitValue: number
      grossValue: number
      simTime: number
      /** True when `eventId` had already been processed — this call made no
       *  new mutation and returned the original committed result. */
      replay: boolean
    }
  | { ok: false, reason: 'invalid-input' | 'insufficient-source' | 'insufficient-stock' }

export type EstablishEntitlementInput = {
  sourceId: EconomicSourceId
  beneficiary: SourceEntitlementBeneficiary
  shareBps: number
}

export type ClaimResult =
  | { ok: true, amount: number, replay: boolean }
  | { ok: false, reason: 'missing' | 'invalid-amount' | 'insufficient-accrued' }

const BPS_DENOMINATOR = 10_000

function beneficiaryKey(beneficiary: SourceEntitlementBeneficiary): string {
  return beneficiary.kind
}

/** Deterministic for the agreement identity `(sourceId, beneficiary)` —
 *  re-establishing the same agreement returns the existing entitlement
 *  rather than creating a duplicate. */
export function sourceEntitlementId(sourceId: EconomicSourceId, beneficiary: SourceEntitlementBeneficiary): string {
  return `entitlement:${sourceId}:${beneficiaryKey(beneficiary)}`
}

/**
 * @domain settlements
 * @system source-accounting
 * @role Owns one settlement economy's source-unrealized ledger, exact-once
 *   realization records and persistent entitlement accrual/claim state.
 * @owns SourceAccounting
 */
export type SourceAccounting = {
  addAttributed: (kind: EconomicKind, amount: number, sourceId: EconomicSourceId) => void
  unrealized: (sourceId: EconomicSourceId, kind: EconomicKind) => number
  /** One atomic realization transaction: validates against both the ledger
   *  and `stock`, then removes `amount` from both and accrues matching
   *  entitlements. `stock` is the caller's own `EconomicStock` so the two
   *  mutations never drift apart. */
  realize: (stock: EconomicStock, input: RealizeAttributedInput) => RealizationResult
  establishEntitlement: (input: EstablishEntitlementInput) => SourceEntitlement
  entitlement: (entitlementId: string) => SourceEntitlement | undefined
  claimable: (entitlementId: string) => number
  commitClaim: (entitlementId: string, operationId: string, amount: number) => ClaimResult
  /** `undefined` when there is nothing to persist — callers drop the field
   *  entirely rather than persisting an empty shape. */
  snapshot: () => SourceAccountingSnapshot | undefined
}

export function createSourceAccounting(initial?: SourceAccountingSnapshot): SourceAccounting {
  const unrealizedByKind = new Map<EconomicSourceId, Map<EconomicKind, number>>()
  const entitlements = new Map<string, SourceEntitlement>()
  const realizations = new Map<string, RealizationResult & { ok: true }>()
  const claimOperations = new Map<string, Map<string, number>>()

  if (initial) {
    for (const [sourceId, kinds] of Object.entries(initial.unrealized)) {
      const row = new Map<EconomicKind, number>()
      for (const [kind, amount] of Object.entries(kinds) as [EconomicKind, number][]) {
        if (amount > 0) row.set(kind, amount)
      }
      if (row.size > 0) unrealizedByKind.set(sourceId, row)
    }
    for (const entitlement of initial.entitlements) entitlements.set(entitlement.id, { ...entitlement })
    for (const realization of initial.realizations) {
      realizations.set(realization.eventId, { ok: true, replay: false, ...realization })
    }
  }

  function unrealized(sourceId: EconomicSourceId, kind: EconomicKind): number {
    return unrealizedByKind.get(sourceId)?.get(kind) ?? 0
  }

  function setUnrealized(sourceId: EconomicSourceId, kind: EconomicKind, amount: number): void {
    const row = unrealizedByKind.get(sourceId)
    if (amount <= 0) {
      if (!row) return
      row.delete(kind)
      if (row.size === 0) unrealizedByKind.delete(sourceId)
      return
    }
    if (row) {
      row.set(kind, amount)
      return
    }
    unrealizedByKind.set(sourceId, new Map([[kind, amount]]))
  }

  /** Basis-point accrual with a persisted integer remainder (plan
   *  settlements-004) — `numerator = grossValue * shareBps + remainder`,
   *  `whole = floor(numerator / 10_000)`. Every matching entitlement for
   *  `sourceId` accrues independently off the same `grossValue`. */
  function accrue(sourceId: EconomicSourceId, grossValue: number): void {
    for (const entitlement of entitlements.values()) {
      if (entitlement.sourceId !== sourceId) continue
      const numerator = grossValue * entitlement.shareBps + entitlement.remainderNumerator
      entitlement.accruedWholeCoins += Math.floor(numerator / BPS_DENOMINATOR)
      entitlement.remainderNumerator = numerator % BPS_DENOMINATOR
    }
  }

  return {
    addAttributed(kind, amount, sourceId) {
      if (amount <= 0) return
      setUnrealized(sourceId, kind, unrealized(sourceId, kind) + amount)
    },
    unrealized,
    realize(stock, input) {
      const { kind, sourceId, amount, unitValue, eventId, simTime = 0 } = input
      const existing = realizations.get(eventId)
      if (existing) return { ...existing, replay: true }
      if (!(amount > 0) || !(unitValue > 0)) return { ok: false, reason: 'invalid-input' }
      if (unrealized(sourceId, kind) < amount) return { ok: false, reason: 'insufficient-source' }
      if (!stock.has(kind, amount)) return { ok: false, reason: 'insufficient-stock' }
      stock.remove(kind, amount)
      setUnrealized(sourceId, kind, unrealized(sourceId, kind) - amount)
      const grossValue = amount * unitValue
      const result: RealizationResult & { ok: true } = {
        ok: true, eventId, sourceId, kind, amount, unitValue, grossValue, simTime, replay: false,
      }
      realizations.set(eventId, result)
      accrue(sourceId, grossValue)
      return result
    },
    establishEntitlement(input) {
      const id = sourceEntitlementId(input.sourceId, input.beneficiary)
      const existing = entitlements.get(id)
      if (existing) return existing
      const created: SourceEntitlement = {
        id,
        sourceId: input.sourceId,
        beneficiary: input.beneficiary,
        shareBps: input.shareBps,
        accruedWholeCoins: 0,
        remainderNumerator: 0,
      }
      entitlements.set(id, created)
      return created
    },
    entitlement: (id) => entitlements.get(id),
    claimable: (id) => entitlements.get(id)?.accruedWholeCoins ?? 0,
    commitClaim(entitlementId, operationId, amount) {
      const entitlement = entitlements.get(entitlementId)
      if (!entitlement) return { ok: false, reason: 'missing' }
      const ops = claimOperations.get(entitlementId)
      const priorAmount = ops?.get(operationId)
      if (priorAmount != null) return { ok: true, amount: priorAmount, replay: true }
      if (!(amount > 0)) return { ok: false, reason: 'invalid-amount' }
      if (amount > entitlement.accruedWholeCoins) return { ok: false, reason: 'insufficient-accrued' }
      entitlement.accruedWholeCoins -= amount
      if (ops) ops.set(operationId, amount)
      else claimOperations.set(entitlementId, new Map([[operationId, amount]]))
      return { ok: true, amount, replay: false }
    },
    snapshot() {
      const unrealizedOut: Record<EconomicSourceId, Partial<Record<EconomicKind, number>>> = {}
      for (const [sourceId, row] of unrealizedByKind) {
        if (row.size === 0) continue
        const kinds: Partial<Record<EconomicKind, number>> = {}
        for (const [kind, amount] of row) kinds[kind] = amount
        unrealizedOut[sourceId] = kinds
      }
      const entitlementsOut = [...entitlements.values()].map((entitlement) => ({ ...entitlement }))
      const realizationsOut = [...realizations.values()]
        .map(({ ok: _ok, replay: _replay, ...rest }) => rest)
      if (Object.keys(unrealizedOut).length === 0 && entitlementsOut.length === 0 && realizationsOut.length === 0) {
        return undefined
      }
      return { unrealized: unrealizedOut, entitlements: entitlementsOut, realizations: realizationsOut }
    },
  }
}
