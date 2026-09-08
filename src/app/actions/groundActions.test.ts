import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeaponItemInstance } from '../../items/itemInstances'
import type { PlayerActionContext } from './actionContext'
import { BadgeManager } from '../../badges/badges'
import { villageNearest } from '../../debug/locationQueries'
import { createHeldTool } from '../../items/HeldTool'
import { Inventory } from '../../items/Inventory'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { physicalWorkDuration } from '../../player/physicalWorkStrength'
import { PLAYER_STARTING_ATTRIBUTES } from '../../player/PlayerController'
import { applySocialConsequence, ReputationManager } from '../../reputation/ReputationManager'
import { GRAVE_DISTURBANCE_EXPOSURE, socialExposureEventRoll } from '../../reputation/socialExposure'
import { cemeteryGraveLayout } from '../../settlement/props'
import { rotateOffsetY } from '../../settlement/propUtils'
import { DIG_DURATION_SEC } from '../../terrain/dig'
import { applyDigAt } from '../../terrain/digAction'
import {
  findHiddenFindSpot,
  type HiddenFindLandmark,
  resolveHiddenFindLoot,
} from '../../world/hiddenFinds'
import { CHOP_DURATION_SEC } from '../../world/treeHarvest'
import { createTreeLifecycle, type TreeEnvSample } from '../../world/treeLifecycle'
import { createBusyAction } from '../busyAction'
import { createGroundActions, type GroundActionsDeps } from './groundActions'

vi.mock('../../terrain/dig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../terrain/dig')>()
  return {
    ...actual,
    getDigProfileAt: vi.fn(() => ({ depth: 0.28, stoneChance: 0, surface: 'soil' as const })),
  }
})

vi.mock('../../terrain/digAction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../terrain/digAction')>()
  return { ...actual, applyDigAt: vi.fn() }
})

vi.mock('../../debug/locationQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../debug/locationQueries')>()
  return { ...actual, villageNearest: vi.fn(() => null) }
})

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
    player: {
      mesh: { position: { x: 0, z: 0 } },
      attributes: PLAYER_STARTING_ATTRIBUTES,
    },
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
    applySocialConsequence: vi.fn(),
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

function cemeteryLandmark(id: string): HiddenFindLandmark {
  return { id, kind: 'cemetery', x: 100, z: 50, rotationY: 0.7, scale: 1, cemeterySize: 'SM' }
}

function gravePosition(landmark: HiddenFindLandmark, index: number): { x: number, z: number } {
  const local = cemeteryGraveLayout(landmark.cemeterySize ?? 'SM', landmark.scale)[index]!
  const rotated = rotateOffsetY(local.x, local.z, landmark.rotationY)
  return { x: landmark.x + rotated.x, z: landmark.z + rotated.z }
}

function cemeterySpotWithRoll(predicate: (roll: number) => boolean): {
  landmark: HiddenFindLandmark
  dig: { x: number, z: number }
  spotId: string
} {
  for (let i = 0; i < 400; i++) {
    const landmark = cemeteryLandmark(`cemetery:exposure:${i}`)
    const dig = gravePosition(landmark, 0)
    const match = findHiddenFindSpot([landmark], dig.x, dig.z, () => false)
    if (!match) continue
    const roll = socialExposureEventRoll(match.spotId)
    if (predicate(roll)) return { landmark, dig, spotId: match.spotId }
  }
  throw new Error('expected a cemetery spot whose exposure roll matches the predicate')
}

function emptyCemeteryGraveWithRoll(predicate: (roll: number) => boolean): {
  landmark: HiddenFindLandmark
  dig: { x: number, z: number }
} {
  for (let i = 0; i < 80; i++) {
    const landmark = cemeteryLandmark(`cemetery:empty:${i}`)
    const layout = cemeteryGraveLayout(landmark.cemeterySize ?? 'SM', landmark.scale)
    for (let index = 0; index < layout.length; index++) {
      const loot = resolveHiddenFindLoot(landmark, `${landmark.id}:${index}`, index, 'SM')
      if (loot.kind !== 'empty') continue
      const dig = gravePosition(landmark, index)
      const match = findHiddenFindSpot([landmark], dig.x, dig.z, () => false)
      if (match?.spotId !== `${landmark.id}:${index}`) continue
      if (predicate(socialExposureEventRoll(match.spotId))) return { landmark, dig }
    }
  }
  throw new Error('expected an empty cemetery grave whose exposure roll matches')
}

function stoneCircleWithFind(): HiddenFindLandmark {
  for (let i = 0; i < 80; i++) {
    const landmark: HiddenFindLandmark = {
      id: `stoneCircle:exposure:${i}`,
      kind: 'stoneCircle',
      x: 20,
      z: -30,
      rotationY: 0,
      scale: 1,
    }
    if (findHiddenFindSpot([landmark], landmark.x, landmark.z, () => false)) return landmark
  }
  throw new Error('expected a stoneCircle Hidden Find')
}

const NEAREST_VILLAGE = {
  kind: 'village' as const,
  position: { x: 0, z: 0 },
  distance: 12,
  id: 'anna-village',
  name: 'Anna',
  size: 'SM' as const,
}

function setupHiddenFindDig(options: {
  landmarks: HiddenFindLandmark[]
  timeOfDay: number
  sneakActive?: boolean
  sneakValue?: number
  resolved?: Set<string>
  village?: typeof NEAREST_VILLAGE | null
}) {
  const inventory = new Inventory({ shovel: 1 }, 100)
  const heldTool = createHeldTool(inventory, 'shovel')
  const dropped: { kind: ItemKind, count: number }[] = []
  const grantItem = makeGrantItem(inventory, dropped)
  const toast = { show: vi.fn() }
  const busy = createBusyAction()
  const badges = new BadgeManager()
  const applySocial = vi.fn()
  const resolvedHiddenFindSpotIds = options.resolved ?? new Set<string>()
  vi.mocked(villageNearest).mockReturnValue(options.village === undefined ? NEAREST_VILLAGE : options.village)

  const ctx = {
    bundle: {
      chunkManager: {
        getNearbyLandmarks: () => options.landmarks,
        modifyTerrain: vi.fn(),
      },
      settlementsManager: { peekDef: () => null, getLoaded: () => [], home: null },
      droppedItems: { settleNear: vi.fn(), drop: vi.fn() },
    },
    player: {
      mesh: { position: { x: 0, z: 0 } },
      attributes: PLAYER_STARTING_ATTRIBUTES,
      skills: { sneak: { active: options.sneakActive ?? false, value: options.sneakValue ?? 0.2 } },
    },
    inventory,
    heldTool,
    hud: { setPlayerBadges: vi.fn() },
    toast,
    busy,
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
    dayNight: { elapsedDays: 0, dayLengthSec: 600, timeOfDay: options.timeOfDay },
    mouseLook: { state: { yaw: 0 } },
    worldAudio: { playAt: vi.fn(), playOnce: vi.fn() },
    grantItem,
    syncQuickActionAvailability: vi.fn(),
  } as unknown as PlayerActionContext

  const deps: GroundActionsDeps = {
    worldFlags: { hiddenTreasureFound: false },
    badges,
    resolvedHiddenFindSpotIds,
    applySocialConsequence: applySocial,
  }

  const digAt = (x: number, z: number) => {
    createGroundActions(ctx, deps).startDigAt(x, z)
    busy.tick(DIG_DURATION_SEC)
  }

  return { badges, applySocial, resolvedHiddenFindSpotIds, digAt, grantItem }
}

describe('cemetery grave social exposure (quests-progression-011)', () => {
  beforeEach(() => {
    vi.mocked(villageNearest).mockReset()
    vi.mocked(villageNearest).mockReturnValue(null)
  })

  it('applies integrity -8 / trust -4 / renown +2 exactly once when the grave is exposed', () => {
    const { landmark, dig } = cemeterySpotWithRoll((roll) => roll < 0.5)
    const { applySocial, badges, resolvedHiddenFindSpotIds, digAt } = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.5,
    })

    digAt(dig.x, dig.z)

    expect(badges.exportState().gravesDisturbed).toBe(1)
    expect(applySocial).toHaveBeenCalledTimes(1)
    expect(applySocial).toHaveBeenCalledWith({
      settlementId: 'anna-village',
      reputation: { ...GRAVE_DISTURBANCE_EXPOSURE.reputation },
      renown: GRAVE_DISTURBANCE_EXPOSURE.renown,
    })
    expect(resolvedHiddenFindSpotIds.size).toBe(1)

    applySocial.mockClear()
    digAt(dig.x, dig.z)
    expect(applySocial).not.toHaveBeenCalled()
    expect(badges.exportState().gravesDisturbed).toBe(1)
  })

  it('does not change reputation or renown when the grave is not exposed', () => {
    const { landmark, dig } = cemeterySpotWithRoll((roll) => roll >= 0.5)
    const { applySocial, badges, digAt } = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.5,
    })

    digAt(dig.x, dig.z)

    expect(badges.exportState().gravesDisturbed).toBe(1)
    expect(applySocial).not.toHaveBeenCalled()
  })

  it('still runs exposure for an empty grave', () => {
    const { landmark, dig } = emptyCemeteryGraveWithRoll((roll) => roll < 0.5)
    const { applySocial, badges, grantItem, digAt } = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.5,
    })

    digAt(dig.x, dig.z)

    expect(badges.exportState().gravesDisturbed).toBe(1)
    expect(grantItem).not.toHaveBeenCalled()
    expect(applySocial).toHaveBeenCalledTimes(1)
  })

  it('does not run grave exposure for a non-cemetery Hidden Find', () => {
    const landmark = stoneCircleWithFind()
    const { applySocial, badges, digAt } = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.5,
    })

    digAt(landmark.x, landmark.z)

    expect(badges.exportState().gravesDisturbed).toBe(0)
    expect(applySocial).not.toHaveBeenCalled()
  })

  it('records the badge without a settlement reputation fallback', () => {
    const { landmark, dig } = cemeterySpotWithRoll((roll) => roll < 0.5)
    const { applySocial, badges, digAt } = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.5,
      village: null,
    })

    digAt(dig.x, dig.z)

    expect(badges.exportState().gravesDisturbed).toBe(1)
    expect(applySocial).not.toHaveBeenCalled()
  })

  it('keeps other reputation dimensions unchanged when the consequence is applied', () => {
    const { landmark, dig } = cemeterySpotWithRoll((roll) => roll < 0.5)
    const reputation = new ReputationManager()
    const { applySocial, digAt } = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.5,
    })
    applySocial.mockImplementation((consequence) => applySocialConsequence(reputation, consequence))

    digAt(dig.x, dig.z)

    expect(reputation.getReputationDimension('anna-village', 'integrity')).toBe(-8)
    expect(reputation.getReputationDimension('anna-village', 'trust')).toBe(-4)
    expect(reputation.getRenown('anna-village')).toBe(2)
    expect(reputation.getReputationDimension('anna-village', 'competence')).toBe(0)
    expect(reputation.getReputationDimension('anna-village', 'benevolence')).toBe(0)
    expect(reputation.getReputationDimension('anna-village', 'courage')).toBe(0)
  })

  it('preserves the social consequence through ReputationManager save/load and does not reroll a resolved grave', () => {
    const { landmark, dig, spotId } = cemeterySpotWithRoll((roll) => roll < 0.5)
    const reputation = new ReputationManager()
    const { applySocial, resolvedHiddenFindSpotIds, digAt } = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.5,
    })
    applySocial.mockImplementation((consequence) => applySocialConsequence(reputation, consequence))

    digAt(dig.x, dig.z)
    const restored = new ReputationManager(reputation.exportState())
    expect(restored.getReputationDimension('anna-village', 'integrity')).toBe(-8)
    expect(restored.getRenown('anna-village')).toBe(2)

    applySocial.mockClear()
    const second = setupHiddenFindDig({
      landmarks: [landmark],
      timeOfDay: 0.05,
      sneakActive: true,
      sneakValue: 1,
      resolved: new Set(resolvedHiddenFindSpotIds),
    })
    second.digAt(dig.x, dig.z)
    expect(second.applySocial).not.toHaveBeenCalled()
    expect(spotId).toBeDefined()
  })
})

describe('physical-work Strength duration (plan npc-020)', () => {
  it('shortens shovel dig for starting Strength 0.6 and still completes once', () => {
    const inventory = new Inventory({ shovel: 1 }, 100)
    const heldTool = createHeldTool(inventory, 'shovel')
    const busy = createBusyAction()
    const toast = { show: vi.fn() }
    const ctx = {
      bundle: {
        chunkManager: { getNearbyLandmarks: () => [], modifyTerrain: vi.fn() },
        settlementsManager: { peekDef: () => null, getLoaded: () => [], home: null },
        droppedItems: { settleNear: vi.fn(), drop: vi.fn() },
      },
      player: {
        mesh: { position: { x: 0, z: 0 } },
        attributes: PLAYER_STARTING_ATTRIBUTES,
      },
      inventory,
      heldTool,
      hud: { setPlayerBadges: vi.fn() },
      toast,
      busy,
      timeSkip: { isActive: () => false },
      restCamp: { isActive: () => false },
      dayNight: { elapsedDays: 0, dayLengthSec: 600, timeOfDay: 0.5 },
      mouseLook: { state: { yaw: 0 } },
      worldAudio: { playAt: vi.fn(), playOnce: vi.fn() },
      grantItem: vi.fn(),
      syncQuickActionAvailability: vi.fn(),
    } as unknown as PlayerActionContext
    const deps: GroundActionsDeps = {
      worldFlags: { hiddenTreasureFound: false },
      badges: new BadgeManager(),
      resolvedHiddenFindSpotIds: new Set(),
      applySocialConsequence: vi.fn(),
    }
    const duration = physicalWorkDuration(DIG_DURATION_SEC, PLAYER_STARTING_ATTRIBUTES.strength)
    expect(duration).toBeLessThan(DIG_DURATION_SEC)

    vi.mocked(applyDigAt).mockClear()
    createGroundActions(ctx, deps).startDigAt(0, 0)
    expect(busy.isActive()).toBe(true)
    busy.tick(duration - 1e-6)
    expect(applyDigAt).not.toHaveBeenCalled()
    expect(busy.isActive()).toBe(true)
    busy.tick(1e-5)
    expect(applyDigAt).toHaveBeenCalledTimes(1)
    expect(busy.isActive()).toBe(false)
  })
})

