import type { AnimalAgent } from '../../fauna/AnimalAgent'
import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { ItemKind } from '../../items/items'
import type { VillageFire } from '../../settlement/VillageFire'
import type { WaterSource } from '../../world/WaterSource'
import { playActionDig, playActionWell } from '../../audio/actionSounds'
import { playInventoryPickUp } from '../../audio/inventorySounds'
import { BURY_DURATION_SEC, HARVEST_MEAT_DURATION_SEC } from '../../fauna/AnimalAgent'
import { harvestAnimalIntoInventory } from '../../fauna/animalHarvest'
import { meatKindForAnimal } from '../../fauna/animalMeat'
import {
  DESTROY_SPAWNER_DURATION_SEC,
  SPAWNER_DESTROY_BRANCH_COST,
} from '../../fauna/AnimalSpawner'
import { spawnerDestroyBusyLabel } from '../../fauna/createFauna'
import { COOK_DURATION_SEC, findCookingBatch, resolveCookingCapacity } from '../../items/campfireCooking'
import { getFreshnessStage } from '../../items/foodFreshness'
import { inventoryFullToastText } from '../../items/Inventory'
import { hasItemCapability, ITEM_CATALOG } from '../../items/itemCatalog'
import { isLiquidContainerInstance, isLiquidContainerKind, LIQUID_CONTAINER_KIND_LIST, type LiquidContainerItemInstance } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import {
  canDrinkFromLiquidContainer,
  canFillLiquidContainer,
  drinkFromLiquidContainer,
  fillLiquidContainer,
  liquidContainerCapacity,
} from '../../items/liquidContainer'
import {
  drinkWater as drinkWaterNeeds,
  eatFood,
} from '../../player/PlayerNeeds'
import {
  awardSkillXp,
  SKILL_XP_AWARD,
  survivalDurationMultiplier,
  survivalFoodMultiplier,
} from '../../player/PlayerSkills'
import { FIRE_FUEL_KINDS, IGNITE_DURATION_SEC } from '../../settlement/VillageFire'
import { healHealth } from '../../shared/HealthState'
import { DRINK_THIRST_RELIEF, UNSAFE_WATER_WARNING } from '../../world/WaterSource'
import { isActionBlocked, isChannelBusy, type PlayerActionContext } from './actionContext'

/** Survival-loop actions on the world around the player: butchering/burying a
 *  corpse, lighting and cooking at a campfire, destroying a depleted habitat,
 *  drinking/filling at a `WaterSource`, and eating what's in the bag. They all
 *  read the same `PlayerNeeds`/`HealthState`/`PlayerSkills` state the HUD
 *  shows — none of them introduces a parallel need or damage system. */
export type SurvivalActions = {
  startBuryCorpse: (animal: AnimalAgent) => void
  startHarvestMeat: (animal: AnimalAgent) => void
  startIgniteFire: (fire: VillageFire) => void
  startCookAt: (fire: VillageFire) => void
  startDestroySpawner: (spawner: PreySpawner) => void
  drinkFromWaterSource: (source: WaterSource) => void
  fillWaterskin: () => void
  consumeItem: (kind: ItemKind) => void
}

export function createSurvivalActions(ctx: PlayerActionContext): SurvivalActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, worldAudio } = ctx

  const startBuryCorpse = (animal: AnimalAgent): void => {
    if (!hasItemCapability(heldTool.held(), 'soil_digging') || isChannelBusy(ctx)) return
    if (!animal.isDead() || animal.readyToRemove()) return
    playActionDig(worldAudio.playOnce)
    busy.start(BURY_DURATION_SEC, 'Zakopywanie…', () => {
      if (!animal.isDead() || animal.readyToRemove()) return
      animal.bury()
      toast.show('Zwłoki zakopane.')
    })
  }

  /** Knife-harvest meat from a corpse (plan 106; species-specific kind +
   *  hide byproduct added in plan 134) — same shape as `startBuryCorpse`,
   *  just knife-gated and yielding item(s) instead of disposing the corpse. */
  const startHarvestMeat = (animal: AnimalAgent): void => {
    if (isActionBlocked(ctx)) return
    if (!hasItemCapability(heldTool.held(), 'meat_harvesting')) {
      // Auto-equip from inventory (plan 153) — same pattern as
      // `lightWoodenTorch` in `userActions.ts`: only when the hand is free,
      // never displacing another held tool. `findWithCapability` returns the
      // best carried harvest tool, so a damascus knife still wins over a
      // plain one (plan 160).
      if (heldTool.held() !== null) return
      const knifeKind = inventory.findWithCapability('meat_harvesting')
      if (!knifeKind || !heldTool.equip(knifeKind)) return
      ctx.syncHeldHud()
    }
    if (!animal.canHarvestMeat()) return
    const meatKind = meatKindForAnimal(animal.def.kind)
    if (!inventory.canAdd(meatKind, 1)) {
      toast.show(inventoryFullToastText(inventory, meatKind, 1), 'error')
      return
    }
    animal.holdCorpse()
    busy.start(HARVEST_MEAT_DURATION_SEC, 'Wycinanie mięsa…', () => {
      try {
        const result = harvestAnimalIntoInventory(animal, inventory, dayNight.elapsedDays)
        if (!result) return
        let message = `+1 ${ITEM_DEFS[result.meatKind].label}`
        if (result.hide) message += ', +1 skóra'
        playInventoryPickUp(worldAudio.playOnce)
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        toast.show(message, 'pickup')
      } finally {
        animal.releaseCorpseHold()
      }
    }, { blurred: true, onCancel: () => animal.releaseCorpseHold() })
  }

  /** Lights an unlit campfire (busy channel, blurred) — "dołóż gałąź" on an
   *  already-lit fire stays instant/inline in `gameLoop.ts`, not routed
   *  through here. */
  const startIgniteFire = (fire: VillageFire): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.hasCapability('fire_starting')) {
      toast.show('Potrzebujesz krzesiwa, żeby rozpalić ogień.', 'error')
      return
    }
    if (!FIRE_FUEL_KINDS.some((kind) => inventory.has(kind, 1))) {
      toast.show('Potrzebujesz gałęzi lub belki, żeby je zapalić.', 'error')
      return
    }
    // Survival is read once, when the channel starts — a running channel is
    // never retimed (plan 128 §3.1).
    const duration = IGNITE_DURATION_SEC * survivalDurationMultiplier(player.skills.survival.value)
    busy.start(duration, 'Rozpalanie ogniska…', () => {
      if (fire.isLit()) return
      let consumedFuel = false
      for (const kind of FIRE_FUEL_KINDS) {
        if (inventory.remove(kind, 1)) {
          consumedFuel = true
          break
        }
      }
      if (!consumedFuel) return
      fire.light()
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.igniteFire)
      toast.show('Ognisko zapłonęło.')
    }, { blurred: true })
  }

  /** `[E] Zniszcz` on a `depleted` spawn point (plan 137) — busy channel with
   *  progress bar; branches are spent only on complete (Esc is a no-op). */
  const startDestroySpawner = (spawner: PreySpawner): void => {
    if (isActionBlocked(ctx)) return
    if (spawner.state !== 'depleted') return
    if (!inventory.has('branch', SPAWNER_DESTROY_BRANCH_COST)) {
      toast.show('Potrzebujesz 4 gałęzi.', 'error')
      return
    }
    busy.start(DESTROY_SPAWNER_DURATION_SEC, spawnerDestroyBusyLabel(spawner.type), () => {
      if (spawner.state !== 'depleted') {
        toast.show('Nie można już tego zniszczyć.', 'error')
        return
      }
      if (!inventory.remove('branch', SPAWNER_DESTROY_BRANCH_COST)) {
        toast.show('Potrzebujesz 4 gałęzi.', 'error')
        return
      }
      if (!bundle.fauna.destroySpawner(spawner.id, dayNight.elapsedDays)) {
        inventory.add('branch', SPAWNER_DESTROY_BRANCH_COST)
        toast.show('Nie można już tego zniszczyć.', 'error')
        return
      }
      // 4 consumed branches become the pit's fuel: `light` sets one branch of
      // fuel, then three `addFuel` calls bring it to ~300 s (`FUEL_PER_BRANCH`).
      const entry = bundle.placedFires.place(spawner.x, spawner.z, 'pit', { habitatBurn: true })
      entry.fire.light('player')
      entry.fire.addFuel()
      entry.fire.addFuel()
      entry.fire.addFuel()
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Siedlisko zniszczone.', 'pickup')
    }, { blurred: true })
  }

  /** Cooks the first held recipe's input at a lit campfire, up to the
   *  station's capacity — 1 for a bare fire, 2 with a carried `pan`, 4 once
   *  this fire has a grate (plan 175 §5/§6, `campfireCooking.ts`'s
   *  `resolveCookingCapacity`/`findCookingBatch`). Still one busy channel
   *  producing `batch × recipe.count` of the output at once, not N separate
   *  cooking actions. */
  const startCookAt = (fire: VillageFire): void => {
    if (isActionBlocked(ctx)) return
    if (!fire.isLit()) {
      toast.show('Ognisko musi się palić.', 'error')
      return
    }
    const capacity = resolveCookingCapacity(fire, inventory)
    const found = findCookingBatch(inventory, capacity)
    if (!found) {
      toast.show('Potrzebujesz surowego mięsa.', 'error')
      return
    }
    const { recipe } = found
    const outputFor = (batch: number): number => batch * recipe.count
    if (!inventory.canAdd(recipe.output, outputFor(found.batch))) {
      toast.show(inventoryFullToastText(inventory, recipe.output, outputFor(found.batch)), 'error')
      return
    }
    const label = found.batch > 1 ? `Pieczenie mięsa (${found.batch}×)…` : 'Pieczenie mięsa…'
    busy.start(COOK_DURATION_SEC, label, () => {
      if (!fire.isLit()) {
        toast.show('Ogień zgasł.', 'error')
        return
      }
      // Re-clamped against inventory as it stands right now — the channel may
      // have run long enough for the carried amount to have changed.
      const batch = Math.min(capacity, inventory.count(recipe.input))
      if (batch <= 0) {
        toast.show('Potrzebujesz surowego mięsa.', 'error')
        return
      }
      const outputCount = outputFor(batch)
      const hasRoom = inventory.canAdd(recipe.output, outputCount)
      if (!hasRoom || !inventory.remove(recipe.input, batch)) {
        toast.show(hasRoom ? 'Ekwipunek jest za ciężki.' : inventoryFullToastText(inventory, recipe.output, outputCount), 'error')
        return
      }
      inventory.add(recipe.output, outputCount, dayNight.elapsedDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.cookMeat)
      toast.show(`+${outputCount} ${ITEM_DEFS[recipe.output].label}`, 'pickup')
    }, { blurred: true })
  }

  /** Instant drink at a well/lake (plan 106 §4) — no busy channel, matching
   *  other instant world actions (item pickup). */
  const drinkFromWaterSource = (source: WaterSource): void => {
    if (isActionBlocked(ctx)) return
    drinkWaterNeeds(player.needs, DRINK_THIRST_RELIEF)
    playActionWell(worldAudio.playAt, player.mesh.position)
    toast.show(source.quality === 'unsafe' ? UNSAFE_WATER_WARNING : 'Napito się wody.', source.quality === 'unsafe' ? 'error' : undefined)
  }

  /** All carried liquid-container instances (waterskins and buckets, plan
   *  items-player-001 §2/§7, extended to buckets by plan
   *  settlements-npcs-001 §10/§11 so a bucket can actually be filled for
   *  watering), smallest capacity first. */
  function carriedWaterContainers(): LiquidContainerItemInstance[] {
    return LIQUID_CONTAINER_KIND_LIST.flatMap((kind) => inventory.getInstances(kind))
      .filter(isLiquidContainerInstance)
      .sort((a, b) => liquidContainerCapacity(a.kind) - liquidContainerCapacity(b.kind))
  }

  /** Instant fill of a carried waterskin/bucket at a well/lake (plan 106 §4,
   *  updated by plan items-player-001 for partial content, extended to
   *  buckets by plan settlements-npcs-001): tops up the smallest carried
   *  container instance that isn't already full of water, in one instant
   *  action — no separate empty/full `ItemKind` swap any more. */
  const fillWaterskin = (): void => {
    if (isActionBlocked(ctx)) return
    const carried = carriedWaterContainers()
    const target = carried.find((inst) => canFillLiquidContainer(inst, 'water'))
    if (target) {
      inventory.updateInstance(target.id, (inst) => fillLiquidContainer(inst as LiquidContainerItemInstance, 'water')!)
      playActionWell(worldAudio.playAt, player.mesh.position)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Napełniono pojemnik.', 'pickup')
      return
    }
    toast.show(carried.length > 0 ? 'Pojemnik jest już pełny.' : 'Potrzebujesz pojemnika na wodę.', 'error')
  }

  /** Inventory-screen "Zjedz"/"Wypij" (plan 106) — driven by
   *  `ITEM_CATALOG[kind].consumable`, the same catalog entry the well/lake/
   *  cooking paths' relief amounts come from. */
  const consumeItem = (kind: ItemKind): void => {
    const entry = ITEM_CATALOG[kind].consumable
    if (!entry || !inventory.holdsAny(kind)) return
    // Plan items-player-001 — a waterskin drinks one portion off a concrete
    // `LiquidContainerItemInstance` (`items/liquidContainer.ts`), not a
    // whole-item remove/resultKind swap: the same carried instance stays
    // present, empty or not.
    if (isLiquidContainerKind(kind)) {
      const target = inventory.getInstances(kind).filter(isLiquidContainerInstance).find((inst) => canDrinkFromLiquidContainer(inst))
      if (!target) {
        toast.show('Bukłak jest pusty.', 'error')
        return
      }
      inventory.updateInstance(target.id, (inst) => drinkFromLiquidContainer(inst as LiquidContainerItemInstance)!)
      drinkWaterNeeds(player.needs, entry.relief)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      ctx.refreshInventoryScreen()
      toast.show('Wypito.', 'pickup')
      return
    }
    // Plan 159 §3/§5 — spoiled food is non-consumable rather than acting
    // like fresh food; checked against the batch that would actually be
    // eaten (oldest first, same order `remove()` consumes in).
    const acquiredAtDays = inventory.oldestAcquiredAtDays(kind)
    if (acquiredAtDays != null && getFreshnessStage(kind, acquiredAtDays, dayNight.elapsedDays) === 'spoiled') {
      toast.show('To jedzenie się zepsuło.', 'error')
      return
    }
    if (!inventory.remove(kind, 1)) return
    if (entry.resultKind) inventory.add(entry.resultKind, 1)
    // Plan 128 §4 — Survival makes the *same* `roasted_meat` more nourishing;
    // no roasted variants, no skill-dependent recipes.
    const relief = kind === 'roasted_meat'
      ? entry.relief * survivalFoodMultiplier(player.skills.survival.value)
      : entry.relief
    if (entry.need === 'hunger') eatFood(player.needs, relief)
    else if (entry.need === 'thirst') drinkWaterNeeds(player.needs, relief)
    else healHealth(player.health, relief)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    ctx.refreshInventoryScreen()
    toast.show(entry.need === 'hunger' ? 'Zjedzono.' : entry.need === 'thirst' ? 'Wypito.' : 'Opatrzono rany.', 'pickup')
  }

  return {
    startBuryCorpse,
    startHarvestMeat,
    startIgniteFire,
    startCookAt,
    startDestroySpawner,
    drinkFromWaterSource,
    fillWaterskin,
    consumeItem,
  }
}
