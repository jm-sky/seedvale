import { describe, expect, it } from 'vitest'
import { createSourceAccounting, sourceEntitlementId } from './sourceLedger'
import { EconomicStock } from './stock'

const PLAYER = { kind: 'player' as const }

describe('SourceAccounting — attribution ledger', () => {
  it('tracks unrealized quantity per (sourceId, kind), independent of stock', () => {
    const accounting = createSourceAccounting()
    accounting.addAttributed('gold', 5, 'mine:a')
    accounting.addAttributed('gold', 3, 'mine:a')
    accounting.addAttributed('gold', 2, 'mine:b')
    expect(accounting.unrealized('mine:a', 'gold')).toBe(8)
    expect(accounting.unrealized('mine:b', 'gold')).toBe(2)
    expect(accounting.unrealized('mine:unknown', 'gold')).toBe(0)
  })

  it('ignores non-positive attribution', () => {
    const accounting = createSourceAccounting()
    accounting.addAttributed('gold', 0, 'mine:a')
    accounting.addAttributed('gold', -4, 'mine:a')
    expect(accounting.unrealized('mine:a', 'gold')).toBe(0)
  })
})

describe('SourceAccounting.realize', () => {
  it('atomically removes the same amount from stock and the source ledger', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    const result = accounting.realize(stock, {
      kind: 'gold', sourceId: 'mine:a', amount: 4, unitValue: 20, eventId: 'ev:1',
    })
    expect(result).toMatchObject({ ok: true, amount: 4, unitValue: 20, grossValue: 80, replay: false })
    expect(stock.query('gold')).toBe(6)
    expect(accounting.unrealized('mine:a', 'gold')).toBe(6)
  })

  it('rejects non-positive amount/unitValue without mutating anything', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    expect(accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 0, unitValue: 20, eventId: 'ev:1' }))
      .toEqual({ ok: false, reason: 'invalid-input' })
    expect(accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 4, unitValue: 0, eventId: 'ev:2' }))
      .toEqual({ ok: false, reason: 'invalid-input' })
    expect(stock.query('gold')).toBe(10)
    expect(accounting.unrealized('mine:a', 'gold')).toBe(10)
  })

  it('rejects realizing more than the unrealized source quantity, even when aggregate stock covers it', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 4, 'mine:a')
    const result = accounting.realize(stock, {
      kind: 'gold', sourceId: 'mine:a', amount: 5, unitValue: 20, eventId: 'ev:1',
    })
    expect(result).toEqual({ ok: false, reason: 'insufficient-source' })
    expect(stock.query('gold')).toBe(10)
  })

  it('rejects realizing more than aggregate stock even when the source ledger covers it', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 3 })
    accounting.addAttributed('gold', 10, 'mine:a')
    const result = accounting.realize(stock, {
      kind: 'gold', sourceId: 'mine:a', amount: 5, unitValue: 20, eventId: 'ev:1',
    })
    expect(result).toEqual({ ok: false, reason: 'insufficient-stock' })
    expect(accounting.unrealized('mine:a', 'gold')).toBe(10)
  })

  it('an unrelated source never accrues another source\'s entitlement', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    accounting.establishEntitlement({ sourceId: 'mine:b', beneficiary: PLAYER, shareBps: 2000 })
    accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 5, unitValue: 10, eventId: 'ev:1' })
    const entitlementId = sourceEntitlementId('mine:b', PLAYER)
    expect(accounting.claimable(entitlementId)).toBe(0)
  })

  it('replays the committed result for a repeated eventId without mutating stock or accrual again', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    const entitlement = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 2000 })
    const first = accounting.realize(stock, {
      kind: 'gold', sourceId: 'mine:a', amount: 4, unitValue: 20, eventId: 'ev:1',
    })
    const second = accounting.realize(stock, {
      kind: 'gold', sourceId: 'mine:a', amount: 4, unitValue: 20, eventId: 'ev:1',
    })
    expect(second).toEqual({ ...first, replay: true })
    expect(stock.query('gold')).toBe(6)
    expect(accounting.claimable(entitlement.id)).toBe(16)
  })

  it('a partial realization keeps sum(source unrealized) <= aggregate stock', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 20 })
    accounting.addAttributed('gold', 12, 'mine:a')
    accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 5, unitValue: 10, eventId: 'ev:1' })
    expect(accounting.unrealized('mine:a', 'gold')).toBeLessThanOrEqual(stock.query('gold'))
  })
})

describe('SourceAccounting entitlements', () => {
  it('establishing the same agreement twice returns the existing entitlement, not a duplicate', () => {
    const accounting = createSourceAccounting()
    const a = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 2000 })
    const b = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 3000 })
    expect(b).toBe(a)
    expect(b.shareBps).toBe(2000)
  })

  it('accrues an entitlement exactly once per realization', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    const entitlement = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 2000 })
    accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 10, unitValue: 20, eventId: 'ev:1' })
    // grossValue = 200, 20% = 40 exactly
    expect(accounting.claimable(entitlement.id)).toBe(40)
    accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 10, unitValue: 20, eventId: 'ev:1' })
    expect(accounting.claimable(entitlement.id)).toBe(40)
  })

  it('20% remainder across many small realizations equals 20% of the aggregate within integer coin semantics', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 1000 })
    accounting.addAttributed('gold', 1000, 'mine:a')
    const entitlement = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 1234 })
    let totalGross = 0
    for (let i = 0; i < 37; i++) {
      const result = accounting.realize(stock, {
        kind: 'gold', sourceId: 'mine:a', amount: 1, unitValue: 7, eventId: `ev:${i}`,
      })
      if (result.ok) totalGross += result.grossValue
    }
    const expected = Math.floor(totalGross * 1234 / 10_000)
    expect(accounting.claimable(entitlement.id)).toBe(expected)
  })
})

describe('SourceAccounting claim boundary', () => {
  it('claim is idempotent for a repeated operationId', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    const entitlement = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 2000 })
    accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 10, unitValue: 20, eventId: 'ev:1' })
    const first = accounting.commitClaim(entitlement.id, 'op:1', 40)
    const second = accounting.commitClaim(entitlement.id, 'op:1', 40)
    expect(first).toEqual({ ok: true, amount: 40, replay: false })
    expect(second).toEqual({ ok: true, amount: 40, replay: true })
    expect(accounting.claimable(entitlement.id)).toBe(0)
  })

  it('cannot claim more than accrued', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    const entitlement = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 2000 })
    accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 10, unitValue: 20, eventId: 'ev:1' })
    expect(accounting.commitClaim(entitlement.id, 'op:1', 999)).toEqual({ ok: false, reason: 'insufficient-accrued' })
    expect(accounting.claimable(entitlement.id)).toBe(40)
  })

  it('claiming a missing entitlement fails without throwing', () => {
    const accounting = createSourceAccounting()
    expect(accounting.commitClaim('entitlement:missing', 'op:1', 1)).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('SourceAccounting.snapshot', () => {
  it('is undefined when nothing has happened yet', () => {
    const accounting = createSourceAccounting()
    expect(accounting.snapshot()).toBeUndefined()
  })

  it('round-trips unrealized ledger, entitlements and realizations', () => {
    const accounting = createSourceAccounting()
    const stock = new EconomicStock({ gold: 10 })
    accounting.addAttributed('gold', 10, 'mine:a')
    const entitlement = accounting.establishEntitlement({ sourceId: 'mine:a', beneficiary: PLAYER, shareBps: 2000 })
    accounting.realize(stock, { kind: 'gold', sourceId: 'mine:a', amount: 4, unitValue: 20, eventId: 'ev:1', simTime: 3 })

    const snapshot = accounting.snapshot()!
    expect(snapshot.unrealized).toEqual({ 'mine:a': { gold: 6 } })
    expect(snapshot.entitlements).toEqual([entitlement])
    expect(snapshot.realizations).toEqual([{
      eventId: 'ev:1', sourceId: 'mine:a', kind: 'gold', amount: 4, unitValue: 20, grossValue: 80, simTime: 3,
    }])

    const restored = createSourceAccounting(snapshot)
    expect(restored.unrealized('mine:a', 'gold')).toBe(6)
    expect(restored.claimable(entitlement.id)).toBe(16)
    // Replays without re-mutating stock, proving the realization record survived restore.
    const restoredStock = new EconomicStock({ gold: 6 })
    const replay = restored.realize(restoredStock, {
      kind: 'gold', sourceId: 'mine:a', amount: 4, unitValue: 20, eventId: 'ev:1',
    })
    expect(replay).toMatchObject({ ok: true, replay: true })
    expect(restoredStock.query('gold')).toBe(6)
  })

  it('legacy/empty input restores as empty accounting', () => {
    const restored = createSourceAccounting(undefined)
    expect(restored.unrealized('mine:a', 'gold')).toBe(0)
    expect(restored.snapshot()).toBeUndefined()
  })
})
