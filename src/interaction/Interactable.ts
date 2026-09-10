import type { NpcAgent } from '../ai/NpcAgent'
import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { ItemKind } from '../items/items'
import type { Settlement } from '../settlement/createSettlement'
import type { Household } from '../settlement/household'
import type { VillageFire } from '../settlement/VillageFire'
import type { LandmarkKind } from '../terrain/chunkEnvironment'
import type { DigProfile } from '../terrain/dig'
import type { TrapKind, TrapState } from '../world/animalTraps'
import type { CropGrowthStage, CropId } from '../world/cropLifecycle'
import type { WellStage } from '../world/playerWell'
import type { TreeGrowthStage, TreeSizeClass } from '../world/treeLifecycle'
import type { WaterSource } from '../world/WaterSource'

export type WorldItemRef = {
  id: string
  kind: ItemKind
  source: 'world' | 'spawner' | 'dropped'
  /** Concrete dropped-item ids in a nearby identical cluster (plan
   *  items-player-022). Absent for ungrouped pickups. Order is the source
   *  array order; `id` is always `memberIds[0]`. */
  memberIds?: readonly string[]
}

/** A thin, per-frame adapter over the game's otherwise-incompatible world-object
 *  shapes (`NpcAgent`, `AnimalAgent`, bare landmark positions, `PreySpawner`,
 *  item pickups) so `pickInGaze` and the `[E]` interact handler can treat them
 *  uniformly. Built fresh each frame in `app/createApp.ts` — nothing here is
 *  persisted or owns lifetime. */
export type Interactable =
  | { kind: 'npc', position: { x: number, z: number }, promptLabel: string, npc: NpcAgent, settlement: Settlement }
  /** Dead NPC corpse (plan npc-010) — `[E]` opens the existing inventory
   *  transfer screen over persisted corpse loot. Neutral in v1: no ownership
   *  or reputation consequence. */
  | { kind: 'npcCorpse', position: { x: number, z: number }, promptLabel: string, npc: NpcAgent }
  /** `interactRange` (plan 153) overrides `pickInGaze`'s flat range for this
   *  one candidate — set only when an active quest's `spot_animal` objective
   *  needs a wider reach than a skittish species' normal interact distance
   *  (see `QuestManager.activeSpotAnimalRange`). */
  | { kind: 'animal', position: { x: number, z: number }, promptLabel: string, animal: AnimalAgent, interactRange?: number }
  /** Dead animal corpse — shovel `bury` (only offered while shovel is held)
   *  or knife `harvest` for raw_meat (plan 106, only while knife is held and
   *  not yet harvested). The single `HeldTool` slot means these two never
   *  overlap on the same corpse at once. */
  | { kind: 'corpse', position: { x: number, z: number }, promptLabel: string, animal: AnimalAgent, action: 'bury' | 'harvest' }
  /** `[E]` drinks directly; `[R]` fills a carried empty waterskin (plan 106
   *  §4). `source` is resolved by `app/interactables.ts` at candidate-build
   *  time — a settlement well always plain `createWaterSource('well')`.
   *  Completed player-built wells stay `playerWell` so repair can relookup
   *  by id (plan world-021); they are never this generic `well` kind. */
  | { kind: 'well', position: { x: number, z: number }, promptLabel: string, source: WaterSource }
  /** Synthetic target for a nearby lake/river/ocean shoreline (plan
   *  `ui-input-006`) — built fresh each frame from `chunkManager` terrain
   *  sampling, no discrete world object (plan 106 §4's Lake). `position` is
   *  the real shore/bank point the interaction happens at, not the player's
   *  own position. Same `[E]`/`[R]` drink/fill contract as `well`, plus
   *  fishing when a fishing rod is held. */
  | { kind: 'waterEdge', position: { x: number, z: number }, promptLabel: string, source: WaterSource }
  | {
    kind: 'house'
    position: { x: number, z: number }
    promptLabel: string
    houseId: string
    modelUrl: string | null
    label: string
    examine: string
    lampMount: { x: number, y: number, z: number } | null
    lampMountSource: string | null
  }
  | {
    kind: 'tree'
    position: { x: number, z: number }
    promptLabel: string
    id: string
    stage: TreeGrowthStage
    sizeClass: TreeSizeClass
    canHarvest?: boolean
  }
  | { kind: 'campfire', position: { x: number, z: number }, promptLabel: string, fire: VillageFire }
  | { kind: 'spawner', position: { x: number, z: number }, promptLabel: string, spawner: PreySpawner }
  | { kind: 'item', position: { x: number, z: number }, promptLabel: string, item: WorldItemRef }
  /** Ore deposit — pickaxe `[E] Wydobądź` (plan 090). */
  | { kind: 'deposit', position: { x: number, z: number }, promptLabel: string, id: string, oreType: 'coal' | 'copper_ore' | 'gold' | 'iron' }
  /** Synthetic target for shovel (soil/sand) or pickaxe (mountain rock)
   *  ground work. Built from the aimed ground point (`buildDigTarget`).
   *  `profile` non-null → `[E]` dig; `canLevel` → `[R]` level. */
  | { kind: 'dig', position: { x: number, z: number }, promptLabel: string, profile: DigProfile | null, canLevel: boolean }
  | { kind: 'tent', position: { x: number, z: number }, promptLabel: string, id: string }
  /** Derived tent + matching bedroll/platform (plan items-player-022) —
   *  one Tab/gaze target for a spatially composed camp. Component ids are
   *  only for dispatch; inspection re-resolves the live snapshot. */
  | {
    kind: 'camp'
    position: { x: number, z: number }
    promptLabel: string
    tentId: string
    bedrollId: string | null
    platformId: string | null
  }
  | { kind: 'bedroll', position: { x: number, z: number }, promptLabel: string, id: string }
  | { kind: 'platform', position: { x: number, z: number }, promptLabel: string, id: string }
  /** Settlement hay bale (plan 168 follow-up) — `[E]` sleeps in it directly,
   *  the same commit path as picking "Stóg siana" from the "Nocuj w
   *  mieście" panel (`RestActions.sleepInHay`), skipping Quick Actions
   *  entirely. `settlementId` resolves to the exact same `hay` `LodgingOption`
   *  the resolver's fallback would (`hayLodgingId`). */
  | { kind: 'hay', position: { x: number, z: number }, promptLabel: string, settlementId: string }
  /** Placed animal trap (plan 141) — `[E]` arms/disarms depending on `state`,
   *  `[R]` picks a non-armed trap back up. Only stable references + the state
   *  the prompt needs; durability itself is resolved by `PlacedTraps` at
   *  interact time, never from this per-frame snapshot. */
  | { kind: 'trap', position: { x: number, z: number }, promptLabel: string, id: string, trapKind: TrapKind, state: TrapState }
  /** Procedural landmark (`monolith`/`stoneCircle`/`smallRuins`/`cemetery`) —
   *  purely a quest-objective/flavor interaction, no held-tool mechanic
   *  (plan 132). `landmarkId` is the stable `EnvironmentPlacement.id`. */
  | { kind: 'landmark', position: { x: number, z: number }, promptLabel: string, landmarkId: string, envKind: LandmarkKind }
  /** Settlement sale-plot sign (plan 129) — `[E]` attempts to purchase it.
   *  Only carries stable references; current price/ownership is resolved
   *  fresh every frame in `buildInteractables` (never a stale snapshot), and
   *  again by the purchase domain operation itself at interact time. */
  | { kind: 'landPlot', position: { x: number, z: number }, promptLabel: string, settlementId: string, plotId: string }
  /** Household storage container (plan 156) — read-only stock view; the
   *  prop is presentation only, `household` is the live simulation owner
   *  queried fresh at interact time (never a cached snapshot). */
  | { kind: 'householdStorage', position: { x: number, z: number }, promptLabel: string, household: Household }
  /** Settlement storage container (plan 156) — read-only stock view over
   *  `SettlementEconomy`, same "presentation, not owner" contract as
   *  `householdStorage`. */
  | { kind: 'settlementStorage', position: { x: number, z: number }, promptLabel: string, economy: SettlementEconomy, settlementId: string }
  /** Intact settlement rat nest (plan quests-progression-013) — `[E]`
   *  destroys it with a `soil_digging` tool. Position is derived; destroyed
   *  state is the infestation registry. */
  | { kind: 'ratNest', position: { x: number, z: number }, promptLabel: string, settlementId: string }
  /** Settlement wood stockpile (plan settlements-npcs-012) — read-only view
   *  over `SettlementEconomy.wood` only, matching the settlement pile visual.
   *  Distinct from the aggregated `settlementStorage` crate and from each
   *  household's own yard wood pile (`householdStorage`). */
  | { kind: 'woodStorage', position: { x: number, z: number }, promptLabel: string, economy: SettlementEconomy }
  /** Player-placed drying rack (plan 159 §8) — `[E]` starts a process when
   *  idle, collects the output when complete, or shows a "still drying"
   *  toast otherwise; single-action like `campfire`/`trap`. */
  | { kind: 'dryingRack', position: { x: number, z: number }, promptLabel: string, id: string }
  /** Wild beehive (plan 159 §11) — `[E]` collects accrued honey; `[R]` burns
   *  it down (one-time reward) while a lit torch/branch is held. */
  | { kind: 'hive', position: { x: number, z: number }, promptLabel: string, id: string, burned: boolean }
  /** Naturally-generated wild crop (plan 172) — `[E]` harvests a `mature`
   *  (or `spoiled` with a `spoiledItem`) crop; `young`/no-yield `spoiled`
   *  crops still show for flavor but yield nothing. */
  | { kind: 'crop', position: { x: number, z: number }, promptLabel: string, id: string, cropId: CropId, stage: CropGrowthStage }
  /** Player-placed storage container (plan 164) — `[E]` opens the generic
   *  transfer screen, `[R]` picks it up (with contents). Only stable
   *  references; current contents are resolved fresh from `PlacedContainers`
   *  at interact time, never a cached snapshot. */
  | { kind: 'container', position: { x: number, z: number }, promptLabel: string, id: string }
  /** Player-built well (plan 127). While construction is unfinished,
   *  `[E]` advances the active stage's work and `[R]` opens the
   *  requirements panel (drink/fill once `waterSource` is non-null).
   *  A completed well stays this kind so inspect/repair can relookup by
   *  id (plan world-021) — settlement wells remain generic `well`.
   *  `complete`/`waterSource` are per-frame display snapshots; start/resume
   *  revalidate from the live record. */
  | { kind: 'playerWell', position: { x: number, z: number }, promptLabel: string, id: string, stage: WellStage, waterSource: WaterSource | null, complete: boolean }
  /** Player-built garden plot (plan 176) — `[E] Zrób porządek` restores its
   *  maintenance state; always offered, even while fully maintained. `care`
   *  is a per-frame resolved snapshot for the prompt only — the action
   *  re-resolves + revalidates at completion, never trusts this value. */
  | { kind: 'gardenPlot', position: { x: number, z: number }, promptLabel: string, id: string, care: number }
  /** Active terrain-preparation work-site marker (plan `world-terrain-002`
   *  §8) — `[E]` starts/resumes its work session. Removed once the
   *  preparation reaches 100% (no permanent `PreparedTerrain` marker). */
  | { kind: 'terrainPreparation', position: { x: number, z: number }, promptLabel: string, id: string }
  /** Player-built standing torch (plan items-player-009, incremental
   *  construction added by plan items-player-017) — `[E]` ignites it once
   *  construction is complete, gated on the `fire_starting` capability; an
   *  already-lit torch shows a flavor-only prompt (no `[E]` action); while
   *  `!complete`, `[E]` instead runs one construction-work bout and ignition
   *  is not offered at all. `lit`/`complete` are per-frame resolved
   *  snapshots for the prompt/dispatch only — the ignite/work actions
   *  re-resolve the record and re-check both themselves before mutating
   *  anything. */
  | { kind: 'standingTorch', position: { x: number, z: number }, promptLabel: string, id: string, lit: boolean, complete: boolean }
  /** Player-built animal trough (plan items-player-020). */
  | { kind: 'playerTrough', position: { x: number, z: number }, promptLabel: string, id: string, complete: boolean, canFill: boolean }
  /** Player-built palisade segment (plan items-player-010, incremental
   *  construction added by plan items-player-017) — `[R]` removes this one
   *  segment via the generic player-built removal/recovery seam
   *  (`items/constructionMaterials.ts`'s `computeMaterialRecovery`/
   *  `canReceiveRecovery`/`applyRecovery`), returning part of its material
   *  cost, available whether or not construction is finished. While
   *  `!complete`, `[E]` also runs one construction-work bout. Only stable
   *  references; the record itself is re-resolved by id at interact time,
   *  never trusted from this per-frame snapshot. */
  | { kind: 'palisade', position: { x: number, z: number }, promptLabel: string, id: string, complete: boolean }
  /** Player-built residential house (plan settlements-005). Unfinished:
   *  `[E]` supplies materials or works, `[R]` cancels. Completed Player-owned:
   *  `[E]` sleeps. */
  | { kind: 'residentialBuilding', position: { x: number, z: number }, promptLabel: string, id: string, complete: boolean, materialsSupplied: boolean, playerOwned: boolean }
  /** Settlement notice board (plan npc-014) — `[E]` opens the physical-
   *  posting panel listing the player's own `available`/`not_posted` work
   *  contracts. `settlementId` resolves the board's stable id
   *  (`world/workContract.ts`'s `noticeBoardId`) and its `postedAt()` query
   *  at interact time — never a cached list of postings. */
  | { kind: 'noticeBoard', position: { x: number, z: number }, promptLabel: string, settlementId: string }
  /** Movable draft cart (plan fauna-007). */
  | { kind: 'cart', position: { x: number, z: number }, promptLabel: string, id: string }
