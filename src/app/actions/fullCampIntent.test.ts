import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { PlayerController } from '../../player/PlayerController'
import type { VillageFire } from '../../settlement/VillageFire'
import type { DayNightState } from '../../world/dayNight'
import type { WorldBundle } from '../worldBundle'
import type { PlayerActionContext } from './actionContext'
import type { PlacementPreviewConfirmResult, PlacementPreviewLifecycle } from './placementPreviewActions'
import { Inventory } from '../../items/Inventory'
import { createBusyAction } from '../busyAction'
import { createFullCampIntent } from './fullCampIntent'

describe('createFullCampIntent', () => {
  it('reuses an existing tent and ignites an unlit player fire', () => {
    const fire = mockFire(false)
    const startIgniteFire = vi.fn((_fire: VillageFire, lifecycle?: { onComplete?: (outcome: 'success' | 'failure') => void }) => {
      lifecycle?.onComplete?.('success')
      return { ok: true as const }
    })
    const intent = createTestIntent({
      tents: [tentEntry('tent-1')],
      fires: [placedFire('fire-1', fire)],
      startIgniteFire,
    })

    intent.startFullCamp()
    expect(startIgniteFire).toHaveBeenCalledTimes(1)
    expect(intent.isActive()).toBe(false)
  })

  it('reuses a lit fire without igniting', () => {
    const startIgniteFire = vi.fn(() => ({ ok: true as const }))
    const intent = createTestIntent({
      tents: [tentEntry('tent-1')],
      fires: [placedFire('fire-1', mockFire(true))],
      startIgniteFire,
    })

    intent.startFullCamp()
    expect(startIgniteFire).not.toHaveBeenCalled()
    expect(intent.isActive()).toBe(false)
  })

  it('places a tent when none exists, then continues after Busy completion', () => {
    const tents: ReturnType<typeof tentEntry>[] = []
    const start = vi.fn((_kind: string, lifecycle?: PlacementPreviewLifecycle) => {
      tents.push(tentEntry('tent-new'))
      lifecycle?.onConfirmed?.({ kind: 'tent', placedId: 'tent-new' })
    })
    const intent = createTestIntent({
      inventory: { tent: 1, branch: 2 },
      tents,
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(start).toHaveBeenCalledWith('tent', expect.anything())
    expect(intent.isActive()).toBe(false)
  })

  it('skips tent when materials are missing and reuses an existing bedroll', () => {
    const start = vi.fn()
    const intent = createTestIntent({
      inventory: {},
      bedrolls: [bedrollEntry('bed-1')],
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(start).not.toHaveBeenCalled()
    expect(intent.isActive()).toBe(false)
  })

  it('cancels without rollback when placement is cancelled', () => {
    const start = vi.fn((_kind: string, lifecycle?: PlacementPreviewLifecycle) => {
      lifecycle?.onCancelled?.()
    })
    const intent = createTestIntent({
      inventory: { tent: 1 },
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(intent.isActive()).toBe(false)
  })

  it('ends when ignition cannot start, leaving placed components', () => {
    const startIgniteFire = vi.fn(() => ({ ok: false as const, missing: [] as [] }))
    const tents = [tentEntry('tent-1')]
    const intent = createTestIntent({
      tents,
      fires: [placedFire('fire-1', mockFire(false))],
      startIgniteFire,
    })

    intent.startFullCamp()
    expect(tents).toHaveLength(1)
    expect(intent.isActive()).toBe(false)
  })

  it('does not start when nothing nearby exists and no rest components can be built', () => {
    const toast = vi.fn()
    const intent = createTestIntent({
      inventory: {},
      toast: { show: toast },
    })

    intent.startFullCamp()
    expect(toast).toHaveBeenCalled()
    expect(intent.isActive()).toBe(false)
  })

  it('does not duplicate an existing tent', () => {
    const start = vi.fn((_kind: string, lifecycle?: PlacementPreviewLifecycle) => {
      if (_kind === 'tent') lifecycle?.onConfirmed?.({ kind: 'tent', placedId: 'should-not' } as PlacementPreviewConfirmResult)
    })
    const intent = createTestIntent({
      inventory: { tent: 1, hide: 3, branch: 8 },
      tents: [tentEntry('tent-1')],
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(start.mock.calls.every((call) => call[0] !== 'tent')).toBe(true)
  })

  it('skips platform when materials are missing and continues to bedroll', () => {
    const kinds: string[] = []
    const bedrolls = [bedrollEntry('bed-1')]
    const start = vi.fn((kind: string, lifecycle?: PlacementPreviewLifecycle) => {
      kinds.push(kind)
      if (kind === 'bedroll') lifecycle?.onConfirmed?.({ kind: 'bedroll', placedId: 'bed-1' })
    })
    const intent = createTestIntent({
      inventory: { tent: 1, hide: 3 },
      tents: [tentEntry('tent-1')],
      bedrolls,
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(kinds).not.toContain('platform')
  })

  it('skips bedroll when materials are missing', () => {
    const kinds: string[] = []
    const start = vi.fn((kind: string) => { kinds.push(kind) })
    const intent = createTestIntent({
      inventory: { tent: 1, branch: 6 },
      tents: [tentEntry('tent-1')],
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(kinds).not.toContain('bedroll')
  })

  it('reuses an existing bedroll and does not place another', () => {
    const start = vi.fn()
    const intent = createTestIntent({
      inventory: { hide: 3 },
      bedrolls: [bedrollEntry('bed-1')],
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(start.mock.calls.every((call) => call[0] !== 'bedroll')).toBe(true)
  })

  it('places tent, platform, bedroll and fire in order when everything is available', () => {
    const kinds: string[] = []
    const tents: ReturnType<typeof tentEntry>[] = []
    const platforms: ReturnType<typeof tentEntry>[] = []
    const bedrolls: ReturnType<typeof bedrollEntry>[] = []
    const fires: ReturnType<typeof placedFire>[] = []
    const start = vi.fn((kind: string, lifecycle?: PlacementPreviewLifecycle) => {
      kinds.push(kind)
      if (kind === 'tent') {
        tents.push(tentEntry('tent-new'))
        lifecycle?.onConfirmed?.({ kind: 'tent', placedId: 'tent-new' })
      }
      if (kind === 'platform') {
        platforms.push({ ...tentEntry('plat-new'), yaw: 0 })
        lifecycle?.onConfirmed?.({ kind: 'platform', placedId: 'plat-new' })
      }
      if (kind === 'bedroll') {
        bedrolls.push(bedrollEntry('bed-new'))
        lifecycle?.onConfirmed?.({ kind: 'bedroll', placedId: 'bed-new' })
      }
      if (kind === 'fireSimple') {
        fires.push(placedFire('fire-new', mockFire(true)))
        lifecycle?.onConfirmed?.({ kind: 'fireSimple', placedFireId: 'fire-new' })
      }
    })
    const intent = createTestIntent({
      inventory: { tent: 1, hide: 3, branch: 8, firestarter: 1 },
      tents,
      platforms,
      bedrolls,
      fires,
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })

    intent.startFullCamp()
    expect(kinds).toEqual(['tent', 'platform', 'bedroll', 'fireSimple'])
    expect(intent.isActive()).toBe(false)
  })

  it('skips a later component when inventory is spent between steps', () => {
    const kinds: string[] = []
    const tents: ReturnType<typeof tentEntry>[] = []
    const inventory = new Inventory({ tent: 1, hide: 3, branch: 2 })
    const start = vi.fn((kind: string, lifecycle?: PlacementPreviewLifecycle) => {
      kinds.push(kind)
      if (kind === 'tent') {
        inventory.remove('hide', 3)
        tents.push(tentEntry('tent-new'))
        lifecycle?.onConfirmed?.({ kind: 'tent', placedId: 'tent-new' })
      }
    })
    const intent = createTestIntent({
      inventory,
      tents,
      placementPreview: { start, cancel: () => true, isActive: () => false },
    })
    intent.startFullCamp()
    expect(kinds[0]).toBe('tent')
    expect(kinds).not.toContain('bedroll')
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

function tentEntry(id: string) {
  return { id, x: 0, z: 0, yaw: 0, condition: 100, lastConditionUpdateAtDays: 0, mesh: {} }
}

function bedrollEntry(id: string) {
  return { id, x: 0, z: 0, yaw: 0, variant: 'leather' as const, condition: 100, lastConditionUpdateAtDays: 0, mesh: {} }
}

function placedFire(id: string, fire: VillageFire) {
  return { id, x: 0, z: 0, kind: 'simple' as const, grate: false, fire, everLit: true, unlitSeconds: 0, habitatBurn: false }
}

function createTestIntent(overrides: {
  inventory?: Record<string, number> | Inventory
  tents?: ReturnType<typeof tentEntry>[]
  bedrolls?: ReturnType<typeof bedrollEntry>[]
  platforms?: { id: string, x: number, z: number, yaw: number, condition: number, lastConditionUpdateAtDays: number }[]
  fires?: ReturnType<typeof placedFire>[]
  startIgniteFire?: (fire: VillageFire, lifecycle?: { onComplete?: (outcome: 'success' | 'failure') => void }) => { ok: true } | { ok: false, missing: [] }
  placementPreview?: {
    start: (kind: string, lifecycle?: PlacementPreviewLifecycle) => void
    cancel: () => boolean
    isActive: () => boolean
  }
  toast?: { show: (text: string, kind?: 'info' | 'error' | 'pickup') => void }
}) {
  const inventory = overrides.inventory instanceof Inventory
    ? overrides.inventory
    : new Inventory(overrides.inventory ?? {})
  const tents = overrides.tents ?? []
  const bedrolls = overrides.bedrolls ?? []
  const platforms = overrides.platforms ?? []
  const fires = overrides.fires ?? []

  const bundle = {
    placedTents: {
      list: () => tents,
      conditionOf: (id: string) => tents.find((t) => t.id === id)?.condition ?? null,
    },
    sleepingUtilities: {
      bedrolls: {
        list: () => bedrolls,
        conditionOf: (id: string) => bedrolls.find((b) => b.id === id)?.condition ?? null,
      },
      platforms: {
        list: () => platforms,
        conditionOf: (id: string) => platforms.find((p) => p.id === id)?.condition ?? null,
      },
    },
    placedFires: { list: () => fires },
    droppedItems: { nodes: () => [] },
  } as unknown as WorldBundle

  const busy = createBusyAction()
  const ctx = {
    busy,
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
  } as PlayerActionContext

  const player = {
    mesh: { position: new Vector3(0, 0, 0) },
    skills: { survival: { value: 0 } },
  } as unknown as PlayerController

  return createFullCampIntent({
    ctx,
    bundle,
    player,
    inventory,
    dayNight: { elapsedDays: 0 } as DayNightState,
    survival: {
      startIgniteFire: (overrides.startIgniteFire ?? (() => ({ ok: true as const }))) as never,
    },
    placementPreview: (overrides.placementPreview ?? {
      start: () => {},
      cancel: () => false,
      isActive: () => false,
    }) as never,
    busy,
    toast: overrides.toast ?? { show: () => {} },
  })
}
