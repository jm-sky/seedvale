import { describe, expect, it, vi } from 'vitest'
import type { LiquidContainerItemInstance } from '../../items/itemInstances'
import type { PlayerActionContext } from './actionContext'
import { Inventory } from '../../items/Inventory'
import { createPlayerNeeds } from '../../player/PlayerNeeds'
import { createHealthState } from '../../shared/HealthState'
import { createWaterSource, type WaterSource } from '../../world/WaterSource'
import { createBusyAction } from '../busyAction'
import { createSurvivalActions, type FeedableAnimal, feedAnimal } from './survivalActions'

function setup() {
  const emptyWaterskin: LiquidContainerItemInstance = { id: 'test-waterskin', kind: 'waterskin_medium', liquid: null, amountLitres: 0 }
  const inventory = new Inventory({}, 100, [emptyWaterskin], {}, Infinity)
  const needs = createPlayerNeeds()
  const health = createHealthState(100)
  const toast = { show: vi.fn() }
  const busy = createBusyAction()

  const ctx = {
    bundle: {},
    player: { needs, health, mesh: { position: { x: 0, y: 0, z: 0 } } },
    inventory,
    heldTool: {},
    hud: { setInventoryWeight: vi.fn() },
    toast,
    busy,
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
    dayNight: { elapsedDays: 0, dayLengthSec: 600 },
    worldAudio: { playAt: vi.fn(), playOnce: vi.fn() },
    onInventoryChanged: vi.fn(),
  } as unknown as PlayerActionContext

  const actions = createSurvivalActions(ctx)
  return { actions, needs, health, inventory, toast }
}

describe('drinkFromWaterSource (plan world-011)', () => {
  it('restores thirst without a warning for a safe source (river)', () => {
    const { actions, needs, toast } = setup()
    needs.thirst.current = 0

    const result = actions.drinkFromWaterSource(createWaterSource('river'))

    expect(result.ok).toBe(true)
    expect(needs.thirst.current).toBeGreaterThan(0)
    expect(toast.show).toHaveBeenCalledWith('Napito się wody.', undefined)
  })

  it('restores thirst with the unsafe warning for lake', () => {
    const { actions, needs, toast } = setup()
    needs.thirst.current = 0

    actions.drinkFromWaterSource(createWaterSource('lake'))

    expect(needs.thirst.current).toBeGreaterThan(0)
    expect(toast.show).toHaveBeenCalledWith('Ta woda może powodować chorobę.', 'error')
  })

  it('refuses ocean water and leaves thirst unchanged', () => {
    const { actions, needs, toast } = setup()
    needs.thirst.current = 0

    const result = actions.drinkFromWaterSource(createWaterSource('ocean'))

    expect(result.ok).toBe(false)
    expect(needs.thirst.current).toBe(0)
    expect(toast.show).toHaveBeenCalledWith('Ta woda jest słona — nie da się jej pić.', 'error')
  })
})

describe('fillWaterskin (plan world-011)', () => {
  it('fills a carried container from a river source', () => {
    const { actions, inventory } = setup()

    const result = actions.fillWaterskin(createWaterSource('river'))

    expect(result.ok).toBe(true)
    const instance = inventory.getInstances('waterskin_medium')[0] as LiquidContainerItemInstance
    expect(instance.liquid).toBe('water')
    expect(instance.amountLitres).toBeGreaterThan(0)
  })

  it('refuses to fill from an ocean source and leaves Inventory untouched', () => {
    const { actions, inventory, toast } = setup()

    const result = actions.fillWaterskin(createWaterSource('ocean'))

    expect(result.ok).toBe(false)
    const instance = inventory.getInstances('waterskin_medium')[0] as LiquidContainerItemInstance
    expect(instance.liquid).toBeNull()
    expect(instance.amountLitres).toBe(0)
    expect(toast.show).toHaveBeenCalledWith('Ta woda jest słona — nie da się jej pić.', 'error')
  })
})

describe('drinkFromWaterSource / fillWaterskin — deep well rope requirement (plan world-004 §4)', () => {
  const deepWellSource: WaterSource = { kind: 'well', quality: 'safe', requiresRope: true }

  it('refuses to drink from a deep well with no carried rope', () => {
    const { actions, needs, toast } = setup()
    needs.thirst.current = 0

    const result = actions.drinkFromWaterSource(deepWellSource)

    expect(result.ok).toBe(false)
    expect(needs.thirst.current).toBe(0)
    expect(toast.show).toHaveBeenCalledWith('Potrzebujesz liny, żeby czerpać wodę z tak głębokiej studni.', 'error')
  })

  it('refuses to fill a container from a deep well with no carried rope', () => {
    const { actions, inventory, toast } = setup()

    const result = actions.fillWaterskin(deepWellSource)

    expect(result.ok).toBe(false)
    const instance = inventory.getInstances('waterskin_medium')[0] as LiquidContainerItemInstance
    expect(instance.liquid).toBeNull()
    expect(toast.show).toHaveBeenCalledWith('Potrzebujesz liny, żeby czerpać wodę z tak głębokiej studni.', 'error')
  })

  it('drinks normally from a deep well once a rope is carried (never consumed)', () => {
    const { actions, needs, inventory } = setup()
    inventory.add('rope', 1)
    needs.thirst.current = 0

    const result = actions.drinkFromWaterSource(deepWellSource)

    expect(result.ok).toBe(true)
    expect(needs.thirst.current).toBeGreaterThan(0)
    expect(inventory.count('rope')).toBe(1)
  })

  it('a shallow well (no requiresRope) never needs a rope', () => {
    const { actions, needs } = setup()
    needs.thirst.current = 0

    const result = actions.drinkFromWaterSource(createWaterSource('well'))

    expect(result.ok).toBe(true)
    expect(needs.thirst.current).toBeGreaterThan(0)
  })
})

describe('drinkFromWaterSource — uncovered player-well consumption risk (plan world-004 §6)', () => {
  const riskySource: WaterSource = {
    kind: 'well',
    quality: 'safe',
    consumptionRisk: { chance: 1, hpDamageMin: 1, hpDamageMax: 2, vigorLoss: 5 },
  }

  it('applies HP/Vigor loss and a distinct warning when the risk triggers', () => {
    const { actions, needs, health, toast } = setup()
    needs.thirst.current = 0
    const startingVigor = needs.vigor.current
    const startingHp = health.currentHp

    const result = actions.drinkFromWaterSource(riskySource)

    expect(result.ok).toBe(true)
    expect(needs.thirst.current).toBeGreaterThan(0)
    expect(health.currentHp).toBeLessThan(startingHp)
    expect(startingHp - health.currentHp).toBeGreaterThanOrEqual(1)
    expect(startingHp - health.currentHp).toBeLessThanOrEqual(2)
    expect(needs.vigor.current).toBe(startingVigor - 5)
    expect(toast.show).toHaveBeenCalledWith('Ta woda ze studni bez daszka Ci zaszkodziła.', 'error')
  })

  it('a zero-chance risk never triggers', () => {
    const { actions, health, toast } = setup()
    const startingHp = health.currentHp

    actions.drinkFromWaterSource({ ...riskySource, consumptionRisk: { ...riskySource.consumptionRisk!, chance: 0 } })

    expect(health.currentHp).toBe(startingHp)
    expect(toast.show).toHaveBeenCalledWith('Napito się wody.', undefined)
  })

  it('a completed (roofed) well carries no consumptionRisk field at all, so no HP loss is even possible', () => {
    const { actions, health } = setup()
    const startingHp = health.currentHp

    actions.drinkFromWaterSource(createWaterSource('well'))

    expect(health.currentHp).toBe(startingHp)
  })
})

describe('feedAnimal (plan fauna-011 §6)', () => {
  function fakeAnimal(dietItems: Partial<Record<string, number>> | undefined, feedByPlayerResult = true): FeedableAnimal & { feedByPlayer: ReturnType<typeof vi.fn> } {
    return {
      def: { diet: dietItems ? { items: dietItems } : undefined },
      feedByPlayer: vi.fn(() => feedByPlayerResult),
    }
  }

  it('successful feeding consumes exactly one compatible item and relieves hunger', () => {
    const inventory = new Inventory({}, Infinity)
    inventory.add('raw_meat', 3)
    const animal = fakeAnimal({ raw_meat: 0.8 })

    const fed = feedAnimal(animal, inventory)

    expect(fed).toBe(true)
    expect(animal.feedByPlayer).toHaveBeenCalledWith('raw_meat')
    expect(animal.feedByPlayer).toHaveBeenCalledTimes(1)
    expect(inventory.has('raw_meat', 1)).toBe(true)
    expect(inventory.has('raw_meat', 3)).toBe(false)
  })

  it('no compatible item in inventory: no-op, feedByPlayer never called, nothing consumed', () => {
    const inventory = new Inventory({}, Infinity)
    inventory.add('hay', 5)
    const animal = fakeAnimal({ raw_meat: 0.8 })

    const fed = feedAnimal(animal, inventory)

    expect(fed).toBe(false)
    expect(animal.feedByPlayer).not.toHaveBeenCalled()
    expect(inventory.has('hay', 5)).toBe(true)
  })

  it('an animal with no configured diet is never fed', () => {
    const inventory = new Inventory({}, Infinity)
    inventory.add('raw_meat', 1)
    const animal = fakeAnimal(undefined)

    expect(feedAnimal(animal, inventory)).toBe(false)
    expect(animal.feedByPlayer).not.toHaveBeenCalled()
    expect(inventory.has('raw_meat', 1)).toBe(true)
  })

  it('interrupted/invalid feeding (feedByPlayer rejects) does not consume the item', () => {
    const inventory = new Inventory({}, Infinity)
    inventory.add('raw_meat', 1)
    const animal = fakeAnimal({ raw_meat: 0.8 }, false)

    const fed = feedAnimal(animal, inventory)

    expect(fed).toBe(false)
    expect(animal.feedByPlayer).toHaveBeenCalledWith('raw_meat')
    expect(inventory.has('raw_meat', 1)).toBe(true)
  })
})
