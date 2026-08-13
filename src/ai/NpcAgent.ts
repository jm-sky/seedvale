import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { PlayAt } from '../audio/createWorldAudio'
import type { HeightSampler } from '../player/PlayerController'
import type { FamilyMember, FamilyMemberRef, FamilyRelation } from '../settlement/families'
import type { Place } from '../settlement/places'
import type { SettlementLandmarks } from '../settlement/props'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import {
  disposeObject3D,
  loadGltfAnimated,
  prepareProp,
} from '../assets/loadGltf'
import { playActionWell } from '../audio/actionSounds'
import { createHealthState, damageHealth, type HealthState } from '../shared/HealthState'
import {
  createStaminaState,
  drainStamina,
  restoreStamina,
  type StaminaState,
} from '../shared/StaminaState'
import { createVigorState, type VigorState } from '../shared/VigorState'
import {
  type ActionLifecycle,
  completeActionLifecycle,
  copyVec3,
  createActionLifecycle,
  type DecisionContext,
  failActionLifecycle,
  type InteractionQueue,
  type PlannedAction,
  replaceActionLifecycle,
} from '../simulation'
import { barsVisibleForDistance, gazeOpacityFactor, labelOpacityForDistance } from '../ui/labelDistance'
import { harvestWorldTreeFully } from '../world/treeHarvest'
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
  tickNeeds,
} from './Needs'
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
/** Minimum clearance above waterLevel an NPC will walk into or wander toward. */
const WATER_MARGIN = 0.3
/**
 * Keep NPC feet outside the village well mesh (base radius ~0.85 in
 * `createWell`) plus a small buffer. Serving stand is farther out
 * (`servingOffset` in createSettlement) so queued drinks never need the
 * blocked disk; transit paths that would cut through the well are deflected.
 */
const WELL_COLLISION_RADIUS = 1.0
/** Destinations this close to the well may enter the collision disk (serving /
 *  workplace). Farther goals skirt around instead of walking through. */
const WELL_APPROACH_ALLOW = WELL_COLLISION_RADIUS + 0.4

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

/** Short reaction clips played once when an NPC enters `lookAtPlayer` — one pool
 *  per gender. Sources/licenses: public/sounds/README.md. */
export const NPC_REACTION_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: ['/sounds/male-hmm-01.m4a', '/sounds/male-hmm-02.ogg'],
  female: ['/sounds/female-hmm-01.ogg', '/sounds/female-hmm-02.ogg'],
}

/** Short "thank you" clips played once a quest is turned in — one pool per
 *  gender, keyed by the giver's gender. Sources/licenses: public/sounds/README.md. */
export const NPC_QUEST_COMPLETE_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: ['/sounds/male-thank-you-01.mp3', '/sounds/male-thank-you-02.ogg'],
  female: ['/sounds/female-thank-you-01.mp3'],
}

/** Quiet enough to stay under dialogue/ambient, audible enough to register. */
const REACTION_SOUND_VOLUME = 0.35

function modelUrlFor(gender: NpcGender, treeIndex: number): string {
  const pool = NPC_MODEL_URLS[gender]
  return pool[treeIndex % pool.length]!
}

/** v2 stage 2 (`docs/plans/2026-08-07--020...`) collapses the old
 *  resource-specific `goGarden/goHomeDrink/goStock/goTree/goWell` +
 *  `chop/deposit/drink/eat` phases into one generic `goTo` → `execute` pair,
 *  parameterized by shared `PlannedAction` (`src/simulation`, plan 055).
 *  `followPath`/`goSleep`/`sleep`/`wander`/`lookAtPlayer` stay distinct —
 *  they aren't "go somewhere and perform one resource action", so folding
 *  them in would blur rather than simplify. */
type Phase =
  | 'choose'
  | 'execute'
  | 'followPath'
  | 'goSleep'
  | 'goTo'
  | 'lookAtPlayer'
  | 'sleep'
  | 'wander'

type ActionId = 'chop' | 'deposit' | 'drink' | 'eat' | 'work'

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
}

/** Public, dialogue-facing summary of what an NPC is doing right now — a
 *  narrower, stable view over the private `phase`/`pendingAction` FSM state
 *  (`getCurrentActivity()` below), so callers outside this class never see
 *  `Phase`/`PlannedAction` themselves (`docs/plans/2026-08-09--048...`). */
export type CurrentActivityKind = 'eat' | 'idle' | 'need' | 'sleep' | 'talking' | 'wander' | 'work'

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

/** Phases the player's approach may interrupt to trigger a lookAtPlayer pause. */
const PAUSE_INTERRUPTIBLE_PHASES: ReadonlySet<Phase> = new Set([
  'choose',
  'followPath',
  'goTo',
  'wander',
])

/** Phases that drain stamina (effort) vs. ones that regenerate it. */
const FATIGUE_PHASES: ReadonlySet<Phase> = new Set(['execute', 'goTo'])
const REST_PHASES: ReadonlySet<Phase> = new Set(['followPath', 'goSleep', 'lookAtPlayer', 'sleep', 'wander'])

/** Need reduction applied on satisfying water/food/wood — shared by
 *  `beginNeed`'s `onComplete` effects and `resolveTimeSkip`'s catch-up steps
 *  so both apply the same "how satisfied does one visit make you" amount. */
const WATER_SATISFY_AMOUNT = 0.65
const FOOD_SATISFY_AMOUNT = 0.6
const WOOD_SATISFY_AMOUNT = 0.55

/** Game-time step used by `resolveTimeSkip` to replay a `timeSkip.ts`
 *  period in coarse increments instead of one big end-of-skip jump — close
 *  to the natural re-trigger cadence of the fastest-decaying need (`thirst`)
 *  at default `Needs.ts`/`dayNight.ts` rates, so a multi-hour skip still
 *  resolves roughly as many satisfy-cycles as unskipped play would have.
 *  See `docs/plans/2026-08-12--075--time-skip-npc-catchup.md`. */
const TIME_SKIP_SAMPLE_HOURS = 0.5

/** Chance per `choose` cycle — when no active need routes the NPC anywhere
 *  specific and it would otherwise wander a few units from home — that it
 *  instead walks its settlement's dock path (`landmarks.dockRoute`, set by
 *  `createSettlement.ts` only for settlements near enough to water to have
 *  resolved one — see `settlement/roadNetwork.ts`). */
const FOLLOW_DOCK_PATH_CHANCE = 0.08
/** Random wander radius around home / garden while lingering on a schedule block. */
const IDLE_WANDER_SPREAD = 4

/** Chance a `water` need routes the NPC to drink at home instead of the
 *  village well — same destination-swap idea as `FOLLOW_DOCK_PATH_CHANCE`,
 *  see `beginNeed()`. Not a "carry water" mechanic — drinking at home is
 *  identical to drinking at the well (same `drink` phase, same instant
 *  thirst reduction), just a different destination. */
const HOME_WATER_CHANCE = 0.45

/** How long (seconds, before `waitMultiplier`) a scheduled `work` action
 *  occupies an NPC at its `workplace` before it loops back to `choose` —
 *  same order of magnitude as the resource-action waits above (0.8-1.6). */
const WORK_DURATION_RANGE: [number, number] = [2, 4]

const MAX_HP = 100
const MAX_STAMINA = 100
const BASE_FATIGUE_RATE = 3 // stamina/sec while in a FATIGUE_PHASES phase
const BASE_REST_RATE = 6 // stamina/sec while in a REST_PHASES phase
const ENERGETIC_FATIGUE_MULT = 0.6
const ENERGETIC_REST_MULT = 1.5

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
  private readonly fatigueRate: number
  private readonly restRate: number
  private readonly waitMultiplier: number
  private readonly sampleHeight: HeightSampler
  private readonly waterLevel: number
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
  /** Shared action lifecycle for the in-flight `PlannedAction` only —
   *  orthogonal to agent `Phase` (`wander`/`sleep`/…). */
  private actionLifecycle: ActionLifecycle = createActionLifecycle()
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
  private readonly tmp = new THREE.Vector3()
  private readonly tmpAvoid = new THREE.Vector3()
  private readonly labelEl: HTMLDivElement
  private readonly labelNameEl: HTMLDivElement
  private readonly labelBarsEl: HTMLDivElement
  private readonly hpFillEl: HTMLDivElement
  private readonly staminaFillEl: HTMLDivElement
  private readonly vigorFillEl: HTMLDivElement
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
  /** Last text/opacity/bar widths written to the label DOM — writes invalidate
   *  CSS2D label layout, so skip them when nothing changed. */
  private lastLabelText = ''
  private lastLabelOpacity = -1
  private lastHpPercent = -1
  private lastStaminaPercent = -1
  private lastVigorPercent = -1
  private lastBarsVisible: boolean | null = null

  private constructor(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    sampleHeight: HeightSampler,
    waterLevel: number,
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
  ) {
    this.playAt = playAt
    this.forest = forest
    this.id = npcId
    this.queues = queues
    this.wellQueueId = wellQueueId
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
    this.landmarks = landmarks
    this.home = home.position.clone()
    const character = member.character
    this.name = character.name
    this.displayName = character.lastName ? `${character.name} ${character.lastName}` : character.name
    this.gender = character.gender
    this.role = character.role
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
    this.fatigueRate = BASE_FATIGUE_RATE * (energetic ? ENERGETIC_FATIGUE_MULT : 1)
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
    this.labelEl.append(this.labelNameEl, this.labelBarsEl)

    this.label = new CSS2DObject(this.labelEl)
    this.label.position.set(0, NPC_HEIGHT + 0.55, 0)
    this.mesh.add(this.label)
  }

  static async create(
    sampleHeight: HeightSampler,
    waterLevel: number,
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
  ): Promise<NpcAgent> {
    try {
      const { scene, animations } = await loadGltfAnimated(modelUrl)
      return new NpcAgent(
        scene,
        animations,
        sampleHeight,
        waterLevel,
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
      )
    } catch (err) {
      console.warn(`[npc] failed to load ${modelUrl}, using capsule`, err)
      return NpcAgent.createCapsuleFallback(
        sampleHeight,
        waterLevel,
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
      )
    }
  }

  private static createCapsuleFallback(
    sampleHeight: HeightSampler,
    waterLevel: number,
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
    )
  }

  getActiveNeed(): NeedId {
    return this.activeNeed
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
      case 'execute':
      case 'goTo':
        if (this.pendingAction?.kind === 'work') return { kind: 'work', endHour }
        if (this.pendingAction?.kind === 'eat' && this.activeNeed === 'idle') {
          return { kind: 'eat', endHour }
        }
        if (this.pendingAction) return { kind: 'need', need: this.activeNeed }
        return { kind: 'idle' }
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
   * cost. `HealthState` stays combat-agnostic (plan 092).
   */
  takeDamage(amount: number): void {
    if (this.health.dead) return
    damageHealth(this.health, amount)
    applyDamageVigor(this.vigor)
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
  ): void {
    tickNeeds(this.needs, dt)
    this.moving = false
    const scheduledActivity = this.getScheduledActivity(timeOfDay)

    if (FATIGUE_PHASES.has(this.phase)) {
      drainStamina(this.stamina, this.fatigueRate * dt)
    } else if (REST_PHASES.has(this.phase)) {
      restoreStamina(this.stamina, this.restRate * dt)
    }
    if (this.phase === 'execute' && this.pendingAction && isHeavyWorkKind(this.pendingAction.kind)) {
      applyWorkVigor(this.vigor, dt)
    } else if (this.phase === 'sleep') {
      applySleepVigor(this.vigor, dt)
    }

    if (this.pauseCooldown > 0) this.pauseCooldown -= dt
    if (this.pauseCooldown <= 0 && PAUSE_INTERRUPTIBLE_PHASES.has(this.phase)) {
      const dx = this.mesh.position.x - observerPos.x
      const dz = this.mesh.position.z - observerPos.z
      const params = this.pauseParams
      if (Math.hypot(dx, dz) < params.triggerDistance) {
        // A lone NPC (nearbyNpcCount 0) always reacts, same as before this
        // was added. In a group, the chance drops with how many others are
        // close by — scaled by (1 - openness) so an open/curious NPC barely
        // cares about the crowd while a closed one goes quiet in company.
        const reactionChance =
          1 / (1 + GROUP_SUPPRESSION_STRENGTH * nearbyNpcCount * (1 - this.personality.openness))
        if (Math.random() < reactionChance) {
          this.previousPhase = this.phase
          this.phase = 'lookAtPlayer'
          this.pauseTimer = randRange(params.lookDurationRange)
          this.playReactionSound()
        } else {
          this.pauseCooldown = SUPPRESSED_REACTION_RETRY_COOLDOWN
        }
      }
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
        const need = pickNeed(this.needs, { skipWood: this.role === 'trader' })
        this.activeNeed = need
        if (need !== 'idle') {
          this.beginNeed(need)
          break
        }
        if (decisionContext.scheduleActivity === 'sleep') {
          this.sleepReason = 'schedule'
          this.phase = 'goSleep'
          break
        }
        this.beginIdle(scheduledActivity)
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
            // Chained step stays `active` — do not complete between links.
            this.phase = 'goTo'
          } else {
            completeActionLifecycle(this.actionLifecycle)
            this.leaveActiveQueue()
            this.phase = 'choose'
          }
        }
        break
      }
      case 'followPath': {
        const waypoint = this.pathWaypoints[this.pathIndex]
        if (!waypoint) {
          this.phase = 'choose'
          break
        }
        if (this.steerTo(waypoint, dt)) {
          this.pathIndex++
          if (this.pathIndex >= this.pathWaypoints.length) this.phase = 'choose'
        }
        break
      }
      case 'goSleep':
        if (!shouldStayAsleep(this.vigor, scheduledActivity, this.sleepReason)) {
          this.sleepReason = null
          this.phase = 'choose'
        } else if (this.steerTo(this.home, dt)) this.phase = 'sleep'
        break
      case 'goTo': {
        const action = this.pendingAction
        if (!action) {
          failActionLifecycle(this.actionLifecycle)
          this.leaveActiveQueue()
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
        if (this.steerTo(steerTarget, dt)) {
          // Skirt waypoint reached — keep going toward the real destination.
          if (steerTarget !== this.tmp && this.tmp.distanceTo(steerTarget) > ARRIVE) {
            break
          }
          if (action.queueId) {
            const queue = this.queues.get(action.queueId)
            if (queue?.isMember(this.id)) {
              if (queue.canEnterServing(this.id)) {
                queue.claimServing(this.id)
              } else if (!queue.isServing(this.id)) {
                // Waiting slot reached — hold until promoted to serving.
                break
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
        if (this.steerTo(this.target, dt)) this.phase = 'choose'
        break
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
   *  See `docs/plans/2026-08-12--075--time-skip-npc-catchup.md`. */
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
      const stepDt = (step * dayLengthSec) / 24
      tickNeeds(this.needs, stepDt)
      const vigorStep = tickVigorForSimulatedStep(this.vigor, activity, stepDt, napping)
      napping = vigorStep.napping
      if (activity === 'sleep' || vigorStep.slept) {
        restoreStamina(this.stamina, this.restRate * stepDt)
      } else {
        if (activity === 'work') drainStamina(this.stamina, this.fatigueRate * stepDt)
        else restoreStamina(this.stamina, this.restRate * stepDt)
        // Not asleep this step — resolve whichever need would have sent the
        // NPC off to drink/eat/gather, same amounts `beginNeed` applies.
        const need = pickNeed(this.needs, { skipWood: this.role === 'trader' })
        if (need === 'water') this.needs.thirst = Math.max(0, this.needs.thirst - WATER_SATISFY_AMOUNT)
        else if (need === 'food') this.needs.hunger = Math.max(0, this.needs.hunger - FOOD_SATISFY_AMOUNT)
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
    if (!action.queueId) {
      this.leaveActiveQueue()
    } else if (action.queueId !== this.activeQueueId) {
      // Drop a different prior queue only — membership for `action.queueId`
      // was already joined by the caller.
      if (this.activeQueueId) this.leaveActiveQueue()
      this.activeQueueId = action.queueId
    }
    this.pendingAction = action
    replaceActionLifecycle(this.actionLifecycle)
    this.phase = 'goTo'
  }

  private leaveActiveQueue(): void {
    if (!this.activeQueueId) return
    this.queues.get(this.activeQueueId)?.leave(this.id)
    this.activeQueueId = null
  }

  /** Snapshot for the shared decision seam — not a policy framework. */
  private buildDecisionContext(
    scheduleActivity: ScheduleActivity,
    nearbyNpcCount: number,
  ): DecisionContext {
    return {
      needs: {
        thirst: this.needs.thirst,
        woodDuty: this.needs.woodDuty,
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
    const dist = Math.hypot(
      this.mesh.position.x - this.home.x,
      this.mesh.position.z - this.home.z,
    )
    this.phase = preferHomeSleep(dist) ? 'goSleep' : 'sleep'
  }

  /** `need` is `'water' | 'food' | 'wood'` in practice — `'choose'` routes
   *  `'idle'` to `beginIdle` instead and already set `this.activeNeed`. */
  private beginNeed(need: NeedId): void {
    if (need === 'water') {
      const drinkAtHome = Math.random() < HOME_WATER_CHANCE
      if (drinkAtHome) {
        this.startAction({
          kind: 'drink',
          destination: copyVec3(this.home),
          durationSec: 1.2 * this.waitMultiplier,
          onComplete: () => {
            this.needs.thirst = Math.max(0, this.needs.thirst - WATER_SATISFY_AMOUNT)
          },
        })
        return
      }
      const queue = this.wellQueueId ? this.queues.get(this.wellQueueId) : undefined
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
        destination: copyVec3(this.landmarks.well),
        durationSec: 1.2 * this.waitMultiplier,
        onComplete: () => {
          this.needs.thirst = Math.max(0, this.needs.thirst - WATER_SATISFY_AMOUNT)
        },
      })
      return
    }
    if (need === 'food') {
      this.startAction({
        kind: 'eat',
        destination: copyVec3(this.landmarks.garden),
        durationSec: 1.4 * this.waitMultiplier,
        onComplete: () => { this.needs.hunger = Math.max(0, this.needs.hunger - FOOD_SATISFY_AMOUNT) },
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

      this.startAction({
        kind: 'chop',
        destination: copyVec3(landmark.position),
        durationSec: 1.6 * this.waitMultiplier,
        onComplete: () => {
          if (!forest) return
          harvestWorldTreeFully(
            forest.lifecycle,
            landmark.id,
            forest.getWorldDays(),
            forest.sampleEnv(landmark.position.x, landmark.position.z),
            { landmark },
          )
        },
        next: {
          kind: 'deposit',
          destination: copyVec3(this.landmarks.stockpile),
          durationSec: 0.8 * this.waitMultiplier,
          onComplete: () => { this.needs.woodDuty = Math.max(0, this.needs.woodDuty - WOOD_SATISFY_AMOUNT) },
        },
      })
      return
    }
    // 'wood' need but this settlement has no trees yet — same unscheduled
    // idle fallback as a moment with no workplace (not 'work').
    this.beginUnscheduledIdle()
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
      this.startAction({
        kind: 'work',
        destination: copyVec3(this.workplace.position),
        durationSec: randRange(WORK_DURATION_RANGE) * this.waitMultiplier,
        onComplete: () => {},
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
      this.phase = 'goSleep'
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
      return
    }
    this.wanderNear(this.home)
  }

  private wanderNear(anchor: THREE.Vector3): void {
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = anchor.x + (Math.random() - 0.5) * IDLE_WANDER_SPREAD
      const z = anchor.z + (Math.random() - 0.5) * IDLE_WANDER_SPREAD
      if (this.isWalkable(x, z)) {
        this.target.set(x, 0, z)
        this.phase = 'wander'
        return
      }
    }
    this.target.copy(anchor)
    this.phase = 'wander'
  }

  private playReactionSound(): void {
    const pool = NPC_REACTION_SOUND_URLS[this.gender]
    const url = pool[Math.floor(Math.random() * pool.length)]
    if (url) this.playAt(url, this.mesh.position, REACTION_SOUND_VOLUME)
  }

  private isWalkable(x: number, z: number): boolean {
    if (this.sampleHeight(x, z) <= this.waterLevel + WATER_MARGIN) return false
    const well = this.landmarks.well
    const distWell = Math.hypot(x - well.x, z - well.z)
    if (distWell < WELL_COLLISION_RADIUS) {
      const dest = this.pendingAction?.destination
      const destNearWell =
        !!dest
        && Math.hypot(dest.x - well.x, dest.z - well.z) <= WELL_APPROACH_ALLOW
      // Final approach to serving / workplace may clip the outer ring; never
      // the very center (keeps feet out of the water cylinder).
      if (!destNearWell) return false
      if (distWell < WELL_COLLISION_RADIUS * 0.55) return false
    }
    return true
  }

  /**
   * If the straight segment from the NPC to `dest` cuts through the well
   * collision disk, return a bypass point on the disk rim; otherwise `dest`.
   * Final approaches to near-well destinations (queued drink / guard work)
   * are left alone.
   */
  private resolveSteerTarget(dest: THREE.Vector3): THREE.Vector3 {
    const wx = this.landmarks.well.x
    const wz = this.landmarks.well.z
    const destDist = Math.hypot(dest.x - wx, dest.z - wz)
    if (destDist <= WELL_APPROACH_ALLOW) return dest

    const px = this.mesh.position.x
    const pz = this.mesh.position.z
    const abx = dest.x - px
    const abz = dest.z - pz
    const abLen2 = abx * abx + abz * abz
    if (abLen2 < 1e-8) return dest

    const apx = wx - px
    const apz = wz - pz
    let t = (apx * abx + apz * abz) / abLen2
    t = Math.max(0, Math.min(1, t))
    const cx = px + abx * t
    const cz = pz + abz * t
    const dx = cx - wx
    const dz = cz - wz
    const d = Math.hypot(dx, dz)
    if (d >= WELL_COLLISION_RADIUS) return dest

    const rim = WELL_COLLISION_RADIUS * 1.2
    if (d > 1e-4) {
      this.tmpAvoid.set(wx + (dx / d) * rim, dest.y, wz + (dz / d) * rim)
    } else {
      const len = Math.sqrt(abLen2)
      this.tmpAvoid.set(wx + (-abz / len) * rim, dest.y, wz + (abx / len) * rim)
    }
    return this.tmpAvoid
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
    const stepX = this.tmp.x * speed * dt
    const stepZ = this.tmp.z * speed * dt
    this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
    this.moving = true
    const x = this.mesh.position.x
    const z = this.mesh.position.z
    if (this.isWalkable(x + stepX, z + stepZ)) {
      this.mesh.position.x += stepX
      this.mesh.position.z += stepZ
    } else if (this.isWalkable(x + stepX, z)) {
      this.mesh.position.x += stepX
    } else if (this.isWalkable(x, z + stepZ)) {
      this.mesh.position.z += stepZ
    }
    return false
  }
}
