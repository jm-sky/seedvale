import { describe, expect, it } from 'vitest'
import { ECONOMIC_KINDS } from '../economy/kinds'
import {
  hitsForRichness,
  isDepleted,
  isMineableOre,
  ORE_ITEM,
  oreEconomicKind,
  recordMined,
  resolveRemaining,
  type ResourceDepletionState,
  yieldForOre,
} from './depositMining'

describe('depositMining (plan 090)', () => {
  it('maps ore types to inventory kinds', () => {
    expect(ORE_ITEM.coal).toBe('coal')
    expect(ORE_ITEM.iron).toBe('iron')
    expect(ORE_ITEM.gold).toBe('gold')
    expect(yieldForOre('iron')).toEqual({ kind: 'iron', count: 1 })
  })

  it('maps ore types to settlement raw-stock EconomicKinds by identity (plan 131)', () => {
    for (const type of ['coal', 'iron', 'gold'] as const) {
      const kind = oreEconomicKind(type)
      expect(kind).toBe(type)
      expect(ECONOMIC_KINDS).toContain(kind)
    }
  })

  it('accepts only visible ore types', () => {
    expect(isMineableOre('iron')).toBe(true)
    expect(isMineableOre('fish')).toBe(false)
  })

  it('mines copper ore through the same pipeline as iron/coal/gold (plan items-player-001)', () => {
    expect(isMineableOre('copper_ore')).toBe(true)
    expect(ORE_ITEM.copper_ore).toBe('copper_ore')
    expect(yieldForOre('copper_ore')).toEqual({ kind: 'copper_ore', count: 1 })
    const kind = oreEconomicKind('copper_ore')
    expect(kind).toBe('copper_ore')
    expect(ECONOMIC_KINDS).toContain(kind)
  })

  it('scales hits with richness into 3–7', () => {
    expect(hitsForRichness(0)).toBe(3)
    expect(hitsForRichness(1)).toBe(7)
    expect(hitsForRichness(0.5)).toBe(5)
    expect(hitsForRichness(-1)).toBe(3)
    expect(hitsForRichness(2)).toBe(7)
  })
})

describe('ResourceDepletionState (plan 198)', () => {
  it('resolveRemaining falls back to the deterministic initial value when no override exists', () => {
    const state: ResourceDepletionState = new Map()
    expect(resolveRemaining(state, 'resource_1_2', 1)).toBe(hitsForRichness(1))
  })

  it('recordMined then resolveRemaining survives a despawn/spawn cycle (partial mining)', () => {
    const state: ResourceDepletionState = new Map()
    const id = 'resource_1_2'
    const initial = resolveRemaining(state, id, 1)
    expect(initial).toBe(7)
    // mine 4 hits
    let remaining = initial
    for (let i = 0; i < 4; i++) {
      remaining -= 1
      recordMined(state, id, remaining)
    }
    expect(remaining).toBe(3)
    // simulate despawn + respawn: a fresh lookup must see the override, not
    // re-derive the initial value from richness.
    expect(resolveRemaining(state, id, 1)).toBe(3)
    expect(isDepleted(state, id)).toBe(false)
  })

  it('full depletion (remaining = 0) survives and is distinguishable from "no override"', () => {
    const state: ResourceDepletionState = new Map()
    const id = 'resource_3_4'
    recordMined(state, id, 0)
    expect(isDepleted(state, id)).toBe(true)
    expect(resolveRemaining(state, id, 1)).toBe(0)
    expect(isDepleted(state, 'resource_never_touched')).toBe(false)
  })

  it('a fresh Map (new world) resets every override', () => {
    const state: ResourceDepletionState = new Map()
    recordMined(state, 'resource_1_1', 0)
    const freshWorldState: ResourceDepletionState = new Map()
    expect(isDepleted(freshWorldState, 'resource_1_1')).toBe(false)
    expect(resolveRemaining(freshWorldState, 'resource_1_1', 0.5)).toBe(hitsForRichness(0.5))
  })

  it('player and NPC mining share the same authoritative state when they mutate the same map', () => {
    const state: ResourceDepletionState = new Map()
    const id = 'resource_5_5'
    let remaining = resolveRemaining(state, id, 0)
    remaining -= 1 // player hit
    recordMined(state, id, remaining)
    remaining -= 1 // NPC hit, reading the same authoritative state
    recordMined(state, id, remaining)
    expect(resolveRemaining(state, id, 0)).toBe(1)
  })
})
