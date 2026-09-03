import { describe, expect, it, vi } from 'vitest'
import type { PlacedFireEntry } from '../settlement/PlacedFires'
import type { WorldBundle } from './worldBundle'
import { createHeldTool } from '../items/HeldTool'
import { Inventory } from '../items/Inventory'
import { getUserActions } from './userActions'

/** Flat, unobstructed ground far above `waterLevel` — every fire-placement
 *  check in these tests resolves 'ok' unless a test overrides it, so
 *  placement-only failures are exercised explicitly rather than by accident. */
function makeBundle(overrides: Partial<{ nearestBuildable: PlacedFireEntry | null }> = {}) {
  const placed: { place: ReturnType<typeof vi.fn>, buildGrate: ReturnType<typeof vi.fn> } = {
    place: vi.fn(),
    buildGrate: vi.fn(() => true),
  }
  return {
    chunkManager: { sampleHeight: () => 10, waterLevel: 0 },
    placedFires: {
      nodes: () => [],
      place: placed.place,
      nearestBuildable: vi.fn(() => overrides.nearestBuildable ?? null),
      buildGrate: placed.buildGrate,
    },
  } as unknown as WorldBundle
}

function makeActions(opts: {
  inventory?: Inventory
  bundleOverrides?: Partial<{ nearestBuildable: PlacedFireEntry | null }>
  torchLit?: boolean
  heldTorch?: boolean
} = {}) {
  const inventory = opts.inventory ?? new Inventory({}, 1000)
  const bundle = makeBundle(opts.bundleOverrides)
  const heldTool = createHeldTool(inventory, opts.heldTorch ? 'wooden_torch' : null)
  let lit = opts.torchLit ?? false
  const playerTorch = {
    isLit: () => lit,
    source: () => null,
    fuelRemaining: () => 0,
    light: vi.fn(async () => { lit = true }),
    extinguish: () => { lit = false },
    update: () => {},
    dispose: () => {},
  } as unknown as import('../player/PlayerTorch').PlayerTorch
  const player = { mesh: { position: { x: 0, z: 0 } } } as unknown as import('../player/PlayerController').PlayerController
  const hud = { setInventoryWeight: vi.fn() } as unknown as import('../ui/createHud').Hud
  const mouseLook = { state: { yaw: 0 } } as unknown as ReturnType<typeof import('../input/MouseLook').createMouseLook>
  const syncHeldHud = vi.fn()

  const actions = getUserActions(inventory, bundle, playerTorch, player, hud, heldTool, syncHeldHud, mouseLook, () => [])
  return { actions, inventory, bundle, heldTool }
}

describe('userActions fire contracts', () => {
  it('buildSimpleFire reports both missing capability and missing branches at once', () => {
    const { actions } = makeActions()

    const availability = actions.availableSimpleFire()

    expect(availability.available).toBe(false)
    if (availability.available) throw new Error('unreachable')
    expect(availability.missing).toEqual([
      { kind: 'capability', capability: 'fire_starting' },
      { kind: 'item', item: 'branch', required: 2, actual: 0 },
    ])
  })

  it('buildFirePit does not require fire_starting (only stone + placement)', () => {
    const { actions } = makeActions({ inventory: new Inventory({ stone: 4 }, 1000) })

    expect(actions.availableFirePit()).toEqual({ available: true })
  })

  it('execute re-validates and does not mutate when availability was checked against stale state', () => {
    const { actions, inventory, bundle } = makeActions({ inventory: new Inventory({ branch: 2, firestarter: 1 }, 1000) })

    expect(actions.availableSimpleFire()).toEqual({ available: true })

    // World state changes after the availability snapshot but before execute.
    inventory.remove('branch', 2)

    const result = actions.buildSimpleFire()

    expect(result.ok).toBe(false)
    expect(inventory.count('branch')).toBe(0)
    expect(bundle.placedFires.place).not.toHaveBeenCalled()
  })

  it('buildSimpleFire succeeds and consumes materials once requirements are met', () => {
    const { actions, inventory, bundle } = makeActions({ inventory: new Inventory({ branch: 2, firestarter: 1 }, 1000) })

    const result = actions.buildSimpleFire()

    expect(result).toEqual({ ok: true })
    expect(inventory.count('branch')).toBe(0)
    expect(bundle.placedFires.place).toHaveBeenCalledTimes(1)
  })

  it('buildGrate reports a target requirement when no fire is in range, independent of material shortfalls', () => {
    const { actions } = makeActions()

    const availability = actions.availableGrate()

    expect(availability.available).toBe(false)
    if (availability.available) throw new Error('unreachable')
    expect(availability.missing).toEqual([
      { kind: 'target', id: 'grateTarget' },
      { kind: 'item', item: 'branch', required: 2, actual: 0 },
      { kind: 'item', item: 'stone', required: 2, actual: 0 },
      { kind: 'item', item: 'iron_rod', required: 2, actual: 0 },
    ])
  })

  it('buildGrate re-resolves the target fresh and fails without mutating if it vanished between checks', () => {
    const target: PlacedFireEntry = { id: 'fire-1' } as unknown as PlacedFireEntry
    const inventory = new Inventory({ branch: 2, stone: 2, iron_rod: 2 }, 1000)
    const { actions, bundle } = makeActions({ inventory, bundleOverrides: { nearestBuildable: target } })

    expect(actions.availableGrate()).toEqual({ available: true })

    // Target fire despawns/moves out of range between the availability check
    // and execute — simulate by having the mock stop returning it.
    ;(bundle.placedFires.nearestBuildable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null)

    const result = actions.buildGrate()

    expect(result.ok).toBe(false)
    expect(inventory.count('branch')).toBe(2)
    expect(bundle.placedFires.buildGrate).not.toHaveBeenCalled()
  })

  it('buildGrate succeeds and spends materials once a target is in range', () => {
    const target: PlacedFireEntry = { id: 'fire-1' } as unknown as PlacedFireEntry
    const inventory = new Inventory({ branch: 2, stone: 2, iron_rod: 2 }, 1000)
    const { actions, bundle } = makeActions({ inventory, bundleOverrides: { nearestBuildable: target } })

    const result = actions.buildGrate()

    expect(result).toEqual({ ok: true })
    expect(bundle.placedFires.buildGrate).toHaveBeenCalledWith('fire-1')
    expect(inventory.count('branch')).toBe(0)
  })

  it('lightBranch is unavailable with a concrete reason once the torch is already lit', () => {
    const inventory = new Inventory({ branch: 1, firestarter: 1 }, 1000)
    const { actions } = makeActions({ inventory, torchLit: true })

    const availability = actions.availableLightBranch()

    expect(availability).toEqual({ available: false, missing: [{ kind: 'target', id: 'torchNotLit' }] })
  })

  it('lightWoodenTorch is available already-held even with no spare carried', () => {
    const { actions } = makeActions({ inventory: new Inventory({ firestarter: 1, wooden_torch: 1 }, 1000), heldTorch: true })

    expect(actions.availableLightWoodenTorch()).toEqual({ available: true })
  })

  it('lightWoodenTorch reports both a free-hand and a carried-torch requirement when the hand is occupied', () => {
    const inventory = new Inventory({ firestarter: 1, shovel: 1 }, 1000)
    const bundle = makeBundle()
    const playerTorch = {
      isLit: () => false,
      source: () => null,
      fuelRemaining: () => 0,
      light: vi.fn(),
      extinguish: () => {},
      update: () => {},
      dispose: () => {},
    } as unknown as import('../player/PlayerTorch').PlayerTorch
    const player = { mesh: { position: { x: 0, z: 0 } } } as unknown as import('../player/PlayerController').PlayerController
    const hud = { setInventoryWeight: vi.fn() } as unknown as import('../ui/createHud').Hud
    const mouseLook = { state: { yaw: 0 } } as unknown as ReturnType<typeof import('../input/MouseLook').createMouseLook>
    const heldShovel = createHeldTool(inventory, 'shovel')
    const actions = getUserActions(inventory, bundle, playerTorch, player, hud, heldShovel, vi.fn(), mouseLook, () => [])

    const availability = actions.availableLightWoodenTorch()

    expect(availability.available).toBe(false)
    if (availability.available) throw new Error('unreachable')
    expect(availability.missing).toEqual([
      { kind: 'target', id: 'freeHand' },
      { kind: 'item', item: 'wooden_torch', required: 1, actual: 0 },
    ])
  })
})
