import type { ItemKind } from '../items/items'
import type { AnimalWaterCapability } from './waterTraversal'
import { type AnimalMetabolismConfig, DEFAULT_ANIMAL_METABOLISM } from './AnimalLife'

/**
 * @domain fauna
 * @role Species taxonomy and per-kind tuning data for `AnimalAgent` — no
 *  runtime/agent state, no Three.js. Moved out of `AnimalAgent.ts` (plan
 *  fauna-017 step 1): 31% of that file was this module's data sitting above
 *  the class. Re-exported wholesale from `AnimalAgent.ts` via `export *`, so
 *  every existing importer of species types/`ANIMAL_DEFS` is unaffected.
 */

export type AnimalRole = 'predator' | 'prey' | 'livestock'
/** `wild` animals are wary of humans/the village and avoid it; `domestic`
 *  animals aren't afraid of people and treat the village/farmstead as safe
 *  ground to flee toward (plan 044 §2.3/§2.4). */
export type AnimalSociability = 'wild' | 'domestic'
/** `juvenile` follows its mother and is visually scaled down
 *  (`JUVENILE_SCALE_FACTOR`) until it ages past `JUVENILE_MATURITY_SECONDS`
 *  (plan 118). Only assigned by herding-species spawn logic. */
export type AnimalLifeStage = 'adult' | 'juvenile'
/** wolf/fox/deer/stag + livestock (chicken/sheep/cow/horse/donkey) have GLBs
 *  under `public/models/fauna/`; rabbit/duck/boar stay procedural. */
export type AnimalKind =
  | 'wolf'
  | 'fox'
  | 'deer'
  | 'stag'
  | 'rabbit'
  | 'duck'
  | 'boar'
  | 'bear'
  | 'horse'
  | 'donkey'
  | 'cow'
  | 'sheep'
  | 'chicken'
  | 'rooster'
  | 'dog'
  /** Settlement-habitat pest species (plan fauna-016 §7) — a plain
   *  `AnimalAgent`, spawned/despawned by `settlement/rats.ts` toward a small
   *  pressure-derived population, never `ownerHouseId`-tagged like real
   *  livestock. */
  | 'rat'

export const ANIMAL_LABELS: Record<AnimalKind, string> = {
  wolf: 'wilk',
  fox: 'lis',
  deer: 'sarna',
  stag: 'jeleń',
  rabbit: 'królik',
  duck: 'kaczka',
  boar: 'dzik',
  bear: 'niedźwiedź',
  horse: 'koń',
  donkey: 'osioł',
  cow: 'krowa',
  sheep: 'owca',
  chicken: 'kura',
  rooster: 'kogut',
  dog: 'pies',
  rat: 'szczur',
}

export type AnimalDef = {
  kind: AnimalKind
  role: AnimalRole
  sociability: AnimalSociability
  color: number
  /** Capsule placeholder scale / height hint for GLB fit. */
  scale: number
  /** Target model height in world meters (GLB). */
  modelHeight: number
  walkSpeed: number
  sprintSpeed: number
  /** Predator-only: radius (m) within which it spots and chases the nearest prey.
   *  Meaningless for prey defs (their threat detection uses `fleeRange` instead). */
  detectRange: number
  /** Prey-only: radius (m) within which it notices the nearest predator and flees.
   *  Meaningless for predator defs (set to 0 — predators don't flee). */
  fleeRange: number
  /** Base radius (m) within which this animal can notice the player *if*
   *  also facing them (see `PLAYER_NOTICE_CONE_DOT`) — modified further by
   *  time of day/terrain, see `playerAwareness.ts::effectiveNoticeRange`.
   *  Applies to both roles: predators are wary of humans too, just less
   *  skittish than prey (smaller range). */
  playerNoticeRange: number
  /** Radius (m) within which the animal very likely notices the player
   *  regardless of facing direction — startled at close range, though even
   *  here detection is probabilistic, not absolute (plan 120). */
  playerPanicRange: number
  /** Presence of this field IS the `mountable` capability (plan fauna-003) —
   *  no separate boolean, so a future mountable species only ever needs to
   *  add this block, never a species branch in the riding code itself. */
  mount?: MountPointConfig
  /** Presence of this field IS the livestock-production capability (plan
   *  fauna-002) — same "no separate boolean, no per-species branch" shape
   *  as `mount` above. Absent for every wild `AnimalKind`. */
  production?: LivestockProductionConfig
  /** Presence of this field IS the corpse/bones-scavenging capability (plan
   *  fauna-005) — same "no separate boolean, no per-species branch" shape as
   *  `mount`/`production` above. A `fresh` corpse is always food for any
   *  predator (pre-existing plan 094 baseline); only a species with this
   *  block will additionally fall back onto a `rotting` corpse or `bones`
   *  once hungry enough — see `carcassFoodValue()`. Absent for every
   *  `AnimalKind` but wolf initially. */
  scavenging?: ScavengingConfig
  /** Basic physiology (plan fauna-010 §1) — hunger/thirst rates and stamina
   *  capacity/drain/regen for this species. `AnimalLife.ts` owns the
   *  runtime `hunger`/`thirst`/`stamina` state and its create/tick
   *  operations; this is only the per-species input to them. Required so
   *  every species is explicit, but every kind currently uses
   *  `DEFAULT_ANIMAL_METABOLISM` unless noted otherwise. */
  metabolism: AnimalMetabolismConfig
  /** Presence of this field IS the herbivore/meat-diet capability (plan
   *  fauna-010 §2) — same "no separate boolean, no per-species branch" shape
   *  as `mount`/`production`/`scavenging` above. `findFoodTarget()` still
   *  falls back to the old abstract forage/carcass path for any species
   *  without one (`bear`/`duck`); a `role: 'predator'` kind with a `diet`
   *  (`wolf`/`fox`, plan fauna-014 §2) never has it read for hunger either —
   *  `findFoodTarget()`'s carcass branch always wins for predators — only
   *  `dietAcceptsItem()` (trap-bait attraction) reads it there. */
  diet?: AnimalDietConfig
  /** Minimal declarative water-traversal distinction (plan fauna-015 §5) —
   *  same "no separate boolean, no per-species branch" shape as `mount`/
   *  `production`/`scavenging`/`diet` above. Absent means the default land
   *  animal: can wade, can also swim (at the generic exertion cost) once
   *  water is deeper than its own scale-derived wading depth — see
   *  `waterTraversal.ts`'s `classifyWaterTraversal`/`wadeDepthFor`. */
  water?: AnimalWaterCapability
  /** Species-specific local wander band `[min,max]` (m) from `home` (plan
   *  fauna-016 §3) — replaces the flat `DEFAULT_WANDER_RADIUS` fallback every
   *  kind used before this plan. Absent keeps that historic default. The
   *  constructor's own `wanderRadius` parameter (livestock's fixed
   *  `LIVESTOCK_WANDER_RADIUS` override) still wins over this when supplied. */
  roaming?: readonly [number, number]
  /** Declarative periodic "trip" opportunities beyond normal local wander
   *  (plan fauna-016 §4/§5) — currently only `water`. Absent species never
   *  leave local wander/needs-driven movement for one of these. */
  trips?: {
    water?: WaterTripConfig
  }
  /** Presence of this field IS the human-affinity capability (plan fauna-013)
   *  — only species that consume it (dog in V1) get sparse per-individual
   *  relationship state; other hand-fed livestock use the same feeding flow
   *  without allocating affinity. */
  affinity?: AnimalAffinityConfig
  /** Presence of this field IS the leadable capability (plan fauna-007) —
   *  same "no separate boolean, no per-species branch" shape as `mount`.
   *  Distances default in `animalLead.ts` when omitted. Not equivalent to
   *  `mount`. */
  lead?: LeadConfig
  /** Presence of this field IS the draft/cart-pull capability (plan
   *  fauna-007). Not equivalent to `mount` or `lead`. */
  draft?: DraftConfig
  /** Species 0..1 fear of sudden world stimuli such as thunder (plan
   *  world-026). Absent uses `DEFAULT_FEAR_BASELINE` in `animalScare.ts`. */
  fearBaseline?: number
}

/** Per-species human-affinity tuning (plan fauna-013) — gain applies only
 *  after a successful hand-feed commit; `trustedThreshold` is interpreted by
 *  behaviour (e.g. dog stranger bark), not ownership/guard priority. */
export type AnimalAffinityConfig = {
  gainPerSuccessfulFeed: number
  max: number
  trustedThreshold: number
}

/** One species' water-trip policy (plan fauna-016 §5) — deliberately not a
 *  wider "trip" bag: this is the only trip kind implemented so far, see
 *  `AnimalTrip`'s doc for the generic runtime state this feeds. */
export type WaterTripConfig = {
  /** In-game days between opportunities to start a new trip — the animal's
   *  own id phase-offsets this so a settlement's/region's population doesn't
   *  all become "due" on the same day (see `tripDayBucket`). */
  cooldownDays: number
  /** How long (seconds) the animal lingers once it reaches the water. */
  stayDurationSec: number
  /** Max distance (m) from `home` the destination search will look —
   *  deliberately allowed to exceed the species' own `roaming` band (plan
   *  fauna-016 §6). */
  searchRadius: number
}

/** Declarative per-species diet (plan fauna-010 §2/§3) — answers both "is
 *  this source/item edible for this species" and "what relief scale should
 *  `consumeFood()` receive", read by `findDietTarget()`/`performSourceAction()`
 *  instead of deriving herbivore diet from `AnimalRole`. `grass` gates and
 *  scales a `GrassForagePatch` (`world/grassForage.ts`); `items` gates and
 *  scales a household-feed item (plan fauna-010 §7) — both relief scales are
 *  relative to `FOOD_RELIEF`'s full-meal baseline of 1, same convention as
 *  `ScavengingConfig`'s values. */
export type AnimalDietConfig = {
  grass?: number
  items?: Partial<Record<ItemKind, number>>
}

/** Per-species scavenging preference (plan fauna-005) — the single config
 *  block `carcassFoodValue()` reads instead of a wolf-specific branch in
 *  food selection/consumption. Both values are relative to a fresh kill's
 *  implicit value of 1. */
export type ScavengingConfig = {
  /** Relative food value of a `rotting` corpse for this species — scales
   *  both selection score (`carcassCandidateScore`) and the hunger relief a
   *  completed eat action grants (`AnimalLife.ts`'s `consumeFood`). */
  rottingValue: number
  /** Relative food value of `bones` remains for this species — the lowest
   *  tier, see `SCAVENGE_BONES_HUNGER_THRESHOLD`. */
  bonesValue: number
}

/** Temporary player-lead trailing band (plan fauna-007). Absent fields use
 *  `animalLead.ts` defaults so a future leadable species only needs `lead: {}`. */
export type LeadConfig = {
  startDistance?: number
  stopDistance?: number
}

/** Hitch offset behind this species when pulling a cart (plan fauna-007). */
export type DraftConfig = {
  hitchDistance: number
}

/** Rider seat placement for a mountable `AnimalDef` (plan fauna-003 §6) —
 *  world-space seat transform is derived from these plus the animal's own
 *  `mesh.position`/`mesh.rotation.y` in `AnimalAgent.mountSeatTransform()`. */
export type MountPointConfig = {
  /** Seat height (m) above the animal's own ground-snapped `mesh.position.y`. */
  seatHeight: number
  /** Seat offset (m) along the animal's forward facing, + toward the head. */
  seatForwardOffset: number
  walkSpeed: number
  sprintSpeed: number
}

export type LivestockProductKind = 'egg' | 'milk'

/** Per-species production tuning (plan fauna-002 §5) — the single config
 *  block every farm-animal kind's production timer/yield reads, instead of
 *  a parallel `ChickenEggSystem`/`CowMilkSystem`/`SheepMilkSystem`.
 *  `amount` is a count for `egg` (always 1) or litres for `milk`.
 *  `intervalDays` is a world-time (`elapsedDays`) duration — the time
 *  between one egg being collected and the next becoming ready (`egg`), or
 *  the cooldown after milking before the animal can be milked again
 *  (`milk`) — deliberately days, not real seconds: settlement livestock
 *  streams out/in and must resolve correctly regardless of how long it was
 *  unloaded, so readiness is a lazy `nowDays` comparison
 *  (`livestockProductionReady`), never a per-frame decrementing timer. */
export type LivestockProductionConfig = {
  product: LivestockProductKind
  amount: number
  intervalDays: number
}

/** Shared diet shape for this plan's herbivore scope (plan fauna-010 §2) —
 *  horse/donkey/cow/sheep/deer/stag/rabbit. Grass forage is a full meal
 *  (relief 1, same as the old abstract forage baseline); hay/fruit/
 *  vegetable are real but slightly lower-quality household feed, so a
 *  well-stocked household still reads as better than foraging without
 *  making forage pointless. */
const HERBIVORE_DIET: AnimalDietConfig = {
  grass: 1,
  items: { hay: 0.9, apple: 0.6, carrot: 0.5 },
}

/** Shared meat diet (plan fauna-011 §3/§4, reused by wolf/fox in plan
 *  fauna-014 §2) — no `grass` and no `scavenging` block; `items` lists every
 *  raw/bait-tagged meat `ItemKind` (`itemCatalog.ts`'s `food.bait ===
 *  'meat'`) at a relief scale slightly below a fresh kill's implicit 1,
 *  matching `HERBIVORE_DIET`'s convention. For `dog` (`role: 'livestock'`)
 *  this is real hunger relief: household-stored meat, just not quite as good
 *  as what a predator eats fresh — the sole "eats meat but doesn't hunt"
 *  seam (`role !== 'predator'` already keeps `findFoodTarget()` off the
 *  carcass-seeking branch and `resolveNpcTarget()` from ever running for
 *  this kind, see `AnimalDef.role`'s doc). For `wolf`/`fox` (`role:
 *  'predator'`) `findFoodTarget()` always takes the carcass branch instead
 *  (see its own doc), so this diet is never read for hunger there — its only
 *  live consumer for those two kinds is `dietAcceptsItem()`, answering "is
 *  this bait item attractive to this species" for trap lures without a
 *  second trapping-only bait table. */
const MEAT_DIET: AnimalDietConfig = {
  items: { raw_meat: 0.8, deer_meat: 0.8, wolf_meat: 0.8, boar_meat: 0.8, rabbit_meat: 0.6, beef: 0.8 },
}

/** Whether `itemKind` is something this diet would eat (plan fauna-014 §2) —
 *  the single authority `resolveLureTarget()` uses to decide if a trap's
 *  bait actually attracts a species, instead of a parallel trap-only bait
 *  table. Absent `diet` (a species with no herbivore/meat diet configured,
 *  e.g. `boar`/`duck`/`bear`) never matches — same "capability absent →
 *  never taken" convention as every other `AnimalDef.diet` consumer. */
export function dietAcceptsItem(diet: AnimalDietConfig | undefined, itemKind: ItemKind): boolean {
  return diet?.items?.[itemKind] != null
}

/** Species-specific roaming tiers (plan fauna-016 §3) — `AnimalDef.roaming`
 *  values, small below the historic `DEFAULT_WANDER_RADIUS`, large above it.
 *  Not an exhaustive tier system, just the two bands this plan's species
 *  table (rabbit/duck small, deer/stag/wolf large) actually needs; a species
 *  without a `roaming` override keeps `DEFAULT_WANDER_RADIUS`. */
const SMALL_ROAMING_RANGE: readonly [number, number] = [4, 9]
const LARGE_ROAMING_RANGE: readonly [number, number] = [10, 24]
/** Deer/stag water-trip policy (plan fauna-016 §5) — roughly every 2 in-game
 *  days, a short stay, reaching well past `LARGE_ROAMING_RANGE`'s own max. */
const DEER_WATER_TRIP: WaterTripConfig = { cooldownDays: 2, stayDurationSec: 25, searchRadius: 45 }
/** Bear water-trip policy (plan fauna-019 §7) — same declarative seam as
 *  `DEER_WATER_TRIP`, not a `kind === 'bear'` branch in the trip state
 *  machine. A cave-backed bear's `home` is its interior chamber, so this
 *  search radius is deliberately allowed to exceed `ROAM_RADIUS`
 *  (`AnimalAgent.ts`) — `continueTrip()`'s cave-route routing (not this
 *  radius) is what gets it there. */
const BEAR_WATER_TRIP: WaterTripConfig = { cooldownDays: 3, stayDurationSec: 30, searchRadius: 65 }

export const ANIMAL_DEFS: Record<AnimalKind, AnimalDef> = {
  wolf: {
    kind: 'wolf',
    role: 'predator',
    sociability: 'wild',
    color: 0x5a5a62,
    scale: 0.85,
    modelHeight: 0.95,
    walkSpeed: 3.2,
    sprintSpeed: 6.5,
    detectRange: 18,
    fleeRange: 0,
    playerNoticeRange: 10,
    playerPanicRange: 3,
    // Plan fauna-005: the initial (and currently only) scavenging-capable
    // species — rotting is a meaningful but clearly worse fallback, bones a
    // low-priority last resort.
    scavenging: { rottingValue: 0.4, bonesValue: 0.15 },
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    // Plan fauna-014 §2: inert for hunger (predator `findFoodTarget()` always
    // takes the carcass branch, never `findDietTarget()`) — the sole live
    // reader is `dietAcceptsItem()`, so a `good` trap's meat bait can attract
    // a wolf without a second trapping-only compatibility table.
    diet: MEAT_DIET,
    // Plan fauna-016 §3: a pack ranges further than the default band.
    roaming: LARGE_ROAMING_RANGE,
  },
  fox: {
    kind: 'fox',
    role: 'predator',
    sociability: 'wild',
    color: 0xb85a2a,
    scale: 0.55,
    modelHeight: 0.55,
    walkSpeed: 3.0,
    sprintSpeed: 6.2,
    detectRange: 15,
    fleeRange: 0,
    playerNoticeRange: 9,
    playerPanicRange: 3,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    // Same as `wolf` above — inert for hunger, only read by
    // `dietAcceptsItem()` for trap-bait attraction (plan fauna-014 §2).
    diet: MEAT_DIET,
  },
  deer: {
    kind: 'deer',
    role: 'prey',
    sociability: 'wild',
    color: 0xa67c52,
    scale: 0.95,
    modelHeight: 1.15,
    walkSpeed: 3.5,
    sprintSpeed: 7.5,
    detectRange: 16,
    fleeRange: 14,
    playerNoticeRange: 18,
    playerPanicRange: 4,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: HERBIVORE_DIET,
    // Plan fauna-016 §3/§5: ranges further than the default band and
    // periodically makes a deliberate trip out to water.
    roaming: LARGE_ROAMING_RANGE,
    trips: { water: DEER_WATER_TRIP },
  },
  stag: {
    kind: 'stag',
    role: 'prey',
    sociability: 'wild',
    color: 0x8a6238,
    scale: 1.05,
    modelHeight: 1.35,
    walkSpeed: 3.3,
    sprintSpeed: 7.2,
    detectRange: 17,
    fleeRange: 15,
    playerNoticeRange: 16,
    playerPanicRange: 4,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: HERBIVORE_DIET,
    roaming: LARGE_ROAMING_RANGE,
    trips: { water: DEER_WATER_TRIP },
  },
  rabbit: {
    kind: 'rabbit',
    role: 'prey',
    sociability: 'wild',
    color: 0xb8a088,
    scale: 0.4,
    modelHeight: 0.42,
    walkSpeed: 2.6,
    sprintSpeed: 6.8,
    detectRange: 12,
    fleeRange: 11,
    playerNoticeRange: 14,
    playerPanicRange: 3,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: HERBIVORE_DIET,
    // Plan fauna-016 §3: stays closer to its burrow than the default band.
    roaming: SMALL_ROAMING_RANGE,
  },
  duck: {
    kind: 'duck',
    role: 'prey',
    sociability: 'wild',
    color: 0x8a6a45,
    scale: 0.4,
    modelHeight: 0.38,
    walkSpeed: 2.2,
    sprintSpeed: 5.2,
    detectRange: 10,
    fleeRange: 9,
    playerNoticeRange: 12,
    playerPanicRange: 3,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    // Plan fauna-015 §5: the counterexample a land-animal-only water model
    // can't express — surface swimming is ordinary locomotion for a duck,
    // not an emergency effort.
    water: { waterAdapted: true },
    // Plan fauna-016 §3: already water-anchored, stays close to shore.
    roaming: SMALL_ROAMING_RANGE,
  },
  boar: {
    kind: 'boar',
    role: 'prey',
    sociability: 'wild',
    color: 0x3d2e22,
    scale: 0.9,
    modelHeight: 0.9,
    walkSpeed: 2.8,
    sprintSpeed: 6.4,
    detectRange: 14,
    fleeRange: 12,
    playerNoticeRange: 13,
    playerPanicRange: 4,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    // Plan fauna-016 §3: ranges a bit further than the default band.
    roaming: LARGE_ROAMING_RANGE,
  },
  bear: {
    kind: 'bear',
    role: 'predator',
    sociability: 'wild',
    color: 0x4a3a2a,
    scale: 1.5,
    modelHeight: 1.5,
    walkSpeed: 2.6,
    sprintSpeed: 6.0,
    detectRange: 20,
    fleeRange: 0,
    playerNoticeRange: 13,
    playerPanicRange: 5,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    trips: { water: BEAR_WATER_TRIP },
  },
  horse: {
    kind: 'horse',
    role: 'livestock',
    sociability: 'domestic',
    color: 0x6b4423,
    scale: 1.3,
    modelHeight: 1.55,
    // Plan fauna-008: raised above the pre-existing 2.6/6.0 so the mounted
    // baseline clears `MOVE_SPEED`/`MOVE_SPEED * SPRINT_MULTIPLIER` (8/14.4)
    // on its own, independent of the player's Riding skill — see
    // `ridingSpeedMultiplier` in `PlayerSkills.ts`.
    walkSpeed: 2.6,
    sprintSpeed: 6.0,
    detectRange: 0,
    fleeRange: 10,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    mount: {
      seatHeight: 0.28,
      seatForwardOffset: -0.01,
      walkSpeed: 10.5,
      sprintSpeed: 17.5,
    },
    lead: {},
    draft: { hitchDistance: 2.35 },
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: HERBIVORE_DIET,
    fearBaseline: 0.55,
  },
  donkey: {
    kind: 'donkey',
    role: 'livestock',
    sociability: 'domestic',
    color: 0x7a6a58,
    scale: 1.05,
    modelHeight: 1.15,
    // Plan fauna-008: the slowest rideable species — still raised above the
    // human baseline (see `horse` above) even though it stays under horse.
    walkSpeed: 2.4,
    sprintSpeed: 5.4,
    detectRange: 0,
    fleeRange: 9,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    mount: {
      seatHeight: 0.3,
      seatForwardOffset: 0.02,
      walkSpeed: 9.0,
      sprintSpeed: 15.5,
    },
    lead: {},
    draft: { hitchDistance: 2.15 },
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: HERBIVORE_DIET,
    fearBaseline: 0.5,
  },
  cow: {
    kind: 'cow',
    role: 'livestock',
    sociability: 'domestic',
    color: 0xede4d3,
    scale: 1.1,
    modelHeight: 1.3,
    walkSpeed: 1.8,
    sprintSpeed: 4.2,
    detectRange: 0,
    fleeRange: 8,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    production: { product: 'milk', amount: 5, intervalDays: 0.5 },
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: HERBIVORE_DIET,
    fearBaseline: 0.4,
  },
  sheep: {
    kind: 'sheep',
    role: 'prey',
    sociability: 'domestic',
    color: 0xe8e3d3,
    scale: 0.7,
    modelHeight: 0.68,
    walkSpeed: 2.2,
    sprintSpeed: 5.4,
    detectRange: 0,
    fleeRange: 12,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    production: { product: 'milk', amount: 2, intervalDays: 0.35 },
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: HERBIVORE_DIET,
    fearBaseline: 0.72,
  },
  chicken: {
    kind: 'chicken',
    role: 'prey',
    sociability: 'domestic',
    color: 0xa8783c,
    scale: 0.35,
    modelHeight: 0.4,
    walkSpeed: 1.8,
    sprintSpeed: 4.8,
    detectRange: 0,
    fleeRange: 10,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    production: { product: 'egg', amount: 1, intervalDays: 1 },
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    fearBaseline: 0.88,
  },
  // Plan fauna-009 §2: a distinct AnimalKind for crow vocalization/presence,
  // reusing the chicken's stats — no `production` block (rooster doesn't
  // lay eggs/breed in this plan).
  rooster: {
    kind: 'rooster',
    role: 'prey',
    sociability: 'domestic',
    color: 0x8a3a2a,
    scale: 0.38,
    modelHeight: 0.44,
    walkSpeed: 1.8,
    sprintSpeed: 4.8,
    detectRange: 0,
    fleeRange: 10,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    fearBaseline: 0.8,
  },
  // Plan fauna-011: household dog. `role: 'livestock'` (not `'predator'`)
  // keeps it off the hunting/carcass-seeking path; `fleeRange: 0` (not
  // `'prey'` either) means it never flees a wolf via the default
  // `prey-normal` fallback — guarding is a dedicated higher-priority branch
  // (`faunaDecision.ts`'s `dog-guard`) instead. `playerNoticeRange`/
  // `playerPanicRange: 0` mirror every other domestic kind: a dog never
  // treats the player as a threat.
  dog: {
    kind: 'dog',
    role: 'livestock',
    sociability: 'domestic',
    color: 0xc8a878,
    scale: 0.55,
    modelHeight: 0.55,
    walkSpeed: 3.0,
    sprintSpeed: 6.8,
    detectRange: 0,
    fleeRange: 0,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
    diet: MEAT_DIET,
    affinity: { gainPerSuccessfulFeed: 0.25, max: 1, trustedThreshold: 0.75 },
    fearBaseline: 0.22,
  },
  // Plan fauna-016 §7: settlement-habitat pest. `sociability: 'domestic'`
  // (not `'wild'`) is deliberate, not a species-flavor accident — it's what
  // lets it wander/forage *inside* the village instead of the wild
  // village-avoidance every wild kind gets (`pickPointNear`/`findWaterTarget`/
  // `findForageTarget`'s `sociability === 'wild'` checks). It's still a
  // plain wild `AnimalAgent`, never `ownerHouseId`-tagged — spawned/despawned
  // by `settlement/rats.ts`, not `settlement/livestock.ts`.
  rat: {
    kind: 'rat',
    role: 'prey',
    sociability: 'domestic',
    color: 0x4a4640,
    scale: 0.25,
    modelHeight: 0.16,
    walkSpeed: 2.4,
    sprintSpeed: 5.6,
    detectRange: 0,
    fleeRange: 7,
    playerNoticeRange: 9,
    playerPanicRange: 2,
    metabolism: DEFAULT_ANIMAL_METABOLISM,
  },
}
