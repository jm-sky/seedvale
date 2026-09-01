import { describe, expect, it, vi } from 'vitest'
import type { BadgeManager } from '../../badges/badges'
import type { WeaponItemInstance } from '../../items/itemInstances'
import type { PlayerActionContext } from './actionContext'
import { createHeldTool } from '../../items/HeldTool'
import { Inventory } from '../../items/Inventory'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { CHOP_DURATION_SEC } from '../../world/treeHarvest'
import { createTreeLifecycle, type TreeEnvSample } from '../../world/treeLifecycle'
import { createBusyAction } from '../busyAction'
import { createGroundActions, type GroundActionsDeps } from './groundActions'

// A `felled` tree's final chop step is the one that yields both `branch` and
// `beam` at once (`treeLifecycle.ts`'s `FELLING_BEAM_YIELD`) — the scenario
// this bug (delivery bypassing `ctx.grantItem`) actually loses items on.
const TREE_ENV: TreeEnvSample = { biome: { desert: 0, swamp: 0, forest: 1 }, moisture: 0.5, altitude01: 0, mountainRidge: 0 }
const AXE_WEIGHT = ITEM_DEFS.axe.weight
const BRANCH_WEIGHT = ITEM_DEFS.branch.weight

/** A stand-in for `createApp.ts`'s real `grantItem` closure (not exported,
 *  see `actionContext.ts`'s doc comment on `PlayerActionContext.grantItem`):
 *  per-unit `Inventory.add`, overflow recorded instead of dropped-item world
 *  state so tests can assert on it directly. Faithful to the documented
 *  contract for plain stackable kinds (`branch`/`beam` are not instance-backed
 *  — `createAcquiredInstance` returns null for both). */
function makeGrantItem(inventory: Inventory, dropped: { kind: ItemKind, count: number }[]) {
  return vi.fn((kind: ItemKind, count: number) => {
    for (let i = 0; i < count; i++) {
      if (!inventory.add(kind)) dropped.push({ kind, count: 1 })
    }
  })
}

function setupFelledTreeChop(maxWeight: number) {
  const lifecycle = createTreeLifecycle(1)
  const treeId = lifecycle.makeId(10, 10, 0)
  lifecycle.registerPresence({
    id: treeId,
    x: 10,
    z: 10,
    speciesIndex: 0,
    initialStage: 'felled',
    sizeClass: 'medium',
    sizeJitter: 0.5,
  })

  // `axe` is a `WEAPON_MAINTENANCE_KINDS` kind (durability/sharpness) — held
  // via a real `ItemInstance`, not a plain `counts` entry (`HeldTool.ts`'s
  // `hasQuantity` reads `countInstances` for it).
  const axeInstance: WeaponItemInstance = { id: 'test-axe', kind: 'axe', durability: 1, sharpness: 1 }
  const inventory = new Inventory({}, maxWeight, [axeInstance], {}, Infinity)
  const heldTool = createHeldTool(inventory, 'axe')
  const dropped: { kind: ItemKind, count: number }[] = []
  const grantItem = makeGrantItem(inventory, dropped)
  const toast = { show: vi.fn() }
  const busy = createBusyAction()

  const chunkManager = {
    getNearbyTrees: (pos: { x: number, z: number }, radius: number) =>
      lifecycle.getNearbyPresence(pos.x, pos.z, radius).map((presence) => ({
        ...presence,
        stage: lifecycle.resolve(presence, TREE_ENV, 0).stage,
      })),
    sampleTreeEnv: () => TREE_ENV,
    refreshTreeVisual: () => true,
  }
  const settlementsManager = { getLoaded: () => [] }

  const ctx = {
    bundle: { chunkManager, settlementsManager },
    player: { mesh: { position: { x: 0, z: 0 } } },
    inventory,
    heldTool,
    hud: {},
    toast,
    busy,
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
    dayNight: { elapsedDays: 0, dayLengthSec: 600 },
    mouseLook: { state: { yaw: 0 } },
    worldAudio: { playAt: vi.fn(), playOnce: vi.fn() },
    getTreeLifecycle: () => lifecycle,
    grantItem,
    syncQuickActionAvailability: vi.fn(),
    syncHeldHud: vi.fn(),
    refreshInventoryScreen: vi.fn(),
  } as unknown as PlayerActionContext

  const deps: GroundActionsDeps = {
    worldFlags: { hiddenTreasureFound: false },
    badges: {} as unknown as BadgeManager,
    resolvedHiddenFindSpotIds: new Set(),
  }

  const chop = () => {
    createGroundActions(ctx, deps).startTreeChop(treeId, 10, 10)
    busy.tick(CHOP_DURATION_SEC)
  }

  return { lifecycle, treeId, inventory, dropped, toast, grantItem, chop }
}

const expectedMessage = `+3 ${ITEM_DEFS.branch.label}, +4 ${ITEM_DEFS.beam.label}`

describe('startTreeChop reward delivery (tree harvest reward delivery fix)', () => {
  it('delivers both branch and beam into inventory when there is enough room', () => {
    const { inventory, dropped, toast, grantItem, lifecycle, treeId, chop } = setupFelledTreeChop(100)

    chop()

    expect(grantItem).toHaveBeenNthCalledWith(1, 'branch', 3)
    expect(grantItem).toHaveBeenNthCalledWith(2, 'beam', 4)
    expect(inventory.count('branch')).toBe(3)
    expect(inventory.count('beam')).toBe(4)
    expect(dropped).toEqual([])
    expect(toast.show).toHaveBeenCalledWith(expectedMessage, 'pickup')
    expect(lifecycle.getOverride(treeId)?.stage).toBe('harvested')
  })

  it('completes the harvest and drops everything at the player when inventory has no room at all', () => {
    // Only enough capacity for the axe already held — zero room for any reward.
    const { inventory, dropped, toast, lifecycle, treeId, chop } = setupFelledTreeChop(AXE_WEIGHT)

    chop()

    expect(inventory.count('branch')).toBe(0)
    expect(inventory.count('beam')).toBe(0)
    expect(dropped.filter((d) => d.kind === 'branch')).toHaveLength(3)
    expect(dropped.filter((d) => d.kind === 'beam')).toHaveLength(4)
    // Nothing lost: every yielded unit is accounted for in inventory + dropped.
    expect(inventory.count('branch') + dropped.filter((d) => d.kind === 'branch').length).toBe(3)
    expect(inventory.count('beam') + dropped.filter((d) => d.kind === 'beam').length).toBe(4)
    // Harvest still fully resolves — a full inventory never blocks it.
    expect(lifecycle.getOverride(treeId)?.stage).toBe('harvested')
    // Toast still reports the true total reward, since grantItem delivered
    // all of it (to the ground, not the pocket) rather than losing any of it.
    expect(toast.show).toHaveBeenCalledWith(expectedMessage, 'pickup')
  })

  it('keeps branch in inventory and drops only the beam when branch fills the remaining room', () => {
    // Room for the axe + exactly the 3 branches (1.5kg), none left for beam.
    const { inventory, dropped, toast, lifecycle, treeId, chop } = setupFelledTreeChop(AXE_WEIGHT + 3 * BRANCH_WEIGHT)

    chop()

    expect(inventory.count('branch')).toBe(3)
    expect(dropped.filter((d) => d.kind === 'branch')).toHaveLength(0)
    expect(inventory.count('beam')).toBe(0)
    expect(dropped.filter((d) => d.kind === 'beam')).toHaveLength(4)
    expect(lifecycle.getOverride(treeId)?.stage).toBe('harvested')
    expect(toast.show).toHaveBeenCalledWith(expectedMessage, 'pickup')
  })
})
