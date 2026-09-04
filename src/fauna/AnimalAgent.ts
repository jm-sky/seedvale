import * as THREE from 'three'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { Household } from '../settlement/household'
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
  type ScoredAction,
} from '../simulation'
import { stepWithSlopeAndCollision } from '../terrain/slopeConstraint'
import {
  applyBarPercent,
  computeBarPercent,
  createAgentLabel,
  createLabelBar,
  INITIAL_LABEL_DISTANCE_STATE,
  type LabelDistanceState,
  updateAgentLabelDistanceState,
} from '../ui/agentStatusLabel'
import { recordBloodHit } from '../world/bloodTraces'
import { colliderContainsPoint } from '../world/collision'
import { AGENT_RENDER_LAYER, assignRenderLayer } from '../world/waterMirror'
import { type AnimalDebugVisual, createAnimalDebugVisual } from './animalDebugVisual'
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
import { animateCorpseRotFx, createCorpseRotFx, disposeCorpseRotFx } from './corpseDecayFx'
import { createHealthState, damageFor, damageVsHuman, MAX_HP } from './faunaCombat'
import {
  decideFaunaBehaviour,
  type FaunaBehaviourKind,
  type FaunaDecisionInput,
  scoreFaunaBehaviours,
} from './faunaDecision'
import {
  createHarvestedRemainsAsync,
  createNaturalRemainsAsync,
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
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

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
/** Seconds a corpse stays in the scene (frozen pose) before it's disposed. */
const CORPSE_LINGER_SECONDS = 60
/** Seconds harvested remains stay after a knife harvest (plan 137) — own
 *  lifetime, not whatever was left of the unharvested 60 s linger. */
export const HARVESTED_REMAINS_LINGER_SECONDS = 90

export function corpseLingerSeconds(meatHarvested: boolean): number {
  return meatHarvested ? HARVESTED_REMAINS_LINGER_SECONDS : CORPSE_LINGER_SECONDS
}

/** Natural (unharvested, unburied) corpse decay phase (plan 188) — both
 *  thresholds sit inside `CORPSE_LINGER_SECONDS`, so the existing 60 s total
 *  unharvested lifetime (`corpseLingerSeconds(false)`/`readyToRemove()`) is
 *  unchanged; this only subdivides it into a visibly distinct progression. */
export type CorpsePhase = 'fresh' | 'rotting' | 'bones'
/** Seconds after death before a natural corpse starts visibly rotting. */
const CORPSE_ROT_ONSET_SECONDS = 20
/** Seconds after death a natural corpse decomposes into a bones pile. */
const CORPSE_BONES_ONSET_SECONDS = 40
/** Distance (world units) within which a rotting corpse gets its lightweight
 *  particle/fog FX — beyond this, only lifecycle timers/state keep advancing
 *  (plan 188 §6: simulation truth vs. presentation). */
const CORPSE_FX_DISTANCE = 22
/** Radius (world units) within which a rotting corpse saps nearby live
 *  fauna's stamina — the v1 "negative proximity effect" hook (plan 188 §4),
 *  reusing the existing `AnimalLifeState.stamina` needs integration point
 *  instead of a new disease/status-effect system. */
const CORPSE_ROT_INFLUENCE_RADIUS = 5
const CORPSE_ROT_STAMINA_DRAIN_PER_SEC = 0.03
/** Radius (world units) within which a live animal's contact with a
 *  rabies-infected, `rotting` corpse can transmit rabies (plan fauna-001 —
 *  the feature's explicit "wejście w promień 0.5 m" figure). */
export const RABIES_CORPSE_CONTACT_RADIUS = 0.5
/** Chance a single corpse-contact exposure actually transmits rabies (plan
 *  fauna-001 — the feature's explicit 50% figure). */
export const RABIES_CORPSE_INFECTION_CHANCE = 0.5
/** Sickly tint applied to a rotting corpse's materials — same technique as
 *  `markDangerous()`'s `tintPropMaterials` call, just a different hex. */
const CORPSE_ROT_TINT_HEX = 0x3a4224

/** Pure phase-from-elapsed-time lookup — unit-testable without instantiating
 *  `AnimalAgent`/Three.js (plan 188). Only meaningful for a dead, unharvested,
 *  unburied corpse; callers gate those cases separately. */
export function corpsePhaseFromElapsed(elapsedSeconds: number): CorpsePhase {
  if (elapsedSeconds >= CORPSE_BONES_ONSET_SECONDS) return 'bones'
  if (elapsedSeconds >= CORPSE_ROT_ONSET_SECONDS) return 'rotting'
  return 'fresh'
}

/** Whether a rotting corpse's lightweight FX should be presented — distance
 *  gate only, never a reason to pause the lifecycle itself (plan 188 §6/§9).
 *  Pure/exported so the presentation rule is unit-testable without Three.js. */
export function rotFxRelevant(phase: CorpsePhase, distanceToObserver: number): boolean {
  return phase === 'rotting' && distanceToObserver <= CORPSE_FX_DISTANCE
}

/** Whether a corpse can still yield a knife-harvest — meat is only good
 *  while `fresh`; once natural decay has moved it into `rotting`/`bones` (or
 *  it's been buried, or already harvested), it's a lost source (plan 188
 *  follow-up: "meat only from fresh corpses"). Pure/exported so
 *  `AnimalAgent.canHarvestMeat()`'s rule is unit-testable without Three.js,
 *  same technique as `corpsePhaseFromElapsed`/`isCarcassEdible` above. */
export function canHarvestMeatFrom(opts: {
  dead: boolean
  meatHarvested: boolean
  buried: boolean
  corpsePhase: CorpsePhase
}): boolean {
  return opts.dead && !opts.meatHarvested && !opts.buried && opts.corpsePhase === 'fresh'
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
/** Offsets (world units) probed around a water-search candidate to confirm
 *  it's actually at the edge of a water body, not just dry land somewhere
 *  within `WATER_SEARCH_RADIUS`. */
const SHORE_PROBE_OFFSETS: readonly [number, number][] = [
  [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5],
]

type FaunaActionKind = 'attack' | 'chase' | 'flee' | 'wander' | 'forage' | 'drink' | 'eat'

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
  /** Current carcass food-target diagnostics (plan fauna-005) — `null` when
   *  not currently pursuing a carcass. `riskPenalty` is always 0 today: the
   *  `carcassCandidateScore` disease/food-safety seam has no consumer yet. */
  foodTarget: { corpsePhase: CorpsePhase, foodValue: number, score: number, riskPenalty: number } | null
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
  /** Set only for `kind: 'carcass'` — corpse phase/value/score captured at
   *  selection time (plan fauna-005), for `getDebugInfo()`'s `foodTarget`
   *  diagnostics only. The authoritative eat-time check re-reads the live
   *  corpse phase/value (`performSourceAction`), never these cached values. */
  corpsePhase?: CorpsePhase
  foodValue?: number
  score?: number
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

/** First `SHORE_PROBE_OFFSETS` point around (x, z) that is actually water —
 *  the same signal as `shoreProbeHits`, but returning a real, distinct world
 *  point instead of a count (plan `ui-input-006` fishing-on-ocean fix:
 *  `app/interactables.ts`'s `waterEdge` candidate used to sit exactly on the
 *  player's own position, which `pickInGaze`'s `dist < 1e-4` guard then
 *  always rejected). `null` when `shoreProbeHits` would be 0. Deterministic
 *  (fixed offset order), pure so it's unit-testable without `AnimalAgent`. */
export function nearestShoreProbePoint(
  x: number,
  z: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): { x: number, z: number } | null {
  for (const [dx, dz] of SHORE_PROBE_OFFSETS) {
    if (sampleHeight(x + dx, z + dz) <= waterLevel + WATER_MARGIN) return { x: x + dx, z: z + dz }
  }
  return null
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

/** Rider seat placement for a mountable `AnimalDef` (plan fauna-003 §6) —
 *  world-space seat transform is derived from these plus the animal's own
 *  `mesh.position`/`mesh.rotation.y` in `AnimalAgent.mountSeatTransform()`. */
export type MountPointConfig = {
  /** Seat height (m) above the animal's own ground-snapped `mesh.position.y`. */
  seatHeight: number
  /** Seat offset (m) along the animal's forward facing, + toward the head. */
  seatForwardOffset: number
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
    walkSpeed: 10.5,
    sprintSpeed: 17.5,
    detectRange: 0,
    fleeRange: 10,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    mount: { seatHeight: 0.5, seatForwardOffset: 0.05 },
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
    walkSpeed: 9.5,
    sprintSpeed: 16.0,
    detectRange: 0,
    fleeRange: 9,
    playerNoticeRange: 0,
    playerPanicRange: 0,
    mount: { seatHeight: 0.3, seatForwardOffset: 0.02 },
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

/** Single infection roll shared by bite and corpse-contact transmission
 *  (plan fauna-001) — one call per discrete event (a landed bite, or a
 *  corpse's first-contact exposure), never per-tick, so the outcome is
 *  independent of frame rate/tick frequency. Pure/exported so it's
 *  unit-testable without instantiating `AnimalAgent`. */
export function rollsRabiesInfection(chance: number, roll: number): boolean {
  return roll < chance
}

/** Whether a live animal at `distance` from a corpse counts as rabies
 *  contact (plan fauna-001) — only a `rotting`, rabies-infected corpse is
 *  contagious; `fresh`/`bones` corpses and healthy corpses never are. Pure
 *  so it's unit-testable without instantiating `AnimalAgent`/Three.js, same
 *  technique as `corpsePhaseFromElapsed`. */
export function isRabiesCorpseContact(opts: {
  corpsePhase: CorpsePhase
  corpseInfected: boolean
  distance: number
}): boolean {
  return opts.corpseInfected && opts.corpsePhase === 'rotting' && opts.distance < RABIES_CORPSE_CONTACT_RADIUS
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
  /** True while a player is riding this animal (plan fauna-003) — suppresses
   *  the AI decision branch in `update()` (the riding system drives movement
   *  instead, via `driveMounted()`), but needs/stamina/hp/animation
   *  bookkeeping keeps running exactly as it would while free-roaming. */
  private mounted = false
  private readonly mixer: THREE.AnimationMixer | null
  private readonly idleAction: THREE.AnimationAction | null
  private readonly walkAction: THREE.AnimationAction | null
  private readonly gallopAction: THREE.AnimationAction | null
  /** Combat/death presentation clips (plan npc-009) — semantic mapping over
   *  whichever names the loaded GLB actually exports (`findAction`'s
   *  existing name-list + `Armature|`-prefix fallback), never a hard-coded
   *  name in combat logic. `null` is a safe, silent fallback (no animation
   *  change, existing behaviour continues) — not every species/pack exports
   *  all three (e.g. sheep/chicken/bear have none, cow only has `Death`). */
  private readonly attackAction: THREE.AnimationAction | null
  private readonly hurtAction: THREE.AnimationAction | null
  private readonly deathAction: THREE.AnimationAction | null
  /** Countdown while a one-shot `attackAction`/`hurtAction` should keep
   *  pre-empting `updateAnim()`'s normal idle/walk/gallop switch (plan
   *  npc-009) — `0` outside a one-shot. Decremented in `update()` alongside
   *  the other cooldown-style timers. */
  private attackAnimTimer = 0
  private hurtAnimTimer = 0
  /** Countdown while `steerToward()` should no-op for a howling wolf with no
   *  dedicated howl clip (plan fauna-009 §1, `HOWL_PAUSE_SECONDS`) — set on a
   *  successful howl roll in `update()`, decremented alongside the other
   *  timers. Only ever set for `kind === 'wolf'`. */
  private howlPauseTimer = 0
  /** Bounds how long a dead animal's `update()` keeps ticking its own mixer
   *  (plan npc-009) so the one-shot `deathAction` actually plays out — `null`
   *  when there was no `deathAction` to play (manual tip fallback, no mixer
   *  work needed), compared against `timeSinceDeath` (already tracked for
   *  corpse decay) rather than a second death-clock field. */
  private deathAnimDurationSec: number | null = null
  private currentAction: THREE.AnimationAction | null = null
  private readonly label: CSS2DObject
  private readonly labelEl: HTMLDivElement
  private readonly labelNameEl: HTMLDivElement
  private readonly labelBarsEl: HTMLDivElement
  private readonly hpFillEl: HTMLDivElement
  private readonly staminaFillEl: HTMLDivElement
  private readonly satietyFillEl: HTMLDivElement
  private readonly hydrationFillEl: HTMLDivElement
  private labelDistanceState: LabelDistanceState = INITIAL_LABEL_DISTANCE_STATE
  private lastHpPercent = -1
  private lastStaminaPercent = -1
  private lastSatietyPercent = -1
  private lastHydrationPercent = -1
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
  private timeSinceDeath = 0
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
  /** `animalId`s of live animals this corpse has already rolled a rabies
   *  contact-exposure check against (plan fauna-001) — a one-shot guard so
   *  an animal lingering next to an infected `rotting` corpse doesn't get
   *  re-rolled every tick. Only ever populated/read while `rabid`. */
  private readonly rabiesExposedAnimalIds = new Set<string>()
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
  private bloodSplat: THREE.Object3D | null = null
  private bloodSplatToken = 0
  private harvestedRemains: THREE.Object3D | null = null
  private harvestedRemainsToken = 0
  /** Natural (unharvested) decay endpoint — a bones pile with no hide/meat,
   *  distinct from `harvestedRemains` (plan 188). Mutually exclusive with it:
   *  `advanceCorpseDecay` never runs once `meatHarvested` is set. */
  private naturalRemains: THREE.Object3D | null = null
  private naturalRemainsToken = 0
  /** Current natural-decay phase (plan 188) — stays `'fresh'` for the
   *  lifetime of a harvested or buried corpse, since `advanceCorpseDecay`
   *  short-circuits for those. */
  private corpsePhaseValue: CorpsePhase = 'fresh'
  /** Set by `bury()` — stops natural decay progression/FX immediately so a
   *  buried corpse never later produces a natural bones pile (plan 188). */
  private buried = false
  /** Lightweight rotting-corpse particle/fog group, present only while the
   *  corpse is in the `rotting` phase *and* within `CORPSE_FX_DISTANCE` of
   *  the observer (plan 188 §6/§9). */
  private rotFx: THREE.Object3D | null = null
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
  /** Set on a dead prey's `AnimalAgent` by the predator currently eating it
   *  — guards against two predators completing an eat action on the same
   *  corpse (plan 094). */
  private foodClaimedBy: AnimalAgent | null = null
  /** The `CorpsePhase` a predator was in when it last finished eating this
   *  corpse, `null` until then (plan 094/fauna-005) — per-phase rather than
   *  a single flag so a corpse eaten `fresh` can still be scavenged again
   *  once it later decays into `rotting`/`bones`: only the *current* phase
   *  being equal to this value means "already eaten, no food left here". */
  private foodConsumedPhase: CorpsePhase | null = null
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
  /** Spontaneous ambient vocalization timer (plan settlements-npcs-004 §1) —
   *  seeded per-instance in the constructor, ticked in `update()` via
   *  `tickSpontaneousVocalizeCooldown`. `Infinity` (and never fires) for any
   *  kind without a configured vocalization. */
  private spontaneousVocalizeCooldownSec: number

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

    if (animations.length > 0) {
      // Prefer skinned model root (child of wrap) so clip bindings resolve.
      const animRoot = this.mesh.children[0] ?? this.mesh
      this.mixer = new THREE.AnimationMixer(animRoot)
      this.idleAction = this.findAction(animations, ['Idle', 'Idle_2'])
      this.walkAction = this.findAction(animations, ['Walk'])
      this.gallopAction = this.findAction(animations, ['Gallop'])
      // Predators export `Attack`; deer/stag/horse/donkey export
      // `Attack_Headbutt`/`Attack_Kick` instead (plan npc-009) — first match
      // wins, same "smallest existing-compatible name" idiom as Idle/Idle_2.
      this.attackAction = this.findAction(animations, ['Attack', 'Attack_Headbutt'])
      // Wolf/fox/deer/stag export `Idle_HitReact1`; horse/donkey export
      // `Idle_HitReact_Left` instead.
      this.hurtAction = this.findAction(animations, ['Idle_HitReact1', 'Idle_HitReact_Left'])
      this.deathAction = this.findAction(animations, ['Death'])
      this.playAction(this.idleAction)
    } else {
      this.mixer = null
      this.idleAction = null
      this.walkAction = null
      this.gallopAction = null
      this.attackAction = null
      this.hurtAction = null
      this.deathAction = null
    }

    const hpBar = createLabelBar('hp')
    const staminaBar = createLabelBar('stamina')
    // Satiety / hydration are inverted needs: full bar = well fed / hydrated.
    const satietyBar = createLabelBar('satiety', Math.round((1 - this.life.hunger) * 100))
    const hydrationBar = createLabelBar('hydration', Math.round((1 - this.life.thirst) * 100))
    this.hpFillEl = hpBar.fill
    this.staminaFillEl = staminaBar.fill
    this.satietyFillEl = satietyBar.fill
    this.hydrationFillEl = hydrationBar.fill
    const labelDom = createAgentLabel(
      ANIMAL_LABELS[def.kind],
      [hpBar, staminaBar, satietyBar, hydrationBar],
      this.labelHeight(),
    )
    this.labelEl = labelDom.el
    this.labelNameEl = labelDom.nameEl
    this.labelBarsEl = labelDom.barsEl
    this.label = labelDom.label
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
    this.naturalRemainsToken++
    disposeBloodSplat(this.bloodSplat)
    this.bloodSplat = null
    disposeHarvestedRemains(this.harvestedRemains)
    this.harvestedRemains = null
    disposeHarvestedRemains(this.naturalRemains)
    this.naturalRemains = null
    this.disposeRotFx()
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer?.stopAllAction()
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
   *  riding system instead of `update()` while `mounted`; reuses the same
   *  stepping/animation/needs tail `update()`'s own AI branch would otherwise
   *  reach, minus `clampBounds()` — a ridden mount must be able to go
   *  wherever the player takes it, not stay within its home wander radius.
   *  `wishX`/`wishZ` is the player's raw (not necessarily normalized)
   *  movement intent in world space, same convention as `PlayerController`'s
   *  own `wish` vector. `speedMultiplier` (plan fauna-008, default 1) scales
   *  only this player-driven path — the caller resolves it from the rider's
   *  Riding skill (`PlayerSkills.ts`'s `ridingSpeedMultiplier`); `AnimalAgent`
   *  itself stays unaware of player skills and free-roaming AI movement
   *  (`walkSpeedNow()`/`sprintSpeedNow()` call sites elsewhere) is unaffected. */
  driveMounted(dt: number, wishX: number, wishZ: number, sprintRequested: boolean, speedMultiplier = 1): void {
    if (this.health.dead) return
    const distSq = wishX * wishX + wishZ * wishZ
    this.moving = distSq > 1e-6
    this.sprinting = this.moving && sprintRequested && !isExhausted(this.life.stamina)
    if (this.moving) {
      const dist = Math.sqrt(distSq)
      const dirX = wishX / dist
      const dirZ = wishZ / dist
      this.mesh.rotation.y = Math.atan2(dirX, dirZ)
      const speed = (this.sprinting ? this.sprintSpeedNow() : this.walkSpeedNow()) * speedMultiplier
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
    this.snapY()
    this.updateAnim()
    tickAnimalLife(this.life, dt, this.sprinting)
    this.lastHpPercent = applyBarPercent(
      this.hpFillEl,
      computeBarPercent(this.health.currentHp, this.health.maxHp),
      this.lastHpPercent,
    )
    this.lastStaminaPercent = applyBarPercent(
      this.staminaFillEl,
      computeBarPercent(this.life.stamina.current, this.life.stamina.max),
      this.lastStaminaPercent,
    )
    this.lastSatietyPercent = applyBarPercent(
      this.satietyFillEl,
      Math.round((1 - this.life.hunger) * 100),
      this.lastSatietyPercent,
    )
    this.lastHydrationPercent = applyBarPercent(
      this.hydrationFillEl,
      Math.round((1 - this.life.thirst) * 100),
      this.lastHydrationPercent,
    )
    this.mixer?.update(dt)
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

  /** Toggles the gaze-highlight glow on this animal's label. Idempotent — no
   *  redundant DOM writes if the state doesn't actually change. */
  setHighlighted(active: boolean): void {
    if (this.highlighted === active) return
    this.highlighted = active
    this.labelEl.classList.toggle('npc-label--highlighted', active)
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
      presentation: {
        current: this.hurtAnimTimer > 0 ? 'hurt' : this.attackAnimTimer > 0 ? 'attack' : null,
        hasAttackClip: this.attackAction != null,
        hasHurtClip: this.hurtAction != null,
        hasDeathClip: this.deathAction != null,
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
      life: { hunger: this.life.hunger, thirst: this.life.thirst, stamina: this.life.stamina.current },
      productionReadyAtDays: this.productionReadyAtDays,
      eggPending: this.eggPending,
      corpse: this.health.dead ? { timeSinceDeath: this.timeSinceDeath, meatHarvested: this.meatHarvested } : null,
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
   *  `advanceCorpseDecay()`. Never reports `onDeath` — that already fired,
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
    this.life.stamina.current = state.life.stamina
    this.productionReadyAtDays = state.productionReadyAtDays
    this.eggPending = state.eggPending
    if (state.corpse) {
      this.timeSinceDeath = state.corpse.timeSinceDeath
      this.meatHarvested = state.corpse.meatHarvested
      this.mixer?.stopAllAction()
      if (this.meatHarvested) {
        this.hideLivingVisual()
        void this.spawnHarvestedRemains()
        this.labelEl.style.display = 'none'
      } else {
        const side = Math.random() < 0.5 ? 1 : -1
        this.mesh.rotation.z = side * (Math.PI / 2)
        this.mesh.position.y += this.isCapsule ? 0.2 * this.def.scale : this.def.modelHeight * 0.3
      }
      this.lastHpPercent = 0
      this.hpFillEl.style.width = '0%'
      this.labelBarsEl.style.display = 'none'
    }
  }

  /** True once a dead agent's corpse has lingered long enough to be disposed. */
  readyToRemove(): boolean {
    const linger = corpseLingerSeconds(this.meatHarvested)
    return this.health.dead && !this.corpseHeld && this.timeSinceDeath >= linger
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
      if (!this.corpseHeld) this.timeSinceDeath += elapsedSeconds
      return
    }
    tickAnimalLife(this.life, elapsedSeconds, false)
  }

  /** Player shovel-bury: mark corpse for disposal on the next fauna/settlement
   *  tick. Also stops natural decay immediately (plan 188) — a buried corpse
   *  must never later produce a natural bones pile. */
  bury(): void {
    if (!this.health.dead) return
    this.buried = true
    this.disposeRotFx()
    this.timeSinceDeath = HARVESTED_REMAINS_LINGER_SECONDS
  }

  /** Plan 106/188 — a dead, not-yet-harvested, unburied corpse can yield
   *  `raw_meat`, but only while still `fresh`: once natural decay has moved
   *  it into `rotting`/`bones`, the meat is a lost source (plan 188 follow-up). */
  canHarvestMeat(): boolean {
    return canHarvestMeatFrom({
      dead: this.health.dead,
      meatHarvested: this.meatHarvested,
      buried: this.buried,
      corpsePhase: this.corpsePhaseValue,
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
    this.meatHarvested = true
    this.timeSinceDeath = 0
    // Leave the natural decay path (plan 188) — any rotting FX/bones already
    // produced no longer apply once the player claims the harvested-remains path.
    this.disposeRotFx()
    if (this.naturalRemains) {
      this.naturalRemainsToken++
      disposeHarvestedRemains(this.naturalRemains)
      this.naturalRemains = null
    }
    this.corpsePhaseValue = 'fresh'
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
        if (walk.name === 'harvested-remains' || walk.name === 'natural-remains') return
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
      this.hurtAnimTimer = this.playOneShotAnim(this.hurtAction)
    }
  }

  /** Death presentation: plays the GLB's own `Death` clip when the species
   *  has one (plan npc-009); falls back to tipping the corpse onto its side
   *  (relative to its facing direction) for species/packs with no such clip
   *  (sheep, chicken, bear, capsule fallback) instead of leaving it frozen
   *  standing up. */
  private collapse(): void {
    this.onDeath?.(this.animalId)
    if (this.deathAction) {
      this.deathAnimDurationSec = this.playOneShotAnim(this.deathAction)
    } else {
      this.mixer?.stopAllAction()
      const side = Math.random() < 0.5 ? 1 : -1
      this.mesh.rotation.z = side * (Math.PI / 2)
      this.mesh.position.y += this.isCapsule ? 0.2 * this.def.scale : this.def.modelHeight * 0.3
    }
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

  /** Current natural-decay phase (plan 188) — `'fresh'` for the lifetime of
   *  a harvested or buried corpse, see `corpsePhaseValue`'s field doc. */
  corpsePhase(): CorpsePhase {
    return this.corpsePhaseValue
  }

  /** Advances the natural (unharvested, unburied) corpse decay lifecycle —
   *  simulation truth (phase/timers/proximity effect) always runs; only the
   *  FX presentation is distance-gated (plan 188 §6/§10). No-op once the
   *  corpse has left this path via `harvestMeat()`/`bury()`. */
  private advanceCorpseDecay(dt: number, others: readonly AnimalAgent[], observerPos: THREE.Vector3): void {
    if (this.meatHarvested || this.buried) return
    const phase = corpsePhaseFromElapsed(this.timeSinceDeath)
    if (phase !== this.corpsePhaseValue) {
      this.corpsePhaseValue = phase
      this.onCorpsePhaseChanged(phase)
    }
    if (phase === 'rotting') {
      this.applyRotInfluence(dt, others)
      if (this.rabid) this.applyRabiesCorpseExposure(others)
    }
    this.updateRotFx(dt, phase, observerPos)
  }

  private onCorpsePhaseChanged(phase: CorpsePhase): void {
    if (phase === 'rotting') {
      tintPropMaterials(this.mesh, CORPSE_ROT_TINT_HEX)
    } else if (phase === 'bones') {
      this.disposeRotFx()
      this.hideLivingVisual()
      void this.spawnNaturalRemains()
    }
  }

  /** GLB/procedural bones pile as a mesh child — mirrors
   *  `spawnHarvestedRemains()`'s token-guarded async attach, sharing the same
   *  cached templates/dispose helper (plan 188). */
  private async spawnNaturalRemains(): Promise<void> {
    const token = ++this.naturalRemainsToken
    const remains = await createNaturalRemainsAsync(this.def.kind, this.def.modelHeight)
    if (token !== this.naturalRemainsToken || !this.mesh.parent) {
      disposeHarvestedRemains(remains)
      return
    }
    this.naturalRemains = remains
    this.mesh.add(remains)
  }

  /** V1 "negative proximity effect" hook (plan 188 §4) — a small, temporary,
   *  bounded stamina drain on nearby *live* fauna, reusing the existing
   *  needs seam instead of a disease/status-effect system. `others` is the
   *  same local/bounded list already threaded through `update()`, never a
   *  world/settlement scan. */
  private applyRotInfluence(dt: number, others: readonly AnimalAgent[]): void {
    for (const other of others) {
      if (other === this || other.health.dead) continue
      if (this.withinRange(other.mesh.position.x, other.mesh.position.z, CORPSE_ROT_INFLUENCE_RADIUS)) {
        drainStamina(other.life.stamina, CORPSE_ROT_STAMINA_DRAIN_PER_SEC * dt)
      }
    }
  }

  /** Rabies corpse-contact transmission (plan fauna-001) — this corpse is
   *  infected and currently `rotting`; any nearby live, not-yet-infected
   *  animal gets a single, guarded contact-exposure roll (never repeated
   *  for the same pair, see `rabiesExposedAnimalIds`). Reuses the same
   *  local/bounded `others` list `applyRotInfluence` already iterates —
   *  no separate corpse/disease scan. */
  private applyRabiesCorpseExposure(others: readonly AnimalAgent[]): void {
    for (const other of others) {
      if (other === this || other.health.dead || other.rabid) continue
      if (this.rabiesExposedAnimalIds.has(other.animalId)) continue
      const distance = Math.hypot(
        other.mesh.position.x - this.mesh.position.x,
        other.mesh.position.z - this.mesh.position.z,
      )
      if (!isRabiesCorpseContact({ corpsePhase: this.corpsePhaseValue, corpseInfected: this.rabid, distance })) continue
      this.rabiesExposedAnimalIds.add(other.animalId)
      if (rollsRabiesInfection(RABIES_CORPSE_INFECTION_CHANCE, Math.random())) other.infectWithRabies()
    }
  }

  /** Presentation only — creates/animates/disposes the rotting-corpse
   *  particle+fog group based on phase and observer distance (plan 188 §6/§9),
   *  never affecting the lifecycle timers themselves. */
  private updateRotFx(dt: number, phase: CorpsePhase, observerPos: THREE.Vector3): void {
    const relevant = rotFxRelevant(phase, this.mesh.position.distanceTo(observerPos))
    if (relevant) {
      if (!this.rotFx) {
        this.rotFx = createCorpseRotFx(this.def.modelHeight)
        this.rotFx.position.copy(this.mesh.position)
        this.mesh.parent?.add(this.rotFx)
      }
      animateCorpseRotFx(this.rotFx, dt)
    } else if (this.rotFx) {
      this.disposeRotFx()
    }
  }

  private disposeRotFx(): void {
    if (!this.rotFx) return
    disposeCorpseRotFx(this.rotFx)
    this.rotFx = null
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
     *  keyed to the specific NPC id chosen as target. `attackerAnimalId` is
     *  diagnostic-only (`?debug=1&debugNpcCombat=1` combat logging) — lets
     *  the caller look this animal back up via `getAgents()` without this
     *  callback needing to know about `AnimalAgent` itself. */
    onNpcHit?: (targetId: string, damage: number, attackerX: number, attackerZ: number, attackerAnimalId: string) => void,
    /** Aggression/alert audio hook (plan 188 §11) — fired once on the rising
     *  edge of this predator committing to a human chase, not every frame. */
    onAggro?: (kind: AnimalKind, x: number, z: number) => void,
    /** Spontaneous ambient vocalization hook (plan settlements-npcs-004 §1,
     *  extended fauna-009 §1/§4) — fired at most once per tick, on the frame
     *  `tickSpontaneousVocalizeCooldown` rolls a success. No-op for any kind
     *  without a configured vocalization (cow/sheep/chicken/wolf/rooster). */
    onVocalize?: (kind: AnimalKind, x: number, z: number) => void,
    /** `dayNight.elapsedDays` (plan fauna-002) — only meaningful for a
     *  livestock kind with `def.production`; drives the day-anchor
     *  production readiness check (`tickProduction`/`livestockProduction.ts`).
     *  Defaults to 0 so existing wild-fauna/test callers that never touch
     *  production are unaffected. */
    nowDays = 0,
    /** `dayNight.timeOfDay` (plan fauna-009 §1/§4) — the raw world clock (not
     *  just `dayFactor`), needed to weight wolf howl toward night/twilight and
     *  rooster crow toward dawn (`spontaneousVocalizeTimeWeight`); `dayFactor`
     *  alone can't tell dawn from dusk. Defaults to noon (full "day" weight)
     *  so existing wild-fauna/test callers that don't pass it keep prior
     *  behaviour for every kind without time-of-day weighting. */
    timeOfDay = 0.5,
  ): void {
    if (this.health.dead) {
      if (!this.corpseHeld) {
        this.timeSinceDeath += dt
        this.advanceCorpseDecay(dt, others, observerPos)
      }
      // Keep the mixer advancing only long enough for the one-shot
      // `deathAction` to actually play (plan npc-009) — `null` when there was
      // no clip to play (manual tip fallback, no mixer work needed), so a
      // permanently dead animal never costs a per-frame mixer update for the
      // rest of the session.
      if (this.deathAnimDurationSec != null && this.timeSinceDeath < this.deathAnimDurationSec) {
        this.mixer?.update(dt)
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
    if (this.attackCooldown > 0) this.attackCooldown -= dt
    if (this.attackAnimTimer > 0) this.attackAnimTimer -= dt
    if (this.hurtAnimTimer > 0) this.hurtAnimTimer -= dt
    if (this.alertTimer > 0) this.alertTimer -= dt
    if (this.provokedTimer > 0) this.provokedTimer -= dt
    if (this.sourceSearchCooldown > 0) this.sourceSearchCooldown -= dt
    if (this.howlPauseTimer > 0) this.howlPauseTimer -= dt
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
    this.tickMaturity(dt)
    this.tickProduction(nowDays)
    const sense = this.senseEnvironment(dt, observerPos, dayFactor, forestFactor, litFires, playerStealth)
    // Any predator can notice a nearby NPC (npc-008 step 6 — animal↔NPC
    // threat is a general predator behaviour, not something only a frenzied
    // animal does). `frenzied` no longer gates whether an NPC target is
    // resolved at all; it still forces the engagement via
    // `npc-attack-frenzied`, which skips scoring (`isBehaviourValid`).
    const npcThreat = this.def.role === 'predator'
      ? this.resolveNpcTarget(nearbyNpcs)
      : null

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
      }
      this.lastFaunaDecisionInput = decisionInput
      const branch = decideFaunaBehaviour(decisionInput)
      this.debugBranch = branch
      switch (branch) {
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
          this.updatePredator(dt, others)
          break
        }
        case 'prey-normal': {
          this.threateningHuman = false
          this.humanDecisionTimer = 0
          this.npcDecisionTimer = 0
          this.provokedTimer = 0
          this.updatePrey(dt, others)
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
    }
    if (this.threateningHuman && !this.wasThreateningHuman) {
      onAggro?.(this.def.kind, this.mesh.position.x, this.mesh.position.z)
    }
    this.wasThreateningHuman = this.threateningHuman
    this.clampBounds()
    this.snapY()
    this.debugLastStepDist = Math.hypot(this.mesh.position.x - debugPrevX, this.mesh.position.z - debugPrevZ)
    this.updateAnim()
    tickAnimalLife(this.life, dt, this.sprinting, {
      hungerThirstRate: this.isNight && !this.sprinting ? SLEEP_HUNGER_THIRST_RATE : 1,
    })
    this.lastHpPercent = applyBarPercent(
      this.hpFillEl,
      computeBarPercent(this.health.currentHp, this.health.maxHp),
      this.lastHpPercent,
    )
    this.lastStaminaPercent = applyBarPercent(
      this.staminaFillEl,
      computeBarPercent(this.life.stamina.current, this.life.stamina.max),
      this.lastStaminaPercent,
    )
    // Satiety / hydration are inverted needs (full bar = well fed/hydrated),
    // not a current/max pair, so they round inline instead of going through
    // `computeBarPercent`.
    this.lastSatietyPercent = applyBarPercent(
      this.satietyFillEl,
      Math.round((1 - this.life.hunger) * 100),
      this.lastSatietyPercent,
    )
    this.lastHydrationPercent = applyBarPercent(
      this.hydrationFillEl,
      Math.round((1 - this.life.thirst) * 100),
      this.lastHydrationPercent,
    )
    this.labelDistanceState = updateAgentLabelDistanceState(
      this.labelEl,
      this.labelBarsEl,
      this.mesh,
      this.mesh.position.distanceTo(observerPos),
      FAUNA_SHADOW_DISTANCE,
      this.labelDistanceState,
    )
    this.mixer?.update(dt)
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
    this.attackAnimTimer = this.playOneShotAnim(this.attackAction)
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
    this.attackAnimTimer = this.playOneShotAnim(this.attackAction)
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

  private updatePredator(dt: number, others: AnimalAgent[]): void {
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
    this.attackAnimTimer = this.playOneShotAnim(this.attackAction)
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
    return this.def.role === 'predator' ? this.findCarcassTarget(others) : this.findForageTarget()
  }

  private isSourceTargetValid(target: SourceTarget): boolean {
    if (target.kind === 'carcass') {
      const corpse = target.corpse
      if (!corpse) return false
      const phase = corpse.corpsePhase()
      if (!isCarcassEdible({
        dead: corpse.health.dead,
        expired: corpse.readyToRemove(),
        consumed: corpse.foodConsumedPhase === phase,
        harvested: corpse.meatHarvested,
        claimedBy: corpse.foodClaimedBy,
        eater: this,
      })) return false
      // Plan fauna-005: a non-scavenger's fresh target can decay past
      // `fresh` while it's still approaching — same rejection `findCarcassTarget`
      // would apply to a fresh search this frame, checked live rather than
      // trusting the phase cached on `target` at selection time.
      if (carcassFoodValue(phase, this.def.scavenging, this.life.hunger) == null) return false
      return corpse.foodClaimedBy === this
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
      const value = corpse.meatHarvested ? null : carcassFoodValue(phase, this.def.scavenging, this.life.hunger)
      if (value != null) {
        consumeFood(this.life, value)
        corpse.markFoodConsumed(phase)
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
        consumed: o.foodConsumedPhase === phase,
        harvested: o.meatHarvested,
        claimedBy: o.foodClaimedBy,
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
   *  one carcass. Once this phase's food is gone (`foodConsumedPhase`), a
   *  later decay into a new phase (plan fauna-005) makes it claimable again. */
  private claimAsFood(by: AnimalAgent): boolean {
    if (this.foodConsumedPhase === this.corpsePhaseValue) return false
    if (this.foodClaimedBy && this.foodClaimedBy !== by) return false
    this.foodClaimedBy = by
    return true
  }

  private releaseFoodClaim(by: AnimalAgent): void {
    if (this.foodClaimedBy === by) this.foodClaimedBy = null
  }

  /** Marks `phase` as eaten-out on this corpse (plan fauna-005) — the eater
   *  passes the live phase it just finished eating at, not necessarily
   *  `corpsePhaseValue` at some other time, so a corpse that decays mid-eat
   *  can't have the wrong phase marked consumed. */
  private markFoodConsumed(phase: CorpsePhase): void {
    this.foodConsumedPhase = phase
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
      if (colliderContainsPoint(collider, x, z)) return false
    }
    return true
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

  /** Plays a one-shot combat/death clip (attack/hurt/death — plan npc-009):
   *  clamps on its last frame instead of looping. Reuses `currentAction`'s
   *  existing fadeOut-the-previous-action bookkeeping, so `updateAnim()`'s
   *  own `playAction()` calls fade it back out cleanly once the clip's own
   *  timer (`attackAnimTimer`/`hurtAnimTimer`) lets normal locomotion resume.
   *  `null` is a safe no-op — see the action fields' own doc comment. Returns
   *  the clip's duration (`0` for a no-op) for the caller's own timer. */
  private playOneShotAnim(action: THREE.AnimationAction | null): number {
    if (!action) return 0
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    this.currentAction?.fadeOut(0.15)
    action.setEffectiveWeight(1).fadeIn(0.1).play()
    this.currentAction = action
    return action.getClip().duration
  }

  private updateAnim(): void {
    // Combat one-shots pre-empt normal locomotion (plan npc-009) — both are
    // already playing (triggered from `attack()`/`attackHuman()`/
    // `attackNpc()`/`takeDamage()`), so skip rather than restarting them
    // every frame. Death itself never reaches this method while `mounted` is
    // false: `update()`'s own `health.dead` branch returns before calling it.
    if (this.hurtAnimTimer > 0 || this.attackAnimTimer > 0) return
    if (this.sprinting) {
      this.playAction(this.gallopAction ?? this.walkAction ?? this.idleAction)
    } else if (this.moving) {
      this.playAction(this.walkAction ?? this.idleAction)
    } else {
      this.playAction(this.idleAction)
    }
  }
}
