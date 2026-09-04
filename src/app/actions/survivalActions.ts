import type { AnimalAgent } from '../../fauna/AnimalAgent'
import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { ItemKind } from '../../items/items'
import type { VillageFire } from '../../settlement/VillageFire'
import type { WaterSource } from '../../world/WaterSource'
import { playActionDig, playActionWell } from '../../audio/actionSounds'
import { playAnimalSound } from '../../audio/animalSounds'
import { playInventoryPickUp } from '../../audio/inventorySounds'
import { ANIMAL_LABELS, BURY_DURATION_SEC, HARVEST_MEAT_DURATION_SEC, selectDietFeedKind } from '../../fauna/AnimalAgent'
import { harvestAnimalIntoInventory } from '../../fauna/animalHarvest'
import { meatKindForAnimal } from '../../fauna/animalMeat'
import {
  DESTROY_SPAWNER_DURATION_SEC,
  SPAWNER_DESTROY_BRANCH_COST,
} from '../../fauna/AnimalSpawner'
import { spawnerDestroyBusyLabel } from '../../fauna/createFauna'
import { COOK_DURATION_SEC, findCookingBatch, resolveCookingCapacity } from '../../items/campfireCooking'
import { getFreshnessStage } from '../../items/foodFreshness'
import { type Inventory, inventoryFullToastText } from '../../items/Inventory'
import { CAPABILITY_NEED_LABEL, hasItemCapability, ITEM_CATALOG } from '../../items/itemCatalog'
import { isLiquidContainerInstance, isLiquidContainerKind, LIQUID_CONTAINER_KIND_LIST, type LiquidContainerItemInstance } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import {
  addLiquidToContainer,
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
import { damageHealth, healHealth } from '../../shared/HealthState'
import { drainVigor } from '../../shared/VigorState'
import {
  DRINK_THIRST_RELIEF,
  UNCOVERED_WELL_WARNING,
  UNDRINKABLE_WATER_WARNING,
  UNSAFE_WATER_WARNING,
  WELL_ROPE_REQUIRED_WARNING,
} from '../../world/WaterSource'
import { isActionBlocked, isChannelBusy, type PlayerActionContext } from './actionContext'
import { type ActionResult, capabilityRequirement, itemRequirement, targetRequirement, toResult } from './actionContracts'

/** Survival-loop actions on the world around the player: butchering/burying a
 *  corpse, lighting and cooking at a campfire, destroying a depleted habitat,
 *  drinking/filling at a `WaterSource`, and eating what's in the bag. They all
 *  read the same `PlayerNeeds`/`HealthState`/`PlayerSkills` state the HUD
 *  shows — none of them introduces a parallel need or damage system. */
export type SurvivalActions = {
  startBuryCorpse: (animal: AnimalAgent) => ActionResult
  startHarvestMeat: (animal: AnimalAgent) => ActionResult
  startIgniteFire: (fire: VillageFire) => ActionResult
  startCookAt: (fire: VillageFire) => ActionResult
  startDestroySpawner: (spawner: PreySpawner) => ActionResult
  drinkFromWaterSource: (source: WaterSource) => ActionResult
  fillWaterskin: (source: WaterSource) => ActionResult
  consumeItem: (kind: ItemKind) => ActionResult
  /** Milks a live `cow`/`sheep` into a carried bucket (busy channel, plan
   *  fauna-002 §3/§4). */
  startMilkAnimal: (animal: AnimalAgent) => ActionResult
}

/** Real-time seconds per litre of milk drawn — the shared rate behind
 *  `startMilkAnimal`'s busy-channel duration, so a cow's larger yield takes
 *  proportionally longer than a sheep's (plan fauna-002 §3.2/§4.2) without
 *  hardcoding either species' duration directly in the interaction logic. */
const MILK_SECONDS_PER_LITRE = 3

/** All carried liquid-container instances that could accept at least some
 *  milk right now (empty, or already partway full of milk) — smallest
 *  capacity first, same "use the smallest suitable container" convention as
 *  `survivalActions.ts`'s own `carriedWaterContainers`. Exported so
 *  `interactables.ts` can gate the "Wydój" prompt on the same check the
 *  action itself uses, without duplicating the filter. */
export function hasCarriedMilkContainer(inventory: Inventory): boolean {
  return LIQUID_CONTAINER_KIND_LIST.some((kind) =>
    inventory.getInstances(kind).some((inst) => isLiquidContainerInstance(inst) && canFillLiquidContainer(inst, 'milk')),
  )
}

/** Narrow view of `AnimalAgent` `feedAnimal()` actually needs — every real
 *  `AnimalAgent` satisfies this structurally, so callers pass one unchanged;
 *  narrowed only so `feedAnimal.test.ts` can exercise the "consume only on
 *  success" contract without constructing a full agent/mesh. */
export type FeedableAnimal = {
  def: { diet?: { items?: Partial<Record<ItemKind, number>> } }
  feedByPlayer: (itemKind: ItemKind) => boolean
}

/** Player -> animal feeding (plan fauna-011 §6) — a generic seam for any
 *  species with `def.diet.items`, not a species-specific `feedDog()`.
 *  Reuses the exact contract autonomous household feeding already uses
 *  (`selectDietFeedKind`/`AnimalAgent.feedByPlayer`); `Inventory.remove()`
 *  only runs after `feedByPlayer` actually applied hunger relief, so an
 *  interrupted/invalid feed never consumes the item. Returns `false` (no-op)
 *  for an animal with no configured diet, or when the player carries nothing
 *  compatible. */
export function feedAnimal(animal: FeedableAnimal, inventory: Inventory): boolean {
  const dietItems = animal.def.diet?.items
  if (!dietItems) return false
  const feedKind = selectDietFeedKind(inventory, dietItems)
  if (!feedKind || !animal.feedByPlayer(feedKind)) return false
  inventory.remove(feedKind, 1)
  return true
}

export function createSurvivalActions(ctx: PlayerActionContext): SurvivalActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, worldAudio } = ctx

  const startBuryCorpse = (animal: AnimalAgent): ActionResult => {
    if (isChannelBusy(ctx)) return { ok: false, missing: [] }
    const result = toResult([
      capabilityRequirement(hasItemCapability(heldTool.held(), 'soil_digging'), 'soil_digging'),
      targetRequirement(animal.isDead() && !animal.readyToRemove(), 'corpseAvailable'),
    ])
    if (!result.ok) return result
    playActionDig(worldAudio.playOnce)
    busy.start(BURY_DURATION_SEC, 'Zakopywanie…', () => {
      if (!animal.isDead() || animal.readyToRemove()) return
      animal.bury()
      toast.show('Zwłoki zakopane.')
    })
    return { ok: true }
  }

  /** Knife-harvest meat from a corpse (plan 106; species-specific kind +
   *  hide byproduct added in plan 134) — same shape as `startBuryCorpse`,
   *  just knife-gated and yielding item(s) instead of disposing the corpse. */
  const startHarvestMeat = (animal: AnimalAgent): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    if (!hasItemCapability(heldTool.held(), 'meat_harvesting')) {
      // Auto-equip from inventory (plan 153) — same pattern as
      // `lightWoodenTorch` in `userActions.ts`: only when the hand is free,
      // never displacing another held tool. `findWithCapability` returns the
      // best carried harvest tool, so a damascus knife still wins over a
      // plain one (plan 160).
      if (heldTool.held() !== null) return toResult([targetRequirement(false, 'freeHand')])
      const knifeKind = inventory.findWithCapability('meat_harvesting')
      if (!knifeKind || !heldTool.equip(knifeKind)) return toResult([capabilityRequirement(false, 'meat_harvesting')])
      ctx.syncHeldHud()
    }
    if (!animal.canHarvestMeat()) return toResult([targetRequirement(false, 'corpseAvailable')])
    const meatKind = meatKindForAnimal(animal.def.kind)
    if (!inventory.canAdd(meatKind, 1)) {
      toast.show(inventoryFullToastText(inventory, meatKind, 1), 'error')
      return toResult([targetRequirement(false, 'inventoryFull')])
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
    return { ok: true }
  }

  /** Lights an unlit campfire (busy channel, blurred) — "dołóż gałąź" on an
   *  already-lit fire stays instant/inline in `gameLoop.ts`, not routed
   *  through here. */
  const startIgniteFire = (fire: VillageFire): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    if (!inventory.hasCapability('fire_starting')) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.fire_starting}.`, 'error')
      return toResult([capabilityRequirement(false, 'fire_starting')])
    }
    if (!FIRE_FUEL_KINDS.some((kind) => inventory.has(kind, 1))) {
      toast.show('Potrzebujesz gałęzi lub belki, żeby je zapalić.', 'error')
      return toResult([targetRequirement(false, 'fireFuel')])
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
    return { ok: true }
  }

  /** `[E] Zniszcz` on a `depleted` spawn point (plan 137) — busy channel with
   *  progress bar; branches are spent only on complete (Esc is a no-op). */
  const startDestroySpawner = (spawner: PreySpawner): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    if (spawner.state !== 'depleted') return toResult([targetRequirement(false, 'spawnerDepleted')])
    const result = toResult([itemRequirement(inventory.count('branch'), SPAWNER_DESTROY_BRANCH_COST, 'branch')])
    if (!result.ok) {
      toast.show('Potrzebujesz 4 gałęzi.', 'error')
      return result
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
    return { ok: true }
  }

  /** Cooks the first held recipe's input at a lit campfire, up to the
   *  station's capacity — 1 for a bare fire, 2 with a carried `pan`, 4 once
   *  this fire has a grate (plan 175 §5/§6, `campfireCooking.ts`'s
   *  `resolveCookingCapacity`/`findCookingBatch`). Still one busy channel
   *  producing `batch × recipe.count` of the output at once, not N separate
   *  cooking actions. */
  const startCookAt = (fire: VillageFire): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    if (!fire.isLit()) {
      toast.show('Ognisko musi się palić.', 'error')
      return toResult([targetRequirement(false, 'fireLit')])
    }
    const capacity = resolveCookingCapacity(fire, inventory)
    const found = findCookingBatch(inventory, capacity)
    if (!found) {
      toast.show('Potrzebujesz surowego mięsa lub ryby.', 'error')
      return toResult([targetRequirement(false, 'cookableFood')])
    }
    const { recipe } = found
    const outputFor = (batch: number): number => batch * recipe.count
    if (!inventory.canAdd(recipe.output, outputFor(found.batch))) {
      toast.show(inventoryFullToastText(inventory, recipe.output, outputFor(found.batch)), 'error')
      return toResult([targetRequirement(false, 'inventoryFull')])
    }
    // `recipe.output` alone tells us what's on the fire — no separate
    // "is this a fish recipe" flag to keep in sync with `COOKING_RECIPES`.
    const verb = recipe.output === 'roasted_fish' ? 'Pieczenie ryby' : 'Pieczenie mięsa'
    const label = found.batch > 1 ? `${verb} (${found.batch}×)…` : `${verb}…`
    busy.start(COOK_DURATION_SEC, label, () => {
      if (!fire.isLit()) {
        toast.show('Ogień zgasł.', 'error')
        return
      }
      // Re-clamped against inventory as it stands right now — the channel may
      // have run long enough for the carried amount to have changed.
      const batch = Math.min(capacity, inventory.count(recipe.input))
      if (batch <= 0) {
        toast.show('Potrzebujesz surowego mięsa lub ryby.', 'error')
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
    return { ok: true }
  }

  /** A deep player-built well's `requiresRope` gates *drawing* its water at
   *  all (plan world-004 §4) — an ordinary carried-item check (never
   *  consumed), shared by `drinkFromWaterSource` and `fillWaterskin` so
   *  neither path can bypass it. */
  const hasRopeIfRequired = (source: WaterSource): boolean => {
    if (!source.requiresRope) return true
    if (inventory.count('rope') > 0) return true
    toast.show(WELL_ROPE_REQUIRED_WARNING, 'error')
    return false
  }

  /** Instant drink at a well/lake/river/ocean (plan 106 §4, source-aware
   *  drinkability by plan world-011) — no busy channel, matching other
   *  instant world actions (item pickup). `undrinkable` (ocean) is refused
   *  outright: thirst is left unchanged and no drink sound plays.
   *  `consumptionRisk` (plan world-004 §6 — currently only an uncovered
   *  player-built well) is rolled here, at the moment of direct
   *  consumption, never at collection/build time; filling a container
   *  (`fillWaterskin`) doesn't carry the risk forward — same "can't mark a
   *  filled instance as risky later" limitation `UNDRINKABLE_WATER_WARNING`
   *  already accepts for salt water. */
  const drinkFromWaterSource = (source: WaterSource): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    if (source.quality === 'undrinkable') {
      toast.show(UNDRINKABLE_WATER_WARNING, 'error')
      return toResult([targetRequirement(false, 'drinkableWater')])
    }
    if (!hasRopeIfRequired(source)) return toResult([itemRequirement(0, 1, 'rope')])
    drinkWaterNeeds(player.needs, DRINK_THIRST_RELIEF)
    playActionWell(worldAudio.playAt, player.mesh.position)
    const risk = source.consumptionRisk
    if (risk && Math.random() < risk.chance) {
      const hpDamage = Math.round(risk.hpDamageMin + Math.random() * (risk.hpDamageMax - risk.hpDamageMin))
      damageHealth(player.health, hpDamage)
      drainVigor(player.needs.vigor, risk.vigorLoss)
      toast.show(UNCOVERED_WELL_WARNING, 'error')
    } else {
      toast.show(source.quality === 'unsafe' ? UNSAFE_WATER_WARNING : 'Napito się wody.', source.quality === 'unsafe' ? 'error' : undefined)
    }
    return { ok: true }
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

  /** Instant fill of a carried waterskin/bucket at a well/lake/river (plan
   *  106 §4, updated by plan items-player-001 for partial content, extended
   *  to buckets by plan settlements-npcs-001): tops up the smallest carried
   *  container instance that isn't already full of water, in one instant
   *  action — no separate empty/full `ItemKind` swap any more. Source-aware
   *  as of plan world-011: an `undrinkable` source (ocean) is refused before
   *  touching `Inventory` at all, since a filled container can't later be
   *  told apart from ordinary fresh water. */
  const fillWaterskin = (source: WaterSource): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    if (source.quality === 'undrinkable') {
      toast.show(UNDRINKABLE_WATER_WARNING, 'error')
      return toResult([targetRequirement(false, 'drinkableWater')])
    }
    if (!hasRopeIfRequired(source)) return toResult([itemRequirement(0, 1, 'rope')])
    const carried = carriedWaterContainers()
    const target = carried.find((inst) => canFillLiquidContainer(inst, 'water'))
    if (target) {
      inventory.updateInstance(target.id, (inst) => fillLiquidContainer(inst as LiquidContainerItemInstance, 'water')!)
      playActionWell(worldAudio.playAt, player.mesh.position)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Napełniono pojemnik.', 'pickup')
      return { ok: true }
    }
    toast.show(carried.length > 0 ? 'Pojemnik jest już pełny.' : 'Potrzebujesz pojemnika na wodę.', 'error')
    return toResult([targetRequirement(false, carried.length > 0 ? 'containerFull' : 'waterContainer')])
  }

  /** Carried liquid-container instances that could hold at least some milk
   *  right now — same shape as `carriedWaterContainers`, filtered for the
   *  `milk`-specific rules (`canFillLiquidContainer` already refuses a
   *  container currently holding water). */
  function carriedMilkContainers(): LiquidContainerItemInstance[] {
    return LIQUID_CONTAINER_KIND_LIST.flatMap((kind) => inventory.getInstances(kind))
      .filter(isLiquidContainerInstance)
      .filter((inst) => canFillLiquidContainer(inst, 'milk'))
      .sort((a, b) => liquidContainerCapacity(a.kind) - liquidContainerCapacity(b.kind))
  }

  /** Milks a live `cow`/`sheep` into the smallest carried bucket with room
   *  for it (plan fauna-002 §3/§4) — a busy channel (existing "activity in
   *  time" mechanism) whose duration scales with the species' configured
   *  yield (`AnimalDef.production.amount`), so a sheep's smaller yield
   *  finishes faster than a cow's. Esc-cancelling the channel (existing busy
   *  cancel path) grants no milk at all, same "no partial credit" shape as
   *  `startHarvestMeat`/`startIgniteFire`. */
  const startMilkAnimal = (animal: AnimalAgent): ActionResult => {
    if (isActionBlocked(ctx)) return { ok: false, missing: [] }
    const production = animal.def.production
    if (!production || production.product !== 'milk' || !animal.canBeMilked(dayNight.elapsedDays)) {
      return toResult([targetRequirement(false, 'animalMilkable')])
    }
    const target = carriedMilkContainers()[0]
    if (!target) {
      toast.show('Potrzebujesz pustego wiadra.', 'error')
      return toResult([targetRequirement(false, 'milkContainer')])
    }
    const label = ANIMAL_LABELS[animal.def.kind]
    busy.start(production.amount * MILK_SECONDS_PER_LITRE, `Dojenie: ${label}…`, () => {
      // Re-checked fresh at completion, not the snapshot from when the
      // channel started — the action can take several real seconds.
      if (!animal.canBeMilked(dayNight.elapsedDays)) return
      let poured = 0
      const applied = inventory.updateInstance(target.id, (current) => {
        const result = addLiquidToContainer(current as LiquidContainerItemInstance, 'milk', production.amount)
        if (!result) return current
        poured = result.poured
        return result.instance
      })
      if (!applied || poured <= 0) return
      animal.startMilkCooldown(dayNight.elapsedDays)
      // Contextual vocalization (plan settlements-npcs-004 §2) — the animal
      // reacts to the direct interaction, same clip/volume as the `[E]`
      // interact sound, always plays (a completed player action, not a
      // throttled ambient roll).
      playAnimalSound(animal.def.kind, worldAudio.playAt, animal.mesh.position)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show(`+${poured} l mleka`, 'pickup')
    }, { blurred: true })
    return { ok: true }
  }

  /** Inventory-screen "Zjedz"/"Wypij" (plan 106) — driven by
   *  `ITEM_CATALOG[kind].consumable`, the same catalog entry the well/lake/
   *  cooking paths' relief amounts come from. */
  const consumeItem = (kind: ItemKind): ActionResult => {
    const entry = ITEM_CATALOG[kind].consumable
    if (!entry || !inventory.holdsAny(kind)) return toResult([itemRequirement(0, 1, kind)])
    // Plan items-player-001 — a waterskin drinks one portion off a concrete
    // `LiquidContainerItemInstance` (`items/liquidContainer.ts`), not a
    // whole-item remove/resultKind swap: the same carried instance stays
    // present, empty or not.
    if (isLiquidContainerKind(kind)) {
      const target = inventory.getInstances(kind).filter(isLiquidContainerInstance).find((inst) => canDrinkFromLiquidContainer(inst))
      if (!target) {
        toast.show('Bukłak jest pusty.', 'error')
        return toResult([targetRequirement(false, 'containerNotEmpty')])
      }
      inventory.updateInstance(target.id, (inst) => drinkFromLiquidContainer(inst as LiquidContainerItemInstance)!)
      drinkWaterNeeds(player.needs, entry.relief)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      ctx.refreshInventoryScreen()
      toast.show('Wypito.', 'pickup')
      return { ok: true }
    }
    // Plan 159 §3/§5 — spoiled food is non-consumable rather than acting
    // like fresh food; checked against the batch that would actually be
    // eaten (oldest first, same order `remove()` consumes in).
    const acquiredAtDays = inventory.oldestAcquiredAtDays(kind)
    if (acquiredAtDays != null && getFreshnessStage(kind, acquiredAtDays, dayNight.elapsedDays) === 'spoiled') {
      toast.show('To jedzenie się zepsuło.', 'error')
      return toResult([targetRequirement(false, 'notSpoiled')])
    }
    if (!inventory.remove(kind, 1)) return toResult([itemRequirement(0, 1, kind)])
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
    return { ok: true }
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
    startMilkAnimal,
  }
}
