import * as THREE from 'three'
import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { Household } from '../settlement/household'
import type { LocalWaterSample } from '../terrain/waterSample'
import type { GrassForageService } from '../world/createGrassForagePatches'
import {
  createMovementWatchdog,
  type MovementWatchdog,
  type RescueStage,
  tickMovementWatchdog,
} from '../ai/npcMovementWatchdog'
import {
  initialSpontaneousVocalizeCooldownSec,
  spontaneousVocalizeTimeWeight,
  tickSpontaneousVocalizeCooldown,
} from '../audio/animalSounds'
import { isNpcCombatDebugMode } from '../debug/debugMode'
import { findPath, type NavigationQuery, type PathPoint } from '../navigation/navigation'
import { beginActivePath, endActivePath, recordPathRequest, recordRepath } from '../navigation/navigationStats'
import { getAgentCpuDiag } from '../perf/agentCpuDiag'
import { tintPropMaterials } from '../settlement/props'
import { type AgentAnimationSet, createAgentAnimationSet } from '../shared/agentAnimationSet'
import { damageHealth, type HealthState } from '../shared/HealthState'
import { drainStamina, getStaminaRatio, isExhausted } from '../shared/StaminaState'
import {
  type ActionLifecycle,
  adoptPlannedAction,
  copyVec3,
  createActionLifecycle,
  type DecisionContext,
  type PlannedAction,
  type ScoredAction,
} from '../simulation'
import { stepWithSlopeAndCollision } from '../terrain/slopeConstraint'
import { shoreProbeHits } from '../terrain/waterBodyKind'
import { type AgentStatusLabelController, createAgentStatusLabelController } from '../ui/agentStatusLabel'
import { isSpeciesTrappable, TRAP_DEFS, type TrapLureDescriptor } from '../world/animalTraps'
import { recordBloodHit } from '../world/bloodTraces'
import { colliderContainsPoint } from '../world/collision'
import { AGENT_RENDER_LAYER, assignRenderLayer } from '../world/waterMirror'
import {
  advanceAnimalCorpse,
  type AnimalCorpseState,
  buryCorpse,
  canHarvestMeatFrom,
  claimCorpseAsFood,
  type CorpsePhase,
  corpseReadyToRemove,
  createAnimalCorpseState,
  disposeAnimalCorpse,
  harvestCorpseMeat,
  hideLivingVisual,
  markCorpseFoodConsumed,
  releaseCorpseClaim,
  rollsRabiesInfection,
  spawnDeathSplat,
  spawnHarvestedRemains,
} from './animalCorpse'
import { type AnimalDebugVisual, createAnimalDebugVisual } from './animalDebugVisual'
import {
  ANIMAL_LABELS,
  type AnimalDef,
  type AnimalKind,
  type AnimalLifeStage,
  type AnimalRole,
  dietAcceptsItem,
  type ScavengingConfig,
} from './animalDefs'
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
import { resolveDogBarkStimulus, resolveDogGuardTarget, resolveDogPestTarget } from './dogGuard'
import { createHealthState, damageFor, damageVsHuman, MAX_HP } from './faunaCombat'
import {
  decideFaunaBehaviour,
  type FaunaBehaviourKind,
  type FaunaDecisionInput,
  scoreFaunaBehaviours,
} from './faunaDecision'
import {
  HERD_FOLLOW_RADIUS,
  HERD_SPECIES,
  JUVENILE_MATURITY_SECONDS,
  JUVENILE_SCALE_FACTOR,
  MOTHER_FOLLOW_RADIUS,
  pickHerdLeader,
} from './herdCohesion'
import {
  initialLivestockProductionReadyAtDays,
  livestockProductionReady,
  nextLivestockProductionReadyAtDays,
} from './livestockProduction'
import { detectionRoll, isPlayerNoticed, type PlayerStealthState, sneakDetectionMultiplier } from './playerAwareness'
import {
  decidePredatorHumanIntent,
  NEARBY_HUMAN_RADIUS,
  type PredatorHumanIntent,
  PROVOCATION_SECONDS,
} from './predatorHumanDecision'
import { type PreyAlertCandidate, resolvePreyAlertThreat } from './preyAlertPerception'
import {
  classifyWaterTraversal,
  shouldApplyDrowningDamage,
  swimStaminaExertion,
  type WaterTraversalMode,
} from './waterTraversal'

/** Corpse/remains/decay/rabies-exposure/claim state machine moved to
 *  `./animalCorpse` (plan fauna-017 step 5) — re-exported wholesale for the
 *  same reason. New test/import sites should prefer `./animalCorpse`
 *  directly (implementation notes' "new modules become the canonical
 *  location"); this stays a compatibility bridge for anything not yet
 *  redirected. */
export * from './animalCorpse'
/** Species taxonomy + `ANIMAL_DEFS` moved to `./animalDefs` (plan fauna-017
 *  step 1) — re-exported wholesale so every existing importer of a species
 *  type or `ANIMAL_DEFS` from `AnimalAgent.ts` is unaffected. */
export * from './animalDefs'

/** One movement mode's stuck-watchdog + in-flight `findPath()` route (plan
 *  npc-006) — see `AnimalAgent.chaseNav`/`fleeNav`'s doc for why chase and
 *  flee each get their own instance instead of sharing one. */
type NavRescue = {
  watchdog: MovementWatchdog
  waypoints: readonly PathPoint[]
  index: number
  active: boolean
}

function createNavRescue(): NavRescue {
  return { watchdog: createMovementWatchdog(), waypoints: [], index: 0, active: false }
}

/** `AnimalAgent.stepNavRescue`'s "this route no longer matches `dest`"
 *  threshold (meters) — see that method's doc. */
const STALE_NAV_ROUTE_DIST = 6

/** HP/sec drained by `tickDrowning()` while `swimming` and stamina-exhausted
 *  (plan fauna-015 §7) — same order of magnitude as a real attack (see
 *  `faunaCombat.ts`'s `MAX_HP`/damage tables), so a swimmer that runs out of
 *  stamina has a real window to reach shore before it actually dies. */
const DROWNING_DAMAGE_PER_SEC = 5
/** Skip the shadow pass for distant animals (plan 113 P2). Exported so
 *  `shadowBudget.ts` can reuse the same radius to decide whether any
 *  shadow-casting animal is currently in range (plan 145 R1). */
export const FAUNA_SHADOW_DISTANCE = 36
/** Distance at which a predator can bite the prey it's chasing. */
const CONTACT_RANGE = 0.8
/** Minimum seconds between bites from the same predator, so contact doesn't
 *  melt prey HP in a single frame. */
const ATTACK_COOLDOWN = 0.6
/** How long a wolf stands still (idle animation, `steerToward` no-ops) after
 *  a successful howl roll (plan fauna-009 §1) — the fallback presentation
 *  for a species with no dedicated howl clip. Does not touch `pendingAction`/
 *  wander target/nav-rescue state, so movement resumes toward the same
 *  destination once the pause elapses. */
const HOWL_PAUSE_SECONDS = 2.5
/** Rabies bite-transmission chance (plan fauna-001) — one roll per landed
 *  bite (`attack()`), never per-tick, so the outcome can't be farmed by
 *  camping at a low frame rate. Set below the corpse-contact chance: a
 *  chase typically lands several bites in a row, so a lower per-bite roll
 *  still produces a fast-spreading outbreak without near-guaranteeing
 *  infection on the very first bite. */
export const RABIES_BITE_INFECTION_CHANCE = 0.35
/** Radius (world units) within which a rabid animal detects and chases its
 *  next live target (plan fauna-001) — flat across every `AnimalKind`,
 *  since rabies overrides the normal predator `detectRange`/prey
 *  `fleeRange` split (meaningless or zero for several roles). Roughly
 *  matches the existing predator detect-range scale (14–20). */
const RABIES_TARGET_DETECT_RANGE = 14

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
/** Distance (world units) from a `strategicVillage`'s center at which a
 *  frenzied wolf's beeline (`moveTowardStrategicVillage`) counts as arrived
 *  and hands off to `updatePredator`/`wander()` — deliberately much tighter
 *  than `VILLAGE_AVOID_MARGIN`/`isNearVillage`, which marks the *outer* edge
 *  of the whole settlement footprint (radius up to 72 for `XL`) and, when
 *  reused as this stop condition, handed off right as the wolf reached the
 *  first buildings at the perimeter — to `wander()`, which is anchored to
 *  the wolf's own (usually distant, off-settlement) `home`, not to the
 *  village, so it never actually walked in among the houses (plan 179
 *  follow-up). NPC detection doesn't depend on reaching this radius either:
 *  `npcThreat` (`update()`'s `senseNpcThreat`) is evaluated every frame
 *  independently of which movement branch is active. */
export const FRENZY_VILLAGE_ARRIVAL_RADIUS = 5
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
/** How close a trip's destination/return-to-home counts as "arrived" (plan
 *  fauna-016 §5) — looser than `wander()`'s 1.2 since a shoreline point is
 *  probe-selected, not a precise walkable target. */
const TRIP_ARRIVAL_RADIUS = 2
/** Bounded radial-probe attempt budget for a water-trip destination search
 *  (plan fauna-016 §5/§10) — only spent once, when a trip actually starts,
 *  same idiom as `WATER_SEARCH_ATTEMPTS` for the needs-driven search. */
const WATER_TRIP_SEARCH_ATTEMPTS = 16
/** Max distance (m) from a dog's own `home` it will chase a nearby rat (plan
 *  fauna-016 §9) — tighter than any guard-target radius, since this is idle
 *  yard behaviour, not household defense. */
const DOG_PEST_RADIUS = 10
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
/** Seconds to wait before re-scanning `lures` for a new candidate once the
 *  current search/target came up empty (plan fauna-014 §11/§12) — a bounded
 *  low-frequency search over a small array, same throttling idiom as
 *  `SOURCE_SEARCH_COOLDOWN_SEC`. */
const LURE_SEARCH_COOLDOWN_SEC = 2
type FaunaActionKind = 'attack' | 'chase' | 'flee' | 'wander' | 'forage' | 'drink' | 'eat' | 'lure'

/** Diagnostic-only label for the mutually-exclusive branch `update()` took
 *  this tick (fauna debug tooling — `AnimalAgent.getDebugInfo()`'s
 *  `aiBranch`). A pure descriptive tag set alongside each branch, never read
 *  back by any decision logic — distinct from `pendingAction.kind`
 *  (`FaunaActionKind`), which `moveTowardStrategicVillage`'s frenzy beeline
 *  never sets (see that method's doc), so `aiBranch` is the only reliable
 *  way to tell "beelining to the village" apart from "normal predator
 *  chase/wander" from the outside. */
export type FaunaAiBranch = 'rabid' | FaunaBehaviourKind

/** One `chaseNav`/`fleeNav` `NavRescue`'s state, serialized for
 *  `AnimalAgent.getDebugInfo()` — no raw Three.js/route internals, just
 *  what's needed to answer "is a repath active, and how far along is it". */
export type FaunaNavRescueDebugInfo = {
  active: boolean
  waypointCount: number
  currentWaypointIndex: number
  currentWaypoint: { x: number, z: number } | null
  rescueStage: RescueStage
  lowProgressStrikes: number
}

/** Serializable, `console.log`/`console.table`-safe snapshot of one
 *  `AnimalAgent`'s current state — fauna debug tooling
 *  (`getFrenzyWolves()`/`getNextFrenzyWolf()` in `debug/faunaInspector.ts`,
 *  `AnimalAgent.getDebugInfo()`). Deliberately built for the "why did this
 *  frenzied wolf stop short of the village" question (see that method's
 *  doc) rather than as a generic dump of every private field — no raw
 *  Three.js objects. */
export type AnimalAgentDebugInfo = {
  animalId: string
  kind: AnimalKind
  frenzied: boolean
  rabid: boolean
  dead: boolean
  position: { x: number, y: number, z: number }
  home: { x: number, z: number }
  moving: boolean
  sprinting: boolean
  /** Net world-space displacement over the last `update()` tick — near-zero
   *  while `moving === true` is the direct symptom of case G ("wilk stoi w
   *  miejscu mimo moving === true"): the AI branch is issuing a step but
   *  `stepWithSlopeAndCollision()` isn't actually advancing the position. */
  lastStepDistance: number
  aiBranch: FaunaAiBranch
  /** `scoreFaunaBehaviours()` over this tick's decision input (npc-008 step
   *  4) — shows why `aiBranch` won, ranked highest first. `null` while a
   *  gate (`rabid`/`mounted`/`dead`) bypassed the ranked decision this tick,
   *  same set of ticks where `aiBranch` isn't one of `FaunaBehaviourKind`. */
  behaviourCandidates: ScoredAction<FaunaBehaviourKind>[] | null
  intent: FaunaActionKind | null
  threateningHuman: boolean
  health: { current: number, max: number }
  stamina: { current: number, max: number }
  strategicVillage: { x: number, z: number, radius: number } | null
  /** Current steering destination, populated only while `aiBranch` is one
   *  that actually steers via `strategicDest` (`frenzy-beeline`,
   *  `npc-attack`, `npc-attack-frenzied`) — `null` otherwise, since the
   *  underlying `THREE.Vector3` is a shared scratch reused by unrelated
   *  branches and would otherwise show a stale value. */
  strategicDest: { x: number, y: number, z: number } | null
  distanceToStrategicVillage: number | null
  distanceToStrategicDest: number | null
  frenzyVillageArrivalRadius: number
  /** True once within `frenzyVillageArrivalRadius` of `strategicVillage`'s
   *  center — case F ("arrivedAtStrategicVillage() uznaje go za przybyłego")
   *  from the outside. */
  arrivedAtStrategicVillage: boolean
  /** Current NPC target commitment (`npcTarget`) — set for any predator with
   *  a resolved `npcThreat`, not only a frenzied one (npc-008 step 6). */
  npcTarget: { id: string, x: number, z: number } | null
  /** `isWalkable()` at the agent's current position — should always be
   *  `true` for a live agent; `false` here would itself be the bug. */
  positionWalkable: boolean
  /** `isWalkable()` at `strategicDest` — case B ("target jest prawidłowy,
   *  ale isWalkable(target) jest false"). `null` when `strategicDest` isn't
   *  currently populated (see that field's doc). */
  strategicDestWalkable: boolean | null
  chaseNav: FaunaNavRescueDebugInfo
  fleeNav: FaunaNavRescueDebugInfo
  /** Owning household's home `Place.id` (plan fauna-011 §2/§15) — `null` for
   *  wild fauna/unowned livestock. Same value as `ownerHouseId`. */
  ownerHouseId: string | null
  /** This tick's resolved guard target (plan fauna-011 §9/§10/§15) — `null`
   *  for any non-dog kind, or a dog with nothing to defend against right
   *  now. Not persisted (`AnimalAgent`'s own field doc). */
  dogGuard: { protectedNpcId: string, ownHousehold: boolean } | null
  /** Most recent contextual bark trigger (plan fauna-011 §7/§15) — `null`
   *  for any non-dog kind, or before this dog has ever barked. Transient,
   *  not persisted. */
  dogVocalizeStimulus: 'guard' | 'wolf-howl' | 'stranger' | null
  /** This tick's resolved threat-alert source, if any (plan fauna-012 §6/§9/
   *  §14) — answers "why did this animal just flee" when it wasn't an
   *  immediate spatial threat: a nearby predator howl, a dog's alert bark,
   *  or a predator currently hunting something live nearby. `null` for a
   *  predator kind (never computed), a `dog` (`fleeRange: 0`, excluded), or
   *  any tick with nothing relevant in range. Not persisted. */
  preyAlertThreat: { x: number, z: number } | null
  /** Current carcass food-target diagnostics (plan fauna-005) — `null` when
   *  not currently pursuing a carcass. `riskPenalty` is always 0 today: the
   *  `carcassCandidateScore` disease/food-safety seam has no consumer yet. */
  foodTarget: { corpsePhase: CorpsePhase, foodValue: number, score: number, riskPenalty: number } | null
  /** Current trap-bait lure pursuit (plan fauna-014 §13) — `null` when no
   *  compatible active lure is currently in range/being pursued. Answers
   *  "why is this animal ignoring/approaching that trap". */
  lureTarget: { trapId: string, x: number, z: number, baitKind: ItemKind } | null
  /** Combat/death presentation state (plan npc-009) — which one-shot clip is
   *  currently pre-empting normal locomotion (if any), and which semantic
   *  clips this species/pack actually resolved (`false` marks a missing-clip
   *  fallback to the manual tip-over pose, not a bug — see sheep/chicken/bear
   *  in `AnimalAgent`'s own action-field doc). */
  presentation: {
    current: 'hurt' | 'attack' | null
    hasAttackClip: boolean
    hasHurtClip: boolean
    hasDeathClip: boolean
  }
}

/** Plain-data persistence contract for one livestock/mount individual (plan
 *  persistence-001) — authoritative fields only. Navigation/targets/
 *  animation/FX/corpse-decay-phase are deliberately excluded: `hydrate()`
 *  re-derives them (phase from `timeSinceDeath` on the next `update()` tick,
 *  presentation immediately in `hydrate()` itself). `x`/`z`/`yaw` are the
 *  meaningful world position; terrain-derived `y` is never persisted, always
 *  resolved fresh via `snapY()`. */
export type AnimalSaveState = {
  x: number
  z: number
  yaw: number
  health: { current: number, max: number, dead: boolean }
  life: { hunger: number, thirst: number, stamina: number }
  productionReadyAtDays: number | null
  eggPending: boolean
  /** Set only while `health.dead` — `null` for a live animal. Lets a dead
   *  individual's corpse lifecycle (linger threshold, harvested-remains vs.
   *  natural-decay presentation) resume exactly where it left off. */
  corpse: { timeSinceDeath: number, meatHarvested: boolean } | null
}

/** A real-world food/water destination an animal is pursuing (plan 094) —
 *  `corpse` is set only for `kind: 'carcass'`, so the eater can release its
 *  claim on cancel/completion. */
type SourceTargetKind = 'water' | 'forage' | 'carcass' | 'feed' | 'grassPatch'
type SourceTarget = {
  kind: SourceTargetKind
  x: number
  z: number
  corpse?: AnimalAgent
  /** Set when this `water` target is the owning household's `AnimalTrough`
   *  (plan 122) rather than a natural shoreline — `performSourceAction`
   *  drains `household.water` in addition to relieving `life.thirst`. */
  trough?: boolean
  /** Set only for `kind: 'carcass'` — corpse phase/value/score captured at
   *  selection time (plan fauna-005), for `getDebugInfo()`'s `foodTarget`
   *  diagnostics only. The authoritative eat-time check re-reads the live
   *  corpse phase/value (`performSourceAction`), never these cached values. */
  corpsePhase?: CorpsePhase
  foodValue?: number
  score?: number
  /** Set only for `kind: 'feed'` (plan fauna-010 §7) — the diet-eligible
   *  `ItemKind` selected from the owning household's `items` at search time.
   *  `performSourceAction` re-checks/removes this exact kind on completion,
   *  never a re-derived one, so a completed eat always matches what was
   *  actually offered. */
  feedItemKind?: ItemKind
  /** Set only for `kind: 'grassPatch'` (plan fauna-010 §3/§4) — the stable
   *  `GrassForagePatch` id this target resolves through `grassForage` for
   *  live availability checks and final atomic consumption. */
  patchId?: string
}

/** A committed "trip" beyond normal local wander (plan fauna-016 §4) —
 *  `destination` is chosen once (`maybeStartWaterTrip`) and retained for the
 *  whole trip; `wander()`'s own per-tick retargeting never touches it.
 *  `'water'` is the only trip kind so far, but the shape (destination + phase
 *  + committed state) is meant to generalize to a later trip kind without a
 *  second movement system. */
type AnimalTripKind = 'water'
type AnimalTripPhase = 'traveling' | 'staying' | 'returning'
type AnimalTrip = {
  kind: AnimalTripKind
  destination: THREE.Vector3
  phase: AnimalTripPhase
  /** Countdown (sec) while `phase === 'staying'`; unused otherwise. */
  stayRemainingSec: number
}

/** One trough visit's draw against the household water reserve — same order
 *  of magnitude as `NpcAgent`'s `WATER_DRINK_FROM_STOCK_AMOUNT`. */
const TROUGH_DRINK_AMOUNT = 1

/** Forage habitat suitability from a `sampleForestFactor` reading — peaks at
 *  forest-edge density (~0.45) rather than open meadow or deep forest,
 *  matching deer/stag habitat preference (plan 094). Pure so it's
 *  unit-testable without instantiating `AnimalAgent`/Three.js. */
export function forageEdgeScore(forestFactor: number): number {
  return Math.max(0, 1 - Math.abs(forestFactor - 0.45) * 2)
}

/** FNV-1a string hash — same local-per-module idiom as e.g.
 *  `world/fishing.ts`'s `hashString` (deliberately duplicated rather than
 *  shared, matching that convention). Used only to phase-offset a trip's day
 *  bucket per animal below. */
function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic day-bucket index for `animalId`'s next trip opportunity
 *  (plan fauna-016 §5/§10) — advances once per `cooldownDays`, phase-offset
 *  per animal (a stable hash of its own id) so a whole population doesn't
 *  become "due" on the same day. Pure/testable; `AnimalAgent` only commits to
 *  a new trip when this bucket differs from the last one it acted on
 *  (`maybeStartWaterTrip`), never by rerolling every tick. */
export function tripDayBucket(animalId: string, worldDays: number, cooldownDays: number): number {
  if (cooldownDays <= 0) return 0
  const phase = (hashString(animalId) % 1000) / 1000
  return Math.floor(worldDays / cooldownDays + phase)
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

/** True when a predator of `kind` may pursue a live target (prey or NPC)
 *  into a settlement's avoidance radius instead of giving up the chase
 *  (fauna-006) — a wolf always may, since settlement conflict/pursuit is
 *  intended wolf behaviour; any other predator only while `frenzied` (which
 *  in practice only ever applies to a wolf — `pickNearestEligibleWolf` only
 *  ever frenzies a wolf — but this stays explicit rather than relying on
 *  that invariant). Pure so it's unit-testable without instantiating
 *  `AnimalAgent`/Three.js. Deliberately does not extend to ordinary
 *  wander/forage/water search — see `pickPointNear`'s doc — only to
 *  target-driven pursuit (`updatePredator`'s prey chase,
 *  `senseNpcThreat`'s NPC candidate selection). */
export function canPredatorPursueIntoVillage(kind: AnimalKind, frenzied: boolean): boolean {
  return kind === 'wolf' || frenzied
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

/**
 * Deterministic best-candidate lure resolution (plan fauna-014 §3/§4/§11) —
 * filters `lures` (already "active + baited", see `PlacedTraps.activeLures()`)
 * down to trap-kind-species-compatible (`isSpeciesTrappable`), diet-compatible
 * (`dietAcceptsItem`) candidates within that trap kind's `lureRadius`, then
 * picks the nearest one. Ties (equal squared distance) break on `trapId` so
 * the result never depends on `lures`' iteration order. Pure and
 * allocation-free — safe to call from a throttled per-animal check without a
 * second candidate-array pass (implementation notes' "avoid allocations in
 * the per-tick path").
 */
export function resolveLureTarget(
  lures: readonly TrapLureDescriptor[],
  def: AnimalDef,
  x: number,
  z: number,
): TrapLureDescriptor | null {
  let best: TrapLureDescriptor | null = null
  let bestDistSq = Infinity
  for (const lure of lures) {
    if (!isSpeciesTrappable(lure.kind, def.kind)) continue
    if (!dietAcceptsItem(def.diet, lure.baitKind)) continue
    const dx = lure.x - x
    const dz = lure.z - z
    const distSq = dx * dx + dz * dz
    const radius = TRAP_DEFS[lure.kind].lureRadius
    if (distSq > radius * radius) continue
    if (distSq < bestDistSq || (distSq === bestDistSq && (!best || lure.trapId < best.trapId))) {
      best = lure
      bestDistSq = distSq
    }
  }
  return best
}

/** Dog guard target (plan fauna-011 §9/§10/§13) — the `AnimalAgent` (a live
 *  predator) to chase/fight plus who it's defending, resolved fresh every
 *  tick by `resolveGuardTarget()`. Never itself persisted or cached across
 *  ticks beyond `dogGuardTarget` (a diagnostic/same-tick convenience, not a
 *  sticky commitment) — see that field's doc. */
type DogGuardTarget = { wolf: AnimalAgent, protectedNpcId: string, ownHousehold: boolean }

/** Max distance (m) from a dog's own home a wolf attacking *this dog's own
 *  household* is still worth chasing (plan fauna-011 §10/§13: own-household
 *  defense gets the most latitude, but a dog must still "pozostać lokalnym
 *  obrońcą", never a settlement-wide police). Bigger than
 *  `DOG_GUARD_ASSIST_RADIUS` below on purpose. */
const DOG_GUARD_OWN_RADIUS = 40
/** Max distance (m) from a dog's own home a wolf attacking a *different*
 *  household's NPC is still worth assisting (plan fauna-011 §10) — tighter
 *  than `DOG_GUARD_OWN_RADIUS` so helping a stranger never pulls a dog far
 *  from its own home/family. */
const DOG_GUARD_ASSIST_RADIUS = 20
/** Radius (m) from a dog's own home within which a recent wolf howl
 *  (`recentVocalizeAlert`) is "relevant" enough to trigger an alert bark
 *  (plan fauna-011 §7/§8) — deliberately generous next to the guard radii
 *  above, since this only ever produces a bark, never a chase ("odległy wilk
 *  może wywołać jedynie alert"). */
const DOG_BARK_HOWL_RADIUS = 45
/** Radius (m) from a dog's own home within which an unfamiliar (different-
 *  household) settlement NPC triggers an observational bark (plan
 *  fauna-011 §7) — tight, since this is "a stranger right by the house", not
 *  general awareness of the whole settlement. */
const DOG_BARK_STRANGER_RADIUS = 10
/** Shared cooldown between every dog bark trigger (plan fauna-011 §7) — the
 *  actual anti-spam gate; keeps a settlement's dogs from cascading into a
 *  continuous chorus over one lingering stimulus. */
const DOG_BARK_COOLDOWN_SEC = 10
/** How long a vocalization stays "recent" for `recentVocalizeAlert` readers
 *  (plan fauna-011 §8) — short and spatially local by construction (readers
 *  compare against the vocalizing animal's own position), matching the
 *  plan's "transient, spatially bounded" stimulus requirement. */
const VOCALIZE_ALERT_DURATION_SEC = 6
/** Flat bonus (m) added on top of a prey/domestic species' own `fleeRange`
 *  to get its threat-alert radius (plan fauna-012 §6/§9/§11) — a relevant
 *  recent predator howl or live predator-hunting-something signal within
 *  this wider radius raises flee relevance even with no immediate spatial
 *  threat in `fleeRange`. Reuses `fleeRange` itself as the per-species
 *  differentiation (a skittish `rabbit` already has a bigger `fleeRange`
 *  than a placid `cow`) rather than a second per-species config field —
 *  `resolveAlertThreat()`'s `this.def.fleeRange > 0` gate is what excludes
 *  `dog` (`fleeRange: 0`, guard/bark already covers its own threat
 *  response) with no kind-specific branch needed. */
const PREY_ALERT_RANGE_BONUS = 20

/** A nearby NPC candidate for predator human-targeting (plan 179 §5/§7) —
 *  the same narrow shape as `countNearbyHumans`' NPC positions, plus a
 *  stable `id` so a chosen target can be reported back to the caller
 *  (`Fauna.update`'s `onNpcHit`) without `AnimalAgent` holding an `NpcAgent`
 *  reference. Caller-supplied and bounded (loaded settlements' NPCs only) —
 *  see `Fauna`'s own doc comment.
 *
 *  `homeId` (plan fauna-011 §9/§10) is this NPC's `Household.homeId`, when
 *  known — lets a wolf's committed attack target (`npcAttackTarget`) answer
 *  "is this my own household's dog's owner" without a second household
 *  lookup. Optional so every pre-fauna-011 caller/test keeps working. */
export type NearbyNpcCandidate = { id: string, x: number, z: number, homeId?: string }

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

/** Nearest live animal of *any* role within `range` (plan fauna-001) — a
 *  rabid animal's target search, unlike the role-filtered `nearest()` used
 *  by normal predator/prey AI. Generic/structural (same "testable without
 *  real agents" shape as `shouldSkipForPopulationProtection` in
 *  `huntingHooks.ts`) so production code can pass the real `AnimalAgent[]`
 *  directly with no extra allocation, while tests pass plain candidates. */
export function pickRabidTarget<
  T extends { animalId: string, isDead: () => boolean, mesh: { position: { x: number, z: number } } },
>(
  self: { animalId: string, mesh: { position: { x: number, z: number } } },
  others: readonly T[],
  range: number,
): T | null {
  let best: T | null = null
  let bestD = range
  for (const o of others) {
    if (o.animalId === self.animalId || o.isDead()) continue
    const d = Math.hypot(o.mesh.position.x - self.mesh.position.x, o.mesh.position.z - self.mesh.position.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

/** This animal's `AgentAnimationSet` clip keys (plan fauna-017 step 4b,
 *  review E6) — the semantic mapping every `anim.resolve()`/`play()`/
 *  `playOnce()`/`settleAtEnd()` call site uses instead of a raw clip name. */
type AnimalAnimClip = 'attack' | 'death' | 'gallop' | 'hurt' | 'idle' | 'walk'

/** Construction dependencies for `AnimalAgent` (plan fauna-017 step 2) —
 *  same "flat object, optionality mirrors the old positional defaults"
 *  shape as `CreateSettlementDeps`/`NpcAgentDeps`. Replaces the previous
 *  19-parameter positional constructor; every call site converts
 *  mechanically (same fields, same order, same defaults), so this is not a
 *  new construction contract, just a named one. */
export type AnimalAgentDeps = {
  def: AnimalDef
  animalId: string
  sampleHeight: HeightSampler
  waterLevel: number
  sampleLocalWater: (x: number, z: number) => LocalWaterSample
  collidersNear: ColliderSource
  x: number
  z: number
  visual?: THREE.Object3D
  animations?: THREE.AnimationClip[]
  /** Explicit override (e.g. livestock's fixed `LIVESTOCK_WANDER_RADIUS`) —
   *  wins over `def.roaming` when supplied (plan fauna-016 §3). `undefined`
   *  (every wild ring-spawn caller) falls through to `def.roaming`, then to
   *  `DEFAULT_WANDER_RADIUS`. */
  wanderRadius?: readonly [number, number]
  sampleForestFactor?: (x: number, z: number) => number
  ownerHouseId?: string
  onDeath?: (animalId: string) => void
  herdId?: string
  lifeStage?: AnimalLifeStage
  motherId?: string
  household?: Household | null
  spawnPointId?: string
}

/** Per-tick inputs for `AnimalAgent.update()` (plan fauna-017 step 2) — same
 *  flat-object conversion as `AnimalAgentDeps`, one field per former
 *  positional parameter, same defaults. Replaces the previous 21-parameter
 *  positional `update()`, which call sites reached past runs of 6-8
 *  `undefined` placeholders (review §P3). */
export type AnimalUpdateContext = {
  dt: number
  others: AnimalAgent[]
  observerPos: THREE.Vector3
  dayFactor: number
  forestFactor: number
  litFires: readonly { x: number, z: number }[]
  villages?: readonly VillageInfo[]
  nearbyHumanCount?: number
  /** Optional fauna→human damage seam (plan 056). Absent → chase only. */
  onHumanHit?: (damage: number, attackerX: number, attackerZ: number) => void
  /** Sneak/movement stealth inputs (plan 124 §4). Defaults to "no effect"
   *  so existing callers/tests that don't pass it keep prior behaviour. */
  playerStealth?: PlayerStealthState
  /** Bounded/local NPC candidates (plan 179 §5/§7) — only consulted for a
   *  `frenzied` predator, and only once the player isn't the active
   *  threat, so ordinary (non-frenzied) predator behaviour is unaffected.
   *  Caller (`Fauna.update`) is responsible for keeping this small (loaded
   *  settlements' NPCs), never a global scan. */
  nearbyNpcs?: readonly NearbyNpcCandidate[]
  /** Fauna→NPC damage seam (plan 179 §9/§11), mirrors `onHumanHit` but
   *  keyed to the specific NPC id chosen as target. `attackerAnimalId` is
   *  diagnostic-only (`?debug=1&debugNpcCombat=1` combat logging) — lets
   *  the caller look this animal back up via `getAgents()` without this
   *  callback needing to know about `AnimalAgent` itself. */
  onNpcHit?: (targetId: string, damage: number, attackerX: number, attackerZ: number, attackerAnimalId: string) => void
  /** Aggression/alert audio hook (plan 188 §11) — fired once on the rising
   *  edge of this predator committing to a human chase, not every frame. */
  onAggro?: (kind: AnimalKind, x: number, z: number) => void
  /** Spontaneous ambient vocalization hook (plan settlements-npcs-004 §1,
   *  extended fauna-009 §1/§4) — fired at most once per tick, on the frame
   *  `tickSpontaneousVocalizeCooldown` rolls a success. No-op for any kind
   *  without a configured vocalization (cow/sheep/chicken/wolf/rooster). */
  onVocalize?: (kind: AnimalKind, x: number, z: number) => void
  /** `dayNight.elapsedDays` (plan fauna-002) — only meaningful for a
   *  livestock kind with `def.production`; drives the day-anchor
   *  production readiness check (`tickProduction`/`livestockProduction.ts`).
   *  Defaults to 0 so existing wild-fauna/test callers that never touch
   *  production are unaffected. */
  nowDays?: number
  /** `dayNight.timeOfDay` (plan fauna-009 §1/§4) — the raw world clock (not
   *  just `dayFactor`), needed to weight wolf howl toward night/twilight and
   *  rooster crow toward dawn (`spontaneousVocalizeTimeWeight`); `dayFactor`
   *  alone can't tell dawn from dusk. Defaults to noon (full "day" weight)
   *  so existing wild-fauna/test callers that don't pass it keep prior
   *  behaviour for every kind without time-of-day weighting. */
  timeOfDay?: number
  /** Shared world-owned forage service (plan fauna-010 §3/§4) — queried by
   *  `findDietTarget()` for a species with `def.diet.grass`, consumed
   *  atomically on a completed eat action. `undefined` for any caller that
   *  doesn't wire one (tests, a species without `def.diet`); grass-patch
   *  selection is then simply skipped, same "capability absent → branch
   *  never taken" convention as `def.diet` itself. */
  grassForage?: GrassForageService
  /** Bounded/local live predators (plan fauna-011 §9/§10/§11) — only
   *  consulted by a `dog` (`resolveGuardTarget`/`resolveBarkStimulus`);
   *  every other kind never reads this. Caller-bounded the same way as
   *  `nearbyNpcs` — `tickSettlementLivestock`'s per-frame wolf filter, not
   *  a per-dog scan (see that call site's doc). Defaults to none so every
   *  existing caller/test keeps prior behaviour. */
  nearbyPredators?: readonly AnimalAgent[]
  /** Bounded/local same-settlement NPCs (plan fauna-011 §7) — only
   *  consulted by a `dog`'s stranger-bark check
   *  (`resolveBarkStimulus`), deliberately the settlement's own
   *  already-updated `agents` list (cheap, already in scope at the call
   *  site) rather than the global cross-settlement `nearbyNpcs` wolves use.
   *  Defaults to none so every existing caller/test keeps prior behaviour. */
  nearbySettlementNpcs?: readonly NearbyNpcCandidate[]
  /** Currently active+baited traps (plan fauna-014 §3/§4) — a small,
   *  world/fauna-owned snapshot (`PlacedTraps.activeLures()`), not a
   *  per-animal query. Consulted only by `updatePredator`/`updatePrey`'s
   *  own `pursueLure()`, below any threat/needs response. Defaults to none
   *  so existing callers/tests keep prior behaviour. */
  lures?: readonly TrapLureDescriptor[]
  /** This settlement's own live rats (plan fauna-016 §9) — only meaningful
   *  for an owned `dog`'s idle pest-chase (`pursuePest`); every other kind
   *  never reads this. Caller-bounded the same way as `nearbySettlementNpcs`
   *  (`settlement/rats.ts`'s own small population, not a world scan).
   *  Defaults to none so existing callers/tests keep prior behaviour. */
  nearbyRats?: readonly AnimalAgent[]
}

/**
 * @domain fauna
 * @system animal-agent
 * @role Central per-animal behaviour integration point: predator/prey AI,
 *  needs, health, production (livestock) and riding (mounts).
 * @uses HealthState StaminaState
 * @simulation tick
 */
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
  /** Not `private`: `CorpseHost`'s structural contract (`animalCorpse.ts`,
   *  plan fauna-017 step 5) needs it public so `this` satisfies that type
   *  without a wrapper allocation — same reasoning as `isCapsule`/`def`. */
  readonly sampleHeight: HeightSampler
  private readonly waterLevel: number
  /** Local physical water sample (plan fauna-015), forwarded unchanged from
   *  `ChunkManager.sampleLocalWater` by the spawn site — the sole input
   *  `isWalkable()`/`resolveWaterTraversal()` use to classify dry/wading/
   *  swimming, so lake/ocean/river water depth is never re-derived here. */
  private readonly sampleLocalWater: (x: number, z: number) => LocalWaterSample
  /** This tick's resolved traversal mode (plan fauna-015 §2/§7) — set once
   *  per tick by `resolveWaterTraversal()` from the animal's actual
   *  post-movement position, read by stamina exertion (`swimExertionNow`)
   *  and drowning (`tickDrowning`). Not consulted by `isWalkable()` itself,
   *  which re-derives ability fresh per candidate point instead. */
  private waterMode: WaterTraversalMode = 'dry'
  private readonly collidersNear: ColliderSource
  /** Optional habitat sampler (plan 094) — only wild fauna's `createFauna.ts`
   *  passes one; livestock's spawn path omits it, and forage search falls
   *  back to distance-only scoring (see `findForageTarget`). */
  private readonly sampleForestFactor?: (x: number, z: number) => number
  /** Not `private`: part of `CorpseHost`'s structural contract
   *  (`animalCorpse.ts`, plan fauna-017 step 5) — `this` is passed directly
   *  wherever a `CorpseHost` is expected, so every field that type reads
   *  must be publicly accessible. */
  readonly isCapsule: boolean
  private target = new THREE.Vector3()
  private readonly fleeTarget = new THREE.Vector3()
  private wanderTimer = 0
  private readonly tmp = new THREE.Vector3()
  private readonly home = new THREE.Vector3()
  private readonly wanderRadius: readonly [number, number]
  /** Committed water/other trip (plan fauna-016 §4) — `null` when not on
   *  one. Only ever read/written by `wander()`'s trip helpers. */
  private trip: AnimalTrip | null = null
  /** Last `tripDayBucket` this animal committed a water trip for (plan
   *  fauna-016 §5) — `-1` so the very first bucket it ever sees always
   *  counts as new. */
  private lastWaterTripBucket = -1
  private moving = false
  private sprinting = false
  /** True while a player is riding this animal (plan fauna-003) — suppresses
   *  the AI decision branch in `update()` (the riding system drives movement
   *  instead, via `driveMounted()`), but needs/stamina/hp/animation
   *  bookkeeping keeps running exactly as it would while free-roaming. */
  private mounted = false
  /** Clip resolve/crossfade/one-shot/settle owner (plan fauna-017 step 4b,
   *  review E6) — replaces 8 separate `THREE.AnimationAction | null` fields
   *  (idle/walk/gallop/attack/hurt/death) plus the mixer itself, same shared
   *  owner `NpcAgent` already uses (`shared/agentAnimationSet.ts`). A key
   *  with no matching clip is a safe, silent fallback (existing locomotion
   *  keeps playing, no crash) — not every species/pack exports all three
   *  combat/death clips (e.g. sheep/chicken/bear have none, cow only has
   *  `Death`). */
  private readonly anim: AgentAnimationSet<AnimalAnimClip>
  /** Countdown while a one-shot attack/hurt clip should keep pre-empting
   *  `updateAnim()`'s normal idle/walk/gallop switch (plan npc-009) — `0`
   *  outside a one-shot. Decremented in `update()`/`driveMounted()` (via
   *  `tickPresentationAndLife()`) alongside the other cooldown-style timers.
   *  Kept on the agent rather than in `AgentAnimationSet` — it gates
   *  simulation (movement/AI), not presentation. */
  private attackAnimTimer = 0
  private hurtAnimTimer = 0
  /** Countdown while `steerToward()` should no-op for a howling wolf with no
   *  dedicated howl clip (plan fauna-009 §1, `HOWL_PAUSE_SECONDS`) — set on a
   *  successful howl roll in `update()`, decremented alongside the other
   *  timers. Only ever set for `kind === 'wolf'`. */
  private howlPauseTimer = 0
  /** Bounds how long a dead animal's `update()` keeps ticking its own
   *  `anim` (plan npc-009) so the one-shot death clip actually plays out —
   *  `null` when there was no death clip to play (manual tip fallback, no
   *  mixer work needed), compared against `timeSinceDeath` (already tracked
   *  for corpse decay) rather than a second death-clock field. */
  private deathAnimDurationSec: number | null = null
  /** Name+stat-bars label owner (plan fauna-017 step 4c, review E6) —
   *  replaces 13 hand-rolled DOM/percent-cache fields with the shared
   *  controller `NpcAgent` already uses (`ui/agentStatusLabel.ts`). Bars are
   *  `['hp','stamina','satiety','hydration']`; satiety/hydration are
   *  inverted needs, fed as `{ current: 1 - hunger, max: 1 }` at each
   *  `sync()` call (see `tickPresentationAndLife()`). */
  private readonly labelController: AgentStatusLabelController
  readonly health: HealthState
  readonly life: AnimalLifeState
  /** Absolute `elapsedDays` anchor at which this animal's next production
   *  event — a fresh egg becoming ready (`chicken`) or the milking cooldown
   *  clearing (`cow`/`sheep`) — is ready; `null` until the first real
   *  `update()` tick lazily seeds it with a staggered offset (plan fauna-002
   *  §5/§6: state lives per-animal, no global `nextChickenEggTime`-style
   *  timer, and no per-frame decrementing — see `livestockProduction.ts`).
   *  Meaningless (never read) for kinds without `def.production`. */
  private productionReadyAtDays: number | null = null
  /** `egg` only — true from the moment this cycle's egg has been dropped
   *  into the world until it's actually collected (`notifyEggCollected`);
   *  blocks starting a new cycle so a chicken never has more than one
   *  outstanding egg (plan fauna-002 §2.1). */
  private eggPending = false
  private attackCooldown = 0
  private isNight = false
  private highlighted = false
  /** True while `showDebug()`'s world-space overlay is active for this
   *  agent (fauna debug tooling) — at most one agent at a time in practice
   *  (the DevTools selection cursor in `debug/faunaInspector.ts`), but
   *  nothing here enforces that; each agent owns its own overlay. */
  private debugActive = false
  private debugVisual: AnimalDebugVisual | null = null
  /** Diagnostic-only label for the branch `update()` took this tick — see
   *  `FaunaAiBranch`'s doc. Never read by any decision logic. */
  private debugBranch: FaunaAiBranch = 'predator-normal'
  /** Net position delta over the last `update()` tick — see
   *  `AnimalAgentDebugInfo.lastStepDistance`'s doc. */
  private debugLastStepDist = 0
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
  /** Same staggered-reevaluation idiom as `humanDecisionTimer`, kept separate
   *  (own timer/cache/roll) rather than shared — since npc-008 step 6 made
   *  `npcThreat` general, a predator can have `sense.playerActive` and an
   *  NPC target true in the same tick, and `refreshThrottledHumanIntent`/
   *  `refreshThrottledNpcIntent` would otherwise race on one shared cache
   *  (whichever runs second overwrites the other's in-flight intent). Only
   *  ever written by `refreshThrottledNpcIntent`. */
  private npcDecisionTimer = 0
  private cachedNpcIntent: PredatorHumanIntent = 'flee'
  private cachedNpcAggressionRoll = 0
  /** Counts down after a player hit — feeds wolf retaliation (plan 056 ext). */
  private provokedTimer = 0
  /** This tick's `decideFaunaBehaviour()` input (npc-008 step 4) — `null`
   *  while the `rabid`/`mounted`/`dead` gates bypassed the decision
   *  entirely. Cached only so `getDebugInfo()` can recompute
   *  `scoreFaunaBehaviours()` on demand for `?debug=1` without the runtime
   *  `update()` path allocating a `ScoredAction[]` every tick. */
  private lastFaunaDecisionInput: FaunaDecisionInput | null = null
  /** Runtime-only trait set by the `setFrenzyWolf()` DevTools command (plan
   *  179 §3/§4) — not a new species/FSM, just an input to the existing
   *  predator-human decision (see `decideHumanResponse`/`decideNpcResponse`'s
   *  `provoked: this.provokedTimer > 0 || this.frenzied`) and to village
   *  wander-avoidance (`pickPointNear`). Never persisted (plan 179 §3
   *  "Persistence": wild fauna isn't a save source in V1). */
  private frenzied = false
  /** Rabies infection state (plan fauna-001) — a persistent disease state,
   *  distinct from `frenzied` (a debug/runtime behavior trait). Never
   *  cleared once set: infection lasts until death (no incubation, no
   *  natural recovery in V1), and the same `AnimalAgent` instance persists
   *  through its corpse-linger lifetime, so this also marks an infected
   *  corpse as contagious (see `applyRabiesCorpseExposure`). */
  private rabid = false
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
  /** Locked-in NPC target for a predator (plan 179 follow-up; generalized to
   *  every predator, not just a frenzied one, in npc-008 step 6) — once set,
   *  `resolveNpcTarget()` keeps returning this exact NPC instead of
   *  re-picking the nearest candidate every tick (which flickered between
   *  candidates as NPCs moved, reading as the animal "jumping"/changing
   *  direction every frame). Cleared only when the NPC drops out of the
   *  caller-bounded `nearbyNpcs` list (dead or its settlement unloaded) —
   *  see `resolveNpcTarget()`. */
  private npcTarget: NearbyNpcCandidate | null = null
  /** Dog-only guard state (plan fauna-011 §9/§10/§13) — recomputed fresh
   *  every `update()` tick from live world state (see `resolveGuardTarget`),
   *  never itself the source of truth; only cached here for
   *  `getDebugInfo()`/`updateDogGuard()` to read within the same tick.
   *  `null` for every non-dog kind. */
  private dogGuardTarget: DogGuardTarget | null = null
  /** Dog-only contextual bark cooldown (plan fauna-011 §7), same "own
   *  per-instance timer" convention as `attackCooldown`/`alertTimer` —
   *  advanced/reset by `updateDogVocalization()`, never persisted (plan
   *  fauna-011 §14). */
  private barkCooldownSec = 0
  /** Diagnostic-only record of the last stimulus that actually fired a bark
   *  (plan fauna-011 §15) — not itself read by any decision logic. */
  private lastBarkStimulus: 'guard' | 'wolf-howl' | 'stranger' | null = null
  /** Seconds remaining since this animal last vocalized (any kind) — the
   *  "wolf howled recently" stimulus a nearby dog's `resolveBarkStimulus()`
   *  reads via `recentVocalizeAlert`, instead of depending on WebAudio/
   *  camera/player presence (plan fauna-011 §8). Sim-state only, decays like
   *  any other timer, never persisted. */
  private vocalizeAlertRemainingSec = 0
  /** Semantic context of the vocalization currently backing
   *  `vocalizeAlertRemainingSec` (plan fauna-012 §4/§7) — `'ambient'` for
   *  every existing spontaneous call (howl/crow/moo/cluck/bleat, all set at
   *  the same `onVocalize` site below) and `'alert'` only for a dog's own
   *  contextual bark (`updateDogVocalization`, guard/wolf-howl/stranger).
   *  Meaningless while `vocalizeAlertRemainingSec <= 0`; read alongside it,
   *  never alone. */
  private vocalizeAlertContext: 'ambient' | 'alert' = 'ambient'
  /** Diagnostic-only cache of the last resolved threat-alert source (plan
   *  fauna-012 §14) — `null` for a predator kind (never read) or any
   *  non-predator tick with nothing relevant in range. Not read by any
   *  decision logic; `updatePrey()` recomputes the real check fresh every
   *  tick regardless of this cached copy. */
  private lastPreyAlertThreat: { x: number, z: number } | null = null
  /** Locked-in live-hunt target for a predator (plan npc-005) — once set,
   *  `resolvePreyTarget()` keeps chasing this exact prey animal instead of
   *  re-picking `nearest(others, 'prey', ...)` every tick, which switched
   *  chase target (and visibly changed direction) whenever a different prey
   *  animal happened to be momentarily closer. Cleared when the target dies
   *  or leaves `detectRange` — the same bound `nearest()` already used to
   *  find it — so a predator can still lose prey that outruns detection. */
  private preyTarget: AnimalAgent | null = null
  /** Stuck-movement detection + in-flight repath route for one movement
   *  mode, shared with `NpcAgent` (plan npc-006) — reuses
   *  `npcMovementWatchdog.ts`'s pure state/functions rather than a second
   *  animal-specific stuck detector. Two separate instances (`chaseNav`,
   *  `fleeNav`) rather than one shared channel, so a repath route found
   *  mid-chase can never get silently resumed while fleeing (or vice
   *  versa) after a mode switch — see `stepNavRescue`. No blind single-hop
   *  fallback for animals the way `NpcAgent` has one: when `findPath` finds
   *  no route, direct `steerToward` simply resumes next frame, the
   *  pre-existing behaviour, never worse than before this plan. */
  private readonly chaseNav: NavRescue = createNavRescue()
  private readonly fleeNav: NavRescue = createNavRescue()
  private readonly repathWaypointScratch = new THREE.Vector3()
  /** True while this predator's latest throttled human-response decision
   *  (player or, when frenzied, a noticed NPC) is `attack` — the small
   *  signal `NpcAgent`'s bounded local threat perception reads to react
   *  *before* taking damage (plan 179 §6/§10). See `isThreateningHuman()`. */
  private threateningHuman = false
  /** Corpse/remains/decay/rabies-exposure/food-claim state (plan fauna-017
   *  step 5, review E3) — replaces 15 individual fields (bloodSplat+token,
   *  harvestedRemains+token, naturalRemains+token, rotFx, corpsePhaseValue/
   *  buried/meatHarvested/corpseHeld, rabiesExposedAnimalIds, foodClaimedBy/
   *  foodConsumedPhase, timeSinceDeath) with the plain state object
   *  `animalCorpse.ts` owns — same "state + free functions over an explicit
   *  host" shape as `AnimalLife.ts`'s `AnimalLifeState`. `health.dead`
   *  stays authoritative on the agent; this only tracks what happens to the
   *  corpse once it is. */
  private readonly corpse: AnimalCorpseState = createAnimalCorpseState()
  /** Rising-edge detector for the aggro/growl audio hook (plan 188 §11). */
  private wasThreateningHuman = false
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
  /** Cached trap-bait lure destination (plan fauna-014 §3/§4) — re-validated
   *  against the current tick's `lures` every time `pursueLure()` runs (never
   *  trusted stale), so only `trapId`/position/kind/bait need to survive
   *  between ticks. Never persisted (implementation notes' "no lure caches"). */
  private lureTarget: TrapLureDescriptor | null = null
  /** Seconds remaining before the next failed lure search retries, same
   *  throttling convention as `sourceSearchCooldown`. */
  private lureSearchCooldown = 0
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
  /** This frame's `nowDays`/`grassForage`, cached the same way as
   *  `currentOthers` above (plan fauna-010) — `findDietTarget`/
   *  `isSourceTargetValid`/`performSourceAction` need both, but threading
   *  them as extra params through the whole `pursueNeeds` call chain would
   *  duplicate what `update()` already receives. `tickGrassForage` is
   *  `undefined` for any caller that doesn't pass one (tests, a species with
   *  no `def.diet`), in which case grass-patch selection is simply skipped. */
  private tickNowDays = 0
  private tickGrassForage: GrassForageService | undefined
  /** Spontaneous ambient vocalization timer (plan settlements-npcs-004 §1) —
   *  seeded per-instance in the constructor, ticked in `update()` via
   *  `tickSpontaneousVocalizeCooldown`. `Infinity` (and never fires) for any
   *  kind without a configured vocalization. */
  private spontaneousVocalizeCooldownSec: number

  constructor(deps: AnimalAgentDeps) {
    const {
      def,
      animalId,
      sampleHeight,
      waterLevel,
      sampleLocalWater,
      collidersNear,
      x,
      z,
      visual,
      animations = [],
      wanderRadius,
      sampleForestFactor,
      ownerHouseId,
      onDeath,
      herdId,
      lifeStage = 'adult',
      motherId,
      household,
      spawnPointId,
    } = deps
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
    this.sampleLocalWater = sampleLocalWater
    this.collidersNear = collidersNear
    this.sampleForestFactor = sampleForestFactor
    this.home.set(x, 0, z)
    this.wanderRadius = wanderRadius ?? def.roaming ?? DEFAULT_WANDER_RADIUS
    this.health = createHealthState(MAX_HP[def.kind])
    this.life = createAnimalLifeState(Math.random(), def.metabolism)
    this.spontaneousVocalizeCooldownSec = initialSpontaneousVocalizeCooldownSec(def.kind)

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

    // Prefer skinned model root (child of wrap) so clip bindings resolve.
    const animRoot = this.mesh.children[0] ?? this.mesh
    this.anim = createAgentAnimationSet<AnimalAnimClip>(animRoot, animations)
    this.anim.resolve({
      idle: ['Idle', 'Idle_2'],
      walk: ['Walk'],
      gallop: ['Gallop'],
      // Predators export `Attack`; deer/stag/horse/donkey export
      // `Attack_Headbutt`/`Attack_Kick` instead (plan npc-009) — first match
      // wins, same "smallest existing-compatible name" idiom as Idle/Idle_2.
      attack: ['Attack', 'Attack_Headbutt'],
      // Wolf/fox/deer/stag export `Idle_HitReact1`; horse/donkey export
      // `Idle_HitReact_Left` instead.
      hurt: ['Idle_HitReact1', 'Idle_HitReact_Left'],
      death: ['Death'],
    })
    this.anim.playImmediate('idle')

    // Bars seed at 100% (`createLabelBar`'s own default) rather than this
    // individual's actual starting satiety/hydration — a one-frame cosmetic
    // difference from the pre-adoption hand-rolled version, corrected by
    // the first real `sync()` call in `tickPresentationAndLife()` (plan
    // fauna-017 step 4c).
    this.labelController = createAgentStatusLabelController(
      ANIMAL_LABELS[def.kind],
      ['hp', 'stamina', 'satiety', 'hydration'],
      this.labelHeight(),
    )
    this.mesh.add(this.labelController.label)

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
    this.labelController.label.position.y = this.labelHeight()
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
    disposeAnimalCorpse(this.corpse)
    this.labelController.dispose()
    this.anim.stopAll()
    this.debugVisual?.dispose()
    this.debugVisual = null
  }

  isDead(): boolean {
    return this.health.dead
  }

  /** True for any live animal whose `def` carries a `mount` config (plan
   *  fauna-003 §5) — species-agnostic: horse and donkey qualify today purely
   *  through data, no kind check here. */
  isMountable(): boolean {
    return this.def.mount !== undefined && !this.health.dead
  }

  isMounted(): boolean {
    return this.mounted
  }

  /** This tick's gait, as last set by `driveMounted()`/`update()` — read by
   *  the riding system's stability check instead of recomputing it. */
  isSprinting(): boolean {
    return this.sprinting
  }

  /** Enters/exits ridden state (plan fauna-003 §5). The riding system is the
   *  sole caller; `update()` early-returns while `mounted` (see its own
   *  comment) and `driveMounted()` takes over movement/bookkeeping instead. */
  setMounted(mounted: boolean): void {
    this.mounted = mounted
    if (!mounted) {
      this.moving = false
      this.sprinting = false
      this.updateAnim()
    }
  }

  /** World-space seat transform for this animal's `def.mount` point (plan
   *  fauna-003 §6) — `null` if this animal has no `mount` config at all
   *  (callers are expected to have already checked `isMountable()`). */
  mountSeatTransform(): { x: number, y: number, z: number, yaw: number } | null {
    const cfg = this.def.mount
    if (!cfg) return null
    const yaw = this.mesh.rotation.y
    return {
      x: this.mesh.position.x + Math.sin(yaw) * cfg.seatForwardOffset,
      y: this.mesh.position.y + cfg.seatHeight,
      z: this.mesh.position.z + Math.cos(yaw) * cfg.seatForwardOffset,
      yaw,
    }
  }

  /** Per-frame mounted movement — the "shared riding system" driving both
   *  horse and donkey generically (plan fauna-003 §5/§6). Called by the
   *  riding system instead of `update()` while `mounted`; shares
   *  `update()`'s own tick tail via `tickPresentationAndLife()` (plan
   *  fauna-017 step 3 / D2), minus `clampBounds()` — a ridden mount must be
   *  able to go wherever the player takes it, not stay within its home
   *  wander radius. `wishX`/`wishZ` is the player's raw (not necessarily
   *  normalized) movement intent in world space, same convention as
   *  `PlayerController`'s own `wish` vector. `speedMultiplier` (plan
   *  fauna-008, default 1) scales only this player-driven path — the caller
   *  resolves it from the rider's Riding skill (`PlayerSkills.ts`'s
   *  `ridingSpeedMultiplier`); `AnimalAgent` itself stays unaware of player
   *  skills and free-roaming AI movement (`walkSpeedNow()`/`sprintSpeedNow()`
   *  call sites elsewhere) is unaffected. `dayFactor`/`observerPos` (plan
   *  fauna-017 step 3, D2) default to "day"/this animal's own position so
   *  every pre-existing caller/test that doesn't pass them keeps prior
   *  behaviour; the real riding call site (`mountActions.ts`) passes the
   *  same values `update()`'s own callers already thread through — see
   *  `this.isNight`'s field doc for why it can't just be read here instead:
   *  it's stale while mounted (`update()` early-returns before setting it). */
  driveMounted(
    dt: number,
    wishX: number,
    wishZ: number,
    sprintRequested: boolean,
    speedMultiplier = 1,
    dayFactor = 1,
    observerPos: THREE.Vector3 = this.mesh.position,
  ): void {
    if (this.health.dead) return

    const distSq = wishX * wishX + wishZ * wishZ
    this.moving = distSq > 1e-6
    this.sprinting = this.moving && sprintRequested && !isExhausted(this.life.stamina)
    this.isNight = dayFactor <= 0

    if (this.moving) {
      const dist = Math.sqrt(distSq)
      const dirX = wishX / dist
      const dirZ = wishZ / dist
      this.mesh.rotation.y = Math.atan2(dirX, dirZ)

      const mount = this.def.mount
      if (!mount) return

      const speed = (this.sprinting ? mount.sprintSpeed : mount.walkSpeed) * speedMultiplier

      const result = stepWithSlopeAndCollision({
        x: this.mesh.position.x,
        z: this.mesh.position.z,
        dirX,
        dirZ,
        speed,
        dt,
        sampleHeight: this.sampleHeight,
        isWalkable: (x, z) => this.isWalkable(x, z),
      })
      this.mesh.position.x = result.x
      this.mesh.position.z = result.z
    }

    this.tickPresentationAndLife(
      dt,
      observerPos,
      this.isNight && !this.sprinting ? SLEEP_HUNGER_THIRST_RATE : 1,
    )
  }

  /** The per-tick tail every movement mode shares (plan fauna-017 step 3,
   *  D2 fix) — timer decrements, maturity/production, position snap,
   *  animation, water traversal, drowning, needs, bars, label distance
   *  state, mixer. `hungerThirstRate` is the one genuine caller difference
   *  (night slowdown does not apply while sprinting); `nowDays` only
   *  matters for `tickProduction()` and defaults to 0 (harmless: no
   *  mountable species has a `production` config today, so `driveMounted()`
   *  calling this with the default is inert, not a behaviour change).
   *  `clampBounds()` stays out — the one documented, intentional
   *  difference: a ridden animal must be able to leave its own home
   *  radius. Before this method, `driveMounted()` skipped every timer
   *  decrement and `tickMaturity`/`tickProduction` entirely, and always
   *  passed `{}` (rate 1) instead of the real night rate — a ridden animal
   *  starved/dehydrated at double the stabled rate at night, and a hit
   *  mount's hurt-clip timer never counted down until dismount. */
  private tickPresentationAndLife(dt: number, observerPos: THREE.Vector3, hungerThirstRate: number, nowDays = 0): void {
    if (this.attackCooldown > 0) this.attackCooldown -= dt
    if (this.attackAnimTimer > 0) this.attackAnimTimer -= dt
    if (this.hurtAnimTimer > 0) this.hurtAnimTimer -= dt
    if (this.alertTimer > 0) this.alertTimer -= dt
    if (this.provokedTimer > 0) this.provokedTimer -= dt
    if (this.sourceSearchCooldown > 0) this.sourceSearchCooldown -= dt
    if (this.howlPauseTimer > 0) this.howlPauseTimer -= dt
    if (this.vocalizeAlertRemainingSec > 0) this.vocalizeAlertRemainingSec -= dt
    this.tickMaturity(dt)
    this.tickProduction(nowDays)
    this.snapY()
    this.updateAnim()
    this.resolveWaterTraversal()
    this.tickDrowning(dt)
    tickAnimalLife(this.life, dt, this.sprinting, { hungerThirstRate }, this.def.metabolism, this.swimExertionNow())
    // Satiety / hydration are inverted needs (full bar = well fed/hydrated),
    // so they're fed as `{ current: 1 - need, max: 1 }` rather than a
    // current/max pair from `AnimalLifeState` directly.
    this.labelController.sync(
      {
        hp: { current: this.health.currentHp, max: this.health.maxHp },
        stamina: { current: this.life.stamina.current, max: this.life.stamina.max },
        satiety: { current: 1 - this.life.hunger, max: 1 },
        hydration: { current: 1 - this.life.thirst, max: 1 },
      },
      this.mesh,
      this.mesh.position.distanceTo(observerPos),
      FAUNA_SHADOW_DISTANCE,
    )
    this.anim.update(dt)
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
    this.labelController.setName(`Groźny ${ANIMAL_LABELS[this.def.kind]}`)
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

  /** True once this animal has been infected with rabies (plan fauna-001) —
   *  stays true through death, since the same instance is also this
   *  animal's corpse for the rest of its linger lifetime. */
  isRabid(): boolean {
    return this.rabid
  }

  /** Marks this animal infected with rabies (plan fauna-001). No incubation
   *  period: the very next `update()` tick already uses rabid behavior
   *  (`updateRabid`). Idempotent. */
  infectWithRabies(): void {
    this.rabid = true
  }

  /** True while this predator's latest throttled decision is `attack`
   *  (player or, when frenzied, a noticed NPC) — see `threateningHuman`'s
   *  field doc. `NpcAgent`'s bounded local threat perception reads this
   *  through a caller-built candidate list, never by importing `AnimalAgent`
   *  logic itself. */
  isThreateningHuman(): boolean {
    return this.threateningHuman
  }

  /** Read-only view of this predator's currently-committed NPC attack target
   *  (plan fauna-011 §9) — lets guard/threat-perception logic (a household
   *  dog's `resolveGuardTarget()`) identify *who* a wolf is attacking without
   *  inferring an attack from proximity alone, and without duplicating
   *  `npcTarget` itself. `null` for a non-predator, or a predator with no
   *  currently-committed NPC target (attacking the player instead, or
   *  nothing at all). */
  get npcAttackTarget(): { npcId: string, homeId?: string } | null {
    return this.npcTarget ? { npcId: this.npcTarget.id, homeId: this.npcTarget.homeId } : null
  }

  /** Read-only "is this predator currently committed to a live attack
   *  target" — either an animal (`preyTarget`) or an NPC (`npcTarget`),
   *  whichever this predator actually has right now (plan fauna-012 §6/§8:
   *  the combat/threat-perception input nearby prey/domestic animals read,
   *  reusing these two pre-existing live-target fields rather than a second
   *  combat-target store). Always `false` for a non-predator. */
  get isHuntingLive(): boolean {
    return this.preyTarget !== null || this.npcTarget !== null
  }

  /** Read-only "did this animal vocalize recently, and from where" (plan
   *  fauna-011 §8, generalized in fauna-012 §4/§7 with a `context` tag) —
   *  the stimulus a nearby dog's `resolveBarkStimulus()` (wolf howls) and a
   *  nearby prey/domestic animal's `resolveAlertThreat()` (howls and alert
   *  barks) both read directly off `others`/`nearbyPredators`, independent
   *  of WebAudio/camera/player presence. `null` once
   *  `vocalizeAlertRemainingSec` has decayed. */
  get recentVocalizeAlert(): { x: number, z: number, kind: AnimalKind, context: 'ambient' | 'alert' } | null {
    return this.vocalizeAlertRemainingSec > 0
      ? { x: this.mesh.position.x, z: this.mesh.position.z, kind: this.def.kind, context: this.vocalizeAlertContext }
      : null
  }

  /** Player-fed compatible diet item (plan fauna-011 §6) — generic seam for
   *  any species with `def.diet.items`, not dog-specific (`findFoodTarget()`/
   *  `performSourceAction()` already gate their own autonomous feeding the
   *  same way). Applies hunger relief at the item's configured diet scale;
   *  does not touch inventory — `gameLoop.ts` calls `Inventory.remove()`
   *  itself only after this returns `true`, so an incompatible item is never
   *  consumed. */
  feedByPlayer(itemKind: ItemKind): boolean {
    const relief = this.def.diet?.items?.[itemKind]
    if (relief == null) return false
    consumeFood(this.life, relief)
    return true
  }

  /** Toggles the gaze-highlight glow on this animal's label. Idempotent — no
   *  redundant DOM writes if the state doesn't actually change. */
  setHighlighted(active: boolean): void {
    if (this.highlighted === active) return
    this.highlighted = active
    this.labelController.el.classList.toggle('npc-label--highlighted', active)
  }

  /** DevTools runtime debug entry point (fauna debug tooling — see
   *  `debug/faunaInspector.ts`'s `getNextFrenzyWolf()`/`getCurrentFrenzyWolf()`
   *  and this file's `AnimalAgentDebugInfo`/`FaunaAiBranch` docs). Sets the
   *  highlight (reuses `setHighlighted()`, no parallel indicator) and
   *  activates a lightweight world-space overlay (`animalDebugVisual.ts`)
   *  showing the current steering destination, strategic-village marker and
   *  any in-flight nav-rescue waypoints — updated every `update()` tick
   *  while active. Idempotent; a no-op once already active for this agent.
   *  Lazily creates the overlay under `this.mesh.parent` (the scene, already
   *  set by the time any caller could reach a live `AnimalAgent`). */
  showDebug(): void {
    this.setHighlighted(true)
    this.debugActive = true
    if (!this.debugVisual && this.mesh.parent) {
      this.debugVisual = createAnimalDebugVisual(this.mesh.parent)
    }
  }

  /** Tears down `showDebug()`'s overlay. Does not clear the highlight —
   *  that's owned by whatever selected this agent
   *  (`debug/faunaInspector.ts`'s `getNextFrenzyWolf()`), not by the debug
   *  overlay itself, so hiding the detail view doesn't lose track of which
   *  wolf is currently selected. Idempotent. */
  hideDebug(): void {
    this.debugActive = false
    this.debugVisual?.dispose()
    this.debugVisual = null
  }

  toggleDebug(): void {
    if (this.debugActive) this.hideDebug()
    else this.showDebug()
  }

  private navDebugInfo(nav: NavRescue): FaunaNavRescueDebugInfo {
    const current = nav.waypoints[nav.index] ?? null
    return {
      active: nav.active,
      waypointCount: nav.waypoints.length,
      currentWaypointIndex: nav.index,
      currentWaypoint: current ? { x: current.x, z: current.z } : null,
      rescueStage: nav.watchdog.rescueStage,
      lowProgressStrikes: nav.watchdog.lowProgressStrikes,
    }
  }

  /** Serializable diagnostic snapshot — see `AnimalAgentDebugInfo`'s doc for
   *  what each field answers. Safe for `console.log`/`console.table`: plain
   *  data only, no `THREE.Object3D`/mesh references. */
  getDebugInfo(): AnimalAgentDebugInfo {
    const village = this.strategicVillage
    const usesStrategicDest = this.debugBranch === 'frenzy-beeline'
      || this.debugBranch === 'npc-attack-frenzied'
      || this.debugBranch === 'npc-attack'
    return {
      animalId: this.animalId,
      kind: this.def.kind,
      frenzied: this.frenzied,
      rabid: this.rabid,
      dead: this.health.dead,
      position: { x: this.mesh.position.x, y: this.mesh.position.y, z: this.mesh.position.z },
      home: { x: this.home.x, z: this.home.z },
      moving: this.moving,
      sprinting: this.sprinting,
      lastStepDistance: this.debugLastStepDist,
      aiBranch: this.debugBranch,
      behaviourCandidates: this.lastFaunaDecisionInput ? scoreFaunaBehaviours(this.lastFaunaDecisionInput) : null,
      intent: this.pendingAction?.kind ?? null,
      threateningHuman: this.threateningHuman,
      health: { current: this.health.currentHp, max: this.health.maxHp },
      stamina: { current: this.life.stamina.current, max: this.life.stamina.max },
      strategicVillage: village ? { x: village.x, z: village.z, radius: village.radius } : null,
      strategicDest: usesStrategicDest
        ? { x: this.strategicDest.x, y: this.strategicDest.y, z: this.strategicDest.z }
        : null,
      distanceToStrategicVillage: village
        ? Math.hypot(this.mesh.position.x - village.x, this.mesh.position.z - village.z)
        : null,
      distanceToStrategicDest: usesStrategicDest
        ? Math.hypot(this.mesh.position.x - this.strategicDest.x, this.mesh.position.z - this.strategicDest.z)
        : null,
      frenzyVillageArrivalRadius: FRENZY_VILLAGE_ARRIVAL_RADIUS,
      arrivedAtStrategicVillage: this.arrivedAtStrategicVillage(),
      npcTarget: this.npcTarget
        ? { id: this.npcTarget.id, x: this.npcTarget.x, z: this.npcTarget.z }
        : null,
      positionWalkable: this.isWalkable(this.mesh.position.x, this.mesh.position.z),
      strategicDestWalkable: usesStrategicDest
        ? this.isWalkable(this.strategicDest.x, this.strategicDest.z)
        : null,
      chaseNav: this.navDebugInfo(this.chaseNav),
      fleeNav: this.navDebugInfo(this.fleeNav),
      ownerHouseId: this.ownerHouseId ?? null,
      dogGuard: this.dogGuardTarget
        ? { protectedNpcId: this.dogGuardTarget.protectedNpcId, ownHousehold: this.dogGuardTarget.ownHousehold }
        : null,
      dogVocalizeStimulus: this.lastBarkStimulus,
      preyAlertThreat: this.lastPreyAlertThreat,
      foodTarget: this.sourceTarget?.kind === 'carcass'
          && this.sourceTarget.corpsePhase != null
          && this.sourceTarget.foodValue != null
          && this.sourceTarget.score != null
        ? {
            corpsePhase: this.sourceTarget.corpsePhase,
            foodValue: this.sourceTarget.foodValue,
            score: this.sourceTarget.score,
            riskPenalty: 0,
          }
        : null,
      lureTarget: this.lureTarget
        ? { trapId: this.lureTarget.trapId, x: this.lureTarget.x, z: this.lureTarget.z, baitKind: this.lureTarget.baitKind }
        : null,
      presentation: {
        current: this.hurtAnimTimer > 0 ? 'hurt' : this.attackAnimTimer > 0 ? 'attack' : null,
        hasAttackClip: this.anim.has('attack'),
        hasHurtClip: this.anim.has('hurt'),
        hasDeathClip: this.anim.has('death'),
      },
    }
  }

  /** Plain-data snapshot of this individual's authoritative state (plan
   *  persistence-001) — see `AnimalSaveState`'s doc. `livestock.ts` pairs
   *  this with `animalId`/`kind`/`ownerHouseId` for `SaveData`. */
  snapshot(): AnimalSaveState {
    return {
      x: this.mesh.position.x,
      z: this.mesh.position.z,
      yaw: this.mesh.rotation.y,
      health: { current: this.health.currentHp, max: this.health.maxHp, dead: this.health.dead },
      // Persisted as a ratio, not the raw scalar (plan fauna-010 §2) — species
      // now have different `staminaCapacity`, so the raw current value alone
      // can't round-trip correctly across a species whose capacity changed
      // between save and load. Every pre-existing save's max was exactly 1,
      // so its stored value already *was* this ratio — see `hydrate()`.
      life: { hunger: this.life.hunger, thirst: this.life.thirst, stamina: getStaminaRatio(this.life.stamina) },
      productionReadyAtDays: this.productionReadyAtDays,
      eggPending: this.eggPending,
      corpse: this.health.dead
        ? { timeSinceDeath: this.corpse.timeSinceDeath, meatHarvested: this.corpse.meatHarvested }
        : null,
    }
  }

  /** Restores authoritative state from a save (plan persistence-001) — call
   *  once, immediately after construction and before this agent's first real
   *  `update()` tick, so no default/random state (`Math.random()`-seeded
   *  `life`/production stagger) can influence simulation first. Position/yaw
   *  override the deterministic spawn point; `y` is still resolved from live
   *  terrain (`snapY()`), never persisted. A dead individual's presentation
   *  (tipped pose, or hidden + harvested-remains mesh) is re-derived directly
   *  here; natural corpse-decay presentation (tint/bones) self-corrects on
   *  the next `update()` tick from the restored `timeSinceDeath` — see
   *  `advanceAnimalCorpse()`. Never reports `onDeath` — that already fired,
   *  before this save was taken. */
  hydrate(state: AnimalSaveState): void {
    this.mesh.position.x = state.x
    this.mesh.position.z = state.z
    this.mesh.rotation.y = state.yaw
    this.snapY()
    this.health.currentHp = state.health.current
    this.health.maxHp = state.health.max
    this.health.dead = state.health.dead
    this.life.hunger = state.life.hunger
    this.life.thirst = state.life.thirst
    // `state.life.stamina` is a ratio (see `snapshot()`'s doc) — scale by
    // this individual's own species capacity, not assign as a raw scalar.
    this.life.stamina.current = state.life.stamina * this.life.stamina.max
    this.productionReadyAtDays = state.productionReadyAtDays
    this.eggPending = state.eggPending
    if (state.corpse) {
      this.corpse.timeSinceDeath = state.corpse.timeSinceDeath
      this.corpse.meatHarvested = state.corpse.meatHarvested
      this.anim.stopAll()
      if (this.corpse.meatHarvested) {
        hideLivingVisual(this)
        void spawnHarvestedRemains(this.corpse, this)
        this.labelController.el.style.display = 'none'
      } else if (this.anim.has('death')) {
        // Plan fauna-017 step 4b: settle on the death clip's own final pose
        // (same as a live `collapse()`) instead of always manually tipping
        // the corpse — only species/packs with no death clip fall back to
        // the manual tip below.
        this.anim.settleAtEnd('death')
      } else {
        const side = Math.random() < 0.5 ? 1 : -1
        this.mesh.rotation.z = side * (Math.PI / 2)
        this.mesh.position.y += this.isCapsule ? 0.2 * this.def.scale : this.def.modelHeight * 0.3
      }
      this.labelController.settleAtZeroHp()
    }
  }

  /** True once a dead agent's corpse has lingered long enough to be disposed. */
  readyToRemove(): boolean {
    return corpseReadyToRemove(this.corpse, this.health.dead)
  }

  /** Minimal deterministic time-skip catch-up (plan 196) — called once by
   *  `Fauna.resolveTimeSkip` on `skip.justFinished`, never per-frame.
   *  Deliberately does **not** replay movement/behaviour/combat/corpse-FX —
   *  `update()` itself is gated off entirely while a skip is active (see
   *  `gameLoop.ts`), so this only advances the two purely-additive, linear
   *  pieces of state that must still reflect the skipped World Time exactly
   *  once: a live agent's hunger/thirst/stamina (`tickAnimalLife` is pure
   *  math, safe to call once with a large `elapsedSeconds` instead of many
   *  small steps), and a corpse's `timeSinceDeath` — bumping that alone is
   *  enough, because the very next normal `update()` call recomputes
   *  `corpsePhaseFromElapsed`/`readyToRemove()` fresh and will apply the
   *  right tint/bones/removal itself, with no separate visual catch-up
   *  needed here. */
  resolveTimeSkip(elapsedSeconds: number): void {
    if (this.health.dead) {
      if (!this.corpse.held) this.corpse.timeSinceDeath += elapsedSeconds
      return
    }
    tickAnimalLife(this.life, elapsedSeconds, false, {}, this.def.metabolism)
  }

  /** Player shovel-bury: mark corpse for disposal on the next fauna/settlement
   *  tick. Also stops natural decay immediately (plan 188) — a buried corpse
   *  must never later produce a natural bones pile. */
  bury(): void {
    if (!this.health.dead) return
    buryCorpse(this.corpse)
  }

  /** Plan 106/188 — a dead, not-yet-harvested, unburied corpse can yield
   *  `raw_meat`, but only while still `fresh`: once natural decay has moved
   *  it into `rotting`/`bones`, the meat is a lost source (plan 188 follow-up). */
  canHarvestMeat(): boolean {
    return canHarvestMeatFrom({
      dead: this.health.dead,
      meatHarvested: this.corpse.meatHarvested,
      buried: this.corpse.buried,
      corpsePhase: this.corpse.phase,
    })
  }

  /** Player knife-harvest: marks this corpse's meat as taken and swaps the
   *  living mesh for harvested remains (plan 137/138). State/TTL is
   *  synchronous; the GLB pile attaches asynchronously like the blood splat.
   *  Once only — callers check `canHarvestMeat()` first, but this re-checks
   *  it itself as the final invariant guard (plan 188 follow-up), since a
   *  corpse can rot between a caller's check and this call (e.g. across a
   *  multi-second harvest channel). */
  harvestMeat(): void {
    if (!this.canHarvestMeat()) return
    harvestCorpseMeat(this.corpse, this)
    this.mesh.rotation.z = 0
    this.snapY()
    this.labelController.el.style.display = 'none'
  }

  /** Pin this corpse for the duration of a player harvest channel. Linger
   *  does not advance and `readyToRemove()` stays false until `releaseCorpseHold`. */
  holdCorpse(): void {
    if (!this.health.dead) return
    this.corpse.held = true
  }

  releaseCorpseHold(): void {
    this.corpse.held = false
  }

  /** `source: 'npc'` (plan 177) is another human attacker, same provocation
   *  reaction as `'player'` — this is the existing predator-vs-human decision
   *  reacting to being hit, not a new NPC-aware animal behaviour. */
  takeDamage(damage: number, source?: 'npc' | 'player'): void {
    if (this.health.dead) return
    damageHealth(this.health, damage)
    if (damage > 0) recordBloodHit(this.mesh.position.x, this.mesh.position.z, this.def.modelHeight, damage)
    if (source === 'player' || source === 'npc') {
      this.provokedTimer = PROVOCATION_SECONDS
      // Force an immediate re-score so healthy wolves can retaliate this frame.
      this.humanDecisionTimer = 0
      this.npcDecisionTimer = 0
    }
    if (this.health.dead) {
      this.collapse()
    } else if (damage > 0) {
      // Hurt presentation lives right after real damage is resolved (plan
      // npc-009) — never from attack intent alone, so a miss never triggers
      // a flinch. Player-sourced hits already have their own hit/kill sound
      // at the attacker's call site (`gameLoop.ts`) — this is animation only.
      this.hurtAnimTimer = this.anim.playOnce('hurt')
    }
  }

  /** Death presentation: plays the GLB's own `Death` clip when the species
   *  has one (plan npc-009); falls back to tipping the corpse onto its side
   *  (relative to its facing direction) for species/packs with no such clip
   *  (sheep, chicken, bear, capsule fallback) instead of leaving it frozen
   *  standing up. */
  private collapse(): void {
    this.onDeath?.(this.animalId)
    if (this.anim.has('death')) {
      this.deathAnimDurationSec = this.anim.playOnce('death')
    } else {
      this.anim.stopAll()
      const side = Math.random() < 0.5 ? 1 : -1
      this.mesh.rotation.z = side * (Math.PI / 2)
      this.mesh.position.y += this.isCapsule ? 0.2 * this.def.scale : this.def.modelHeight * 0.3
    }
    this.labelController.settleAtZeroHp()
    void spawnDeathSplat(this.corpse, this)
  }

  /** Current natural-decay phase (plan 188) — `'fresh'` for the lifetime of
   *  a harvested or buried corpse, see `AnimalCorpseState.phase`'s field doc. */
  corpsePhase(): CorpsePhase {
    return this.corpse.phase
  }

  /** Advances the natural (unharvested, unburied) corpse decay lifecycle —
   *  simulation truth (phase/timers/proximity effect) always runs; only the
   *  FX presentation is distance-gated (plan 188 §6/§10). No-op once the
   *  corpse has left this path via `harvestMeat()`/`bury()`. */
  private advanceCorpseDecay(dt: number, others: readonly AnimalAgent[], observerPos: THREE.Vector3): void {
    advanceAnimalCorpse(this.corpse, this, dt, this.rabid, others, observerPos)
  }

  /** Lazily seeds `productionReadyAtDays` on the very first real tick — a
   *  no-op for any kind without `def.production`, and a no-op once already
   *  seeded (every later call just falls through to the readiness checks
   *  below, which compare `nowDays` directly against the stored anchor; see
   *  `livestockProduction.ts`'s module doc for why this needs no per-frame
   *  work). Mirrors `tickMaturity`'s call site. */
  private tickProduction(nowDays: number): void {
    const production = this.def.production
    if (!production || this.productionReadyAtDays !== null) return
    this.productionReadyAtDays = initialLivestockProductionReadyAtDays(nowDays, production.intervalDays, Math.random())
  }

  /** True the instant this chicken's current cycle is done and no egg is
   *  already waiting to be picked up — `createSettlement.ts`'s livestock
   *  loop checks this once per frame per chicken and, if true, drops a real
   *  `egg` world item and calls `markEggLaid()` (plan fauna-002 §2). */
  readyToLayEgg(nowDays: number): boolean {
    return this.def.production?.product === 'egg' && !this.eggPending
      && livestockProductionReady(this.productionReadyAtDays, nowDays)
  }

  /** Marks this cycle's egg as dropped into the world — blocks
   *  `readyToLayEgg()` until `notifyEggCollected()` fires. */
  markEggLaid(): void {
    this.eggPending = true
  }

  /** Called once, when the world item this chicken laid is actually picked
   *  up (`items/createDroppedItems.ts`'s `onCollected` hook) — starts the
   *  next production cycle. */
  notifyEggCollected(nowDays: number): void {
    this.eggPending = false
    const intervalDays = this.def.production?.intervalDays ?? 0
    this.productionReadyAtDays = nextLivestockProductionReadyAtDays(nowDays, intervalDays)
  }

  /** True while a `cow`/`sheep`'s milking cooldown has cleared — gates the
   *  player's `[E] Wydój` action (`app/actions/survivalActions.ts`'s
   *  `startMilkAnimal`). */
  canBeMilked(nowDays: number): boolean {
    return this.def.production?.product === 'milk' && livestockProductionReady(this.productionReadyAtDays, nowDays)
  }

  /** Called once a milking action actually completes — starts the next
   *  cooldown (plan fauna-002 §3/§4). */
  startMilkCooldown(nowDays: number): void {
    const production = this.def.production
    if (!production || production.product !== 'milk') return
    this.productionReadyAtDays = nextLivestockProductionReadyAtDays(nowDays, production.intervalDays)
  }

  update(ctx: AnimalUpdateContext): void {
    const {
      dt,
      others,
      observerPos,
      dayFactor,
      forestFactor,
      litFires,
      villages = [],
      nearbyHumanCount = 1,
      onHumanHit,
      playerStealth = { sneakValue: 0, sneakActive: false, movement: 'stationary' },
      nearbyNpcs = [],
      onNpcHit,
      onAggro,
      onVocalize,
      nowDays = 0,
      timeOfDay = 0.5,
      grassForage,
      nearbyPredators = [],
      nearbySettlementNpcs = [],
      lures = [],
      nearbyRats = [],
    } = ctx
    if (this.health.dead) {
      if (!this.corpse.held) {
        this.corpse.timeSinceDeath += dt
        this.advanceCorpseDecay(dt, others, observerPos)
      }
      // Keep the mixer advancing only long enough for the one-shot death
      // clip to actually play (plan npc-009) — `null` when there was no clip
      // to play (manual tip fallback, no mixer work needed), so a
      // permanently dead animal never costs a per-frame mixer update for the
      // rest of the session.
      if (this.deathAnimDurationSec != null && this.corpse.timeSinceDeath < this.deathAnimDurationSec) {
        this.anim.update(dt)
      }
      this.lastFaunaDecisionInput = null
      return
    }
    // While ridden, `driveMounted()` (called by the riding system earlier
    // this same frame, before the fauna/settlement update pass reaches this
    // agent) already did this frame's movement/needs/animation/bookkeeping —
    // running the AI decision branch here too would fight player control and
    // double-tick life/needs (plan fauna-003 §5).
    if (this.mounted) {
      this.lastFaunaDecisionInput = null
      return
    }
    const vocalizeTick = tickSpontaneousVocalizeCooldown(
      this.def.kind,
      dt,
      this.spontaneousVocalizeCooldownSec,
      undefined,
      spontaneousVocalizeTimeWeight(this.def.kind, timeOfDay),
    )
    this.spontaneousVocalizeCooldownSec = vocalizeTick.cooldownSec
    // A howling wolf must not interrupt a chase/attack/flee already under way
    // (plan fauna-009 §1) — `pendingAction` still holds the previous tick's
    // resolved intent here, since this tick's own decision hasn't run yet.
    // A "denied" roll simply forfeits this window; the cooldown it already
    // redrew still stands, so the wolf gets another chance next cycle.
    const pursuitKind = this.pendingAction?.kind
    const wolfBusy = this.def.kind === 'wolf'
      && (pursuitKind === 'attack' || pursuitKind === 'chase' || pursuitKind === 'flee')
    if (vocalizeTick.fire && !wolfBusy) {
      onVocalize?.(this.def.kind, this.mesh.position.x, this.mesh.position.z)
      // No dedicated howl clip (plan fauna-009 non-goal) — fall back to a
      // brief `steerToward()` no-op instead, so the wolf visibly stops
      // instead of walking through its own howl.
      if (this.def.kind === 'wolf') this.howlPauseTimer = HOWL_PAUSE_SECONDS
      // Sim-state howl/crow/moo/cluck stimulus (plan fauna-011 §8, `ambient`
      // context per fauna-012 §4/§7) — independent of the `onVocalize`
      // presentation hook above, read by a nearby dog/prey/domestic animal
      // via `recentVocalizeAlert`.
      this.vocalizeAlertRemainingSec = VOCALIZE_ALERT_DURATION_SEC
      this.vocalizeAlertContext = 'ambient'
    }
    this.isNight = dayFactor <= 0
    this.moving = false
    this.sprinting = false
    // Diagnostic-only snapshot for `debugLastStepDist` (see its field doc) —
    // never read by movement/AI logic itself.
    const debugPrevX = this.mesh.position.x
    const debugPrevZ = this.mesh.position.z
    this.currentVillages = villages
    this.currentOthers = others
    this.tickNowDays = nowDays
    this.tickGrassForage = grassForage
    const sense = this.senseEnvironment(dt, observerPos, dayFactor, forestFactor, litFires, playerStealth)
    // Any predator can notice a nearby NPC (npc-008 step 6 — animal↔NPC
    // threat is a general predator behaviour, not something only a frenzied
    // animal does). `frenzied` no longer gates whether an NPC target is
    // resolved at all; it still forces the engagement via
    // `npc-attack-frenzied`, which skips scoring (`isBehaviourValid`).
    const npcThreat = this.def.role === 'predator'
      ? this.resolveNpcTarget(nearbyNpcs)
      : null
    // Dog-only guard perception (plan fauna-011 §9/§10) — a no-op read for
    // every other kind, computed once here so both the decision branch and
    // this tick's bark check (below) share the same resolved target.
    const guardTarget = this.def.kind === 'dog' ? this.resolveGuardTarget(nearbyPredators) : null
    this.dogGuardTarget = guardTarget

    if (this.rabid) {
      // Rabies bypasses normal predator/prey AI entirely, including
      // human/NPC/fire fear (plan fauna-001: "chore zwierzęta nie powinny
      // zachowywać normalnego lęku przed człowiekiem") — a rabid animal
      // never flees or considers human/NPC targets, it single-mindedly
      // chases the nearest live animal (see `updateRabid`).
      this.threateningHuman = false
      this.humanDecisionTimer = 0
      this.npcDecisionTimer = 0
      this.provokedTimer = 0
      this.debugBranch = 'rabid'
      this.lastFaunaDecisionInput = null
      this.updateRabid(dt, others)

    } else {
      // Throttled player-intent refresh (implementation notes F4), computed
      // before selection under exactly the old branch #2 guard so the
      // 0.2s cache window's timing is unchanged.
      const playerIntent = this.refreshThrottledHumanIntent(sense, observerPos, nearbyHumanCount, dt)
      // Live since npc-008 step 6: `npcThreat` can now be set for a
      // non-frenzied predator, so `npc-attack`/`npc-ignore`/`npc-flee`
      // (scored via `npcIntent`) are reachable. For a frenzied predator
      // `npcIntent` stays `null` (guard below), so `npc-attack-frenzied`
      // still wins first and skips scoring entirely.
      const npcIntent = this.refreshThrottledNpcIntent(npcThreat, nearbyNpcs, sense, dt)
      const decisionInput: FaunaDecisionInput = {
        role: this.def.role,
        frenzied: this.frenzied,
        playerActive: sense.playerActive,
        playerIntent,
        npcThreat: npcThreat !== null,
        npcIntent,
        fireNearby: sense.nearestFire !== null,
        hasStrategicVillage: this.strategicVillage !== null,
        arrivedAtStrategicVillage: this.arrivedAtStrategicVillage(),
        guardActive: guardTarget !== null,
      }
      this.lastFaunaDecisionInput = decisionInput
      const branch = decideFaunaBehaviour(decisionInput)
      this.debugBranch = branch
      switch (branch) {
        case 'dog-guard': {
          this.threateningHuman = false
          this.humanDecisionTimer = 0
          this.npcDecisionTimer = 0
          this.provokedTimer = 0
          this.updateDogGuard(dt, guardTarget!)
          break
        }
        case 'fire-avoid': {
          // `!this.frenzied` (enforced by `isBehaviourValid`): FIRE_AVOID_RADIUS
          // (11) is bigger than a wolf's NPC-notice radius (playerNoticeRange,
          // 10 — see senseNpcThreat), and a settlement's campfire sits right by
          // its buildings. Without this bypass a frenzied wolf gets
          // flee-repelled by the fire before it can ever notice an NPC
          // (npcThreat, above) or finish its village beeline
          // (moveTowardStrategicVillage, below) — it just oscillates outside
          // the fire radius, short of the village (plan 179 follow-up).
          // Mirrors the existing `this.frenzied` bypass in `pickPointNear()`.
          this.threateningHuman = false
          this.humanDecisionTimer = 0
          this.npcDecisionTimer = 0
          this.provokedTimer = 0
          this.cancelSourceTarget()
          this.setIntent('flee', { x: sense.nearestFire!.x, z: sense.nearestFire!.z })
          this.fleeFrom(sense.nearestFire!.x, sense.nearestFire!.z, dt)
          break
        }
        case 'frenzy-beeline': {
          this.threateningHuman = false
          this.humanDecisionTimer = 0
          this.npcDecisionTimer = 0
          this.provokedTimer = 0
          this.moveTowardStrategicVillage(dt)
          break
        }
        case 'npc-attack': {
          if (isNpcCombatDebugMode()) {
            console.log(
              '[NPC COMBAT] npcThreat ON',
              `wolf=${this.animalId}/${this.def.kind}`,
              `frenzy=${this.frenzied}`,
              `npcThreat=${npcThreat!.id}/${npcThreat!.id}`,
              `playerActive=${sense.playerActive}`,
            )
          }
          this.cancelSourceTarget()
          this.threateningHuman = true
          this.setIntent('attack', { x: npcThreat!.x, z: npcThreat!.z })
          this.chaseNpc(npcThreat!, dt, onNpcHit)
          break
        }
        case 'npc-attack-frenzied': {
          // No `cancelSourceTarget()` here — asymmetric with the other
          // branches on purpose (implementation notes F2, not fixed here).
          if (!this.threateningHuman && isNpcCombatDebugMode()) {
            console.log(
              '[NPC COMBAT] threat state ON',
              `wolf=${this.animalId}/${this.def.kind}`,
              `frenzy=${this.frenzied}`,
              `npcThreat=${npcThreat!.id}/${npcThreat!.id}`,
              `playerActive=${sense.playerActive}`,
            )
          }
          this.threateningHuman = true
          this.setIntent('attack', { x: npcThreat!.x, z: npcThreat!.z })
          this.chaseNpc(npcThreat!, dt, onNpcHit)
          break
        }
        case 'npc-flee': {
          if (isNpcCombatDebugMode()) {
            console.log(
              '[NPC COMBAT] npcThreat ON',
              `wolf=${this.animalId}/${this.def.kind}`,
              `frenzy=${this.frenzied}`,
              `npcThreat=${npcThreat!.id}/${npcThreat!.id}`,
              `playerActive=${sense.playerActive}`,
            )
          }
          this.cancelSourceTarget()
          this.threateningHuman = false
          this.setIntent('flee', { x: npcThreat!.x, z: npcThreat!.z })
          this.fleeFrom(npcThreat!.x, npcThreat!.z, dt)
          break
        }
        case 'npc-ignore': {
          if (isNpcCombatDebugMode()) {
            console.log(
              '[NPC COMBAT] npcThreat ON',
              `wolf=${this.animalId}/${this.def.kind}`,
              `frenzy=${this.frenzied}`,
              `npcThreat=${npcThreat!.id}/${npcThreat!.id}`,
              `playerActive=${sense.playerActive}`,
            )
          }
          this.cancelSourceTarget()
          this.threateningHuman = false
          this.setIntent('wander')
          this.wander(dt)
          break
        }
        case 'player-attack': {
          this.cancelSourceTarget()
          this.threateningHuman = true
          this.setIntent('attack', copyVec3(observerPos))
          this.chaseHuman(observerPos, dt, onHumanHit)
          break
        }
        case 'player-flee': {
          this.cancelSourceTarget()
          this.threateningHuman = false
          this.setIntent('flee', copyVec3(observerPos))
          this.fleeFrom(observerPos.x, observerPos.z, dt)
          break
        }
        case 'player-flee-prey': {
          this.cancelSourceTarget()
          this.threateningHuman = false
          this.setIntent('flee', copyVec3(observerPos))
          this.fleeFrom(observerPos.x, observerPos.z, dt)
          break
        }
        case 'player-ignore': {
          // A bold predator (bear, playtest fixes plan §3) noticing a distant,
          // non-threatening human just keeps doing what it was doing instead
          // of panicking — same "no reaction" shape as `updatePredator`'s
          // no-prey-found wander, not a new idle mechanic.
          this.cancelSourceTarget()
          this.threateningHuman = false
          this.setIntent('wander')
          this.wander(dt)
          break
        }
        case 'predator-normal': {
          this.threateningHuman = false
          this.humanDecisionTimer = 0
          this.npcDecisionTimer = 0
          this.provokedTimer = 0
          this.updatePredator(dt, others, lures)
          break
        }
        case 'prey-normal': {
          this.threateningHuman = false
          this.humanDecisionTimer = 0
          this.npcDecisionTimer = 0
          this.provokedTimer = 0
          this.updatePrey(dt, others, lures, nearbyPredators, nearbyRats)
          break
        }
      }

      // A frenzied predator can still expose itself as an NPC threat
      // while actively engaging the player.
      if (
        this.frenzied
        && npcThreat
        && (branch === 'player-attack' || branch === 'player-ignore'
          || branch === 'player-flee' || branch === 'player-flee-prey')
      ) {
        this.threateningHuman = true
      }
      if (this.def.kind === 'dog') {
        this.updateDogVocalization(dt, guardTarget, nearbyPredators, nearbySettlementNpcs, onVocalize)
      }
    }
    if (this.threateningHuman && !this.wasThreateningHuman) {
      onAggro?.(this.def.kind, this.mesh.position.x, this.mesh.position.z)
    }
    this.wasThreateningHuman = this.threateningHuman
    this.clampBounds()
    // Diagnostic-only — only reads x/z, so it doesn't depend on whether
    // `tickPresentationAndLife()`'s own `snapY()` has run yet (see
    // `debugLastStepDist`'s field doc).
    this.debugLastStepDist = Math.hypot(this.mesh.position.x - debugPrevX, this.mesh.position.z - debugPrevZ)
    this.tickPresentationAndLife(
      dt,
      observerPos,
      this.isNight && !this.sprinting ? SLEEP_HUNGER_THIRST_RATE : 1,
      nowDays,
    )
    if (this.debugActive && this.debugVisual) this.updateDebugVisual()
  }

  /** Feeds this tick's steering-relevant state to the `showDebug()` overlay
   *  — see `AnimalDebugVisualState`'s doc for why `strategicDest` is gated
   *  to the branches that actually steer toward it. `chaseNav`/`fleeNav` are
   *  mutually exclusive in practice (predator chase vs. flee), so showing
   *  whichever is currently `active` is enough; if neither is, there's no
   *  in-flight repath to draw. */
  private updateDebugVisual(): void {
    const usesStrategicDest = this.debugBranch === 'frenzy-beeline'
      || this.debugBranch === 'npc-attack-frenzied'
      || this.debugBranch === 'npc-attack'
    const nav = this.chaseNav.active ? this.chaseNav : this.fleeNav.active ? this.fleeNav : null
    this.debugVisual!.update({
      position: { x: this.mesh.position.x, z: this.mesh.position.z },
      sampleHeight: this.sampleHeight,
      strategicDest: usesStrategicDest ? { x: this.strategicDest.x, z: this.strategicDest.z } : null,
      strategicVillage: this.strategicVillage,
      waypoints: nav ? nav.waypoints : [],
      waypointIndex: nav ? nav.index : 0,
    })
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
    }
  }

  /** Throttled player-intent refresh (implementation notes F4) — decrements
   *  `humanDecisionTimer` and re-rolls `cachedHumanIntent`/`cachedAggressionRoll`
   *  only once it expires (`HUMAN_DECISION_INTERVAL_SEC`), under exactly the
   *  condition the old inline branch used (`sense.playerActive && role ===
   *  'predator'`). Returns `null` outside that condition — extracted
   *  verbatim from the pre-refactor branch #2 body so `decideFaunaBehaviour`
   *  can be fed the (still throttled) result before selection, without
   *  changing the cache's timing. */
  private refreshThrottledHumanIntent(
    sense: EnvironmentSense,
    observerPos: THREE.Vector3,
    nearbyHumanCount: number,
    dt: number,
  ): PredatorHumanIntent | null {
    if (!(sense.playerActive && this.def.role === 'predator')) return null
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
    return this.cachedHumanIntent
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
   *  §7/§8; generalized to every predator, not just a frenzied one, in
   *  npc-008 step 6) — deliberately no facing-cone/probability roll like the
   *  player's `isPlayerNoticed()`: a predator that's already committed to a
   *  target doesn't need stealth-grade perception of the humans nearby. A
   *  non-frenzied, non-wolf predator excludes candidates inside a village's
   *  avoidance radius (`isNearVillage`), mirroring `updatePredator`'s
   *  existing "live prey inside the village is not huntable" rule — a
   *  frenzied predator is explicitly willing to enter a village
   *  (`moveTowardStrategicVillage`), and a wolf (frenzied or not) can enter
   *  in pursuit of a real target (fauna-006, `canPursueIntoVillage()`), so
   *  either keeps considering every candidate. `nearbyNpcs` is
   *  caller-bounded (see `NearbyNpcCandidate`'s doc) but, since step 6
   *  dropped the frenzy-only gate, is now scanned by every loaded predator
   *  every tick — squared-distance compare (same idiom as
   *  `countNearbyHumans`) instead of `Math.hypot` keeps that scan cheap. */
  private senseNpcThreat(nearbyNpcs: readonly NearbyNpcCandidate[]): NearbyNpcCandidate | null {
    let best: NearbyNpcCandidate | null = null
    let bestDSq = this.def.playerNoticeRange * this.def.playerNoticeRange
    for (const npc of nearbyNpcs) {
      if (!this.canPursueIntoVillage() && this.isNearVillage(npc)) continue
      const dx = npc.x - this.mesh.position.x
      const dz = npc.z - this.mesh.position.z
      const dSq = dx * dx + dz * dz
      if (dSq < bestDSq) {
        bestDSq = dSq
        best = npc
      }
    }
    return best
  }

  /** Stable NPC target commitment (plan 179 follow-up; generalized to every
   *  predator in npc-008 step 6 — see `npcTarget`'s doc). Once locked onto
   *  an NPC, keeps returning that same NPC's latest position from
   *  `nearbyNpcs` every tick instead of re-running `senseNpcThreat`'s
   *  nearest-candidate scan, so `chaseNpc`/`fleeFrom` get a consistent
   *  destination. Only re-picks (via `senseNpcThreat`) once the locked
   *  target drops out of the caller-bounded `nearbyNpcs` list — dead
   *  (`gameLoop.ts` already filters `npc.health.dead`) or its settlement
   *  unloaded. Does not re-apply `playerNoticeRange` or the village
   *  exclusion once locked, so a predator keeps its target even if the
   *  target then wanders into a village (recorded as a follow-up, see
   *  `docs/plans/LOOSE-ENDS.md`). */
  private resolveNpcTarget(nearbyNpcs: readonly NearbyNpcCandidate[]): NearbyNpcCandidate | null {
    if (this.npcTarget) {
      const stillPresent = nearbyNpcs.find((npc) => npc.id === this.npcTarget!.id)
      if (stillPresent) {
        this.npcTarget = stillPresent
        return stillPresent
      }
      this.npcTarget = null
    }
    const found = this.senseNpcThreat(nearbyNpcs)
    if (found) this.npcTarget = found
    return found
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
      fireNearby: this.frenzied ? false : sense.fireNearby,
      nearbyHumanCount: crowd,
      kind: this.def.kind,
      selfHpRatio: hpRatio,
      provoked: this.provokedTimer > 0 || this.frenzied,
      aggressionRoll,
    })
  }

  /** Same throttled-refresh idiom as `refreshThrottledHumanIntent`, for the
   *  non-frenzied npc-threat path (`npc-attack`/`npc-ignore`/`npc-flee`,
   *  live since npc-008 step 6). Only engages when `npcThreat &&
   *  !this.frenzied` — a frenzied predator's `npcThreat` instead resolves
   *  via `npc-attack-frenzied`, which skips scoring entirely (implementation
   *  notes F1). Uses its own `npcDecisionTimer`/`cachedNpcIntent`/
   *  `cachedNpcAggressionRoll` rather than sharing
   *  `refreshThrottledHumanIntent`'s cache — step 6 means `sense.playerActive`
   *  and `npcThreat` can both be true in the same tick (predator sees player
   *  and NPC at once), and a shared cache would let whichever of the two
   *  refreshes runs second clobber the other's in-flight intent (see
   *  `npcDecisionTimer`'s doc). */
  private refreshThrottledNpcIntent(
    npcThreat: NearbyNpcCandidate | null,
    nearbyNpcs: readonly NearbyNpcCandidate[],
    sense: EnvironmentSense,
    dt: number,
  ): PredatorHumanIntent | null {
    if (!(npcThreat && !this.frenzied)) return null
    this.npcDecisionTimer -= dt
    if (this.npcDecisionTimer <= 0) {
      this.npcDecisionTimer = HUMAN_DECISION_INTERVAL_SEC
      this.cachedNpcAggressionRoll = Math.random()
      this.cachedNpcIntent = this.decideNpcResponse(npcThreat, nearbyNpcs, sense, this.cachedNpcAggressionRoll)
    }
    return this.cachedNpcIntent
  }

  /** True once a frenzied wolf is within `FRENZY_VILLAGE_ARRIVAL_RADIUS` of
   *  its `strategicVillage`'s actual center — see that constant's doc for
   *  why this replaced the old `isNearVillage` (outer footprint edge) check
   *  (plan 179 follow-up). `false` (never "arrived") if there's no
   *  strategic village, so callers still need their own null check. */
  private arrivedAtStrategicVillage(): boolean {
    const village = this.strategicVillage
    if (!village) return false
    return Math.hypot(
      this.mesh.position.x - village.x,
      this.mesh.position.z - village.z,
    ) < FRENZY_VILLAGE_ARRIVAL_RADIUS
  }

  /** Frenzied wolf beelines to its `strategicVillage`'s actual center — past
   *  the settlement's outer footprint and in among its buildings, not just
   *  up to the edge (see `FRENZY_VILLAGE_ARRIVAL_RADIUS`) — until it arrives
   *  or `update()`'s independently-evaluated `npcThreat` fires first (plan
   *  179 §3 — "kieruje się do wioski"). Not a new movement system — same
   *  `steerToward` primitive every other movement branch uses; building
   *  colliders (`isWalkable`) can still block/deflect the straight line, the
   *  same as any other mover. */
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
    this.attackAnimTimer = this.anim.playOnce('attack')
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
    onNpcHit?: (targetId: string, damage: number, attackerX: number, attackerZ: number, attackerAnimalId: string) => void,
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
    onNpcHit: (targetId: string, damage: number, attackerX: number, attackerZ: number, attackerAnimalId: string) => void,
  ): void {
    if (this.attackCooldown > 0) return
    if (isExhausted(this.life.stamina)) return
    this.attackCooldown = ATTACK_COOLDOWN
    this.attackAnimTimer = this.anim.playOnce('attack')
    drainStamina(this.life.stamina, ATTACK_STAMINA_COST)
    const { x, z } = this.mesh.position
    onNpcHit(
      targetId,
      damageVsHuman(this.def.kind) * (this.dangerous ? DANGEROUS_DAMAGE_MULTIPLIER : 1),
      x,
      z,
      this.animalId,
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
    this.stepNavRescue(this.fleeNav, this.fleeTarget, speed, dt)
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
   *  of any loaded settlement — used to make non-wolf wild predators give up
   *  a chase that runs into the village (plan 044 §2.4's "lis niechętnie
   *  wchodzi do bezpiecznego obszaru i może przerwać pościg"; a wolf is
   *  exempted from this via `canPursueIntoVillage()`, fauna-006) and to keep
   *  wild wander targets off settled ground for every wild species,
   *  including wolf. */
  private isNearVillage(pos: { x: number, z: number }): boolean {
    for (const v of this.currentVillages) {
      if (isWithinVillageRadius(pos, v, VILLAGE_AVOID_MARGIN)) return true
    }
    return false
  }

  /** Instance-bound wrapper around the pure `canPredatorPursueIntoVillage`
   *  (fauna-006) — see that function's doc. */
  private canPursueIntoVillage(): boolean {
    return canPredatorPursueIntoVillage(this.def.kind, this.frenzied)
  }

  private updatePredator(dt: number, others: AnimalAgent[], lures: readonly TrapLureDescriptor[]): void {
    const prey = this.resolvePreyTarget(others)
    if (prey && !this.canPursueIntoVillage() && this.isNearVillage(prey.mesh.position)) {
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
        this.stepNavRescue(this.chaseNav, prey.mesh.position, this.sprintSpeedNow(), dt)
      }
      return
    }
    if (this.pursueNeeds(dt, others)) return
    if (this.pursueLure(dt, lures)) return
    this.setIntent('wander')
    this.wander(dt)
  }

  /** Shared bite seam for both normal predator hunting (`updatePredator`)
   *  and rabid attacks on any species (`updateRabid`) — `target` is "prey"
   *  only in the predator case, so the parameter is named generically (plan
   *  fauna-001). */
  private attack(target: AnimalAgent): void {
    if (this.attackCooldown > 0) return
    if (isExhausted(this.life.stamina)) return
    this.attackCooldown = ATTACK_COOLDOWN
    this.attackAnimTimer = this.anim.playOnce('attack')
    drainStamina(this.life.stamina, ATTACK_STAMINA_COST)
    target.takeDamage(damageFor(this.def.kind, target.def.kind))
    if (this.rabid) this.tryRabiesBiteInfection(target)
  }

  /** Rabies bite transmission (plan fauna-001) — a single roll immediately
   *  after this bite's damage actually landed, gated on the target still
   *  being alive and not already infected. Never rolled from `chase`/mere
   *  contact, only from an actual `attack()` event. */
  private tryRabiesBiteInfection(target: AnimalAgent): void {
    if (target.health.dead || target.rabid) return
    if (rollsRabiesInfection(RABIES_BITE_INFECTION_CHANCE, Math.random())) target.infectWithRabies()
  }

  private updatePrey(
    dt: number,
    others: AnimalAgent[],
    lures: readonly TrapLureDescriptor[],
    nearbyPredators: readonly AnimalAgent[],
    nearbyRats: readonly AnimalAgent[] = [],
  ): void {
    const threat = this.nearest(others, 'predator', this.def.fleeRange)
    if (threat) {
      this.lastPreyAlertThreat = null
      this.cancelSourceTarget()
      this.setIntent('flee', copyVec3(threat.mesh.position))
      this.fleeFrom(threat.mesh.position.x, threat.mesh.position.z, dt)
      return
    }
    const alert = this.resolveAlertThreat(others, nearbyPredators)
    this.lastPreyAlertThreat = alert
    if (alert) {
      this.cancelSourceTarget()
      this.setIntent('flee', { x: alert.x, z: alert.z })
      this.fleeFrom(alert.x, alert.z, dt)
      return
    }
    if (this.pursueNeeds(dt, others)) return
    if (this.pursueLure(dt, lures)) return
    if (this.def.kind === 'dog' && this.pursuePest(dt, nearbyRats)) return
    this.setIntent('wander')
    this.wander(dt)
  }

  /** Idle pest-chase for a household dog (plan fauna-016 §9) — deliberately
   *  separate from `dogGuard.ts`'s wolf-defense contract (`resolveDogGuardTarget`,
   *  scored well above this at the top-level `decideFaunaBehaviour`): a rat
   *  is nuisance vermin, never a household threat. Only reached once guard/
   *  threat/needs/lure has already claimed nothing this tick, so it never
   *  competes with real household defense. Returns `true` when it consumed
   *  this tick's movement. */
  private pursuePest(dt: number, nearbyRats: readonly AnimalAgent[]): boolean {
    if (nearbyRats.length === 0) return false
    const candidates = nearbyRats.map((rat) => ({
      id: rat.animalId,
      x: rat.mesh.position.x,
      z: rat.mesh.position.z,
      dead: rat.isDead(),
    }))
    const resolved = resolveDogPestTarget({ x: this.home.x, z: this.home.z }, candidates, DOG_PEST_RADIUS)
    if (!resolved) return false
    const rat = nearbyRats.find((r) => r.animalId === resolved.id)
    if (!rat) return false
    this.setIntent('chase', copyVec3(rat.mesh.position))
    const dist = Math.hypot(
      rat.mesh.position.x - this.mesh.position.x,
      rat.mesh.position.z - this.mesh.position.z,
    )
    if (dist < CONTACT_RANGE) {
      this.attack(rat)
    } else {
      this.sourceDest.copy(rat.mesh.position)
      this.steerToward(this.sourceDest, this.walkSpeedNow(), dt)
    }
    return true
  }

  /** Threat-alert perception beyond immediate spatial `fleeRange` (plan
   *  fauna-012 §6/§9/§11) — thin adapter over the pure
   *  `resolvePreyAlertThreat()` (`preyAlertPerception.ts`, unit-tested
   *  directly), only ever reached once `updatePrey()`'s own spatial
   *  `nearest()` check already found nothing this tick (a real immediate
   *  threat always wins — see that call site). `others` covers same-array
   *  candidates (wild fauna's own wolves, or a settlement's own dog);
   *  `nearbyPredators` adds the cross-boundary wolves a settlement's
   *  livestock otherwise never sees (empty for wild fauna, which already has
   *  wolves in `others`). `this.def.fleeRange > 0` is what excludes `dog`
   *  (`fleeRange: 0`) with no kind-specific branch — see
   *  `PREY_ALERT_RANGE_BONUS`'s doc. */
  private resolveAlertThreat(
    others: readonly AnimalAgent[],
    nearbyPredators: readonly AnimalAgent[],
  ): { x: number, z: number } | null {
    if (this.def.fleeRange <= 0) return null
    const candidates: PreyAlertCandidate[] = []
    for (const a of others) {
      if (a === this) continue
      candidates.push({
        x: a.mesh.position.x,
        z: a.mesh.position.z,
        dead: a.health.dead,
        role: a.def.role,
        recentVocalizeAlert: a.recentVocalizeAlert,
        huntingLiveTarget: a.isHuntingLive,
      })
    }
    for (const a of nearbyPredators) {
      candidates.push({
        x: a.mesh.position.x,
        z: a.mesh.position.z,
        dead: a.health.dead,
        role: a.def.role,
        recentVocalizeAlert: a.recentVocalizeAlert,
        huntingLiveTarget: a.isHuntingLive,
      })
    }
    return resolvePreyAlertThreat(
      this.mesh.position.x,
      this.mesh.position.z,
      candidates,
      this.def.fleeRange + PREY_ALERT_RANGE_BONUS,
    )
  }

  /** Trap-bait lure pursuit (plan fauna-014 §3/§4/§11) — only reached once
   *  `updatePredator`/`updatePrey` already ruled out flee/threat/chase and
   *  real hunger/thirst pursuit above, so it can never pre-empt any of those
   *  (implementation notes' priority invariants). Re-validates any cached
   *  `lureTarget` against this tick's live `lures` (never trusts a stale
   *  snapshot) before falling back to a fresh throttled search. Movement
   *  reuses `steerToward`, which already stops on arrival — the actual
   *  detection/capture roll stays entirely `createPlacedTraps.ts`'s, this
   *  only ever gets the animal close enough to enter that trap's own
   *  `triggerRadius`. Returns `false` (caller falls back to `wander`) with no
   *  candidate in range. */
  private pursueLure(dt: number, lures: readonly TrapLureDescriptor[]): boolean {
    if (this.lureTarget) {
      const current = lures.find((l) => l.trapId === this.lureTarget!.trapId)
      this.lureTarget = current && dietAcceptsItem(this.def.diet, current.baitKind)
        && isSpeciesTrappable(current.kind, this.def.kind)
        ? current
        : null
    }
    if (this.lureSearchCooldown > 0) this.lureSearchCooldown -= dt
    if (!this.lureTarget && this.lureSearchCooldown <= 0) {
      this.lureTarget = resolveLureTarget(lures, this.def, this.mesh.position.x, this.mesh.position.z)
      if (!this.lureTarget) this.lureSearchCooldown = LURE_SEARCH_COOLDOWN_SEC
    }
    if (!this.lureTarget) return false
    this.setIntent('lure', { x: this.lureTarget.x, z: this.lureTarget.z })
    this.sourceDest.set(this.lureTarget.x, 0, this.lureTarget.z)
    this.steerToward(this.sourceDest, this.walkSpeedNow(), dt)
    return true
  }

  /** Dog guard-target resolution (plan fauna-011 §9/§10/§13) — thin adapter
   *  over the pure `resolveDogGuardTarget()` (`dogGuard.ts`, unit-tested
   *  directly): maps live `nearbyPredators` (caller-bounded, see `update()`'s
   *  param doc) into that function's narrow candidate shape, then resolves
   *  the winning wolf id back to its live `AnimalAgent` reference (needed by
   *  `updateDogGuard()`'s movement/`attack()` call, which the pure function
   *  deliberately never touches). Disengagement (§13) falls out for free:
   *  this is recomputed fresh every tick from live state, never a sticky
   *  commitment, so a dead/retargeted wolf or a target that walked outside
   *  its tier's radius simply stops being returned — no decay timer needed. */
  private resolveGuardTarget(nearbyPredators: readonly AnimalAgent[]): DogGuardTarget | null {
    const resolved = resolveDogGuardTarget(
      this.home,
      this.ownerHouseId,
      nearbyPredators.map((wolf) => ({
        id: wolf.animalId,
        x: wolf.mesh.position.x,
        z: wolf.mesh.position.z,
        dead: wolf.health.dead,
        npcTarget: wolf.npcAttackTarget,
      })),
      DOG_GUARD_OWN_RADIUS,
      DOG_GUARD_ASSIST_RADIUS,
    )
    if (!resolved) return null
    const wolf = nearbyPredators.find((a) => a.animalId === resolved.wolfId)
    if (!wolf) return null
    return { wolf, protectedNpcId: resolved.protectedNpcId, ownHousehold: resolved.ownHousehold }
  }

  /** Dog guard combat/movement (plan fauna-011 §12) — mirrors
   *  `updatePredator()`'s chase-then-bite block exactly, reusing the same
   *  `chaseNav`/`attack()` seam instead of a second combat system; `wolf` is
   *  a live `AnimalAgent`, so this is genuinely animal-vs-animal combat
   *  (cooldown/stamina/animation/damage/`takeDamage()`), not a scripted
   *  effect. No stamina-exhaustion fallback to `pursueNeeds()` like
   *  `updatePredator()` has — a guarding dog keeps closing distance even
   *  while tired; only `resolveGuardTarget()`'s own radius/liveness checks
   *  ever end the engagement (§13). */
  private updateDogGuard(dt: number, guardTarget: DogGuardTarget): void {
    this.cancelSourceTarget()
    const wolf = guardTarget.wolf
    this.setIntent('attack', copyVec3(wolf.mesh.position))
    const dist = Math.hypot(wolf.mesh.position.x - this.mesh.position.x, wolf.mesh.position.z - this.mesh.position.z)
    if (dist < CONTACT_RANGE) {
      this.attack(wolf)
    } else {
      this.sprinting = true
      this.stepNavRescue(this.chaseNav, wolf.mesh.position, this.sprintSpeedNow(), dt)
    }
  }

  /** Dog contextual bark (plan fauna-011 §7/§8) — thin adapter over the pure
   *  `resolveDogBarkStimulus()` (`dogGuard.ts`, unit-tested directly), gated
   *  behind one shared `barkCooldownSec` (the actual anti-spam/anti-cascade
   *  guard: a settled guard state or a lingering howl/stranger keeps
   *  re-qualifying every tick, the cooldown is what turns that into one
   *  bark, not a chorus). Never triggered by hearing another dog bark —
   *  `nearbyPredators` only ever contains wolves (caller contract, see
   *  `update()`'s param doc), so a dog's own bark is structurally invisible
   *  to this scan. */
  private updateDogVocalization(
    dt: number,
    guardTarget: DogGuardTarget | null,
    nearbyPredators: readonly AnimalAgent[],
    nearbySettlementNpcs: readonly NearbyNpcCandidate[],
    onVocalize?: (kind: AnimalKind, x: number, z: number) => void,
  ): void {
    if (this.barkCooldownSec > 0) this.barkCooldownSec -= dt
    if (this.barkCooldownSec > 0) return
    const stimulus = resolveDogBarkStimulus(
      this.home,
      this.ownerHouseId,
      guardTarget !== null,
      nearbyPredators
        .filter((wolf) => !wolf.health.dead && wolf.recentVocalizeAlert)
        .map((wolf) => wolf.recentVocalizeAlert!),
      DOG_BARK_HOWL_RADIUS,
      nearbySettlementNpcs,
      DOG_BARK_STRANGER_RADIUS,
    )
    if (!stimulus) return
    this.barkCooldownSec = DOG_BARK_COOLDOWN_SEC
    this.lastBarkStimulus = stimulus
    // `alert` context (plan fauna-012 §4/§7/§12) — makes this bark itself a
    // perceivable stimulus for nearby fauna (`recentVocalizeAlert`), not just
    // an audio cue, so a wolf threat can propagate: dog reacts → alert bark
    // → nearby prey/domestic animal perceives the bark. Never triggers
    // another bark by itself (`updateDogVocalization` only ever reads
    // `nearbyPredators`/wolves for its own howl tier, never other dogs), and
    // decays the same 6s window as any other vocalization.
    this.vocalizeAlertRemainingSec = VOCALIZE_ALERT_DURATION_SEC
    this.vocalizeAlertContext = 'alert'
    onVocalize?.(this.def.kind, this.mesh.position.x, this.mesh.position.z)
  }

  /** Rabies overrides normal predator/prey/human-fear behavior entirely
   *  (plan fauna-001): a rabid animal ignores need-pursuit and chases the
   *  nearest live animal of *any* role within `RABIES_TARGET_DETECT_RANGE`,
   *  biting it on contact through the same `attack()` seam predators
   *  already use. Falls back to plain wander with no target in range or
   *  while exhausted. Only ever picks another animal, never a human — V1
   *  transmission/aggression is animal-to-animal only. */
  private updateRabid(dt: number, others: readonly AnimalAgent[]): void {
    const target = isExhausted(this.life.stamina)
      ? null
      : pickRabidTarget(this, others, RABIES_TARGET_DETECT_RANGE)
    if (!target) {
      this.setIntent('wander')
      this.wander(dt)
      return
    }
    this.cancelSourceTarget()
    this.setIntent('chase', copyVec3(target.mesh.position))
    this.sprinting = true
    const dist = Math.hypot(
      target.mesh.position.x - this.mesh.position.x,
      target.mesh.position.z - this.mesh.position.z,
    )
    if (dist < CONTACT_RANGE) {
      this.attack(target)
    } else {
      this.steerToward(target.mesh.position, this.sprintSpeedNow(), dt)
    }
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
    return this.def.role === 'predator' ? this.findCarcassTarget(others) : this.findDietTarget()
  }

  /** Diet-aware herbivore food search (plan fauna-010 §2/§3/§4/§7) — replaces
   *  the old abstract "any suitable terrain point" forage for every species
   *  with `def.diet`: prefers an eligible item already sitting in the owning
   *  household's `items` (mirrors `findTroughTarget`'s "prefer local stored
   *  resource" hierarchy), then falls back to a real `GrassForagePatch`.
   *  A species without `def.diet` (out of this plan's scope — duck/boar) or
   *  with no `grassForage` service wired in keeps the old abstract
   *  `findForageTarget()` behaviour unchanged. */
  private findDietTarget(): SourceTarget | null {
    const diet = this.def.diet
    if (!diet) return this.findForageTarget()
    if (this.household && diet.items) {
      // Lazy hay top-up (plan fauna-010 §6) — resolved right before reading
      // eligibility, not on a schedule; see `Household.resolveHayForage`'s doc.
      this.household.resolveHayForage(this.tickNowDays)
      const feedItemKind = selectDietFeedKind(this.household.items, diet.items)
      if (feedItemKind) return { kind: 'feed', x: this.home.x, z: this.home.z, feedItemKind }
    }
    if (diet.grass != null && this.tickGrassForage) {
      return this.findGrassPatchTarget(this.tickGrassForage)
    }
    return null
  }

  /** Best-scoring reachable `GrassForagePatch` within `FOOD_SEARCH_RADIUS`
   *  (plan fauna-010 §3/§4) — same walkable/village/roam-radius filtering and
   *  closer-is-better scoring idiom as `findForageTarget`, applied to the
   *  candidate set `grassForage.queryNear()` returns instead of random
   *  terrain points. No claim is taken here: two animals may target the same
   *  patch, and the race resolves atomically at `performSourceAction` time
   *  (`grassForage.consume()`'s first-wins contract) — the loser's
   *  `isSourceTargetValid` check then simply fails and it replans. */
  private findGrassPatchTarget(grassForage: GrassForageService): SourceTarget | null {
    let best: SourceTarget | null = null
    let bestScore = -Infinity
    for (const candidate of grassForage.queryNear(this.mesh.position.x, this.mesh.position.z, FOOD_SEARCH_RADIUS, this.tickNowDays)) {
      if (!this.isWalkable(candidate.x, candidate.z)) continue
      if (this.def.sociability === 'wild' && this.isNearVillage(candidate)) continue
      if (Math.hypot(candidate.x - this.home.x, candidate.z - this.home.z) > ROAM_RADIUS) continue
      const d = Math.hypot(candidate.x - this.mesh.position.x, candidate.z - this.mesh.position.z)
      const score = -d
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'grassPatch', x: candidate.x, z: candidate.z, patchId: candidate.id }
      }
    }
    return best
  }

  private isSourceTargetValid(target: SourceTarget): boolean {
    if (target.kind === 'carcass') {
      const corpse = target.corpse
      if (!corpse) return false
      const phase = corpse.corpsePhase()
      if (!isCarcassEdible({
        dead: corpse.health.dead,
        expired: corpse.readyToRemove(),
        consumed: corpse.corpse.consumedPhase === phase,
        harvested: corpse.corpse.meatHarvested,
        claimedBy: corpse.corpse.claimedBy,
        eater: this,
      })) return false
      // Plan fauna-005: a non-scavenger's fresh target can decay past
      // `fresh` while it's still approaching — same rejection `findCarcassTarget`
      // would apply to a fresh search this frame, checked live rather than
      // trusting the phase cached on `target` at selection time.
      if (carcassFoodValue(phase, this.def.scavenging, this.life.hunger) == null) return false
      return corpse.corpse.claimedBy === this
    }
    if (target.kind === 'feed') {
      // Re-checked live, not cached — another animal/NPC may have taken the
      // last unit while this one was approaching (plan fauna-010 §7, same
      // "no free relief on a raced source" contract as the trough above).
      return !!target.feedItemKind && !!this.household?.items.has(target.feedItemKind, 1)
    }
    if (target.kind === 'grassPatch') {
      if (!target.patchId || !this.tickGrassForage?.isAvailable(target.patchId, this.tickNowDays)) return false
      if (!this.isWalkable(target.x, target.z)) return false
      return Math.hypot(target.x - this.home.x, target.z - this.home.z) <= ROAM_RADIUS
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
    } else if (target.kind === 'carcass' && target.corpse) {
      // Re-read the live corpse rather than the value cached on `target` at
      // selection time — a failed revalidation (already harvested, phase
      // drifted past what this eater can still eat) must not grant free
      // hunger relief (plan fauna-005).
      const corpse = target.corpse
      const phase = corpse.corpsePhase()
      const value = corpse.corpse.meatHarvested ? null : carcassFoodValue(phase, this.def.scavenging, this.life.hunger)
      if (value != null) {
        consumeFood(this.life, value)
        corpse.markFoodConsumed(phase)
      }
    } else if (target.kind === 'feed' && target.feedItemKind) {
      // Re-checked/removed by the exact kind selected at search time, not a
      // re-derived one (plan fauna-010 §7) — mirrors the trough's live
      // `household.water.has`/`.remove` re-check above. A failed `remove`
      // (another consumer took the last unit first) grants no relief; the
      // next search replans through the existing retry/cooldown path.
      if (this.household?.items.remove(target.feedItemKind, 1)) {
        consumeFood(this.life, this.def.diet?.items?.[target.feedItemKind] ?? 1)
      }
    } else if (target.kind === 'grassPatch' && target.patchId) {
      // Atomic first-wins consumption (plan fauna-010 §3/§4) — a losing
      // competitor for the same patch gets no relief and replans through the
      // same retry/cooldown path as every other invalidated source.
      if (this.tickGrassForage?.consume(target.patchId, this.tickNowDays)) {
        consumeFood(this.life, this.def.diet?.grass ?? 1)
      }
    } else {
      consumeFood(this.life)
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

  /** Best-scoring unclaimed dead prey within `FOOD_SEARCH_RADIUS` (plan
   *  094/fauna-005): a `fresh` corpse is always eligible baseline food;
   *  `rotting`/`bones` are additionally scored via `carcassFoodValue`/
   *  `carcassCandidateScore` so only a species with the `scavenging`
   *  capability (currently only wolf), hungry enough, will fall back onto
   *  lower-quality remains — and even then a reachable fresh kill always
   *  wins (see `CARCASS_VALUE_WEIGHT`'s doc). Claimed on selection so a
   *  second predator can't also target it (plan 094 §8). */
  private findCarcassTarget(others: readonly AnimalAgent[]): SourceTarget | null {
    let best: AnimalAgent | null = null
    let bestScore = -Infinity
    let bestValue = 0
    for (const o of others) {
      if (o === this || o.def.role !== 'prey') continue
      const phase = o.corpsePhase()
      if (!isCarcassEdible({
        dead: o.health.dead,
        expired: o.readyToRemove(),
        consumed: o.corpse.consumedPhase === phase,
        harvested: o.corpse.meatHarvested,
        claimedBy: o.corpse.claimedBy,
        eater: this,
      })) continue
      const d = Math.hypot(o.mesh.position.x - this.mesh.position.x, o.mesh.position.z - this.mesh.position.z)
      if (d > FOOD_SEARCH_RADIUS) continue
      const value = carcassFoodValue(phase, this.def.scavenging, this.life.hunger)
      if (value == null) continue
      const score = carcassCandidateScore(value, d)
      if (score > bestScore) {
        bestScore = score
        best = o
        bestValue = value
      }
    }
    if (!best || !best.claimAsFood(this)) return null
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

  /** True if this corpse's current phase is unclaimed or already claimed by
   *  `by` — guards against two predators both completing an eat action on
   *  one carcass. Once this phase's food is gone (`consumedPhase`), a
   *  later decay into a new phase (plan fauna-005) makes it claimable again. */
  private claimAsFood(by: AnimalAgent): boolean {
    return claimCorpseAsFood(this.corpse, by)
  }

  private releaseFoodClaim(by: AnimalAgent): void {
    releaseCorpseClaim(this.corpse, by)
  }

  /** Marks `phase` as eaten-out on this corpse (plan fauna-005) — the eater
   *  passes the live phase it just finished eating at, not necessarily
   *  `corpse.phase` at some other time, so a corpse that decays mid-eat
   *  can't have the wrong phase marked consumed. */
  private markFoodConsumed(phase: CorpsePhase): void {
    markCorpseFoodConsumed(this.corpse, phase)
  }

  private withinRange(x: number, z: number, radius: number): boolean {
    return Math.hypot(x - this.mesh.position.x, z - this.mesh.position.z) < radius
  }

  private wander(dt: number): void {
    // Trip continuation/opportunity (plan fauna-016 §4/§5) — the same
    // low-priority tail every predator/prey/dog branch already falls back to
    // (implementation notes §2.1), so a trip is transparently below any real
    // threat/combat/fire/guarding response without a new priority tier.
    if (this.tickTrip(dt)) return
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

  /** `wander()`'s single trip entry point (plan fauna-016 §4) — continues an
   *  already-committed trip, or (species with `def.trips.water`) checks the
   *  deterministic day-bucket opportunity and may commit to a new one.
   *  Returns `true` when a trip consumed this tick's movement, so `wander()`
   *  skips its own local-wander logic entirely for the tick. */
  private tickTrip(dt: number): boolean {
    if (this.trip) {
      this.continueTrip(dt)
      return true
    }
    return this.maybeStartWaterTrip()
  }

  /** Checks (at most once per bucket change) whether this animal should
   *  start a new water trip, and commits to a destination if so. Cheap when
   *  nothing is due — a hash + a couple of comparisons, no search — and the
   *  actual destination probe only runs once a trip is actually starting
   *  (plan fauna-016 §10). */
  private maybeStartWaterTrip(): boolean {
    const config = this.def.trips?.water
    if (!config) return false
    const bucket = tripDayBucket(this.animalId, this.tickNowDays, config.cooldownDays)
    if (bucket === this.lastWaterTripBucket) return false
    this.lastWaterTripBucket = bucket
    const destination = this.findWaterTripDestination(config.searchRadius)
    if (!destination) return false
    this.trip = {
      kind: 'water',
      destination: new THREE.Vector3(destination.x, 0, destination.z),
      phase: 'traveling',
      stayRemainingSec: config.stayDurationSec,
    }
    return true
  }

  /** Advances the committed trip by one tick — travel to `destination`, stay
   *  put for `stayRemainingSec`, then return to `home` and clear the trip.
   *  The destination/phase are never recomputed mid-trip (implementation
   *  notes: "interruption should not silently reroll a destination every
   *  tick") — a threat/combat branch elsewhere in `update()` simply doesn't
   *  call `wander()` for that tick, leaving this state untouched until it
   *  does again. */
  private continueTrip(dt: number): void {
    const trip = this.trip
    if (!trip) return
    if (trip.phase === 'traveling') {
      this.sourceDest.copy(trip.destination)
      this.steerToward(this.sourceDest, this.walkSpeedNow(), dt)
      if (this.arrived(trip.destination, TRIP_ARRIVAL_RADIUS)) trip.phase = 'staying'
      return
    }
    if (trip.phase === 'staying') {
      trip.stayRemainingSec -= dt
      if (trip.stayRemainingSec <= 0) trip.phase = 'returning'
      return
    }
    // 'returning'
    this.sourceDest.set(this.home.x, 0, this.home.z)
    this.steerToward(this.sourceDest, this.walkSpeedNow(), dt)
    if (this.arrived(this.sourceDest, TRIP_ARRIVAL_RADIUS)) this.trip = null
  }

  /** Bounded radial-probe search for a reachable water-trip destination
   *  (plan fauna-016 §5/§6) — same shoreline-probe technique as
   *  `findWaterTarget()`, but centered on `home` (stable regardless of where
   *  the trip happens to start) and allowed out to `searchRadius`,
   *  deliberately past `ROAM_RADIUS`/`wanderRadius`. Only ever called once,
   *  when a trip is starting — never scans per-frame or across all loaded
   *  water features. */
  private findWaterTripDestination(searchRadius: number): { x: number, z: number } | null {
    let best: { x: number, z: number } | null = null
    let bestScore = -Infinity
    for (let attempt = 0; attempt < WATER_TRIP_SEARCH_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * searchRadius
      const x = this.home.x + Math.cos(angle) * dist
      const z = this.home.z + Math.sin(angle) * dist
      if (!this.isWalkable(x, z)) continue
      const hits = shoreProbeHits(x, z, this.sampleHeight, this.waterLevel)
      if (hits === 0) continue
      if (this.def.sociability === 'wild' && this.isNearVillage({ x, z })) continue
      const d = Math.hypot(x - this.home.x, z - this.home.z)
      const score = hits * 10 - d
      if (score > bestScore) {
        bestScore = score
        best = { x, z }
      }
    }
    return best
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

  /** Physical ability, not route preference (plan fauna-015 §9) — a point
   *  this species can wade or swim through is walkable exactly like dry
   *  land; only water deeper than it can safely enter (or a collider) blocks
   *  it. Autonomous steering/navigation and `driveMounted()` share this one
   *  check, so a mounted animal's physical water traversability can never
   *  diverge from its own autonomous behaviour (plan fauna-015 §8). */
  private isWalkable(x: number, z: number): boolean {
    const water = this.sampleLocalWater(x, z)
    if (water.present && classifyWaterTraversal(water.depth, this.def.scale, this.def.water) === null) {
      return false
    }
    for (const collider of this.collidersNear(x, z)) {
      if (colliderContainsPoint(collider, x, z)) return false
    }
    return true
  }

  /** Resolves this tick's dry/wading/swimming traversal mode (plan
   *  fauna-015 §2/§7) from the animal's actual, already-moved current
   *  position — the stable per-tick answer `swimExertionNow()`/
   *  `tickDrowning()` read, as opposed to `isWalkable()`'s per-candidate-point
   *  check. `isWalkable()` already keeps the animal out of water it can't
   *  physically enter, so a `null` classification here only means the
   *  physical state changed out from under it (a hydrated save, or the
   *  water/terrain itself changing) — treated defensively as `swimming`
   *  rather than silently downgraded to a safer mode it isn't actually in. */
  private resolveWaterTraversal(): void {
    const water = this.sampleLocalWater(this.mesh.position.x, this.mesh.position.z)
    if (!water.present) {
      this.waterMode = 'dry'
      return
    }
    this.waterMode = classifyWaterTraversal(water.depth, this.def.scale, this.def.water) ?? 'swimming'
  }

  /** `tickAnimalLife`'s swim-exertion argument for the current tick —
   *  `undefined` outside `swimming` so sprint/rest bookkeeping is completely
   *  unaffected (plan fauna-015 §6). Must be called after
   *  `resolveWaterTraversal()` has set `waterMode` for this tick. */
  private swimExertionNow(): number | undefined {
    return this.waterMode === 'swimming' ? swimStaminaExertion(this.def.water) : undefined
  }

  /** Drowning damage (plan fauna-015 §7) — only while actually `swimming`
   *  and stamina-exhausted; stops the instant `waterMode` leaves `swimming`
   *  (wading/dry with 0 stamina never reach here). Reuses the same
   *  `HealthState`/death lifecycle `takeDamage()` uses (`damageHealth()` +
   *  `collapse()`), without that method's combat-only blood/provocation
   *  side effects — the source here is environmental, not an attacker. */
  private tickDrowning(dt: number): void {
    if (this.health.dead || !shouldApplyDrowningDamage(this.waterMode, isExhausted(this.life.stamina))) return
    damageHealth(this.health, DROWNING_DAMAGE_PER_SEC * dt)
    if (this.health.dead) this.collapse()
  }

  /** Stable live-hunt target (plan npc-005 — see `preyTarget`'s doc). Keeps
   *  returning the same committed prey animal while it's alive and still
   *  within `detectRange`, instead of re-running `nearest()`'s
   *  closest-candidate scan every tick. Re-picks only once the locked target
   *  dies or drifts out of range. */
  private resolvePreyTarget(others: AnimalAgent[]): AnimalAgent | null {
    if (this.preyTarget) {
      const target = this.preyTarget
      const inRange = Math.hypot(
        target.mesh.position.x - this.mesh.position.x,
        target.mesh.position.z - this.mesh.position.z,
      ) <= this.def.detectRange
      if (!target.health.dead && inRange) return target
      this.preyTarget = null
    }
    const found = this.nearest(others, 'prey', this.def.detectRange)
    if (found) this.preyTarget = found
    return found
  }

  private nearest(
    others: AnimalAgent[],
    role: AnimalRole,
    range: number,
  ): AnimalAgent | null {
    let best: AnimalAgent | null = null
    let bestD = range
    let candidatesChecked = 0
    for (const o of others) {
      if (o === this || o.def.role !== role || o.health.dead) continue
      candidatesChecked++
      const d = Math.hypot(
        o.mesh.position.x - this.mesh.position.x,
        o.mesh.position.z - this.mesh.position.z,
      )
      if (d < bestD) {
        bestD = d
        best = o
      }
    }
    getAgentCpuDiag().recordNearestScan(candidatesChecked)
    return best
  }

  private steerToward(dest: THREE.Vector3, speed: number, dt: number): void {
    // Howl presentation pause (plan fauna-009 §1) — the single choke point
    // shared by wander/chase/flee/nav-rescue/village-beeline movement, so a
    // howling wolf stands still without any of those callers needing their
    // own gate or new decision state (`this.moving` stays `false` for the
    // tick, same as the `dist < 0.4` "arrived" early-out below).
    if (this.howlPauseTimer > 0) return
    this.tmp.set(dest.x - this.mesh.position.x, 0, dest.z - this.mesh.position.z)
    const dist = this.tmp.length()
    if (dist < 0.4) return
    this.tmp.multiplyScalar(1 / dist)
    this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
    this.moving = true

    // Steep terrain scales down (and, past the max walkable angle, removes)
    // the uphill component of the step — across-slope/downhill are
    // untouched (plan 183). 3-tier collision fallback (avoid water: slide
    // along the shore rather than wading/chasing into it) shared with
    // `NpcAgent.steerTo` (plan 202).
    const result = stepWithSlopeAndCollision({
      x: this.mesh.position.x,
      z: this.mesh.position.z,
      dirX: this.tmp.x,
      dirZ: this.tmp.z,
      speed,
      dt,
      sampleHeight: this.sampleHeight,
      isWalkable: (x, z) => this.isWalkable(x, z),
    })
    this.mesh.position.x = result.x
    this.mesh.position.z = result.z
  }

  /** `steerToward` wrapper that adds real stuck-recovery (plan npc-006) —
   *  ticks `nav`'s watchdog and, once it reports the animal isn't actually
   *  making progress, requests a bounded local-grid A* route around
   *  whatever is blocking it (`attemptNavRepath`). While a route is active,
   *  steers through its waypoints one at a time; once exhausted (or none
   *  was ever found), falls straight through to steering at `dest`
   *  directly — the pre-existing behaviour. `dest` itself is never touched
   *  here: the committed prey/flee target stays whatever the caller already
   *  decided (plan npc-005's target commitment is upstream of this). */
  private stepNavRescue(nav: NavRescue, dest: THREE.Vector3, speed: number, dt: number): void {
    if (nav.active) {
      // A route computed toward a much earlier `dest` (e.g. a previous,
      // now-unrelated chase/flee session left it active) is worse than no
      // route at all — drop it rather than detouring toward the wrong
      // place. A live target's `dest` only ever drifts gradually frame to
      // frame, so this never fires mid-pursuit of the same target.
      const last = nav.waypoints[nav.waypoints.length - 1]
      if (!last || Math.hypot(last.x - dest.x, last.z - dest.z) > STALE_NAV_ROUTE_DIST) {
        this.clearNavRescue(nav)
      }
    }
    const stage = tickMovementWatchdog(nav.watchdog, dt, this.mesh.position.x, this.mesh.position.z)
    if (stage !== 'none') this.attemptNavRepath(nav, dest)

    while (nav.active) {
      const waypoint = nav.waypoints[nav.index]
      if (!waypoint) {
        this.clearNavRescue(nav)
        break
      }
      const dist = Math.hypot(waypoint.x - this.mesh.position.x, waypoint.z - this.mesh.position.z)
      if (dist >= 0.4) {
        this.repathWaypointScratch.set(waypoint.x, 0, waypoint.z)
        this.steerToward(this.repathWaypointScratch, speed, dt)
        return
      }
      nav.index++
      if (nav.index >= nav.waypoints.length) this.clearNavRescue(nav)
    }
    this.steerToward(dest, speed, dt)
  }

  /** Bounded A* from the current position toward `dest` via the shared
   *  `navigation/navigation.ts` layer, reusing this animal's own
   *  `isWalkable`/`sampleHeight` — Navigation never re-derives walkability
   *  from `ColliderRegistry` itself (see `NavigationQuery`'s doc). A failed
   *  search leaves `nav` untouched, so `stepNavRescue` simply keeps steering
   *  straight at `dest` next frame instead of getting stuck waiting. */
  private attemptNavRepath(nav: NavRescue, dest: THREE.Vector3): void {
    const query: NavigationQuery = {
      isWalkable: (x, z) => this.isWalkable(x, z),
      sampleHeight: this.sampleHeight,
    }
    const t0 = performance.now()
    const result = findPath(
      query,
      {},
      { x: this.mesh.position.x, z: this.mesh.position.z },
      { x: dest.x, z: dest.z },
    )
    recordPathRequest(result, performance.now() - t0)
    recordRepath()
    if (!result || result.waypoints.length === 0) return
    if (!nav.active) beginActivePath()
    nav.waypoints = result.waypoints
    nav.index = 0
    nav.active = true
  }

  private clearNavRescue(nav: NavRescue): void {
    if (nav.active) endActivePath()
    nav.active = false
    nav.waypoints = []
    nav.index = 0
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
    // Prefer not sinking below the local water surface — reads the same
    // canonical local sample `isWalkable()`/`resolveWaterTraversal()` use
    // (plan fauna-015) rather than a bare `waterLevel` comparison, so a
    // river point whose canonical surface sits above the global `waterLevel`
    // (a mountain stream) is handled correctly too.
    const water = this.sampleLocalWater(this.mesh.position.x, this.mesh.position.z)
    if (water.present && y <= water.waterSurfaceHeight + 0.15) {
      y = water.waterSurfaceHeight + 0.2
    }
    // Capsule is centered; GLB feet sit at local y=0 after prepareProp.
    this.mesh.position.y = this.isCapsule ? y + 0.45 * this.def.scale : y
  }

  private updateAnim(): void {
    // Combat one-shots pre-empt normal locomotion (plan npc-009) — both are
    // already playing (triggered from `attack()`/`attackHuman()`/
    // `attackNpc()`/`takeDamage()`), so skip rather than restarting them
    // every frame. Death itself never reaches this method while `mounted` is
    // false: `update()`'s own `health.dead` branch returns before calling it.
    if (this.hurtAnimTimer > 0 || this.attackAnimTimer > 0) return
    if (this.sprinting) {
      this.anim.play(this.anim.has('gallop') ? 'gallop' : this.anim.has('walk') ? 'walk' : 'idle')
    } else if (this.moving) {
      this.anim.play(this.anim.has('walk') ? 'walk' : 'idle')
    } else {
      this.anim.play('idle')
    }
  }
}
