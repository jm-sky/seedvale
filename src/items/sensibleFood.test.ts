import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { resolveSensibleFoodKind } from './sensibleFood'
import { createHungerState } from '../shared/HungerState'
import { type PlayerNeeds } from '../player/PlayerNeeds'
import { createStaminaState } from '../shared/StaminaState'
import { createThirstState } from '../shared/ThirstState'
import { createVigorState } from '../shared/VigorState'

describe('resolveSensibleFoodKind', () => {
  it('returns null when no hunger-food is available', () => {
    const inventory = new Inventory({ bandage: 1 })
    const needs = testNeeds(50)
    expect(resolveSensibleFoodKind(inventory, needs, 0)).toBeNull()
  })

  it('excludes non-hunger consumables and spoiled food', () => {
    const inventory = new Inventory({ bandage: 1, mushroom: 1 })
    inventory.addWithFreshness('apple', 1, [{ count: 1, acquiredAtDays: 0, accumulatedEffectiveAge: 999, lastCheckpointDays: 0, decayModifier: 1 }], 100)
    const needs = testNeeds(50)
    expect(resolveSensibleFoodKind(inventory, needs, 0)).toBe('mushroom')
  })

  it('prefers the most urgent valid freshness and then lower overfill', () => {
    const inventory = new Inventory()
    inventory.addWithFreshness('apple', 1, [{ count: 1, acquiredAtDays: 0, accumulatedEffectiveAge: 0, lastCheckpointDays: 0, decayModifier: 1 }], 0)
    inventory.addWithFreshness('apple', 1, [{ count: 1, acquiredAtDays: 0, accumulatedEffectiveAge: 1.5, lastCheckpointDays: 0, decayModifier: 1 }], 0)
    const needs = testNeeds(90)
    expect(resolveSensibleFoodKind(inventory, needs, 1)).toBe('apple')
  })

  it('uses stable kind ordering as the final tie-break', () => {
    const inventory = new Inventory({ apple: 1, mushroom: 1 })
    const needs = testNeeds(50)
    expect(resolveSensibleFoodKind(inventory, needs, 0)).toBe('apple')
  })
})

function testNeeds(current: number): PlayerNeeds {
  const hunger = createHungerState(100)
  hunger.current = current
  return {
    stamina: createStaminaState(100),
    vigor: createVigorState(100),
    hunger,
    thirst: createThirstState(100),
    starvationDuration: 0,
    dehydrationDuration: 0,
  }
}
