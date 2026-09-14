import type { ItemKind } from '../items/items'

/** Plan 172 — natural crop lifecycle. Deliberately small and data-only
 *  (analogous in *shape* to `world/treeLifecycle.ts`'s lazy world-time
 *  resolution, not a copy of its species/canopy/chop complexity, which crops
 *  don't need). */
export type CropGrowthStage = 'young' | 'mature' | 'spoiled'

/** Restricted to the crops this plan actually wires up — a dedicated union
 *  instead of a stringly-typed `species` field (see project TS conventions). */
export type CropId = 'carrot' | 'potato' | 'cabbage'

export type CropDefinition = {
  id: CropId
  /** Game-days from cycle start until `young` becomes `mature`. */
  matureAfterDays: number
  /** Game-days the `mature` harvest window stays open before `spoiled`. */
  spoilAfterDays: number
  /**
   * Logical biological plants established by one planted sowing unit
   * (`seed_*` ×1 → one `CropPlacement`). Presentation and harvest may use
   * different bounded/total numbers; this is not a runtime entity count.
   *
   * @domain world
   */
  logicalPlantsPerSowingUnit: number
  harvestItem: ItemKind
  /** Optional yield when harvesting a `spoiled` crop — absent means spoiled
   *  crops give no normal yield (plan §12 of the implementation notes). */
  spoiledItem?: ItemKind
  /** Base food count for one healthy mature `CropPlacement` before
   *  cultivation care/hydration modifiers. Justified by logical population
   *  and species production, not equal to plant or rendered count. Also the
   *  denominator for cultivated seed recovery. */
  yieldCount: number
  /**
   * Sowing units recoverable from one healthy, fully-yielding planted
   * `CropPlacement`. Species data, not per-placement state. Current Phase 3
   * crops all use `2` (replacement + one surplus unit).
   */
  healthySeedRecovery: number
}

/**
 * Shared species table (plan world-023). One `seed_*` item is a sowing unit,
 * not a single biological seed. Values keep plant-count, harvest and
 * presentation as separate concepts:
 *
 * - carrot: a handful of small seeds → dense cluster; not every root is
 *   marketable, so yield is below plant count.
 * - potato: a few seed potatoes → fewer plants, but each produces several
 *   tubers, so yield is above plant count.
 * - cabbage: a few seedlings → large heads; one typically fails to size.
 */
export const CROP_DEFS: Record<CropId, CropDefinition> = {
  carrot: {
    id: 'carrot',
    matureAfterDays: 1.5,
    spoilAfterDays: 1.5,
    logicalPlantsPerSowingUnit: 8,
    harvestItem: 'carrot',
    yieldCount: 5,
    healthySeedRecovery: 2,
  },
  potato: {
    id: 'potato',
    matureAfterDays: 2,
    spoilAfterDays: 2,
    logicalPlantsPerSowingUnit: 4,
    harvestItem: 'potato',
    yieldCount: 8,
    healthySeedRecovery: 2,
  },
  cabbage: {
    id: 'cabbage',
    matureAfterDays: 1.75,
    spoilAfterDays: 1.75,
    logicalPlantsPerSowingUnit: 3,
    harvestItem: 'cabbage',
    yieldCount: 2,
    healthySeedRecovery: 2,
  },
}

export const CROP_IDS: readonly CropId[] = ['carrot', 'potato', 'cabbage']

/** A naturally-generated crop's deterministic placement — worker-safe pure
 *  data, mirrors `terrain/chunkItems.ts`'s `ItemPlacement` shape. */
export type CropPlacement = {
  /** Stable, deterministic (`cx:cz:crop<i>`) — distinct namespace from
   *  `ItemPlacement` ids (implementation notes §19) since harvested crops
   *  are tracked in their own sparse removal set, not `collectedItemIds`. */
  id: string
  x: number
  z: number
  cropId: CropId
  /** World-day anchor for this crop's growth cycle. The young→mature→spoiled
   *  cycle *repeats* (see `cropCycleLengthDays`) — a pure function of
   *  `(seed, worldDays)` like `world/weather.ts`'s cycling, not a tracked
   *  simulation history — so a chunk generated deep into a long-running world
   *  still shows a natural mix of stages instead of everything being
   *  permanently spoiled since world day 0. Harvesting removes the placement
   *  outright (tracked separately), so this cycling never resurrects a
   *  harvested crop. */
  stageStartedAt: number
}

function mod(a: number, b: number): number {
  return ((a % b) + b) % b
}

/** Full natural cycle: young → mature → spoiled → (wraps back to young, as a
 *  fresh volunteer plant takes the spoiled one's place). `spoiled` lingers as
 *  long as the harvest window did — the plant doesn't instantly vanish the
 *  moment it's missed. */
function cropCycleLengthDays(def: CropDefinition): number {
  return def.matureAfterDays + def.spoilAfterDays * 2
}

/** Pure, lazy stage resolver — the single source of truth used by chunk
 *  rendering, interaction and (later) plan 126 planted crops. No per-frame
 *  ticking: callers resolve on demand (chunk load, harvest, explicit refresh). */
export function resolveCropStage(
  def: CropDefinition,
  stageStartedAt: number,
  worldDays: number,
): CropGrowthStage {
  const cycleLength = Math.max(0.01, cropCycleLengthDays(def))
  const elapsed = mod(worldDays - stageStartedAt, cycleLength)
  if (elapsed < def.matureAfterDays) return 'young'
  if (elapsed < def.matureAfterDays + def.spoilAfterDays) return 'mature'
  return 'spoiled'
}

/** Deterministic phase roll (0..cycleLength) for a freshly-placed natural
 *  crop, from a seeded `random01` — desyncs same-kind crops so a chunk never
 *  shows only one stage (implementation notes §13). */
export function rollCropPhase(def: CropDefinition, random01: number): number {
  return Math.max(0, Math.min(1, random01)) * cropCycleLengthDays(def)
}

export type CropHarvestYield = { kind: ItemKind, count: number }

/** `young` never yields; `mature` yields the normal harvest item; `spoiled`
 *  yields `spoiledItem` only if the definition provides one. Never falls
 *  back to `harvestItem` from a non-`mature` stage. */
export function resolveCropHarvest(def: CropDefinition, stage: CropGrowthStage): CropHarvestYield | null {
  if (stage === 'mature') return { kind: def.harvestItem, count: def.yieldCount }
  if (stage === 'spoiled' && def.spoiledItem) return { kind: def.spoiledItem, count: 1 }
  return null
}

/**
 * Cultivated seed recovery from one planted `CropPlacement` (plan
 * settlements-npcs-031). Pure, actor-neutral, deterministic. Uses the
 * final realized produce count after cultivation modifiers; does not know
 * household reserve, settlement storage, or profession policy.
 *
 * Natural crops must not call this — callers supply planted/cultivated
 * context and skip recovery when the harvest is not a planted sowing unit.
 *
 * @domain world
 */
export function resolveCultivatedSeedRecovery(
  def: CropDefinition,
  realizedYield: number,
): number {
  if (realizedYield <= 0 || def.yieldCount <= 0 || def.healthySeedRecovery <= 0) return 0
  const recovered = Math.floor(def.healthySeedRecovery * realizedYield / def.yieldCount)
  return Math.max(0, Math.min(def.healthySeedRecovery, recovered))
}

/**
 * Recovered sowing-unit count for a harvest that already has a realized
 * produce count. Zero for wild/natural crops, spoiled-item yields, and
 * failed produce. Does not copy recovery math into player or NPC adapters.
 *
 * @domain world
 */
export function recoveredSeedCountForHarvest(
  def: CropDefinition,
  baseYield: CropHarvestYield,
  realizedProduceCount: number,
  planted: boolean,
): number {
  if (!planted || baseYield.kind !== def.harvestItem) return 0
  return resolveCultivatedSeedRecovery(def, realizedProduceCount)
}
