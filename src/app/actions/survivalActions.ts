import type { AnimalAgent } from '../../fauna/AnimalAgent'
import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { ItemKind } from '../../items/items'
import type { VillageFire } from '../../settlement/VillageFire'
import type { WaterSource } from '../../world/WaterSource'
import { playActionDig, playActionWell } from '../../audio/actionSounds'
import { playInventoryPickUp } from '../../audio/inventorySounds'
import { BURY_DURATION_SEC, HARVEST_MEAT_DURATION_SEC } from '../../fauna/AnimalAgent'
import { meatKindForAnimal } from '../../fauna/animalMeat'
import {
  DESTROY_SPAWNER_DURATION_SEC,
  SPAWNER_DESTROY_BRANCH_COST,
} from '../../fauna/AnimalSpawner'
import { spawnerDestroyBusyLabel } from '../../fauna/createFauna'
import { COOK_DURATION_SEC, findCookingRecipe } from '../../items/campfireCooking'
import { getFreshnessStage } from '../../items/foodFreshness'
import { inventoryFullToastText } from '../../items/Inventory'
import { hasItemCapability, ITEM_CATALOG } from '../../items/itemCatalog'
import { ITEM_DEFS } from '../../items/items'
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
import { IGNITE_DURATION_SEC } from '../../settlement/VillageFire'
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
        if (!animal.canHarvestMeat() || !inventory.canAdd(meatKind, 1)) return
        animal.harvestMeat()
        inventory.add(meatKind, 1, dayNight.elapsedDays)
        let message = `+1 ${ITEM_DEFS[meatKind].label}`
        if (inventory.canAdd('hide', 1)) {
          inventory.add('hide', 1)
          message += ', +1 skóra'
        }
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
    if (!inventory.has('branch', 1)) {
      toast.show('Potrzebujesz gałęzi, żeby je zapalić.', 'error')
      return
    }
    // Survival is read once, when the channel starts — a running channel is
    // never retimed (plan 128 §3.1).
    const duration = IGNITE_DURATION_SEC * survivalDurationMultiplier(player.skills.survival.value)
    busy.start(duration, 'Rozpalanie ogniska…', () => {
      if (fire.isLit() || !inventory.remove('branch', 1)) return
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

  /** Cooks the first held recipe's input at a lit campfire (plan 106 §6). */
  const startCookAt = (fire: VillageFire): void => {
    if (isActionBlocked(ctx)) return
    if (!fire.isLit()) {
      toast.show('Ognisko musi się palić.', 'error')
      return
    }
    const recipe = findCookingRecipe(inventory)
    if (!recipe) {
      toast.show('Potrzebujesz surowego mięsa.', 'error')
      return
    }
    if (!inventory.canAdd(recipe.output, recipe.count)) {
      toast.show(inventoryFullToastText(inventory, recipe.output, recipe.count), 'error')
      return
    }
    busy.start(COOK_DURATION_SEC, 'Pieczenie mięsa…', () => {
      if (!fire.isLit()) {
        toast.show('Ogień zgasł.', 'error')
        return
      }
      const hasRoom = inventory.canAdd(recipe.output, recipe.count)
      if (!hasRoom || !inventory.remove(recipe.input, 1)) {
        toast.show(hasRoom ? 'Ekwipunek jest za ciężki.' : inventoryFullToastText(inventory, recipe.output, recipe.count), 'error')
        return
      }
      inventory.add(recipe.output, recipe.count, dayNight.elapsedDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.cookMeat)
      toast.show(`+${recipe.count} ${ITEM_DEFS[recipe.output].label}`, 'pickup')
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

  /** Instant fill of a carried empty waterskin (plan 106 §4). Removes the
   *  empty one first, then adds the full one — if the (heavier) full
   *  waterskin doesn't fit, the empty one is refunded rather than lost. */
  const fillWaterskin = (): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.remove('waterskin_empty', 1)) {
      toast.show('Potrzebujesz pustego bukłaka.', 'error')
      return
    }
    if (!inventory.add('waterskin_full', 1)) {
      const toastText = inventoryFullToastText(inventory, 'waterskin_full', 1)
      inventory.add('waterskin_empty', 1)
      toast.show(toastText, 'error')
      return
    }
    playActionWell(worldAudio.playAt, player.mesh.position)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Napełniono bukłak.', 'pickup')
  }

  /** Inventory-screen "Zjedz"/"Wypij" (plan 106) — driven by
   *  `ITEM_CATALOG[kind].consumable`, the same catalog entry the well/lake/
   *  cooking paths' relief amounts come from. */
  const consumeItem = (kind: ItemKind): void => {
    const entry = ITEM_CATALOG[kind].consumable
    if (!entry || !inventory.has(kind, 1)) return
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
