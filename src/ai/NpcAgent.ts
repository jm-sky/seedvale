import * as THREE from 'three'
import type { PlayAt } from '../audio/createWorldAudio'
import type { CombatIntent } from '../combat/combatIntent'
import type { ResolvedDefense } from '../combat/defenseResolver'
import type { Projectile } from '../combat/projectile'
import type { RangedAttackLifecycle } from '../combat/rangedLifecycle'
import type { HuntTarget, SettlementHuntingHooks } from '../fauna/huntingHooks'
import type { DroppedItems } from '../items/createDroppedItems'
import type { ItemKind } from '../items/items'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { FamilyMember, FamilyMemberRef, FamilyRelation } from '../settlement/families'
import type { Household, HouseholdResourceKind } from '../settlement/household'
import type { HouseholdExchangeHooks } from '../settlement/householdExchange'
import type { NpcAuthoritativeState } from '../settlement/npcState'
import type { Place } from '../settlement/places'
import type { SettlementLandmarks } from '../settlement/props'
import type { VigorState } from '../shared/VigorState'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { PlayerWells } from '../world/createPlayerWells'
import type { WorkContracts } from '../world/createWorkContracts'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { HelperDeliveryHooks } from '../world/helperDeliveryHooks'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { WeatherState } from '../world/weather'
import type { HelperAssignment } from './helperAssignment'
import type { ActionId, NpcPlannedAction, Phase } from './npcAction'
import {
  disposeObject3D,
  loadGltfAnimated,
  prepareProp,
} from '../assets/loadGltf'
import {
  playActionBowRelease,
  playActionChop,
  playActionTreeFall,
  playActionWell,
  playAnimalCombatDeath,
  playCombatBowDraw,
  playCombatHit,
  playNpcCombatDeath,
} from '../audio/actionSounds'
import { MELEE_CRITICAL_MULTIPLIER } from '../combat/criticalHit'
import {
  createMeleeAttackLifecycle,
  type MeleeAttackLifecycle,
  resolveMeleeHits,
  yawToward,
} from '../combat/meleeAttack'
import { advanceProjectile, sweptProjectileHit } from '../combat/projectile'
import { rangedAccuracy, rangedDeviationRoll, resolveRangedDirection } from '../combat/rangedAttack'
import { createRangedAttackLifecycle } from '../combat/rangedLifecycle'
import { isDebugMode, isNpcCombatDebugMode } from '../debug/debugMode'
import { createNpcTraceBuffer, type NpcTraceBuffer, type NpcTraceEvent } from '../debug/npcTrace'
import {
  commitRoleWork,
  type SettlementEconomy,
  WOODCUTTING_PRODUCTION,
} from '../economy'
import { CONSTRUCTION_MATERIAL_RADIUS, consumeMaterial, hasMaterial, type MaterialRequirement } from '../items/constructionMaterials'
import { Inventory } from '../items/Inventory'
import { type AgentProfile, DEFAULT_CELL_SIZE, findPath, type NavigationQuery, type PathPoint } from '../navigation/navigation'
import { beginActivePath, endActivePath, recordPathRequest, recordRepath } from '../navigation/navigationStats'
import { generatePhysicalProfile } from '../settlement/npcPhysicalProfile'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import { householdStorageDestination } from '../settlement/storageDestinations'
import { damageHealth, type HealthState } from '../shared/HealthState'
import {
  drainStamina,
  getStaminaRatio,
  isExhausted,
  restoreStamina,
  type StaminaState,
} from '../shared/StaminaState'
import {
  type ActionLifecycle,
  type ActionLifecycleStatus,
  cancelActionLifecycle,
  completeActionLifecycle,
  copyVec3,
  createActionLifecycle,
  failActionLifecycle,
  finishActionLifecycle,
  type InteractionQueue,
  pickActionKind,
  replaceActionLifecycle,
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
import { gazeOpacityFactor } from '../ui/labelDistance'
import { recordBloodHit } from '../world/bloodTraces'
import { colliderContainsPoint, colliderRimPoint, colliderSignedDistance } from '../world/collision'
import { CARE_MAINTAINED_THRESHOLD, HYDRATION_DROUGHT_THRESHOLD } from '../world/playerGarden'
import {
  activeWellStage,
  isWellCompleted,
  type NearbyPlayerWellLookup,
  type PlayerWellRecord,
  WELL_STAGE_COST,
  WELL_WORK_SESSION_HOURS,
  WELL_WORK_SESSION_SEC,
} from '../world/playerWell'
import { gameHoursToRealSeconds } from '../world/timeConversion'
import { harvestWorldTreeFully } from '../world/treeHarvest'
import { AGENT_RENDER_LAYER, assignRenderLayer } from '../world/waterMirror'
import { noticeBoardId, type WorkContractRecord, type WorkContractState } from '../world/workContract'
import {
  type CharacterDef,
  genderForName,
  type NpcGender,
  type Role,
  type Trait,
} from './characters'
import { type ScoredNeedCandidate, scoreNeedCandidates } from './decisionModifiers'
import {
  nearestArchetype,
  pausePersonalityParams,
  type PausePersonalityParams,
  type Personality,
  pickDialogueLine,
} from './dialogue'
import {
  generateNeedPressures,
  needColor,
  type NeedId,
  type NeedState,
  needValue,
  type NpcPressure,
  pickNeed,
  type PickNeedOptions,
  relieveNeed,
  SLEEP_HUNGER_THIRST_RATE,
  tickNeeds,
} from './Needs'
import {
  type AnimalThreatResponse,
  decideAnimalThreatResponse,
  type ImmediateAnimalThreat,
  senseImmediateAnimalThreat,
  type ThreateningAnimalCandidate,
} from './npcAnimalThreat'
import { type AssistanceRequestKind, type AssistanceResult, resolveNpcAssistance } from './npcAssistance'
import {
  destinationOnColliderRim,
  isExteriorPoint,
  localEscapeRadii,
  navigationApproachTarget,
  pickEmergencyTeleportPoint,
} from './npcColliderRim'
import {
  applyNpcMeleeHit,
  applyNpcRangedHit,
  type NpcMeleeWeapon,
  type NpcRangedWeapon,
  resolveIncomingNpcDamage,
  resolveNpcAmmoKind,
  resolveNpcMeleeWeapon,
  resolveNpcRangedWeapon,
} from './npcCombat'
import { decideNpcAction, type NpcDecisionKind, scoreNpcDecisions, shouldInterruptAction } from './npcDecision'
import { ensureKnifeCarried, seedDefaultRoleWeapon, seedHunterSupplies } from './npcLoadout'
import {
  canDeliverToPlayerStorage,
  canExchangeWithHousehold,
  canWithdrawFromEconomy,
  depositFoodHarvest,
  depositWoodHarvest,
  HUNT_YIELD_KINDS,
  type NpcLogisticsCtx,
  planDeliverHuntYieldHome,
  planEconomyWithdraw,
  planHouseholdExchange,
  planPlayerStorageDelivery,
} from './npcLogistics'
import {
  createMovementWatchdog,
  type MovementWatchdog,
  registerAbandon,
  type RescueStage,
  resetMovementWatchdog,
  tickMovementWatchdog,
} from './npcMovementWatchdog'
import {
  blockPlan,
  createNpcPlan,
  goalForNeed,
  interruptPlan,
  needForGoal,
  type NpcGoalId,
  type NpcPlan,
  type NpcPlanState,
  obsoletePlan,
  planIsResumable,
  progressPlan,
  resumePlan,
  setPlanStrategy,
} from './npcPlan'
import { type NpcWorkContext, planProfessionWork } from './npcProfessionWork'
import {
  getFoodStrategyCandidates,
  getWaterDutyStrategyCandidates,
  getWaterStrategyCandidates,
  getWoodStrategyCandidates,
  type NpcStrategyCandidate,
  type NpcStrategyId,
  selectStrategy,
} from './npcStrategies'
import {
  applyDamageVigor,
  applySleepVigor,
  applyWorkVigor,
  isHeavyWorkKind,
  preferHomeSleep,
  shouldCollapseSleep,
  shouldStayAsleep,
  type SleepReason,
  tickVigorForSimulatedStep,
} from './npcVigor'
import {
  FRIENDLY_TALK_SOUND_VOLUME,
  NPC_GREETING_SOUND_URLS,
  NPC_HMM_VOICE_URLS,
  NPC_QUEST_COMPLETE_SOUND_URLS,
  NPC_REACTION_SOUND_URLS,
  type NpcVoiceActor,
  pickNpcFriendlyTalkSound,
  REACTION_SOUND_VOLUME,
  voiceActorForIndex,
} from './npcVoiceLines'
import { selectBestWorkContract } from './npcWorkContract'
import {
  computeReactionChance,
  type PlayerSocialLookup,
  type ReactionTier,
  reactionTierForRelation,
} from './reactionChance'
import {
  activityAt,
  effectiveScheduleFor,
  idleIntentFor,
  isNightLeisureTime,
  nextBoundary,
  SCHEDULE_TEMPLATES,
  type ScheduleActivity,
  type ScheduleTemplate,
} from './schedule'
import { conversationAttemptCooldownSec } from './socialBehaviour'
import { type NpcDecisionTarget, weatherShelterPressure } from './weatherPressure'
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

function randRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min)
}

const WALK_SPEED = 2.4
const ARRIVE = 0.55
export const NPC_HEIGHT = 1.75
/** Skip the shadow pass for NPCs beyond this distance — they still draw, but
 *  ~9 skinned submeshes × shadow map was a large submit cost (plan 113 P2).
 *  Exported so `shadowBudget.ts` can reuse the same radius to decide whether
 *  any shadow-casting NPC is currently in range (plan 145 R1). */
export const NPC_SHADOW_DISTANCE = 36
/** Minimum clearance above waterLevel an NPC will walk into or wander toward. */
const WATER_MARGIN = 0.3
/**
 * Buffer added to a collider's own radius (plan 097 §2.2 — colliders come
 * from the shared registry now, well included; see `createSettlement.ts`)
 * when deciding whether a *destination* near that collider is allowed to
 * enter its disk — e.g. the well's serving stand / a workplace right next to
 * an obstacle. Farther goals skirt around instead of walking through.
 */
const NPC_COLLIDER_APPROACH_BUFFER = 0.4
/** Even an approach-allowed destination may not bring an NPC's feet past
 *  this fraction of a collider's radius (keeps feet out of e.g. the well's
 *  water cylinder while still reaching the rim). */
const NPC_COLLIDER_CORE_FRACTION = 0.55
/** Clearance (meters) past a collider's rim used for the A* goal when the
 *  real interaction destination sits inside `NPC_COLLIDER_APPROACH_BUFFER`
 *  of that collider (plan npc-007) — a raw destination that close can snap,
 *  on `navigation.ts`'s coarse `DEFAULT_CELL_SIZE` grid, to a goal cell that
 *  is still inside the collider (or on its wrong side), so A* is instead
 *  aimed at a point far enough out to survive that grid's worst-case
 *  snapping error (`cellSize` on each axis). The existing destination-aware
 *  final approach (`isWalkable`/`resolveSteerTarget`) covers the short
 *  remaining stretch onto the actual destination once the route arrives. */
const NAV_APPROACH_CLEARANCE = DEFAULT_CELL_SIZE * Math.SQRT2

/** How strongly nearby NPCs suppress this NPC's chance to react ("Hmm?") to
 *  the player, scaled by `nearbyNpcCount * (1 - openness)` — see
 *  `reactionChance` in `update()`. A lone NPC (`nearbyNpcCount === 0`) always
 *  keeps its full chance regardless of this constant (issue 010). */
const GROUP_SUPPRESSION_STRENGTH = 0.6
/** Retry delay after a suppressed (rolled-and-failed) reaction check — much
 *  shorter than the normal post-reaction `cooldownRange`, so a lingering
 *  player can still eventually trigger it, just at a throttled cadence
 *  instead of re-rolling every frame. */
const SUPPRESSED_REACTION_RETRY_COOLDOWN = 1.5
/** Throttle for re-running `decideAnimalThreatResponse` while a threat is
 *  still sensed (plan 179 §12/§13) — perception itself stays fresh every
 *  frame; this only paces re-scoring/re-picking a flee point so a fleeing
 *  NPC doesn't jitter its destination every frame. */
const ANIMAL_THREAT_REACTION_INTERVAL_SEC = 1.5
/** Distance (world units) the `flee` destination is placed beyond the NPC,
 *  away from the threat — same order of magnitude as fauna's own
 *  `FLEE_DISTANCE` (`AnimalAgent.ts`). */
const NPC_FLEE_DISTANCE = 8

export type { NpcGender }
export { genderForName }

/** Quaternius Modular Men/Women — village-flavoured variants, one pool per gender. */
export const NPC_MODEL_URLS: Record<NpcGender, readonly string[]> = {
  male: [
    '/models/characters/Farmer.glb',
    '/models/characters/Worker.glb',
    '/models/characters/Casual_Hoodie.glb',
    '/models/characters/Casual_2.glb',
  ],
  female: [
    '/models/characters/Female_Worker.glb',
    '/models/characters/Female_Casual.glb',
    '/models/characters/Female_Medieval.glb',
    '/models/characters/Female_Formal.glb',
  ],
}

function modelUrlFor(gender: NpcGender, treeIndex: number): string {
  const pool = NPC_MODEL_URLS[gender]
  return pool[treeIndex % pool.length]!
}

export type { ActionId, NpcPlannedAction, Phase } from './npcAction'

/** Public, dialogue-facing summary of what an NPC is doing right now — a
 *  narrower, stable view over the private `phase`/`pendingAction` FSM state
 *  (`getCurrentActivity()` below), so callers outside this class never see
 *  `Phase`/`PlannedAction` themselves (`docs/plans/archive/2026-08-09--048...`). */
export type CurrentActivityKind = 'combat' | 'eat' | 'idle' | 'need' | 'sleep' | 'talking' | 'wander' | 'work'

export type CurrentActivity = {
  kind: CurrentActivityKind
  /** Set only when `kind === 'need'` — which need currently has the NPC's
   *  attention (`activeNeed`). */
  need?: NeedId
  /** Set when `schedule` has a known upcoming boundary (`nextBoundary`) worth
   *  mentioning — e.g. `sleep`/`work` "...until HH:MM". Absent when there's
   *  nothing schedule-relevant about the current activity (e.g. `wander`). */
  endHour?: number
}

/** Read-only diagnostic snapshot (plan 170 — NPC simulation inspector and
 *  trace). Plain data only, no live references into simulation state, so a
 *  UI/console caller cannot mutate the NPC through it — see
 *  `NpcAgent.createInspectionSnapshot()`. */
export type NpcInspectionSnapshot = {
  id: string
  name: string
  displayName: string
  role: Role
  position: { x: number, z: number }
  phase: Phase
  activity: CurrentActivity
  needs: NeedState
  activeNeed: NeedId
  /** Pressures generated for the last `choose()` arbitration (plan ai-001)
   *  — a plain-data copy, not a live reference into NPC state. */
  pressures: readonly NpcPressure[]
  /** Same arbitration with personality/role modifiers applied (plan ai-002)
   *  — the base/modifier/final breakdown `choose()` actually picked from.
   *  Optional so older synthetic snapshots (tests) stay valid; always
   *  populated by `createInspectionSnapshot()`. */
  candidates?: readonly ScoredNeedCandidate[]
  /** Top-level `choose()` outcome candidates (review 2026-09-03 §5 E4) —
   *  `scoreNpcDecisions()`'s materialized ordering, mirroring
   *  `AnimalAgent`'s `getDebugInfo().behaviourCandidates`. Optional for the
   *  same reason as `candidates` above; always populated by
   *  `createInspectionSnapshot()`. */
  decisionScores?: readonly ScoredAction<NpcDecisionKind>[]
  /** Candidate ways to satisfy `activeNeed` and which one was picked (plan
   *  ai-003) — the same values `beginNeed()` used, never recomputed here. */
  strategyCandidates: readonly NpcStrategyCandidate[]
  selectedStrategy: NpcStrategyId | null
  /** Persistent Goal + Strategy + progress (plan ai-004) — `null` when this
   *  NPC has no current Plan. Read straight off `NpcAuthoritativeState`, not
   *  derived from `pendingAction`. */
  plan: {
    goal: NpcGoalId
    strategy: NpcStrategyId | null
    state: NpcPlanState
    progress: number
    currentStep: string
  } | null
  /** This NPC's outstanding Work Contract commitment (plan npc-015 §14), or
   *  `null` when it has none — resolved fresh from `WorkContracts` every
   *  snapshot, never a second copy of the authoritative state. */
  contract: { id: string, state: WorkContractState, rewardCoins: number } | null
  action: {
    kind: ActionId
    destination: { x: number, y: number, z: number }
    queueId: string | null
    status: ActionLifecycleStatus
  } | null
  queue: {
    id: string
    /** Index in the FIFO waiting line, or `-1` once promoted to `serving`. */
    position: number
    serving: boolean
  } | null
  watchdog: {
    rescueStage: RescueStage
    lowProgressStrikes: number
    recentRescueCount: number
  }
  stamina: { current: number, max: number }
  vigor: { current: number, max: number }
  health: { current: number, max: number }
  household: { food: number, wood: number, water: number } | null
  frozen: boolean
}

/** Compact causal explanation over the same authoritative state
 *  `createInspectionSnapshot()` reads — a projection, not a second decision
 *  engine (plan 170 §3 / implementation notes §6). `blocked` is only ever
 *  derived from the queue's own reported state, never guessed. */
export type NpcWhy = {
  need: { id: NeedId, value: number | null }
  /** Pressures that fed the last `choose()` arbitration (plan ai-001) — the
   *  same list `createInspectionSnapshot()` reports, not recomputed here. */
  pressures: readonly NpcPressure[]
  phase: Phase
  action: { kind: ActionId, target: string | null } | null
  queue: { id: string, position: number, serving: boolean } | null
  blocked: string | null
}

/** Carries a chained action's classification forward onto its `next` leg
 *  (see `NpcPlannedAction.chainKind`) — a chained leg like ore-gathering's
 *  `deposit` should still be recognised as `mine`'s chain, not read as its
 *  own, ambiguous `deposit` kind. Exported/pure so the ore-deliver
 *  regression (`docs/plans/LOOSE-ENDS.md` 2026-08-16) can be unit tested
 *  without constructing a full `NpcAgent`. */
export function promoteChainKind(parent: { kind: ActionId; chainKind?: ActionId }): ActionId {
  return parent.chainKind ?? parent.kind
}

/** `getCurrentActivity()`'s `execute`/`goTo`/`exhausted` classification,
 *  pulled out as a pure function for the same testability reason as
 *  `promoteChainKind`. `pending` is `undefined` when there is no in-flight
 *  action (idle). */
export function classifyPendingActivity(
  pending: { kind: ActionId; chainKind?: ActionId } | undefined,
  activeNeed: NeedId,
): CurrentActivityKind {
  if (!pending) return 'idle'
  const chainKind = pending.chainKind ?? pending.kind
  // `mine`/`fish`/`harvest`/`plant`/`sharpen` are all schedule-`work`-driven
  // profession actions (miner/fisher/farmer/blacksmith) — same "reads as
  // work, not a need" contract as `mine` already had before this plan.
  if (
    chainKind === 'work' || chainKind === 'mine' || chainKind === 'fish'
    || chainKind === 'harvest' || chainKind === 'plant' || chainKind === 'sharpen'
  ) return 'work'
  if (pending.kind === 'eat' && activeNeed === 'idle') return 'eat'
  // Plan 151 — walking to/settling at the campfire reads as ordinary idle;
  // the shared interaction itself reuses the existing player-facing
  // `talking` kind (implementation notes §11), not a new one.
  if (chainKind === 'conversation') return 'talking'
  if (pending.kind === 'social' && activeNeed === 'idle') return 'idle'
  // Weather shelter reaction (plan npc-012) — never Need-driven (activeNeed
  // is 'idle' whenever `seekShelter` wins arbitration), same "idle" reading
  // as walking to/settling at the campfire above.
  if (pending.kind === 'shelter' && activeNeed === 'idle') return 'idle'
  return 'need'
}

/** Pure projection behind `NpcAgent.why()` — pulled out for the same
 *  testability reason as `classifyPendingActivity`/`promoteChainKind`
 *  (plan 170 §3): facts only, derived from an already-built snapshot, never
 *  a second decision engine. `blocked` is set only when the queue itself
 *  reports this NPC is waiting, never guessed. */
export function projectNpcWhy(snapshot: NpcInspectionSnapshot, needValue: number | null): NpcWhy {
  return {
    need: { id: snapshot.activeNeed, value: needValue },
    pressures: snapshot.pressures,
    phase: snapshot.phase,
    action: snapshot.action ? { kind: snapshot.action.kind, target: snapshot.action.queueId } : null,
    queue: snapshot.queue,
    blocked: snapshot.queue && !snapshot.queue.serving ? 'waiting for queue slot' : null,
  }
}

/** Phases the player's approach may interrupt to trigger a lookAtPlayer pause. */
const PAUSE_INTERRUPTIBLE_PHASES: ReadonlySet<Phase> = new Set([
  'choose',
  'followPath',
  'goTo',
  'wander',
])

/** Phases that regenerate stamina. `execute`/`goTo` drain it instead — at a
 *  rate that depends on what's actually happening (see `WALK_FATIGUE_RATE`
 *  / `LIGHT_EXECUTE_FATIGUE_RATE` / `BASE_FATIGUE_RATE`), not a flat
 *  per-phase rate. */
const REST_PHASES: ReadonlySet<Phase> = new Set(['exhausted', 'followPath', 'goSleep', 'lookAtPlayer', 'sleep', 'wander'])
/** Movement phases the stuck-detection watchdog should watch — phases where
 *  `steerTo` is chasing a real, externally-meaningful target. `execute`,
 *  `choose`, `sleep`, `lookAtPlayer`, `exhausted` are deliberately stationary
 *  and must never be flagged as stuck. */
const WATCHDOG_PHASES: ReadonlySet<Phase> = new Set(['followPath', 'goSleep', 'goTo', 'wander'])

/** Household resource flow (plan 069). `WOOD_HARVEST_AMOUNT` mirrors
 *  `WOODCUTTING_PRODUCTION`'s existing settlement yield — a chop still
 *  produces the same amount of wood, it now lands in the chopper's own
 *  household first (capped, overflow to the settlement) instead of going
 *  straight to `SettlementEconomy`. `FOOD_GATHER_AMOUNT` is a new, equally
 *  small constant — there is no real farming yield to reuse yet (071). */
const WOOD_HARVEST_AMOUNT =
  WOODCUTTING_PRODUCTION.outputs.find((o) => o.kind === 'wood')?.amount ?? 2
/** Water logistics (plan 122) — one well trip fills this much of the
 *  household's `WaterBarrel`/`AnimalTrough` reserve. Same order of
 *  magnitude as `npcLogistics.ts`'s `FOOD_GATHER_AMOUNT` (moved there,
 *  review 2026-09-03 §8 step 3) against `WATER_POLICY`'s capacity 5. */
const WATER_FETCH_AMOUNT = 2
/** How much stored household water one drink-at-home visit consumes. */
const WATER_DRINK_FROM_STOCK_AMOUNT = 1
/** How far (world units) from this NPC's household home a completed
 *  player-built well is considered as an alternative to the settlement's own
 *  well (plan 127 §10) — bounded so the choice stays local/deterministic,
 *  not a world-wide search. See `resolveWaterWellTarget`. */
const PLAYER_WELL_WATER_SEARCH_RADIUS = 60

/** NPC carry capacity — only ever needs to hold a handful of profession
 *  yields (weight ~1 each) at a time, a small fraction of the player's
 *  `DEFAULT_MAX_WEIGHT`. */
const NPC_CARRY_MAX_WEIGHT = 5

/** Real hunger-source discovery radius (plan 174) — same order of magnitude
 *  as `npcProfessionWork.ts`'s `ORE_SEARCH_RADIUS`/wood's 80, chosen (not
 *  derived) so a hungry NPC checks its immediate surroundings before
 *  falling back to the abstract settlement-garden gather. */
const FOOD_SOURCE_SEARCH_RADIUS = 60

/** Night campfire opportunity (plan npc-013) — a maximum willingness-to-
 *  travel-for-leisure bound, not a pathfinding/search radius: an idle NPC
 *  farther than this from its settlement's campfire treats the opportunity
 *  as unavailable rather than crossing the settlement for it. Same order of
 *  magnitude as the other settlement-local radii above. */
const NIGHT_CAMPFIRE_MAX_TRAVEL_DISTANCE = 45

/** Hunting expedition (plan 178) — search radius reaches beyond the
 *  settlement footprint into `AnimalSpawner`'s ring of habitat spawn points,
 *  a larger order of magnitude than `FOOD_SOURCE_SEARCH_RADIUS`/
 *  `npcProfessionWork.ts`'s `ORE_SEARCH_RADIUS` (chosen, not derived —
 *  those search *within* the settlement, this searches the wilds around
 *  it). */
const HUNT_SEARCH_RADIUS = 140
/** A hunt attempt tops carried arrows up to this many from the household's
 *  own crafted stock (arrow crafting, `npcProfessionWork.ts`) before
 *  checking whether it can actually fire — bounded so one resupply can't
 *  strip the whole household stock into a single carry trip. */
const HUNT_RESUPPLY_ARROW_TARGET = 8
/** One expedition yields at most this many kills (plan §2) — carry weight
 *  (`NPC_CARRY_MAX_WEIGHT`) already caps it in practice most of the time via
 *  `harvestAnimalIntoInventory`'s own `canAdd` gate; this is the explicit
 *  hard ceiling the plan asks for regardless of carry room. */
const HUNT_MAX_KILLS_PER_TRIP = 3

/** Plan 176 §6.1 gates — an NPC only considers tidying a garden plot it has
 *  already arrived at for its own hunger, and only when its own critical
 *  needs and physical condition are fine. Chosen, not derived: same "tuning
 *  constant, not a formula" status as `FOOD_SOURCE_SEARCH_RADIUS`. */
const NPC_GARDEN_MAINTENANCE_MIN_HEALTH_RATIO = 0.5
const NPC_GARDEN_MAINTENANCE_MIN_STAMINA_RATIO = 0.4
const NPC_GARDEN_MAINTENANCE_CHANCE = 0.35
/** Same gates/chance as garden maintenance (plan settlements-npcs-001 §13),
 *  just checking hydration instead of care. */
const NPC_GARDEN_WATERING_CHANCE = 0.35

/** Game-time step used by `resolveTimeSkip` to replay a `timeSkip.ts`
 *  period in coarse increments instead of one big end-of-skip jump — close
 *  to the natural re-trigger cadence of the fastest-decaying need (`thirst`)
 *  at default `Needs.ts`/`dayNight.ts` rates, so a multi-hour skip still
 *  resolves roughly as many satisfy-cycles as unskipped play would have.
 *  See `docs/plans/archive/2026-08-12--075--time-skip-npc-catchup.md`. */
const TIME_SKIP_SAMPLE_HOURS = 0.5

/** Chance per `choose` cycle — when no active need routes the NPC anywhere
 *  specific and it would otherwise wander a few units from home — that it
 *  instead walks its settlement's dock path (`landmarks.dockRoute`, set by
 *  `createSettlement.ts` only for settlements near enough to water to have
 *  resolved one — see `settlement/roadNetwork.ts`). */
const FOLLOW_DOCK_PATH_CHANCE = 0.08
/** Random wander radius around home / garden while lingering on a schedule block. */
const IDLE_WANDER_SPREAD = 4

/** How long (seconds, before `waitMultiplier`) a scheduled `work` action
 *  occupies an NPC at its `workplace` before it loops back to `choose` —
 *  same order of magnitude as the resource-action waits above (0.8-1.6). */
const WORK_DURATION_RANGE: [number, number] = [2, 4]

/** How long (seconds, before `waitMultiplier`) `beginSeekShelter`'s first
 *  `shelter` action occupies the NPC once it reaches home — same "settle in"
 *  order of magnitude as `social`'s 1.0 (`beginIdle`), not a real interaction
 *  duration. */
const SHELTER_SETTLE_DURATION_SEC = 1.2

/** stamina/sec while walking toward a task (`goTo`) — deliberately low so
 *  ordinary errands (house → well → workplace → storage) don't meaningfully
 *  dent stamina; only sustained heavy work should. */
const WALK_FATIGUE_RATE = 0.5
/** stamina/sec while performing a heavy `execute` action (`isHeavyWorkKind`
 *  — chop/work). */
const BASE_FATIGUE_RATE = 3
/** stamina/sec while performing a light `execute` action (drink/eat/deposit)
 *  — these are brief (~1-1.6s) regardless, so this mostly keeps the
 *  small-effort/small-cost contract explicit rather than being impactful. */
const LIGHT_EXECUTE_FATIGUE_RATE = 0.3
const BASE_REST_RATE = 6 // stamina/sec while in a REST_PHASES phase
const ENERGETIC_FATIGUE_MULT = 0.6
const ENERGETIC_REST_MULT = 1.5
/** Forced-rest (`'exhausted'`) ends once stamina climbs back to this ratio —
 *  same order of magnitude as fauna's existing `STAMINA_REST_THRESHOLD`
 *  (`AnimalLife.ts`). */
const STAMINA_EXHAUSTED_RESUME_RATIO = 0.35
/** After a stuck `abandon`, skip restarting the same destination so `choose`
 *  in this frame (and the next couple of seconds) cannot immediately rebuild
 *  the trapped action. */
const ABANDON_RETRY_COOLDOWN_SEC = 2.5
const ABANDON_DEST_MATCH_DIST = 1.0

/** Throttle for `tickCriticalInterrupt` — checked at most this often while
 *  `goTo`/`execute` is in flight, not every frame (plan 114). Same order of
 *  magnitude as the watchdog's `STUCK_CHECK_INTERVAL_SEC`. */
const CRITICAL_INTERRUPT_CHECK_INTERVAL_SEC = 1

/** Below this currentHp/maxHp fraction, walk speed starts dropping toward the floor.
 *  Kept for real damage later — fatigue no longer touches HP (plan 045). */
const HP_SLOW_THRESHOLD = 0.3
const HP_SLOW_FLOOR = 0.55
/** `night_owl` blunts the low-HP slowdown instead of removing it. */
const HP_SLOW_FLOOR_NIGHT_OWL = 0.8

const FAST_WORKER_WAIT_MULT = 0.8
const SOCIABLE_TRIGGER_MULT = 1.3
const SOCIABLE_LOOK_MULT = 1.2

/** `sociable` NPCs notice the player sooner and linger on the look longer —
 *  multiplies on top of the personality-derived params rather than replacing them. */
function applySociableBoost(
  params: PausePersonalityParams,
  traits: readonly Trait[],
): PausePersonalityParams {
  if (!traits.includes('sociable')) return params
  return {
    triggerDistance: params.triggerDistance * SOCIABLE_TRIGGER_MULT,
    lookDurationRange: [
      params.lookDurationRange[0] * SOCIABLE_LOOK_MULT,
      params.lookDurationRange[1] * SOCIABLE_LOOK_MULT,
    ],
    cooldownRange: params.cooldownRange,
  }
}

/**
 * @domain settlements-npcs
 * @system npc-agent
 * @role Central per-NPC behaviour integration point: needs, FSM/schedule,
 *  personality-driven decisions and combat.
 * @owns NpcAuthoritativeState
 * @uses Household SettlementEconomy Needs
 * @simulation tick
 */
export class NpcAgent {
  readonly mesh: THREE.Object3D
  readonly label: CSS2DObject
  readonly name: string
  /** Display-only — `name` alone stays the matching key for quests/dialogue
   *  (`quests/quests.ts` hardcodes `giverName` as first name only). */
  readonly displayName: string
  /**
   * Settlement-scoped id (`${settlementId}:npc:${i}`) for interaction queues
   * and other shared simulation membership. Distinct from `name` (dialogue key).
   */
  readonly id: string
  readonly gender: NpcGender
  /** Deterministic voice actor from the Super Dialogue Audio Pack — one consistent
   *  voice per NPC across greeting/farewell/confirmation/hmm clips (see `voiceActorForIndex`). */
  readonly voiceActor: NpcVoiceActor
  readonly role: Role
  readonly traits: readonly Trait[]
  readonly personality: CharacterDef['personality']
  readonly relation: FamilyRelation
  readonly health: HealthState
  readonly stamina: StaminaState
  readonly vigor: VigorState
  /** `null` only when the role's landmark doesn't exist for this settlement
   *  (e.g. a `woodcutter` with no trees yet) — see `places.ts`'s
   *  `workplaceFor`. Consumed by `beginIdle()`'s `work` scheduled activity. */
  readonly workplace: Place | null
  /** The settlement's own campfire as a Social Place (plan 151), or `null`
   *  when the settlement has none — see `places.ts`'s `socialPlaceFor`.
   *  Consumed by `beginIdle()`'s `social` scheduled activity, same shape as
   *  `workplace` above. */
  readonly socialPlace: Place | null
  /** Effective per-NPC schedule (`effectiveScheduleFor` of the role template
   *  + traits). Computed once at construction. Drives `choose` and
   *  `getScheduledActivity` / dialogue boundaries. */
  readonly schedule: ScheduleTemplate
  /** The rest of this NPC's family (not including itself) — just enough for
   *  dialogue to name them ("mam żonę Annę"), not live references to their
   *  `NpcAgent` state. Empty for a `single` member. See `createSettlement.ts`. */
  readonly familyMembers: readonly FamilyMemberRef[]
  private readonly dialogueArchetype: Personality
  private readonly pauseParams: PausePersonalityParams
  /** Multiplier on top of the situational fatigue rate constants
   *  (`WALK_FATIGUE_RATE`/`BASE_FATIGUE_RATE`/`LIGHT_EXECUTE_FATIGUE_RATE`) —
   *  `energetic` drains slower. */
  private readonly fatigueMult: number
  private readonly restRate: number
  private readonly waitMultiplier: number
  private readonly sampleHeight: HeightSampler
  private readonly waterLevel: number
  private readonly collidersNear: ColliderSource
  private readonly landmarks: SettlementLandmarks
  private readonly needs: NeedState
  private readonly home: THREE.Vector3
  private readonly mixer: THREE.AnimationMixer
  private readonly idleAction: THREE.AnimationAction | null
  private readonly walkAction: THREE.AnimationAction | null
  private readonly interactAction: THREE.AnimationAction | null
  /** Combat/death presentation clips (plan npc-009) — semantic mapping over
   *  whatever the loaded GLB actually exports (`findAction`'s existing
   *  name-list fallback), never a hard-coded clip name in combat logic. `null`
   *  is a safe, silent fallback (existing Idle/Walk keep playing, no crash) —
   *  every model in `NPC_MODEL_URLS` today carries all four, but a future
   *  pool entry might not. */
  private readonly attackMeleeAction: THREE.AnimationAction | null
  private readonly attackRangedAction: THREE.AnimationAction | null
  private readonly hurtAction: THREE.AnimationAction | null
  private readonly deathAction: THREE.AnimationAction | null
  /** Counts down while the one-shot `hurtAction` should keep pre-empting
   *  `syncAnimation()`'s normal idle/walk/interact crossfade (plan npc-009) —
   *  `0` outside a hurt reaction. Set from `takeDamage()`, decremented in
   *  `update()` alongside the other cooldown-style timers. */
  private hurtAnimTimer = 0
  /** `simClock` at which the one-shot `deathAction` finishes playing (plan
   *  npc-009) — bounds how long a dead NPC's `update()` keeps ticking its own
   *  mixer (see the `health.dead` branch there) instead of forever. `null`
   *  when there is no `deathAction` to play (fallback tip-pose, no mixer
   *  ticking needed). */
  private deathAnimSettleAtSimClock: number | null = null
  private readonly needMarker: THREE.Mesh
  private phase: Phase = 'choose'
  private activeNeed: NeedId = 'idle'
  /** Pressures generated for the last `choose()` arbitration (plan ai-001)
   *  — a plain-data snapshot for diagnostics, not a second copy of need
   *  ownership. Empty until the first `choose()` tick. */
  private lastPressures: NpcPressure[] = []
  /** Same arbitration, with the personality/role modifiers actually applied
   *  (plan ai-002) — the exact base/modifier/final breakdown `choose()` used
   *  to pick `activeNeed`, for diagnostics only. See `scoreNeedCandidates`. */
  private lastDecisionCandidates: readonly ScoredNeedCandidate[] = []
  /** Top-level `choose()` outcome candidates (review 2026-09-03 §5 E4) —
   *  `scoreNpcDecisions()`'s materialized ordering (collapseSleep /
   *  seekShelter / need / scheduledSleep / idle), diagnostics only, same
   *  status as `lastPressures`/`lastDecisionCandidates`. Empty until the
   *  first `choose()` tick. */
  private lastDecisionScores: readonly ScoredAction<NpcDecisionKind>[] = []
  /** Candidate ways to satisfy the selected `activeNeed` (plan ai-003) — the
   *  explicit seam between need arbitration and `beginNeed()`'s existing
   *  execution branches. Diagnostics only, same as `lastPressures`/
   *  `lastDecisionCandidates`; `beginNeed()` still owns actual execution. */
  private lastStrategyCandidates: readonly NpcStrategyCandidate[] = []
  /** The strategy `selectStrategy()` picked for the current `beginNeed()`
   *  call — `null` only when every candidate was unavailable. */
  private selectedStrategy: NpcStrategyId | null = null
  /** Set by `startAction()`, consumed by the `goTo`/`execute` phases — the
   *  generic "walk there, do this" step currently in flight. `null` only
   *  outside those two phases. */
  private pendingAction: NpcPlannedAction | null = null
  /** After a one-shot scheduled action (eat) finishes, linger on that
   *  activity until the effective schedule moves on — avoids restarting the
   *  same meal every `choose` cycle. */
  private settledIdleActivity: ScheduleActivity | null = null
  /** This frame's `WeatherState`, forwarded through `SettlementsManager` →
   *  `Settlement.update()` → here (plan npc-012) — `null` for any caller/test
   *  that doesn't pass one, in which case weather never contributes pressure.
   *  Shared by every NPC in the same settlement for the frame; never
   *  recomputed here (`computeWeather()` stays owned by `gameLoop.ts`). */
  private currentWeather: WeatherState | null = null
  /** Set once this `seekShelter` reaction has actually arrived home and
   *  settled (plan npc-012) — mirrors `settledIdleActivity`'s "don't restart
   *  an already-reached destination every `choose` cycle" idiom, kept as its
   *  own field rather than folded into `settledIdleActivity` (typed
   *  `ScheduleActivity`) since sheltering is a weather-pressure reaction, not
   *  a schedule activity (plan §7 — no `shelter` `ScheduleActivity`). Reset
   *  whenever `choose()` picks anything other than `seekShelter`. */
  private shelterSettled = false
  /** Plan 151 — the other NPC id this one is currently reserved with for a
   *  `conversation`, or `null`. Set by `beginConversation()`, cleared on
   *  natural completion or early release; `socialCandidate()` treats a
   *  non-null value as unavailable, preventing a third NPC from reserving
   *  either participant mid-conversation. */
  private conversationPartnerId: string | null = null
  /** Callback into the current conversation partner's own
   *  `releaseConversationPartner()` (plan 151) — invoked once by
   *  `releaseConversationIfAny()` if *this* NPC leaves the conversation
   *  early (critical need/vigor collapse/death), so the partner tears down
   *  its own half instead of waiting out a duration nobody is still sharing.
   *  `null` outside an active conversation. */
  private onConversationEarlyExit: (() => void) | null = null
  /** Earliest `simClock` at which `socialCandidate()` will return non-null
   *  again (plan 151) — reset on every call (success or failure) to
   *  `conversationAttemptCooldownSec(extraversion)`, so a settled NPC is
   *  only ever considered for pairing at that throttled cadence, never every
   *  frame (implementation notes §3/§9). */
  private nextSocialAttemptSim = 0
  /** Shared action lifecycle for the in-flight `PlannedAction` **or** the
   *  in-flight `combat` intent (plan 177) — the same single field either
   *  way, since only one of the two is ever active at once. */
  private actionLifecycle: ActionLifecycle = createActionLifecycle()
  /** Combat intent currently being executed (plan 177), or `null` outside
   *  `phase === 'combat'`. Never chosen by `NpcAgent` itself — see
   *  `beginCombat()`. `intent.mode` decides which of the two weapon/
   *  lifecycle pairs below is actually driven each combat tick. */
  private combatIntent: CombatIntent | null = null
  /** Melee weapon resolved from `carried` when a `mode: 'melee'` combat
   *  started — cached so a mid-combat inventory change can't silently swap
   *  the active weapon's timing out from under an in-flight swing. */
  private combatMeleeWeapon: NpcMeleeWeapon | null = null
  /** Bow resolved from `carried` when a `mode: 'ranged'` combat started —
   *  same caching reason as `combatMeleeWeapon`. */
  private combatRangedWeapon: NpcRangedWeapon | null = null
  /** Shared windUp→hitWindow→recovery timer (`combat/meleeAttack.ts`, plan
   *  177) — the same neutral primitive `player/playerMelee.ts` wraps. */
  private readonly combatAttack: MeleeAttackLifecycle = createMeleeAttackLifecycle()
  /** Shared draw→release→recovery timer (`combat/rangedLifecycle.ts`, plan
   *  177) — the same neutral primitive `player/playerRanged.ts` wraps. */
  private readonly combatRangedAttack: RangedAttackLifecycle = createRangedAttackLifecycle()
  /** At most one in-flight arrow at a time (plan 177 §7) — simpler than the
   *  player's `activeProjectiles` array: an NPC won't draw a second shot
   *  while this one is still travelling (see the `combat` phase's ranged
   *  branch), so there's never more than one to track. */
  private combatProjectile: Projectile | null = null
  /** Monotonic per-agent counter — deterministic attack identity for
   *  `resolveCriticalHit`'s roll (plan 177 §Deterministic simulation),
   *  never frame number/array index/object identity. Shared by melee and
   *  ranged attempts (only one mode is ever active at once). */
  private combatAttackAttempt = 0
  /** Monotonic per-agent counter for `resolveDefense`'s incoming-damage roll
   *  (mirrors `PlayerController.nextDefenseAttempt`). */
  private defenseAttempt = 0
  /** Throttle (1 sim-second) for the `?debugNpcCombat=1` stamina-starved
   *  attack-skip log in `tickMeleeCombat` — the underlying condition can
   *  otherwise hold true for many consecutive frames while stamina regens. */
  private lastStaminaSkipLogSec = -Infinity
  /** This frame's sensed `ImmediateAnimalThreat` (plan 179 §7/§10/§12), or
   *  `null` — refreshed every `update()` call from the caller-supplied
   *  bounded `nearbyAnimalThreats` list, a situation snapshot, not a
   *  decision. See `reactToAnimalThreat()`. */
  private currentAnimalThreat: ImmediateAnimalThreat | null = null
  /** Last `decideAnimalThreatResponse` outcome (diagnostic-only cache, no
   *  behavioural effect) — lets `combatDebugSnapshot()` report whether a
   *  reaction ever ran without recomputing one, for `?debug=1&debugNpcCombat=1`.
   *  `null` until `reactToAnimalThreat()` runs at least once. */
  private lastAnimalThreatResponse: AnimalThreatResponse | null = null
  /** Throttles re-running `decideAnimalThreatResponse` while a threat is
   *  still present — perception itself (`currentAnimalThreat` above) stays
   *  fresh every frame; only the defend/flee re-scoring is throttled, same
   *  cadence idiom as `AnimalAgent`'s `humanDecisionTimer`. */
  private threatReactionCooldown = 0
  /** Kills already taken this hunting expedition (plan 178 §2) — reset at
   *  `beginHuntExpedition()`, capped by `HUNT_MAX_KILLS_PER_TRIP` in
   *  `onHuntKill()`. Not a persisted/authoritative field — a trip that's
   *  interrupted (combat cancelled/failed, settlement unload) simply starts
   *  a fresh count next time `beginHuntExpedition()` runs. */
  private huntKillsThisTrip = 0
  /** Per-spot cast counter feeding `rollFishingCatch`'s deterministic
   *  `(spot, attempt)` roll (`npcProfessionWork.ts`'s fishing planner) —
   *  this NPC's own count, not shared with the player's `fishingAttempts`
   *  map (plan settlements-npcs-002 §6: a generic reusable rule, not the
   *  exact same bait/attempt state). Written back only through
   *  `professionContext()`'s `nextFishAttempt`. */
  private fishAttempt = 0
  /** Round-robin index into `guard`'s deterministic patrol points
   *  (`npcProfessionWork.ts`'s guard planner) — same cycling idiom as
   *  `treeIndex`. Written back only through `professionContext()`'s
   *  `advanceGuardPatrol`. */
  private guardPatrolIndex = 0
  /** Destination for the `wander` phase only — resource/work destinations
   *  now live in `pendingAction.destination` instead. */
  private target = new THREE.Vector3()
  /** Waypoints for the `followPath` phase — a reference into
   *  `landmarks.dockRoute`, walked one at a time via `steerTo`. */
  private pathWaypoints: readonly THREE.Vector3[] = []
  private pathIndex = 0
  private treeIndex: number
  private wait = 0
  private moving = false
  private previousPhase: Phase | null = null
  private pauseTimer = 0
  private pauseCooldown = 0
  /** Stuck-movement detection + rescue-stage escalation — ticked only while
   *  `phase` is in `WATCHDOG_PHASES`. Pure state, see `npcMovementWatchdog.ts`. */
  private readonly watchdog: MovementWatchdog = createMovementWatchdog()
  /** Route set by a `repath` rescue attempt (`attemptRepath`, plan npc-006)
   *  — `steerWithRescue` steers through these one at a time before resuming
   *  the phase's real destination, while `repathActive` is true. Found by
   *  `navigation/navigation.ts`'s bounded local-grid A* when a direct hop
   *  can't reach the stuck destination; falls back to the old single random
   *  bypass hop (`repathTarget`) when no route exists. */
  private repathWaypoints: readonly PathPoint[] = []
  private repathIndex = 0
  private readonly repathWaypointScratch = new THREE.Vector3()
  /** Single-hop bypass target — the pre-navigation fallback rescue, still
   *  used when `findPath` finds no route around the obstacle. */
  private readonly repathTarget = new THREE.Vector3()
  private repathActive = false
  private repathIsNavRoute = false
  /** Cached `goSleep` target — house rim from the NPC's side, not `home`
   *  center. Frozen at sleep-start so the rim point does not orbit. */
  private readonly sleepDest = new THREE.Vector3()
  /** Seconds remaining after a stuck abandon during which the same dest is
   *  not restarted (plan 108). */
  private abandonCooldown = 0
  private abandonedDestX = 0
  private abandonedDestZ = 0
  private hasAbandonedDest = false
  /** Counts down while `phase` is `goTo`/`execute`; the critical-need/vigor-
   *  collapse interrupt check runs only when it reaches 0 (plan 114), then
   *  resets regardless of outcome — mirrors the watchdog's own throttle
   *  instead of scoring needs every frame. */
  private criticalInterruptCooldown = 0
  private readonly tmp = new THREE.Vector3()
  private readonly tmpAvoid = new THREE.Vector3()
  private readonly labelEl: HTMLDivElement
  private readonly labelNameEl: HTMLDivElement
  private readonly labelBarsEl: HTMLDivElement
  private readonly hpFillEl: HTMLDivElement
  private readonly staminaFillEl: HTMLDivElement
  private readonly vigorFillEl: HTMLDivElement
  private labelDistanceState: LabelDistanceState = INITIAL_LABEL_DISTANCE_STATE
  /** Debug-only diagnostic line (`?debug=1`) — phase/action/stamina/rescue
   *  state, per the movement-resilience plan's instrumentation requirement. */
  private readonly debugEl: HTMLDivElement
  /** Why the NPC is currently in `goSleep`/`sleep`. `null` when awake. */
  private sleepReason: SleepReason | null = null
  /** Set externally (e.g. by a QuestManager) — NpcAgent stays quest-agnostic. */
  private questMarker: string | null = null
  private highlighted = false
  private readonly playAt: PlayAt
  private readonly forest: SettlementForestHooks | undefined
  /** Settlement interaction queues (well today; garden/stall later). */
  private readonly queues: ReadonlyMap<string, InteractionQueue>
  /** Queue id for village-well drinks; `null` skips queueing. */
  private readonly wellQueueId: string | null
  /** Queue this agent is currently a member of (waiting or serving). */
  private activeQueueId: string | null = null
  /** Bounded semantic-event history (plan 170) — always recording (cheap,
   *  structured events only, no string formatting) so a developer can add
   *  `?debug=1` after the fact and still see recent history. Only the
   *  inspector/console surface that reads it is debug-gated. */
  private readonly trace: NpcTraceBuffer = createNpcTraceBuffer()
  /** Seconds since this NPC was constructed — trace event timestamp. Not the
   *  day/night clock: not every caller of `update()` has that handy, and a
   *  monotonic per-agent clock is enough to order this agent's own history. */
  private simClock = 0
  /** Debug-only simulation pause (plan 170 §6). `update()` early-outs before
   *  any decision/movement logic runs — the mesh keeps its last transform,
   *  a visible confirmation the freeze took effect rather than a bug. */
  private frozen = false
  /** Settlement-owned bulk stock (plan 071). Null only in isolated fallbacks. */
  private readonly economy: SettlementEconomy | null
  /** This NPC's family stock (plan 069). Null only in isolated fallbacks.
   *  Public (not `private`) so plan 168's lodging resolver can read whose
   *  household a "friend" candidate belongs to — the same object dialogue/
   *  home-trading already reads from `createSettlement.ts`, not a second
   *  ownership graph. */
  readonly household: Household | null
  /** NPC ore-mining hooks over `ResourceDeposits` (plan 131). Null when this
   *  settlement wasn't built with one (isolated fallback, same as `economy`/
   *  `household`) — the miner role then falls back to the pre-131 idle
   *  workplace stand instead of gathering. */
  private readonly mining: SettlementMiningHooks | null
  /** Authoritative work-contract lifecycle (plan npc-015) — the single world
   *  system this NPC's own commitment is always resolved from
   *  (`workContracts.findByWorker(this.id)`), never a second copy on
   *  `NpcAuthoritativeState`. Null in isolated fallbacks, same as `mining`. */
  private readonly workContracts: WorkContracts | null
  /** The one construction target kind a work contract can reference today
   *  (plan npc-015 §7) — NPC construction execution advances this same
   *  world-owned record the player's own `[E]` well-work would, through the
   *  same `addWork`/`transitionTo` seam. Null in isolated fallbacks. */
  private readonly playerWells: PlayerWells | null
  /** World-dropped items (plan npc-015 §9's material-provisioning analogue)
   *  — lets NPC construction work draw stone/branch left near the site
   *  through the exact same bounded `hasMaterial`/`consumeMaterial` radius
   *  search the player's own well-work already uses, instead of inventing a
   *  worker supply chain. Null in isolated fallbacks; a stage requiring
   *  materials then simply stays blocked (see `runContractWorkBout`). */
  private readonly droppedItems: DroppedItems | null
  /** Cached from `update()`'s own parameter (plan npc-015) — Work Contract
   *  travel-time estimation needs the real-seconds↔game-hours ratio, but
   *  isn't itself called from `update()`, so it's stashed here rather than
   *  threaded through every idle-dispatch signature. */
  private dayLengthSec = 600
  /** Generic item carrier reused from the player's own `Inventory` (plan
   *  131) — an NPC's brief hold between extracting a world resource (ore) and
   *  delivering it, not a persistent belongings system. Small capacity: one
   *  extraction's worth of ore is all it ever needs to hold at once. */
  private readonly carried = new Inventory(undefined, NPC_CARRY_MAX_WEIGHT)
  /** Relation level + player standing lookup, by NPC name — keeps `NpcAgent`
   *  quest-agnostic (`QuestManager.getRelationLevel`/`getPlayerStanding`
   *  injected from `createApp.ts`, plan 117). */
  private readonly getPlayerSocial: PlayerSocialLookup
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — an alternative water-fetch destination to `landmarks.well` when
   *  closer to this NPC's household home. See `resolveWaterWellTarget`. */
  private readonly getNearbyPlayerWell?: NearbyPlayerWellLookup
  /** NPC hunger-source discovery hooks over natural world items + crops
   *  (plan 174) — an alternative to the abstract settlement-garden gather
   *  below when a real, closer food source is available. Null in isolated
   *  fallbacks, same as `mining`. See `beginNeed`'s `'food'` branch. */
  private readonly foodSources: SettlementFoodSourceHooks | null
  /** Hunter target discovery + harvest hooks over the live `Fauna` (plan 178)
   *  — null in isolated fallbacks and for any settlement built before fauna
   *  exists, same as `mining`/`foodSources`. Only ever read by a `hunter`
   *  role NPC (`beginHuntExpedition`); every other role ignores it. */
  private readonly hunting: SettlementHuntingHooks | null
  /** Helper resource-delivery target lookup/transfer hooks over the player's
   *  own placed `Container`s (plan 167) — null in isolated fallbacks, same as
   *  `mining`/`foodSources`/`hunting`. Only ever consulted when this NPC has
   *  an active `helperAssignment` (see `npcState`'s doc). */
  private readonly helperDelivery: HelperDeliveryHooks | null
  /** Local resource exchange (plan settlements-npcs-005) — bounded, same-
   *  settlement household surplus lookup for `food`/`wood` shortage; null in
   *  isolated fallbacks, same as `mining`/`foodSources`/`hunting`/
   *  `helperDelivery`. Built once per settlement in `createSettlement.ts`. */
  private readonly householdExchange: HouseholdExchangeHooks | null
  /** Authoritative HP/needs/stamina/vigor/helper-assignment (plan 197/167) —
   *  kept as a whole reference (not just the destructured `health`/`needs`/
   *  etc. below) so `helperAssignment` reads/writes go straight to the one
   *  object every reconstruction of this npc id shares, no second copy. */
  private readonly npcState: NpcAuthoritativeState
  /** Last text/opacity/bar widths written to the label DOM — writes invalidate
   *  CSS2D label layout, so skip them when nothing changed. */
  private lastLabelText = ''
  private lastHpPercent = -1
  private lastStaminaPercent = -1
  private lastVigorPercent = -1
  private lastDebugText = ''

  private constructor(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    sampleHeight: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    landmarks: SettlementLandmarks,
    home: Place,
    workplace: Place | null,
    socialPlace: Place | null,
    treeIndex: number,
    member: FamilyMember,
    familyMembers: readonly FamilyMemberRef[],
    playAt: PlayAt,
    forest: SettlementForestHooks | undefined,
    npcId: string,
    queues: ReadonlyMap<string, InteractionQueue>,
    wellQueueId: string | null,
    economy: SettlementEconomy | null,
    household: Household | null,
    /** Authoritative HP/needs/stamina/vigor (plan 197) — the same object
     *  every reconstruction of this npc id hydrates from; see
     *  `settlement/npcState.ts`. */
    npcState: NpcAuthoritativeState,
    getPlayerSocial: PlayerSocialLookup,
    mining: SettlementMiningHooks | null,
    getNearbyPlayerWell?: NearbyPlayerWellLookup,
    foodSources?: SettlementFoodSourceHooks,
    hunting?: SettlementHuntingHooks,
    helperDelivery?: HelperDeliveryHooks,
    householdExchange?: HouseholdExchangeHooks,
    workContracts?: WorkContracts | null,
    playerWells?: PlayerWells | null,
    droppedItems?: DroppedItems | null,
  ) {
    this.playAt = playAt
    this.forest = forest
    this.id = npcId
    this.queues = queues
    this.wellQueueId = wellQueueId
    this.economy = economy
    this.household = household
    this.npcState = npcState
    this.mining = mining
    this.workContracts = workContracts ?? null
    this.playerWells = playerWells ?? null
    this.droppedItems = droppedItems ?? null
    this.getPlayerSocial = getPlayerSocial
    this.getNearbyPlayerWell = getNearbyPlayerWell
    this.foodSources = foodSources ?? null
    this.hunting = hunting ?? null
    this.helperDelivery = helperDelivery ?? null
    this.householdExchange = householdExchange ?? null
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
    this.collidersNear = collidersNear
    this.landmarks = landmarks
    this.home = home.position.clone()
    const character = member.character
    this.name = character.name
    this.displayName = character.lastName ? `${character.name} ${character.lastName}` : character.name
    this.gender = character.gender
    this.voiceActor = voiceActorForIndex(this.gender, treeIndex)
    this.role = character.role
    seedDefaultRoleWeapon(this.carried, this.role)
    if (this.role === 'hunter') seedHunterSupplies(this.carried)
    if (this.role === 'woodcutter') ensureKnifeCarried(this.carried)
    this.traits = character.traits
    this.personality = character.personality
    this.relation = member.relation
    this.health = npcState.health
    this.stamina = npcState.stamina
    this.vigor = npcState.vigor
    this.workplace = workplace
    this.socialPlace = socialPlace
    this.schedule = effectiveScheduleFor(
      SCHEDULE_TEMPLATES[character.role],
      character.traits,
      { hasSocialPlace: socialPlace != null },
    )
    this.familyMembers = familyMembers
    this.dialogueArchetype = nearestArchetype(this.personality)
    this.pauseParams = applySociableBoost(pausePersonalityParams(this.personality), this.traits)
    const energetic = this.traits.includes('energetic')
    this.fatigueMult = energetic ? ENERGETIC_FATIGUE_MULT : 1
    this.restRate = BASE_REST_RATE * (energetic ? ENERGETIC_REST_MULT : 1)
    this.waitMultiplier = this.traits.includes('fast_worker') ? FAST_WORKER_WAIT_MULT : 1
    this.treeIndex = treeIndex % Math.max(1, landmarks.trees.length)
    this.needs = npcState.needs

    prepareProp(root, NPC_HEIGHT)
    const wrapper = new THREE.Group()
    wrapper.add(root)
    // No standalone child model yet — approximate one with a smaller scale
    // on the adult model instead (`member.scale`, rolled in `families.ts`).
    if (member.scale !== 1) wrapper.scale.setScalar(member.scale)
    this.mesh = wrapper
    this.mesh.name = 'npc'
    this.mesh.position.copy(home.position)
    this.mesh.position.y = sampleHeight(home.position.x, home.position.z)

    this.mixer = new THREE.AnimationMixer(root)
    this.idleAction = this.findAction(animations, ['Idle', 'Idle_Neutral'])
    this.walkAction = this.findAction(animations, ['Walk', 'Run'])
    this.interactAction = this.findAction(animations, ['Interact', 'Wave'])
    // Quaternius Modular Men/Women (`NPC_MODEL_URLS`) export `Sword_Slash`/
    // `Gun_Shoot`/`HitRecieve`/`Death` today; `findAction`'s name-list already
    // falls back to `null` for any future pool entry without them.
    this.attackMeleeAction = this.findAction(animations, ['Sword_Slash'])
    this.attackRangedAction = this.findAction(animations, ['Gun_Shoot', 'Idle_Gun_Shoot'])
    this.hurtAction = this.findAction(animations, ['HitRecieve', 'HitRecieve_2'])
    this.deathAction = this.findAction(animations, ['Death'])
    this.idleAction?.play()

    const markerGeo = new THREE.SphereGeometry(0.12, 8, 8)
    const markerMat = new THREE.MeshStandardMaterial({
      color: needColor('idle'),
      emissive: needColor('idle'),
      emissiveIntensity: 0.45,
      flatShading: true,
    })
    this.needMarker = new THREE.Mesh(markerGeo, markerMat)
    this.needMarker.position.set(0, NPC_HEIGHT + 0.25, 0)
    this.mesh.add(this.needMarker)

    this.lastLabelText = this.displayName
    const hpBar = createLabelBar('hp')
    const staminaBar = createLabelBar('stamina')
    const vigorBar = createLabelBar('vigor')
    this.hpFillEl = hpBar.fill
    this.staminaFillEl = staminaBar.fill
    this.vigorFillEl = vigorBar.fill
    const labelDom = createAgentLabel(this.displayName, [hpBar, staminaBar, vigorBar], NPC_HEIGHT + 0.55)
    this.labelEl = labelDom.el
    this.labelNameEl = labelDom.nameEl
    this.labelBarsEl = labelDom.barsEl
    this.label = labelDom.label

    this.debugEl = document.createElement('div')
    this.debugEl.className = 'npc-label__debug'
    this.debugEl.style.display = 'none'
    this.labelEl.append(this.debugEl)

    this.mesh.add(this.label)
    assignRenderLayer(this.mesh, AGENT_RENDER_LAYER)

    // Hydrating an npc id whose authoritative state is already dead
    // (settlement unload/reload, `WorldBundle` rebuild) must not resurrect
    // it — reflect the dead pose immediately instead of leaving the
    // fresh-alive setup above in place (plan 197 §5). Safe to reuse `die()`
    // here: every field it touches is still at its just-constructed default.
    // `alreadySettled` (plan npc-009) skips playing the death clip from frame
    // 0 — a reconstructed corpse should present its settled end pose
    // immediately, not replay the whole collapse animation on every load/
    // stream-in.
    if (this.health.dead) this.die(true)
  }

  static async create(
    sampleHeight: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    landmarks: SettlementLandmarks,
    home: Place,
    workplace: Place | null,
    socialPlace: Place | null,
    treeIndex: number,
    needOffset: number,
    member: FamilyMember,
    familyMembers: readonly FamilyMemberRef[],
    playAt: PlayAt = () => {},
    modelUrl = modelUrlFor(member.character.gender, treeIndex),
    forest?: SettlementForestHooks,
    npcId = '',
    queues: ReadonlyMap<string, InteractionQueue> = new Map(),
    wellQueueId: string | null = null,
    economy: SettlementEconomy | null = null,
    household: Household | null = null,
    /** Authoritative HP/needs/stamina/vigor (plan 197). Defaults to a fresh
     *  state for callers with no `SettlementsManager`-backed registry to
     *  hand in — same "isolated fallback" idiom as `economy`/`household`
     *  defaulting to `null`. Still derives real per-member maxima from
     *  `member`'s own sex/age (plan npc-001) rather than a hidden flat
     *  100/100/100 — `treeIndex` stands in for the settlement seed this
     *  isolated path doesn't have. */
    npcState: NpcAuthoritativeState = createNpcAuthoritativeState(
      npcId,
      needOffset,
      generatePhysicalProfile(treeIndex, member.character.gender, member.age),
    ),
    getPlayerSocial: PlayerSocialLookup = () => ({ relationLevel: 'stranger', standing: 0 }),
    mining: SettlementMiningHooks | null = null,
    getNearbyPlayerWell?: NearbyPlayerWellLookup,
    foodSources?: SettlementFoodSourceHooks,
    hunting?: SettlementHuntingHooks,
    helperDelivery?: HelperDeliveryHooks,
    householdExchange?: HouseholdExchangeHooks,
    workContracts?: WorkContracts | null,
    playerWells?: PlayerWells | null,
    droppedItems?: DroppedItems | null,
  ): Promise<NpcAgent> {
    try {
      const { scene, animations } = await loadGltfAnimated(modelUrl)
      return new NpcAgent(
        scene,
        animations,
        sampleHeight,
        waterLevel,
        collidersNear,
        landmarks,
        home,
        workplace,
        socialPlace,
        treeIndex,
        member,
        familyMembers,
        playAt,
        forest,
        npcId,
        queues,
        wellQueueId,
        economy,
        household,
        npcState,
        getPlayerSocial,
        mining,
        getNearbyPlayerWell,
        foodSources,
        hunting,
        helperDelivery,
        householdExchange,
        workContracts,
        playerWells,
        droppedItems,
      )
    } catch (err) {
      console.warn(`[npc] failed to load ${modelUrl}, using capsule`, err)
      return NpcAgent.createCapsuleFallback(
        sampleHeight,
        waterLevel,
        collidersNear,
        landmarks,
        home,
        workplace,
        socialPlace,
        treeIndex,
        member,
        familyMembers,
        playAt,
        forest,
        npcId,
        queues,
        wellQueueId,
        economy,
        household,
        npcState,
        getPlayerSocial,
        mining,
        getNearbyPlayerWell,
        foodSources,
        hunting,
        helperDelivery,
        householdExchange,
        workContracts,
        playerWells,
        droppedItems,
      )
    }
  }

  private static createCapsuleFallback(
    sampleHeight: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    landmarks: SettlementLandmarks,
    home: Place,
    workplace: Place | null,
    socialPlace: Place | null,
    treeIndex: number,
    member: FamilyMember,
    familyMembers: readonly FamilyMemberRef[],
    playAt: PlayAt,
    forest: SettlementForestHooks | undefined,
    npcId: string,
    queues: ReadonlyMap<string, InteractionQueue>,
    wellQueueId: string | null,
    economy: SettlementEconomy | null,
    household: Household | null,
    npcState: NpcAuthoritativeState,
    getPlayerSocial: PlayerSocialLookup,
    mining: SettlementMiningHooks | null,
    getNearbyPlayerWell?: NearbyPlayerWellLookup,
    foodSources?: SettlementFoodSourceHooks,
    hunting?: SettlementHuntingHooks,
    helperDelivery?: HelperDeliveryHooks,
    householdExchange?: HouseholdExchangeHooks,
    workContracts?: WorkContracts | null,
    playerWells?: PlayerWells | null,
    droppedItems?: DroppedItems | null,
  ): NpcAgent {
    const capsule = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.7, 3, 6),
      new THREE.MeshStandardMaterial({
        color: needColor('idle'),
        flatShading: true,
      }),
    )
    body.position.y = 0.75
    body.castShadow = true
    capsule.add(body)
    return new NpcAgent(
      capsule,
      [],
      sampleHeight,
      waterLevel,
      collidersNear,
      landmarks,
      home,
      workplace,
      socialPlace,
      treeIndex,
      member,
      familyMembers,
      playAt,
      forest,
      npcId,
      queues,
      wellQueueId,
      economy,
      household,
      npcState,
      getPlayerSocial,
      mining,
      getNearbyPlayerWell,
      foodSources,
      hunting,
      helperDelivery,
      householdExchange,
      workContracts,
      playerWells,
      droppedItems,
    )
  }

  getActiveNeed(): NeedId {
    return this.activeNeed
  }

  /** Current helper resource-delivery assignment (plan 167), or `null` — read
   *  by the Villagers screen to render assignment state per NPC. */
  get helperAssignment(): HelperAssignment | null {
    return this.npcState.helperAssignment
  }

  /** Sets/clears this NPC's helper assignment (plan 167 §14 — the minimal
   *  Villagers-screen UI). `targetContainerId: null` clears it; a non-null id
   *  always (re)assigns food delivery, enabled, since `resourceKind` has only
   *  one value in the food vertical slice. Written straight onto the shared
   *  `npcState` object so it survives this `NpcAgent` instance being
   *  disposed/recreated (settlement unload/reload, `WorldBundle` rebuild). */
  setHelperAssignment(targetContainerId: string | null): void {
    this.npcState.helperAssignment = targetContainerId
      ? { targetContainerId, resourceKind: 'food', enabled: true }
      : null
  }

  /** Bounded recent semantic history (plan 170) — oldest first, capped at
   *  `NPC_TRACE_CAPACITY`. Always recording; reading it does not require
   *  debug mode, only the UI/console surface that calls this does. */
  history(): readonly NpcTraceEvent[] {
    return this.trace.history()
  }

  /** Read-only diagnostic snapshot (plan 170) — see `NpcInspectionSnapshot`. */
  createInspectionSnapshot(timeOfDay: number): NpcInspectionSnapshot {
    const queue = this.activeQueueId ? this.queues.get(this.activeQueueId) : undefined
    return {
      id: this.id,
      name: this.name,
      displayName: this.displayName,
      role: this.role,
      position: { x: this.mesh.position.x, z: this.mesh.position.z },
      phase: this.phase,
      activity: this.getCurrentActivity(timeOfDay),
      needs: { ...this.needs },
      activeNeed: this.activeNeed,
      pressures: this.lastPressures,
      candidates: this.lastDecisionCandidates,
      decisionScores: this.lastDecisionScores,
      strategyCandidates: this.lastStrategyCandidates,
      selectedStrategy: this.selectedStrategy,
      plan: this.npcState.activePlan
        ? {
            goal: this.npcState.activePlan.goal,
            strategy: this.npcState.activePlan.strategy,
            state: this.npcState.activePlan.state,
            progress: this.npcState.activePlan.progress.amount,
            currentStep: this.npcState.activePlan.currentStep,
          }
        : null,
      contract: (() => {
        const mine = this.workContracts?.findByWorker(this.id)
        return mine ? { id: mine.id, state: mine.state, rewardCoins: mine.rewardCoins } : null
      })(),
      action: this.pendingAction
        ? {
            kind: this.pendingAction.kind,
            destination: {
              x: this.pendingAction.destination.x,
              y: this.pendingAction.destination.y,
              z: this.pendingAction.destination.z,
            },
            queueId: this.pendingAction.queueId ?? null,
            status: this.actionLifecycle.status,
          }
        : null,
      queue: this.activeQueueId && queue
        ? { id: this.activeQueueId, position: queue.indexOf(this.id), serving: queue.isServing(this.id) }
        : null,
      watchdog: {
        rescueStage: this.watchdog.rescueStage,
        lowProgressStrikes: this.watchdog.lowProgressStrikes,
        recentRescueCount: this.watchdog.recentRescueCount,
      },
      stamina: { current: this.stamina.current, max: this.stamina.max },
      vigor: { current: this.vigor.current, max: this.vigor.max },
      health: { current: this.health.currentHp, max: this.health.maxHp },
      household: this.household
        ? {
            food: this.household.foodCount(),
            wood: this.household.stock.query('wood'),
            water: this.household.water.current,
          }
        : null,
      frozen: this.frozen,
    }
  }

  /** Causal projection over the same state `createInspectionSnapshot()`
   *  reads — see `NpcWhy`. */
  why(timeOfDay: number): NpcWhy {
    const snapshot = this.createInspectionSnapshot(timeOfDay)
    return projectNpcWhy(snapshot, this.needValueFor(snapshot.activeNeed))
  }

  private needValueFor(need: NeedId): number | null {
    return needValue(this.needs, need)
  }

  /** Debug-only: pause/resume this NPC's simulation (plan 170 §6) — see the
   *  `frozen` field doc comment for what does/doesn't keep running. */
  setFrozen(frozen: boolean): void {
    if (this.frozen === frozen) return
    this.frozen = frozen
    this.trace.record({ simTime: this.simClock, type: frozen ? 'debug.freeze' : 'debug.unfreeze' })
  }

  isFrozen(): boolean {
    return this.frozen
  }

  /** Debug-only: cancel the in-flight action/queue membership and force a
   *  fresh decision next tick — reuses the existing critical-interrupt
   *  cleanup path (`interruptCurrentAction`) so it obeys the same ownership
   *  rules as an automatic critical-need interrupt (plan 170 §6/13). */
  requestReevaluation(): void {
    this.interruptCurrentAction()
    this.trace.record({ simTime: this.simClock, type: 'debug.reevaluate' })
  }

  /** What this NPC's effective `schedule` says it should be doing at
   *  `timeOfDay` (`dayNight.ts` convention, 0-1) — also called internally by
   *  `update()` each frame to drive sleep / idle routing. */
  getScheduledActivity(timeOfDay: number): ScheduleActivity {
    return activityAt(this.schedule, timeOfDay)
  }

  getDialogueLine(): string {
    return pickDialogueLine(this.dialogueArchetype, this.activeNeed, this.isBusyPhase())
  }

  /** Plan 152 — resolves the player's "request food/water" dialogue action
   *  against this NPC's own carried `Inventory`, social relation/standing and
   *  own-needs state. Decision only: does not remove anything from `carried`
   *  (see `takeCarriedConsumable`) so the dialogue wiring can still refuse to
   *  complete the transfer if the player's own inventory has no room. */
  resolveAssistanceRequest(kind: AssistanceRequestKind): AssistanceResult {
    const social = this.getPlayerSocial(this.name)
    const ownNeedValue = kind === 'food' ? this.needs.hunger : this.needs.thirst
    return resolveNpcAssistance(kind, this.carried, ownNeedValue, {
      personality: this.personality,
      relationLevel: social.relationLevel,
      standing: social.standing,
    })
  }

  /** Removes one carried unit of `kind` — the actual transfer mutation for a
   *  successful `resolveAssistanceRequest`, called only after the caller has
   *  confirmed the player's inventory can receive it (plan 152 "Inventory
   *  atomicity"). */
  takeCarriedConsumable(kind: ItemKind): boolean {
    return this.carried.remove(kind, 1)
  }

  /** Dialogue-facing summary of what this NPC is doing right now — maps the
   *  private `phase`/`pendingAction` FSM state onto `CurrentActivity`, adding
   *  `nextBoundary(schedule, timeOfDay)` as `endHour` where it's meaningful
   *  ("...do HH:MM" — `sleep`/`work`/`eat`, not `need`/`wander`). */
  getCurrentActivity(timeOfDay: number): CurrentActivity {
    const endHour = nextBoundary(this.schedule, timeOfDay)?.hour
    switch (this.phase) {
      case 'choose':
        return { kind: 'idle' }
      case 'combat':
        return { kind: 'combat' }
      case 'execute':
      case 'exhausted':
      case 'goTo': {
        const kind = classifyPendingActivity(this.pendingAction ?? undefined, this.activeNeed)
        if (kind === 'work' || kind === 'eat') return { kind, endHour }
        if (kind === 'need') return { kind, need: this.activeNeed }
        if (kind === 'talking') return { kind: 'talking' }
        return { kind: 'idle' }
      }
      case 'followPath':
      case 'wander':
        return { kind: 'wander' }
      case 'goSleep':
      case 'sleep':
        return { kind: 'sleep', endHour }
      case 'lookAtPlayer':
        return { kind: 'talking' }
    }
  }

  setQuestMarker(marker: string | null): void {
    this.questMarker = marker
  }

  /** Toggles the gaze-highlight glow on this NPC's label. Idempotent — no
   *  redundant DOM writes if the state doesn't actually change. */
  setHighlighted(active: boolean): void {
    if (this.highlighted === active) return
    this.highlighted = active
    this.labelEl.classList.toggle('npc-label--highlighted', active)
  }

  /**
   * NPC-specific damage: HP via shared `damageHealth`, then a lump vigor
   * cost. `HealthState` stays combat-agnostic (plan 092). The single place
   * that turns a death-crossing hit into this NPC's own death consequences
   * (plan 177 §9/§13) — combat itself never handles death.
   * @role NPC-owned damage entry point: applies `HealthState` HP loss, vigor cost and death.
   * @uses HealthState
   */
  takeDamage(amount: number): void {
    if (this.health.dead) return
    damageHealth(this.health, amount)
    applyDamageVigor(this.vigor)
    if (amount > 0) recordBloodHit(this.mesh.position.x, this.mesh.position.z, NPC_HEIGHT, amount)
    if (this.health.dead) {
      this.die()
    } else if (amount > 0) {
      // Hurt presentation lives on the seam right after real damage is
      // resolved (plan npc-009) — never from attack intent/defense alone, so
      // a blocked/missed attack never triggers a flinch.
      this.hurtAnimTimer = this.playCombatOneShot(this.hurtAction)
    }
  }

  /** Incoming combat damage (plan 177 §8/§10 — `animal → NPC`, `NPC → NPC`,
   *  `player → NPC` all share this one entry point): resolves this NPC's own
   *  defense (whatever `carried` currently exposes) before the HP loss
   *  itself goes through the same `takeDamage()` every other damage source
   *  uses. Returns the resolved outcome so a caller (e.g. a future
   *  animal-attack decision) can react (retaliate, flee) without
   *  duplicating the defense roll.
   *  @role Resolves defense, then routes final damage into `takeDamage`.
   *  @uses HealthState
   */
  applyIncomingCombatDamage(params: {
    amount: number
    attackerX?: number
    attackerZ?: number
    attackerKey: string
  }): ResolvedDefense {
    if (this.health.dead) return { outcome: 'none', finalDamage: 0, attempted: false }
    this.defenseAttempt += 1
    const resolved = resolveIncomingNpcDamage({
      amount: params.amount,
      carried: this.carried,
      defenderId: this.id,
      defenderX: this.mesh.position.x,
      defenderZ: this.mesh.position.z,
      defenderFacingYaw: this.mesh.rotation.y,
      attackerX: params.attackerX,
      attackerZ: params.attackerZ,
      attackerKey: params.attackerKey,
      attempt: this.defenseAttempt,
    })
    if (resolved.finalDamage > 0) this.takeDamage(resolved.finalDamage)
    return resolved
  }

  /** Diagnostic-only: whether `carried` currently has a weapon this NPC
   *  could fight back with — same melee/loaded-ranged capability check
   *  `reactToAnimalThreat`/`beginCombat` already use, exposed read-only for
   *  `?debug=1&debugNpcCombat=1` combat logging (no side effect). */
  canFightBack(): boolean {
    if (resolveNpcMeleeWeapon(this.carried)) return true
    const rangedWeapon = resolveNpcRangedWeapon(this.carried)
    return rangedWeapon != null && resolveNpcAmmoKind(this.carried, rangedWeapon.ranged) != null
  }

  /** Diagnostic-only: this NPC's live combat/threat state, read straight off
   *  the same fields `reactToAnimalThreat`/`beginCombat`/`tickMeleeCombat`
   *  already maintain — no recomputation, no new state. Built for
   *  `?debug=1&debugNpcCombat=1`'s `logNpcCombatHit` to snapshot "what did
   *  this NPC know" at the exact moment an animal bite lands, so a hit can be
   *  correlated against whether `currentAnimalThreat` was ever set and
   *  whether a `defend`/`flee` reaction ever ran. */
  combatDebugSnapshot(): {
    phase: Phase
    pendingAction: ActionId | null
    currentAnimalThreat: { animalId: string, kind: string, distance: number } | null
    lastAnimalThreatResponse: AnimalThreatResponse | null
    /** Combat/death presentation state (plan npc-009) — which one-shot clip
     *  is currently pre-empting normal locomotion (if any), `dead` once the
     *  death clip has been triggered, and which semantic clips this model
     *  actually resolved (`false` marks a missing-clip fallback, not a bug). */
    presentation: {
      current: 'hurt' | 'attack' | null
      dead: boolean
      hasAttackMeleeClip: boolean
      hasAttackRangedClip: boolean
      hasHurtClip: boolean
      hasDeathClip: boolean
    }
  } {
    return {
      phase: this.phase,
      pendingAction: this.pendingAction?.kind ?? null,
      currentAnimalThreat: this.currentAnimalThreat
        ? {
            animalId: this.currentAnimalThreat.animalId,
            kind: this.currentAnimalThreat.kind,
            distance: this.currentAnimalThreat.distance,
          }
        : null,
      lastAnimalThreatResponse: this.lastAnimalThreatResponse,
      presentation: {
        current: this.hurtAnimTimer > 0
          ? 'hurt'
          : this.phase === 'combat' && !this.isCombatCycleIdle() ? 'attack' : null,
        dead: this.health.dead,
        hasAttackMeleeClip: this.attackMeleeAction != null,
        hasAttackRangedClip: this.attackRangedAction != null,
        hasHurtClip: this.hurtAction != null,
        hasDeathClip: this.deathAction != null,
      },
    }
  }

  /** Executes an already-decided combat intent (plan 177) — `NpcAgent` never
   *  picks its own target, reason to fight or weapon mode; a future Hunter/
   *  animal-defense/bandit decision system supplies all three via `intent`.
   *  Interrupts whatever this NPC was doing (same cleanup
   *  `beginCollapseSleep`/`interruptCurrentAction` already do for their own
   *  transitions) and replaces the shared `actionLifecycle`. Returns `false`
   *  without any side effect — no combat starts — when the target is
   *  already invalid, or this NPC has no carried weapon matching
   *  `intent.mode` (plan 177 §6/§7: "no config → combat attack cannot
   *  start", never a silent fallback to the other mode). Ranged additionally
   *  requires at least one compatible ammo unit already carried — a bow with
   *  no arrows can't start a ranged combat either. */
  beginCombat(intent: CombatIntent): boolean {
    if (this.health.dead) return false
    if (!intent.target.isAlive() || !intent.target.getPosition()) return false

    let meleeWeapon: NpcMeleeWeapon | null = null
    let rangedWeapon: NpcRangedWeapon | null = null
    if (intent.mode === 'melee') {
      meleeWeapon = resolveNpcMeleeWeapon(this.carried)
      if (!meleeWeapon) return false
    } else {
      rangedWeapon = resolveNpcRangedWeapon(this.carried)
      if (!rangedWeapon || !resolveNpcAmmoKind(this.carried, rangedWeapon.ranged)) return false
    }

    this.leaveActiveQueue()
    this.pendingAction = null
    this.pathWaypoints = []
    this.pathIndex = 0
    this.wait = 0
    this.clearRepath()
    this.previousPhase = null
    this.sleepReason = null
    resetMovementWatchdog(this.watchdog)
    // A wolf attack (plan ai-004 §8 example) pre-empts whatever Goal this
    // NPC was pursuing — preserve it, interrupted, instead of discarding it.
    this.markPlanInterrupted()

    this.combatIntent = intent
    this.combatMeleeWeapon = meleeWeapon
    this.combatRangedWeapon = rangedWeapon
    this.combatAttack.reset()
    this.combatRangedAttack.reset()
    this.combatProjectile = null
    replaceActionLifecycle(this.actionLifecycle)
    this.phase = 'combat'
    this.trace.record({ simTime: this.simClock, type: 'combat.started', targetId: intent.target.ref.id })
    return true
  }

  /** Whether the currently active combat mode's own timer is between
   *  attacks (idle) rather than mid-swing/mid-draw — `intent.mode` picks
   *  which of the two independent lifecycles is authoritative. `true`
   *  outside combat (nothing to be mid-attack in). */
  private isCombatCycleIdle(): boolean {
    if (!this.combatIntent) return true
    return this.combatIntent.mode === 'melee'
      ? this.combatAttack.state() === 'idle'
      : this.combatRangedAttack.state() === 'idle' && !this.combatProjectile
  }

  /** Melee sub-branch of the `combat` phase (plan 177 §6) — approach if out
   *  of weapon range, otherwise swing via the shared `combatAttack`
   *  lifecycle and resolve the hit once at its `hitReady` edge. Target
   *  existence/liveness/position are already validated by the caller. */
  private tickMeleeCombat(dt: number, intent: CombatIntent, targetPos: { x: number, z: number }): void {
    const weapon = this.combatMeleeWeapon
    if (!weapon) {
      this.endCombat('failed')
      return
    }

    const dx = targetPos.x - this.mesh.position.x
    const dz = targetPos.z - this.mesh.position.z
    const dist = Math.hypot(dx, dz)
    const inRange = dist <= weapon.melee.range
    if (!inRange && this.combatAttack.state() === 'idle') {
      this.tmp.set(targetPos.x, 0, targetPos.z)
      this.steerTo(this.tmp, dt)
    } else if (dist > 1e-4) {
      this.mesh.rotation.y = Math.atan2(dx, dz)
    }

    // Hit resolution happens once, at the shared lifecycle's own `hitReady`
    // edge — never per frame, never from render/animation state (plan 177
    // — deterministic simulation).
    const tick = this.combatAttack.update(dt)
    if (tick.hitReady && tick.config) {
      // Attack commits to the target's position at the exact hit-window
      // edge, same "one attack, one yaw" contract `gameLoop.ts` uses for
      // the player's locked-target swings.
      const attackYaw = yawToward(this.mesh.position.x, this.mesh.position.z, targetPos.x, targetPos.z)
      if (attackYaw != null) {
        const hits = resolveMeleeHits(
          this.mesh.position.x,
          this.mesh.position.z,
          attackYaw,
          tick.config,
          [{ id: intent.target.ref.id, x: targetPos.x, z: targetPos.z, alive: true }],
        )
        if (hits.length > 0) {
          this.combatAttackAttempt += 1
          applyNpcMeleeHit(intent.target, tick.config, this.id, `melee:${intent.target.ref.id}`, this.combatAttackAttempt)
          this.trace.record({ simTime: this.simClock, type: 'combat.hit', targetId: intent.target.ref.id })
          if (isNpcCombatDebugMode()) {
            console.log('[NPC COMBAT]', `npc=${this.id}/${this.name}/${this.role}`, `attack.hit target=${intent.target.ref.id}`)
          }
          this.playCombatImpactSound(intent.target, targetPos)
          if (!intent.target.isAlive()) {
            this.endCombat('complete')
            return
          }
        } else if (isNpcCombatDebugMode()) {
          console.log(
            '[NPC COMBAT]',
            `npc=${this.id}/${this.name}/${this.role}`,
            `attack.missed target=${intent.target.ref.id}`,
            `distance=${dist.toFixed(2)}/range=${weapon.melee.range}`,
          )
        }
      } else if (isNpcCombatDebugMode()) {
        console.log('[NPC COMBAT]', `npc=${this.id}/${this.name}/${this.role}`, 'attack.skipped reason=noYaw (target at same position)')
      }
    }

    if (inRange && this.combatAttack.state() === 'idle') {
      if (this.stamina.current >= weapon.melee.staminaCost) {
        drainStamina(this.stamina, weapon.melee.staminaCost)
        this.combatAttack.start(weapon.melee)
        this.playCombatOneShot(this.attackMeleeAction)
      } else if (isNpcCombatDebugMode() && this.simClock - this.lastStaminaSkipLogSec > 1) {
        this.lastStaminaSkipLogSec = this.simClock
        console.log(
          '[NPC COMBAT]',
          `npc=${this.id}/${this.name}/${this.role}`,
          `attack.skipped reason=stamina stamina=${this.stamina.current.toFixed(1)}/${weapon.melee.staminaCost}`,
        )
      }
    }
  }

  /** Ranged sub-branch of the `combat` phase (plan 177 §7) — reuses plan
   *  162's `RangedConfig`/draw→release→recovery shape,
   *  `combat/rangedAttack.ts`'s accuracy/deviation resolution and
   *  `combat/projectile.ts`'s swept collision: the same pipeline
   *  `gameLoop.ts` already drives for the player, not a redesign. The only
   *  thing that differs is projectile *ownership* — an NPC tracks at most
   *  one in-flight `combatProjectile` on itself (see the field doc) instead
   *  of a shared world array, so this needs no separate projectile registry
   *  and keeps working with no camera/player/gameLoop involved. `archery`
   *  skill has no NPC equivalent yet, so accuracy uses the bow's own base
   *  value (skill `0`) — the same "smallest existing-compatible value"
   *  choice `applyIncomingCombatDamage` makes for defense skill. */
  private tickRangedCombat(dt: number, intent: CombatIntent, targetPos: { x: number, z: number }): void {
    const weapon = this.combatRangedWeapon
    if (!weapon) {
      this.endCombat('failed')
      return
    }

    const dx = targetPos.x - this.mesh.position.x
    const dz = targetPos.z - this.mesh.position.z
    const dist = Math.hypot(dx, dz)
    const inRange = dist <= weapon.ranged.range
    if (!inRange && this.combatRangedAttack.state() === 'idle') {
      this.tmp.set(targetPos.x, 0, targetPos.z)
      this.steerTo(this.tmp, dt)
    } else if (dist > 1e-4) {
      this.mesh.rotation.y = Math.atan2(dx, dz)
    }

    const tick = this.combatRangedAttack.update(dt)
    if (tick.fireReady && tick.config && !this.combatProjectile) {
      // Ammo already confirmed present when the draw started
      // (`beginCombat`/the draw-request gate below); re-resolved here in
      // case it was somehow spent in between — a shot silently fizzles
      // (draw spent, no arrow) rather than throwing on a missing kind.
      const ammoKind = resolveNpcAmmoKind(this.carried, tick.config)
      if (ammoKind) {
        this.carried.remove(ammoKind, 1)
        this.combatAttackAttempt += 1
        // `yawToward` only returns `null` when the target sits exactly on
        // this NPC's own position — `mesh.rotation.y` is a different (and
        // wrong, for this purpose) yaw convention, see `resolveIncomingNpcDamage`'s
        // comment, so the fallback converts it the same way rather than
        // feeding it straight into `resolveRangedDirection`.
        const aimYaw = yawToward(this.mesh.position.x, this.mesh.position.z, targetPos.x, targetPos.z)
          ?? this.mesh.rotation.y + Math.PI
        const accuracy = rangedAccuracy(tick.config, 0)
        const deviationRoll = rangedDeviationRoll(this.id, this.combatAttackAttempt)
        const { dirX, dirZ } = resolveRangedDirection(aimYaw, accuracy, deviationRoll)
        this.combatProjectile = {
          id: `${this.id}:proj:${this.combatAttackAttempt}`,
          sourceId: this.id,
          x: this.mesh.position.x,
          z: this.mesh.position.z,
          dirX,
          dirZ,
          speed: tick.config.projectileSpeed,
          maxDistance: tick.config.range,
          travelled: 0,
          damage: tick.config.damage,
          criticalChance: tick.config.criticalChance ?? 0,
          criticalMultiplier: tick.config.criticalMultiplier ?? MELEE_CRITICAL_MULTIPLIER,
          ammoKind,
          attackKey: `ranged:${ammoKind}`,
          attempt: this.combatAttackAttempt,
        }
        this.playCombatOneShot(this.attackRangedAction)
        playActionBowRelease(this.playAt, this.mesh.position)
      }
    }

    if (this.combatProjectile) {
      const prevX = this.combatProjectile.x
      const prevZ = this.combatProjectile.z
      const expired = advanceProjectile(this.combatProjectile, dt)
      const hitId = sweptProjectileHit(
        prevX, prevZ, this.combatProjectile.x, this.combatProjectile.z,
        [{ id: intent.target.ref.id, x: targetPos.x, z: targetPos.z, alive: true }],
      )
      if (hitId) {
        applyNpcRangedHit(intent.target, this.combatProjectile)
        this.combatProjectile = null
        this.trace.record({ simTime: this.simClock, type: 'combat.hit', targetId: intent.target.ref.id })
        this.playCombatImpactSound(intent.target, targetPos)
        if (!intent.target.isAlive()) {
          this.endCombat('complete')
          return
        }
      } else if (expired) {
        this.combatProjectile = null
      }
    }

    if (
      inRange
      && this.combatRangedAttack.state() === 'idle'
      && !this.combatProjectile
      && this.stamina.current >= weapon.ranged.staminaCost
    ) {
      if (resolveNpcAmmoKind(this.carried, weapon.ranged)) {
        drainStamina(this.stamina, weapon.ranged.staminaCost)
        this.combatRangedAttack.start(weapon.ranged)
        playCombatBowDraw(this.playAt, this.mesh.position)
      } else {
        // Out of ammo entirely — no point staying in a combat that can
        // never fire again; hands control back to the normal decision flow.
        this.endCombat('failed')
      }
    }
  }

  /** Reacts to a sensed `ImmediateAnimalThreat` through the normal pressure
   *  → decision flow (plan 179 §7/§8/§9/§10) — the threat is a situation;
   *  `decideAnimalThreatResponse` (same `pickHighestScore` shape as every
   *  other scored decision in this codebase) picks `defend` or `flee` from
   *  this NPC's own carried-weapon capability and health, exactly like
   *  `pickNeed` scores ordinary needs. `defend` hands off to the existing
   *  177 `beginCombat()`; `flee` reuses the existing `wander` phase/movement
   *  pipeline — no new combat or flee system. */
  private reactToAnimalThreat(threat: ImmediateAnimalThreat): void {
    const meleeWeapon = resolveNpcMeleeWeapon(this.carried)
    const rangedWeapon = resolveNpcRangedWeapon(this.carried)
    const hasRanged = rangedWeapon != null && resolveNpcAmmoKind(this.carried, rangedWeapon.ranged) != null
    const healthRatio = this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0
    const decision = decideAnimalThreatResponse({
      hasMeleeCapability: meleeWeapon != null,
      hasRangedCapability: hasRanged,
      healthRatio,
      neuroticism: this.personality.neuroticism,
    })
    this.lastAnimalThreatResponse = decision
    this.trace.record({
      simTime: this.simClock,
      type: 'animalThreat.response',
      response: decision,
      canFight: meleeWeapon != null || hasRanged,
      healthRatio,
    })
    if (isNpcCombatDebugMode()) {
      console.log(
        '[NPC COMBAT]',
        `npc=${this.id}/${this.name}/${this.role}`,
        `npcHp=${Math.round(this.health.currentHp)}/${this.health.maxHp}`,
        `animal=${threat.animalId}/${threat.kind}`,
        `distance=${threat.distance.toFixed(2)}`,
        `canFight=${meleeWeapon != null || hasRanged}`,
        `response=${decision}`,
      )
    }
    if (decision === 'defend') {
      const mode: CombatIntent['mode'] = hasRanged ? 'ranged' : 'melee'
      const started = this.beginCombat({ target: threat.target, mode })
      if (isNpcCombatDebugMode()) {
        console.log(
          '[NPC COMBAT]',
          `npc=${this.id}/${this.name}/${this.role}`,
          started ? `combat.started mode=${mode}` : 'combat.startFailed (target invalid or no weapon at beginCombat time)',
        )
      }
      if (started) return
      // Capability was just checked but `beginCombat` still rejected it
      // (e.g. target went invalid between the check and here) — flee rather
      // than leaving the NPC idle next to an active threat.
    }
    this.fleeFromThreat(threat.x, threat.z)
  }

  /** `flee` response to an animal threat (plan 179 §10) — same cleanup
   *  `interruptCurrentAction` does for any other in-flight action, then a
   *  destination away from the threat via the existing `wander` phase
   *  (`steerWithRescue` in the `update()` switch walks it there and returns
   *  to `choose` on arrival, same as any other wander). Not a new
   *  `AnimalFleeSystem`. */
  private fleeFromThreat(threatX: number, threatZ: number): void {
    failActionLifecycle(this.actionLifecycle)
    this.leaveActiveQueue()
    this.pendingAction = null
    this.pathWaypoints = []
    this.pathIndex = 0
    this.wait = 0
    this.clearRepath()
    this.previousPhase = null
    this.sleepReason = null
    resetMovementWatchdog(this.watchdog)

    const dx = this.mesh.position.x - threatX
    const dz = this.mesh.position.z - threatZ
    const dist = Math.hypot(dx, dz)
    const dirX = dist > 1e-4 ? dx / dist : 1
    const dirZ = dist > 1e-4 ? dz / dist : 0
    this.target.set(
      this.mesh.position.x + dirX * NPC_FLEE_DISTANCE,
      0,
      this.mesh.position.z + dirZ * NPC_FLEE_DISTANCE,
    )
    this.applyRimDestination(this.target)
    this.phase = 'wander'
  }

  /** Debug/external cancel — mirrors `requestReevaluation()`'s role for
   *  `goTo`/`execute`, but for combat. A no-op outside `phase === 'combat'`. */
  cancelCombat(): void {
    if (this.phase !== 'combat') return
    this.endCombat('cancelled')
  }

  /** Ends the current combat intent and hands control back to the normal
   *  decision flow (plan 177 §4 — "combat ends / target invalid / NPC dies
   *  → existing decision flow resumes"). `outcome` only classifies the
   *  shared `actionLifecycle` transition; the next `choose` tick re-derives
   *  what this NPC does next on its own. */
  private endCombat(outcome: 'cancelled' | 'complete' | 'failed'): void {
    if (outcome === 'complete') finishActionLifecycle(this.actionLifecycle)
    else if (outcome === 'failed') failActionLifecycle(this.actionLifecycle)
    else cancelActionLifecycle(this.actionLifecycle)
    const onKill = outcome === 'complete' ? this.combatIntent?.onKill : undefined
    this.combatIntent = null
    this.combatMeleeWeapon = null
    this.combatRangedWeapon = null
    this.combatAttack.reset()
    this.combatRangedAttack.reset()
    this.combatProjectile = null
    this.trace.record({ simTime: this.simClock, type: 'combat.ended', outcome })
    this.phase = 'choose'
    // Runs last, after every combat field is reset and `phase` defaults to
    // `choose` — a caller's `onKill` (e.g. Hunter's harvest→deliver chain)
    // may still override `phase` via `startAction()`, same as any other
    // `choose`-phase decision would.
    onKill?.()
  }

  /** One-time death consequence (plan 177 §9/§13) — stops the NPC in place
   *  (mirrors `AnimalAgent.collapse()`'s tip-over) rather than a corpse/loot
   *  system, which stays out of this plan's scope. `update()` no-ops for a
   *  dead NPC from the next tick on.
   *  @param alreadySettled Reconstructed from already-dead authoritative
   *  state (plan npc-009, e.g. the constructor's own hydration call) — jumps
   *  the death clip straight to its final clamped frame instead of playing
   *  the collapse animation from the start, so a stream-in/reload never
   *  replays a death that already happened. */
  private die(alreadySettled = false): void {
    // A dead worker can no longer fulfil an outstanding commitment (plan
    // npc-015 §12) — release it back to the board rather than leaving the
    // contract stuck in `travelling`/`working` forever with an assigned
    // worker that will never move again.
    const mine = this.workContracts?.findByWorker(this.id)
    if (mine) this.workContracts!.release(mine.id, this.id)
    this.releaseConversationIfAny()
    this.leaveActiveQueue()
    this.pendingAction = null
    this.combatIntent = null
    this.combatMeleeWeapon = null
    this.combatRangedWeapon = null
    this.combatAttack.reset()
    this.combatRangedAttack.reset()
    this.combatProjectile = null
    if (this.actionLifecycle.status === 'active') failActionLifecycle(this.actionLifecycle)
    if (this.deathAction && alreadySettled) {
      // Reconstructed from already-dead state — jump straight to the clip's
      // settled end pose with no fade/blend against whatever the fresh-alive
      // constructor path already started playing (plan npc-009 hydration
      // case), rather than `playCombatOneShot()`'s normal fade-in (which
      // would briefly blend a live idle pose with a near-zero-weight death
      // pose at `dt=0`).
      for (const action of [
        this.idleAction, this.walkAction, this.interactAction,
        this.attackMeleeAction, this.attackRangedAction, this.hurtAction,
      ]) action?.stop()
      this.deathAction.reset()
      this.deathAction.setLoop(THREE.LoopOnce, 1)
      this.deathAction.clampWhenFinished = true
      this.deathAction.setEffectiveWeight(1)
      this.deathAction.play()
      this.deathAction.time = this.deathAction.getClip().duration
      this.mixer.update(0)
      this.deathAnimSettleAtSimClock = null
    } else if (this.deathAction) {
      // Real death clip — let it actually play instead of the manual tip
      // fallback below (plan npc-009). `update()`'s `health.dead` branch
      // keeps ticking the mixer only until `deathAnimSettleAtSimClock`.
      this.deathAnimSettleAtSimClock = this.simClock + this.playCombatOneShot(this.deathAction)
    } else {
      this.mixer.stopAllAction()
      this.mesh.rotation.z = Math.PI / 2
    }
    this.lastHpPercent = 0
    this.hpFillEl.style.width = '0%'
    this.labelBarsEl.style.display = 'none'
    this.trace.record({ simTime: this.simClock, type: 'combat.died' })
  }

  /** `observerYaw` — player look direction (radians, same convention as
   *  `MouseLook`'s `state.yaw`), used only to dim this NPC's label when the
   *  player isn't facing toward it (see the gaze-cone opacity factor below).
   *  `timeOfDay` — `dayNight.ts`'s clock (0-1, 0=midnight), forwarded
   *  through `SettlementsManager`/`Settlement.update` — drives the effective
   *  `schedule` via `getScheduledActivity`. Sleep uses that schedule; the
   *  `night_owl` overlay shifts the sleep block rather than skipping it.
   *  `nearbyNpcCount` — other NPCs from the same settlement within
   *  `GROUP_REACTION_RADIUS` (`createSettlement.ts`), used to dampen the
   *  reaction-sound trigger chance below (issue 010).
   *  @role Per-tick NPC loop: needs/stamina/vigor, phase FSM, and the
   *  `choose` phase that hands the picked need to `beginNeed`.
   *  @uses NpcPlannedAction
   */
  update(
    dt: number,
    observerPos: THREE.Vector3,
    observerYaw: number,
    timeOfDay: number,
    nearbyNpcCount: number,
    dayLengthSec: number,
    /** Bounded/local currently-threatening animals (plan 179 §7/§10/§20) —
     *  caller-filtered to animals whose own decision is currently `attack`
     *  (see `AnimalAgent.isThreateningHuman()`), never a per-NPC world scan.
     *  Defaults to none so existing callers/tests keep prior behaviour. */
    nearbyAnimalThreats: readonly ThreateningAnimalCandidate[] = [],
    /** This frame's world weather (plan npc-012), forwarded through
     *  `SettlementsManager`/`Settlement.update` from `gameLoop.ts`'s own
     *  `climate.weather` — never recomputed per NPC. `undefined` for any
     *  caller/test that doesn't pass one; weather then contributes no
     *  pressure, same as an isolated fallback with no economy/household. */
    weather?: WeatherState,
  ): void {
    this.simClock += dt
    this.dayLengthSec = dayLengthSec
    if (this.frozen) return
    if (this.health.dead) {
      // Keep the mixer advancing only long enough for the one-shot death
      // clip to actually play (plan npc-009) — bounded by
      // `deathAnimSettleAtSimClock`, `null` when there was no clip to play
      // (manual tip fallback, no mixer work needed) so a permanently dead NPC
      // never costs a per-frame mixer update for the rest of the session.
      if (this.deathAnimSettleAtSimClock != null && this.simClock < this.deathAnimSettleAtSimClock) {
        this.mixer.update(dt)
      }
      return
    }
    this.currentWeather = weather ?? null
    const prevPhase = this.phase
    tickNeeds(this.needs, dt, dayLengthSec, {
      hungerThirstRate: this.phase === 'sleep' ? SLEEP_HUNGER_THIRST_RATE : 1,
    })
    this.moving = false
    const scheduledActivity = this.getScheduledActivity(timeOfDay)

    const executeIsHeavy = this.phase === 'execute' && !!this.pendingAction && isHeavyWorkKind(this.pendingAction.kind)
    if (this.phase === 'goTo') {
      drainStamina(this.stamina, WALK_FATIGUE_RATE * this.fatigueMult * dt)
    } else if (this.phase === 'execute') {
      const rate = executeIsHeavy ? BASE_FATIGUE_RATE : LIGHT_EXECUTE_FATIGUE_RATE
      drainStamina(this.stamina, rate * this.fatigueMult * dt)
    } else if (REST_PHASES.has(this.phase)) {
      restoreStamina(this.stamina, this.restRate * dt)
    } else if (this.phase === 'combat' && this.isCombatCycleIdle()) {
      // Only regens between swings/shots (never mid-attack) — mirrors the
      // lump `staminaCost` spend on `combatAttack.start()`/
      // `combatRangedAttack.start()` below instead of a second continuous
      // drain rate, so a stamina-exhausted NPC eventually recovers enough to
      // keep fighting instead of softlocking in combat.
      restoreStamina(this.stamina, this.restRate * 0.5 * dt)
    }
    if ((this.phase === 'goTo' || this.phase === 'execute') && isExhausted(this.stamina)) {
      this.previousPhase = this.phase
      this.phase = 'exhausted'
    }
    if (executeIsHeavy) {
      applyWorkVigor(this.vigor, dt)
    } else if (this.phase === 'sleep') {
      applySleepVigor(this.vigor, dt)
    }

    if (this.abandonCooldown > 0) this.abandonCooldown -= dt
    if (this.threatReactionCooldown > 0) this.threatReactionCooldown -= dt
    if (this.hurtAnimTimer > 0) this.hurtAnimTimer -= dt

    if (WATCHDOG_PHASES.has(this.phase)) {
      this.tickWatchdog(dt)
    }

    if ((this.phase === 'goTo' || this.phase === 'execute') && this.pendingAction) {
      this.tickCriticalInterrupt(dt)
    }

    if (this.pauseCooldown > 0) this.pauseCooldown -= dt
    if (this.pauseCooldown <= 0 && PAUSE_INTERRUPTIBLE_PHASES.has(this.phase)) {
      const dx = this.mesh.position.x - observerPos.x
      const dz = this.mesh.position.z - observerPos.z
      const params = this.pauseParams
      if (Math.hypot(dx, dz) < params.triggerDistance) {
        // Being in range no longer means an automatic reaction (plan 117) —
        // personality/traits/relation/reputation decide *whether* an NPC
        // reacts at all; group suppression (below) then further dampens a
        // crowd all noticing the Hero at once, same math as before this plan.
        const social = this.getPlayerSocial(this.name)
        const socialChance = computeReactionChance({
          personality: this.personality,
          traits: this.traits,
          relationLevel: social.relationLevel,
          reputationStanding: social.standing,
        })
        // A lone NPC (nearbyNpcCount 0) keeps its full chance. In a group it
        // drops with how many others are close by — scaled by (1 - openness)
        // so an open/curious NPC barely cares about the crowd while a closed
        // one goes quiet in company (issue 010).
        const suppression =
          1 / (1 + GROUP_SUPPRESSION_STRENGTH * nearbyNpcCount * (1 - this.personality.openness))
        const reactionChance = Math.min(1, Math.max(0, socialChance * suppression))
        if (Math.random() < reactionChance) {
          this.previousPhase = this.phase
          this.phase = 'lookAtPlayer'
          this.pauseTimer = randRange(params.lookDurationRange)
          this.playReactionSound(reactionTierForRelation(social.relationLevel))
        } else {
          this.pauseCooldown = SUPPRESSED_REACTION_RETRY_COOLDOWN
        }
      }
    }

    // Immediate animal threat (plan 179 §7/§10/§12) — perception is a
    // situation, refreshed every tick from the caller-bounded candidate
    // list; the defend/flee re-scoring itself is throttled. Outranks the
    // player look-at-me pause above (a wolf attack matters more than
    // reacting to the Hero) but never interrupts `combat` (already reacting,
    // 177 owns ending it) or sleep (not perceiving).
    const previousAnimalThreat = this.currentAnimalThreat
    this.currentAnimalThreat = senseImmediateAnimalThreat(
      this.mesh.position.x,
      this.mesh.position.z,
      nearbyAnimalThreats,
    )
    if (previousAnimalThreat === null && this.currentAnimalThreat !== null) {
      this.trace.record({
        simTime: this.simClock,
        type: 'animalThreat.sensed',
        animalId: this.currentAnimalThreat.animalId,
        distance: this.currentAnimalThreat.distance,
      })
    }
    if (
      this.currentAnimalThreat
      && this.phase !== 'combat'
      && this.phase !== 'sleep'
      && this.phase !== 'goSleep'
      && this.threatReactionCooldown <= 0
    ) {
      this.threatReactionCooldown = ANIMAL_THREAT_REACTION_INTERVAL_SEC
      this.reactToAnimalThreat(this.currentAnimalThreat)
    }

    switch (this.phase) {
      case 'choose': {
        if (shouldCollapseSleep(this.vigor)) {
          this.beginCollapseSleep()
          break
        }
        // Pressure layer (plan ai-001) — pure, deterministic scores over the
        // current needs/shortage inputs; `lastPressures` feeds diagnostics
        // (`createInspectionSnapshot`).
        const pressures = generateNeedPressures(this.needs, this.needPickOptions())
        // Personality/role preference layer (plan ai-002) — re-scores the
        // same candidates `generateNeedPressures` produced; it cannot add or
        // remove one. Kept out of `Needs.ts` so base pressure semantics stay
        // reusable without a personality input (see the ai-002 implementation notes).
        const candidates = scoreNeedCandidates(pressures, { personality: this.personality, role: this.role })
        // Weather pressure (plan npc-012) — a second, independent pressure
        // producer over `this.currentWeather`, competing in the same
        // arbitration as a `seekShelter` decision target instead of a fake
        // `NeedId` (see `weatherPressure.ts`'s `NpcDecisionTarget`).
        const weatherPressure = this.currentWeather ? weatherShelterPressure(this.currentWeather) : 0
        const decision = pickActionKind<NpcDecisionTarget>(
          [
            ...candidates.map((c) => ({ kind: c.target, score: c.final })),
            { kind: 'seekShelter', score: weatherPressure },
          ],
          'idle',
        )
        this.lastPressures = pressures
        this.lastDecisionCandidates = candidates
        // Persistent Plan (plan ai-004) — checked against the same fresh
        // pressures the need pick just used, before deciding what's next:
        // a Plan's underlying need dropping out of pressure (any actor's
        // doing, not just this NPC's own actions) means its Goal is
        // satisfied, regardless of which strategy/action count achieved it.
        this.reevaluatePlanCompletion(pressures)
        if (decision !== 'seekShelter') this.shelterSettled = false
        // Top-level sequencing (review 2026-09-03 §5 E4) — the ordering
        // table now lives in npcDecision.ts; this call sequence stays here.
        const decisionInput = { collapsing: false, wonNeed: decision, scheduleActivity: scheduledActivity }
        const outcome = decideNpcAction(decisionInput)
        this.lastDecisionScores = scoreNpcDecisions(decisionInput)
        if (outcome === 'seekShelter') {
          // Weather is a pressure source, not a Need (plan npc-012 §1) —
          // never sets `activeNeed`, so the existing Plan/Strategy/critical-
          // interrupt machinery stays completely untouched by sheltering.
          this.activeNeed = 'idle'
          this.trace.record({ simTime: this.simClock, type: 'need.selected', need: 'idle', pressures, candidates })
          this.beginSeekShelter()
          break
        }
        const need = outcome === 'need' ? (decision as NeedId) : 'idle'
        this.activeNeed = need
        this.trace.record({ simTime: this.simClock, type: 'need.selected', need, pressures, candidates })
        if (outcome === 'need') {
          this.ensurePlanForNeed(need)
          this.beginNeed(need)
          break
        }
        if (outcome === 'scheduledSleep') {
          this.sleepReason = 'schedule'
          this.beginGoSleep()
          break
        }
        this.beginIdle(this.resolveIdleActivity(scheduledActivity, timeOfDay))
        break
      }
      case 'combat': {
        // Vigor collapse outranks an in-flight combat intent the same way it
        // outranks a schedule-driven action (`tickCriticalInterrupt`) — a
        // physically collapsing NPC cannot keep fighting.
        if (shouldCollapseSleep(this.vigor)) {
          this.endCombat('cancelled')
          break
        }
        const intent = this.combatIntent
        if (!intent) {
          this.endCombat('failed')
          break
        }
        // Target validity is re-checked every tick, not cached (plan 177 §5)
        // — exists, alive, has a resolvable position.
        if (!intent.target.isAlive()) {
          this.endCombat('complete')
          break
        }
        const targetPos = intent.target.getPosition()
        if (!targetPos) {
          this.endCombat('failed')
          break
        }

        if (intent.mode === 'melee') {
          this.tickMeleeCombat(dt, intent, targetPos)
        } else {
          this.tickRangedCombat(dt, intent, targetPos)
        }
        break
      }
      case 'execute': {
        this.wait -= dt
        // Face the well while drawing water so Interact reads as a drink.
        if (this.pendingAction?.kind === 'drink' && this.pendingAction.queueId) {
          const dx = this.landmarks.well.x - this.mesh.position.x
          const dz = this.landmarks.well.z - this.mesh.position.z
          if (Math.hypot(dx, dz) > 0.05) {
            this.mesh.rotation.y = Math.atan2(dx, dz)
          }
        }
        if (this.wait <= 0) {
          const action = this.pendingAction
          this.pendingAction = null
          action?.onComplete()
          if (action?.next) {
            this.pendingAction = action.next
            this.pendingAction.chainKind = promoteChainKind(action)
            this.applyRimDestination(action.next.destination)
            // Chained step stays `active` — do not complete between links.
            this.phase = 'goTo'
            this.trace.record({
              simTime: this.simClock,
              type: 'action.planned',
              action: action.next.kind,
              queueId: action.next.queueId ?? null,
            })
          } else {
            completeActionLifecycle(this.actionLifecycle)
            this.leaveActiveQueue()
            if (action) this.trace.record({ simTime: this.simClock, type: 'action.completed', action: action.kind })
            this.phase = 'choose'
          }
        }
        break
      }
      case 'exhausted':
        if (getStaminaRatio(this.stamina) >= STAMINA_EXHAUSTED_RESUME_RATIO) {
          this.phase = this.previousPhase ?? 'choose'
          this.previousPhase = null
          // The watchdog's pre-rest baseline is now stale (the NPC stood
          // still for the whole rest by definition) — resume with a fresh
          // check window instead of an immediate false "no progress" strike.
          resetMovementWatchdog(this.watchdog)
        }
        break
      case 'followPath': {
        const waypoint = this.pathWaypoints[this.pathIndex]
        if (!waypoint) {
          this.phase = 'choose'
          break
        }
        if (this.steerWithRescue(waypoint, dt)) {
          this.pathIndex++
          resetMovementWatchdog(this.watchdog)
          if (this.pathIndex >= this.pathWaypoints.length) this.phase = 'choose'
        }
        break
      }
      case 'goSleep':
        if (!shouldStayAsleep(this.vigor, scheduledActivity, this.sleepReason)) {
          this.sleepReason = null
          this.phase = 'choose'
        } else if (this.steerWithRescue(this.sleepDest, dt)) this.phase = 'sleep'
        break
      case 'goTo': {
        const action = this.pendingAction
        if (!action) {
          failActionLifecycle(this.actionLifecycle)
          this.leaveActiveQueue()
          this.trace.record({ simTime: this.simClock, type: 'action.failed', action: null, reason: 'invalid' })
          this.phase = 'choose'
          break
        }
        if (action.queueId) {
          const queue = this.queues.get(action.queueId)
          if (queue?.isMember(this.id)) {
            action.destination = queue.worldDestination(this.id)
          }
        }
        this.tmp.set(action.destination.x, action.destination.y, action.destination.z)
        const steerTarget = this.resolveSteerTarget(this.tmp)
        if (this.steerWithRescue(steerTarget, dt)) {
          // Skirt waypoint reached — keep going toward the real destination.
          if (steerTarget !== this.tmp && this.tmp.distanceTo(steerTarget) > ARRIVE) {
            break
          }
          if (action.queueId) {
            const queue = this.queues.get(action.queueId)
            if (queue?.isMember(this.id)) {
              const wasServing = queue.isServing(this.id)
              if (queue.canEnterServing(this.id)) {
                queue.claimServing(this.id)
              } else if (!wasServing) {
                // Waiting slot reached — hold until promoted to serving.
                break
              }
              if (!wasServing && queue.isServing(this.id)) {
                this.trace.record({ simTime: this.simClock, type: 'queue.served', queueId: action.queueId })
              }
            }
          }
          this.phase = 'execute'
          this.wait = action.durationSec
          // Well draw SFX for queued well drinks (destination is offset from
          // the mesh center) and for any legacy drink aimed at the well.
          if (
            action.kind === 'drink'
            && (
              action.queueId === this.wellQueueId
              || Math.hypot(
                action.destination.x - this.landmarks.well.x,
                action.destination.z - this.landmarks.well.z,
              ) < 0.5
            )
          ) {
            playActionWell(this.playAt, this.landmarks.well)
          } else if (action.kind === 'chop') {
            playActionChop(this.playAt, action.destination)
          }
        }
        break
      }
      case 'lookAtPlayer': {
        const dx = observerPos.x - this.mesh.position.x
        const dz = observerPos.z - this.mesh.position.z
        this.mesh.rotation.y = Math.atan2(dx, dz)
        this.pauseTimer -= dt
        if (this.pauseTimer <= 0) {
          this.phase = this.previousPhase ?? 'choose'
          this.previousPhase = null
          this.pauseCooldown = randRange(this.pauseParams.cooldownRange)
          // Same reasoning as the `exhausted` resume: the watchdog's
          // pre-pause baseline is stale after standing still to look at the
          // player, so resume with a fresh check window.
          resetMovementWatchdog(this.watchdog)
        }
        break
      }
      case 'sleep':
        if (!shouldStayAsleep(this.vigor, scheduledActivity, this.sleepReason)) {
          this.sleepReason = null
          this.phase = 'choose'
        }
        break
      case 'wander':
        if (this.steerWithRescue(this.target, dt)) this.phase = 'choose'
        break
    }

    if (this.phase !== prevPhase) {
      this.trace.record({ simTime: this.simClock, type: 'phase.changed', from: prevPhase, to: this.phase })
    }

    this.mesh.position.y = this.sampleHeight(
      this.mesh.position.x,
      this.mesh.position.z,
    )
    this.syncAnimation()
    ;(this.needMarker.material as THREE.MeshStandardMaterial).color.setHex(
      needColor(this.activeNeed),
    )
    ;(this.needMarker.material as THREE.MeshStandardMaterial).emissive.setHex(
      needColor(this.activeNeed),
    )
    const questSuffix = this.questMarker ? ` · ${this.questMarker}` : ''
    const labelText = `${this.displayName}${questSuffix}`
    if (labelText !== this.lastLabelText) {
      this.lastLabelText = labelText
      this.labelNameEl.textContent = labelText
    }
    this.lastHpPercent = applyBarPercent(
      this.hpFillEl,
      computeBarPercent(this.health.currentHp, this.health.maxHp),
      this.lastHpPercent,
    )
    this.lastStaminaPercent = applyBarPercent(
      this.staminaFillEl,
      computeBarPercent(this.stamina.current, this.stamina.max),
      this.lastStaminaPercent,
    )
    this.lastVigorPercent = applyBarPercent(
      this.vigorFillEl,
      computeBarPercent(this.vigor.current, this.vigor.max),
      this.lastVigorPercent,
    )
    this.updateDebugLabel()
    const gaze = gazeOpacityFactor(
      this.mesh.position.x - observerPos.x,
      this.mesh.position.z - observerPos.z,
      observerYaw,
    )
    this.labelDistanceState = updateAgentLabelDistanceState(
      this.labelEl,
      this.labelBarsEl,
      this.mesh,
      this.mesh.position.distanceTo(observerPos),
      NPC_SHADOW_DISTANCE,
      this.labelDistanceState,
      gaze,
    )
    this.mixer.update(dt)
  }

  /** Replays a `timeSkip.ts` "rest"/"wait" period in `TIME_SKIP_SAMPLE_HOURS`
   *  steps instead of one big end-of-skip jump, so needs/stamina/vigor land where
   *  they'd naturally be after that many hours of normal (non-skipped) play
   *  — a sleeping NPC actually rests (stamina + vigor), one working/awake
   *  still gets thirsty/hungry/behind on `woodDuty` and (outside sleep)
   *  satisfies whichever need would have come up, the same way `beginNeed`'s
   *  `onComplete` does. Collapsed vigor turns remaining work steps into a
   *  nap using the same restore rates as live `sleep`.
   *  Finishes by teleporting straight to wherever the last step's schedule
   *  activity says this NPC belongs — no `steerTo` walk, matching how a
   *  time-lapse only shows someone where they linger. Called once per skip
   *  by `SettlementsManager.resolveTimeSkip`, never per-frame.
   *  See `docs/plans/archive/2026-08-12--075--time-skip-npc-catchup.md`. */
  resolveTimeSkip(startTimeOfDay: number, hours: number, dayLengthSec: number): void {
    if (this.health.dead) return
    let finalActivity: ScheduleActivity | null = null
    let elapsed = 0
    let napping = this.sleepReason === 'collapse' || shouldCollapseSleep(this.vigor)
    while (elapsed < hours) {
      const step = Math.min(TIME_SKIP_SAMPLE_HOURS, hours - elapsed)
      elapsed += step
      const virtualTimeOfDay = (startTimeOfDay + elapsed / 24) % 1
      const activity = this.getScheduledActivity(virtualTimeOfDay)
      // Equivalent real-seconds `dt` this step would take in normal
      // (non-skipped) play — the same conversion `dayNight.ts`'s
      // `tickDayNight` uses in reverse (`dayLengthSec` real seconds / 24 per
      // game hour) — so needs/stamina/vigor accrue at their usual rate.
      const stepDt = gameHoursToRealSeconds(step, dayLengthSec)
      const sleeping = activity === 'sleep' || napping || shouldCollapseSleep(this.vigor)
      tickNeeds(this.needs, stepDt, dayLengthSec, {
        hungerThirstRate: sleeping ? SLEEP_HUNGER_THIRST_RATE : 1,
      })
      const vigorStep = tickVigorForSimulatedStep(this.vigor, activity, stepDt, napping)
      napping = vigorStep.napping
      if (activity === 'sleep' || vigorStep.slept) {
        restoreStamina(this.stamina, this.restRate * stepDt)
      } else {
        if (activity === 'work') drainStamina(this.stamina, BASE_FATIGUE_RATE * this.fatigueMult * stepDt)
        else restoreStamina(this.stamina, this.restRate * stepDt)
        // Not asleep this step — resolve whichever need would have sent the
        // NPC off to drink/eat/gather, same amounts `beginNeed` applies.
        const need = pickNeed(this.needs, this.needPickOptions())
        if (need === 'water') {
          this.household?.water.remove(WATER_DRINK_FROM_STOCK_AMOUNT)
          relieveNeed(this.needs, 'water')
        } else if (need === 'waterDuty' && this.household) {
          relieveNeed(this.needs, 'waterDuty')
          this.household.water.add(WATER_FETCH_AMOUNT)
        } else if (need === 'food') relieveNeed(this.needs, 'food')
        else if (need === 'wood' && this.landmarks.trees.length > 0) {
          relieveNeed(this.needs, 'wood')
        }
      }
      finalActivity = activity
    }
    this.sleepReason = napping ? 'collapse' : finalActivity === 'sleep' ? 'schedule' : null
    if (finalActivity === null) return

    const target =
      finalActivity === 'work' && this.workplace
        ? this.workplace.position
        : finalActivity === 'eat'
          ? this.landmarks.garden
          : finalActivity === 'social' && this.socialPlace
            ? this.socialPlace.position
            : this.home
    this.mesh.position.set(target.x, this.sampleHeight(target.x, target.z), target.z)
    this.leaveActiveQueue()
    this.pendingAction = null
    // A conversation reservation can't survive a time-skip catch-up (the
    // partner NPC is independently reset the same way) — clear it here too
    // so `socialCandidate()` isn't left permanently blocked (plan 151).
    this.conversationPartnerId = null
    this.onConversationEarlyExit = null
    this.settledIdleActivity = null
    this.wait = 0
    this.pathWaypoints = []
    this.pathIndex = 0
    this.previousPhase = null
    resetMovementWatchdog(this.watchdog)
    this.phase = napping ? 'sleep' : 'choose'
  }

  dispose(): void {
    this.leaveActiveQueue()
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer.stopAllAction()
    disposeObject3D(this.mesh)
  }

  private findAction(
    animations: THREE.AnimationClip[],
    names: string[],
  ): THREE.AnimationAction | null {
    for (const name of names) {
      const clip = animations.find((c) => c.name === name)
      if (clip) return this.mixer.clipAction(clip)
    }
    return null
  }

  private syncAnimation(): void {
    // Combat/death presentation pre-empts normal locomotion (plan npc-009).
    // Hurt outranks an in-flight attack (a hit landing mid-swing should still
    // read as a flinch); both are one-shots already started elsewhere
    // (`takeDamage()`/`tickMeleeCombat`/`tickRangedCombat`) — skip here
    // rather than restarting them every frame. Death itself never reaches
    // this method: `update()` returns before `syncAnimation()` once dead.
    if (this.hurtAnimTimer > 0) return
    if (this.phase === 'combat' && !this.isCombatCycleIdle()) return
    // Busy actions (drink / eat / talk) must not keep Walk — prioritize
    // Interact over locomotion even if `moving` somehow stayed true.
    if (this.isBusyPhase() && this.interactAction) {
      this.crossfade(this.interactAction)
    } else if (this.moving && this.walkAction) {
      this.crossfade(this.walkAction)
    } else if (this.idleAction) {
      this.crossfade(this.idleAction)
    }
  }

  /** Plays a one-shot combat/death clip (attack/hurt/death — plan npc-009):
   *  clamps on its last frame instead of looping, and fades out every other
   *  known action the same way `crossfade()` does, so it's safe to call from
   *  a combat tick or `takeDamage()`/`die()` without fighting the normal
   *  idle/walk/interact cycle. `null` is a safe no-op (missing clip — see the
   *  action fields' own doc comment). Returns the clip's duration (`0` for a
   *  no-op) so a caller that needs to gate `syncAnimation()` for the clip's
   *  length (`hurtAnimTimer`) can do so without a second clip lookup. */
  private playCombatOneShot(action: THREE.AnimationAction | null): number {
    if (!action) return 0
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    for (const other of [
      this.idleAction, this.walkAction, this.interactAction,
      this.attackMeleeAction, this.attackRangedAction, this.hurtAction, this.deathAction,
    ]) {
      if (other && other !== action) other.fadeOut(0.15)
    }
    action.setEffectiveWeight(1).fadeIn(0.1).play()
    return action.getClip().duration
  }

  /** Impact-or-death sound at the exact moment an attack of this NPC's own
   *  actually lands (plan npc-009) — mirrors `gameLoop.ts`'s existing
   *  `killed ? playActionMeleeKill : playActionMeleeHit` idiom for the
   *  player. Branches on the target's own `ref.kind` so an animal death never
   *  gets the human moan+fall clip (see `playAnimalCombatDeath`'s doc). The
   *  target's own hurt *animation* is a separate, target-owned concern
   *  (`takeDamage()`/`AnimalAgent.takeDamage()`) — this only ever plays the
   *  attacker-side hit/death sound once per resolved hit. */
  private playCombatImpactSound(target: CombatIntent['target'], targetPos: { x: number, z: number }): void {
    if (target.isAlive()) {
      playCombatHit(this.playAt, targetPos)
    } else if (target.ref.kind === 'animal') {
      playAnimalCombatDeath(this.playAt, targetPos)
    } else {
      playNpcCombatDeath(this.playAt, targetPos)
    }
  }

  private isBusyPhase(): boolean {
    return this.phase === 'execute' || this.phase === 'lookAtPlayer'
  }

  /** `?debug=1`-only diagnostic line — phase/action/distance/stamina/rescue
   *  state, per the movement-resilience plan's instrumentation requirement.
   *  Hidden (and left unwritten) outside debug mode. */
  private updateDebugLabel(): void {
    if (!isDebugMode()) {
      if (this.debugEl.style.display !== 'none') this.debugEl.style.display = 'none'
      return
    }
    if (this.debugEl.style.display === 'none') this.debugEl.style.display = ''
    const dest = this.pendingAction?.destination
    const distText = dest
      ? Math.hypot(dest.x - this.mesh.position.x, dest.z - this.mesh.position.z).toFixed(1)
      : '-'
    const staminaPercent = Math.round(getStaminaRatio(this.stamina) * 100)
    const householdText = this.household
      ? ` · hh f${this.household.foodCount()} w${this.household.stock.query('wood')} h2o${this.household.water.current}`
        + (this.role === 'hunter' ? ` arr${this.household.items.count('arrow')}` : '')
      : ''
    // Hunter-only diagnostics (plan 178 §14) — equipment/ammo carried, the
    // current hunt target (while mid-combat, so it's traceable from the same
    // `phase`/`combatIntent` state the rest of this line already reads), and
    // any carried-but-not-yet-delivered harvest. Reuses the existing debug
    // line/`?debug=1` mechanism rather than a separate diagnostics surface.
    const huntText = this.role === 'hunter'
      ? ` · arrows ${this.carried.count('arrow')} yield ${HUNT_YIELD_KINDS.reduce((n, kind) => n + this.carried.count(kind), 0)}`
        + (this.phase === 'combat' && this.combatIntent ? ` target ${this.combatIntent.target.ref.id}` : '')
      : ''
    const text = `${this.phase} · ${this.pendingAction?.kind ?? '-'} · dist ${distText} · `
      + `stamina ${staminaPercent}% · rescue ${this.watchdog.rescueStage} (${this.watchdog.lowProgressStrikes})${householdText}${huntText}`
    if (text !== this.lastDebugText) {
      this.lastDebugText = text
      this.debugEl.textContent = text
    }
  }

  private crossfade(next: THREE.AnimationAction): void {
    if (next.isRunning() && next.getEffectiveWeight() > 0.9) return
    next.reset().fadeIn(0.2).play()
    for (const action of [
      this.idleAction, this.walkAction, this.interactAction,
      this.attackMeleeAction, this.attackRangedAction, this.hurtAction, this.deathAction,
    ]) {
      if (action && action !== next) action.fadeOut(0.2)
    }
  }

  /** Kicks off a `goTo` → `execute` step — the generic replacement for the
   *  old `this.phase = 'goWell'` etc. one-liners.
   *  Caller must `join` a queue (if any) *before* this when `action.queueId`
   *  is set; we only clear a *different* prior queue here so we do not
   *  immediately `leave` the membership just established.
   *  @role Generic `goTo` → `execute` kickoff shared by every NPC action —
   *  the one place a planned action becomes the active `ActionLifecycle`.
   *  @consumes NpcPlannedAction
   *  @produces ActionLifecycle
   */
  private startAction(action: NpcPlannedAction): void {
    this.applyRimDestination(action.destination)
    if (this.isAbandonedDestination(action.destination.x, action.destination.z)) {
      this.leaveActiveQueue()
      this.beginUnscheduledIdle()
      return
    }
    if (!action.queueId) {
      this.leaveActiveQueue()
    } else if (action.queueId !== this.activeQueueId) {
      // Drop a different prior queue only — membership for `action.queueId`
      // was already joined by the caller.
      if (this.activeQueueId) this.leaveActiveQueue()
      this.activeQueueId = action.queueId
      this.trace.record({ simTime: this.simClock, type: 'queue.joined', queueId: action.queueId })
    }
    this.pendingAction = action
    replaceActionLifecycle(this.actionLifecycle)
    this.phase = 'goTo'
    resetMovementWatchdog(this.watchdog)
    this.clearRepath()
    this.trace.record({ simTime: this.simClock, type: 'action.planned', action: action.kind, queueId: action.queueId ?? null })
  }

  private leaveActiveQueue(): void {
    if (!this.activeQueueId) return
    const queueId = this.activeQueueId
    this.queues.get(this.activeQueueId)?.leave(this.id)
    this.activeQueueId = null
    this.trace.record({ simTime: this.simClock, type: 'queue.left', queueId })
  }

  /** Snapshot for the shared decision seam — not a policy framework. */
  private needPickOptions(): PickNeedOptions {
    return {
      skipWood: this.role === 'trader',
      woodShortage: (this.economy?.hasShortage('wood') ?? false) || (this.household?.shortage('wood') ?? 0) > 0,
      foodShortage: (this.economy?.hasShortage('food') ?? false) || (this.household?.shortage('food') ?? 0) > 0,
      waterShortage: (this.household?.water.shortage() ?? 0) > 0,
      // Cheap gate only — whether this NPC has an active helper assignment
      // at all, so `food` gets a chance to be picked even while this NPC
      // isn't genuinely hungry. Real eligibility (surplus, target, room) is
      // computed by `computeFoodStrategyCandidates`/`computeDeliveryAvailable`
      // once `food` is actually selected, never here.
      helperDeliveryAvailable: (this.household != null) && (this.helperDelivery != null)
        && (this.npcState.helperAssignment?.enabled ?? false),
    }
  }

  /**
   * Physiological collapse — reuse the existing `goSleep`/`sleep` path
   * rather than a second FSM. Walk home when nearby; otherwise sleep here.
   */
  private beginCollapseSleep(): void {
    this.sleepReason = 'collapse'
    this.leaveActiveQueue()
    this.pendingAction = null
    this.wait = 0
    this.pathWaypoints = []
    resetMovementWatchdog(this.watchdog)
    this.clearRepath()
    const dist = Math.hypot(
      this.mesh.position.x - this.home.x,
      this.mesh.position.z - this.home.z,
    )
    this.phase = preferHomeSleep(dist) ? 'goSleep' : 'sleep'
    if (this.phase === 'goSleep') this.prepareSleepDestination()
  }

  /** Picks the water-fetch destination for `beginNeed`'s `water`/`waterDuty`
   *  branches (plan 127 §10) — the settlement's own well, or a nearer
   *  completed player-built well when one exists within
   *  `PLAYER_WELL_WATER_SEARCH_RADIUS` of this NPC's household home. Called
   *  only when a water action actually starts, never per frame; no
   *  well-specific NPC behaviour beyond "prefer the closer usable source". */
  private resolveWaterWellTarget(): { position: { x: number, y: number, z: number }, isVillageWell: boolean } {
    const nearby = this.getNearbyPlayerWell?.(this.home.x, this.home.z, PLAYER_WELL_WATER_SEARCH_RADIUS)
    if (nearby) {
      const toNearby = Math.hypot(nearby.x - this.home.x, nearby.z - this.home.z)
      const toVillage = Math.hypot(this.landmarks.well.x - this.home.x, this.landmarks.well.z - this.home.z)
      if (toNearby < toVillage) return { position: nearby, isVillageWell: false }
    }
    return { position: this.landmarks.well, isVillageWell: true }
  }

  /** Records a Plan lifecycle-state transition and applies it — the single
   *  place `ensurePlanForNeed`/`selectAndTraceStrategy`/interruption call
   *  sites go through, so a state change is never applied without a matching
   *  trace entry. No-op when `to` doesn't actually change anything. */
  private transitionPlan(plan: NpcPlan, to: NpcPlan): void {
    if (plan.state === to.state) {
      this.npcState.activePlan = to
      return
    }
    this.trace.record({ simTime: this.simClock, type: 'plan.stateChanged', goal: plan.goal, from: plan.state, to: to.state })
    this.npcState.activePlan = to
  }

  /** Establishes or resumes the persistent Plan for `need`'s Goal (plan
   *  ai-004) — called once per `choose()` decision, right before
   *  `beginNeed()` runs its existing execution branches. A previous Plan for
   *  a *different* Goal that hadn't already reached `completed`/`obsolete`
   *  is superseded here (the arbitration above just picked a different Goal
   *  as more pressing) — matching Plan §10's "important interruption" case
   *  and the "must not suppress decision-making forever" guardrail. */
  private ensurePlanForNeed(need: NeedId): void {
    const goal = goalForNeed(need)
    if (!goal) return
    const existing = this.npcState.activePlan
    if (existing && existing.goal !== goal) {
      this.transitionPlan(existing, obsoletePlan(existing))
    }
    const current = this.npcState.activePlan
    if (planIsResumable(current, goal)) {
      // `blocked` is left as-is here — `selectAndTraceStrategy()` below is
      // the sole authority for un-blocking (it knows whether a strategy is
      // actually available again), so resuming it early would just bounce
      // straight back to `blocked` on a still-unworkable Goal.
      if (current.state === 'interrupted') {
        this.transitionPlan(current, resumePlan(current))
      }
      return
    }
    const created = createNpcPlan(goal)
    this.npcState.activePlan = created
    this.trace.record({ simTime: this.simClock, type: 'plan.created', goal })
  }

  /** Goal satisfaction (plan ai-004 §7) — the underlying need's own
   *  freshly-generated pressure dropped out (below its arbitration
   *  threshold), the same signal `choose()` uses to decide whether this need
   *  is even worth picking. Reused here rather than a second criterion, so a
   *  Plan completes "regardless of action count" and even when another actor
   *  (a different NPC, the player, local exchange) satisfied it. */
  private reevaluatePlanCompletion(pressures: readonly NpcPressure[]): void {
    const plan = this.npcState.activePlan
    if (!plan || plan.state === 'completed' || plan.state === 'obsolete') return
    const need = needForGoal(plan.goal)
    const pressure = pressures.find((p) => p.target === need)
    if (!pressure || pressure.value > 0) return
    this.trace.record({ simTime: this.simClock, type: 'plan.completed', goal: plan.goal })
    this.npcState.activePlan = null
  }

  /** Real world-effect progress toward `goal` (plan ai-004 §6) — a no-op
   *  when there's no matching active Plan, so a stray call from a strategy
   *  branch that isn't actually plan-tracked right now never resurrects/
   *  misattributes progress. */
  private progressActivePlan(goal: NpcGoalId, amount: number): void {
    if (amount <= 0) return
    const plan = this.npcState.activePlan
    if (!plan || plan.goal !== goal) return
    const updated = progressPlan(plan, amount)
    if (updated === plan) return
    this.transitionPlan(plan, updated)
    this.trace.record({ simTime: this.simClock, type: 'plan.progressed', goal, amount, total: updated.progress.amount })
  }

  /** Marks the current Plan interrupted (plan ai-004 §8) without discarding
   *  it — called from every place a concrete action is cancelled out from
   *  under an in-progress Goal (`interruptCurrentAction`, `abandonStuckAction`,
   *  `beginCombat`). The next `choose()` resolves through `ensurePlanForNeed`,
   *  which resumes this same Plan when its Goal is picked again. */
  private markPlanInterrupted(): void {
    const plan = this.npcState.activePlan
    if (!plan || plan.state === 'completed' || plan.state === 'obsolete' || plan.state === 'interrupted') return
    this.transitionPlan(plan, interruptPlan(plan))
  }

  /** Candidate strategies → selection (plan ai-003) — the explicit seam
   *  between the already-selected `need` and `beginNeed()`'s existing
   *  execution branches below. Records the exact candidate list and pick
   *  into diagnostics/trace; `beginNeed()`'s own conditions (unchanged)
   *  still own what actually executes, so a candidate marked "available"
   *  here that turns out stale by execution time (another actor consumed
   *  the source) safely falls through the same way it always has.
   *
   *  Also carries the selection onto the active Plan (plan ai-004) when one
   *  is tracking this need's Goal: `selected === null` means no strategy can
   *  currently produce a step → `blocked`; regaining one un-blocks it. */
  private selectAndTraceStrategy(need: NeedId, candidates: NpcStrategyCandidate[]): NpcStrategyId | null {
    const selected = selectStrategy(candidates)
    this.lastStrategyCandidates = candidates
    this.selectedStrategy = selected
    this.trace.record({ simTime: this.simClock, type: 'strategy.selected', need, candidates, selected })
    const goal = goalForNeed(need)
    const plan = this.npcState.activePlan
    if (goal && plan && plan.goal === goal) {
      const withStrategy = setPlanStrategy(plan, selected)
      if (selected === null && withStrategy.state !== 'blocked') {
        this.transitionPlan(withStrategy, blockPlan(withStrategy))
      } else if (selected !== null && withStrategy.state === 'blocked') {
        this.transitionPlan(withStrategy, resumePlan(withStrategy))
      } else {
        this.npcState.activePlan = withStrategy
      }
    }
    return selected
  }

  /** `need` is `'water' | 'waterDuty' | 'food' | 'wood'` in practice —
   *  `'choose'` routes `'idle'` to `beginIdle` instead and already set
   *  `this.activeNeed`.
   *  @role Executes the already-picked need via its existing branches;
   *  each branch ends by calling `startAction` with a `NpcPlannedAction`.
   *  @produces NpcPlannedAction
   */
  private beginNeed(need: NeedId): void {
    if (need === 'water') {
      // Household-aware (plan 122): drink stored `WaterBarrel` water at
      // home when there is any — the personal-thirst equivalent of the
      // `food` branch below. Otherwise fall back to the well (queued when
      // this settlement has one), same as before households owned water.
      const household = this.household
      const selected = this.selectAndTraceStrategy('water', getWaterStrategyCandidates({
        householdHasWater: household?.water.has(WATER_DRINK_FROM_STOCK_AMOUNT) ?? false,
      }))
      switch (selected) {
        case 'householdWater': {
          if (!household) break
          this.startAction({
            kind: 'drink',
            destination: copyVec3(this.home),
            durationSec: 1.2 * this.waitMultiplier,
            onComplete: () => {
              household.water.remove(WATER_DRINK_FROM_STOCK_AMOUNT)
              relieveNeed(this.needs, 'water')
            },
          })
          return
        }
        case 'well': {
          const wellTarget = this.resolveWaterWellTarget()
          const queue = wellTarget.isVillageWell && this.wellQueueId ? this.queues.get(this.wellQueueId) : undefined
          if (queue && this.wellQueueId) {
            // Leave any prior queue before joining so an agent is never in two.
            this.leaveActiveQueue()
            queue.join(this.id)
            this.startAction({
              kind: 'drink',
              destination: queue.worldDestination(this.id),
              durationSec: 1.2 * this.waitMultiplier,
              queueId: this.wellQueueId,
              onComplete: () => {
                relieveNeed(this.needs, 'water')
              },
            })
            return
          }
          this.startAction({
            kind: 'drink',
            destination: copyVec3(wellTarget.position),
            durationSec: 1.2 * this.waitMultiplier,
            onComplete: () => {
              relieveNeed(this.needs, 'water')
            },
          })
          return
        }
      }
      this.beginUnscheduledIdle()
      return
    }
    if (need === 'waterDuty' && this.household) {
      // Household water refill (plan 122) — mirrors the `wood` chop→deposit
      // chain below: fetch at the well (queued, so it shares the well's
      // existing FIFO with personal-thirst drinkers), then walk home and
      // deposit into the household's `WaterBarrel`/`AnimalTrough` reserve.
      // Reuses `kind: 'drink'` for the well leg so it gets the same
      // face-well rotation + draw SFX as a real drink (see `execute`/`goTo`).
      const household = this.household
      const selected = this.selectAndTraceStrategy('waterDuty', getWaterDutyStrategyCandidates())
      if (selected !== 'fetchDeposit') {
        this.beginUnscheduledIdle()
        return
      }
      const wellTarget = this.resolveWaterWellTarget()
      const queue = wellTarget.isVillageWell && this.wellQueueId ? this.queues.get(this.wellQueueId) : undefined
      const fetchStep = (destination: ReturnType<typeof copyVec3>, queueId?: string): NpcPlannedAction => ({
        kind: 'drink',
        destination,
        durationSec: 1.2 * this.waitMultiplier,
        queueId,
        onComplete: () => {},
        next: {
          kind: 'deposit',
          destination: copyVec3(this.home),
          durationSec: 0.8 * this.waitMultiplier,
          onComplete: () => {
            relieveNeed(this.needs, 'waterDuty')
            household.water.add(WATER_FETCH_AMOUNT)
            this.progressActivePlan('fulfilWorkDuty', WATER_FETCH_AMOUNT)
          },
        },
      })
      if (queue && this.wellQueueId) {
        this.leaveActiveQueue()
        queue.join(this.id)
        this.startAction(fetchStep(queue.worldDestination(this.id), this.wellQueueId))
        return
      }
      this.startAction(fetchStep(copyVec3(wellTarget.position)))
      return
    }
    if (need === 'food') {
      // Household-aware (plan 069): eat from household stock when there is
      // any (quick, at home); otherwise walk to the garden, gather a little
      // food into the household, and eat from that.
      const household = this.household
      const selected = this.selectAndTraceStrategy('food', this.computeFoodStrategyCandidates(household))
      switch (selected) {
        // Local resource exchange (plan settlements-npcs-005) — a real
        // shortage tries the settlement's own village storage, then a
        // same-settlement neighbour's surplus, before a fresh hunt/gather
        // trip.
        case 'economyWithdraw':
          this.beginEconomyWithdraw('food')
          return
        case 'gardenGather':
          this.startAction({
            kind: 'eat',
            destination: copyVec3(this.landmarks.garden),
            durationSec: 1.4 * this.waitMultiplier,
            onComplete: () => {
              depositFoodHarvest(household, this.economy, this.simClock)
              household?.takeFood(this.simClock)
              relieveNeed(this.needs, 'food')
              this.progressActivePlan('secureFood', 1)
            },
          })
          return
        case 'householdExchange':
          this.beginHouseholdExchange('food')
          return
        case 'householdFood': {
          if (!household) break
          this.startAction({
            kind: 'eat',
            destination: copyVec3(this.home),
            durationSec: 1.2 * this.waitMultiplier,
            onComplete: () => {
              household.takeFood(this.simClock)
              relieveNeed(this.needs, 'food')
              this.progressActivePlan('secureFood', 1)
            },
          })
          return
        }
        // Plan 174 — a real, closer hunger source (natural berries/nuts/
        // etc., or a mature crop — wild, player-planted near a settlement
        // garden, or on a player garden plot, all indistinguishable to this
        // query) takes priority over the abstract settlement-garden gather
        // below.
        case 'hunt':
          this.beginHuntExpedition(household)
          return
        case 'nearbyFoodSource':
          this.beginRealFoodGathering(household)
          return
        // Helper resource delivery (plan 167) — only ever selected (see
        // `computeDeliveryAvailable`) when this NPC isn't genuinely hungry,
        // so real hunger always keeps priority over donating surplus
        // (plan §9).
        case 'playerStorageDelivery':
          this.beginPlayerStorageDelivery()
          return
      }
      this.beginUnscheduledIdle()
      return
    }
    if (need === 'wood') {
      const selected = this.selectAndTraceStrategy('wood', getWoodStrategyCandidates({
        available: this.role !== 'trader' && this.landmarks.trees.length > 0,
        economyWithdrawAvailable: this.computeEconomyWithdrawAvailable('wood'),
        householdExchangeAvailable: this.computeHouseholdExchangeAvailable('wood'),
      }))
      switch (selected) {
        case 'chopDeposit': {
          const forest = this.forest
          let landmark = this.landmarks.trees[this.treeIndex]!
          this.treeIndex = (this.treeIndex + 1) % this.landmarks.trees.length

          if (forest) {
            const found = forest.lifecycle.findHarvestableNear(
              this.mesh.position.x,
              this.mesh.position.z,
              80,
              forest.getWorldDays(),
              forest.sampleEnv,
            )
            if (found) {
              const match = this.landmarks.trees.find((t) => t.id === found.id)
              if (match) landmark = match
            }
          }

          // Harvest success/failure decides the deposit amount (plan 131) —
          // another NPC/the player may have felled `landmark` first between
          // this chop starting and completing; the chained deposit step
          // must not still mint wood when that happens.
          let harvestedWood = 0
          // `harvestWorldTreeFully` collapses every remaining chop step (up
          // to a full felling) into one call — unlike the player's per-step
          // chop, there's no separate "the tree just fell" transition to
          // hook. Capture whether the tree was still standing (not yet
          // felled) *before* the call, so the falling SFX only plays when
          // this action actually caused that transition.
          let wasStandingBeforeChop = false
          if (forest) {
            const presenceBeforeChop = forest.lifecycle.getPresence(landmark.id)
            if (presenceBeforeChop) {
              const stageBeforeChop = forest.lifecycle.resolve(
                presenceBeforeChop,
                forest.sampleEnv(landmark.position.x, landmark.position.z),
                forest.getWorldDays(),
              ).stage
              wasStandingBeforeChop = stageBeforeChop === 'mature' || stageBeforeChop === 'old'
                || stageBeforeChop === 'limbed'
            }
          }
          this.startAction({
            kind: 'chop',
            destination: copyVec3(landmark.position),
            durationSec: 1.6 * this.waitMultiplier,
            onComplete: () => {
              if (!forest) return
              const result = harvestWorldTreeFully(
                forest.lifecycle,
                landmark.id,
                forest.getWorldDays(),
                forest.sampleEnv(landmark.position.x, landmark.position.z),
                { landmark },
              )
              if (result.ok) {
                harvestedWood = WOOD_HARVEST_AMOUNT
                if (wasStandingBeforeChop) playActionTreeFall(this.playAt, landmark.position)
              }
            },
            next: {
              kind: 'deposit',
              destination: copyVec3(householdStorageDestination('wood', this.home, this.landmarks.stockpile)),
              durationSec: 0.8 * this.waitMultiplier,
              onComplete: () => {
                relieveNeed(this.needs, 'wood')
                depositWoodHarvest(this.household, this.economy, harvestedWood, this.simClock)
                this.progressActivePlan('obtainWood', harvestedWood)
              },
            },
          })
          return
        }
        // Local resource exchange (plan settlements-npcs-005) — tried
        // before sending someone to fell a tree, same priority as `food`'s
        // branch.
        case 'economyWithdraw':
          this.beginEconomyWithdraw('wood')
          return
        case 'householdExchange':
          this.beginHouseholdExchange('wood')
          return
      }
      // No strategy available (no trees loaded, no local exchange source)
      // — same unscheduled idle fallback as a moment with no workplace
      // (not 'work').
      this.beginUnscheduledIdle()
      return
    }
    this.beginUnscheduledIdle()
  }

  /**
   * Builds `food`'s candidate strategy list (plan ai-003) — read-only checks
   * against the same hooks/conditions `beginNeed`'s `food` branch and
   * `beginHuntExpedition`/`beginRealFoodGathering` already gate on
   * (household stock, `SettlementHuntingHooks.queryTarget`,
   * `SettlementFoodSourceHooks.queryNearest`). Never mutates world state —
   * the hunt-target query in particular skips `attemptHuntKill`'s arrow
   * resupply/weapon resolution, so `hunt` being "available" here is a
   * decision-time preview, re-validated for real when `beginHuntExpedition`
   * actually runs.
   */
  private computeFoodStrategyCandidates(household: Household | null): NpcStrategyCandidate[] {
    const isHunter = this.role === 'hunter'
    const huntTargetAvailable = isHunter && this.hunting != null
      && this.hunting.queryTarget(this.mesh.position.x, this.mesh.position.z, HUNT_SEARCH_RADIUS) != null
    const nearbyFoodSourceAvailable = this.foodSources != null
      && this.foodSources.queryNearest(this.mesh.position.x, this.mesh.position.z, FOOD_SOURCE_SEARCH_RADIUS) != null
    return getFoodStrategyCandidates({
      householdHasFood: household?.has('food', 1) ?? false,
      isHunter,
      huntTargetAvailable,
      nearbyFoodSourceAvailable,
      deliveryAvailable: this.computeDeliveryAvailable(),
      economyWithdrawAvailable: this.computeEconomyWithdrawAvailable('food'),
      householdExchangeAvailable: this.computeHouseholdExchangeAvailable('food'),
    })
  }

  /** Builds the shared input `npcLogistics.ts`'s planners read (review
   *  2026-09-03 §5 E3) — `simTime` is a getter so an `onComplete` closure
   *  that runs later reads this NPC's *current* sim clock, not the value at
   *  plan-build time (§10 R3). Called fresh right before each planner call,
   *  never cached. */
  private logisticsContext(): NpcLogisticsCtx {
    return {
      household: this.household,
      economy: this.economy,
      householdExchange: this.householdExchange,
      helperDelivery: this.helperDelivery,
      helperAssignment: this.npcState.helperAssignment,
      needs: this.needs,
      home: this.home,
      landmarks: this.landmarks,
      carried: this.carried,
      waitMultiplier: this.waitMultiplier,
      simTime: () => this.simClock,
      sampleHeight: this.sampleHeight,
    }
  }

  private computeEconomyWithdrawAvailable(kind: HouseholdResourceKind): boolean {
    return canWithdrawFromEconomy(this.logisticsContext(), kind)
  }

  private computeHouseholdExchangeAvailable(kind: HouseholdResourceKind): boolean {
    return canExchangeWithHousehold(this.logisticsContext(), kind)
  }

  private beginEconomyWithdraw(kind: HouseholdResourceKind): boolean {
    const work = planEconomyWithdraw(this.logisticsContext(), kind)
    if (!work) return false
    this.startAction(work)
    return true
  }

  private beginHouseholdExchange(kind: HouseholdResourceKind): boolean {
    const work = planHouseholdExchange(this.logisticsContext(), kind)
    if (!work) return false
    this.startAction(work)
    return true
  }

  private computeDeliveryAvailable(): boolean {
    return canDeliverToPlayerStorage(this.logisticsContext())
  }

  private beginPlayerStorageDelivery(): boolean {
    const work = planPlayerStorageDelivery(this.logisticsContext())
    if (!work) return false
    this.startAction(work)
    return true
  }

  /**
   * Real, closer hunger source (plan 174) — a bounded local scan for natural
   * world-item food (berries/nuts/etc., plan 159) or a harvestable crop
   * (wild, or player-planted near a settlement garden or a player garden
   * plot — indistinguishable to this query, plan 174 §7) via the injected
   * `foodSources` hooks, so a hungry NPC prefers a real nearby resource over
   * the abstract settlement-garden gather in `beginNeed`. Returns false when
   * there are no hooks or nothing in range, so the caller falls back to that
   * abstract gather (plan §5: "NPC zachowuje istniejące zachowanie dla
   * niezaspokojonej potrzeby zamiast otrzymywać teleport lub magiczne
   * zasoby" — this only ever redirects to a real target, never invents one).
   */
  private beginRealFoodGathering(household: Household | null): boolean {
    const foodSources = this.foodSources
    if (!foodSources) return false
    const target = foodSources.queryNearest(this.mesh.position.x, this.mesh.position.z, FOOD_SOURCE_SEARCH_RADIUS)
    if (!target) return false
    this.startAction({
      kind: 'eat',
      destination: copyVec3({ x: target.x, y: this.sampleHeight(target.x, target.z), z: target.z }),
      durationSec: 1.4 * this.waitMultiplier,
      onComplete: () => {
        // Re-validated at arrival (plan §8) — another NPC/the player may
        // already have collected/harvested `target` while this one was
        // travelling; a failed harvest must not still grant free hunger
        // relief (plan §16: "source consumed by another actor before
        // arrival causes a re-query/fallback rather than free hunger
        // reduction" — the next `beginNeed` call re-queries from scratch).
        const result = foodSources.harvest(target)
        if (!result) return
        // Plan 176 §6.1 — the NPC is already standing at this crop's spot
        // (never a special search); evaluated regardless of `result.count`
        // so a heavily-neglected plot (which can legitimately yield 0, plan
        // §14) still gets a chance at being tidied.
        if (target.kind === 'crop') {
          this.maybeMaintainNearbyGarden(target.x, target.z)
          this.maybeWaterNearbyGarden(target.x, target.z)
        }
        if (result.count <= 0) return
        household?.depositFood(result.kind, result.count, this.economy, this.simClock)
        household?.takeFood(this.simClock)
        relieveNeed(this.needs, 'food')
      },
    })
    return true
  }

  /**
   * Hunter's food-need alternative to the abstract garden gather (plan 178)
   * — tried before `beginRealFoodGathering` when this NPC's role is `hunter`
   * (see `beginNeed`'s `food` branch). Resets the per-trip kill counter and
   * delegates to `attemptHuntKill` — the counter (not a separate "expedition"
   * object) is what lets one trip take 1-3 animals (plan §2) through the
   * same `beginCombat`/`onKill` seam repeated, rather than a new
   * expedition-AI framework the plan explicitly rules out.
   */
  private beginHuntExpedition(household: Household | null): boolean {
    if (!this.hunting) return false
    this.huntKillsThisTrip = 0
    return this.attemptHuntKill(household)
  }

  /**
   * One hunt-and-kill cycle (plan 178 §2/§3/§4): resupply arrows from the
   * household if low, resolve a bounded/deterministic target
   * (`SettlementHuntingHooks.queryTarget` — population-protected, never a
   * full fauna scan, plan §3/§13), then hand it to the existing ranged
   * `CombatIntent` (plan 177) with an `onKill` that harvests and decides
   * whether to hunt again or head home. Returns `false` without starting
   * anything when there's no weapon/ammo/target — the caller falls back to
   * the next existing food source, same "profession is a preference" pattern
   * as `npcProfessionWork.ts`'s ore-gathering planner (plan §4: "no
   * target/ammo → existing decision flow resumes", not a stuck NPC).
   */
  private attemptHuntKill(household: Household | null): boolean {
    const hunting = this.hunting
    if (!hunting) return false
    if (household && this.carried.count('arrow') < HUNT_RESUPPLY_ARROW_TARGET) {
      const need = HUNT_RESUPPLY_ARROW_TARGET - this.carried.count('arrow')
      const available = Math.min(need, household.items.count('arrow'))
      if (available > 0 && household.items.remove('arrow', available)) {
        this.carried.add('arrow', available)
      }
    }
    const rangedWeapon = resolveNpcRangedWeapon(this.carried)
    if (!rangedWeapon || !resolveNpcAmmoKind(this.carried, rangedWeapon.ranged)) return false
    const target = hunting.queryTarget(this.mesh.position.x, this.mesh.position.z, HUNT_SEARCH_RADIUS)
    if (!target) return false
    return this.beginCombat({
      target: target.target,
      mode: 'ranged',
      onKill: () => this.onHuntKill(target, household),
    })
  }

  /**
   * Runs once a hunted animal is confirmed dead (`CombatIntent.onKill`,
   * called from `endCombat('complete')`) — harvest is re-validated here
   * (plan 178 §5/§6: the existing fauna death/corpse lifecycle owns the
   * animal, this only ever reads its already-resolved state via
   * `SettlementHuntingHooks.harvest`, never assumes a yield just because
   * combat reported a kill). A successful harvest feeds this NPC's own
   * hunger and, while under `HUNT_MAX_KILLS_PER_TRIP` and another target is
   * available, tries one more kill before heading home; otherwise the trip
   * ends and any carried yield is delivered to the household.
   */
  private onHuntKill(target: HuntTarget, household: Household | null): void {
    const result = this.hunting?.harvest(target, this.carried) ?? null
    if (result) {
      relieveNeed(this.needs, 'food')
      this.huntKillsThisTrip += 1
    }
    if (result && this.huntKillsThisTrip < HUNT_MAX_KILLS_PER_TRIP && this.attemptHuntKill(household)) return
    this.deliverHuntYieldHome(household)
  }

  /**
   * Walks the hunt yield home and moves it from `carried` into the
   * household's generic item storage (plan 178 §6/§7) — mirrors the wood/ore
   * chop→deposit chain's shape, just triggered from a kill instead of a
   * scheduled action. No-op (stays on `choose`, already set by `endCombat`)
   * when there's nothing to deliver.
   */
  private deliverHuntYieldHome(household: Household | null): void {
    const work = planDeliverHuntYieldHome(this.carried, household, this.home, this.waitMultiplier)
    if (work) this.startAction(work)
  }

  /**
   * Plan 176 §6/§6.1/§15 — a chance to tidy a neglected garden plot, only
   * ever evaluated right after this NPC already arrived at a crop it was
   * harvesting for its own hunger (never an independent search for
   * neglected fields). Reuses the existing critical-need gate
   * (`pickNeed({ critical: true })`, the same check `tickCriticalInterrupt`
   * uses) plus health/stamina ratios, so a hungry-but-otherwise-fine NPC can
   * do a little extra work without a new priority system.
   */
  private maybeMaintainNearbyGarden(x: number, z: number): void {
    const foodSources = this.foodSources
    if (!foodSources) return
    if (this.health.currentHp / this.health.maxHp < NPC_GARDEN_MAINTENANCE_MIN_HEALTH_RATIO) return
    if (getStaminaRatio(this.stamina) < NPC_GARDEN_MAINTENANCE_MIN_STAMINA_RATIO) return
    if (pickNeed(this.needs, { critical: true }) !== 'idle') return
    const garden = foodSources.gardenNear(x, z)
    if (!garden || garden.care >= CARE_MAINTAINED_THRESHOLD) return
    if (Math.random() >= NPC_GARDEN_MAINTENANCE_CHANCE) return
    foodSources.maintainGarden(garden.id)
  }

  /**
   * Plan settlements-npcs-001 §13/§14 — a chance to water a dry garden plot,
   * same "only ever evaluated right after this NPC already arrived at a crop
   * it was harvesting" shape and gates as `maybeMaintainNearbyGarden`. Never
   * a global scan, never a special `WateringAI`.
   */
  private maybeWaterNearbyGarden(x: number, z: number): void {
    const foodSources = this.foodSources
    if (!foodSources) return
    if (this.health.currentHp / this.health.maxHp < NPC_GARDEN_MAINTENANCE_MIN_HEALTH_RATIO) return
    if (getStaminaRatio(this.stamina) < NPC_GARDEN_MAINTENANCE_MIN_STAMINA_RATIO) return
    if (pickNeed(this.needs, { critical: true }) !== 'idle') return
    const garden = foodSources.gardenNear(x, z)
    if (!garden || garden.hydration >= HYDRATION_DROUGHT_THRESHOLD) return
    if (Math.random() >= NPC_GARDEN_WATERING_CHANCE) return
    foodSources.waterGarden(garden.id)
  }

  /** Builds the shared input `npcProfessionWork.ts`'s planners read (review
   *  2026-09-03 §5 E2) — same staleness discipline as `logisticsContext()`:
   *  `simTime` is a getter and `rollWorkDurationSec` a callback, not
   *  captured values, and `advanceGuardPatrol`/`nextFishAttempt` write this
   *  NPC's real counters back rather than returning a tuple. Called fresh
   *  right before each `planProfessionWork` call, never cached. */
  private professionContext(): NpcWorkContext {
    return {
      role: this.role,
      x: this.mesh.position.x,
      z: this.mesh.position.z,
      waitMultiplier: this.waitMultiplier,
      simTime: () => this.simClock,
      rollWorkDurationSec: () => randRange(WORK_DURATION_RANGE) * this.waitMultiplier,
      home: this.home,
      landmarks: this.landmarks,
      workplace: this.workplace,
      household: this.household,
      economy: this.economy,
      carried: this.carried,
      guardPatrolIndex: this.guardPatrolIndex,
      // `% 3` mirrors `npcProfessionWork.ts`'s own fixed 3-point patrol
      // (home/well/market) — both sides know that shape by construction,
      // same as before extraction.
      advanceGuardPatrol: () => {
        this.guardPatrolIndex = (this.guardPatrolIndex + 1) % 3
      },
      fishAttempt: this.fishAttempt,
      nextFishAttempt: () => {
        this.fishAttempt += 1
        return this.fishAttempt
      },
      sampleHeight: this.sampleHeight,
      mining: this.mining,
      foodSources: this.foodSources,
      householdExchange: this.householdExchange,
    }
  }

  /**
   * Night campfire leisure opportunity (plan npc-013) — called once per
   * `choose()` tick, only once the need-pressure arbitration already picked
   * `idle` (no meaningful hunger/thirst/duty pressure won) and the schedule
   * isn't already `sleep`. Two independent jobs, both scoped to the existing
   * `social` route — this never introduces a new `ScheduleActivity`:
   *
   * - Widens the opportunity: a `home`/`wake` idle block becomes `social`
   *   when it's night, the settlement's campfire (`this.socialPlace`) is
   *   actually lit right now, and this NPC isn't too far from it to bother.
   *   `sociable` NPCs already get a `social` block from `applySociable`
   *   (`schedule.ts`) regardless of this method — this only reaches NPCs
   *   that overlay didn't touch (non-`sociable`, or outside its window).
   * - Fixes a gap in the existing `social` block: `applySociable` only
   *   proves a campfire prop exists (`hasSocialPlace`), not that it's lit
   *   *now* — this re-validates against the live fire and falls back to
   *   `home` when it has gone out.
   *
   * Deliberately does not gate an already-scheduled `social` block by the
   * night window itself — that timing is plan 151's `sociable` overlay's
   * call, not npc-013's.
   */
  private resolveIdleActivity(scheduledActivity: ScheduleActivity, timeOfDay: number): ScheduleActivity {
    const social = this.socialPlace
    const campfireAvailable =
      social != null
      && (social.isAvailable?.() ?? true)
      && this.mesh.position.distanceTo(social.position) <= NIGHT_CAMPFIRE_MAX_TRAVEL_DISTANCE
    if (scheduledActivity === 'social') return campfireAvailable ? 'social' : 'home'
    if ((scheduledActivity === 'home' || scheduledActivity === 'wake') && campfireAvailable && isNightLeisureTime(timeOfDay)) {
      return 'social'
    }
    return scheduledActivity
  }

  /** No active need (`pickNeed` returned `'idle'`) — follow the effective
   *  schedule through the existing generic `goTo`/`execute`/`wander` path.
   *  `wake` maps to staying home; `social` goes to the settlement campfire
   *  when this NPC has one (plan 151) and it's actually available right now
   *  (plan npc-013's `resolveIdleActivity` already resolved that), otherwise
   *  also falls back to home. Ordinary schedule changes do not interrupt an
   *  action already in flight — this runs only from `choose`. */
  private beginIdle(scheduledActivity: ScheduleActivity): void {
    // A Work Contract commitment (plan npc-015) sits at the same priority
    // tier as the ordinary schedule's own `work` block — pursued whenever no
    // real need/weather pressure won `choose()`'s arbitration, ahead of the
    // schedule's `eat`/`social`/`home` flavour activities. It is never a
    // pressure candidate itself (no `work` NeedId — implementation notes
    // "Decision integration"), so a genuinely urgent need already pre-empted
    // it before `beginIdle` was ever called.
    if (this.tryPursueWorkContract(scheduledActivity)) return
    if (this.settledIdleActivity !== null && this.settledIdleActivity !== scheduledActivity) {
      this.settledIdleActivity = null
    }
    const intent = idleIntentFor(scheduledActivity)
    if (intent === 'work' && this.workplace) {
      const work = planProfessionWork(this.professionContext())
      if (work) {
        this.startAction(work)
        return
      }
      this.startAction({
        kind: 'work',
        destination: copyVec3(this.workplace.position),
        durationSec: randRange(WORK_DURATION_RANGE) * this.waitMultiplier,
        onComplete: () => {
          if (this.economy) commitRoleWork(this.economy, this.role)
        },
      })
      return
    }
    if (intent === 'eat') {
      if (this.settledIdleActivity !== 'eat') {
        this.startAction({
          kind: 'eat',
          destination: copyVec3(this.landmarks.garden),
          durationSec: 1.4 * this.waitMultiplier,
          onComplete: () => {
            depositFoodHarvest(this.household, this.economy, this.simClock)
            this.household?.takeFood(this.simClock)
            relieveNeed(this.needs, 'food')
            this.settledIdleActivity = 'eat'
          },
        })
        return
      }
      this.wanderNear(this.landmarks.garden)
      return
    }
    if (intent === 'social' && this.socialPlace) {
      if (this.settledIdleActivity !== 'social') {
        this.startAction({
          kind: 'social',
          destination: copyVec3(this.socialPlace.position),
          durationSec: 1.0 * this.waitMultiplier,
          onComplete: () => { this.settledIdleActivity = 'social' },
        })
        return
      }
      this.wanderNear(this.socialPlace.position)
      return
    }
    if (intent === 'home' || intent === 'social') {
      this.wanderNear(this.home)
      return
    }
    if (intent === 'sleep') {
      this.sleepReason = 'schedule'
      this.beginGoSleep()
      return
    }
    this.beginUnscheduledIdle()
  }

  /**
   * Work Contract commitment entry point (plan npc-015 §5-§11), called only
   * from `beginIdle()` — resumes an already-accepted contract, or otherwise
   * looks for a new one to accept from this NPC's own settlement notice
   * board. Returns `true` when it claimed this idle slot (whether or not it
   * actually managed to start a fresh action this tick), `false` to let
   * `beginIdle` fall through to its ordinary schedule dispatch.
   *
   * Deliberately stateless on the NPC side: the commitment itself is never
   * cached here, always re-read from `workContracts.findByWorker(this.id)`
   * (implementation notes "Recommended contract ownership") — so an
   * interruption (`tickCriticalInterrupt`), a settlement unload/reload, or a
   * save/load round-trip all resume the exact same contract for free, with
   * no NPC-side persistence of its own.
   *
   * @domain npc
   */
  private tryPursueWorkContract(scheduledActivity: ScheduleActivity): boolean {
    const contracts = this.workContracts
    if (!contracts) return false
    const mine = contracts.findByWorker(this.id)
    if (mine) return this.pursueAcceptedContract(mine)
    return this.tryAcceptWorkContractOpportunity(contracts, scheduledActivity)
  }

  /** No existing commitment — evaluate this NPC's own settlement notice
   *  board for a new one to accept (plan §2/§3/§4). Bounded to contracts
   *  actually posted at *this* NPC's settlement (never a global scan, plan
   *  §2); an NPC with no household (isolated fallback) never sees any. */
  private tryAcceptWorkContractOpportunity(contracts: WorkContracts, scheduledActivity: ScheduleActivity): boolean {
    const settlementId = this.household?.settlementId
    if (!settlementId) return false
    const candidates = contracts.discoverableAt(noticeBoardId(settlementId))
    if (candidates.length === 0) return false
    const { best, scored } = selectBestWorkContract(candidates, {
      npcX: this.mesh.position.x,
      npcZ: this.mesh.position.z,
      role: this.role,
      scheduledActivity,
      hasWorkplace: this.workplace != null,
      dayLengthSec: this.dayLengthSec,
      walkSpeed: WALK_SPEED,
    })
    this.trace.record({ simTime: this.simClock, type: 'contract.evaluated', candidates: scored.map((s) => ({ contractId: s.contract.id, score: s.score })) })
    if (!best) return false
    const accepted = contracts.accept(best.contract.id, this.id, this.simClock)
    if (!accepted) return false
    this.trace.record({ simTime: this.simClock, type: 'contract.accepted', contractId: accepted.id, score: best.score })
    return this.pursueAcceptedContract(accepted)
  }

  /** Drives one step of an already-`accepted`/`travelling`/`working`
   *  contract's commitment (plan §6/§7/§10/§12) — always resolves the
   *  target fresh from `record.target.targetId` rather than any cached
   *  position (plan §6: "the destination must derive from the authoritative
   *  contract target/flag"). Returns `true` once this idle slot has been
   *  claimed (even when the outcome this tick was an invalidation, not real
   *  progress) — `beginIdle` should not also start a schedule activity. */
  private pursueAcceptedContract(record: WorkContractRecord): boolean {
    const contracts = this.workContracts
    if (!contracts) return false
    // Only `construction`/`WorkContractRecord.target.kind` exists today
    // (plan §2) — this guard is future-proofing for a later work type this
    // phase never introduces, not dead code.
    if (record.target.kind !== 'construction') return false
    if (record.state === 'payment_due') return false // nothing left to actively do — npc-016's turn.
    const well = this.findContractWell(record.target.targetId)
    if (!well) {
      // Target disappeared/became invalid (plan §12) — never leave the
      // contract stuck; hand it back to a terminal state instead.
      contracts.invalidateTarget(record.id)
      this.trace.record({ simTime: this.simClock, type: 'contract.invalidated', contractId: record.id, reason: 'missingTarget' })
      return true
    }
    if (isWellCompleted(well)) {
      contracts.completeWork(record.id, this.id)
      this.trace.record({ simTime: this.simClock, type: 'contract.workCompleted', contractId: record.id })
      return true
    }
    const destination = { x: well.x, y: this.sampleHeight(well.x, well.z), z: well.z }
    if (record.state === 'accepted' || record.state === 'travelling') {
      if (record.state === 'accepted') contracts.beginTravel(record.id, this.id)
      const contractId = record.id
      this.startAction({
        kind: 'work',
        destination,
        durationSec: 1.0 * this.waitMultiplier,
        onComplete: () => {
          const fresh = contracts.find(contractId)
          if (fresh?.state === 'travelling' && fresh.workerNpcId === this.id) {
            contracts.beginWork(contractId, this.id, this.simClock)
          }
        },
      })
      return true
    }
    // record.state === 'working'
    this.runContractWorkBout(record.id, well, destination)
    return true
  }

  private findContractWell(targetId: string): PlayerWellRecord | undefined {
    return this.playerWells?.nodes().find((w) => w.id === targetId)
  }

  /** Runs one active-work bout of NPC construction on `well` (plan §7) —
   *  the same `WELL_STAGE_COST`/`WELL_WORK_SESSION_HOURS` shape as the
   *  player's own `workOnWell` (`app/actions/placementActions.ts`), but
   *  through the actor-neutral `PlayerWells.addWork`/`transitionTo` seam
   *  instead of the player-only busy channel. No tool/capability check
   *  (unlike the player's own well-work): hiring is the point of a work
   *  contract, and there is no NPC-side tool-ownership model to gate on
   *  (documented simplification, plan §7/non-goals "advanced worker
   *  provisioning"). Materials, when a stage needs them, are drawn from this
   *  NPC's carried inventory plus anything dropped near the well within
   *  `CONSTRUCTION_MATERIAL_RADIUS` — the same bounded world-item lookup the
   *  player's own construction already uses (plan §9's material-supply
   *  analogue); a stage that can't currently be paid for simply stays
   *  blocked (retried next bout) rather than abandoning the contract. */
  private runContractWorkBout(
    contractId: string,
    well: PlayerWellRecord,
    destination: { x: number, y: number, z: number },
  ): void {
    const contracts = this.workContracts!
    const wells = this.playerWells!
    this.startAction({
      kind: 'work',
      destination,
      durationSec: WELL_WORK_SESSION_SEC * this.waitMultiplier,
      onComplete: () => {
        const freshContract = contracts.find(contractId)
        if (!freshContract || freshContract.state !== 'working' || freshContract.workerNpcId !== this.id) return
        const freshWell = this.findContractWell(well.id)
        if (!freshWell) {
          contracts.invalidateTarget(contractId)
          return
        }
        const stage = activeWellStage(freshWell)
        if (!stage) {
          contracts.completeWork(contractId, this.id)
          return
        }
        if (stage !== freshWell.stage) {
          const cost = WELL_STAGE_COST[stage]
          const requirements: MaterialRequirement[] = []
          if (cost.stone > 0) requirements.push({ kind: 'stone', count: cost.stone })
          if (cost.branch > 0) requirements.push({ kind: 'branch', count: cost.branch })
          const dropped = this.droppedItems
          const missing = dropped
            ? requirements.filter((r) => !hasMaterial(this.carried, dropped, freshWell.x, freshWell.z, CONSTRUCTION_MATERIAL_RADIUS, r))
            : requirements.filter((r) => this.carried.count(r.kind) < r.count)
          if (missing.length > 0) return // blocked on materials — commitment stays intact, retried next bout.
          if (dropped) {
            for (const r of requirements) consumeMaterial(this.carried, dropped, freshWell.x, freshWell.z, CONSTRUCTION_MATERIAL_RADIUS, r)
          } else {
            for (const r of requirements) this.carried.remove(r.kind, r.count)
          }
          wells.transitionTo(freshWell.id, stage)
        }
        wells.addWork(freshWell.id, WELL_WORK_SESSION_HOURS)
        const updated = this.findContractWell(freshWell.id)
        if (updated && isWellCompleted(updated)) contracts.completeWork(contractId, this.id)
      },
    })
  }

  /**
   * Weather-pressure `seekShelter` reaction (plan npc-012) — the generic
   * strategy the plan asks for, resolved to the only shelter kind this
   * version implements: the NPC's own `home` Place, via the existing
   * `goTo`/`execute` action pipeline (`startAction`), same rim-approach
   * handling `beginGoSleep`/`prepareSleepDestination` already use for the
   * house collider. No world-mutating effect on completion — sheltering is a
   * reaction to a transient world condition, not a resource action.
   *
   * Mirrors `beginIdle`'s `eat`/`social` "settle in, then stop restarting the
   * action every `choose` cycle" idiom via `shelterSettled` instead of
   * `settledIdleActivity` (kept separate — see that field's own doc comment)
   * so an NPC that has already reached home mills around near it
   * (`wanderNear`) instead of replanning a zero-distance `goTo` every tick
   * while the weather pressure stays active.
   *
   * @domain npc
   */
  private beginSeekShelter(): void {
    if (this.shelterSettled) {
      this.wanderNear(this.home)
      return
    }
    this.startAction({
      kind: 'shelter',
      destination: copyVec3(this.home),
      durationSec: SHELTER_SETTLE_DURATION_SEC * this.waitMultiplier,
      onComplete: () => { this.shelterSettled = true },
    })
  }

  /**
   * Plan 151 — the one entry point `advanceSocialPairing` (`socialBehaviour
   * .ts`) uses to discover this NPC as a conversation candidate. Non-null
   * only when this NPC is actually settled at its own Social Place (not
   * still walking there), unreserved, alive, and its extraversion-scaled
   * retry cooldown has elapsed.
   *
   * Calling this *is* the throttle: any call — whether or not it returns
   * non-null — reschedules `nextSocialAttemptSim`, so the settlement-wide
   * pairing pass can call it every frame for every settled NPC without
   * re-running the same candidate's check every frame (implementation notes
   * §3/§9). `extraversion` only ever changes this cooldown's length, never
   * which candidate `findConversationPartner` picks.
   */
  socialCandidate(): { id: string, placeId: string } | null {
    if (!this.socialPlace) return null
    if (this.health.dead) return null
    if (this.conversationPartnerId != null) return null
    if (this.settledIdleActivity !== 'social' || this.phase !== 'wander') return null
    if (this.simClock < this.nextSocialAttemptSim) return null
    this.nextSocialAttemptSim = this.simClock + conversationAttemptCooldownSec(this.personality.extraversion)
    return { id: this.id, placeId: this.socialPlace.id }
  }

  /**
   * Starts this NPC's own half of a shared `conversation` (plan 151) —
   * reuses the existing `goTo`/`execute` action lifecycle (`kind:
   * 'conversation'`) rather than a dedicated FSM phase. `durationSec` must
   * be the same value passed to the partner's own `beginConversation` call
   * (see `advanceSocialPairing`) so both finish together; `applyOutcomeOnce`
   * is the shared, already-decided relationship-delta closure, safe to call
   * from either side. `onEarlyExit` is remembered so this NPC can notify the
   * partner if *it* leaves the conversation early (see
   * `releaseConversationIfAny`).
   */
  beginConversation(
    partnerId: string,
    durationSec: number,
    applyOutcomeOnce: () => void,
    onEarlyExit: () => void,
  ): void {
    if (!this.socialPlace) return
    this.conversationPartnerId = partnerId
    this.onConversationEarlyExit = onEarlyExit
    // Friendly-talk SFX (plan settlements-npcs-004 §3) — a consequence of
    // this actually-starting conversation, never a random NPC-proximity
    // sound. Silent no-op until the clips are added (see `npcVoiceLines.ts`).
    const talkUrl = pickNpcFriendlyTalkSound(this.gender)
    if (talkUrl) this.playAt(talkUrl, this.mesh.position, FRIENDLY_TALK_SOUND_VOLUME)
    this.startAction({
      kind: 'conversation',
      destination: copyVec3(this.socialPlace.position),
      durationSec,
      onComplete: () => {
        applyOutcomeOnce()
        this.conversationPartnerId = null
        this.onConversationEarlyExit = null
        this.nextSocialAttemptSim = this.simClock + conversationAttemptCooldownSec(this.personality.extraversion)
      },
    })
  }

  /**
   * Called on this NPC by its conversation *partner* when that partner
   * leaves early (`releaseConversationIfAny`) — tears down this NPC's own
   * reservation/action without applying any relationship delta (the
   * conversation did not finish) and without calling back into the partner
   * again (`interruptCurrentAction` below only notifies when
   * `onConversationEarlyExit` is still set).
   */
  releaseConversationPartner(): void {
    if (this.conversationPartnerId == null) return
    this.conversationPartnerId = null
    this.onConversationEarlyExit = null
    if (this.pendingAction?.kind === 'conversation') this.interruptCurrentAction()
  }

  /** Shared by `interruptCurrentAction`/`abandonStuckAction`/`die` — notifies
   *  an in-flight conversation partner exactly once that this NPC is leaving
   *  early, before the caller's own generic action-fail cleanup runs. A
   *  no-op outside an active `conversation` action. */
  private releaseConversationIfAny(): void {
    if (this.pendingAction?.kind !== 'conversation') return
    const onEarlyExit = this.onConversationEarlyExit
    this.conversationPartnerId = null
    this.onConversationEarlyExit = null
    onEarlyExit?.()
  }

  /** Dock-path / wander-near-home fallback used when the schedule has no
   *  workplace to go to (or a wood need fired in a treeless settlement). */
  private beginUnscheduledIdle(): void {
    if (this.landmarks.dockRoute.length > 1 && Math.random() < FOLLOW_DOCK_PATH_CHANCE) {
      this.pathWaypoints = this.landmarks.dockRoute
      this.pathIndex = 0
      this.phase = 'followPath'
      resetMovementWatchdog(this.watchdog)
      this.clearRepath()
      return
    }
    this.wanderNear(this.home)
  }

  private wanderNear(anchor: THREE.Vector3): void {
    resetMovementWatchdog(this.watchdog)
    this.clearRepath()
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = anchor.x + (Math.random() - 0.5) * IDLE_WANDER_SPREAD
      const z = anchor.z + (Math.random() - 0.5) * IDLE_WANDER_SPREAD
      if (this.isWalkableExterior(x, z)) {
        this.target.set(x, 0, z)
        this.phase = 'wander'
        return
      }
    }
    this.target.copy(anchor)
    this.applyRimDestination(this.target)
    this.phase = 'wander'
  }

  /** Reuses existing voice pools per tier (plan 117 §3) — no new audio
   *  assets: `warm` borrows the greeting pool ("Hej!"), `enthusiastic`
   *  borrows the quest-complete/cheer pool ("Brawo!"). */
  private playReactionSound(tier: ReactionTier): void {
    const pool = tier === 'warm'
      ? NPC_GREETING_SOUND_URLS[this.voiceActor]
      : tier === 'enthusiastic'
        ? NPC_QUEST_COMPLETE_SOUND_URLS[this.gender]
        : [...NPC_REACTION_SOUND_URLS[this.gender], ...NPC_HMM_VOICE_URLS[this.voiceActor]]
    const url = pool[Math.floor(Math.random() * pool.length)]
    if (url) this.playAt(url, this.mesh.position, REACTION_SOUND_VOLUME)
  }

  private isWalkable(x: number, z: number): boolean {
    if (this.sampleHeight(x, z) <= this.waterLevel + WATER_MARGIN) return false
    const dest = this.pendingAction?.destination
    for (const collider of this.collidersNear(x, z)) {
      if (!colliderContainsPoint(collider, x, z)) continue
      // Already inside this collider (e.g. spawned at home, home == collider
      // center) — let it leave instead of trapping it; blocking only applies
      // to entering from outside.
      if (colliderContainsPoint(collider, this.mesh.position.x, this.mesh.position.z)) continue
      const destNearCollider =
        !!dest
        && colliderSignedDistance(collider, dest.x, dest.z) <= NPC_COLLIDER_APPROACH_BUFFER
      // Final approach to a destination right next to this collider (well
      // serving stand, a workplace) may clip its outer ring; never its core.
      // House wall/door OBBs (plan settlements-001) have no such soft
      // approach zone — any penetration blocks, they're a hard barrier.
      if (!destNearCollider) return false
      const depth = -colliderSignedDistance(collider, x, z)
      const coreDepth = collider.type === 'circle' ? collider.radius * (1 - NPC_COLLIDER_CORE_FRACTION) : 0
      if (depth > coreDepth) return false
    }
    return true
  }

  /** Rescue/wander probe: no 097 occupied-exit exception — a point inside
   *  any nearby disk is not a valid recovery target (plan 108). */
  private isWalkableExterior(x: number, z: number): boolean {
    if (this.sampleHeight(x, z) <= this.waterLevel + WATER_MARGIN) return false
    return isExteriorPoint(x, z, this.collidersNear(x, z))
  }

  /** Snap `dest` onto a foreign collider's rim (house/well core is not a
   *  reachable stand point from outside). Occupied disks are left alone. */
  private applyRimDestination(dest: { x: number, z: number }): void {
    const rim = destinationOnColliderRim(
      this.mesh.position,
      dest,
      this.collidersNear(dest.x, dest.z),
    )
    dest.x = rim.x
    dest.z = rim.z
  }

  private beginGoSleep(): void {
    this.prepareSleepDestination()
    if (this.isAbandonedDestination(this.sleepDest.x, this.sleepDest.z)) return
    resetMovementWatchdog(this.watchdog)
    this.clearRepath()
    this.phase = 'goSleep'
  }

  private prepareSleepDestination(): void {
    this.sleepDest.copy(this.home)
    this.applyRimDestination(this.sleepDest)
  }

  private isAbandonedDestination(x: number, z: number): boolean {
    if (!this.hasAbandonedDest || this.abandonCooldown <= 0) return false
    return Math.hypot(x - this.abandonedDestX, z - this.abandonedDestZ) < ABANDON_DEST_MATCH_DIST
  }

  /**
   * If the straight segment from the NPC to `dest` cuts through a nearby
   * collider's disk, return a bypass point on that disk's rim; otherwise
   * `dest`. Destinations already allowed to approach a collider (queued
   * drink / guard work right next to it) are left alone. Colliders the NPC
   * already stands in are skipped so an interior NPC walks *out* toward
   * dest instead of being redirected to its own house rim (plan 108 F3).
   * Only resolves the first blocking collider found — matches `isWalkable`'s
   * "closest obstacle" simplicity (plan 097 §2.2), not full multi-obstacle
   * routing.
   */
  private resolveSteerTarget(dest: THREE.Vector3): THREE.Vector3 {
    const px = this.mesh.position.x
    const pz = this.mesh.position.z
    for (const collider of this.collidersNear(px, pz)) {
      if (colliderContainsPoint(collider, px, pz)) continue
      if (colliderSignedDistance(collider, dest.x, dest.z) <= NPC_COLLIDER_APPROACH_BUFFER) continue

      const abx = dest.x - px
      const abz = dest.z - pz
      const abLen2 = abx * abx + abz * abz
      if (abLen2 < 1e-8) continue

      const apx = collider.x - px
      const apz = collider.z - pz
      let t = (apx * abx + apz * abz) / abLen2
      t = Math.max(0, Math.min(1, t))
      const cx = px + abx * t
      const cz = pz + abz * t
      if (!colliderContainsPoint(collider, cx, cz)) continue

      const extent = collider.type === 'circle' ? collider.radius : Math.max(collider.halfWidth, collider.halfDepth)
      const rim = colliderRimPoint(collider, cx, cz, extent * 0.2)
      this.tmpAvoid.set(rim.x, dest.y, rim.z)
      return this.tmpAvoid
    }
    return dest
  }

  /** 1 above HP_SLOW_THRESHOLD, tapering toward a floor as currentHp drops
   *  further — `night_owl` blunts how low that floor goes. */
  private healthSpeedMultiplier(): number {
    const factor = this.health.currentHp / this.health.maxHp
    if (factor >= HP_SLOW_THRESHOLD) return 1
    const floor = this.traits.includes('night_owl') ? HP_SLOW_FLOOR_NIGHT_OWL : HP_SLOW_FLOOR
    return floor + (1 - floor) * (factor / HP_SLOW_THRESHOLD)
  }

  private steerTo(dest: THREE.Vector3, dt: number): boolean {
    this.tmp.set(dest.x, 0, dest.z)
    this.tmp.x -= this.mesh.position.x
    this.tmp.z -= this.mesh.position.z
    const dist = Math.hypot(this.tmp.x, this.tmp.z)
    if (dist < ARRIVE) return true
    this.tmp.multiplyScalar(1 / dist)
    const speed = WALK_SPEED * this.healthSpeedMultiplier()
    this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
    // Steep terrain scales down (and, past the max walkable angle, removes)
    // the uphill component of the step — across-slope/downhill are
    // untouched (plan 183). 3-tier collision fallback shared with
    // `AnimalAgent.steerToward` (plan 202).
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
    this.moving = result.moved
    return false
  }

  /** Local NPC-NPC separation nudge (plan 153) — settlements call this each
   *  frame for agents standing too close (e.g. several converging on the
   *  well queue) so a crowd spreads out instead of overlapping/visually
   *  jamming at one point; there is otherwise no NPC-NPC avoidance at all
   *  (only static-collider avoidance via `isWalkable`/`resolveSteerTarget`).
   *  Falls back to an axis-only nudge or a no-op rather than ever stepping
   *  into water or a static collider — mirrors `steerTo`'s own fallback. */
  applySeparation(dx: number, dz: number): void {
    const x = this.mesh.position.x
    const z = this.mesh.position.z
    if (this.isWalkableExterior(x + dx, z + dz)) {
      this.mesh.position.x += dx
      this.mesh.position.z += dz
    } else if (this.isWalkableExterior(x + dx, z)) {
      this.mesh.position.x += dx
    } else if (this.isWalkableExterior(x, z + dz)) {
      this.mesh.position.z += dz
    }
  }

  /** `steerTo` wrapper that detours through whatever `attemptRepath` set up
   *  (a `findPath()` route when one was found, else the single-hop random
   *  bypass) before resuming the phase's real `dest` — the stuck rescue's
   *  Level 1. Returns `false` (never "arrived at `dest`") for every frame
   *  spent on the detour; the caller's normal arrival handling only ever
   *  sees `dest` itself. */
  private steerWithRescue(dest: THREE.Vector3, dt: number): boolean {
    if (!this.repathActive) return this.steerTo(dest, dt)
    if (!this.repathIsNavRoute) {
      if (this.steerTo(this.repathTarget, dt)) this.clearRepath()
      return false
    }
    const waypoint = this.repathWaypoints[this.repathIndex]
    if (!waypoint) {
      this.clearRepath()
      return this.steerTo(dest, dt)
    }
    this.repathWaypointScratch.set(waypoint.x, 0, waypoint.z)
    if (this.steerTo(this.repathWaypointScratch, dt)) {
      this.repathIndex++
      if (this.repathIndex >= this.repathWaypoints.length) this.clearRepath()
    }
    return false
  }

  /** Clears any in-flight repath detour — the single-hop fallback and,
   *  when one is active, the `findPath()` route (releasing its
   *  `navigationStats` active-path slot). Call whenever movement toward a
   *  destination is reset/replaced/abandoned so a stale detour never
   *  survives into the next leg. */
  private clearRepath(): void {
    if (this.repathIsNavRoute) endActivePath()
    this.repathActive = false
    this.repathIsNavRoute = false
    this.repathWaypoints = []
    this.repathIndex = 0
  }

  /** Advances the stuck-movement watchdog and acts on whatever rescue stage
   *  it reports this frame — only called while `phase` is in
   *  `WATCHDOG_PHASES` (see `update()`). */
  private tickWatchdog(dt: number): void {
    const stage = tickMovementWatchdog(this.watchdog, dt, this.mesh.position.x, this.mesh.position.z)
    if (stage === 'none') return
    this.trace.record({ simTime: this.simClock, type: 'movement.rescue', stage })
    if (stage === 'repath') this.attemptRepath()
    else if (stage === 'escape') this.attemptLocalEscape()
    else if (stage === 'abandon') this.abandonStuckAction()
  }

  /** Throttled check for a genuinely urgent reason to abandon a schedule-
   *  driven action already in flight — vigor collapse, a critical need, or
   *  (plan npc-012) severe weather. Mirrors `choose()`'s own precedence:
   *  vigor collapse outranks needs unconditionally; a critical need and
   *  severe weather only outrank a schedule-driven action, so both are gated
   *  on `activeNeed === 'idle'` (an already need-driven action is left
   *  alone — no thrashing between two needs, and weather never pre-empts a
   *  genuinely active need either). Ordinary schedule/time changes still do
   *  not interrupt (plan 060) — this only ever fires on `pickNeed`'s
   *  stricter `critical` thresholds or `WEATHER_SEVERE_SHELTER_THRESHOLD`. */
  private tickCriticalInterrupt(dt: number): void {
    this.criticalInterruptCooldown -= dt
    if (this.criticalInterruptCooldown > 0) return
    this.criticalInterruptCooldown = CRITICAL_INTERRUPT_CHECK_INTERVAL_SEC
    const criticalNeed = pickNeed(this.needs, { ...this.needPickOptions(), critical: true })
    const weatherPressure = this.currentWeather ? weatherShelterPressure(this.currentWeather) : 0
    if (shouldInterruptAction({
      collapsing: shouldCollapseSleep(this.vigor),
      activeNeed: this.activeNeed,
      criticalNeed,
      weatherPressure,
    })) {
      this.interruptCurrentAction()
    }
  }

  /** Cancels the in-flight `pendingAction` for a genuinely urgent reason
   *  (see `tickCriticalInterrupt`) and returns to `choose` so the existing
   *  single arbitration point re-derives what to do next — vigor collapse,
   *  the need itself, or (once satisfied later) whatever the effective
   *  schedule still says at that point. Does not set `activeNeed` itself —
   *  `choose()` remains the only place that decides "what now". Same
   *  `pendingAction`/path/wait/queue cleanup as `abandonStuckAction()`,
   *  minus the stuck-specific abandoned-destination/escalation bookkeeping,
   *  which doesn't apply to a healthy NPC that's simply needed elsewhere. */
  private interruptCurrentAction(): void {
    this.releaseConversationIfAny()
    const actionKind = this.pendingAction?.kind ?? null
    failActionLifecycle(this.actionLifecycle)
    this.leaveActiveQueue()
    this.pendingAction = null
    this.pathWaypoints = []
    this.pathIndex = 0
    this.wait = 0
    this.clearRepath()
    this.phase = 'choose'
    // The concrete action is gone, but the Goal it was pursuing may still be
    // meaningful (plan ai-004 §8) — mark the Plan interrupted, never clear
    // it; `ensurePlanForNeed()` resumes it once `choose()` re-derives the
    // same need.
    this.markPlanInterrupted()
    this.trace.record({ simTime: this.simClock, type: 'action.failed', action: actionKind, reason: 'interrupt' })
  }

  /** Rescue Level 1 (plan npc-006) — first tries a real bounded local-grid
   *  A* route around whatever is blocking progress toward the phase's
   *  current destination (see `currentMovementDestination`); only falls
   *  back to the old blind single-hop bypass when no destination is known
   *  or no route exists. Never changes the destination/action itself — a
   *  repath only ever changes *how* the NPC gets there. */
  private attemptRepath(): void {
    const dest = this.currentMovementDestination()
    if (dest && this.attemptNavRepath(dest)) return
    this.attemptBlindRepath()
  }

  /** Real repath: bounded A* from the current position toward `dest` via
   *  the shared `navigation/navigation.ts` layer, reusing this NPC's own
   *  `isWalkableExterior`/`sampleHeight` — Navigation never re-derives
   *  walkability from `ColliderRegistry` itself (see `NavigationQuery`'s
   *  doc). Routes toward `navigationApproachTarget(dest)` rather than `dest`
   *  itself (plan npc-007) — the existing destination-aware final approach
   *  covers the gap when the two differ. Starts following the resulting
   *  route (`repathWaypoints`) and returns `true` on success; `false` leaves
   *  the fallback to the caller. */
  private attemptNavRepath(dest: { x: number, z: number }): boolean {
    const query: NavigationQuery = {
      isWalkable: (x, z) => this.isWalkableExterior(x, z),
      sampleHeight: this.sampleHeight,
    }
    const profile: AgentProfile = {}
    const goal = navigationApproachTarget(
      dest,
      this.collidersNear(dest.x, dest.z),
      NPC_COLLIDER_APPROACH_BUFFER,
      NAV_APPROACH_CLEARANCE,
    )
    const start = performance.now()
    const result = findPath(
      query,
      profile,
      { x: this.mesh.position.x, z: this.mesh.position.z },
      { x: goal.x, z: goal.z },
    )
    recordPathRequest(result, performance.now() - start)
    recordRepath()
    if (!result || result.waypoints.length === 0) return false
    this.repathWaypoints = result.waypoints
    this.repathIndex = 0
    this.repathActive = true
    this.repathIsNavRoute = true
    beginActivePath()
    return true
  }

  /** The world-space point the NPC is currently trying to reach, for
   *  whichever `WATCHDOG_PHASES` phase is active — `null` when the phase
   *  has no single destination to path toward (falls back to the blind
   *  bypass hop instead). */
  private currentMovementDestination(): { x: number, z: number } | null {
    switch (this.phase) {
      case 'followPath': return this.pathWaypoints[this.pathIndex] ?? null
      case 'goSleep': return this.sleepDest
      case 'goTo': return this.pendingAction?.destination ?? null
      case 'wander': return this.target
      default: return null
    }
  }

  /** Rescue Level 1 fallback — steer through a small random nearby waypoint
   *  instead of retrying the exact same (already-failing) direct line, used
   *  only when `attemptNavRepath` couldn't find a real route. Samples must
   *  be exterior (plan 108) so a hop inside the occupied house is rejected. */
  private attemptBlindRepath(): void {
    const occupied = this.collidersNear(this.mesh.position.x, this.mesh.position.z)
    const radii = localEscapeRadii(this.mesh.position, occupied)
    const minR = radii[0] ?? 2
    const span = 1.5
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const radius = minR + Math.random() * span
      const x = this.mesh.position.x + Math.cos(angle) * radius
      const z = this.mesh.position.z + Math.sin(angle) * radius
      if (this.isWalkableExterior(x, z)) {
        this.repathTarget.set(x, 0, z)
        this.repathActive = true
        this.repathIsNavRoute = false
        return
      }
    }
  }

  /** Rescue Level 2 — still stuck after a repath attempt: hop directly to
   *  the nearest walkable *exterior* point on a ring that exits any occupied
   *  disk, instead of a 1.5 m hop that stays in the house core. */
  private attemptLocalEscape(): void {
    const occupied = this.collidersNear(this.mesh.position.x, this.mesh.position.z)
    const radii = localEscapeRadii(this.mesh.position, occupied)
    for (const radius of radii) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2
        const x = this.mesh.position.x + Math.cos(angle) * radius
        const z = this.mesh.position.z + Math.sin(angle) * radius
        if (this.isWalkableExterior(x, z)) {
          this.mesh.position.x = x
          this.mesh.position.z = z
          this.clearRepath()
          if (isDebugMode()) console.warn('[npc:rescue] local escape', this.name, { x, z })
          return
        }
      }
    }
  }

  /** Rescue Level 3 — still stuck after repath + escape: give up on the
   *  current action/wander/path and return to `choose`, same recovery path
   *  already used for a `goTo` with no `pendingAction` (an invalid-state
   *  safety net, not a new mechanism). Escalates to an emergency teleport
   *  when this has happened repeatedly within `RECENT_RESCUE_WINDOW_SEC`. */
  private abandonStuckAction(): void {
    this.releaseConversationIfAny()
    const actionKind = this.pendingAction?.kind ?? null
    const dest = this.pendingAction?.destination
    if (dest) {
      this.abandonedDestX = dest.x
      this.abandonedDestZ = dest.z
      this.hasAbandonedDest = true
    } else if (this.phase === 'goSleep') {
      this.abandonedDestX = this.sleepDest.x
      this.abandonedDestZ = this.sleepDest.z
      this.hasAbandonedDest = true
    } else if (this.phase === 'wander') {
      this.abandonedDestX = this.target.x
      this.abandonedDestZ = this.target.z
      this.hasAbandonedDest = true
    } else {
      this.hasAbandonedDest = false
    }
    this.abandonCooldown = ABANDON_RETRY_COOLDOWN_SEC
    failActionLifecycle(this.actionLifecycle)
    this.leaveActiveQueue()
    this.pendingAction = null
    this.pathWaypoints = []
    this.pathIndex = 0
    this.wait = 0
    this.sleepReason = null
    this.clearRepath()
    const escalate = registerAbandon(this.watchdog)
    resetMovementWatchdog(this.watchdog)
    if (escalate) this.emergencyTeleport()
    this.phase = 'choose'
    // Same principle as `interruptCurrentAction()` — the concrete action
    // failed, but the Goal survives if it's still meaningful (plan
    // ai-004 §8); the movement watchdog itself stays independent of Plan.
    this.markPlanInterrupted()
    this.trace.record({ simTime: this.simClock, type: 'action.failed', action: actionKind, reason: 'abandon' })
  }

  /** Rescue Level 4 — last-resort safety net, expected to be rare: snap to a
   *  validated-walkable known-safe point rather than continuing to retry
   *  local geometry that has already defeated repath + escape twice in a
   *  row. Never picks `home` (house center is the trap). Always logged (not
   *  gated behind `isDebugMode()`) — this path should stay rare enough to
   *  never be console noise. */
  private emergencyTeleport(): void {
    const pos = this.mesh.position
    const colliders = [
      ...this.collidersNear(pos.x, pos.z),
      ...this.collidersNear(this.landmarks.well.x, this.landmarks.well.z),
      ...this.collidersNear(this.landmarks.stockpile.x, this.landmarks.stockpile.z),
      ...this.collidersNear(this.landmarks.garden.x, this.landmarks.garden.z),
    ]
    const candidates = [
      this.landmarks.well,
      this.landmarks.stockpile,
      this.landmarks.garden,
    ]
    const picked = pickEmergencyTeleportPoint(
      pos,
      candidates,
      colliders,
      (x, z) => this.isWalkableExterior(x, z),
    )
    if (picked) {
      this.mesh.position.x = picked.x
      this.mesh.position.z = picked.z
      this.mesh.position.y = this.sampleHeight(picked.x, picked.z)
      console.warn('[npc:rescue] emergency teleport', this.name, { x: picked.x, z: picked.z })
      return
    }
    // Last resort: occupied-disk rim facing the well (plaza), never house center.
    const fallback = destinationOnColliderRim(this.landmarks.well, pos, colliders)
    this.mesh.position.x = fallback.x
    this.mesh.position.z = fallback.z
    this.mesh.position.y = this.sampleHeight(fallback.x, fallback.z)
    console.warn('[npc:rescue] emergency teleport', this.name, { x: fallback.x, z: fallback.z })
  }
}
