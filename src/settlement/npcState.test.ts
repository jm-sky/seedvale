import { describe, expect, it } from 'vitest'
import { createFoodBatch } from '../items/foodFreshness'
import { createLiquidContainerInstance, fillLiquidContainer } from '../items/liquidContainer'
import { createWeaponInstance } from '../items/weaponMaintenance'
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
    state.physicalInjury = 20

    const snapshot = before.serialize()
    const after = createNpcStateRegistry(snapshot)
    const hydrated = after.getOrCreate('0_0:npc:0', 0)

    expect(hydrated).not.toBe(state)
    expect(hydrated.health.dead).toBe(true)
    expect(hydrated.health.currentHp).toBe(0)
    expect(hydrated.stamina.current).toBe(5)
    expect(hydrated.vigor.current).toBe(12)
    expect(hydrated.needs.hunger).toBe(0.6)
    expect(hydrated.physicalInjury).toBe(20)
    expect(hydrated.postDeath).toBeNull()
  })

  it('a genuinely new npc id not present in a carried snapshot gets fresh initial state', () => {
    const registry = createNpcStateRegistry({})
    const state = registry.getOrCreate('0_0:npc:0', 0)
    expect(state.health.dead).toBe(false)
    expect(state.health.currentHp).toBe(state.health.maxHp)
    expect(state.physicalInjury).toBe(0)
  })

  it('round-trips the injury recovery anchor with physicalInjury (plan npc-025)', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    state.physicalInjury = 40
    state.injuryRecoveryUpdatedAtDays = 3.25

    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:0', 0)
    expect(hydrated.physicalInjury).toBe(40)
    expect(hydrated.injuryRecoveryUpdatedAtDays).toBe(3.25)
  })

  it('an older snapshot without injuryRecoveryUpdatedAtDays still loads', () => {
    const registry = createNpcStateRegistry({
      '0_0:npc:0': {
        health: { current: 80, max: 100, dead: false },
        stamina: { current: 100, max: 100 },
        vigor: { current: 100, max: 100 },
        needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      },
    })
    expect(registry.getOrCreate('0_0:npc:0', 0).physicalInjury).toBe(0)
    expect(registry.getOrCreate('0_0:npc:0', 0).injuryRecoveryUpdatedAtDays).toBeUndefined()
    expect(registry.getOrCreate('0_0:npc:0', 0).graveVisits).toEqual([])
  })

  it('round-trips completed family grave visits (plan npc-026)', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:1', 0)
    state.graveVisits.push({ deceasedNpcId: '0_0:npc:0', lastVisitedAtDays: 12.5 })

    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:1', 0)
    expect(hydrated.graveVisits).toEqual([{ deceasedNpcId: '0_0:npc:0', lastVisitedAtDays: 12.5 }])
    expect(hydrated.graveVisits).not.toBe(state.graveVisits)
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

  it('re-derives stamina max from supplied maxima when hydrating a carried snapshot (plan npc-021)', () => {
    const snapshot = {
      '0_0:npc:0': {
        health: { current: 80, max: 100, dead: false },
        stamina: { current: 90, max: 110 },
        vigor: { current: 100, max: 100 },
        needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      },
    }
    const registry = createNpcStateRegistry(snapshot)
    const derivedMax = 106
    const state = registry.getOrCreate('0_0:npc:0', 0, { maxHp: 100, maxStamina: derivedMax, maxVigor: 100 })
    expect(state.stamina.max).toBe(derivedMax)
    expect(state.stamina.current).toBe(90)
  })

  it('clamps saved stamina current when the newly derived max is lower', () => {
    const snapshot = {
      '0_0:npc:0': {
        health: { current: 80, max: 100, dead: false },
        stamina: { current: 90, max: 110 },
        vigor: { current: 100, max: 100 },
        needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      },
    }
    const registry = createNpcStateRegistry(snapshot)
    const state = registry.getOrCreate('0_0:npc:0', 0, { maxHp: 100, maxStamina: 70, maxVigor: 100 })
    expect(state.stamina.max).toBe(70)
    expect(state.stamina.current).toBe(70)
  })

  it('does not refill stamina current when the newly derived max is higher', () => {
    const snapshot = {
      '0_0:npc:0': {
        health: { current: 80, max: 100, dead: false },
        stamina: { current: 40, max: 100 },
        vigor: { current: 100, max: 100 },
        needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      },
    }
    const registry = createNpcStateRegistry(snapshot)
    const state = registry.getOrCreate('0_0:npc:0', 0, { maxHp: 100, maxStamina: 130, maxVigor: 100 })
    expect(state.stamina.max).toBe(130)
    expect(state.stamina.current).toBe(40)
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

describe('NpcAuthoritativeState personalInventory (plan settlements-npcs-026)', () => {
  it('gives every new NPC a distinct empty Inventory', () => {
    const a = createNpcAuthoritativeState('npc:0', 0)
    const b = createNpcAuthoritativeState('npc:1', 1)
    expect(a.personalInventory.isEmpty()).toBe(true)
    expect(b.personalInventory.isEmpty()).toBe(true)
    expect(a.personalInventory).not.toBe(b.personalInventory)
    expect(a.needsInitialPersonalLoadout).toBe(true)
  })

  it('repeated getOrCreate returns the same personal inventory object without reseeding', () => {
    const registry = createNpcStateRegistry()
    const first = registry.getOrCreate('0_0:npc:0', 0)
    const knife = createWeaponInstance('knife')
    expect(first.personalInventory.addInstance(knife)).toBe(true)
    first.needsInitialPersonalLoadout = false

    const again = registry.getOrCreate('0_0:npc:0', 0)
    expect(again).toBe(first)
    expect(again.personalInventory).toBe(first.personalInventory)
    expect(again.personalInventory.getInstance(knife.id)?.id).toBe(knife.id)
    expect(again.personalInventory.countInstances('knife')).toBe(1)
  })

  it('two npc ids never share inventory contents by object aliasing', () => {
    const registry = createNpcStateRegistry()
    const a = registry.getOrCreate('0_0:npc:0', 0)
    const b = registry.getOrCreate('0_0:npc:1', 1)
    a.personalInventory.add('stone', 2)
    expect(b.personalInventory.count('stone')).toBe(0)
    expect(a.personalInventory).not.toBe(b.personalInventory)
  })

  it('serialize → createNpcStateRegistry preserves plain counts', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    state.personalInventory.add('dried_meat', 3)
    state.personalInventory.add('coin', 8)
    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:0', 0)
    expect(hydrated.personalInventory).not.toBe(state.personalInventory)
    expect(hydrated.personalInventory.count('dried_meat')).toBe(3)
    expect(hydrated.personalInventory.count('coin')).toBe(8)
    expect(hydrated.needsInitialPersonalLoadout).toBe(false)
  })

  it('round-trip preserves weapon instance id, condition and waterskin liquid', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    const knife = createWeaponInstance('knife')
    knife.durability = 0.4
    knife.sharpness = 0.7
    expect(state.personalInventory.addInstance(knife)).toBe(true)
    const filled = fillLiquidContainer(createLiquidContainerInstance('waterskin_small'), 'water')
    expect(filled).not.toBeNull()
    expect(state.personalInventory.addInstance(filled!)).toBe(true)

    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:0', 0)
    const restoredKnife = hydrated.personalInventory.getInstance(knife.id)
    expect(restoredKnife).toMatchObject({ id: knife.id, kind: 'knife', durability: 0.4, sharpness: 0.7 })
    const restoredSkin = hydrated.personalInventory.getInstance(filled!.id)
    expect(restoredSkin).toMatchObject({ id: filled!.id, kind: 'waterskin_small', liquid: 'water', amountLitres: 2 })
  })

  it('round-trip preserves food batches / provenance / decay', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    const batch = createFoodBatch(2, 3, 1, 'boar')
    expect(state.personalInventory.addWithFreshness('raw_meat', 2, [batch], 4)).toBe(true)

    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:0', 0)
    const restored = hydrated.personalInventory.getFoodBatches('raw_meat', 4)
    expect(hydrated.personalInventory.count('raw_meat')).toBe(2)
    expect(restored[0]).toMatchObject({
      count: 2,
      acquiredAtDays: 3,
      sourceSpecies: 'boar',
    })
  })

  it('legacy snapshot without personalInventory restores empty and does not latch a loadout seed', () => {
    const registry = createNpcStateRegistry({
      '0_0:npc:0': {
        health: { current: 80, max: 100, dead: false },
        stamina: { current: 100, max: 100 },
        vigor: { current: 100, max: 100 },
        needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      },
    })
    const state = registry.getOrCreate('0_0:npc:0', 0)
    expect(state.personalInventory.isEmpty()).toBe(true)
    expect(state.needsInitialPersonalLoadout).toBe(false)
  })
})

describe('NpcAuthoritativeState transportCargo (plan settlements-npcs-019)', () => {
  it('gives every new NPC a distinct empty transport cargo inventory', () => {
    const registry = createNpcStateRegistry()
    const a = registry.getOrCreate('0_0:npc:a', 0)
    const b = registry.getOrCreate('0_0:npc:b', 0)
    expect(a.transportCargo.isEmpty()).toBe(true)
    expect(b.transportCargo.isEmpty()).toBe(true)
    expect(a.transportCargo).not.toBe(b.transportCargo)
    expect(a.transportCargo).not.toBe(a.personalInventory)
  })

  it('repeated getOrCreate returns the same transport cargo object — survives NpcAgent dispose/recreate', () => {
    const registry = createNpcStateRegistry()
    const first = registry.getOrCreate('0_0:npc:0', 0)
    first.transportCargo.add('carrot', 3)
    const again = registry.getOrCreate('0_0:npc:0', 0)
    expect(again.transportCargo).toBe(first.transportCargo)
    expect(again.transportCargo.count('carrot')).toBe(3)
  })

  it('serialize → createNpcStateRegistry preserves cargo across reconstruction (WorldBundle rebuild carry)', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    state.transportCargo.add('carrot', 5)

    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:0', 0)
    expect(hydrated.transportCargo).not.toBe(state.transportCargo)
    expect(hydrated.transportCargo.count('carrot')).toBe(5)
  })

  it('round-trip preserves freshness batches like personalInventory does', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    const batch = createFoodBatch(4, 3, 1, 'boar')
    expect(state.transportCargo.addWithFreshness('raw_meat', 4, [batch], 4)).toBe(true)

    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:0', 0)
    expect(hydrated.transportCargo.count('raw_meat')).toBe(4)
    expect(hydrated.transportCargo.getFoodBatches('raw_meat', 4)[0]).toMatchObject({
      count: 4,
      acquiredAtDays: 3,
      sourceSpecies: 'boar',
    })
  })

  it('never reconstructs cargo from a legacy snapshot without transportCargo', () => {
    const registry = createNpcStateRegistry({
      '0_0:npc:0': {
        health: { current: 100, max: 100, dead: false },
        stamina: { current: 100, max: 100 },
        vigor: { current: 100, max: 100 },
        needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      },
    })
    const state = registry.getOrCreate('0_0:npc:0', 0)
    expect(state.transportCargo.isEmpty()).toBe(true)
  })
})
