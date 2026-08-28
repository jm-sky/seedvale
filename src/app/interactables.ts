import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { Fauna } from '../fauna/createFauna'
import type { Interactable, WorldItemRef } from '../interaction/Interactable'
import type { DroppedItems } from '../items/createDroppedItems'
import type { ItemSpawners } from '../items/createItemSpawners'
import type { PlacedTents } from '../items/createPlacedTents'
import type { ToolKind } from '../items/HeldTool'
import type { SaveItemInstance } from '../items/Inventory'
import type { Settlement } from '../settlement/createSettlement'
import type { LandOwnershipRegistry } from '../settlement/landOwnership'
import type { ChunkManager } from '../terrain/chunkManager'
import type { ResourceDeposits } from '../terrain/resourceDeposits'
import type { Beehives } from '../world/createBeehives'
import type { DryingRacks } from '../world/createDryingRacks'
import type { PlacedContainers } from '../world/createPlacedContainers'
import type { PlacedTraps } from '../world/createPlacedTraps'
import type { PlayerGardens } from '../world/createPlayerGardens'
import type { PlayerWells } from '../world/createPlayerWells'
import type { TerrainPreparations } from '../world/createTerrainPreparations'
import { ANIMAL_DEFS, ANIMAL_LABELS, type AnimalAgent, type AnimalKind, shoreProbeHits } from '../fauna/AnimalAgent'
import { SPAWNER_LABELS, spawnerDestroyPromptLabel } from '../fauna/createFauna'
import { isMeleeTool } from '../fauna/faunaCombat'
import { consumeVerbLabel, hasItemCapability, isRangedTool, ITEM_CATALOG } from '../items/itemCatalog'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { type MeleeHitCandidate, pickCombatTarget } from '../player/playerMelee'
import { isPlayerPlacedFire, type PlacedFires } from '../settlement/PlacedFires'
import { LANDMARK_LABELS } from '../terrain/chunkEnvironment'
import { ORE_YIELD_LABEL } from '../terrain/depositMining'
import { getDigProfileAt, getRockDigProfileAt } from '../terrain/dig'
import { oceanMixAt } from '../terrain/waterBodies'
import { TRAP_DEFS, type TrapKind, type TrapState } from '../world/animalTraps'
import { honeyAvailable } from '../world/beehives'
import { CROP_DEFS, type CropGrowthStage, type CropId } from '../world/cropLifecycle'
import { isDryingComplete } from '../world/dryingRacks'
import { gardenPlotPromptLabel, resolveCultivationCare } from '../world/playerGarden'
import { isWellCompleted, wellPromptLabel } from '../world/playerWell'
import { isChoppableStage } from '../world/treeLifecycle'
import { createWaterSource } from '../world/WaterSource'
import type { Vector3 } from 'three'

/** How close (world units) the player must be to an interactable before it's
 *  picked up by `[E]`. */
export const INTERACT_RANGE = 2.5
/** Minimum dot(playerForward, toTarget) to count as "looking at" — ~60° half-angle
 *  cone, needed so a dense cluster doesn't pick whichever is merely nearest. */
export const INTERACT_MIN_DOT = 0.5
/** Gaze-highlight range — deliberately larger than `INTERACT_RANGE` so the glow
 *  reads as an "approaching" cue before the `[E]` prompt appears. */
export const GAZE_RANGE = INTERACT_RANGE * 2
/** Chance an `[E]`-inspected tree also yields a branch, on top of the
 *  renewable branch spawn points (`createItemSpawners.ts`). */
export const TREE_BRANCH_CHANCE = 0.25
/** Added to `TREE_BRANCH_CHANCE` while the player carries a knife (plan
 *  `2026-08-08--043` §9) — a bonus, not a hard requirement. */
export const KNIFE_BRANCH_BONUS = 0.15
/** How far ahead (world units) of the player the shovel's synthetic dig
 *  target sits — inside `INTERACT_RANGE` so it's always within reach once
 *  offered; see `buildDigTarget`. */
export const DIG_REACH = 1.5
/** Melee target-acquisition range (plan 124 §1) — deliberately larger than
 *  `GAZE_RANGE` so `buildCombatTarget`'s forgiving fallback still finds a
 *  live animal even when the player isn't standing right on top of it.
 *  Independent of `MeleeConfig.range` (the actual weapon hit range, plan
 *  124 §2) and of `GAZE_RANGE` (shared by every other interactable kind). */
export const COMBAT_TARGET_RANGE = 7
/** How the player is aiming this session — a pointer/keyboard rig aims with
 *  the mouse-look yaw itself, a touch rig has to drag the same finger that
 *  also moves and attacks (plan 142). Only combat acquisition/facing branches
 *  on this; nothing else in the interaction pipeline does. */
export type CombatAimMode = 'pointer' | 'touch'

/** Target-acquisition cone per aim mode (plan 124 §1, plan 142 §1).
 *  `pointer` keeps the original 90° full cone (`cos(45°)`), already wider than
 *  `INTERACT_MIN_DOT`'s ~60° cone. `touch` widens it to ~168° full
 *  (`cos(~84°)`) so a tap doesn't require lining the body up with the joystick
 *  — still clearly directional, so an animal squarely to the side or behind the
 *  player is never acquired. Targets acquired beyond a weapon's own `arcDot`
 *  are made hittable by touch auto-facing (plan 142 §2), not by widening the
 *  hit arc. */
export const COMBAT_TARGET_CONE_DOT: Record<CombatAimMode, number> = {
  pointer: Math.SQRT1_2,
  touch: 0.1,
}

/** Plan 106 §4 — `[E]` always drinks directly (well or lake); `[R]` fills a
 *  carried empty waterskin. Static regardless of inventory (same convention
 *  as `campfire`'s "Dołóż gałąź" prompt not checking for a branch first) —
 *  `gameLoop.ts` toasts an error if `[R]` is pressed without one. */
const WATER_SOURCE_PROMPT = '[E] Napij się · [R] Napełnij bukłak'
/** Plan 159 §9-10 — shown instead of `WATER_SOURCE_PROMPT` while a fishing
 *  rod is held, since `[E]`/`[R]` are only two keys and fishing needs both
 *  (cast, apply bait). Drinking is unavailable while the rod is equipped —
 *  same "one held tool at a time" tradeoff the rest of the game already
 *  makes. */
const FISHING_PROMPT = '[E] Łów rybę · [R] Zanęć'
/** Lit campfire — `[E]` adds fuel (existing), `[R]` cooks raw_meat (plan
 *  106 §6). Static regardless of inventory, same convention as
 *  `WATER_SOURCE_PROMPT`. */
const CAMPFIRE_LIT_PROMPT = '[E] Dołóż gałąź · [R] Upiecz mięso'

function animalPromptLabel(kind: AnimalKind, heldTool: ToolKind | null): string {
  const label = ANIMAL_LABELS[kind]
  if (isMeleeTool(heldTool) || isRangedTool(heldTool)) return `Atakuj: ${label}`
  // Any animal carrying a `mount` config is mountable (plan fauna-003 §5) —
  // no ownership/taming gate yet, so the prompt is unconditional whenever no
  // weapon is held.
  if (ANIMAL_DEFS[kind].mount) return `Dosiądź: ${label}`
  return `Obserwuj: ${label}`
}

/** A held bow's own attack range, so a distant animal still enters the gaze
 *  list (`interactRange` override) instead of being capped at melee-scale
 *  `GAZE_RANGE` — without this a bow's target could never be acquired beyond
 *  ~5 units, far short of any bow's actual range (plan 162 was missing this;
 *  the ranged fire/projectile pipeline it added never widened target
 *  acquisition, so `[E]`/LMB silently did nothing at real bow distance). */
function rangedToolRange(heldTool: ToolKind | null): number | null {
  return isRangedTool(heldTool) ? ITEM_CATALOG[heldTool].ranged?.range ?? null : null
}

/** Plan 172 — natural crop lifecycle prompt. `young` and a `spoiled` crop
 *  with no `spoiledItem` still show (flavor/inspection), just without
 *  `[E] Zbierz`; the actual yield decision is re-validated at harvest time
 *  (`ChunkManager.harvestCrop`), never trusted from this per-frame label. */
function cropPromptLabel(cropId: CropId, stage: CropGrowthStage): string {
  const label = ITEM_DEFS[CROP_DEFS[cropId].harvestItem].label
  if (stage === 'mature') return `[E] Zbierz: ${label}`
  if (stage === 'young') return `Młoda roślina: ${label}`
  const def = CROP_DEFS[cropId]
  return def.spoiledItem ? `[E] Zbierz: ${label} (przejrzałe)` : `Przejrzała roślina: ${label}`
}

/** Spawn-point prompt (plan 125 §6) — only `depleted` offers the destructive
 *  `[E] Zniszcz` action; every other state keeps the existing inspection
 *  prompt, just annotated so the player can tell why nothing spawns there. */
function spawnerPromptLabel(spawner: PreySpawner): string {
  const label = SPAWNER_LABELS[spawner.type]
  switch (spawner.state) {
    case 'depleted':
      return spawnerDestroyPromptLabel(spawner.type)
    case 'disabled':
      return `Zbadaj: ${label} (wypalone)`
    case 'recovering':
      return `Zbadaj: ${label} (odradza się)`
    default:
      return `Zbadaj: ${label}`
  }
}

/** Placed-trap prompt (plan 141 §9) — the state is readable from the prop
 *  itself, so the prompt only names the action. An armed trap can't be picked
 *  up (disarm first); a broken one can only be cleared away. */
function trapPromptLabel(kind: TrapKind, state: TrapState): string {
  const label = TRAP_DEFS[kind].label
  switch (state) {
    case 'active':
      return `[E] Rozbrój: ${label}`
    case 'broken':
      return `[R] Usuń zniszczoną: ${label}`
    case 'placed':
      return `[E] Uzbrój · [R] Zabierz: ${label}`
  }
}

/** `bury` (shovel) and `harvest` (knife, plan 106) never overlap on the same
 *  corpse — the single `HeldTool` slot means only one tool is held at once.
 *  `knifeAvailable` covers both "harvest knife already held" and "harvest
 *  knife in inventory, hand free" (plan 153, plan 160 damascus_knife) —
 *  `startHarvestMeat` auto-equips it either way, so the prompt should appear
 *  whenever the action would actually succeed. */
function corpseCandidate(
  animal: AnimalAgent,
  shovelHeld: boolean,
  knifeAvailable: boolean,
): Interactable | null {
  const label = ANIMAL_LABELS[animal.def.kind]
  if (shovelHeld && !animal.readyToRemove()) {
    return {
      kind: 'corpse',
      position: animal.mesh.position,
      promptLabel: `Zakop zwłoki: ${label}`,
      animal,
      action: 'bury',
    }
  }
  if (knifeAvailable && animal.canHarvestMeat()) {
    return {
      kind: 'corpse',
      position: animal.mesh.position,
      promptLabel: `Wytnij mięso: ${label}`,
      animal,
      action: 'harvest',
    }
  }
  return null
}

/** World pickup prompt (plan 153) — adds a `[R] Zjedz`/`Wypij`/`Opatrz`
 *  quick-action for items immediately usable straight out of inventory
 *  (gated on `ITEM_CATALOG[kind].consumable`, the same flag the inventory
 *  screen's consume button uses — no separate quick-use item list). Plain
 *  pickup keeps the auto-`[E]`-prefixed short form used everywhere else. */
function itemPromptLabel(kind: ItemKind): string {
  const label = ITEM_DEFS[kind].label
  const consumable = ITEM_CATALOG[kind].consumable
  if (!consumable) return `Podnieś: ${label}`
  return `[E] Podnieś: ${label} · [R] ${consumeVerbLabel(consumable.need)}`
}

/** True if `(x, z)` is within `range` of `playerPos` (XZ plane, squared distance). */
function withinRange(x: number, z: number, playerPos: Vector3, range: number): boolean {
  const dx = x - playerPos.x
  const dz = z - playerPos.z
  return dx * dx + dz * dz <= range * range
}

/** True when the player is standing at the edge of an inland (non-ocean) body
 *  of water — reuses fauna's own shoreline probe (`shoreProbeHits`, plan 094)
 *  rather than a second implementation, plus a continentalness check
 *  (`oceanMixAt`, `terrain/waterBodies.ts` — the same signal the water shader
 *  uses to mix lake vs ocean) so the ocean shore doesn't also offer a drink
 *  prompt. No discrete "Lake" world object exists (plan 106 §4) — this is a
 *  synthetic candidate built fresh each frame, same pattern as `buildDigTarget`. */
function isNearLakeShore(playerPos: Vector3, chunkManager: ChunkManager): boolean {
  if (shoreProbeHits(playerPos.x, playerPos.z, chunkManager.sampleHeight, chunkManager.waterLevel) === 0) {
    return false
  }
  const continentalness = chunkManager.sampleContinentalness(playerPos.x, playerPos.z)
  const oceanMix = oceanMixAt(
    continentalness,
    chunkManager.region.oceanThreshold,
    chunkManager.region.coastThreshold,
  )
  return oceanMix <= 0.5
}

/** Assembles this frame's `Interactable` candidates from every world system —
 *  NPCs, the well, nearby trees (settlement + streamed via lifecycle), live fauna,
 *  fauna spawn points, player-built campfires, and nearby pickup items
 *  (world-generated + the renewable pool + player-dropped). Settlement/fauna
 *  candidates aren't pre-filtered by their source systems (unlike trees/items,
 *  which already query `chunkManager` by range), so each is checked against
 *  `GAZE_RANGE` here before allocating its description object — `GAZE_RANGE`
 *  is the largest range any consumer of this list picks against, so nothing
 *  a caller could select is dropped. */
export function buildInteractables(
  settlements: readonly Settlement[],
  fauna: Fauna,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
  placedFires: PlacedFires,
  placedTents: PlacedTents,
  placedTraps: PlacedTraps,
  placedContainers: PlacedContainers,
  resourceDeposits: ResourceDeposits,
  dryingRacks: DryingRacks,
  hives: Beehives,
  placedWells: PlayerWells,
  playerGardens: PlayerGardens,
  terrainPreparations: TerrainPreparations,
  /** Current world day (plan 159) — drives drying-complete/honey-available
   *  prompt text. */
  nowDays: number,
  playerPos: Vector3,
  /** Currently held tool — drives axe harvest prompts and animal attack prompts. */
  heldTool: ToolKind | null = null,
  /** Persistent land-plot ownership (plan 129) — an owned sale plot yields
   *  no candidate at all (no sign, no purchase prompt). Optional so existing
   *  callers/tests that never touch land plots don't need one. */
  landOwnership?: LandOwnershipRegistry,
  /** Knife sitting in inventory with the hand free — `startHarvestMeat`
   *  auto-equips it, so this counts toward the harvest prompt the same as
   *  already holding it (plan 153). Includes damascus_knife (plan 160).
   *  Defaults to false for existing callers/tests that don't model inventory
   *  contents. */
  inventoryHasFreeKnife = false,
  /** Per-`AnimalKind` interact-range override, from `QuestManager
   *  .activeSpotAnimalRange` (plan 153) — passed as a resolver rather than
   *  the manager itself so this module stays quest-agnostic (same
   *  convention as `heldTool`/`landOwnership` above). `null`/undefined
   *  result means "no override, use the normal range". */
  activeSpotAnimalRange?: (kind: AnimalKind) => number | null,
): Interactable[] {
  const list: Interactable[] = []
  const axeHeld = hasItemCapability(heldTool, 'wood_chopping')
  const shovelHeld = hasItemCapability(heldTool, 'soil_digging')
  const pickaxeHeld = hasItemCapability(heldTool, 'rock_mining')
  const knifeHeld = hasItemCapability(heldTool, 'meat_harvesting')
  const knifeAvailable = knifeHeld || (heldTool === null && inventoryHasFreeKnife)

  for (const pf of placedFires.list()) {
    if (!isPlayerPlacedFire(pf)) continue
    if (!withinRange(pf.x, pf.z, playerPos, GAZE_RANGE)) continue
    list.push({
      kind: 'campfire',
      position: { x: pf.x, z: pf.z },
      promptLabel: pf.fire.isLit()
        ? CAMPFIRE_LIT_PROMPT
        : pf.kind === 'pit' ? 'Zapal ognisko w palenisku' : 'Zapal ognisko',
      fire: pf.fire,
    })
  }

  for (const tent of placedTents.list()) {
    if (!withinRange(tent.x, tent.z, playerPos, GAZE_RANGE)) continue
    list.push({
      kind: 'tent',
      position: { x: tent.x, z: tent.z },
      promptLabel: '[E] Odpocznij · [R] Złóż namiot',
      id: tent.id,
    })
  }

  for (const trap of placedTraps.list()) {
    if (!withinRange(trap.x, trap.z, playerPos, GAZE_RANGE)) continue
    list.push({
      kind: 'trap',
      position: { x: trap.x, z: trap.z },
      promptLabel: trapPromptLabel(trap.kind, trap.state),
      id: trap.id,
      trapKind: trap.kind,
      state: trap.state,
    })
  }

  for (const container of placedContainers.list()) {
    if (!withinRange(container.x, container.z, playerPos, GAZE_RANGE)) continue
    list.push({
      kind: 'container',
      position: { x: container.x, z: container.z },
      promptLabel: '[E] Otwórz skrzynię · [R] Podnieś skrzynię',
      id: container.id,
    })
  }

  for (const rack of dryingRacks.list()) {
    if (!withinRange(rack.x, rack.z, playerPos, GAZE_RANGE)) continue
    const promptLabel = !rack.process
      ? '[E] Zacznij suszenie'
      : isDryingComplete(rack.process, nowDays)
        ? '[E] Odbierz suszony produkt'
        : 'Suszy się…'
    list.push({
      kind: 'dryingRack',
      position: { x: rack.x, z: rack.z },
      promptLabel,
      id: rack.id,
    })
  }

  for (const hive of hives.list()) {
    if (!withinRange(hive.x, hive.z, playerPos, GAZE_RANGE)) continue
    const promptLabel = hive.burned
      ? 'Spalony ul'
      : honeyAvailable(hive, nowDays) > 0
        ? '[E] Zbierz miód · [R] Spal ul'
        : 'Dziki ul · [R] Spal ul'
    list.push({
      kind: 'hive',
      position: { x: hive.x, z: hive.z },
      promptLabel,
      id: hive.id,
      burned: hive.burned,
    })
  }

  // Plan 127 — a completed well (`roof`, its own duration elapsed) becomes a
  // plain `well` candidate: same drink/fill interaction as any other well,
  // no special-cased prompt (implementation notes §14). Still under
  // construction, it exposes its own stage-advance prompt instead.
  for (const well of placedWells.list()) {
    if (!withinRange(well.x, well.z, playerPos, GAZE_RANGE)) continue
    if (isWellCompleted(well)) {
      list.push({
        kind: 'well',
        position: { x: well.x, z: well.z },
        promptLabel: WATER_SOURCE_PROMPT,
      })
      continue
    }
    list.push({
      kind: 'playerWell',
      position: { x: well.x, z: well.z },
      promptLabel: wellPromptLabel(well),
      id: well.id,
      stage: well.stage,
    })
  }

  // Plan 176 — always offered, even while fully maintained (plan §4).
  for (const garden of playerGardens.list()) {
    if (!withinRange(garden.x, garden.z, playerPos, GAZE_RANGE)) continue
    const care = resolveCultivationCare(garden, nowDays)
    const hydration = playerGardens.hydrationOf(garden.id, nowDays)?.hydration ?? garden.hydration
    list.push({
      kind: 'gardenPlot',
      position: { x: garden.x, z: garden.z },
      promptLabel: gardenPlotPromptLabel(care, hydration),
      id: garden.id,
      care,
    })
  }

  // Plan `world-terrain-002` §8 — active preparation work sites, same
  // "always-offered [E]" shape as `playerWell`/`gardenPlot` above.
  for (const prep of terrainPreparations.list()) {
    if (!withinRange(prep.center.x, prep.center.z, playerPos, GAZE_RANGE)) continue
    const done = prep.completedWork.toFixed(1)
    const total = prep.requiredWork.toFixed(1)
    list.push({
      kind: 'terrainPreparation',
      position: { x: prep.center.x, z: prep.center.z },
      promptLabel: `[E] Przygotuj teren (${done}/${total} h)`,
      id: prep.id,
    })
  }

  for (const settlement of settlements) {
    for (const npc of settlement.npcs) {
      // A dead NPC now stays in `settlement.npcs` for the rest of the
      // session (plan 197 — death is authoritative, survives settlement
      // unload/reload) instead of vanishing on the next reload; exclude it
      // from dialogue targeting the same way combat already excludes it
      // (`player/playerCombat.ts`).
      if (npc.health.dead) continue
      if (!withinRange(npc.mesh.position.x, npc.mesh.position.z, playerPos, GAZE_RANGE)) continue
      list.push({
        kind: 'npc',
        position: npc.mesh.position,
        promptLabel: `Rozmawiaj z ${npc.displayName}`,
        npc,
        settlement,
      })
    }

    for (const animal of settlement.livestock) {
      const rangeOverride = activeSpotAnimalRange?.(animal.def.kind) ?? rangedToolRange(heldTool)
      if (!withinRange(animal.mesh.position.x, animal.mesh.position.z, playerPos, Math.max(GAZE_RANGE, rangeOverride ?? 0))) continue
      if (animal.isDead()) {
        const corpse = corpseCandidate(animal, shovelHeld, knifeAvailable)
        if (corpse) list.push(corpse)
        continue
      }
      list.push({
        kind: 'animal',
        position: animal.mesh.position,
        promptLabel: animalPromptLabel(animal.def.kind, heldTool),
        animal,
        interactRange: rangeOverride ?? undefined,
      })
    }

    if (withinRange(settlement.landmarks.well.x, settlement.landmarks.well.z, playerPos, GAZE_RANGE)) {
      list.push({
        kind: 'well',
        position: settlement.landmarks.well,
        promptLabel: WATER_SOURCE_PROMPT,
      })
    }

    for (const house of settlement.landmarks.houses) {
      if (!withinRange(house.position.x, house.position.z, playerPos, GAZE_RANGE)) continue
      list.push({
        kind: 'house',
        position: house.position,
        promptLabel: `Obejrzyj: ${house.label}`,
        houseId: house.houseId,
        modelUrl: house.modelUrl,
        label: house.label,
        examine: house.examine,
        lampMount: house.lampMount,
        lampMountSource: house.lampMountSource,
      })
    }

    if (
      settlement.fire &&
      withinRange(settlement.fire.position.x, settlement.fire.position.z, playerPos, GAZE_RANGE)
    ) {
      list.push({
        kind: 'campfire',
        position: settlement.fire.position,
        promptLabel: settlement.fire.isLit() ? CAMPFIRE_LIT_PROMPT : 'Zapal ognisko',
        fire: settlement.fire,
      })
    }

    for (const hs of settlement.householdStorages) {
      if (!withinRange(hs.position.x, hs.position.z, playerPos, GAZE_RANGE)) continue
      list.push({
        kind: 'householdStorage',
        position: { x: hs.position.x, z: hs.position.z },
        promptLabel: 'Zbadaj: Magazyn domowy',
        household: hs.household,
      })
    }

    if (withinRange(
      settlement.landmarks.settlementStorage.x,
      settlement.landmarks.settlementStorage.z,
      playerPos,
      GAZE_RANGE,
    )) {
      list.push({
        kind: 'settlementStorage',
        position: { x: settlement.landmarks.settlementStorage.x, z: settlement.landmarks.settlementStorage.z },
        promptLabel: 'Zbadaj: Magazyn osady',
        economy: settlement.economy,
      })
    }

    for (const plot of settlement.landmarks.landPlots) {
      if (!withinRange(plot.position.x, plot.position.z, playerPos, GAZE_RANGE)) continue
      if (landOwnership?.isOwned(settlement.id, plot.plotId)) continue
      list.push({
        kind: 'landPlot',
        position: plot.position,
        promptLabel: `Kup działkę — ${plot.price} monet`,
        settlementId: settlement.id,
        plotId: plot.plotId,
      })
    }
  }

  // Settlement + streamed trees share TreeLifecycle registration — one nearby
  // query avoids duplicates and covers chunk vegetation (plan 057).
  for (const tree of chunkManager.getNearbyTrees(playerPos, GAZE_RANGE)) {
    const canHarvest = axeHeld && isChoppableStage(tree.stage)
    let promptLabel = 'Obejrzyj drzewo'
    if (canHarvest) {
      if (tree.stage === 'mature' || tree.stage === 'old') promptLabel = 'Oczyść gałęzie'
      else if (tree.stage === 'limbed') promptLabel = 'Ścinaj drzewo'
      else promptLabel = 'Porąb pień'
    } else if (tree.stage === 'limbed' || tree.stage === 'felled' || tree.stage === 'harvested') {
      promptLabel = 'Obejrzyj pień'
    } else if (tree.stage === 'sapling') {
      promptLabel = 'Obejrzyj drzewko'
    }
    list.push({
      kind: 'tree',
      position: { x: tree.x, z: tree.z },
      promptLabel,
      id: tree.id,
      stage: tree.stage,
      sizeClass: tree.sizeClass,
      canHarvest,
    })
  }

  for (const crop of chunkManager.getNearbyCrops(playerPos, GAZE_RANGE)) {
    list.push({
      kind: 'crop',
      position: { x: crop.x, z: crop.z },
      promptLabel: cropPromptLabel(crop.cropId, crop.stage),
      id: crop.id,
      cropId: crop.cropId,
      stage: crop.stage,
    })
  }

  for (const animal of fauna.getAgents()) {
    const rangeOverride = activeSpotAnimalRange?.(animal.def.kind) ?? rangedToolRange(heldTool)
    if (!withinRange(animal.mesh.position.x, animal.mesh.position.z, playerPos, Math.max(GAZE_RANGE, rangeOverride ?? 0))) continue
    if (animal.isDead()) {
      const corpse = corpseCandidate(animal, shovelHeld, knifeAvailable)
      if (corpse) list.push(corpse)
      continue
    }
    list.push({
      kind: 'animal',
      position: animal.mesh.position,
      promptLabel: animalPromptLabel(animal.def.kind, heldTool),
      animal,
      interactRange: rangeOverride ?? undefined,
    })
  }

  for (const landmark of chunkManager.getNearbyLandmarks(playerPos, GAZE_RANGE)) {
    list.push({
      kind: 'landmark',
      position: { x: landmark.x, z: landmark.z },
      promptLabel: `Zbadaj: ${LANDMARK_LABELS[landmark.kind]}`,
      landmarkId: landmark.id,
      envKind: landmark.kind,
    })
  }

  for (const spawner of fauna.getSpawners()) {
    if (!withinRange(spawner.x, spawner.z, playerPos, GAZE_RANGE)) continue
    list.push({
      kind: 'spawner',
      position: { x: spawner.x, z: spawner.z },
      promptLabel: spawnerPromptLabel(spawner),
      spawner,
    })
  }

  for (const item of chunkManager.getNearbyItems(playerPos, INTERACT_RANGE)) {
    list.push({
      kind: 'item',
      position: { x: item.x, z: item.z },
      promptLabel: itemPromptLabel(item.kind),
      item: { id: item.id, kind: item.kind, source: 'world' },
    })
  }

  for (const node of itemSpawners.nodes()) {
    if (node.collected) continue
    list.push({
      kind: 'item',
      position: { x: node.x, z: node.z },
      promptLabel: itemPromptLabel(node.kind),
      item: { id: node.id, kind: node.kind, source: 'spawner' },
    })
  }

  for (const item of droppedItems.nodes()) {
    list.push({
      kind: 'item',
      position: { x: item.x, z: item.z },
      promptLabel: itemPromptLabel(item.kind),
      item: { id: item.id, kind: item.kind, source: 'dropped' },
    })
  }

  if (pickaxeHeld) {
    const deposit = resourceDeposits.queryNearest(playerPos.x, playerPos.z, GAZE_RANGE)
    if (deposit) {
      list.push({
        kind: 'deposit',
        position: { x: deposit.x, z: deposit.z },
        promptLabel: `Wydobądź: ${ORE_YIELD_LABEL[deposit.type]}`,
        id: deposit.id,
        oreType: deposit.type,
      })
    }
  }

  if (isNearLakeShore(playerPos, chunkManager)) {
    list.push({
      kind: 'waterEdge',
      position: { x: playerPos.x, z: playerPos.z },
      promptLabel: hasItemCapability(heldTool, 'fishing') ? FISHING_PROMPT : WATER_SOURCE_PROMPT,
      source: createWaterSource('lake'),
    })
  }

  return list
}

function groundWorkPrompt(
  digLabel: string,
  profile: ReturnType<typeof getDigProfileAt>,
  canLevel: boolean,
): string {
  if (profile && canLevel) return `${digLabel} · [R] Wyrównaj`
  if (profile) return digLabel
  return '[R] Wyrównaj'
}

/** Ground-work target ahead of the player. Unlike everything in
 *  `buildInteractables()`, this isn't a fixed world object competing for gaze
 *  — `gameLoop.ts` only asks for one when `pickInGaze` found nothing, so it
 *  never outcompetes a real target (including ore deposits). Shovel: soil/sand
 *  only. Pickaxe: mountain rock only. `[E]` digs when a profile exists;
 *  `[R]` levels a depression on the same surface. */
export function buildDigTarget(
  playerPos: { x: number, z: number },
  playerYaw: number,
  heldTool: ToolKind | null,
  chunkManager: ChunkManager,
): Interactable | null {
  const x = playerPos.x - Math.sin(playerYaw) * DIG_REACH
  const z = playerPos.z - Math.cos(playerYaw) * DIG_REACH

  if (hasItemCapability(heldTool, 'soil_digging')) {
    const profile = getDigProfileAt(x, z, chunkManager)
    // "Wyrównaj" (plan `world-terrain-002`) now levels the surrounding 3×3
    // grid samples to the center's own height rather than raising toward a
    // procedural-base depression — it's offered on exactly the same ground
    // digging already is, not a separately-gated depression check.
    const canLevel = profile !== null
    if (!profile && !canLevel) return null
    return {
      kind: 'dig',
      position: { x, z },
      promptLabel: groundWorkPrompt('Wykop dołek', profile, canLevel),
      profile,
      canLevel,
    }
  }

  if (hasItemCapability(heldTool, 'rock_mining')) {
    const profile = getRockDigProfileAt(x, z, chunkManager)
    const canLevel = profile !== null
    if (!profile && !canLevel) return null
    return {
      kind: 'dig',
      position: { x, z },
      promptLabel: groundWorkPrompt('Wykop skałę', profile, canLevel),
      profile,
      canLevel,
    }
  }

  return null
}

/** Forgiving melee/ranged-attack fallback (plan 124 §1, widened for ranged
 *  tools per plan 162's own "extend the existing target query parameter
 *  instead of a second target manager" instruction) — same "only tried once
 *  nothing narrower was found" pattern as `buildDigTarget` above. Reuses the
 *  existing `kind: 'animal'` `Interactable`/`[E]` attack branch in
 *  `gameLoop.ts` unchanged: this only widens which live animal that branch
 *  sees, it is not a second targeting system. Only searches while a melee or
 *  ranged tool is held; a held bow widens the range to its own attack range
 *  (otherwise capped at melee-scale `COMBAT_TARGET_RANGE`, far short of any
 *  bow). `aim` selects the acquisition cone (plan 142 §1) — the only thing
 *  that differs between a pointer and a touch rig here. */
export function buildCombatTarget(
  settlements: readonly Settlement[],
  fauna: Fauna,
  playerPos: Vector3,
  playerYaw: number,
  heldTool: ToolKind | null,
  recentTargetIds: readonly string[],
  aim: CombatAimMode,
): Interactable | null {
  if (!isMeleeTool(heldTool) && !isRangedTool(heldTool)) return null
  const range = Math.max(COMBAT_TARGET_RANGE, rangedToolRange(heldTool) ?? 0)

  const candidates: MeleeHitCandidate[] = []
  const byId = new Map<string, AnimalAgent>()
  const collect = (animal: AnimalAgent): void => {
    if (animal.isDead()) return
    if (!withinRange(animal.mesh.position.x, animal.mesh.position.z, playerPos, range)) return
    candidates.push({ id: animal.animalId, x: animal.mesh.position.x, z: animal.mesh.position.z, alive: true })
    byId.set(animal.animalId, animal)
  }
  for (const settlement of settlements) {
    for (const animal of settlement.livestock) collect(animal)
  }
  for (const animal of fauna.getAgents()) collect(animal)

  const targetId = pickCombatTarget(
    candidates,
    playerPos.x,
    playerPos.z,
    playerYaw,
    range,
    COMBAT_TARGET_CONE_DOT[aim],
    recentTargetIds,
  )
  const animal = targetId ? byId.get(targetId) ?? null : null
  if (!animal) return null
  return {
    kind: 'animal',
    position: animal.mesh.position,
    promptLabel: animalPromptLabel(animal.def.kind, heldTool),
    animal,
  }
}

/** Routes a picked-up `WorldItemRef` to whichever registry it came from —
 *  world-generated (finite, id-based collected set), the renewable pool near
 *  the settlement, or a player drop. */
export function collectItem(
  ref: WorldItemRef,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
): { kind: ItemKind, x: number, z: number, instance?: SaveItemInstance } | null {
  switch (ref.source) {
    case 'dropped':
      return droppedItems.collect(ref.id)
    case 'spawner':
      return itemSpawners.collect(ref.id)
    case 'world':
      return chunkManager.collectItem(ref.id)
  }
}
