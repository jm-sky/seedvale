import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { Household } from '../settlement/household'
import { tintPropMaterials } from '../settlement/props'
import { damageHealth, type HealthState } from '../shared/HealthState'
import { drainStamina, getStaminaRatio, isExhausted } from '../shared/StaminaState'
import {
  type ActionLifecycle,
  adoptPlannedAction,
  copyVec3,
  createActionLifecycle,
  type DecisionContext,
  type PlannedAction,
} from '../simulation'
import { applySlopeMovementConstraint } from '../terrain/slopeConstraint'
import { barsVisibleForDistance, labelOpacityForDistance } from '../ui/labelDistance'
import { AGENT_RENDER_LAYER, assignRenderLayer, setSubtreeCastShadow } from '../world/waterMirror'
import {
  type AnimalLifeState,
  BIAS_STRENGTH,
  consumeFood,
  createAnimalLifeState,
  drinkWater,
  NEED_ELEVATED_THRESHOLD,
  SLEEP_HUNGER_THIRST_RATE,
  STAMINA_REST_THRESHOLD,
  tickAnimalLife,
} from './AnimalLife'
import { createBloodSplat, disposeBloodSplat } from './bloodSplat'
import { createHealthState, damageFor, damageVsHuman, MAX_HP } from './faunaCombat'
import {
  createHarvestedRemainsAsync,
  disposeHarvestedRemains,
} from './harvestedRemains'
import {
  HERD_FOLLOW_RADIUS,
  HERD_SPECIES,
  JUVENILE_MATURITY_SECONDS,
  JUVENILE_SCALE_FACTOR,
  MOTHER_FOLLOW_RADIUS,
  pickHerdLeader,
} from './herdCohesion'
import { detectionRoll, isPlayerNoticed, type PlayerStealthState, sneakDetectionMultiplier } from './playerAwareness'
import {
  decidePredatorHumanIntent,
  NEARBY_HUMAN_RADIUS,
  type PredatorHumanIntent,
  PROVOCATION_SECONDS,
} from './predatorHumanDecision'

/** Minimum clearance above waterLevel an animal will walk into or wander toward. */
const WATER_MARGIN = 0.3
/** Skip the shadow pass for distant animals (plan 113 P2). Exported so
 *  `shadowBudget.ts` can reuse the same radius to decide whether any
 *  shadow-casting animal is currently in range (plan 145 R1). */
export const FAUNA_SHADOW_DISTANCE = 36
/** Distance at which a predator can bite the prey it's chasing. */
const CONTACT_RANGE = 0.8
/** Minimum seconds between bites from the same predator, so contact doesn't
 *  melt prey HP in a single frame. */
const ATTACK_COOLDOWN = 0.6
/** Seconds a corpse stays in the scene (frozen pose) before it's disposed. */
const CORPSE_LINGER_SECONDS = 60
/** Seconds harvested remains stay after a knife harvest (plan 137) — own
 *  lifetime, not whatever was left of the unharvested 60 s linger. */
export const HARVESTED_REMAINS_LINGER_SECONDS = 90

export function corpseLingerSeconds(meatHarvested: boolean): number {
  return meatHarvested ? HARVESTED_REMAINS_LINGER_SECONDS : CORPSE_LINGER_SECONDS
}
/** "Groźny wilk" (plan 110) — `markDangerous()` tuning. A visible, tougher
 *  individual, not a separate animal type or model. */
const DANGEROUS_HP_MULTIPLIER = 2
const DANGEROUS_DAMAGE_MULTIPLIER = 2
const DANGEROUS_SCALE_FACTOR = 1.25
const DANGEROUS_TINT_HEX = 0x1a0f0f
/** Busy-channel duration for shovel-burying a corpse. */
export const BURY_DURATION_SEC = 1.5
/** Busy-channel duration for knife-harvesting `raw_meat` from a corpse —
 *  real-time (not a time-skip), same order of magnitude as bury/chop. */
export const HARVEST_MEAT_DURATION_SEC = 4
/** Prey wander speed at night vs. day (half speed — cautious/less active). */
const NIGHT_PREY_WALK_MULT = 0.5
/** Prey flee/sprint speed at night vs. day — smaller penalty than wander,
 *  since prey still needs to outrun predators, just not as well as by day. */
const NIGHT_PREY_SPRINT_MULT = 0.9
/** How far an animal will roam from its own spawn point — home-relative, not tied
 *  to any world/loaded-region bound, so fauna behaves the same near spawn or far
 *  away in a streamed world. Generous relative to wander/chase/flee radii (6–18),
 *  so it's only ever hit by a pathological long chase, where pulling back toward
 *  home is the desired behavior anyway. */
const ROAM_RADIUS = 50
/** Minimum dot(animalForward, toPlayer) to count as "in the animal's vision
 *  cone" — same convention/threshold family as `INTERACT_MIN_DOT` in
 *  `app/createApp.ts`, just wider (peripheral awareness, not a tight
 *  interact-prompt cone). */
const PLAYER_NOTICE_CONE_DOT = 0.3
/** How long (seconds) an animal keeps fleeing the player after last noticing
 *  them, even if the fresh geometric check (range/cone) would now fail —
 *  hysteresis, avoids flicker right at the edge of the notice range/cone. */
const ALERT_HOLD_SEC = 5
/** How often (seconds) the player-notice dice re-rolls (plan 120 §5/§6) —
 *  `detectionProbability` itself is still evaluated every `senseEnvironment`
 *  call (live distance/facing), but the random draw it's compared against is
 *  cached across this window so the roll doesn't redraw 60x/sec. Mirrors the
 *  `humanDecisionTimer`/`HUMAN_DECISION_INTERVAL_SEC` caching idiom below. */
const PERCEPTION_ROLL_INTERVAL_SEC = 0.5
/** Radius (world units) within which a *lit* campfire (village or
 *  player-placed, see `app/createApp.ts`'s `litFires`) repels any animal,
 *  predator or prey alike — pure distance, no facing cone (you don't need to
 *  be looking at a fire to smell/hear it). */
const FIRE_AVOID_RADIUS = 11
/** Distance the flee-target point is placed beyond the animal, along the
 *  away-from-threat direction — shared by fleeing a predator, the player, or
 *  a campfire (`fleeFrom()`). */
const FLEE_DISTANCE = 8
/** Clearance (world units) *past* a village's real footprint (`VillageInfo.radius`,
 *  see `settlement/families.ts`'s `VILLAGE_SIZE_CONFIG.footprintRadius`) that's
 *  off-limits to `wild` animals for both wandering and predator hunting — plan
 *  044 §2.3/§2.4: wild animals avoid settled ground, predators don't treat the
 *  village as hunting grounds. No hard wall — just excluded from candidate
 *  wander targets and from `updatePredator`'s prey search. Scaled per-village
 *  (plan 080) instead of a flat radius, since `VillageSize` footprints range
 *  from 22 (`OUTPOST`) to 72 (`XL`) world units. */
const VILLAGE_AVOID_MARGIN = 6
/** Clearance (world units) *past* a village's real footprint over which the
 *  flee-direction village bias (`fleeFrom`) ramps in — beyond
 *  `radius + this`, fleeing wild/domestic animals behave the same (the
 *  village is too far away to matter to which way they run). Scaled
 *  per-village (plan 080), same reasoning as `VILLAGE_AVOID_MARGIN`. */
const VILLAGE_FLEE_INFLUENCE_MARGIN = 25
/** How strongly the flee direction leans away from (wild) or toward
 *  (domestic) the nearest village, relative to the primary away-from-threat
 *  vector (magnitude 1) — big enough to visibly redirect a flee, per plan
 *  044's "sarna uciekająca... powinna preferować ucieczkę poza wioskę,
 *  nawet jeśli oznacza to zmianę kierunku ucieczki" example. */
const VILLAGE_FLEE_BIAS_WEIGHT = 0.9
/** Default `[min, max]` wander radius (world units) from `home` — every
 *  caller before house-anchored livestock (plan: village livestock
 *  ownership) used this hardcoded range; now the default for the optional
 *  constructor override, so `createFauna.ts`'s wild/wandering spawns are
 *  unaffected. */
const DEFAULT_WANDER_RADIUS: readonly [number, number] = [6, 16]
/** Chance per expired wander timer, while stamina ratio is below
 *  `STAMINA_REST_THRESHOLD`, that the animal extends the timer and stays put
 *  instead of picking a new wander target — a tired animal rests more. */
const EXTENDED_IDLE_CHANCE = 0.5
/** Flat stamina cost applied when a predator lands a bite — keeps attack
 *  aligned with the shared effort resource without a separate combat stamina
 *  subsystem. Small relative to `ANIMAL_STAMINA_MAX` (1). */
const ATTACK_STAMINA_COST = 0.05
/** How often predators re-score flee vs attack toward a noticed human
 *  (plan 055 Phase 6 — movement stays per-frame). */
const HUMAN_DECISION_INTERVAL_SEC = 0.2
/** Radius (world units) searched around the animal for a valid forage spot
 *  or a scavengeable carcass once hunger crosses `NEED_ELEVATED_THRESHOLD`
 *  (plan 094). */
const FOOD_SEARCH_RADIUS = 14
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
const FOOD_INTERACTION_RANGE = 1.4
/** Distance at which an animal counts as having arrived at a shoreline
 *  point, and can start drinking. */
const WATER_INTERACTION_RANGE = 1.2
/** Seconds spent stationary eating before hunger relief (`consumeFood`) is
 *  applied — a short, real action, not a per-frame drain. */
const EAT_DURATION_SEC = 3
/** Seconds spent stationary drinking before thirst relief (`drinkWater`) is
 *  applied. */
const DRINK_DURATION_SEC = 2
/** Seconds to wait before retrying a failed food/water search — without
 *  this, a hungry/thirsty animal with no source in range would re-scan
 *  candidate points every frame. */
const SOURCE_SEARCH_COOLDOWN_SEC = 3
/** Seconds an animal will pursue a cached food/water target before giving
 *  up and re-searching — guards against a target that passed validation but
 *  is effectively unreachable (e.g. boxed in by terrain `steerToward` can't
 *  route around). */
const SOURCE_TARGET_TIMEOUT_SEC = 20
/** Offsets (world units) probed around a water-search candidate to confirm
 *  it's actually at the edge of a water body, not just dry land somewhere
 *  within `WATER_SEARCH_RADIUS`. */
const SHORE_PROBE_OFFSETS: readonly [number, number][] = [
  [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5],
]

type FaunaActionKind = 'attack' | 'chase' | 'flee' | 'wander' | 'forage' | 'drink' | 'eat'

/** A real-world food/water destination an animal is pursuing (plan 094) —
 *  `corpse` is set only for `kind: 'carcass'`, so the eater can release its
 *  claim on cancel/completion. */
type SourceTargetKind = 'water' | 'forage' | 'carcass'
type SourceTarget = {
  kind: SourceTargetKind
  x: number
  z: number
  corpse?: AnimalAgent
  /** Set when this `water` target is the owning household's `AnimalTrough`
   *  (plan 122) rather than a natural shoreline — `performSourceAction`
   *  drains `household.water` in addition to relieving `life.thirst`. */
  trough?: boolean
}

/** One trough visit's draw against the household water reserve — same order
 *  of magnitude as `NpcAgent`'s `WATER_DRINK_FROM_STOCK_AMOUNT`. */
const TROUGH_DRINK_AMOUNT = 1

/** Count of `SHORE_PROBE_OFFSETS` around (x, z) that dip at/below the water
 *  threshold — a lightweight "is this the edge of a water body" signal for
 *  the thirsty-animal shoreline search. Pure so it's unit-testable without
 *  instantiating `AnimalAgent`/Three.js. */
export function shoreProbeHits(
  x: number,
  z: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): number {
  let hits = 0
  for (const [dx, dz] of SHORE_PROBE_OFFSETS) {
    if (sampleHeight(x + dx, z + dz) <= waterLevel + WATER_MARGIN) hits++
  }
  return hits
}

/** Forage habitat suitability from a `sampleForestFactor` reading — peaks at
 *  forest-edge density (~0.45) rather than open meadow or deep forest,
 *  matching deer/stag habitat preference (plan 094). Pure so it's
 *  unit-testable without instantiating `AnimalAgent`/Three.js. */
export function forageEdgeScore(forestFactor: number): number {
  return Math.max(0, 1 - Math.abs(forestFactor - 0.45) * 2)
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

type EnvironmentSense = {
  playerActive: boolean
  playerDistance: number
  fireNearby: boolean
  nearestFire: { x: number, z: number } | null
}

/** A loaded settlement's center + real footprint radius (plan 080) —
 *  `VILLAGE_SIZE_CONFIG.footprintRadius` for that settlement's `VillageSize`,
 *  see `settlement/families.ts`. Replaces the old flat-distance village
 *  avoidance so `MD`/`LG`/`XL` villages (footprint 48–72) get avoided
 *  correctly instead of only the smallest sizes. */
export type VillageInfo = { x: number, z: number, radius: number }

/** True if `pos` is within `village.radius + margin` of `village`'s center —
 *  pure so it's unit-testable without instantiating `AnimalAgent`/Three.js.
 *  Shared by `isNearVillage` (`VILLAGE_AVOID_MARGIN`) and could be reused by
 *  any other "is this near settled ground" check. */
export function isWithinVillageRadius(
  pos: { x: number, z: number },
  village: VillageInfo,
  margin: number,
): boolean {
  return Math.hypot(pos.x - village.x, pos.z - village.z) < village.radius + margin
}

/** Linear falloff from `1` at the village center to `0` at
 *  `village.radius + margin` — the flee-direction village bias's ramp
 *  (`fleeFrom`). Pure so it's unit-testable without instantiating
 *  `AnimalAgent`/Three.js. */
export function villageFleeBiasFalloff(
  distanceFromCenter: number,
  village: VillageInfo,
  margin: number,
): number {
  const influenceRadius = village.radius + margin
  if (influenceRadius <= 0) return 0
  return Math.max(0, 1 - distanceFromCenter / influenceRadius)
}

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
  | 'horse'
  | 'donkey'
  | 'cow'
  | 'sheep'
  | 'chicken'

export const ANIMAL_LABELS: Record<AnimalKind, string> = {
  wolf: 'wilk',
  fox: 'lis',
  deer: 'sarna',
  stag: 'jeleń',
  rabbit: 'królik',
  duck: 'kaczka',
  boar: 'dzik',
  horse: 'koń',
  donkey: 'osioł',
  cow: 'krowa',
  sheep: 'owca',
  chicken: 'kura',
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
}

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
  },
  horse: {
    kind: 'horse',
    role: 'livestock',
    sociability: 'domestic',
    color: 0x6b4423,
    scale: 1.3,
    modelHeight: 1.55,
    walkSpeed: 2.6,
    sprintSpeed: 6.0,
    detectRange: 0,
    fleeRange: 10,
    playerNoticeRange: 0,
    playerPanicRange: 0,
  },
  donkey: {
    kind: 'donkey',
    role: 'livestock',
    sociability: 'domestic',
    color: 0x7a6a58,
    scale: 1.05,
    modelHeight: 1.15,
    walkSpeed: 2.4,
    sprintSpeed: 5.4,
    detectRange: 0,
    fleeRange: 9,
    playerNoticeRange: 0,
    playerPanicRange: 0,
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
  },
}

/** A nearby NPC candidate for predator human-targeting (plan 179 §5/§7) —
 *  the same narrow shape as `countNearbyHumans`' NPC positions, plus a
 *  stable `id` so a chosen target can be reported back to the caller
 *  (`Fauna.update`'s `onNpcHit`) without `AnimalAgent` holding an `NpcAgent`
 *  reference. Caller-supplied and bounded (loaded settlements' NPCs only) —
 *  see `Fauna`'s own doc comment. */
export type NearbyNpcCandidate = { id: string, x: number, z: number }

/** Minimal per-wolf shape `setFrenzyWolf()` needs to pick a target (plan 179
 *  §3/§4) — deliberately not `AnimalAgent` itself, so `pickNearestEligibleWolf`
 *  stays pure/unit-testable without constructing real agents. */
export type FrenzyWolfCandidate = { animalId: string, x: number, z: number, frenzied: boolean }

/** Deterministic (no `Math.random()`) nearest-wolf-to-any-loaded-village
 *  selection behind the `setFrenzyWolf()` DevTools command — picks the
 *  non-frenzied wolf with the smallest distance to any village, pairing it
 *  with that nearest village as its strategic target. `null` when there is
 *  no eligible wolf or no loaded village. Ties keep the first-seen wolf
 *  (stable candidate order), matching `pickHighestScore`'s tie-break rule
 *  used elsewhere in this codebase. */
export function pickNearestEligibleWolf(
  wolves: readonly FrenzyWolfCandidate[],
  villages: readonly VillageInfo[],
): { animalId: string, village: VillageInfo } | null {
  let best: { animalId: string, village: VillageInfo } | null = null
  let bestD = Infinity
  for (const wolf of wolves) {
    if (wolf.frenzied) continue
    for (const village of villages) {
      const d = Math.hypot(wolf.x - village.x, wolf.z - village.z)
      if (d < bestD) {
        bestD = d
        best = { animalId: wolf.animalId, village }
      }
    }
  }
  return best
}

export class AnimalAgent {
  /** Visual root (GLB group or capsule mesh). */
  readonly mesh: THREE.Object3D
  readonly def: AnimalDef
  /** Stable per-instance id, distinct from `def.kind` (shared across every
   *  animal of that species) — assigned by the spawn site (`createFauna.ts`/
   *  `livestock.ts`). Lets a quest objective target one specific animal
   *  instead of scanning by kind (plan 093 Etap D). */
  readonly animalId: string
  /** Owning household's home `Place.id` (`settlement/places.ts`'s
   *  `homePlaceId`) — set only for livestock (`settlement/livestock.ts`);
   *  `undefined` for wild fauna, which has no owner (plan 093 Etap G). */
  readonly ownerHouseId?: string
  /** Owning household, when known (plan 122) — livestock only, set the same
   *  way as `ownerHouseId`. Lets thirst pursuit prefer the household's
   *  `AnimalTrough` reserve over a natural shoreline search (`findWaterTarget`). */
  private readonly household?: Household | null
  /** `PreySpawner.id` this animal was generated by (plan 125) — metadata
   *  only, `AnimalAgent` never reads it itself. Set only for animals actually
   *  spawned/respawned by a managed `PreySpawner` (`createFauna.ts`); ring
   *  spawns and livestock leave it `undefined`. */
  readonly spawnPointId?: string
  /** Reports this animal's death, once, regardless of cause (player melee or
   *  predator kill) — called from `collapse()`. Lets `QuestManager` observe
   *  `animal_died` generically without `AnimalAgent` importing quests
   *  (plan 110); injected the same way as `ownerHouseId`'s callers thread
   *  cross-cutting concerns in from the spawn site. */
  private readonly onDeath?: (animalId: string) => void
  private readonly sampleHeight: HeightSampler
  private readonly waterLevel: number
  private readonly collidersNear: ColliderSource
  /** Optional habitat sampler (plan 094) — only wild fauna's `createFauna.ts`
   *  passes one; livestock's spawn path omits it, and forage search falls
   *  back to distance-only scoring (see `findForageTarget`). */
  private readonly sampleForestFactor?: (x: number, z: number) => number
  private readonly isCapsule: boolean
  private target = new THREE.Vector3()
  private readonly fleeTarget = new THREE.Vector3()
  private wanderTimer = 0
  private readonly tmp = new THREE.Vector3()
  private readonly home = new THREE.Vector3()
  private readonly wanderRadius: readonly [number, number]
  private moving = false
  private sprinting = false
  private readonly mixer: THREE.AnimationMixer | null
  private readonly idleAction: THREE.AnimationAction | null
  private readonly walkAction: THREE.AnimationAction | null
  private readonly gallopAction: THREE.AnimationAction | null
  private currentAction: THREE.AnimationAction | null = null
  private readonly label: CSS2DObject
  private readonly labelEl: HTMLDivElement
  private readonly labelNameEl: HTMLDivElement
  private readonly labelBarsEl: HTMLDivElement
  private readonly hpFillEl: HTMLDivElement
  private readonly staminaFillEl: HTMLDivElement
  private readonly satietyFillEl: HTMLDivElement
  private readonly hydrationFillEl: HTMLDivElement
  private lastLabelOpacity = -1
  private lastHpPercent = -1
  private lastStaminaPercent = -1
  private lastSatietyPercent = -1
  private lastHydrationPercent = -1
  private lastBarsVisible: boolean | null = null
  private lastShadowCasting: boolean | null = null
  readonly health: HealthState
  readonly life: AnimalLifeState
  private attackCooldown = 0
  private timeSinceDeath = 0
  private isNight = false
  private highlighted = false
  /** Counts down from `ALERT_HOLD_SEC` after last noticing the player —
   *  hysteresis for `checkEnvironmentalDanger()`, see its comment. */
  private alertTimer = 0
  /** Counts down to the next `detectionRoll()` re-roll (plan 120). */
  private perceptionRollTimer = 0
  /** Monotonic per-agent perception tick, salt for `detectionRoll()`. */
  private perceptionTick = 0
  /** Cached `detectionRoll()` output, refreshed every
   *  `PERCEPTION_ROLL_INTERVAL_SEC` — compared against the live
   *  `detectionProbability()` every frame in between. */
  private cachedPerceptionRoll = 0
  /** This frame's loaded-settlement centers, refreshed at the top of every
   *  `update()` call — read by `fleeFrom`/`wander`/`updatePredator` without
   *  threading it through every method signature (plan 044 §2.3/§2.4). */
  private currentVillages: readonly VillageInfo[] = []
  /** Shared planned-action seam (plan 055) — movement bodies stay local. */
  private actionLifecycle: ActionLifecycle = createActionLifecycle()
  private pendingAction: PlannedAction<FaunaActionKind> | null = null
  /** Staggered human flee/attack reevaluation while the player alert is held. */
  private humanDecisionTimer = 0
  private cachedHumanIntent: PredatorHumanIntent = 'flee'
  /** Roll paired with `cachedHumanIntent` so the 0.2s window does not flicker. */
  private cachedAggressionRoll = 0
  /** Counts down after a player hit — feeds wolf retaliation (plan 056 ext). */
  private provokedTimer = 0
  /** Runtime-only trait set by the `setFrenzyWolf()` DevTools command (plan
   *  179 §3/§4) — not a new species/FSM, just an input to the existing
   *  predator-human decision (see `decideHumanResponse`/`decideNpcResponse`'s
   *  `provoked: this.provokedTimer > 0 || this.frenzied`) and to village
   *  wander-avoidance (`pickPointNear`). Never persisted (plan 179 §3
   *  "Persistence": wild fauna isn't a save source in V1). */
  private frenzied = false
  /** Strategic (not combat) target set alongside `frenzied` — the nearest
   *  loaded village at frenzy time, a plain position/radius snapshot (plan
   *  179 §3/§5), not a live `Settlement`/scene reference. Drives
   *  `moveTowardStrategicVillage` until the wolf is close enough to fall
   *  back into normal predator behaviour (which can then notice an NPC). */
  private strategicVillage: VillageInfo | null = null
  /** Scratch destination for `moveTowardStrategicVillage`/`chaseNpc` — kept
   *  separate from `steerToward`'s own `this.tmp` scratch (see that method's
   *  comment) and from `fleeTarget`/`sourceDest`. */
  private readonly strategicDest = new THREE.Vector3()
  /** True while this predator's latest throttled human-response decision
   *  (player or, when frenzied, a noticed NPC) is `attack` — the small
   *  signal `NpcAgent`'s bounded local threat perception reads to react
   *  *before* taking damage (plan 179 §6/§10). See `isThreateningHuman()`. */
  private threateningHuman = false
  private bloodSplat: THREE.Object3D | null = null
  private bloodSplatToken = 0
  private harvestedRemains: THREE.Object3D | null = null
  private harvestedRemainsToken = 0
  /** Cached real food/water destination while hunger/thirst is elevated
   *  (plan 094) — `null` when not currently pursuing one. */
  private sourceTarget: SourceTarget | null = null
  /** Seconds remaining before the next failed-search retry is allowed. */
  private sourceSearchCooldown = 0
  /** Seconds spent pursuing (not yet arrived at) the current `sourceTarget`. */
  private sourceTargetElapsed = 0
  /** Seconds spent stationary performing the current eat/drink action. */
  private actionTimer = 0
  /** Scratch vector for `steerToward` calls toward `sourceTarget`. */
  private readonly sourceDest = new THREE.Vector3()
  /** Set on a dead prey's `AnimalAgent` by the predator currently eating it
   *  — guards against two predators completing an eat action on the same
   *  corpse (plan 094). */
  private foodClaimedBy: AnimalAgent | null = null
  /** Set once a predator finishes eating this corpse — the carcass stays
   *  visible for the rest of its linger time, but is no longer food. */
  private foodConsumed = false
  /** Set once the player knife-harvests `raw_meat` from this corpse (plan
   *  106) — independent of `foodConsumed` (predator eating and player
   *  harvesting are different consumers), guards against harvesting twice. */
  private meatHarvested = false
  /** Pauses corpse linger while the player is mid-harvest (Esc-cancellable
   *  busy channel) so the body can't despawn underneath the overlay. */
  private corpseHeld = false
  /** Set once by `markDangerous()` — a visibly/gameplay-distinct individual
   *  bound to a `kill_target_animal { dangerous: true }` quest stage
   *  (plan 110), not a separate animal type. */
  private dangerous = false
  /** Shared id for herd members, assigned only at spawn for species in
   *  `HERD_SPECIES` — never mutated after construction (plan 118). Leadership
   *  is computed on demand (`pickHerdLeader`), not stored. */
  readonly herdId?: string
  /** `motherId`/`age` are only meaningful while `lifeStage === 'juvenile'`
   *  (plan 118) — cleared/reset once the animal matures. */
  private lifeStage: AnimalLifeStage
  private motherId?: string
  private age = 0
  /** This frame's live agent array, refreshed at the top of every `update()`
   *  call — read by `pickWanderTarget()`'s herd/mother bias without
   *  threading it through `wander()`'s call sites (same technique as
   *  `currentVillages` above, plan 118). */
  private currentOthers: AnimalAgent[] = []

  constructor(
    def: AnimalDef,
    animalId: string,
    sampleHeight: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    x: number,
    z: number,
    visual?: THREE.Object3D,
    animations: THREE.AnimationClip[] = [],
    wanderRadius: readonly [number, number] = DEFAULT_WANDER_RADIUS,
    sampleForestFactor?: (x: number, z: number) => number,
    ownerHouseId?: string,
    onDeath?: (animalId: string) => void,
    herdId?: string,
    lifeStage: AnimalLifeStage = 'adult',
    motherId?: string,
    household?: Household | null,
    spawnPointId?: string,
  ) {
    this.def = def
    this.animalId = animalId
    this.herdId = herdId
    this.lifeStage = lifeStage
    this.motherId = motherId
    this.ownerHouseId = ownerHouseId
    this.household = household
    this.spawnPointId = spawnPointId
    this.onDeath = onDeath
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
    this.collidersNear = collidersNear
    this.sampleForestFactor = sampleForestFactor
    this.home.set(x, 0, z)
    this.wanderRadius = wanderRadius
    this.health = createHealthState(MAX_HP[def.kind])
    this.life = createAnimalLifeState(Math.random())

    if (visual) {
      this.mesh = visual
      this.isCapsule = false
    } else {
      const radius = 0.28 * def.scale
      const length = 0.55 * def.scale
      const geometry = new THREE.CapsuleGeometry(radius, length, 3, 6)
      const material = new THREE.MeshStandardMaterial({
        color: def.color,
        flatShading: true,
      })
      this.mesh = new THREE.Mesh(geometry, material)
      this.mesh.castShadow = true
      this.isCapsule = true
      this.mesh.userData.faunaCapsule = true
    }

    this.mesh.position.set(x, 0, z)
    this.mesh.name = 'fauna'
    this.mesh.userData.animalKind = def.kind
    this.mesh.userData.animalRole = def.role
    // Juvenile down-scale (plan 118) — mirrors `markDangerous()`'s post-hoc
    // `mesh.scale.multiplyScalar`, applied uniformly here whether `mesh` is a
    // GLB clone, a procedural builder's group, or the capsule fallback above
    // (all are feet-grounded at their own root, see `snapY()`).
    if (this.lifeStage === 'juvenile') {
      this.mesh.scale.multiplyScalar(JUVENILE_SCALE_FACTOR[def.kind] ?? 1)
    }

    if (animations.length > 0) {
      // Prefer skinned model root (child of wrap) so clip bindings resolve.
      const animRoot = this.mesh.children[0] ?? this.mesh
      this.mixer = new THREE.AnimationMixer(animRoot)
      this.idleAction = this.findAction(animations, ['Idle', 'Idle_2'])
      this.walkAction = this.findAction(animations, ['Walk'])
      this.gallopAction = this.findAction(animations, ['Gallop'])
      this.playAction(this.idleAction)
    } else {
      this.mixer = null
      this.idleAction = null
      this.walkAction = null
      this.gallopAction = null
    }

    this.labelEl = document.createElement('div')
    this.labelEl.className = 'npc-label'

    this.labelNameEl = document.createElement('div')
    this.labelNameEl.className = 'npc-label__name'
    this.labelNameEl.textContent = ANIMAL_LABELS[def.kind]

    this.labelBarsEl = document.createElement('div')
    this.labelBarsEl.className = 'npc-label__bars'

    const hpBar = document.createElement('div')
    hpBar.className = 'npc-label__bar npc-label__bar--hp'
    this.hpFillEl = document.createElement('div')
    this.hpFillEl.className = 'npc-label__bar-fill'
    this.hpFillEl.style.width = '100%'
    hpBar.appendChild(this.hpFillEl)

    const staminaBar = document.createElement('div')
    staminaBar.className = 'npc-label__bar npc-label__bar--stamina'
    this.staminaFillEl = document.createElement('div')
    this.staminaFillEl.className = 'npc-label__bar-fill'
    this.staminaFillEl.style.width = '100%'
    staminaBar.appendChild(this.staminaFillEl)

    // Satiety / hydration are inverted needs: full bar = well fed / hydrated.
    const satietyBar = document.createElement('div')
    satietyBar.className = 'npc-label__bar npc-label__bar--satiety'
    this.satietyFillEl = document.createElement('div')
    this.satietyFillEl.className = 'npc-label__bar-fill'
    this.satietyFillEl.style.width = `${Math.round((1 - this.life.hunger) * 100)}%`
    satietyBar.appendChild(this.satietyFillEl)

    const hydrationBar = document.createElement('div')
    hydrationBar.className = 'npc-label__bar npc-label__bar--hydration'
    this.hydrationFillEl = document.createElement('div')
    this.hydrationFillEl.className = 'npc-label__bar-fill'
    this.hydrationFillEl.style.width = `${Math.round((1 - this.life.thirst) * 100)}%`
    hydrationBar.appendChild(this.hydrationFillEl)

    this.labelBarsEl.append(hpBar, staminaBar, satietyBar, hydrationBar)
    this.labelEl.append(this.labelNameEl, this.labelBarsEl)

    this.label = new CSS2DObject(this.labelEl)
    this.label.position.set(0, this.labelHeight(), 0)
    this.mesh.add(this.label)

    assignRenderLayer(this.mesh, AGENT_RENDER_LAYER)

    this.snapY()
    this.pickWanderTarget()
  }

  /** Ages a juvenile and flips it to `adult` past `JUVENILE_MATURITY_SECONDS`
   *  — restores adult mesh/label scale and drops `motherId` (plan 118). The
   *  one-time `lifeStage` transition is its own guard; no-op for adults. */
  private tickMaturity(dt: number): void {
    if (this.lifeStage !== 'juvenile') return
    this.age += dt
    if (this.age < JUVENILE_MATURITY_SECONDS) return
    this.lifeStage = 'adult'
    this.motherId = undefined
    const factor = JUVENILE_SCALE_FACTOR[this.def.kind]
    if (factor) this.mesh.scale.multiplyScalar(1 / factor)
    this.label.position.y = this.labelHeight()
  }

  /** Name/HP label height above the mesh root — folds in the juvenile scale
   *  factor so a shrunk animal's label doesn't float above its body (plan
   *  118). Recomputed at maturity to match the restored adult scale. */
  private labelHeight(): number {
    const juvenileFactor = this.lifeStage === 'juvenile'
      ? JUVENILE_SCALE_FACTOR[this.def.kind] ?? 1
      : 1
    return this.isCapsule
      ? (0.45 * this.def.scale + 0.3) * juvenileFactor
      : (this.def.modelHeight + 0.3) * juvenileFactor
  }

  dispose(): void {
    this.bloodSplatToken++
    this.harvestedRemainsToken++
    disposeBloodSplat(this.bloodSplat)
    this.bloodSplat = null
    disposeHarvestedRemains(this.harvestedRemains)
    this.harvestedRemains = null
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer?.stopAllAction()
  }

  isDead(): boolean {
    return this.health.dead
  }

  /** Marks this individual as "the" dangerous target of a `kill_target_animal
   *  { dangerous: true }` quest (plan 110) — bumps HP/outgoing damage, scales
   *  the mesh up, tints its material (GLB-sourced meshes only — the capsule
   *  fallback already carries `def.color`), and relabels it so the player can
   *  recognize the specific individual. Idempotent; applied once at bind time
   *  by `QuestManager`'s injected `applyDangerousTrait`, not at spawn. */
  markDangerous(): void {
    if (this.dangerous) return
    this.dangerous = true
    this.health.maxHp *= DANGEROUS_HP_MULTIPLIER
    this.health.currentHp = this.health.maxHp
    this.mesh.scale.multiplyScalar(DANGEROUS_SCALE_FACTOR)
    if (!this.isCapsule) tintPropMaterials(this.mesh, DANGEROUS_TINT_HEX)
    this.labelNameEl.textContent = `Groźny ${ANIMAL_LABELS[this.def.kind]}`
  }

  isFrenzied(): boolean {
    return this.frenzied
  }

  /** Entry point for the `setFrenzyWolf()` DevTools command (plan 179 §3/§4)
   *  — marks this animal frenzied and gives it `village` as a strategic
   *  target. Idempotent: a second call just refreshes the strategic target
   *  (`pickNearestEligibleWolf` already excludes already-frenzied wolves
   *  from selection, so callers shouldn't normally re-target one anyway). */
  setFrenzied(village: VillageInfo): void {
    this.frenzied = true
    this.strategicVillage = { ...village }
  }

  /** True while this predator's latest throttled decision is `attack`
   *  (player or, when frenzied, a noticed NPC) — see `threateningHuman`'s
   *  field doc. `NpcAgent`'s bounded local threat perception reads this
   *  through a caller-built candidate list, never by importing `AnimalAgent`
   *  logic itself. */
  isThreateningHuman(): boolean {
    return this.threateningHuman
  }

  /** Toggles the gaze-highlight glow on this animal's label. Idempotent — no
   *  redundant DOM writes if the state doesn't actually change. */
  setHighlighted(active: boolean): void {
    if (this.highlighted === active) return
    this.highlighted = active
    this.labelEl.classList.toggle('npc-label--highlighted', active)
  }

  /** True once a dead agent's corpse has lingered long enough to be disposed. */
  readyToRemove(): boolean {
    const linger = corpseLingerSeconds(this.meatHarvested)
    return this.health.dead && !this.corpseHeld && this.timeSinceDeath >= linger
  }

  /** Player shovel-bury: mark corpse for disposal on the next fauna/settlement tick. */
  bury(): void {
    if (!this.health.dead) return
    this.timeSinceDeath = HARVESTED_REMAINS_LINGER_SECONDS
  }

  /** Plan 106 — a dead, not-yet-harvested corpse can yield `raw_meat`. */
  canHarvestMeat(): boolean {
    return this.health.dead && !this.meatHarvested
  }

  /** Player knife-harvest: marks this corpse's meat as taken and swaps the
   *  living mesh for harvested remains (plan 137/138). State/TTL is
   *  synchronous; the GLB pile attaches asynchronously like the blood splat.
   *  Once only — callers check `canHarvestMeat()` first. */
  harvestMeat(): void {
    if (!this.health.dead || this.meatHarvested) return
    this.meatHarvested = true
    this.timeSinceDeath = 0
    this.hideLivingVisual()
    this.mesh.rotation.z = 0
    void this.spawnHarvestedRemains()
    this.snapY()
    this.labelEl.style.display = 'none'
  }

  /** GLB remains as a mesh child — token so dispose mid-load does not parent
   *  a stale clone. Fallback pile is still a Group named `harvested-remains`. */
  private async spawnHarvestedRemains(): Promise<void> {
    const token = ++this.harvestedRemainsToken
    const remains = await createHarvestedRemainsAsync(this.def.kind, this.def.modelHeight)
    if (token !== this.harvestedRemainsToken || !this.mesh.parent) {
      disposeHarvestedRemains(remains)
      return
    }
    this.harvestedRemains = remains
    this.mesh.add(remains)
  }

  /** Hide the living GLB/capsule without hiding the CSS2D label or the
   *  remains we'll parent onto the same root. Capsule geometry lives on
   *  `this.mesh` itself, so `mesh.visible = false` would also hide children. */
  private hideLivingVisual(): void {
    if (this.isCapsule) {
      const mat = (this.mesh as THREE.Mesh).material
      if (Array.isArray(mat)) {
        for (const m of mat) m.visible = false
      } else {
        mat.visible = false
      }
      return
    }
    this.mesh.traverse((child) => {
      if (child === this.mesh) return
      if ((child as { isCSS2DObject?: boolean }).isCSS2DObject) return
      let walk: THREE.Object3D | null = child
      while (walk && walk !== this.mesh) {
        if (walk.name === 'harvested-remains') return
        walk = walk.parent
      }
      if ((child as THREE.Mesh).isMesh) child.visible = false
    })
  }

  /** Pin this corpse for the duration of a player harvest channel. Linger
   *  does not advance and `readyToRemove()` stays false until `releaseCorpseHold`. */
  holdCorpse(): void {
    if (!this.health.dead) return
    this.corpseHeld = true
  }

  releaseCorpseHold(): void {
    this.corpseHeld = false
  }

  /** `source: 'npc'` (plan 177) is another human attacker, same provocation
   *  reaction as `'player'` — this is the existing predator-vs-human decision
   *  reacting to being hit, not a new NPC-aware animal behaviour. */
  takeDamage(damage: number, source?: 'npc' | 'player'): void {
    if (this.health.dead) return
    damageHealth(this.health, damage)
    if (source === 'player' || source === 'npc') {
      this.provokedTimer = PROVOCATION_SECONDS
      // Force an immediate re-score so healthy wolves can retaliate this frame.
      this.humanDecisionTimer = 0
    }
    if (this.health.dead) this.collapse()
  }

  /** Tip the corpse onto its side (relative to its facing direction) instead
   *  of leaving it frozen standing up. */
  private collapse(): void {
    this.onDeath?.(this.animalId)
    this.mixer?.stopAllAction()
    const side = Math.random() < 0.5 ? 1 : -1
    this.mesh.rotation.z = side * (Math.PI / 2)
    this.mesh.position.y += this.isCapsule ? 0.2 * this.def.scale : this.def.modelHeight * 0.3
    this.lastHpPercent = 0
    this.hpFillEl.style.width = '0%'
    this.labelBarsEl.style.display = 'none'
    void this.spawnDeathSplat()
  }

  /** Ground splat as a scene sibling — must not parent to the tipped mesh. */
  private async spawnDeathSplat(): Promise<void> {
    const token = ++this.bloodSplatToken
    const splat = await createBloodSplat(this.def.modelHeight)
    if (!splat) return
    if (token !== this.bloodSplatToken || !this.mesh.parent) {
      disposeBloodSplat(splat)
      return
    }
    const y = this.sampleHeight(this.mesh.position.x, this.mesh.position.z)
    splat.position.set(this.mesh.position.x, y + 0.02, this.mesh.position.z)
    splat.rotation.y = Math.random() * Math.PI * 2
    this.mesh.parent.add(splat)
    this.bloodSplat = splat
  }

  update(
    dt: number,
    others: AnimalAgent[],
    observerPos: THREE.Vector3,
    dayFactor: number,
    forestFactor: number,
    litFires: readonly { x: number, z: number }[],
    villages: readonly VillageInfo[] = [],
    nearbyHumanCount = 1,
    /** Optional fauna→human damage seam (plan 056). Absent → chase only. */
    onHumanHit?: (damage: number, attackerX: number, attackerZ: number) => void,
    /** Sneak/movement stealth inputs (plan 124 §4). Defaults to "no effect"
     *  so existing callers/tests that don't pass it keep prior behaviour. */
    playerStealth: PlayerStealthState = { sneakValue: 0, sneakActive: false, movement: 'stationary' },
    /** Bounded/local NPC candidates (plan 179 §5/§7) — only consulted for a
     *  `frenzied` predator, and only once the player isn't the active
     *  threat, so ordinary (non-frenzied) predator behaviour is unaffected.
     *  Caller (`Fauna.update`) is responsible for keeping this small (loaded
     *  settlements' NPCs), never a global scan. */
    nearbyNpcs: readonly NearbyNpcCandidate[] = [],
    /** Fauna→NPC damage seam (plan 179 §9/§11), mirrors `onHumanHit` but
     *  keyed to the specific NPC id chosen as target. */
    onNpcHit?: (targetId: string, damage: number, attackerX: number, attackerZ: number) => void,
  ): void {
    if (this.health.dead) {
      if (!this.corpseHeld) this.timeSinceDeath += dt
      return
    }
    if (this.attackCooldown > 0) this.attackCooldown -= dt
    if (this.alertTimer > 0) this.alertTimer -= dt
    if (this.provokedTimer > 0) this.provokedTimer -= dt
    if (this.sourceSearchCooldown > 0) this.sourceSearchCooldown -= dt
    this.isNight = dayFactor <= 0
    this.moving = false
    this.sprinting = false
    this.currentVillages = villages
    this.currentOthers = others
    this.tickMaturity(dt)
    const sense = this.senseEnvironment(dt, observerPos, dayFactor, forestFactor, litFires, playerStealth)
    // Only a frenzied predator considers an NPC target, and only once the
    // player isn't the active threat (plan 179 §5/§8) — cheap bounded scan,
    // see `NearbyNpcCandidate`'s doc.
    const npcThreat = !sense.playerActive && this.frenzied && this.def.role === 'predator'
      ? this.senseNpcThreat(nearbyNpcs)
      : null

    if (sense.playerActive) {
      this.cancelSourceTarget()
      if (this.def.role === 'predator') {
        this.humanDecisionTimer -= dt
        if (this.humanDecisionTimer <= 0) {
          this.humanDecisionTimer = HUMAN_DECISION_INTERVAL_SEC
          this.cachedAggressionRoll = Math.random()
          this.cachedHumanIntent = this.decideHumanResponse(
            sense,
            observerPos,
            nearbyHumanCount,
            this.cachedAggressionRoll,
          )
        }
        this.threateningHuman = this.cachedHumanIntent === 'attack'
        if (this.cachedHumanIntent === 'attack') {
          this.setIntent('attack', copyVec3(observerPos))
          this.chaseHuman(observerPos, dt, onHumanHit)
        } else {
          this.setIntent('flee', copyVec3(observerPos))
          this.fleeFrom(observerPos.x, observerPos.z, dt)
        }
      } else {
        this.threateningHuman = false
        this.setIntent('flee', copyVec3(observerPos))
        this.fleeFrom(observerPos.x, observerPos.z, dt)
      }
    } else if (npcThreat) {
      this.cancelSourceTarget()
      this.humanDecisionTimer -= dt
      if (this.humanDecisionTimer <= 0) {
        this.humanDecisionTimer = HUMAN_DECISION_INTERVAL_SEC
        this.cachedAggressionRoll = Math.random()
        this.cachedHumanIntent = this.decideNpcResponse(npcThreat, nearbyNpcs, sense, this.cachedAggressionRoll)
      }
      this.threateningHuman = this.cachedHumanIntent === 'attack'
      if (this.cachedHumanIntent === 'attack') {
        this.setIntent('attack', { x: npcThreat.x, z: npcThreat.z })
        this.chaseNpc(npcThreat, dt, onNpcHit)
      } else {
        this.setIntent('flee', { x: npcThreat.x, z: npcThreat.z })
        this.fleeFrom(npcThreat.x, npcThreat.z, dt)
      }
    } else if (sense.nearestFire) {
      this.threateningHuman = false
      this.humanDecisionTimer = 0
      this.provokedTimer = 0
      this.cancelSourceTarget()
      this.setIntent('flee', { x: sense.nearestFire.x, z: sense.nearestFire.z })
      this.fleeFrom(sense.nearestFire.x, sense.nearestFire.z, dt)
    } else if (this.def.role === 'predator') {
      this.threateningHuman = false
      this.humanDecisionTimer = 0
      this.provokedTimer = 0
      if (this.frenzied && this.strategicVillage && !this.isNearVillage(this.mesh.position)) {
        this.moveTowardStrategicVillage(dt)
      } else {
        this.updatePredator(dt, others)
      }
    } else {
      this.threateningHuman = false
      this.humanDecisionTimer = 0
      this.provokedTimer = 0
      this.updatePrey(dt, others)
    }
    this.clampBounds()
    this.snapY()
    this.updateAnim()
    tickAnimalLife(this.life, dt, this.sprinting, {
      hungerThirstRate: this.isNight && !this.sprinting ? SLEEP_HUNGER_THIRST_RATE : 1,
    })
    // Compared/stored as the same rounded percent that's actually written to
    // the DOM — the raw ratio drifts by a hair every frame during
    // regen/drain, which would defeat a guard keyed on the raw value.
    const hpPercent = this.health.maxHp > 0 ? Math.round((this.health.currentHp / this.health.maxHp) * 100) : 0
    if (hpPercent !== this.lastHpPercent) {
      this.lastHpPercent = hpPercent
      this.hpFillEl.style.width = `${hpPercent}%`
    }
    const staminaPercent = this.life.stamina.max > 0
      ? Math.round((this.life.stamina.current / this.life.stamina.max) * 100)
      : 0
    if (staminaPercent !== this.lastStaminaPercent) {
      this.lastStaminaPercent = staminaPercent
      this.staminaFillEl.style.width = `${staminaPercent}%`
    }
    const satietyPercent = Math.round((1 - this.life.hunger) * 100)
    if (satietyPercent !== this.lastSatietyPercent) {
      this.lastSatietyPercent = satietyPercent
      this.satietyFillEl.style.width = `${satietyPercent}%`
    }
    const hydrationPercent = Math.round((1 - this.life.thirst) * 100)
    if (hydrationPercent !== this.lastHydrationPercent) {
      this.lastHydrationPercent = hydrationPercent
      this.hydrationFillEl.style.width = `${hydrationPercent}%`
    }
    const dist = this.mesh.position.distanceTo(observerPos)
    const showBars = barsVisibleForDistance(dist)
    if (showBars !== this.lastBarsVisible) {
      this.lastBarsVisible = showBars
      this.labelBarsEl.style.display = showBars ? '' : 'none'
    }
    const shadowCasting = dist <= FAUNA_SHADOW_DISTANCE
    if (shadowCasting !== this.lastShadowCasting) {
      this.lastShadowCasting = shadowCasting
      setSubtreeCastShadow(this.mesh, shadowCasting)
    }
    // Quantized before comparing — `dist` changes by a hair every frame while
    // the player moves, so an unrounded guard never catches a repeat.
    const opacity = Math.round(labelOpacityForDistance(dist) * 32) / 32
    if (opacity !== this.lastLabelOpacity) {
      this.lastLabelOpacity = opacity
      this.labelEl.style.opacity = String(opacity)
      // At full visibility bars sit at 80%; once the shared label fades, inherit
      // the parent opacity without an extra dimming factor.
      this.labelBarsEl.style.opacity = opacity === 1 ? '0.8' : '1'
    }
    this.mixer?.update(dt)
  }

  /** Adopt a fauna intent via the shared action lifecycle (plan 055). */
  private setIntent(kind: FaunaActionKind, destination?: { x: number, y?: number, z: number }): void {
    const next: PlannedAction<FaunaActionKind> = destination
      ? { kind, destination: { x: destination.x, y: destination.y ?? 0, z: destination.z } }
      : { kind }
    const { action } = adoptPlannedAction(this.actionLifecycle, this.pendingAction, next)
    this.pendingAction = action
  }

  private buildDecisionContext(
    sense: EnvironmentSense,
    nearbyHumanCount: number,
  ): DecisionContext {
    return {
      needs: {
        hunger: this.life.hunger,
        thirst: this.life.thirst,
        stamina: getStaminaRatio(this.life.stamina),
      },
      nearbyHumanCount,
      nearbyFireCount: sense.fireNearby ? 1 : 0,
      extras: {
        role: this.def.role,
        kind: this.def.kind,
        playerDistance: sense.playerDistance,
        playerActive: sense.playerActive,
      },
    }
  }

  private decideHumanResponse(
    sense: EnvironmentSense,
    observerPos: THREE.Vector3,
    nearbyHumanCount: number,
    aggressionRoll: number,
  ): PredatorHumanIntent {
    const ctx = this.buildDecisionContext(sense, nearbyHumanCount)
    const hpRatio = this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0
    return decidePredatorHumanIntent({
      hunger: ctx.needs?.hunger ?? this.life.hunger,
      humanDistance: sense.playerDistance > 0
        ? sense.playerDistance
        : Math.hypot(
          observerPos.x - this.mesh.position.x,
          observerPos.z - this.mesh.position.z,
        ),
      playerNoticeRange: this.def.playerNoticeRange,
      playerPanicRange: this.def.playerPanicRange,
      fireNearby: (ctx.nearbyFireCount ?? 0) > 0,
      nearbyHumanCount: Math.max(1, ctx.nearbyHumanCount ?? nearbyHumanCount),
      kind: this.def.kind,
      selfHpRatio: hpRatio,
      // `frenzied` reuses the existing provoked/retaliation branch (plan 179
      // §6) instead of a new "reduced fear" special case — a frenzied wolf
      // behaves like a permanently provoked one (reduced fear, willing to
      // attack), with the same low-HP flee floor still applying.
      provoked: this.provokedTimer > 0 || this.frenzied,
      aggressionRoll,
    })
  }

  /** Nearest NPC candidate within `playerNoticeRange`, or `null` (plan 179
   *  §7/§8) — deliberately no facing-cone/probability roll like the
   *  player's `isPlayerNoticed()`: a frenzied wolf that's already committed
   *  to reaching the settlement doesn't need stealth-grade perception of
   *  the humans living there. `nearbyNpcs` is caller-bounded (see
   *  `NearbyNpcCandidate`'s doc), so this stays a small local scan. */
  private senseNpcThreat(nearbyNpcs: readonly NearbyNpcCandidate[]): NearbyNpcCandidate | null {
    let best: NearbyNpcCandidate | null = null
    let bestD = this.def.playerNoticeRange
    for (const npc of nearbyNpcs) {
      const d = Math.hypot(npc.x - this.mesh.position.x, npc.z - this.mesh.position.z)
      if (d < bestD) {
        bestD = d
        best = npc
      }
    }
    return best
  }

  /** Same `decidePredatorHumanIntent` scoring as `decideHumanResponse`, fed
   *  a noticed NPC's distance instead of the player's (plan 179 §5 — "NPC
   *  jako pełnoprawny human target obok playera", not a parallel decision
   *  system). Crowd fear counts other candidates near `target` rather than
   *  reusing `countNearbyHumans` (that helper always counts the player as
   *  present, which doesn't hold when the player is the one who isn't the
   *  active threat here). */
  private decideNpcResponse(
    target: NearbyNpcCandidate,
    nearbyNpcs: readonly NearbyNpcCandidate[],
    sense: EnvironmentSense,
    aggressionRoll: number,
  ): PredatorHumanIntent {
    const hpRatio = this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0
    let crowd = 1
    for (const npc of nearbyNpcs) {
      if (npc === target) continue
      if (Math.hypot(npc.x - target.x, npc.z - target.z) <= NEARBY_HUMAN_RADIUS) crowd++
    }
    return decidePredatorHumanIntent({
      hunger: this.life.hunger,
      humanDistance: Math.hypot(target.x - this.mesh.position.x, target.z - this.mesh.position.z),
      playerNoticeRange: this.def.playerNoticeRange,
      playerPanicRange: this.def.playerPanicRange,
      fireNearby: sense.fireNearby,
      nearbyHumanCount: crowd,
      kind: this.def.kind,
      selfHpRatio: hpRatio,
      provoked: this.provokedTimer > 0 || this.frenzied,
      aggressionRoll,
    })
  }

  /** Frenzied wolf beelines to its `strategicVillage` until it's within the
   *  village's own footprint + avoidance margin (`isNearVillage`), then
   *  `update()` falls back to normal `updatePredator`/wander — which, for a
   *  frenzied wolf, is now allowed to actually wander inside the village
   *  (see `pickPointNear`'s `this.frenzied` bypass) instead of skirting it
   *  (plan 179 §3 — "kieruje się do wioski"). Not a new movement system —
   *  same `steerToward` primitive every other movement branch uses. */
  private moveTowardStrategicVillage(dt: number): void {
    const village = this.strategicVillage
    if (!village) return
    this.setIntent('wander', { x: village.x, z: village.z })
    this.strategicDest.set(village.x, 0, village.z)
    this.steerToward(this.strategicDest, this.walkSpeedNow(), dt)
  }

  /** Sprint toward a human; bite via `onHumanHit` when in contact (plan 056). */
  private chaseHuman(
    observerPos: THREE.Vector3,
    dt: number,
    onHumanHit?: (damage: number, attackerX: number, attackerZ: number) => void,
  ): void {
    if (isExhausted(this.life.stamina)) {
      this.setIntent('wander')
      this.wander(dt)
      return
    }
    this.sprinting = true
    const dist = Math.hypot(
      observerPos.x - this.mesh.position.x,
      observerPos.z - this.mesh.position.z,
    )
    if (dist < CONTACT_RANGE && onHumanHit) {
      this.attackHuman(onHumanHit)
      return
    }
    this.steerToward(observerPos, this.sprintSpeedNow(), dt)
  }

  private attackHuman(onHumanHit: (damage: number, attackerX: number, attackerZ: number) => void): void {
    if (this.attackCooldown > 0) return
    if (isExhausted(this.life.stamina)) return
    this.attackCooldown = ATTACK_COOLDOWN
    drainStamina(this.life.stamina, ATTACK_STAMINA_COST)
    const { x, z } = this.mesh.position
    onHumanHit(
      damageVsHuman(this.def.kind) * (this.dangerous ? DANGEROUS_DAMAGE_MULTIPLIER : 1),
      x,
      z,
    )
  }

  /** Sprint toward a noticed NPC; bite via `onNpcHit` when in contact — same
   *  shape as `chaseHuman`, targeting `target`'s position instead of the
   *  player's (plan 179 §9). */
  private chaseNpc(
    target: NearbyNpcCandidate,
    dt: number,
    onNpcHit?: (targetId: string, damage: number, attackerX: number, attackerZ: number) => void,
  ): void {
    if (isExhausted(this.life.stamina)) {
      this.setIntent('wander')
      this.wander(dt)
      return
    }
    this.sprinting = true
    const dist = Math.hypot(target.x - this.mesh.position.x, target.z - this.mesh.position.z)
    if (dist < CONTACT_RANGE && onNpcHit) {
      this.attackNpc(target.id, onNpcHit)
      return
    }
    this.strategicDest.set(target.x, 0, target.z)
    this.steerToward(this.strategicDest, this.sprintSpeedNow(), dt)
  }

  private attackNpc(
    targetId: string,
    onNpcHit: (targetId: string, damage: number, attackerX: number, attackerZ: number) => void,
  ): void {
    if (this.attackCooldown > 0) return
    if (isExhausted(this.life.stamina)) return
    this.attackCooldown = ATTACK_COOLDOWN
    drainStamina(this.life.stamina, ATTACK_STAMINA_COST)
    const { x, z } = this.mesh.position
    onNpcHit(
      targetId,
      damageVsHuman(this.def.kind) * (this.dangerous ? DANGEROUS_DAMAGE_MULTIPLIER : 1),
      x,
      z,
    )
  }

  /**
   * Player-notice + campfire sensing — checked ahead of predator/prey
   * dynamics. Returns structured perception for decision scoring; movement
   * is chosen by `update()` (plan 055: perception ≠ action).
   */
  private senseEnvironment(
    dt: number,
    observerPos: THREE.Vector3,
    dayFactor: number,
    forestFactor: number,
    litFires: readonly { x: number, z: number }[],
    playerStealth: PlayerStealthState,
  ): EnvironmentSense {
    const dx = observerPos.x - this.mesh.position.x
    const dz = observerPos.z - this.mesh.position.z
    const distance = Math.hypot(dx, dz)
    let facingDot = -1
    if (distance > 1e-4) {
      const forwardX = -Math.sin(this.mesh.rotation.y)
      const forwardZ = -Math.cos(this.mesh.rotation.y)
      facingDot = (dx / distance) * forwardX + (dz / distance) * forwardZ
    }
    this.perceptionRollTimer -= dt
    if (this.perceptionRollTimer <= 0) {
      this.perceptionRollTimer = PERCEPTION_ROLL_INTERVAL_SEC
      this.perceptionTick += 1
      this.cachedPerceptionRoll = detectionRoll(this.animalId, this.perceptionTick)
    }
    const noticed = isPlayerNoticed({
      distance,
      facingDot,
      panicRange: this.def.playerPanicRange,
      noticeRange: this.def.playerNoticeRange,
      dayFactor,
      forestFactor,
      minFacingDot: PLAYER_NOTICE_CONE_DOT,
      roll: this.cachedPerceptionRoll,
      stealthMultiplier: sneakDetectionMultiplier(playerStealth),
    })
    if (noticed) this.alertTimer = ALERT_HOLD_SEC
    const playerActive = noticed || this.alertTimer > 0

    let nearestFire: { x: number, z: number } | null = null
    let bestD = FIRE_AVOID_RADIUS
    for (const fire of litFires) {
      const d = Math.hypot(fire.x - this.mesh.position.x, fire.z - this.mesh.position.z)
      if (d < bestD) {
        bestD = d
        nearestFire = fire
      }
    }

    return {
      playerActive,
      playerDistance: distance,
      fireNearby: nearestFire !== null,
      nearestFire,
    }
  }

  /** Nearest loaded settlement center to this animal, or `null` if none are
   *  loaded/close enough to matter — shared by `fleeFrom`'s village bias and
   *  `wander`/`updatePredator`'s village-avoidance. */
  private nearestVillage(): VillageInfo | null {
    let best: VillageInfo | null = null
    let bestD = Infinity
    for (const v of this.currentVillages) {
      const d = Math.hypot(v.x - this.mesh.position.x, v.z - this.mesh.position.z)
      if (d < bestD) {
        bestD = d
        best = v
      }
    }
    return best
  }

  /** Sprints away from (x, z) — shared by fleeing a predator (`updatePrey`),
   *  the player, or a campfire (`checkEnvironmentalDanger`). Wild animals
   *  lean the flee direction away from the nearest village; domestic animals
   *  lean it toward one instead (plan 044 §2.3/§2.4's "prefer fleeing away
   *  from/into the village even if that changes the flee direction"). */
  private fleeFrom(x: number, z: number, dt: number): void {
    this.tmp.set(this.mesh.position.x - x, 0, this.mesh.position.z - z)
    if (this.tmp.lengthSq() < 1e-4) {
      this.tmp.set(1, 0, 0)
    }
    this.tmp.normalize()

    const village = this.nearestVillage()
    if (village) {
      const vx = this.mesh.position.x - village.x
      const vz = this.mesh.position.z - village.z
      const vDist = Math.hypot(vx, vz)
      const falloff = villageFleeBiasFalloff(vDist, village, VILLAGE_FLEE_INFLUENCE_MARGIN)
      if (vDist > 1e-4 && falloff > 0) {
        const sign = this.def.sociability === 'domestic' ? -1 : 1
        const weight = falloff * VILLAGE_FLEE_BIAS_WEIGHT * sign
        this.tmp.x += (vx / vDist) * weight
        this.tmp.z += (vz / vDist) * weight
        this.tmp.normalize()
      }
    }

    this.sprinting = !isExhausted(this.life.stamina)
    this.fleeTarget.set(
      this.mesh.position.x + this.tmp.x * FLEE_DISTANCE,
      0,
      this.mesh.position.z + this.tmp.z * FLEE_DISTANCE,
    )
    const speed = this.sprinting ? this.sprintSpeedNow() : this.walkSpeedNow()
    this.steerToward(this.fleeTarget, speed, dt)
  }

  /** Prey move slower at night; predators are unaffected. */
  private walkSpeedNow(): number {
    if (this.isNight && this.def.role === 'prey') {
      return this.def.walkSpeed * NIGHT_PREY_WALK_MULT
    }
    return this.def.walkSpeed
  }

  private sprintSpeedNow(): number {
    if (this.isNight && this.def.role === 'prey') {
      return this.def.sprintSpeed * NIGHT_PREY_SPRINT_MULT
    }
    return this.def.sprintSpeed
  }

  /** True if `pos` is within that settlement's real footprint + `VILLAGE_AVOID_MARGIN`
   *  of any loaded settlement — used to make wild predators give up a chase
   *  that runs into the village (plan 044 §2.4's "lis niechętnie wchodzi do
   *  bezpiecznego obszaru i może przerwać pościg") and to keep wild wander
   *  targets off settled ground. */
  private isNearVillage(pos: { x: number, z: number }): boolean {
    for (const v of this.currentVillages) {
      if (isWithinVillageRadius(pos, v, VILLAGE_AVOID_MARGIN)) return true
    }
    return false
  }

  private updatePredator(dt: number, others: AnimalAgent[]): void {
    const prey = this.nearest(others, 'prey', this.def.detectRange)
    if (prey && this.isNearVillage(prey.mesh.position)) {
      // Live prey inside the village is not huntable; still allow drink/eat.
      if (this.pursueNeeds(dt, others)) return
      this.setIntent('wander')
      this.wander(dt)
      return
    }
    if (prey) {
      if (isExhausted(this.life.stamina)) {
        // Chase is gated on stamina; eating/drinking are low-effort and
        // should still run so a wolf can feed on the corpse it just made.
        if (this.pursueNeeds(dt, others)) return
        this.setIntent('wander')
        this.wander(dt)
        return
      }
      this.cancelSourceTarget()
      this.setIntent('chase', copyVec3(prey.mesh.position))
      this.sprinting = true
      const dist = Math.hypot(
        prey.mesh.position.x - this.mesh.position.x,
        prey.mesh.position.z - this.mesh.position.z,
      )
      if (dist < CONTACT_RANGE) {
        this.attack(prey)
      } else {
        this.steerToward(prey.mesh.position, this.sprintSpeedNow(), dt)
      }
      return
    }
    if (this.pursueNeeds(dt, others)) return
    this.setIntent('wander')
    this.wander(dt)
  }

  private attack(prey: AnimalAgent): void {
    if (this.attackCooldown > 0) return
    if (isExhausted(this.life.stamina)) return
    this.attackCooldown = ATTACK_COOLDOWN
    drainStamina(this.life.stamina, ATTACK_STAMINA_COST)
    prey.takeDamage(damageFor(this.def.kind, prey.def.kind))
  }

  private updatePrey(dt: number, others: AnimalAgent[]): void {
    const threat = this.nearest(others, 'predator', this.def.fleeRange)
    if (threat) {
      this.cancelSourceTarget()
      this.setIntent('flee', copyVec3(threat.mesh.position))
      this.fleeFrom(threat.mesh.position.x, threat.mesh.position.z, dt)
      return
    }
    if (this.pursueNeeds(dt, others)) return
    this.setIntent('wander')
    this.wander(dt)
  }

  /** Real food/water pursuit (plan 094) — searches for and moves to a
   *  source only while hunger/thirst is elevated, caching the target so the
   *  search doesn't re-run every frame. Returns `true` if it handled this
   *  frame's movement (searching, walking to, or eating/drinking at a
   *  source), `false` if the caller should fall back to biased wander. */
  private pursueNeeds(dt: number, others: readonly AnimalAgent[]): boolean {
    const thirstElevated = this.life.thirst > NEED_ELEVATED_THRESHOLD
    const hungerElevated = this.life.hunger > NEED_ELEVATED_THRESHOLD
    if (!thirstElevated && !hungerElevated) {
      this.cancelSourceTarget()
      return false
    }
    if (this.sourceTarget && !this.isSourceTargetValid(this.sourceTarget)) {
      this.cancelSourceTarget()
    }
    if (!this.sourceTarget && this.sourceSearchCooldown <= 0) {
      this.sourceTarget = thirstElevated
        ? this.findWaterTarget() ?? (hungerElevated ? this.findFoodTarget(others) : null)
        : this.findFoodTarget(others)
      if (!this.sourceTarget) this.sourceSearchCooldown = SOURCE_SEARCH_COOLDOWN_SEC
    }
    if (!this.sourceTarget) return false
    return this.pursueSourceTarget(dt)
  }

  private findFoodTarget(others: readonly AnimalAgent[]): SourceTarget | null {
    return this.def.role === 'predator' ? this.findCarcassTarget(others) : this.findForageTarget()
  }

  private isSourceTargetValid(target: SourceTarget): boolean {
    if (target.kind === 'carcass') {
      const corpse = target.corpse
      if (!corpse) return false
      return isCarcassEdible({
        dead: corpse.health.dead,
        expired: corpse.readyToRemove(),
        consumed: corpse.foodConsumed,
        claimedBy: corpse.foodClaimedBy,
        eater: this,
      }) && corpse.foodClaimedBy === this
    }
    if (!this.isWalkable(target.x, target.z)) return false
    return Math.hypot(target.x - this.home.x, target.z - this.home.z) <= ROAM_RADIUS
  }

  /** Releases any corpse claim and clears the cached target — called both on
   *  successful completion and on threat/invalidation interrupts (plan 094:
   *  "cancel the pending food/water action ... release the corpse claim"). */
  private cancelSourceTarget(): void {
    if (this.sourceTarget?.kind === 'carcass' && this.sourceTarget.corpse) {
      this.sourceTarget.corpse.releaseFoodClaim(this)
    }
    this.sourceTarget = null
    this.actionTimer = 0
    this.sourceTargetElapsed = 0
  }

  private pursueSourceTarget(dt: number): boolean {
    const target = this.sourceTarget
    if (!target) return false
    const actionKind: FaunaActionKind = target.kind === 'water' ? 'drink' : target.kind === 'carcass' ? 'eat' : 'forage'
    this.setIntent(actionKind, { x: target.x, z: target.z })
    const range = target.kind === 'water' ? WATER_INTERACTION_RANGE : FOOD_INTERACTION_RANGE
    if (this.withinRange(target.x, target.z, range)) {
      this.performSourceAction(dt, target)
      return true
    }
    this.sourceTargetElapsed += dt
    if (this.sourceTargetElapsed > SOURCE_TARGET_TIMEOUT_SEC) {
      this.cancelSourceTarget()
      this.sourceSearchCooldown = SOURCE_SEARCH_COOLDOWN_SEC
      return false
    }
    this.sourceDest.set(target.x, 0, target.z)
    this.steerToward(this.sourceDest, this.walkSpeedNow(), dt)
    return true
  }

  /** Stand still and eat/drink for a fixed duration; relief is applied once
   *  on completion, not drained per-frame (plan 094 — keeps the effect
   *  independent of frame/update rate). */
  private performSourceAction(dt: number, target: SourceTarget): void {
    this.actionTimer += dt
    const duration = target.kind === 'water' ? DRINK_DURATION_SEC : EAT_DURATION_SEC
    if (this.actionTimer < duration) return
    if (target.kind === 'water') {
      if (target.trough) {
        // Trough may have run dry while approaching (another animal/NPC
        // drank first) — no free relief; next search re-checks the
        // household reserve and falls back to a shoreline (plan 122).
        if (this.household?.water.has(TROUGH_DRINK_AMOUNT)) {
          this.household.water.remove(TROUGH_DRINK_AMOUNT)
          drinkWater(this.life)
        }
      } else {
        drinkWater(this.life)
      }
    } else {
      consumeFood(this.life)
      if (target.kind === 'carcass') target.corpse?.markFoodConsumed()
    }
    this.cancelSourceTarget()
  }

  /** Household `AnimalTrough` (plan 122) — preferred over a natural
   *  shoreline search when the owning household has stored water, the same
   *  "prefer local stored water" hierarchy `NpcAgent`'s personal thirst
   *  uses. Only livestock have a `household` (wild fauna: always `undefined`,
   *  falls straight through to the shoreline search below). */
  private findTroughTarget(): SourceTarget | null {
    if (!this.household?.water.has(TROUGH_DRINK_AMOUNT)) return null
    return { kind: 'water', x: this.home.x, z: this.home.z, trough: true }
  }

  private findWaterTarget(): SourceTarget | null {
    const trough = this.findTroughTarget()
    if (trough) return trough
    let best: SourceTarget | null = null
    let bestScore = -Infinity
    for (let attempt = 0; attempt < WATER_SEARCH_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * WATER_SEARCH_RADIUS
      const x = this.mesh.position.x + Math.cos(angle) * dist
      const z = this.mesh.position.z + Math.sin(angle) * dist
      if (!this.isWalkable(x, z)) continue
      const hits = shoreProbeHits(x, z, this.sampleHeight, this.waterLevel)
      if (hits === 0) continue
      if (this.def.sociability === 'wild' && this.isNearVillage({ x, z })) continue
      if (Math.hypot(x - this.home.x, z - this.home.z) > ROAM_RADIUS) continue
      const d = Math.hypot(x - this.mesh.position.x, z - this.mesh.position.z)
      const score = hits * 10 - d
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'water', x, z }
      }
    }
    return best
  }

  /** Habitat-biased forage spot for wild prey/livestock — uses
   *  `sampleForestFactor` when available (wild fauna, see `createFauna.ts`);
   *  falls back to distance-only scoring when it isn't (livestock, plan
   *  094 §2). */
  private findForageTarget(): SourceTarget | null {
    let best: SourceTarget | null = null
    let bestScore = -Infinity
    for (let attempt = 0; attempt < FOOD_SEARCH_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * FOOD_SEARCH_RADIUS
      const x = this.mesh.position.x + Math.cos(angle) * dist
      const z = this.mesh.position.z + Math.sin(angle) * dist
      if (!this.isWalkable(x, z)) continue
      if (this.def.sociability === 'wild' && this.isNearVillage({ x, z })) continue
      if (Math.hypot(x - this.home.x, z - this.home.z) > ROAM_RADIUS) continue
      const suitability = this.sampleForestFactor ? forageEdgeScore(this.sampleForestFactor(x, z)) : 0.5
      const d = Math.hypot(x - this.mesh.position.x, z - this.mesh.position.z)
      const score = suitability * 10 - d
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'forage', x, z }
      }
    }
    return best
  }

  /** Nearest unclaimed dead prey within `FOOD_SEARCH_RADIUS`, claimed on
   *  selection so a second predator can't also target it (plan 094 §8). */
  private findCarcassTarget(others: readonly AnimalAgent[]): SourceTarget | null {
    let best: AnimalAgent | null = null
    let bestD = FOOD_SEARCH_RADIUS
    for (const o of others) {
      if (o === this || o.def.role !== 'prey') continue
      if (!isCarcassEdible({
        dead: o.health.dead,
        expired: o.readyToRemove(),
        consumed: o.foodConsumed,
        harvested: o.meatHarvested,
        claimedBy: o.foodClaimedBy,
        eater: this,
      })) continue
      const d = Math.hypot(o.mesh.position.x - this.mesh.position.x, o.mesh.position.z - this.mesh.position.z)
      if (d < bestD) {
        bestD = d
        best = o
      }
    }
    if (!best || !best.claimAsFood(this)) return null
    return { kind: 'carcass', x: best.mesh.position.x, z: best.mesh.position.z, corpse: best }
  }

  /** True if this corpse is unclaimed or already claimed by `by` — guards
   *  against two predators both completing an eat action on one carcass. */
  private claimAsFood(by: AnimalAgent): boolean {
    if (this.foodConsumed) return false
    if (this.foodClaimedBy && this.foodClaimedBy !== by) return false
    this.foodClaimedBy = by
    return true
  }

  private releaseFoodClaim(by: AnimalAgent): void {
    if (this.foodClaimedBy === by) this.foodClaimedBy = null
  }

  private markFoodConsumed(): void {
    this.foodConsumed = true
    this.foodClaimedBy = null
  }

  private withinRange(x: number, z: number, radius: number): boolean {
    return Math.hypot(x - this.mesh.position.x, z - this.mesh.position.z) < radius
  }

  private wander(dt: number): void {
    this.wanderTimer -= dt
    const timerExpired = this.wanderTimer <= 0
    if (timerExpired || this.arrived(this.target, 1.2)) {
      const restInstead = timerExpired
        && getStaminaRatio(this.life.stamina) < STAMINA_REST_THRESHOLD
        && Math.random() < EXTENDED_IDLE_CHANCE
      if (restInstead) {
        this.wanderTimer = 2 + Math.random() * 3
      } else {
        this.pickWanderTarget()
      }
    }
    this.steerToward(this.target, this.walkSpeedNow(), dt)
  }

  /** hunger/thirst above `NEED_ELEVATED_THRESHOLD` widen the wander radius
   *  and shorten the retarget timer — "searching further, more restless". */
  private needWanderBias(): number {
    const needLevel = Math.max(
      0,
      (this.life.hunger + this.life.thirst) / 2 - NEED_ELEVATED_THRESHOLD / 2,
    )
    return 1 + needLevel * BIAS_STRENGTH
  }

  private pickWanderTarget(): void {
    const bias = this.needWanderBias()
    if (this.pickFollowTarget()) {
      // Shorter cadence than the default retarget below — cohesion is
      // retarget-driven, not continuously tracked, so a tighter interval
      // keeps following visibly responsive (plan 118).
      this.wanderTimer = (1.5 + Math.random() * 2) / bias
      return
    }
    const [minR, maxR] = this.wanderRadius
    if (this.pickPointNear(this.home.x, this.home.z, minR * bias, maxR * bias)) {
      this.wanderTimer = (3 + Math.random() * 4) / bias
      return
    }
    this.target.copy(this.home)
    this.wanderTimer = (3 + Math.random() * 4) / bias
  }

  /** Mother/herd wander bias (plan 118), tried before the home-anchored
   *  target above. Mother-follow takes priority over generic herd cohesion.
   *  Threat/flee never reaches here — `updatePrey()`'s threat branch returns
   *  before `wander()`/`pickWanderTarget()` is ever called, so this can't
   *  interfere with fleeing. Returns true if it picked a target. */
  private pickFollowTarget(): boolean {
    if (this.lifeStage === 'juvenile' && this.motherId) {
      const mother = this.currentOthers.find((o) => o.animalId === this.motherId && !o.isDead())
      if (mother) {
        const [minR, maxR] = MOTHER_FOLLOW_RADIUS
        if (this.pickPointNear(mother.mesh.position.x, mother.mesh.position.z, minR, maxR)) return true
      } else {
        // Mother is dead or gone (corpse expired) — drop the stale
        // reference instead of re-checking every retarget (plan 118 §5).
        this.motherId = undefined
      }
    }
    if (this.herdId) {
      const tier = HERD_SPECIES[this.def.kind]
      if (tier) {
        const leader = pickHerdLeader(this.currentOthers, this.herdId)
        if (leader && leader !== this) {
          const [minR, maxR] = HERD_FOLLOW_RADIUS[tier]
          if (this.pickPointNear(leader.mesh.position.x, leader.mesh.position.z, minR, maxR)) return true
        }
      }
    }
    return false
  }

  /** Picks a walkable point within `[minR,maxR]` of `(cx,cz)` (outside
   *  villages for wild animals — a frenzied one is willing to approach the
   *  settlement, plan 179 §3/§6, so it skips this exclusion), up to 8
   *  attempts. Sets `this.target` and returns true on success, otherwise
   *  leaves it untouched. Shared by the default home-anchored wander and the
   *  herd/mother follow bias. */
  private pickPointNear(cx: number, cz: number, minR: number, maxR: number): boolean {
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = minR + Math.random() * (maxR - minR)
      const a = Math.random() * Math.PI * 2
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r
      if (this.isWalkable(x, z) && (this.def.sociability !== 'wild' || this.frenzied || !this.isNearVillage({ x, z }))) {
        this.target.set(x, 0, z)
        return true
      }
    }
    return false
  }

  private isWalkable(x: number, z: number): boolean {
    if (this.sampleHeight(x, z) <= this.waterLevel + WATER_MARGIN) return false
    for (const collider of this.collidersNear(x, z)) {
      if (Math.hypot(x - collider.x, z - collider.z) < collider.radius) return false
    }
    return true
  }

  private nearest(
    others: AnimalAgent[],
    role: AnimalRole,
    range: number,
  ): AnimalAgent | null {
    let best: AnimalAgent | null = null
    let bestD = range
    for (const o of others) {
      if (o === this || o.def.role !== role || o.health.dead) continue
      const d = Math.hypot(
        o.mesh.position.x - this.mesh.position.x,
        o.mesh.position.z - this.mesh.position.z,
      )
      if (d < bestD) {
        bestD = d
        best = o
      }
    }
    return best
  }

  private steerToward(dest: THREE.Vector3, speed: number, dt: number): void {
    this.tmp.set(dest.x - this.mesh.position.x, 0, dest.z - this.mesh.position.z)
    const dist = this.tmp.length()
    if (dist < 0.4) return
    this.tmp.multiplyScalar(1 / dist)
    this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
    this.moving = true

    const x = this.mesh.position.x
    const z = this.mesh.position.z
    // Steep terrain scales down (and, past the max walkable angle, removes)
    // the uphill component of the step — across-slope/downhill are
    // untouched (plan 183).
    const slopeStep = applySlopeMovementConstraint(
      this.tmp.x * speed * dt,
      this.tmp.z * speed * dt,
      x,
      z,
      this.sampleHeight,
    )
    const stepX = slopeStep.x
    const stepZ = slopeStep.z
    // Avoid water: slide along the shore rather than wading/chasing into it.
    if (this.isWalkable(x + stepX, z + stepZ)) {
      this.mesh.position.x += stepX
      this.mesh.position.z += stepZ
    } else if (this.isWalkable(x + stepX, z)) {
      this.mesh.position.x += stepX
    } else if (this.isWalkable(x, z + stepZ)) {
      this.mesh.position.z += stepZ
    }
  }

  private arrived(dest: THREE.Vector3, radius: number): boolean {
    return (
      Math.hypot(
        dest.x - this.mesh.position.x,
        dest.z - this.mesh.position.z,
      ) < radius
    )
  }

  private clampBounds(): void {
    this.mesh.position.x = THREE.MathUtils.clamp(
      this.mesh.position.x,
      this.home.x - ROAM_RADIUS,
      this.home.x + ROAM_RADIUS,
    )
    this.mesh.position.z = THREE.MathUtils.clamp(
      this.mesh.position.z,
      this.home.z - ROAM_RADIUS,
      this.home.z + ROAM_RADIUS,
    )
  }

  private snapY(): void {
    let y = this.sampleHeight(this.mesh.position.x, this.mesh.position.z)
    // Prefer not standing in deep water.
    if (y <= this.waterLevel + 0.15) {
      y = this.waterLevel + 0.2
    }
    // Capsule is centered; GLB feet sit at local y=0 after prepareProp.
    this.mesh.position.y = this.isCapsule ? y + 0.45 * this.def.scale : y
  }

  private findAction(
    clips: THREE.AnimationClip[],
    names: string[],
  ): THREE.AnimationAction | null {
    if (!this.mixer) return null
    for (const name of names) {
      // Some packs (e.g. Farm Animals cow/sheep) export clips as "Armature|Walk"
      // instead of a bare "Walk" — match either form.
      const clip = clips.find((c) => c.name === name || c.name.endsWith(`|${name}`))
      if (clip) return this.mixer.clipAction(clip)
    }
    return null
  }

  private playAction(action: THREE.AnimationAction | null): void {
    if (!action || action === this.currentAction) return
    this.currentAction?.fadeOut(0.2)
    action.reset().setEffectiveWeight(1).fadeIn(0.2).play()
    this.currentAction = action
  }

  private updateAnim(): void {
    if (this.sprinting) {
      this.playAction(this.gallopAction ?? this.walkAction ?? this.idleAction)
    } else if (this.moving) {
      this.playAction(this.walkAction ?? this.idleAction)
    } else {
      this.playAction(this.idleAction)
    }
  }
}
