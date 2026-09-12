import { describe, expect, it } from 'vitest'
import { renownFactor } from './animalDeeds'
import {
  ANIMAL_DEED_NEWS_TTL_DAYS,
  createSocialNewsLedger,
  MAX_PENDING_SOCIAL_NEWS_EVENTS,
  SOCIAL_NEWS_RELAY_FACTOR,
  type SocialNewsSignal,
} from './SocialNewsLedger'

const WOLF_SIGNAL: SocialNewsSignal = { reputation: { competence: 2, courage: 2 }, renown: 2 }
const BEAR_SIGNAL: SocialNewsSignal = { reputation: { competence: 4, courage: 5 }, renown: 5 }

describe('SocialNewsLedger — origin attenuation (plan §9.1)', () => {
  it('gives a loaded settlement at the origin the full unattenuated signal', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 10)
    const [consequence] = ledger.catchUpSettlement({ id: 'home', x: 0, z: 0 }, 10)
    expect(consequence).toEqual({ settlementId: 'home', reputation: { competence: 2, courage: 2 }, renown: 2 })
  })

  it('drops reputation but can keep renown between 1500 and 3000m from origin', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 10)
    const [consequence] = ledger.catchUpSettlement({ id: 'far', x: 2000, z: 0 }, 10)
    expect(consequence?.reputation).toBeUndefined()
    expect(consequence?.renown).toBeGreaterThan(0)
  })

  it('produces no consequence beyond the influence distance', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 10)
    const result = ledger.catchUpSettlement({ id: 'too-far', x: 3001, z: 0 }, 10)
    expect(result).toEqual([])
  })
})

describe('SocialNewsLedger — lazy catch-up (plan §7/§8)', () => {
  it('an event survives with no loaded settlement nearby and resolves later', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 10)
    // No settlement close enough yet.
    expect(ledger.catchUpSettlement({ id: 'far', x: 10000, z: 0 }, 10)).toEqual([])
    // A settlement later comes within range.
    const [consequence] = ledger.catchUpSettlement({ id: 'home', x: 100, z: 0 }, 11)
    expect(consequence?.settlementId).toBe('home')
    expect(consequence?.renown).toBeGreaterThan(0)
  })

  it('repeated catch-up for the same settlement is a no-op', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 10)
    const first = ledger.catchUpSettlement({ id: 'home', x: 0, z: 0 }, 10)
    expect(first).toHaveLength(1)
    const second = ledger.catchUpSettlement({ id: 'home', x: 0, z: 0 }, 11)
    expect(second).toEqual([])
  })

  it('does not depend on LocationKnowledge or any player-discovery state — a bare id/x/z ref is enough', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 0)
    const [consequence] = ledger.catchUpSettlement({ id: 'undiscovered-village', x: 0, z: 0 }, 0)
    expect(consequence?.settlementId).toBe('undiscovered-village')
  })
})

describe('SocialNewsLedger — propagation / relay (plan §9.2)', () => {
  it('a mid-distance settlement becomes a carrier from origin, and a farther one out of direct range gets a relayed renown instead', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 0)
    // 2500m from origin: renownFactor(2500) = 0.2 -> renown = 5 * 0.2 = 1.
    const [zeta] = ledger.catchUpSettlement({ id: 'zeta', x: 2500, z: 0 }, 0)
    expect(zeta?.renown).toBe(1)

    // 3000m from origin: direct renownFactor is exactly 0. 500m from `zeta`:
    // renownFactor(500) = 1, so the only viable source is the relay through
    // `zeta`: 1 * 1 * SOCIAL_NEWS_RELAY_FACTOR = 0.75 -> rounds to 1.
    const [alpha] = ledger.catchUpSettlement({ id: 'alpha', x: 3000, z: 0 }, 1)
    expect(alpha?.renown).toBe(Math.round(1 * SOCIAL_NEWS_RELAY_FACTOR))
  })

  it('does not sum multiple carriers for the same event — picks the single best source instead of adding them up', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 0)
    ledger.catchUpSettlement({ id: 'a', x: 0, z: 0 }, 0)
    ledger.catchUpSettlement({ id: 'b', x: 0, z: 0 }, 0)
    const [c] = ledger.catchUpSettlement({ id: 'c', x: 0, z: 0 }, 0)
    // Full-strength origin signal (5) wins — never 5 + 3.75 + 3.75 from summing every source.
    expect(c?.renown).toBe(5)
  })

  it('deterministic best-source selection does not depend on carrier insertion order', () => {
    const ledgerA = createSocialNewsLedger()
    ledgerA.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 0)
    ledgerA.catchUpSettlement({ id: 'near', x: 100, z: 0 }, 0)
    ledgerA.catchUpSettlement({ id: 'mid', x: 800, z: 0 }, 0)
    const [target1] = ledgerA.catchUpSettlement({ id: 'target', x: 900, z: 0 }, 0)

    const ledgerB = createSocialNewsLedger()
    ledgerB.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 0)
    ledgerB.catchUpSettlement({ id: 'mid', x: 800, z: 0 }, 0)
    ledgerB.catchUpSettlement({ id: 'near', x: 100, z: 0 }, 0)
    const [target2] = ledgerB.catchUpSettlement({ id: 'target', x: 900, z: 0 }, 0)

    expect(target1?.renown).toBe(target2?.renown)
  })

  it('local reputation dimensions stay zero for a relay-only settlement outside origin-local range, even though renown still arrives', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 0)
    ledger.catchUpSettlement({ id: 'a', x: 0, z: 0 }, 0)
    // Far from origin (beyond reputation's 1500m range) but close to carrier `a`.
    const [consequence] = ledger.catchUpSettlement({ id: 'b', x: 2000, z: 0 }, 1)
    expect(consequence?.reputation).toBeUndefined()
    expect(consequence?.renown).toBeGreaterThan(0)
  })

  it('a settlement processed before a nearer carrier exists still benefits within one catchUpSettlements call (bounded fixpoint)', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 0)
    // Sorted processing order is alphabetical ('alpha' before 'zeta'), so
    // without the fixpoint pass `alpha` would be evaluated before `zeta`
    // exists as a carrier and see nothing (it's beyond direct influence
    // distance on its own).
    const results = ledger.catchUpSettlements(
      [
        { id: 'alpha', x: 3000, z: 0 },
        { id: 'zeta', x: 2500, z: 0 },
      ],
      0,
    )
    const forAlpha = results.find((c) => c.settlementId === 'alpha')
    expect(forAlpha?.renown).toBeGreaterThan(0)
  })

  it('an attenuated-to-zero relay does not keep propagating further', () => {
    const ledger = createSocialNewsLedger()
    const weak: SocialNewsSignal = { reputation: {}, renown: 1 }
    ledger.enqueue(weak, { x: 0, z: 0 }, 0)
    ledger.catchUpSettlement({ id: 'a', x: 0, z: 0 }, 0)
    // Beyond MAX_ANIMAL_DEED_INFLUENCE_DISTANCE from both origin and `a`.
    const result = ledger.catchUpSettlement({ id: 'b', x: 3001, z: 0 }, 1)
    expect(result).toEqual([])
  })

  it('renownFactor sanity check backing the hand-computed expectations above', () => {
    expect(renownFactor(2500)).toBeCloseTo(0.2, 5)
    expect(renownFactor(500)).toBe(1)
    expect(renownFactor(3000)).toBe(0)
  })
})

describe('SocialNewsLedger — TTL / bounded queue (plan §11)', () => {
  it('an event resolves before expiry and not after', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 0)
    expect(ledger.catchUpSettlement({ id: 'a', x: 0, z: 0 }, ANIMAL_DEED_NEWS_TTL_DAYS)).toHaveLength(1)

    const ledger2 = createSocialNewsLedger()
    ledger2.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 0)
    expect(ledger2.catchUpSettlement({ id: 'a', x: 0, z: 0 }, ANIMAL_DEED_NEWS_TTL_DAYS + 0.001)).toEqual([])
  })

  it('prune removes expired events', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 0)
    ledger.prune(ANIMAL_DEED_NEWS_TTL_DAYS + 1)
    expect(ledger.serialize().events).toEqual([])
  })

  it('caps pending events, dropping the oldest deterministically', () => {
    const ledger = createSocialNewsLedger()
    const total = MAX_PENDING_SOCIAL_NEWS_EVENTS + 10
    // Small increments keep every event well under the TTL window so only
    // the cap (not expiry) is under test, while still giving each event a
    // distinct `occurredAtDays` to verify the oldest-first drop order.
    for (let i = 0; i < total; i++) {
      ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, i / 1000)
    }
    const snapshot = ledger.serialize()
    expect(snapshot.events).toHaveLength(MAX_PENDING_SOCIAL_NEWS_EVENTS)
    const oldest = Math.min(...snapshot.events.map((e) => e.occurredAtDays))
    expect(oldest).toBeCloseTo(10 / 1000, 5)
  })
})

describe('SocialNewsLedger — persistence (plan §13)', () => {
  it('round-trips a pending event including carriers and dedupe through serialize/restore', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(BEAR_SIGNAL, { x: 0, z: 0 }, 5)
    // 2500m from origin, becomes a carrier with renownSignal 1.0 (5 * 0.2).
    ledger.catchUpSettlement({ id: 'home', x: 2500, z: 0 }, 5)

    const snapshot = ledger.serialize()
    const restored = createSocialNewsLedger(snapshot)

    // Already-applied settlement stays deduped after restore.
    expect(restored.catchUpSettlement({ id: 'home', x: 2500, z: 0 }, 6)).toEqual([])
    // A settlement beyond direct influence distance but close to the
    // restored carrier proves the carrier itself survived the round-trip.
    const [consequence] = restored.catchUpSettlement({ id: 'neighbor', x: 3000, z: 0 }, 6)
    expect(consequence?.settlementId).toBe('neighbor')
    expect(consequence?.renown).toBe(1)
  })

  it('an older save with no socialNews restores as an empty ledger', () => {
    const ledger = createSocialNewsLedger(undefined)
    expect(ledger.serialize()).toEqual({ nextEventId: 0, events: [] })
  })

  it('reset() clears every pending event, same contract as New Game', () => {
    const ledger = createSocialNewsLedger()
    ledger.enqueue(WOLF_SIGNAL, { x: 0, z: 0 }, 0)
    ledger.reset()
    expect(ledger.serialize()).toEqual({ nextEventId: 0, events: [] })
  })
})
