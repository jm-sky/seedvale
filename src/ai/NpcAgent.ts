import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { PlayAt } from '../audio/createWorldAudio'
import type { CombatIntent } from '../combat/combatIntent'
import type { ResolvedDefense } from '../combat/defenseResolver'
import type { Projectile } from '../combat/projectile'
import type { RangedAttackLifecycle } from '../combat/rangedLifecycle'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { FamilyMember, FamilyMemberRef, FamilyRelation } from '../settlement/families'
import type { Household } from '../settlement/household'
import type { Place } from '../settlement/places'
import type { SettlementLandmarks } from '../settlement/props'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { NearbyPlayerWellLookup } from '../world/playerWell'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import {
  disposeObject3D,
  loadGltfAnimated,
  prepareProp,
} from '../assets/loadGltf'
import { playActionWell } from '../audio/actionSounds'
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
import { isDebugMode } from '../debug/debugMode'
import { createNpcTraceBuffer, type NpcTraceBuffer, type NpcTraceEvent } from '../debug/npcTrace'
import {
  commitRoleWork,
  commitWoodcutterDeposit,
  type SettlementEconomy,
  tryAdvanceDevelopment,
  WOODCUTTING_PRODUCTION,
} from '../economy'
import { Inventory } from '../items/Inventory'
import { createHealthState, damageHealth, type HealthState } from '../shared/HealthState'
import {
  createStaminaState,
  drainStamina,
  getStaminaRatio,
  isExhausted,
  restoreStamina,
  type StaminaState,
} from '../shared/StaminaState'
import { createVigorState, type VigorState } from '../shared/VigorState'
import {
  type ActionLifecycle,
  type ActionLifecycleStatus,
  cancelActionLifecycle,
  completeActionLifecycle,
  copyVec3,
  createActionLifecycle,
  type DecisionContext,
  failActionLifecycle,
  finishActionLifecycle,
  type InteractionQueue,
  type PlannedAction,
  replaceActionLifecycle,
} from '../simulation'
import { MINE_DURATION_SEC, ORE_ITEM, oreEconomicKind } from '../terrain/depositMining'
import { applySlopeMovementConstraint } from '../terrain/slopeConstraint'
import { barsVisibleForDistance, gazeOpacityFactor, labelOpacityForDistance } from '../ui/labelDistance'
import { gameHoursToRealSeconds } from '../world/timeConversion'
import { harvestWorldTreeFully } from '../world/treeHarvest'
import { AGENT_RENDER_LAYER, assignRenderLayer, setSubtreeCastShadow } from '../world/waterMirror'
import {
  type CharacterDef,
  genderForName,
  type NpcGender,
  type Role,
  type Trait,
} from './characters'
import {
  nearestArchetype,
  pausePersonalityParams,
  type PausePersonalityParams,
  type Personality,
  pickDialogueLine,
} from './dialogue'
import {
  createNeedState,
  needColor,
  type NeedId,
  type NeedState,
  pickNeed,
  type PickNeedOptions,
  SLEEP_HUNGER_THIRST_RATE,
  tickNeeds,
} from './Needs'
import {
  decideAnimalThreatResponse,
  type ImmediateAnimalThreat,
  senseImmediateAnimalThreat,
  type ThreateningAnimalCandidate,
} from './npcAnimalThreat'
import {
  destinationOnColliderRim,
  isExteriorPoint,
  localEscapeRadii,
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
import { seedDefaultRoleWeapon } from './npcLoadout'
import {
  createMovementWatchdog,
  type MovementWatchdog,
  registerAbandon,
  type RescueStage,
  resetMovementWatchdog,
  tickMovementWatchdog,
} from './npcMovementWatchdog'
import {
  applyDamageVigor,
  applySleepVigor,
  applyWorkVigor,
  isHeavyWorkKind,
  MAX_VIGOR,
  preferHomeSleep,
  shouldCollapseSleep,
  shouldStayAsleep,
  type SleepReason,
  tickVigorForSimulatedStep,
} from './npcVigor'
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
  nextBoundary,
  SCHEDULE_TEMPLATES,
  type ScheduleActivity,
  type ScheduleTemplate,
} from './schedule'

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

/** One of the 5 recorded voice actors in the Super Dialogue Audio Pack v1
 *  (public/sounds/README.md) — assigned deterministically per NPC below, the
 *  same way `modelUrlFor` picks a body model, so each NPC keeps one
 *  consistent voice all session instead of a random one per line. */
export type NpcVoiceActor = 'alex' | 'ian' | 'sean' | 'karen' | 'meghan'

const NPC_VOICE_ACTORS: Record<NpcGender, readonly NpcVoiceActor[]> = {
  male: ['alex', 'ian', 'sean'],
  female: ['karen', 'meghan'],
}

function voiceActorForIndex(gender: NpcGender, treeIndex: number): NpcVoiceActor {
  const pool = NPC_VOICE_ACTORS[gender]
  return pool[treeIndex % pool.length]!
}

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

function genderForVoiceActor(actor: NpcVoiceActor): NpcGender {
  return NPC_VOICE_ACTORS.male.includes(actor) ? 'male' : 'female'
}

const ALL_VOICE_ACTORS: readonly NpcVoiceActor[] = ['alex', 'ian', 'sean', 'karen', 'meghan']

/** Builds `/sounds/{gender}-{slug}-{actor}-{NN}.ogg` pools for a Super Dialogue
 *  Audio Pack v1 category, one array per voice actor. Sources/licenses:
 *  public/sounds/README.md. */
function voiceLinePool(slug: string, count: number): Record<NpcVoiceActor, readonly string[]> {
  const pool = {} as Record<NpcVoiceActor, readonly string[]>
  for (const actor of ALL_VOICE_ACTORS) {
    const gender = genderForVoiceActor(actor)
    pool[actor] = Array.from(
      { length: count },
      (_, i) => `/sounds/${gender}-${slug}-${actor}-${String(i + 1).padStart(2, '0')}.ogg`,
    )
  }
  return pool
}

/** Flattens a category's per-actor files into one array per gender — for pools
 *  (like quest-complete, below) that are only ever picked by gender, not by
 *  the giver's specific voice actor. */
function voiceLinePoolByGender(slug: string, count: number): Record<NpcGender, readonly string[]> {
  const byActor = voiceLinePool(slug, count)
  return {
    male: NPC_VOICE_ACTORS.male.flatMap((actor) => byActor[actor]),
    female: NPC_VOICE_ACTORS.female.flatMap((actor) => byActor[actor]),
  }
}

/** "Hmm/Huh?/Wow!" clips (Miscellaneous category) — extra per-actor variety
 *  merged into `NPC_REACTION_SOUND_URLS` picks in `playReactionSound()`. */
const NPC_HMM_VOICE_URLS = voiceLinePool('hmm', 3)

/** "Hello/Hey/Welcome/Greetings" clips (Greeting category) — played when a
 *  dialogue panel opens with this NPC. */
export const NPC_GREETING_SOUND_URLS = voiceLinePool('greeting', 4)

/** "Goodbye/Take care/Farewell/Good luck" clips (Farewell category) — played
 *  when a dialogue panel closes without accepting an offer. */
export const NPC_FAREWELL_SOUND_URLS = voiceLinePool('farewell', 4)

/** "Yes/You got it/On my way/Alright" clips (Confirmation category) — played
 *  when the player accepts this NPC's dialogue offer. */
export const NPC_CONFIRMATION_SOUND_URLS = voiceLinePool('confirmation', 4)

function pickVoiceLine(pool: Record<NpcVoiceActor, readonly string[]>, actor: NpcVoiceActor): string | undefined {
  const lines = pool[actor]
  return lines[Math.floor(Math.random() * lines.length)]
}

/** Random greeting line for this NPC's assigned voice actor — call when a
 *  dialogue panel opens with them. */
export function pickNpcGreetingSound(actor: NpcVoiceActor): string | undefined {
  return pickVoiceLine(NPC_GREETING_SOUND_URLS, actor)
}

/** Random farewell line — call when a dialogue panel closes without accepting
 *  an offer. */
export function pickNpcFarewellSound(actor: NpcVoiceActor): string | undefined {
  return pickVoiceLine(NPC_FAREWELL_SOUND_URLS, actor)
}

/** Random confirmation line — call when the player accepts this NPC's
 *  dialogue offer. */
export function pickNpcConfirmationSound(actor: NpcVoiceActor): string | undefined {
  return pickVoiceLine(NPC_CONFIRMATION_SOUND_URLS, actor)
}

/** Short reaction clips played once when an NPC enters `lookAtPlayer` — one pool
 *  per gender. Sources/licenses: public/sounds/README.md. */
export const NPC_REACTION_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: ['/sounds/male-hmm-01.m4a', '/sounds/male-hmm-02.ogg'],
  female: ['/sounds/female-hmm-01.ogg', '/sounds/female-hmm-02.ogg'],
}

/** Short "thank you" clips played once a quest is turned in — one pool per
 *  gender, keyed by the giver's gender (only the name is known at that call
 *  site — see `QuestManager.playQuestCompleteSound` — so this can't be keyed
 *  by voice actor). Sources/licenses: public/sounds/README.md. */
const NPC_THANK_YOU_VOICE_URLS = voiceLinePoolByGender('thank-you', 4)

export const NPC_QUEST_COMPLETE_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: ['/sounds/male-thank-you-01.mp3', '/sounds/male-thank-you-02.ogg', ...NPC_THANK_YOU_VOICE_URLS.male],
  female: ['/sounds/female-thank-you-01.mp3', ...NPC_THANK_YOU_VOICE_URLS.female],
}

/** Quiet enough to stay under dialogue/ambient, audible enough to register. */
const REACTION_SOUND_VOLUME = 0.35

function modelUrlFor(gender: NpcGender, treeIndex: number): string {
  const pool = NPC_MODEL_URLS[gender]
  return pool[treeIndex % pool.length]!
}

/** v2 stage 2 (`docs/plans/archive/2026-08-07--020...`) collapses the old
 *  resource-specific `goGarden/goHomeDrink/goStock/goTree/goWell` +
 *  `chop/deposit/drink/eat` phases into one generic `goTo` → `execute` pair,
 *  parameterized by shared `PlannedAction` (`src/simulation`, plan 055).
 *  `followPath`/`goSleep`/`sleep`/`wander`/`lookAtPlayer` stay distinct —
 *  they aren't "go somewhere and perform one resource action", so folding
 *  them in would blur rather than simplify. */
export type Phase =
  | 'choose'
  /** Executing an externally supplied `CombatIntent` (plan 177) — see
   *  `beginCombat()`. Not entered by any NPC decision in this plan; a future
   *  Hunter/animal-defense/bandit decision system calls `beginCombat()`. */
  | 'combat'
  | 'execute'
  | 'exhausted'
  | 'followPath'
  | 'goSleep'
  | 'goTo'
  | 'lookAtPlayer'
  | 'sleep'
  | 'wander'

export type ActionId = 'chop' | 'deposit' | 'drink' | 'eat' | 'mine' | 'work'

/**
 * NPC adapter over the shared `PlannedAction` contract: destination and
 * duration are required for `goTo` → `execute`, and `onComplete` applies
 * domain world effects (needs / harvest) without an event bus.
 * Destination is a plain `Vec3` snapshot of a landmark/home/workplace
 * position (landmarks are not reassigned after settlement build).
 */
type NpcPlannedAction = PlannedAction<ActionId> & {
  destination: NonNullable<PlannedAction<ActionId>['destination']>
  durationSec: number
  onComplete: () => void
  next?: NpcPlannedAction
  /** When set, this step uses a settlement `InteractionQueue` (FIFO slots). */
  queueId?: string
  /** Carried across a `next` promotion (see the `execute` phase transition)
   *  so a chained leg — e.g. ore-gathering's `deposit` after `mine` — still
   *  reports the chain's own kind (`mine`) to `getCurrentActivity()` instead
   *  of `deposit`'s own, ambiguous kind (`docs/plans/LOOSE-ENDS.md`
   *  2026-08-16). Set automatically at promotion time; never assigned when
   *  an action starts. */
  chainKind?: ActionId
}

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
  if (chainKind === 'work' || chainKind === 'mine') return 'work'
  if (pending.kind === 'eat' && activeNeed === 'idle') return 'eat'
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

/** Need reduction applied on satisfying water/food/wood — shared by
 *  `beginNeed`'s `onComplete` effects and `resolveTimeSkip`'s catch-up steps
 *  so both apply the same "how satisfied does one visit make you" amount. */
const WATER_SATISFY_AMOUNT = 0.65
const FOOD_SATISFY_AMOUNT = 0.6
const WOOD_SATISFY_AMOUNT = 0.55
const WATER_DUTY_SATISFY_AMOUNT = 0.55

/** Household resource flow (plan 069). `WOOD_HARVEST_AMOUNT` mirrors
 *  `WOODCUTTING_PRODUCTION`'s existing settlement yield — a chop still
 *  produces the same amount of wood, it now lands in the chopper's own
 *  household first (capped, overflow to the settlement) instead of going
 *  straight to `SettlementEconomy`. `FOOD_GATHER_AMOUNT` is a new, equally
 *  small constant — there is no real farming yield to reuse yet (071). */
const WOOD_HARVEST_AMOUNT =
  WOODCUTTING_PRODUCTION.outputs.find((o) => o.kind === 'wood')?.amount ?? 2
const FOOD_GATHER_AMOUNT = 2
/** Water logistics (plan 122) — one well trip fills this much of the
 *  household's `WaterBarrel`/`AnimalTrough` reserve. Same order of
 *  magnitude as `FOOD_GATHER_AMOUNT` against `WATER_POLICY`'s capacity 5. */
const WATER_FETCH_AMOUNT = 2
/** How much stored household water one drink-at-home visit consumes. */
const WATER_DRINK_FROM_STOCK_AMOUNT = 1
/** How far (world units) from this NPC's household home a completed
 *  player-built well is considered as an alternative to the settlement's own
 *  well (plan 127 §10) — bounded so the choice stays local/deterministic,
 *  not a world-wide search. See `resolveWaterWellTarget`. */
const PLAYER_WELL_WATER_SEARCH_RADIUS = 60

/** Ore gathering (plan 131) — `miner`'s `work` schedule block tries a real
 *  `ResourceDeposits` extraction before falling back to the pre-131 idle
 *  stand. Search radius mirrors `findHarvestableNear`'s 80 above (same order
 *  of magnitude as a settlement's local interest range). NPC carry capacity
 *  only ever needs to hold one extraction's yield (weight ~1) at a time —
 *  a small fraction of the player's `DEFAULT_MAX_WEIGHT` is ample headroom. */
const ORE_SEARCH_RADIUS = 80
const NPC_CARRY_MAX_WEIGHT = 5

/** Real hunger-source discovery radius (plan 174) — same order of magnitude
 *  as `ORE_SEARCH_RADIUS`/wood's 80, chosen (not derived) so a hungry NPC
 *  checks its immediate surroundings before falling back to the abstract
 *  settlement-garden gather. */
const FOOD_SOURCE_SEARCH_RADIUS = 60

/** Chop → deposit completion, household-aware. A household caps how much of
 *  the harvest it keeps (see `Household.deposit`); anything over that still
 *  reaches the settlement economy, so `tryAdvanceDevelopment` (woodshed)
 *  keeps working the same way it did before households existed. No
 *  household (isolated fallback) reproduces the old settlement-only path.
 *  `amount` is 0 when the chop step's `harvestWorldTreeFully` call failed
 *  (tree already harvested by someone else, etc., plan 131) — a no-op guard
 *  so a failed harvest never still mints wood at deposit time. */
function depositWoodHarvest(household: Household | null, economy: SettlementEconomy | null, amount: number): void {
  if (amount <= 0) return
  if (household) {
    household.deposit('wood', amount, economy)
    if (economy) tryAdvanceDevelopment(economy)
  } else if (economy) {
    commitWoodcutterDeposit(economy)
  }
}

/** Garden visit gathers a small amount of food into the household (capped,
 *  overflow to the settlement economy) before the NPC eats from it — the
 *  personal-need equivalent of `depositWoodHarvest`. No-op without a
 *  household (isolated fallback) — matches the pre-069 behaviour where
 *  eating did not touch any resource pool. */
function depositFoodHarvest(household: Household | null, economy: SettlementEconomy | null): void {
  household?.deposit('food', FOOD_GATHER_AMOUNT, economy)
}

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

const MAX_HP = 100
const MAX_STAMINA = 100
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
  private readonly needMarker: THREE.Mesh
  private phase: Phase = 'choose'
  private activeNeed: NeedId = 'idle'
  /** Set by `startAction()`, consumed by the `goTo`/`execute` phases — the
   *  generic "walk there, do this" step currently in flight. `null` only
   *  outside those two phases. */
  private pendingAction: NpcPlannedAction | null = null
  /** After a one-shot scheduled action (eat) finishes, linger on that
   *  activity until the effective schedule moves on — avoids restarting the
   *  same meal every `choose` cycle. */
  private settledIdleActivity: ScheduleActivity | null = null
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
  /** This frame's sensed `ImmediateAnimalThreat` (plan 179 §7/§10/§12), or
   *  `null` — refreshed every `update()` call from the caller-supplied
   *  bounded `nearbyAnimalThreats` list, a situation snapshot, not a
   *  decision. See `reactToAnimalThreat()`. */
  private currentAnimalThreat: ImmediateAnimalThreat | null = null
  /** Throttles re-running `decideAnimalThreatResponse` while a threat is
   *  still present — perception itself (`currentAnimalThreat` above) stays
   *  fresh every frame; only the defend/flee re-scoring is throttled, same
   *  cadence idiom as `AnimalAgent`'s `humanDecisionTimer`. */
  private threatReactionCooldown = 0
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
  /** One-shot bypass waypoint set by a `repath` rescue attempt (`attemptRepath`)
   *  — `steerWithRescue` steers through this before resuming the phase's real
   *  destination, while `repathActive` is true. */
  private readonly repathTarget = new THREE.Vector3()
  private repathActive = false
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
  /** This NPC's family stock (plan 069). Null only in isolated fallbacks. */
  private readonly household: Household | null
  /** NPC ore-mining hooks over `ResourceDeposits` (plan 131). Null when this
   *  settlement wasn't built with one (isolated fallback, same as `economy`/
   *  `household`) — the miner role then falls back to the pre-131 idle
   *  workplace stand instead of gathering. */
  private readonly mining: SettlementMiningHooks | null
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
  /** Last text/opacity/bar widths written to the label DOM — writes invalidate
   *  CSS2D label layout, so skip them when nothing changed. */
  private lastLabelText = ''
  private lastLabelOpacity = -1
  private lastHpPercent = -1
  private lastStaminaPercent = -1
  private lastVigorPercent = -1
  private lastBarsVisible: boolean | null = null
  private lastDebugText = ''
  private lastShadowCasting: boolean | null = null

  private constructor(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    sampleHeight: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    landmarks: SettlementLandmarks,
    home: Place,
    workplace: Place | null,
    treeIndex: number,
    needOffset: number,
    member: FamilyMember,
    familyMembers: readonly FamilyMemberRef[],
    playAt: PlayAt,
    forest: SettlementForestHooks | undefined,
    npcId: string,
    queues: ReadonlyMap<string, InteractionQueue>,
    wellQueueId: string | null,
    economy: SettlementEconomy | null,
    household: Household | null,
    getPlayerSocial: PlayerSocialLookup,
    mining: SettlementMiningHooks | null,
    getNearbyPlayerWell?: NearbyPlayerWellLookup,
    foodSources?: SettlementFoodSourceHooks,
  ) {
    this.playAt = playAt
    this.forest = forest
    this.id = npcId
    this.queues = queues
    this.wellQueueId = wellQueueId
    this.economy = economy
    this.household = household
    this.mining = mining
    this.getPlayerSocial = getPlayerSocial
    this.getNearbyPlayerWell = getNearbyPlayerWell
    this.foodSources = foodSources ?? null
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
    this.traits = character.traits
    this.personality = character.personality
    this.relation = member.relation
    this.health = createHealthState(MAX_HP)
    this.stamina = createStaminaState(MAX_STAMINA)
    this.vigor = createVigorState(MAX_VIGOR)
    this.workplace = workplace
    this.schedule = effectiveScheduleFor(
      SCHEDULE_TEMPLATES[character.role],
      character.traits,
      { hasSocialPlace: false },
    )
    this.familyMembers = familyMembers
    this.dialogueArchetype = nearestArchetype(this.personality)
    this.pauseParams = applySociableBoost(pausePersonalityParams(this.personality), this.traits)
    const energetic = this.traits.includes('energetic')
    this.fatigueMult = energetic ? ENERGETIC_FATIGUE_MULT : 1
    this.restRate = BASE_REST_RATE * (energetic ? ENERGETIC_REST_MULT : 1)
    this.waitMultiplier = this.traits.includes('fast_worker') ? FAST_WORKER_WAIT_MULT : 1
    this.treeIndex = treeIndex % Math.max(1, landmarks.trees.length)
    this.needs = createNeedState(needOffset)

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

    this.labelEl = document.createElement('div')
    this.labelEl.className = 'npc-label'

    this.labelNameEl = document.createElement('div')
    this.labelNameEl.className = 'npc-label__name'
    this.labelNameEl.textContent = this.displayName
    this.lastLabelText = this.displayName

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

    const vigorBar = document.createElement('div')
    vigorBar.className = 'npc-label__bar npc-label__bar--vigor'
    this.vigorFillEl = document.createElement('div')
    this.vigorFillEl.className = 'npc-label__bar-fill'
    this.vigorFillEl.style.width = '100%'
    vigorBar.appendChild(this.vigorFillEl)

    this.labelBarsEl.append(hpBar, staminaBar, vigorBar)

    this.debugEl = document.createElement('div')
    this.debugEl.className = 'npc-label__debug'
    this.debugEl.style.display = 'none'

    this.labelEl.append(this.labelNameEl, this.labelBarsEl, this.debugEl)

    this.label = new CSS2DObject(this.labelEl)
    this.label.position.set(0, NPC_HEIGHT + 0.55, 0)
    this.mesh.add(this.label)
    assignRenderLayer(this.mesh, AGENT_RENDER_LAYER)
  }

  static async create(
    sampleHeight: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    landmarks: SettlementLandmarks,
    home: Place,
    workplace: Place | null,
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
    getPlayerSocial: PlayerSocialLookup = () => ({ relationLevel: 'stranger', standing: 0 }),
    mining: SettlementMiningHooks | null = null,
    getNearbyPlayerWell?: NearbyPlayerWellLookup,
    foodSources?: SettlementFoodSourceHooks,
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
        treeIndex,
        needOffset,
        member,
        familyMembers,
        playAt,
        forest,
        npcId,
        queues,
        wellQueueId,
        economy,
        household,
        getPlayerSocial,
        mining,
        getNearbyPlayerWell,
        foodSources,
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
        treeIndex,
        needOffset,
        member,
        familyMembers,
        playAt,
        forest,
        npcId,
        queues,
        wellQueueId,
        economy,
        household,
        getPlayerSocial,
        mining,
        getNearbyPlayerWell,
        foodSources,
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
    treeIndex: number,
    needOffset: number,
    member: FamilyMember,
    familyMembers: readonly FamilyMemberRef[],
    playAt: PlayAt,
    forest: SettlementForestHooks | undefined,
    npcId: string,
    queues: ReadonlyMap<string, InteractionQueue>,
    wellQueueId: string | null,
    economy: SettlementEconomy | null,
    household: Household | null,
    getPlayerSocial: PlayerSocialLookup,
    mining: SettlementMiningHooks | null,
    getNearbyPlayerWell?: NearbyPlayerWellLookup,
    foodSources?: SettlementFoodSourceHooks,
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
      treeIndex,
      needOffset,
      member,
      familyMembers,
      playAt,
      forest,
      npcId,
      queues,
      wellQueueId,
      economy,
      household,
      getPlayerSocial,
      mining,
      getNearbyPlayerWell,
      foodSources,
    )
  }

  getActiveNeed(): NeedId {
    return this.activeNeed
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
            food: this.household.stock.query('food'),
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
    switch (need) {
      case 'food': return this.needs.hunger
      case 'water': return this.needs.thirst
      case 'waterDuty': return this.needs.waterDuty
      case 'wood': return this.needs.woodDuty
      default: return null
    }
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
   */
  takeDamage(amount: number): void {
    if (this.health.dead) return
    damageHealth(this.health, amount)
    applyDamageVigor(this.vigor)
    if (this.health.dead) this.die()
  }

  /** Incoming combat damage (plan 177 §8/§10 — `animal → NPC`, `NPC → NPC`,
   *  `player → NPC` all share this one entry point): resolves this NPC's own
   *  defense (whatever `carried` currently exposes) before the HP loss
   *  itself goes through the same `takeDamage()` every other damage source
   *  uses. Returns the resolved outcome so a caller (e.g. a future
   *  animal-attack decision) can react (retaliate, flee) without
   *  duplicating the defense roll. */
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
    this.repathActive = false
    this.previousPhase = null
    this.sleepReason = null
    resetMovementWatchdog(this.watchdog)

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
          if (!intent.target.isAlive()) {
            this.endCombat('complete')
            return
          }
        }
      }
    }

    if (inRange && this.combatAttack.state() === 'idle' && this.stamina.current >= weapon.melee.staminaCost) {
      drainStamina(this.stamina, weapon.melee.staminaCost)
      this.combatAttack.start(weapon.melee)
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
    const decision = decideAnimalThreatResponse({
      hasMeleeCapability: meleeWeapon != null,
      hasRangedCapability: hasRanged,
      healthRatio: this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0,
    })
    if (decision === 'defend') {
      const mode: CombatIntent['mode'] = hasRanged ? 'ranged' : 'melee'
      if (this.beginCombat({ target: threat.target, mode })) return
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
    this.repathActive = false
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
    this.combatIntent = null
    this.combatMeleeWeapon = null
    this.combatRangedWeapon = null
    this.combatAttack.reset()
    this.combatRangedAttack.reset()
    this.combatProjectile = null
    this.trace.record({ simTime: this.simClock, type: 'combat.ended', outcome })
    this.phase = 'choose'
  }

  /** One-time death consequence (plan 177 §9/§13) — stops the NPC in place
   *  (mirrors `AnimalAgent.collapse()`'s tip-over) rather than a corpse/loot
   *  system, which stays out of this plan's scope. `update()` no-ops for a
   *  dead NPC from the next tick on. */
  private die(): void {
    this.leaveActiveQueue()
    this.pendingAction = null
    this.combatIntent = null
    this.combatMeleeWeapon = null
    this.combatRangedWeapon = null
    this.combatAttack.reset()
    this.combatRangedAttack.reset()
    this.combatProjectile = null
    if (this.actionLifecycle.status === 'active') failActionLifecycle(this.actionLifecycle)
    this.mixer.stopAllAction()
    this.mesh.rotation.z = Math.PI / 2
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
   *  reaction-sound trigger chance below (issue 010). */
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
  ): void {
    this.simClock += dt
    if (this.frozen) return
    if (this.health.dead) return
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
    this.currentAnimalThreat = senseImmediateAnimalThreat(
      this.mesh.position.x,
      this.mesh.position.z,
      nearbyAnimalThreats,
    )
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
        // Shared DecisionContext snapshot (plan 055) — policy remains inline
        // (`pickNeed` then effective schedule); scoring arrives in Phase 5.
        const decisionContext = this.buildDecisionContext(scheduledActivity, nearbyNpcCount)
        if (shouldCollapseSleep(this.vigor)) {
          this.beginCollapseSleep()
          break
        }
        const need = pickNeed(this.needs, this.needPickOptions())
        this.activeNeed = need
        this.trace.record({ simTime: this.simClock, type: 'need.selected', need })
        if (need !== 'idle') {
          this.beginNeed(need)
          break
        }
        if (decisionContext.scheduleActivity === 'sleep') {
          this.sleepReason = 'schedule'
          this.beginGoSleep()
          break
        }
        this.beginIdle(scheduledActivity)
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
    // Compared/stored as the same rounded percent that's actually written to
    // the DOM — the raw ratio drifts by a hair every frame during
    // regen/drain, which would defeat a guard keyed on the raw value.
    const hpPercent = this.health.maxHp > 0 ? Math.round((this.health.currentHp / this.health.maxHp) * 100) : 0
    if (hpPercent !== this.lastHpPercent) {
      this.lastHpPercent = hpPercent
      this.hpFillEl.style.width = `${hpPercent}%`
    }
    const staminaPercent = this.stamina.max > 0 ? Math.round((this.stamina.current / this.stamina.max) * 100) : 0
    if (staminaPercent !== this.lastStaminaPercent) {
      this.lastStaminaPercent = staminaPercent
      this.staminaFillEl.style.width = `${staminaPercent}%`
    }
    const vigorPercent = this.vigor.max > 0 ? Math.round((this.vigor.current / this.vigor.max) * 100) : 0
    if (vigorPercent !== this.lastVigorPercent) {
      this.lastVigorPercent = vigorPercent
      this.vigorFillEl.style.width = `${vigorPercent}%`
    }
    this.updateDebugLabel()
    const gaze = gazeOpacityFactor(
      this.mesh.position.x - observerPos.x,
      this.mesh.position.z - observerPos.z,
      observerYaw,
    )
    const dist = this.mesh.position.distanceTo(observerPos)
    const showBars = barsVisibleForDistance(dist)
    if (showBars !== this.lastBarsVisible) {
      this.lastBarsVisible = showBars
      this.labelBarsEl.style.display = showBars ? '' : 'none'
    }
    const shadowCasting = dist <= NPC_SHADOW_DISTANCE
    if (shadowCasting !== this.lastShadowCasting) {
      this.lastShadowCasting = shadowCasting
      setSubtreeCastShadow(this.mesh, shadowCasting)
    }
    // Quantized before comparing — `dist`/`gaze` change by a hair every frame
    // while the player moves, so an unrounded guard never catches a repeat.
    const opacity = Math.round(labelOpacityForDistance(dist) * gaze * 32) / 32
    if (opacity !== this.lastLabelOpacity) {
      this.lastLabelOpacity = opacity
      this.labelEl.style.opacity = String(opacity)
      // At full visibility bars sit at 80%; once the shared label fades, inherit
      // the parent opacity without an extra dimming factor.
      this.labelBarsEl.style.opacity = opacity === 1 ? '0.8' : '1'
    }
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
          this.needs.thirst = Math.max(0, this.needs.thirst - WATER_SATISFY_AMOUNT)
        } else if (need === 'waterDuty' && this.household) {
          this.needs.waterDuty = Math.max(0, this.needs.waterDuty - WATER_DUTY_SATISFY_AMOUNT)
          this.household.water.add(WATER_FETCH_AMOUNT)
        } else if (need === 'food') this.needs.hunger = Math.max(0, this.needs.hunger - FOOD_SATISFY_AMOUNT)
        else if (need === 'wood' && this.landmarks.trees.length > 0) {
          this.needs.woodDuty = Math.max(0, this.needs.woodDuty - WOOD_SATISFY_AMOUNT)
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
          : this.home
    this.mesh.position.set(target.x, this.sampleHeight(target.x, target.z), target.z)
    this.leaveActiveQueue()
    this.pendingAction = null
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
      ? ` · hh f${this.household.stock.query('food')} w${this.household.stock.query('wood')} h2o${this.household.water.current}`
      : ''
    const text = `${this.phase} · ${this.pendingAction?.kind ?? '-'} · dist ${distText} · `
      + `stamina ${staminaPercent}% · rescue ${this.watchdog.rescueStage} (${this.watchdog.lowProgressStrikes})${householdText}`
    if (text !== this.lastDebugText) {
      this.lastDebugText = text
      this.debugEl.textContent = text
    }
  }

  private crossfade(next: THREE.AnimationAction): void {
    if (next.isRunning() && next.getEffectiveWeight() > 0.9) return
    next.reset().fadeIn(0.2).play()
    for (const action of [this.idleAction, this.walkAction, this.interactAction]) {
      if (action && action !== next) action.fadeOut(0.2)
    }
  }

  /** Kicks off a `goTo` → `execute` step — the generic replacement for the
   *  old `this.phase = 'goWell'` etc. one-liners.
   *  Caller must `join` a queue (if any) *before* this when `action.queueId`
   *  is set; we only clear a *different* prior queue here so we do not
   *  immediately `leave` the membership just established. */
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
    this.repathActive = false
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
    }
  }

  private buildDecisionContext(
    scheduleActivity: ScheduleActivity,
    nearbyNpcCount: number,
  ): DecisionContext {
    return {
      needs: {
        thirst: this.needs.thirst,
        woodDuty: this.needs.woodDuty,
        waterDuty: this.needs.waterDuty,
        hunger: this.needs.hunger,
      },
      scheduleActivity,
      nearbyHumanCount: nearbyNpcCount,
      extras: {
        activeNeed: this.activeNeed,
        staminaRatio: this.stamina.max > 0 ? this.stamina.current / this.stamina.max : 0,
        vigorRatio: this.vigor.max > 0 ? this.vigor.current / this.vigor.max : 0,
      },
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
    this.repathActive = false
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

  /** `need` is `'water' | 'waterDuty' | 'food' | 'wood'` in practice —
   *  `'choose'` routes `'idle'` to `beginIdle` instead and already set
   *  `this.activeNeed`. */
  private beginNeed(need: NeedId): void {
    if (need === 'water') {
      // Household-aware (plan 122): drink stored `WaterBarrel` water at
      // home when there is any — the personal-thirst equivalent of the
      // `food` branch below. Otherwise fall back to the well (queued when
      // this settlement has one), same as before households owned water.
      const household = this.household
      if (household?.water.has(WATER_DRINK_FROM_STOCK_AMOUNT)) {
        this.startAction({
          kind: 'drink',
          destination: copyVec3(this.home),
          durationSec: 1.2 * this.waitMultiplier,
          onComplete: () => {
            household.water.remove(WATER_DRINK_FROM_STOCK_AMOUNT)
            this.needs.thirst = Math.max(0, this.needs.thirst - WATER_SATISFY_AMOUNT)
          },
        })
        return
      }
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
            this.needs.thirst = Math.max(0, this.needs.thirst - WATER_SATISFY_AMOUNT)
          },
        })
        return
      }
      this.startAction({
        kind: 'drink',
        destination: copyVec3(wellTarget.position),
        durationSec: 1.2 * this.waitMultiplier,
        onComplete: () => {
          this.needs.thirst = Math.max(0, this.needs.thirst - WATER_SATISFY_AMOUNT)
        },
      })
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
            this.needs.waterDuty = Math.max(0, this.needs.waterDuty - WATER_DUTY_SATISFY_AMOUNT)
            household.water.add(WATER_FETCH_AMOUNT)
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
      if (household?.has('food', 1)) {
        this.startAction({
          kind: 'eat',
          destination: copyVec3(this.home),
          durationSec: 1.2 * this.waitMultiplier,
          onComplete: () => {
            household.stock.remove('food', 1)
            this.needs.hunger = Math.max(0, this.needs.hunger - FOOD_SATISFY_AMOUNT)
          },
        })
        return
      }
      // Plan 174 — a real, closer hunger source (natural berries/nuts/etc.,
      // or a mature crop — wild, player-planted near a settlement garden, or
      // on a player garden plot, all indistinguishable to this query) takes
      // priority over the abstract settlement-garden gather below. Falls
      // through to it when none is in range, exactly like a miner NPC with
      // no loaded ore falls back to `beginUnscheduledIdle`.
      if (this.beginRealFoodGathering(household)) return
      this.startAction({
        kind: 'eat',
        destination: copyVec3(this.landmarks.garden),
        durationSec: 1.4 * this.waitMultiplier,
        onComplete: () => {
          depositFoodHarvest(household, this.economy)
          household?.stock.remove('food', Math.min(1, household.stock.query('food')))
          this.needs.hunger = Math.max(0, this.needs.hunger - FOOD_SATISFY_AMOUNT)
        },
      })
      return
    }
    if (need === 'wood' && this.role !== 'trader' && this.landmarks.trees.length > 0) {
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
      // another NPC/the player may have felled `landmark` first between this
      // chop starting and completing; the chained deposit step must not
      // still mint wood when that happens.
      let harvestedWood = 0
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
          if (result.ok) harvestedWood = WOOD_HARVEST_AMOUNT
        },
        next: {
          kind: 'deposit',
          destination: copyVec3(this.landmarks.stockpile),
          durationSec: 0.8 * this.waitMultiplier,
          onComplete: () => {
            this.needs.woodDuty = Math.max(0, this.needs.woodDuty - WOOD_SATISFY_AMOUNT)
            depositWoodHarvest(this.household, this.economy, harvestedWood)
          },
        },
      })
      return
    }
    // 'wood' need but this settlement has no trees yet — same unscheduled
    // idle fallback as a moment with no workplace (not 'work').
    this.beginUnscheduledIdle()
  }

  /**
   * Miner's `work` schedule block tries a real ore extraction before falling
   * back to the idle workplace stand (plan 131) — reuses the same
   * `ResourceDeposits` the player's pickaxe mines (via the injected `mining`
   * hooks), so extraction/depletion keeps one owner; no NPC-only ore
   * registry. Ore is settlement-level raw stock (implementation notes §3),
   * not household — `Household` stays a family food/wood pantry. Returns
   * false when there's no mining hooks, no loaded deposit nearby, or no
   * carry room, so the caller falls back to the pre-131 idle-work stand
   * (plan 131 §7: profession is a preference, not the only way to act).
   */
  private beginOreGathering(): boolean {
    const mining = this.mining
    const economy = this.economy
    if (!mining || !economy) return false
    const target = mining.queryNearest(this.mesh.position.x, this.mesh.position.z, ORE_SEARCH_RADIUS)
    if (!target) return false
    const itemKind = ORE_ITEM[target.type]
    if (!this.carried.canAdd(itemKind, 1)) return false

    // Set by the `mine` step's onComplete, consumed by the chained `deposit`
    // step's onComplete — mirrors the wood chop→deposit atomicity fix above:
    // depletion (another NPC/the player got there first) must not still
    // credit the settlement economy.
    let minedCount = 0
    this.startAction({
      kind: 'mine',
      destination: copyVec3({ x: target.x, y: this.sampleHeight(target.x, target.z), z: target.z }),
      durationSec: MINE_DURATION_SEC * this.waitMultiplier,
      onComplete: () => {
        const result = mining.mine(target.id)
        if (result.ok) {
          this.carried.add(result.yield.kind, result.yield.count)
          minedCount = result.yield.count
        }
      },
      next: {
        kind: 'deposit',
        destination: copyVec3(this.landmarks.stockpile),
        durationSec: 0.8 * this.waitMultiplier,
        onComplete: () => {
          if (minedCount <= 0) return
          this.carried.remove(itemKind, minedCount)
          economy.add(oreEconomicKind(target.type), minedCount)
        },
      },
    })
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
        household?.deposit('food', result.count, this.economy)
        household?.stock.remove('food', Math.min(1, household.stock.query('food')))
        this.needs.hunger = Math.max(0, this.needs.hunger - FOOD_SATISFY_AMOUNT)
      },
    })
    return true
  }

  /** No active need (`pickNeed` returned `'idle'`) — follow the effective
   *  schedule through the existing generic `goTo`/`execute`/`wander` path.
   *  `wake` maps to staying home; `social` currently has no Place so it
   *  also stays home. Ordinary schedule changes do not interrupt an action
   *  already in flight — this runs only from `choose`. */
  private beginIdle(scheduledActivity: ScheduleActivity): void {
    if (this.settledIdleActivity !== null && this.settledIdleActivity !== scheduledActivity) {
      this.settledIdleActivity = null
    }
    const intent = idleIntentFor(scheduledActivity)
    if (intent === 'work' && this.workplace) {
      if (this.role === 'miner' && this.beginOreGathering()) return
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
            depositFoodHarvest(this.household, this.economy)
            this.household?.stock.remove('food', Math.min(1, this.household.stock.query('food')))
            this.needs.hunger = Math.max(0, this.needs.hunger - FOOD_SATISFY_AMOUNT)
            this.settledIdleActivity = 'eat'
          },
        })
        return
      }
      this.wanderNear(this.landmarks.garden)
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

  /** Dock-path / wander-near-home fallback used when the schedule has no
   *  workplace to go to (or a wood need fired in a treeless settlement). */
  private beginUnscheduledIdle(): void {
    if (this.landmarks.dockRoute.length > 1 && Math.random() < FOLLOW_DOCK_PATH_CHANCE) {
      this.pathWaypoints = this.landmarks.dockRoute
      this.pathIndex = 0
      this.phase = 'followPath'
      resetMovementWatchdog(this.watchdog)
      this.repathActive = false
      return
    }
    this.wanderNear(this.home)
  }

  private wanderNear(anchor: THREE.Vector3): void {
    resetMovementWatchdog(this.watchdog)
    this.repathActive = false
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
      const dist = Math.hypot(x - collider.x, z - collider.z)
      if (dist >= collider.radius) continue
      const distFromCurrent = Math.hypot(
        this.mesh.position.x - collider.x,
        this.mesh.position.z - collider.z,
      )
      // Already inside this collider (e.g. spawned at home, home == collider
      // center) — let it leave instead of trapping it; blocking only applies
      // to entering from outside.
      if (distFromCurrent < collider.radius) continue
      const approachAllow = collider.radius + NPC_COLLIDER_APPROACH_BUFFER
      const destNearCollider =
        !!dest
        && Math.hypot(dest.x - collider.x, dest.z - collider.z) <= approachAllow
      // Final approach to a destination right next to this collider (well
      // serving stand, a workplace) may clip its outer ring; never its core.
      if (!destNearCollider) return false
      if (dist < collider.radius * NPC_COLLIDER_CORE_FRACTION) return false
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
    this.repathActive = false
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
      const distFromCurrent = Math.hypot(px - collider.x, pz - collider.z)
      if (distFromCurrent < collider.radius) continue

      const destDist = Math.hypot(dest.x - collider.x, dest.z - collider.z)
      if (destDist <= collider.radius + NPC_COLLIDER_APPROACH_BUFFER) continue

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
      const dx = cx - collider.x
      const dz = cz - collider.z
      const d = Math.hypot(dx, dz)
      if (d >= collider.radius) continue

      const rim = collider.radius * 1.2
      if (d > 1e-4) {
        this.tmpAvoid.set(collider.x + (dx / d) * rim, dest.y, collider.z + (dz / d) * rim)
      } else {
        const len = Math.sqrt(abLen2)
        this.tmpAvoid.set(collider.x + (-abz / len) * rim, dest.y, collider.z + (abx / len) * rim)
      }
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
    this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
    if (this.isWalkable(x + stepX, z + stepZ)) {
      this.mesh.position.x += stepX
      this.mesh.position.z += stepZ
    } else if (this.isWalkable(x + stepX, z)) {
      this.mesh.position.x += stepX
    } else if (this.isWalkable(x, z + stepZ)) {
      this.mesh.position.z += stepZ
    }
    this.moving = this.mesh.position.x !== x || this.mesh.position.z !== z
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

  /** `steerTo` wrapper that detours through a one-shot `repathTarget` (set by
   *  `attemptRepath`) before resuming the phase's real `dest` — the stuck
   *  rescue's Level 1. Returns `false` (never "arrived at `dest`") for every
   *  frame spent on the detour; the caller's normal arrival handling only
   *  ever sees `dest` itself. */
  private steerWithRescue(dest: THREE.Vector3, dt: number): boolean {
    if (this.repathActive) {
      if (this.steerTo(this.repathTarget, dt)) this.repathActive = false
      return false
    }
    return this.steerTo(dest, dt)
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
   *  driven action already in flight — vigor collapse or a critical need.
   *  Mirrors `choose()`'s own precedence: vigor collapse outranks needs
   *  unconditionally; a critical need only outranks a schedule-driven
   *  action, so it's gated on `activeNeed === 'idle'` (an already need-
   *  driven action is left alone — no thrashing between two needs).
   *  Ordinary schedule/time changes still do not interrupt (plan 060) —
   *  this only ever fires on `pickNeed`'s stricter `critical` thresholds. */
  private tickCriticalInterrupt(dt: number): void {
    this.criticalInterruptCooldown -= dt
    if (this.criticalInterruptCooldown > 0) return
    this.criticalInterruptCooldown = CRITICAL_INTERRUPT_CHECK_INTERVAL_SEC
    if (shouldCollapseSleep(this.vigor)) {
      this.interruptCurrentAction()
      return
    }
    if (this.activeNeed !== 'idle') return
    const need = pickNeed(this.needs, { ...this.needPickOptions(), critical: true })
    if (need !== 'idle') this.interruptCurrentAction()
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
    const actionKind = this.pendingAction?.kind ?? null
    failActionLifecycle(this.actionLifecycle)
    this.leaveActiveQueue()
    this.pendingAction = null
    this.pathWaypoints = []
    this.pathIndex = 0
    this.wait = 0
    this.repathActive = false
    this.phase = 'choose'
    this.trace.record({ simTime: this.simClock, type: 'action.failed', action: actionKind, reason: 'interrupt' })
  }

  /** Rescue Level 1 — steer through a small random nearby waypoint instead
   *  of retrying the exact same (already-failing) direct line. Samples must
   *  be exterior (plan 108) so a hop inside the occupied house is rejected. */
  private attemptRepath(): void {
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
          this.repathActive = false
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
    this.repathActive = false
    const escalate = registerAbandon(this.watchdog)
    resetMovementWatchdog(this.watchdog)
    if (escalate) this.emergencyTeleport()
    this.phase = 'choose'
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
