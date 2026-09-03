import { describe, expect, it, vi } from 'vitest'
import type { LiquidContainerItemInstance } from '../../items/itemInstances'
import type { PlayerActionContext } from './actionContext'
import { Inventory } from '../../items/Inventory'
import { createPlayerNeeds } from '../../player/PlayerNeeds'
import { createWaterSource } from '../../world/WaterSource'
import { createBusyAction } from '../busyAction'
import { createSurvivalActions } from './survivalActions'

function setup() {
  const emptyWaterskin: LiquidContainerItemInstance = { id: 'test-waterskin', kind: 'waterskin_medium', liquid: null, amountLitres: 0 }
  const inventory = new Inventory({}, 100, [emptyWaterskin], {}, Infinity)
  const needs = createPlayerNeeds()
  const toast = { show: vi.fn() }
  const busy = createBusyAction()

  const ctx = {
    bundle: {},
    player: { needs, mesh: { position: { x: 0, y: 0, z: 0 } } },
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
  return { actions, needs, inventory, toast }
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
