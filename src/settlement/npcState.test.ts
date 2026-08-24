import { describe, expect, it } from 'vitest'
import { damageHealth } from '../shared/HealthState'
import { createNpcAuthoritativeState, createNpcStateRegistry } from './npcState'

describe('createNpcStateRegistry', () => {
  it('hydrates the same state object when an npc id is seen again (agent dispose/recreate)', () => {
    const registry = createNpcStateRegistry()
    const first = registry.getOrCreate('0_0:npc:0', 0)
    first.health.currentHp = 42
    first.needs.hunger = 0.8

    const again = registry.getOrCreate('0_0:npc:0', 0)
    expect(again).toBe(first)
    expect(again.health.currentHp).toBe(42)
    expect(again.needs.hunger).toBe(0.8)
  })

  it('keeps different npc ids on separate state', () => {
    const registry = createNpcStateRegistry()
    const a = registry.getOrCreate('0_0:npc:0', 0)
    const b = registry.getOrCreate('0_0:npc:1', 1)
    a.health.currentHp = 10
    expect(b.health.currentHp).not.toBe(10)
  })

  it('a dead npc reconstructed from the same registry stays dead, not a fresh alive default', () => {
    const registry = createNpcStateRegistry()
    const state = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(state.health, state.health.maxHp)
    expect(state.health.dead).toBe(true)

    // Same npc id "recreated" — must hydrate from the same object, not
    // fabricate a fresh alive one (plan 197 §5).
    const rehydrated = registry.getOrCreate('0_0:npc:0', 0)
    expect(rehydrated.health.dead).toBe(true)
    expect(rehydrated.health.currentHp).toBe(0)
  })

  it('serializes into plain data that seeds a fresh registry with matching (but distinct) state — WorldBundle rebuild carry', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    damageHealth(state.health, state.health.maxHp)
    state.stamina.current = 5
    state.vigor.current = 12
    state.needs.hunger = 0.6

    const snapshot = before.serialize()
    const after = createNpcStateRegistry(snapshot)
    const hydrated = after.getOrCreate('0_0:npc:0', 0)

    expect(hydrated).not.toBe(state)
    expect(hydrated.health.dead).toBe(true)
    expect(hydrated.health.currentHp).toBe(0)
    expect(hydrated.stamina.current).toBe(5)
    expect(hydrated.vigor.current).toBe(12)
    expect(hydrated.needs.hunger).toBe(0.6)
  })

  it('a genuinely new npc id not present in a carried snapshot gets fresh initial state', () => {
    const registry = createNpcStateRegistry({})
    const state = registry.getOrCreate('0_0:npc:0', 0)
    expect(state.health.dead).toBe(false)
    expect(state.health.currentHp).toBe(state.health.maxHp)
  })

  it('clear() drops every state so the next getOrCreate starts fresh', () => {
    const registry = createNpcStateRegistry()
    const state = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(state.health, state.health.maxHp)
    registry.clear()
    const again = registry.getOrCreate('0_0:npc:0', 0)
    expect(again.health.dead).toBe(false)
  })

  it('defaults to the flat 100/100/100 baseline when no physical maxima is given', () => {
    const state = createNpcAuthoritativeState('npc:0', 0)
    expect(state.health.maxHp).toBe(100)
    expect(state.stamina.max).toBe(100)
    expect(state.vigor.max).toBe(100)
  })

  it('uses generated physical-profile maxima for a genuinely new npc id (plan npc-001)', () => {
    const registry = createNpcStateRegistry()
    const maxima = { maxHp: 88, maxStamina: 77, maxVigor: 66 }
    const state = registry.getOrCreate('0_0:npc:0', 0, maxima)
    expect(state.health.maxHp).toBe(88)
    expect(state.health.currentHp).toBe(88)
    expect(state.stamina.max).toBe(77)
    expect(state.stamina.current).toBe(77)
    expect(state.vigor.max).toBe(66)
    expect(state.vigor.current).toBe(66)
  })

  it('hydration of an already-known npc id ignores newly supplied maxima (plan 197 lifecycle continuity)', () => {
    const registry = createNpcStateRegistry()
    const first = registry.getOrCreate('0_0:npc:0', 0, { maxHp: 88, maxStamina: 77, maxVigor: 66 })
    const rehydrated = registry.getOrCreate('0_0:npc:0', 0, { maxHp: 40, maxStamina: 40, maxVigor: 40 })
    expect(rehydrated).toBe(first)
    expect(rehydrated.health.maxHp).toBe(88)
    expect(rehydrated.stamina.max).toBe(77)
    expect(rehydrated.vigor.max).toBe(66)
  })
})
