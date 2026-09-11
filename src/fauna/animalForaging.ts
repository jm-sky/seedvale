import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { HeightSampler } from '../player/PlayerController'
import type { Household } from '../settlement/household'
import type { GrassForageService } from '../world/createGrassForagePatches'
import type { CorpsePhase } from './animalCorpse'
import type { AnimalDef, AnimalRole, ScavengingConfig } from './animalDefs'
import type { AnimalDietConfig } from './animalDefs'
import type { LocalWaterSample } from '../terrain/waterSample'
import { shoreProbeHits } from '../terrain/waterBodyKind'
import type { WaterBodyKind } from '../world/WaterSource'
import { type AnimalLifeState, consumeFood, drinkWater, NEED_ELEVATED_THRESHOLD } from './AnimalLife'
import { probeBestPointNear } from './animalRoaming'
import { classifyWaterTraversal, wadeDepthFor } from './waterTraversal'

/**
 * @domain fauna
 * @role Food/water source selection, validation and atomic relief for one
 *  `AnimalAgent` (plan fauna-017 step 6a, review E4/P5) — owns target
 *  scoring (`find*Target`), the completion-time revalidation contract
 *  (`isSourceTargetValid`) and the five-arm "relief only after a successful
 *  atomic mutation" consumption switch (`applySourceRelief`). `AnimalAgent`
 *  keeps `pursueNeeds`/`pursueSourceTarget`/`cancelSourceTarget` — they own
 *  `setIntent`/`steerToward` and the `sourceTarget`/`actionTimer` fields —
 *  and calls this module for selection/validation/relief.
 */

/** Radius (world units) searched around the animal for a valid forage spot
 *  or a scavengeable carcass once hunger crosses `NEED_ELEVATED_THRESHOLD`
 *  (plan 094). */
const FOOD_SEARCH_RADIUS = 14
/** Hunger (`AnimalLifeState.hunger`) a scavenging-capable predator must
 *  reach before a `rotting` corpse becomes a viable food candidate at all
 *  (plan fauna-005) — well above `NEED_ELEVATED_THRESHOLD` (the threshold
 *  that starts food search in general), so a lightly hungry predator still
 *  prefers to keep looking for a fresh kill instead of falling back onto
 *  carrion just because it exists. */
const SCAVENGE_ROTTING_HUNGER_THRESHOLD = 0.65
/** Same idea as above but for `bones`, the lowest-value tier — needs the
 *  eater even hungrier before it's worth considering (plan fauna-005). */
const SCAVENGE_BONES_HUNGER_THRESHOLD = 0.8
/** Score weight applied to a carcass candidate's food value before
 *  subtracting distance (plan fauna-005), same `weight*value - distance`
 *  idiom as `findWaterTarget`/`findForageTarget`'s `hits`/`suitability`
 *  scoring. Large enough that, within `FOOD_SEARCH_RADIUS`, a `fresh`
 *  corpse (value 1) always outscores a `rotting`/`bones` candidate for the
 *  tuned wolf preference values: `weight * (1 - value) > FOOD_SEARCH_RADIUS`. */
const CARCASS_VALUE_WEIGHT = 30
/** Radius (world units) searched around the animal for a walkable shoreline
 *  point once thirst crosses `NEED_ELEVATED_THRESHOLD` (plan 094). */
const WATER_SEARCH_RADIUS = 20
/** Candidate points sampled per forage/carcass search call. */
const FOOD_SEARCH_ATTEMPTS = 10
/** Candidate points sampled per water search call — wider radius than
 *  forage, so more attempts to actually land near a shore. */
const WATER_SEARCH_ATTEMPTS = 14
/** Distance at which an animal counts as having arrived at a forage spot or
 *  carcass, and can start eating. */
export const FOOD_INTERACTION_RANGE = 1.4
/** Distance at which an animal counts as having arrived at a shoreline
 *  point, and can start drinking. */
export const WATER_INTERACTION_RANGE = 1.2
/** Seconds spent stationary eating before hunger relief (`consumeFood`) is
 *  applied — a short, real action, not a per-frame drain. */
export const EAT_DURATION_SEC = 3
/** Seconds spent stationary drinking before thirst relief (`drinkWater`) is
 *  applied. */
export const DRINK_DURATION_SEC = 2
/** Seconds to wait before retrying a failed food/water search — without
 *  this, a hungry/thirsty animal with no source in range would re-scan
 *  candidate points every frame. */
export const SOURCE_SEARCH_COOLDOWN_SEC = 3
/** Seconds an animal will pursue a cached food/water target before giving
 *  up and re-searching — guards against a target that passed validation but
 *  is effectively unreachable (e.g. boxed in by terrain `steerToward` can't
 *  route around). */
export const SOURCE_TARGET_TIMEOUT_SEC = 20
/** One trough visit's draw against a finite water reserve — same order of
 *  magnitude as `NpcAgent`'s `WATER_DRINK_FROM_STOCK_AMOUNT`. */
export const TROUGH_DRINK_AMOUNT = 1

/** Discriminated water-source identity for `kind: 'water'` targets (plan
 *  items-player-020 §4) — replaces the old `trough?: boolean` household-only
 *  flag so household storage and player-built troughs stay unambiguous. */
export type WaterSourceRef =
  | { kind: 'natural' }
  | { kind: 'household' }
  | { kind: 'playerTrough', id: string }

/** Narrow world-owned provider seam for finite player-built trough water
 *  (plan items-player-020 §4) — `animalForaging` owns selection/eligibility;
 *  `createPlayerTroughs` owns records and mutation. */
export type AnimalWaterSourceProvider = {
  queryAvailableNear: (
    x: number,
    z: number,
    radius: number,
  ) => readonly { id: string, x: number, z: number }[]
  isAvailable: (id: string, litres: number) => boolean
  consume: (id: string, litres: number) => boolean
}

/** Forage habitat suitability from a `sampleForestFactor` reading — peaks at
 *  forest-edge density (~0.45) rather than open meadow or deep forest,
 *  matching deer/stag habitat preference (plan 094). Pure so it's
 *  unit-testable without instantiating `AnimalAgent`/Three.js. */
export function forageEdgeScore(forestFactor: number): number {
  return Math.max(0, 1 - Math.abs(forestFactor - 0.45) * 2)
}

/** First `dietItems` kind actually present in `items` (plan fauna-010 §3/§7)
 *  — declaration order of the species' own `AnimalDietConfig.items` object,
 *  the same "small literal, stable insertion order" convention diet configs
 *  are authored with (not `FOOD_ITEM_KINDS`' catalog order, since diet items
 *  are per-species and deliberately short). Deterministic: the same
 *  household contents always select the same kind. `null` when the
 *  household holds none of this species' diet items. */
export function selectDietFeedKind(
  items: Inventory,
  dietItems: Partial<Record<ItemKind, number>>,
): ItemKind | null {
  for (const kind of Object.keys(dietItems) as ItemKind[]) {
    if (items.has(kind, 1)) return kind
  }
  return null
}

/** Relief scale for one `diet.items` entry — shared by autonomous household
 *  feed (`applySourceRelief`'s `feed` arm) and player/NPC hand-feeding. */
export function dietItemReliefScale(
  diet: AnimalDietConfig | undefined,
  itemKind: ItemKind,
): number | null {
  const relief = diet?.items?.[itemKind]
  return relief == null ? null : relief
}

/** Read-only hand-feed acceptance (plan fauna-013) — same hunger threshold as
 *  elevated food seeking (`NEED_ELEVATED_THRESHOLD`). */
export function canAcceptHandFeed(
  life: AnimalLifeState,
  diet: AnimalDietConfig | undefined,
  itemKind: ItemKind,
): boolean {
  if (dietItemReliefScale(diet, itemKind) == null) return false
  return life.hunger >= NEED_ELEVATED_THRESHOLD
}

/** Commits one diet-item hunger relief if still accepted — caller owns
 *  lifecycle/inventory; no affinity side effects here. */
export function tryCommitHandFeed(
  life: AnimalLifeState,
  diet: AnimalDietConfig | undefined,
  itemKind: ItemKind,
): boolean {
  const relief = dietItemReliefScale(diet, itemKind)
  if (relief == null || life.hunger < NEED_ELEVATED_THRESHOLD) return false
  consumeFood(life, relief)
  return true
}

/** Whether a corpse can feed this eater (plan 094). `consumed` is set once
 *  an eat action completes, so the same carcass cannot refill hunger
 *  repeatedly. A claim held by someone else blocks selection; a claim held
 *  by `eater` (or no claim) is allowed. Harvested remains (`harvested`) are
 *  bones/scraps, not food (plan 137). */
export function isCarcassEdible(opts: {
  dead: boolean
  expired: boolean
  consumed: boolean
  harvested?: boolean
  claimedBy: unknown
  eater: unknown
}): boolean {
  if (!opts.dead || opts.expired || opts.consumed || opts.harvested) return false
  if (opts.claimedBy != null && opts.claimedBy !== opts.eater) return false
  return true
}

/** Food value of a corpse `phase` for a given eater (plan fauna-005) — `null`
 *  when this phase isn't food for this eater right now:
 *  - `fresh` is always full value (1), the pre-existing plan 094 baseline
 *    available to any predator regardless of `scavenging`.
 *  - `rotting`/`bones` require both the eater's `scavenging` capability
 *    (absent for a non-scavenger, e.g. fox/bear) *and* hunger past that
 *    tier's threshold (`SCAVENGE_ROTTING_HUNGER_THRESHOLD`/
 *    `SCAVENGE_BONES_HUNGER_THRESHOLD`) — a barely-hungry wolf won't fall
 *    back onto carrion just because it exists.
 *  A `rotting`/`bones` value is always below `fresh`'s 1, so
 *  `carcassCandidateScore` naturally prefers a reachable fresh kill.
 *  Pure/exported so preference/hunger-gating is unit-testable without
 *  instantiating `AnimalAgent`, same technique as `corpsePhaseFromElapsed`. */
export function carcassFoodValue(
  phase: CorpsePhase,
  scavenging: ScavengingConfig | undefined,
  hunger: number,
): number | null {
  if (phase === 'fresh') return 1
  if (!scavenging) return null
  if (phase === 'rotting') return hunger >= SCAVENGE_ROTTING_HUNGER_THRESHOLD ? scavenging.rottingValue : null
  return hunger >= SCAVENGE_BONES_HUNGER_THRESHOLD ? scavenging.bonesValue : null
}

/** Carcass candidate selection score (plan fauna-005) — combines food value
 *  (`carcassFoodValue`) with distance (closer preferred, same
 *  `weight*value - distance` idiom as `findWaterTarget`/`findForageTarget`).
 *  `riskPenalty` is a decision seam for a future disease/food-safety system
 *  (plan fauna-005 §12) — always 0 today since no such system exists yet; a
 *  future one can pass a positive penalty here without any other change to
 *  selection. Pure/exported for the same reason as `carcassFoodValue`. */
export function carcassCandidateScore(value: number, distance: number, riskPenalty = 0): number {
  return value * CARCASS_VALUE_WEIGHT - distance - riskPenalty
}

/** Structural view of another agent's corpse (plan fauna-017 step 6a) —
 *  production passes the real `AnimalAgent[]` with no allocation, tests
 *  pass plain objects. Never a value import of `AnimalAgent` (would
 *  recreate the cycle E2 already broke) — built entirely on its existing
 *  public API. */
export type CarcassCandidate = {
  readonly mesh: { readonly position: { readonly x: number, readonly z: number } }
  readonly def: { readonly role: AnimalRole }
  readonly foodClaimedBy: unknown
  readonly foodConsumedPhase: CorpsePhase | null
  readonly meatHarvested: boolean
  isDead: () => boolean
  corpsePhase: () => CorpsePhase
  readyToRemove: () => boolean
  claimAsFood: (by: unknown) => boolean
  releaseFoodClaim: (by: unknown) => void
  markFoodConsumed: (phase: CorpsePhase) => void
}

/** A real-world food/water destination an animal is pursuing (plan 094) —
 *  `corpse` is set only for `kind: 'carcass'`, so the eater can release its
 *  claim on cancel/completion. */
export type SourceTargetKind = 'water' | 'forage' | 'carcass' | 'feed' | 'grassPatch'
export type SourceTarget = {
  kind: SourceTargetKind
  x: number
  z: number
  corpse?: CarcassCandidate
  /** Set only for `kind: 'water'` — which finite/infinite source this target
   *  resolves through at completion time (plan items-player-020 §4). */
  waterSource?: WaterSourceRef
  /** Set only for `kind: 'carcass'` — corpse phase/value/score captured at
   *  selection time (plan fauna-005), for `getDebugInfo()`'s `foodTarget`
   *  diagnostics only. The authoritative eat-time check re-reads the live
   *  corpse phase/value (`applySourceRelief`), never these cached values. */
  corpsePhase?: CorpsePhase
  foodValue?: number
  score?: number
  /** Set only for `kind: 'feed'` (plan fauna-010 §7) — the diet-eligible
   *  `ItemKind` selected from the owning household's `items` at search time.
   *  `applySourceRelief` re-checks/removes this exact kind on completion,
   *  never a re-derived one, so a completed eat always matches what was
   *  actually offered. */
  feedItemKind?: ItemKind
  /** Set only for `kind: 'grassPatch'` (plan fauna-010 §3/§4) — the stable
   *  `GrassForagePatch` id this target resolves through `grassForage` for
   *  live availability checks and final atomic consumption. */
  patchId?: string
}

/** Per-tick environment `AnimalAgent` threads into every selection/
 *  validation/relief call below — built fresh by `AnimalAgent`'s own
 *  `foragingContext()` only while a need is actually elevated (plan
 *  fauna-017 step 6a), never cached across ticks. */
export type ForagingContext = {
  x: number
  z: number
  home: { readonly x: number, readonly z: number }
  def: AnimalDef
  life: AnimalLifeState
  household: Household | null | undefined
  nowDays: number
  grassForage: GrassForageService | undefined
  sampleHeight: HeightSampler
  waterLevel: number
  sampleForestFactor?: (x: number, z: number) => number
  /** How far from `home` a selected/validated target may sit — `AnimalAgent`
   *  passes its flat `ROAM_RADIUS` (movement-domain constant, unrelated to
   *  foraging tuning), not a per-species wander band. */
  roamRadius: number
  isWalkable: (x: number, z: number) => boolean
  isNearVillage: (pos: { readonly x: number, readonly z: number }) => boolean
  /** Optional finite player-built trough provider (plan items-player-020 §4)
   *  — queried only during an active water search, never per frame. */
  waterSourceProvider?: AnimalWaterSourceProvider
  /** Physical water at a point — same sample `AnimalAgent.isWalkable()` uses. */
  sampleLocalWater?: (x: number, z: number) => LocalWaterSample
  /** Lake/river/ocean classifier (player drink seam) — when absent, ocean
   *  exclusion falls back to dry-shore checks only. */
  naturalWaterKindAt?: (x: number, z: number) => WaterBodyKind | null
  /** When set, natural food/water targets must stay within this radius of the
   *  anchor (player position for Follow/lead, stay anchor for Stay). */
  needAnchor?: { readonly x: number, readonly z: number }
  needLeashRadius?: number
}

/** Natural shoreline drink point: dry or shallow wade at the edge, never deep
 *  water or undrinkable ocean. */
export function isDrinkableNaturalShorePoint(ctx: ForagingContext, x: number, z: number): boolean {
  if (!ctx.isWalkable(x, z)) return false
  if (shoreProbeHits(x, z, ctx.sampleHeight, ctx.waterLevel) === 0) return false
  const kind = ctx.naturalWaterKindAt?.(x, z)
  if (kind === 'ocean') return false
  const sample = ctx.sampleLocalWater?.(x, z)
  if (sample?.present) {
    const mode = classifyWaterTraversal(sample.depth, ctx.def.scale, ctx.def.water)
    if (mode === 'swimming' || mode === null) return false
    if (mode === 'wading' && sample.depth > wadeDepthFor(ctx.def.scale) * 0.85) return false
  }
  return true
}

function withinNeedLeash(ctx: ForagingContext, x: number, z: number): boolean {
  if (!ctx.needAnchor || ctx.needLeashRadius == null) return true
  return Math.hypot(x - ctx.needAnchor.x, z - ctx.needAnchor.z) <= ctx.needLeashRadius
}

/** Household `AnimalTrough` (plan 122) — preferred over a natural
 *  shoreline search when the owning household has stored water, the same
 *  "prefer local stored water" hierarchy `NpcAgent`'s personal thirst
 *  uses. Only livestock have a `household` (wild fauna: always `undefined`,
 *  falls straight through to the shoreline search below). */
export function findHouseholdTroughTarget(ctx: ForagingContext): SourceTarget | null {
  if (!ctx.household?.water.has(TROUGH_DRINK_AMOUNT)) return null
  return { kind: 'water', x: ctx.home.x, z: ctx.home.z, waterSource: { kind: 'household' } }
}

/** @deprecated Use `findHouseholdTroughTarget` — kept as a thin alias for
 *  existing tests/callers during the items-player-020 refactor. */
export const findTroughTarget = findHouseholdTroughTarget

function findPlayerTroughTarget(ctx: ForagingContext): SourceTarget | null {
  const provider = ctx.waterSourceProvider
  if (!provider) return null
  let best: { id: string, x: number, z: number } | null = null
  let bestScore = -Infinity
  for (const candidate of provider.queryAvailableNear(ctx.x, ctx.z, WATER_SEARCH_RADIUS)) {
    if (!provider.isAvailable(candidate.id, TROUGH_DRINK_AMOUNT)) continue
    if (!ctx.isWalkable(candidate.x, candidate.z)) continue
    if (ctx.def.sociability === 'wild' && ctx.isNearVillage(candidate)) continue
    if (Math.hypot(candidate.x - ctx.home.x, candidate.z - ctx.home.z) > ctx.roamRadius) continue
    if (!withinNeedLeash(ctx, candidate.x, candidate.z)) continue
    const d = Math.hypot(candidate.x - ctx.x, candidate.z - ctx.z)
    const score = -d
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
    ? { kind: 'water', x: best.x, z: best.z, waterSource: { kind: 'playerTrough', id: best.id } }
    : null
}

export function findWaterTarget(ctx: ForagingContext): SourceTarget | null {
  const householdTrough = findHouseholdTroughTarget(ctx)
  if (householdTrough) return householdTrough
  const playerTrough = findPlayerTroughTarget(ctx)
  if (playerTrough) return playerTrough
  const best = probeBestPointNear(
    { x: ctx.x, z: ctx.z },
    WATER_SEARCH_RADIUS,
    WATER_SEARCH_ATTEMPTS,
    (x, z) => {
      if (!isDrinkableNaturalShorePoint(ctx, x, z)) return false
      if (ctx.def.sociability === 'wild' && ctx.isNearVillage({ x, z })) return false
      if (Math.hypot(x - ctx.home.x, z - ctx.home.z) > ctx.roamRadius) return false
      return withinNeedLeash(ctx, x, z)
    },
    (x, z) => {
      const hits = shoreProbeHits(x, z, ctx.sampleHeight, ctx.waterLevel)
      const d = Math.hypot(x - ctx.x, z - ctx.z)
      return hits * 10 - d
    },
  )
  return best ? { kind: 'water', x: best.x, z: best.z, waterSource: { kind: 'natural' } } : null
}

/** Habitat-biased forage spot for wild prey/livestock — uses
 *  `sampleForestFactor` when available (wild fauna, see `createFauna.ts`);
 *  falls back to distance-only scoring when it isn't (livestock, plan
 *  094 §2). */
export function findForageTarget(ctx: ForagingContext): SourceTarget | null {
  const best = probeBestPointNear(
    { x: ctx.x, z: ctx.z },
    FOOD_SEARCH_RADIUS,
    FOOD_SEARCH_ATTEMPTS,
    (x, z) => {
      if (!ctx.isWalkable(x, z)) return false
      if (ctx.def.sociability === 'wild' && ctx.isNearVillage({ x, z })) return false
      return Math.hypot(x - ctx.home.x, z - ctx.home.z) <= ctx.roamRadius
    },
    (x, z) => {
      const suitability = ctx.sampleForestFactor ? forageEdgeScore(ctx.sampleForestFactor(x, z)) : 0.5
      const d = Math.hypot(x - ctx.x, z - ctx.z)
      return suitability * 10 - d
    },
  )
  return best ? { kind: 'forage', x: best.x, z: best.z } : null
}

/** Best-scoring reachable `GrassForagePatch` within `FOOD_SEARCH_RADIUS`
 *  (plan fauna-010 §3/§4) — same walkable/village/roam-radius filtering and
 *  closer-is-better scoring idiom as `findForageTarget`, applied to the
 *  candidate set `grassForage.queryNear()` returns instead of random
 *  terrain points. No claim is taken here: two animals may target the same
 *  patch, and the race resolves atomically at `applySourceRelief` time
 *  (`grassForage.consume()`'s first-wins contract) — the loser's
 *  `isSourceTargetValid` check then simply fails and it replans. */
export function findGrassPatchTarget(ctx: ForagingContext, grassForage: GrassForageService): SourceTarget | null {
  let best: SourceTarget | null = null
  let bestScore = -Infinity
  for (const candidate of grassForage.queryNear(ctx.x, ctx.z, FOOD_SEARCH_RADIUS, ctx.nowDays)) {
    if (!ctx.isWalkable(candidate.x, candidate.z)) continue
    if (ctx.def.sociability === 'wild' && ctx.isNearVillage(candidate)) continue
    if (Math.hypot(candidate.x - ctx.home.x, candidate.z - ctx.home.z) > ctx.roamRadius) continue
    const d = Math.hypot(candidate.x - ctx.x, candidate.z - ctx.z)
    const score = -d
    if (score > bestScore) {
      bestScore = score
      best = { kind: 'grassPatch', x: candidate.x, z: candidate.z, patchId: candidate.id }
    }
  }
  return best
}

/** Diet-aware herbivore food search (plan fauna-010 §2/§3/§4/§7) — replaces
 *  the old abstract "any suitable terrain point" forage for every species
 *  with `def.diet`: prefers an eligible item already sitting in the owning
 *  household's `items` (mirrors `findTroughTarget`'s "prefer local stored
 *  resource" hierarchy), then falls back to a real `GrassForagePatch`.
 *  A species without `def.diet` (out of this plan's scope — duck/boar) or
 *  with no `grassForage` service wired in keeps the old abstract
 *  `findForageTarget()` behaviour unchanged. */
function findDietTarget(ctx: ForagingContext): SourceTarget | null {
  const diet = ctx.def.diet
  if (!diet) return findForageTarget(ctx)
  if (ctx.household && diet.items) {
    // Lazy hay top-up (plan fauna-010 §6) — resolved right before reading
    // eligibility, not on a schedule; see `Household.resolveHayForage`'s doc.
    ctx.household.resolveHayForage(ctx.nowDays)
    const feedItemKind = selectDietFeedKind(ctx.household.items, diet.items)
    if (feedItemKind) return { kind: 'feed', x: ctx.home.x, z: ctx.home.z, feedItemKind }
  }
  if (diet.grass != null && ctx.grassForage) {
    return findGrassPatchTarget(ctx, ctx.grassForage)
  }
  return null
}

/** Best-scoring unclaimed dead prey within `FOOD_SEARCH_RADIUS` (plan
 *  094/fauna-005): a `fresh` corpse is always eligible baseline food;
 *  `rotting`/`bones` are additionally scored via `carcassFoodValue`/
 *  `carcassCandidateScore` so only a species with the `scavenging`
 *  capability (currently only wolf), hungry enough, will fall back onto
 *  lower-quality remains — and even then a reachable fresh kill always
 *  wins (see `CARCASS_VALUE_WEIGHT`'s doc). Claimed on selection so a
 *  second predator can't also target it (plan 094 §8). */
function findCarcassTarget<T extends CarcassCandidate>(
  ctx: ForagingContext,
  eater: unknown,
  others: readonly T[],
): SourceTarget | null {
  let best: T | null = null
  let bestScore = -Infinity
  let bestValue = 0
  for (const o of others) {
    if (o === eater || o.def.role !== 'prey') continue
    const phase = o.corpsePhase()
    if (!isCarcassEdible({
      dead: o.isDead(),
      expired: o.readyToRemove(),
      consumed: o.foodConsumedPhase === phase,
      harvested: o.meatHarvested,
      claimedBy: o.foodClaimedBy,
      eater,
    })) continue
    const d = Math.hypot(o.mesh.position.x - ctx.x, o.mesh.position.z - ctx.z)
    if (d > FOOD_SEARCH_RADIUS) continue
    const value = carcassFoodValue(phase, ctx.def.scavenging, ctx.life.hunger)
    if (value == null) continue
    const score = carcassCandidateScore(value, d)
    if (score > bestScore) {
      bestScore = score
      best = o
      bestValue = value
    }
  }
  if (!best || !best.claimAsFood(eater)) return null
  return {
    kind: 'carcass',
    x: best.mesh.position.x,
    z: best.mesh.position.z,
    corpse: best,
    corpsePhase: best.corpsePhase(),
    foodValue: bestValue,
    score: bestScore,
  }
}

/** Role-dispatched food search (plan 094/fauna-005/fauna-010) — a predator
 *  always seeks a carcass; anything else goes through the diet-aware
 *  herbivore search (or the old abstract forage fallback). */
export function findFoodTarget<T extends CarcassCandidate>(
  ctx: ForagingContext,
  eater: unknown,
  others: readonly T[],
): SourceTarget | null {
  return ctx.def.role === 'predator' ? findCarcassTarget(ctx, eater, others) : findDietTarget(ctx)
}

/** Completion-time (and cancel-time) revalidation — re-checks the *live*
 *  source rather than trusting anything cached on `target` at selection
 *  time, so a source that decayed/emptied/was-taken while the animal was
 *  approaching grants no relief (plan fauna-005/fauna-010 §7). */
export function isSourceTargetValid(ctx: ForagingContext, eater: unknown, target: SourceTarget): boolean {
  if (target.kind === 'carcass') {
    const corpse = target.corpse
    if (!corpse) return false
    const phase = corpse.corpsePhase()
    if (!isCarcassEdible({
      dead: corpse.isDead(),
      expired: corpse.readyToRemove(),
      consumed: corpse.foodConsumedPhase === phase,
      harvested: corpse.meatHarvested,
      claimedBy: corpse.foodClaimedBy,
      eater,
    })) return false
    // Plan fauna-005: a non-scavenger's fresh target can decay past
    // `fresh` while it's still approaching — same rejection `findCarcassTarget`
    // would apply to a fresh search this frame, checked live rather than
    // trusting the phase cached on `target` at selection time.
    if (carcassFoodValue(phase, ctx.def.scavenging, ctx.life.hunger) == null) return false
    return corpse.foodClaimedBy === eater
  }
  if (target.kind === 'feed') {
    // Re-checked live, not cached — another animal/NPC may have taken the
    // last unit while this one was approaching (plan fauna-010 §7, same
    // "no free relief on a raced source" contract as the trough above).
    return !!target.feedItemKind && !!ctx.household?.items.has(target.feedItemKind, 1)
  }
  if (target.kind === 'grassPatch') {
    if (!target.patchId || !ctx.grassForage?.isAvailable(target.patchId, ctx.nowDays)) return false
    if (!ctx.isWalkable(target.x, target.z)) return false
    return Math.hypot(target.x - ctx.home.x, target.z - ctx.home.z) <= ctx.roamRadius
  }
  if (target.kind === 'water' && target.waterSource?.kind === 'playerTrough') {
    if (!ctx.waterSourceProvider?.isAvailable(target.waterSource.id, TROUGH_DRINK_AMOUNT)) return false
  }
  if (!ctx.isWalkable(target.x, target.z)) return false
  if (Math.hypot(target.x - ctx.home.x, target.z - ctx.home.z) > ctx.roamRadius) return false
  if (!withinNeedLeash(ctx, target.x, target.z)) return false
  if (target.kind === 'water' && target.waterSource?.kind === 'natural') {
    return isDrinkableNaturalShorePoint(ctx, target.x, target.z)
  }
  return true
}

/** The five-arm "revalidate at completion or grant no relief" switch (plan
 *  094/fauna-005/fauna-010) — each arm grants relief only after a
 *  successful atomic mutation (household water/item removal, a live
 *  carcass-value re-read, `grassForage`'s first-wins `consume()`), never
 *  unconditionally. Called once, by `AnimalAgent.performSourceAction()`,
 *  after its own `actionTimer` gate elapses — this function owns none of
 *  that timing. */
export function applySourceRelief(ctx: ForagingContext, target: SourceTarget): void {
  if (target.kind === 'water') {
    const source = target.waterSource ?? { kind: 'natural' }
    if (source.kind === 'household') {
      // Household trough may have run dry while approaching (another
      // animal/NPC drank first) — no free relief; next search re-checks the
      // reserve and falls back to shoreline/player trough (plan 122).
      if (ctx.household?.water.has(TROUGH_DRINK_AMOUNT)) {
        ctx.household.water.remove(TROUGH_DRINK_AMOUNT)
        drinkWater(ctx.life)
      }
    } else if (source.kind === 'playerTrough') {
      if (ctx.waterSourceProvider?.consume(source.id, TROUGH_DRINK_AMOUNT)) {
        drinkWater(ctx.life)
      }
    } else {
      drinkWater(ctx.life)
    }
  } else if (target.kind === 'carcass' && target.corpse) {
    // Re-read the live corpse rather than the value cached on `target` at
    // selection time — a failed revalidation (already harvested, phase
    // drifted past what this eater can still eat) must not grant free
    // hunger relief (plan fauna-005).
    const corpse = target.corpse
    const phase = corpse.corpsePhase()
    const value = corpse.meatHarvested ? null : carcassFoodValue(phase, ctx.def.scavenging, ctx.life.hunger)
    if (value != null) {
      consumeFood(ctx.life, value)
      corpse.markFoodConsumed(phase)
    }
  } else if (target.kind === 'feed' && target.feedItemKind) {
    // Re-checked/removed by the exact kind selected at search time, not a
    // re-derived one (plan fauna-010 §7) — mirrors the trough's live
    // `household.water.has`/`.remove` re-check above. A failed `remove`
    // (another consumer took the last unit first) grants no relief; the
    // next search replans through the existing retry/cooldown path.
    if (ctx.household?.items.remove(target.feedItemKind, 1)) {
      const relief = dietItemReliefScale(ctx.def.diet, target.feedItemKind) ?? 1
      consumeFood(ctx.life, relief)
    }
  } else if (target.kind === 'grassPatch' && target.patchId) {
    // Atomic first-wins consumption (plan fauna-010 §3/§4) — a losing
    // competitor for the same patch gets no relief and replans through the
    // same retry/cooldown path as every other invalidated source.
    if (ctx.grassForage?.consume(target.patchId, ctx.nowDays)) {
      consumeFood(ctx.life, ctx.def.diet?.grass ?? 1)
    }
  } else {
    consumeFood(ctx.life)
  }
}
