import type { ItemKind } from '../../items/items'
import type { TrapCaptureEvent } from '../../world/createPlacedTraps'
import type { CropGrowthStage, CropId } from '../../world/cropLifecycle'
import type { FishingBaitState } from '../../world/fishing'
import { playActionFishingCast } from '../../audio/actionSounds'
import { playInventoryPickUp } from '../../audio/inventorySounds'
import { ANIMAL_LABELS } from '../../fauna/AnimalAgent'
import { BAIT_ITEM_PRIORITY } from '../../items/foodFreshness'
import { inventoryFullToastText } from '../../items/Inventory'
import { ITEM_DEFS } from '../../items/items'
import { trapInstanceFromWorld } from '../../items/trapItemInstances'
import { awardSkillXp, SKILL_XP_AWARD } from '../../player/PlayerSkills'
import { damageHealth } from '../../shared/HealthState'
import { TRAP_DEFS } from '../../world/animalTraps'
import { HIVE_STING_DAMAGE, honeyAvailable, rollHiveSting } from '../../world/beehives'
import { CROP_DEFS, resolveCropHarvest } from '../../world/cropLifecycle'
import { isDryingComplete, pickDryingRecipe, startDryingProcess } from '../../world/dryingRacks'
import {
  applyFishingBait as applyFishingBaitToSpot,
  FISHING_CAST_DURATION_SEC,
  fishingSpotId,
  isBaitActive,
  rollFishingCatch,
} from '../../world/fishing'
import { cultivationYieldCount, findNearestGarden, resolveCultivationCare } from '../../world/playerGarden'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** Food/resource gathering the player does on already-existing world objects:
 *  animal traps (plan 141 + plan 159's bait), lake/river/ocean fishing (plan
 *  159, shorelines extended by plan `ui-input-006`), settlement drying racks
 *  and wild hives (plan 159), and naturally-generated wild crops (plan 172).
 *  Placing a trap belongs to `placementActions.ts`; this module owns what
 *  happens *afterwards*. */
export type GatheringActions = {
  armTrap: (id: string) => void
  disarmTrap: (id: string) => void
  collectTrap: (id: string) => void
  /** A trap caught something — the single owner of a capture's player-facing
   *  consequences (Traps XP + toast), exactly once per catch. */
  onTrapCapture: (event: TrapCaptureEvent) => void
  /** A trap gave its bait back (disarm/collect before a catch). */
  onTrapBaitReturned: (kind: ItemKind) => void
  startFishing: (x: number, z: number) => void
  applyFishingBait: (x: number, z: number) => void
  interactDryingRack: (id: string) => void
  collectHive: (id: string) => void
  burnHive: (id: string) => void
  harvestCrop: (id: string, cropId: CropId, stage: CropGrowthStage, x: number, z: number) => void
}

export type GatheringActionDeps = {
  /** Persistent per-spot fishing bait (plan 159 §10, `SaveData.fishingBait`). */
  fishingBait: Map<string, FishingBaitState>
  /** Runtime-only per-spot cast counter feeding the deterministic catch roll. */
  fishingAttempts: Map<string, number>
}

export function createGatheringActions(
  ctx: PlayerActionContext,
  deps: GatheringActionDeps,
): GatheringActions {
  const { bundle, player, inventory, playerTorch, hud, toast, busy, dayNight, worldAudio } = ctx
  const { fishingBait, fishingAttempts } = deps

  const armTrap = (id: string): void => {
    if (isActionBlocked(ctx)) return
    // The Traps value is snapshotted here, once — the trap then works on its
    // own, with no reference back to the player (implementation notes §2).
    if (!bundle.placedTraps.activate(id, player.skills.traps.value, dayNight.elapsedDays)) return
    // Plan 159 §12 — auto-bait from whatever bait-capable food the player
    // already carries (cheapest first), atomically: remove one unit, then
    // attach it. No separate "load bait" UI action in this pass.
    const baitKind = BAIT_ITEM_PRIORITY.find((kind) => inventory.has(kind, 1))
    if (baitKind && inventory.remove(baitKind, 1)) {
      if (bundle.placedTraps.attachBait(id, baitKind)) {
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        toast.show(`Pułapka uzbrojona i zanęcona (${ITEM_DEFS[baitKind].label}).`)
        return
      }
      inventory.add(baitKind, 1, dayNight.elapsedDays)
    }
    toast.show('Pułapka uzbrojona.')
  }

  const disarmTrap = (id: string): void => {
    if (isActionBlocked(ctx)) return
    // Disarming never costs durability (plan 141 §3).
    if (!bundle.placedTraps.deactivate(id)) return
    toast.show('Pułapka rozbrojona.')
  }

  const collectTrap = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const trap = bundle.placedTraps.list().find((entry) => entry.id === id)
    if (!trap || trap.state === 'active') return
    const instance = trapInstanceFromWorld(trap.id, trap.kind, trap.durability)
    if (!inventory.canAddInstance(instance)) {
      toast.show(inventoryFullToastText(inventory, instance.kind, 1), 'error')
      return
    }
    const removed = bundle.placedTraps.collect(id)
    if (!removed) return
    inventory.addInstance(trapInstanceFromWorld(removed.id, removed.kind, removed.durability))
    if (removed.state === 'broken') {
      toast.show('Zabrano zniszczoną pułapkę.')
    } else {
      toast.show(`Zabrano: ${TRAP_DEFS[removed.kind].label}.`)
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
  }

  // The single owner of a capture's player-facing consequences (implementation
  // notes §18) — `PlacedTraps` only kills and leaves a corpse; XP and the
  // toast are decided here, exactly once per catch.
  const onTrapCapture = (event: TrapCaptureEvent): void => {
    awardSkillXp(player.skills, 'traps', SKILL_XP_AWARD.captureTrap)
    const animalLabel = ANIMAL_LABELS[event.animalKind]
    toast.show(
      event.broken
        ? `Pułapka złapała zwierzę (${animalLabel}) i się rozpadła.`
        : `Pułapka złapała zwierzę (${animalLabel}).`,
    )
  }

  const onTrapBaitReturned = (kind: ItemKind): void => {
    if (inventory.add(kind, 1, dayNight.elapsedDays)) {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
    } else {
      bundle.droppedItems.drop(kind, player.mesh.position.x, player.mesh.position.z)
    }
  }

  /** Plan 159 §9, shorelines extended to river/ocean by plan `ui-input-006` —
   *  cast at a water's edge with `fishing_rod` held. Position-only spot id
   *  (`fishingSpotId`), so which water body it is never affects the roll.
   *  Deterministic catch roll (`world/fishing.ts`), boosted by the spot's
   *  active bait. */
  const startFishing = (x: number, z: number): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.canAdd('fish', 1)) {
      toast.show(inventoryFullToastText(inventory, 'fish', 1), 'error')
      return
    }
    const spotId = fishingSpotId(x, z)
    const attempt = (fishingAttempts.get(spotId) ?? 0) + 1
    playActionFishingCast(worldAudio.playAt, { x, z })
    busy.start(FISHING_CAST_DURATION_SEC, 'Łowienie ryb…', () => {
      fishingAttempts.set(spotId, attempt)
      const hasBait = isBaitActive(fishingBait.get(spotId), dayNight.elapsedDays)
      if (!rollFishingCatch(spotId, attempt, hasBait)) {
        toast.show('Nic nie złapano.')
        return
      }
      if (!inventory.canAdd('fish', 1)) {
        toast.show(inventoryFullToastText(inventory, 'fish', 1), 'error')
        return
      }
      inventory.add('fish', 1, dayNight.elapsedDays)
      playInventoryPickUp(worldAudio.playOnce)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('+1 Ryba', 'pickup')
    })
  }

  /** Plan 159 §10 — consumes one bait-capable food item and applies/refreshes
   *  the cast spot's bait state. */
  const applyFishingBait = (x: number, z: number): void => {
    if (isActionBlocked(ctx)) return
    const kind = BAIT_ITEM_PRIORITY.find((k) => inventory.has(k, 1))
    if (!kind) {
      toast.show('Potrzebujesz przynęty — np. jagód lub mięsa.', 'error')
      return
    }
    if (!inventory.remove(kind, 1)) return
    const spotId = fishingSpotId(x, z)
    fishingBait.set(spotId, applyFishingBaitToSpot(fishingBait.get(spotId) ?? null, kind, dayNight.elapsedDays))
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Zanęcono wodę.', 'pickup')
  }

  /** Plan 159 §8 — single `[E]` action on a drying rack: idle → start a
   *  process from whatever raw meat/fish the player carries; complete →
   *  collect the output; still running → progress toast. */
  const interactDryingRack = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const rack = bundle.dryingRacks.list().find((entry) => entry.id === id)
    if (!rack) return
    if (rack.process) {
      if (!isDryingComplete(rack.process, dayNight.elapsedDays)) {
        toast.show('Suszy się…')
        return
      }
      const output = rack.process.output[0]
      if (!output) return
      if (!inventory.canAdd(output.kind, output.count)) {
        toast.show(inventoryFullToastText(inventory, output.kind, output.count), 'error')
        return
      }
      bundle.dryingRacks.clearProcess(id)
      inventory.add(output.kind, output.count, dayNight.elapsedDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show(`+${output.count} ${ITEM_DEFS[output.kind].label}`, 'pickup')
      return
    }
    const recipe = pickDryingRecipe((kind) => inventory.has(kind, 1))
    if (!recipe) {
      toast.show('Potrzebujesz surowego mięsa lub ryby.', 'error')
      return
    }
    if (!inventory.remove(recipe.inputKind, 1)) return
    bundle.dryingRacks.startProcess(id, startDryingProcess(`${id}:${Math.round(dayNight.elapsedDays * 1000)}`, recipe, dayNight.elapsedDays))
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Rozpoczęto suszenie.')
  }

  /** Plan 159 §11 — collects accrued honey; a deterministic per-day sting
   *  chance reuses the existing `damageHealth` path, no new damage system. */
  const collectHive = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const hive = bundle.hives.list().find((entry) => entry.id === id)
    if (!hive || hive.burned) {
      toast.show('Ten ul jest spalony.', 'error')
      return
    }
    if (honeyAvailable(hive, dayNight.elapsedDays) <= 0) {
      toast.show('Ul jest jeszcze pusty.', 'error')
      return
    }
    if (!inventory.canAdd('honey', 1)) {
      toast.show(inventoryFullToastText(inventory, 'honey', 1), 'error')
      return
    }
    const amount = bundle.hives.collect(id, dayNight.elapsedDays)
    if (amount <= 0) return
    inventory.add('honey', amount)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    if (rollHiveSting(id, dayNight.elapsedDays)) {
      damageHealth(player.health, HIVE_STING_DAMAGE)
      toast.show(`Użądlenie! +${amount} miodu`, 'error')
    } else {
      toast.show(`+${amount} miodu`, 'pickup')
    }
  }

  /** Plan 159 §11 — one-time burn reward, only while a lit torch/branch is
   *  held (reuses `PlayerTorch`, no new fire/detection system). */
  const burnHive = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!playerTorch.isLit()) {
      toast.show('Potrzebujesz zapalonej pochodni.', 'error')
      return
    }
    const reward = bundle.hives.burn(id)
    if (reward <= 0) {
      toast.show('Nie można tego spalić.', 'error')
      return
    }
    inventory.add('honey', reward)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show(`Ul spłonął. +${reward} miodu`, 'pickup')
  }

  /** Plan 172 — single `[E]` harvest action for a naturally-generated wild
   *  crop, reusing the existing gather/inventory flow. Mirrors the `item`
   *  branch's mutation order (`gameLoop.ts`): the capacity check happens
   *  *before* `ChunkManager.harvestCrop` removes anything from the world, so
   *  a full inventory never destroys a crop for nothing. `cropId`/`stage`
   *  come from the same-frame `Interactable` snapshot; `harvestCrop` still
   *  re-validates the authoritative current stage itself. */
  const harvestCrop = (id: string, cropId: CropId, stage: CropGrowthStage, x: number, z: number): void => {
    if (isActionBlocked(ctx)) return
    const expectedYield = resolveCropHarvest(CROP_DEFS[cropId], stage)
    if (!expectedYield) {
      toast.show('Nie ma tu jeszcze nic do zebrania.', 'error')
      return
    }
    if (!inventory.canAdd(expectedYield.kind, expectedYield.count)) {
      toast.show(inventoryFullToastText(inventory, expectedYield.kind, expectedYield.count), 'error')
      return
    }
    const outcome = bundle.chunkManager.harvestCrop(id)
    if (!outcome.ok) {
      toast.show('Ta roślina już zniknęła.', 'error')
      return
    }
    // Plan 176 §13 / settlements-npcs-001 §6/§7 — a crop inside a player
    // garden plot's radius has its yield scaled by the plot's resolved care
    // and hydration/drought stress; a crop nowhere near a plot (wild, or on
    // a settlement's decorative garden) keeps its full yield.
    const garden = findNearestGarden(bundle.playerGardens.list(), x, z)
    let count = outcome.yield.count
    let hydrationDead = false
    if (garden) {
      const care = resolveCultivationCare(garden, dayNight.elapsedDays)
      const hydrationState = bundle.playerGardens.hydrationOf(garden.id, dayNight.elapsedDays)
      hydrationDead = (hydrationState?.hydration ?? 100) <= 0
      count = cultivationYieldCount(outcome.yield.count, care, hydrationState?.droughtStressDays ?? 0, hydrationDead)
      bundle.playerGardens.recordHarvest(garden.id, dayNight.elapsedDays)
    }
    if (count <= 0) {
      toast.show(hydrationDead ? 'Roślina uschła z powodu suszy.' : 'Zbiory zniszczone przez zaniedbanie grządki.', 'error')
      return
    }
    inventory.add(outcome.yield.kind, count, dayNight.elapsedDays)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    playInventoryPickUp(worldAudio.playOnce)
    toast.show(`+${count} ${ITEM_DEFS[outcome.yield.kind].label}`, 'pickup')
  }

  return {
    armTrap,
    disarmTrap,
    collectTrap,
    onTrapCapture,
    onTrapBaitReturned,
    startFishing,
    applyFishingBait,
    interactDryingRack,
    collectHive,
    burnHive,
    harvestCrop,
  }
}
