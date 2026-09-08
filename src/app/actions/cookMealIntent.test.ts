import { describe, expect, it, vi } from 'vitest'
import { createCookMealIntent } from './cookMealIntent'
import { createBusyAction } from '../busyAction'
import { Inventory } from '../../items/Inventory'
import { createHungerState } from '../../shared/HungerState'
import { type PlayerNeeds } from '../../player/PlayerNeeds'
import { createStaminaState } from '../../shared/StaminaState'
import { createThirstState } from '../../shared/ThirstState'
import { createVigorState } from '../../shared/VigorState'
import type { PlayerActionContext } from './actionContext'
import type { WorldBundle } from '../worldBundle'
import type { PlayerController } from '../../player/PlayerController'
import type { DayNightState } from '../../world/dayNight'
import type { VillageFire } from '../../settlement/VillageFire'
import { Vector3 } from 'three'

describe('createCookMealIntent', () => {
  it('cancels when fire placement is cancelled', () => {
    const intent = createTestIntent({
      placed: [],
      placementPreview: {
        start: (_kind, lifecycle) => lifecycle?.onCancelled?.(),
        cancel: () => true,
        isActive: () => false,
      },
    })

    intent.startCookMeal()
    expect(intent.isActive()).toBe(false)
  })

  it('continues from a newly placed lit fire directly to cooking', () => {
    const fire = mockFire(true)
    const consumeItem = vi.fn(() => ({ ok: true as const }))
    const startCookAt = vi.fn((_fire: VillageFire, lifecycle) => {
      lifecycle?.onComplete?.('success')
      return { ok: true as const }
    })

    const intent = createTestIntent({
      placed: [placedEntry('fire-1', fire)],
      consumeItem,
      startCookAt,
      placementPreview: {
        start: (_kind, lifecycle) => lifecycle?.onConfirmed?.({ kind: 'fireSimple', placedFireId: 'fire-1' }),
        cancel: () => true,
        isActive: () => false,
      },
    })

    intent.startCookMeal()
    expect(startCookAt).toHaveBeenCalledTimes(1)
    expect(consumeItem).toHaveBeenCalledTimes(1)
    expect(intent.isActive()).toBe(false)
  })

  it('does not eat when cooking fails', () => {
    const fire = mockFire(true)
    const consumeItem = vi.fn(() => ({ ok: true as const }))
    const startCookAt = vi.fn((_fire: VillageFire, lifecycle) => {
      lifecycle?.onComplete?.('failure')
      return { ok: true as const }
    })

    const intent = createTestIntent({
      placed: [placedEntry('fire-1', fire)],
      consumeItem,
      startCookAt,
    })

    intent.startCookMeal()
    expect(startCookAt).toHaveBeenCalledTimes(1)
    expect(consumeItem).not.toHaveBeenCalled()
    expect(intent.isActive()).toBe(false)
  })
})

function mockFire(lit: boolean): VillageFire {
  let isLit = lit
  return {
    position: new Vector3(0, 0, 0),
    isLit: () => isLit,
    isIgniting: () => false,
    getIgniteProgress: () => 1,
    getFuelRatio: () => (isLit ? 1 : 0),
    hasGrate: () => false,
    light: () => { isLit = true },
  } as VillageFire
}

function placedEntry(id: string, fire: VillageFire) {
  return { id, x: 0, z: 0, kind: 'simple' as const, grate: false, fire, everLit: true, unlitSeconds: 0, habitatBurn: false }
}

function createTestIntent(overrides: Partial<{
  placed: ReturnType<typeof placedEntry>[]
  consumeItem: (kind: unknown) => { ok: true }
  startCookAt: (fire: VillageFire, lifecycle?: { onComplete?: (outcome: 'success' | 'failure') => void }) => { ok: true }
  startIgniteFire: (fire: VillageFire, lifecycle?: { onComplete?: (outcome: 'success' | 'failure') => void }) => { ok: true }
  placementPreview: { start: (kind: 'fireSimple', lifecycle?: { onConfirmed?: (result: { kind: 'fireSimple', placedFireId: string }) => void, onCancelled?: () => void }) => void, cancel: () => boolean, isActive: () => boolean }
}>) {
  const inventory = new Inventory({ raw_meat: 1, roasted_meat: 1 })
  const player = {
    mesh: { position: new Vector3(0, 0, 0) },
    needs: testNeeds(50),
  } as PlayerController
  const placed = overrides.placed ?? [placedEntry('fire-1', mockFire(true))]

  const bundle = {
    placedFires: {
      list: () => placed,
    },
    settlementsManager: {
      getLoaded: () => [],
    },
  } as unknown as WorldBundle

  const busy = createBusyAction()
  const ctx = {
    busy,
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
  } as PlayerActionContext

  return createCookMealIntent({
    ctx,
    bundle,
    player,
    inventory,
    dayNight: { elapsedDays: 0 } as DayNightState,
    survival: {
      startIgniteFire: (overrides.startIgniteFire ?? (() => ({ ok: true as const }))) as never,
      startCookAt: (overrides.startCookAt ?? (() => ({ ok: true as const }))) as never,
      consumeItem: (overrides.consumeItem ?? (() => ({ ok: true as const }))) as never,
    },
    placementPreview: (overrides.placementPreview ?? {
      start: () => {},
      cancel: () => false,
      isActive: () => false,
    }) as never,
    busy,
    toast: { show: () => {} },
  })
}

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
