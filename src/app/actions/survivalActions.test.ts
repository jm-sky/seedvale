import { describe, expect, it, vi } from 'vitest'
import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { LiquidContainerItemInstance } from '../../items/itemInstances'
import type { ItemKind } from '../../items/items'
import type { VillageFire } from '../../settlement/VillageFire'
import type { PlayerActionContext } from './actionContext'
import { resolveRawMeatSafetyRisk } from '../../items/foodSafety'
import { Inventory } from '../../items/Inventory'
import { createPlayerNeeds } from '../../player/PlayerNeeds'
import { createPlayerSkills } from '../../player/PlayerSkills'
import { foodPoisoningExposureEventRoll, resolveRawMeatPoisoningExposure } from '../../shared/foodPoisoningExposure'
import { createHealthState } from '../../shared/HealthState'
import { applyPoisoningExposure, createEmptyTemporaryConditions, getResolvedPoisoningSeverity, POISONING_INITIAL_EXPOSURE_SEVERITY } from '../../shared/temporaryConditions'
import { resolveUnsafeWaterPoisoningExposure, waterPoisoningExposureEventRoll } from '../../shared/waterPoisoningExposure'
import { createWaterSource, type WaterSource } from '../../world/WaterSource'
import { createBusyAction } from '../busyAction'
import { createSurvivalActions, type FeedableAnimal, feedAnimal } from './survivalActions'

/** Minimal `VillageFire` stub for ignite/refuel/habitat-burn tests — only
 *  `light`/`addFuel` are ever asserted on. */
function fakeFire(lit = false): VillageFire & { light: ReturnType<typeof vi.fn>, addFuel: ReturnType<typeof vi.fn> } {
  return {
    position: {} as never,
    isLit: () => lit,
    isIgniting: () => false,
    getIgniteProgress: () => 1,
    getFuelRatio: () => 0,
    light: vi.fn(),
    addFuel: vi.fn(),
    hasGrate: () => false,
    setGrate: vi.fn(),
    update: vi.fn(),
  } as unknown as VillageFire & { light: ReturnType<typeof vi.fn>, addFuel: ReturnType<typeof vi.fn> }
}

function setup(instances?: LiquidContainerItemInstance[]) {
  const emptyWaterskin: LiquidContainerItemInstance = { id: 'test-waterskin', kind: 'waterskin_medium', liquid: null, amountLitres: 0 }
  const inventory = new Inventory({}, 100, instances ?? [emptyWaterskin], {}, Infinity)
  const needs = createPlayerNeeds()
  const health = createHealthState(100)
  const toast = { show: vi.fn() }
  const busy = createBusyAction()

  const ctx = {
    bundle: {},
    player: {
      needs,
      health,
      mesh: { position: { x: 0, y: 0, z: 0 } },
      temporaryConditions: createEmptyTemporaryConditions(),
      waterDrinkEventCount: 0,
      unsafeFoodEventCount: 0,
      skills: createPlayerSkills(),
      syncDerivedPhysicalCapabilities: vi.fn(),
    },
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
    refreshInventoryScreen: vi.fn(),
    getWorldSeed: () => 42,
  } as unknown as PlayerActionContext

  const actions = createSurvivalActions(ctx)
  return { actions, needs, health, inventory, toast, ctx }
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

  it('restores thirst with the unsafe warning for lake when poisoning roll fails', () => {
    const { actions, needs, toast, ctx } = setup()
    needs.thirst.current = 0
    const source = createWaterSource('lake')
    let drinkEventIndex = 0
    while (resolveUnsafeWaterPoisoningExposure({
      roll: waterPoisoningExposureEventRoll({
        worldSeed: ctx.getWorldSeed(),
        actorId: 'player',
        drinkEventIndex,
        source,
      }),
    })) {
      drinkEventIndex += 1
    }
    ;(ctx.player as { waterDrinkEventCount: number }).waterDrinkEventCount = drinkEventIndex

    actions.drinkFromWaterSource(source)

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

describe('fillWaterContainer (plan ui-input-014)', () => {
  it('fills the selected instance rather than the smallest auto-select', () => {
    const small: LiquidContainerItemInstance = { id: 'ws-small', kind: 'waterskin_small', liquid: null, amountLitres: 0 }
    const medium: LiquidContainerItemInstance = { id: 'ws-medium', kind: 'waterskin_medium', liquid: null, amountLitres: 0 }
    const { actions, inventory } = setup([small, medium])

    const result = actions.fillWaterContainer(createWaterSource('river'), 'ws-medium')

    expect(result.ok).toBe(true)
    const filled = inventory.getInstance('ws-medium') as LiquidContainerItemInstance
    const untouched = inventory.getInstance('ws-small') as LiquidContainerItemInstance
    expect(filled.liquid).toBe('water')
    expect(filled.amountLitres).toBeGreaterThan(0)
    expect(untouched.amountLitres).toBe(0)
  })

  it('rejects a stale or missing instance', () => {
    const { actions, toast } = setup()
    const result = actions.fillWaterContainer(createWaterSource('river'), 'missing-id')
    expect(result.ok).toBe(false)
    expect(toast.show).toHaveBeenCalledWith('Nie masz już tego pojemnika.', 'error')
  })

  it('still refuses an undrinkable source', () => {
    const { actions, inventory, toast } = setup()
    const result = actions.fillWaterContainer(createWaterSource('ocean'), 'test-waterskin')
    expect(result.ok).toBe(false)
    const instance = inventory.getInstance('test-waterskin') as LiquidContainerItemInstance
    expect(instance.amountLitres).toBe(0)
    expect(toast.show).toHaveBeenCalledWith('Ta woda jest słona — nie da się jej pić.', 'error')
  })

  it('refuses a full container', () => {
    const full: LiquidContainerItemInstance = {
      id: 'full-skin',
      kind: 'waterskin_medium',
      liquid: 'water',
      amountLitres: 5,
    }
    const { actions, toast } = setup([full])
    const result = actions.fillWaterContainer(createWaterSource('river'), 'full-skin')
    expect(result.ok).toBe(false)
    expect(toast.show).toHaveBeenCalledWith('Pojemnik jest już pełny.', 'error')
  })
})

describe('drinkFromWaterSource — deep well rope gate (plan world-011)', () => {
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
  function fakeAnimal(
    dietItems: Partial<Record<string, number>> | undefined,
    feedByPlayerResult = true,
    canAccept = true,
  ): FeedableAnimal & { feedByPlayer: ReturnType<typeof vi.fn> } {
    return {
      def: { diet: dietItems ? { items: dietItems } : undefined },
      feedByPlayer: vi.fn(() => feedByPlayerResult),
      canAcceptHandFeedItem: vi.fn(() => canAccept),
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

  it('satiated animal (canAcceptHandFeedItem false) does not consume inventory', () => {
    const inventory = new Inventory({}, Infinity)
    inventory.add('raw_meat', 1)
    const animal = fakeAnimal({ raw_meat: 0.8 }, true, false)

    expect(feedAnimal(animal, inventory)).toBe(false)
    expect(animal.feedByPlayer).not.toHaveBeenCalled()
    expect(inventory.has('raw_meat', 1)).toBe(true)
  })
})

describe('consumeItem — condition treatment (plan npc-024)', () => {
  it('herb heals HP and reduces poisoning; bandage only heals HP', () => {
    const { actions, health, inventory, ctx } = setup()
    inventory.add('herb', 2)
    inventory.add('bandage', 1)
    applyPoisoningExposure(ctx.player.temporaryConditions, 0)

    actions.consumeItem('herb')
    expect(getResolvedPoisoningSeverity(ctx.player.temporaryConditions, 0)).toBeLessThan(POISONING_INITIAL_EXPOSURE_SEVERITY)
    expect(health.currentHp).toBeGreaterThan(90)

    applyPoisoningExposure(ctx.player.temporaryConditions, 0)
    const severityBeforeBandage = getResolvedPoisoningSeverity(ctx.player.temporaryConditions, 0)
    actions.consumeItem('bandage')
    expect(getResolvedPoisoningSeverity(ctx.player.temporaryConditions, 0)).toBe(severityBeforeBandage)
  })
})

describe('startIgniteFire — catalog fuel (plan items-player-023)', () => {
  it('refuses with a generic fuel error when nothing is carried', () => {
    const { actions, toast, inventory } = setup()
    inventory.add('firestarter', 1)
    const fire = fakeFire()

    const result = actions.startIgniteFire(fire)

    expect(result.ok).toBe(false)
    expect(toast.show).toHaveBeenCalledWith('Potrzebujesz opału, żeby je zapalić.', 'error')
    expect(fire.light).not.toHaveBeenCalled()
  })

  it('selects the lowest-priority fuel (cone before branch) and passes its value to the fire', () => {
    const { actions, inventory, ctx } = setup()
    inventory.add('firestarter', 1)
    inventory.add('branch', 1)
    inventory.add('cone', 1)
    const fire = fakeFire()

    const result = actions.startIgniteFire(fire)
    expect(result.ok).toBe(true)
    ctx.busy.tick(100)

    expect(fire.light).toHaveBeenCalledWith('player', 0.5)
    expect(inventory.has('cone', 1)).toBe(false)
    expect(inventory.has('branch', 1)).toBe(true)
  })

  it('falls through to branch (value 1) when no cone is carried', () => {
    const { actions, inventory, ctx } = setup()
    inventory.add('firestarter', 1)
    inventory.add('branch', 1)
    const fire = fakeFire()

    actions.startIgniteFire(fire)
    ctx.busy.tick(100)

    expect(fire.light).toHaveBeenCalledWith('player', 1)
  })

  it('re-resolves fuel at busy completion — consumed mid-channel fails without lighting', () => {
    const { actions, inventory, ctx } = setup()
    inventory.add('firestarter', 1)
    inventory.add('branch', 1)
    const fire = fakeFire()

    const result = actions.startIgniteFire(fire)
    expect(result.ok).toBe(true)
    inventory.remove('branch', 1)
    ctx.busy.tick(100)

    expect(fire.light).not.toHaveBeenCalled()
  })
})

describe('startDestroySpawner — habitat burn (plan items-player-023 §2)', () => {
  function fakeSpawner(): PreySpawner {
    return {
      id: 'spawner-1',
      x: 1,
      z: 2,
      type: 'thicket',
      kind: 'rabbit',
      respawnIntervalDays: 1,
      maxPreyCount: 3,
      daysSinceLastRespawn: 0,
      state: 'depleted',
      deathsThisCycle: 0,
      disabledAtDay: null,
    } as PreySpawner
  }

  function habitatSetup() {
    const inventory = new Inventory({}, 100, [], {}, Infinity)
    const busy = createBusyAction()
    const toast = { show: vi.fn() }
    const fire = fakeFire()
    const ctx = {
      bundle: {
        fauna: { destroySpawner: vi.fn(() => true) },
        placedFires: { place: vi.fn(() => ({ fire })) },
      },
      player: { skills: createPlayerSkills() },
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
      refreshInventoryScreen: vi.fn(),
      getWorldSeed: () => 42,
    } as unknown as PlayerActionContext

    const actions = createSurvivalActions(ctx)
    return { actions, inventory, toast, busy, fire }
  }

  it('lights the pit with exactly 4 branch-equivalents, independent of other carried fuel', () => {
    const { actions, inventory, busy, fire } = habitatSetup()
    inventory.add('branch', 4)
    inventory.add('cone', 5)

    const result = actions.startDestroySpawner(fakeSpawner())
    expect(result.ok).toBe(true)
    busy.tick(100)

    expect(fire.light).toHaveBeenCalledWith('player', 1)
    expect(fire.addFuel).toHaveBeenCalledWith(3)
    expect(inventory.has('branch', 1)).toBe(false)
    expect(inventory.has('cone', 5)).toBe(true)
  })
})

describe('consumeItem — raw-meat poisoning exposure (plan items-player-023)', () => {
  /** Brute-forces the smallest `foodEventIndex` whose deterministic roll
   *  gives `wantExposure` for `kind`/`sourceSpecies`, so tests exercise both
   *  outcomes without depending on `Math.random`. `sourceSpecies` must match
   *  what `consumeItem()` actually resolves and passes into the roll (the
   *  consumed batch's species, or the kind's own mapping). */
  function findRollIndex(
    kind: ItemKind,
    sourceSpecies: Parameters<typeof foodPoisoningExposureEventRoll>[0]['sourceSpecies'],
    chance: number,
    wantExposure: boolean,
    worldSeed = 42,
  ): number {
    for (let i = 0; i < 500; i++) {
      const roll = foodPoisoningExposureEventRoll({ worldSeed, actorId: 'player', foodEventIndex: i, kind, sourceSpecies })
      if (resolveRawMeatPoisoningExposure({ roll, chance }) === wantExposure) return i
    }
    throw new Error(`no ${kind} roll found for wantExposure=${wantExposure}`)
  }

  it('non-meat food never advances the food-risk counter', () => {
    const { actions, inventory, ctx } = setup()
    inventory.add('bread', 1)

    actions.consumeItem('bread')

    expect(ctx.player.unsafeFoodEventCount).toBe(0)
  })

  it('processed meat with preserved sourceSpecies does not trigger raw-meat risk or advance the counter', () => {
    const { actions, inventory, ctx } = setup()
    inventory.add('roasted_meat', 1, 0, 'boar')

    actions.consumeItem('roasted_meat')

    expect(ctx.player.unsafeFoodEventCount).toBe(0)
    expect(ctx.player.temporaryConditions.conditions.poisoning).toBeUndefined()
  })

  it('raw meat advances the counter exactly once per successful consumption', () => {
    const { actions, inventory, ctx } = setup()
    inventory.add('raw_meat', 2, 0)

    actions.consumeItem('raw_meat')
    expect(ctx.player.unsafeFoodEventCount).toBe(1)
    actions.consumeItem('raw_meat')
    expect(ctx.player.unsafeFoodEventCount).toBe(2)
  })

  it('spoiled raw meat is refused before removal — no counter advance, no roll', () => {
    const { actions, inventory, ctx } = setup()
    // raw_meat is 1 day fresh + 1 day medium; acquired 5 days ago is spoiled.
    inventory.add('raw_meat', 1, -5)

    const result = actions.consumeItem('raw_meat')

    expect(result.ok).toBe(false)
    expect(ctx.player.unsafeFoodEventCount).toBe(0)
  })

  it('applies nutrition even when the exposure roll succeeds (poisoned)', () => {
    const { actions, needs, inventory, ctx } = setup()
    needs.hunger.current = 0
    const kind: ItemKind = 'wolf_meat'
    const chance = resolveRawMeatSafetyRisk(kind, undefined, 0)!.chance
    const exposedIndex = findRollIndex(kind, 'wolf', chance, true)
    inventory.add(kind, 1, 0)
    ctx.player.unsafeFoodEventCount = exposedIndex

    actions.consumeItem(kind)

    expect(needs.hunger.current).toBeGreaterThan(0)
    expect(ctx.player.temporaryConditions.conditions.poisoning).toBeDefined()
    expect(ctx.player.unsafeFoodEventCount).toBe(exposedIndex + 1)
  })

  it('grants nutrition and no poisoning when the exposure roll fails', () => {
    const { actions, needs, inventory, ctx } = setup()
    needs.hunger.current = 0
    const kind: ItemKind = 'wolf_meat'
    const chance = resolveRawMeatSafetyRisk(kind, undefined, 0)!.chance
    const safeIndex = findRollIndex(kind, 'wolf', chance, false)
    inventory.add(kind, 1, 0)
    ctx.player.unsafeFoodEventCount = safeIndex

    actions.consumeItem(kind)

    expect(needs.hunger.current).toBeGreaterThan(0)
    expect(ctx.player.temporaryConditions.conditions.poisoning).toBeUndefined()
    expect(ctx.player.unsafeFoodEventCount).toBe(safeIndex + 1)
  })
})
