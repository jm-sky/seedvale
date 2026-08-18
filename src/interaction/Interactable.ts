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
import type { TreeGrowthStage, TreeSizeClass } from '../world/treeLifecycle'
import type { WaterSource } from '../world/WaterSource'

export type WorldItemRef = {
  id: string
  kind: ItemKind
  source: 'world' | 'spawner' | 'dropped'
}

/** A thin, per-frame adapter over the game's otherwise-incompatible world-object
 *  shapes (`NpcAgent`, `AnimalAgent`, bare landmark positions, `PreySpawner`,
 *  item pickups) so `pickInGaze` and the `[E]` interact handler can treat them
 *  uniformly. Built fresh each frame in `app/createApp.ts` — nothing here is
 *  persisted or owns lifetime. */
export type Interactable =
  | { kind: 'npc', position: { x: number, z: number }, promptLabel: string, npc: NpcAgent, settlement: Settlement }
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
  /** `[E]` drinks directly; `[R]` fills a carried empty waterskin (plan 106 §4). */
  | { kind: 'well', position: { x: number, z: number }, promptLabel: string }
  /** Synthetic target for a nearby freshwater (non-ocean) shoreline — built
   *  fresh each frame from `chunkManager` terrain sampling, no discrete world
   *  object (plan 106 §4's Lake). Same `[E]`/`[R]` drink/fill contract as `well`. */
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
  | { kind: 'deposit', position: { x: number, z: number }, promptLabel: string, id: string, oreType: 'coal' | 'gold' | 'iron' }
  /** Synthetic target for shovel (soil/sand) or pickaxe (mountain rock)
   *  ground work. Built from the aimed ground point (`buildDigTarget`).
   *  `profile` non-null → `[E]` dig; `canLevel` → `[R]` level. */
  | { kind: 'dig', position: { x: number, z: number }, promptLabel: string, profile: DigProfile | null, canLevel: boolean }
  | { kind: 'tent', position: { x: number, z: number }, promptLabel: string, id: string }
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
  | { kind: 'settlementStorage', position: { x: number, z: number }, promptLabel: string, economy: SettlementEconomy }
