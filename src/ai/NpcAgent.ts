import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import type { FamilyMember, FamilyMemberRef, FamilyRelation } from '../settlement/families'
import type { Place } from '../settlement/places'
import type { SettlementLandmarks } from '../settlement/props'
import {
  disposeObject3D,
  loadGltfAnimated,
  prepareProp,
} from '../assets/loadGltf'
import { applyFatigue, createHealthState, type HealthState, rest } from '../shared/HealthState'
import { gazeOpacityFactor, labelOpacityForDistance } from '../ui/labelDistance'
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
import { activityAt, nextBoundary, SCHEDULE_TEMPLATES, type ScheduleActivity, type ScheduleTemplate } from './schedule'

function randRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min)
}

const WALK_SPEED = 2.4
const ARRIVE = 0.55
const NPC_HEIGHT = 1.75
/** Minimum clearance above waterLevel an NPC will walk into or wander toward. */
const WATER_MARGIN = 0.3

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
  male: ['/sounds/male-hmm-01.m4a', '/sounds/male-hmm-02.wav'],
  female: ['/sounds/female-hmm-01.wav', '/sounds/female-hmm-02.wav'],
}

/** Short "thank you" clips played once a quest is turned in — one pool per
 *  gender, keyed by the giver's gender. Sources/licenses: public/sounds/README.md. */
export const NPC_QUEST_COMPLETE_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: ['/sounds/male-thank-you-01.mp3', '/sounds/male-thank-you-02.wav'],
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
 *  parameterized by `PlannedAction` (see below). `followPath`/`goSleep`/
 *  `sleep`/`wander`/`lookAtPlayer` stay distinct — they aren't "go somewhere
 *  and perform one resource action", so folding them in would blur rather
 *  than simplify. */
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

/** A single "walk there, do this" step, optionally chained into a `next`
 *  one (wood: chop at the tree, then walk to the stockpile to deposit) —
 *  the generic replacement for the old dedicated go-somewhere / do-something
 *  phases. `destination` is a live reference into `landmarks`/`home`/
 *  `workplace` (never reassigned after settlement build), not a copy. */
type PlannedAction = {
  action: ActionId
  destination: THREE.Vector3
  /** Seconds spent in `execute` once `destination` is reached. */
  duration: number
  /** Applied once, when `execute`'s wait timer runs out. */
  onComplete: () => void
  next?: PlannedAction
}

/** Public, dialogue-facing summary of what an NPC is doing right now — a
 *  narrower, stable view over the private `phase`/`pendingAction` FSM state
 *  (`getCurrentActivity()` below), so callers outside this class never see
 *  `Phase`/`PlannedAction` themselves (`docs/plans/2026-08-09--048...`). */
export type CurrentActivityKind = 'idle' | 'need' | 'sleep' | 'talking' | 'wander' | 'work'

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

/** Phases that drain `health.currentHp` (fatigue) vs. ones that regenerate it. */
const FATIGUE_PHASES: ReadonlySet<Phase> = new Set(['execute', 'goTo'])
const REST_PHASES: ReadonlySet<Phase> = new Set(['followPath', 'goSleep', 'lookAtPlayer', 'sleep', 'wander'])

/** Chance per `choose` cycle — when no active need routes the NPC anywhere
 *  specific and it would otherwise wander a few units from home — that it
 *  instead walks its settlement's dock path (`landmarks.dockRoute`, set by
 *  `createSettlement.ts` only for settlements near enough to water to have
 *  resolved one — see `settlement/roadNetwork.ts`). */
const FOLLOW_DOCK_PATH_CHANCE = 0.08

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
/** currentHp never drops below this — no NPC death/despawn in v1. */
const HP_FLOOR = 15
const BASE_FATIGUE_RATE = 3 // hp/sec while in a FATIGUE_PHASES phase
const BASE_REST_RATE = 6 // hp/sec while in a REST_PHASES phase
const ENERGETIC_FATIGUE_MULT = 0.6
const ENERGETIC_REST_MULT = 1.5

/** Below this currentHp/maxHp fraction, walk speed starts dropping toward the floor. */
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
  readonly gender: NpcGender
  readonly role: Role
  readonly traits: readonly Trait[]
  readonly personality: CharacterDef['personality']
  readonly relation: FamilyRelation
  readonly health: HealthState
  /** `null` only when the role's landmark doesn't exist for this settlement
   *  (e.g. a `woodcutter` with no trees yet) — see `places.ts`'s
   *  `workplaceFor`. Consumed by `beginIdle()`'s `work` scheduled activity. */
  readonly workplace: Place | null
  /** One uniform template per role (`schedule.ts`) — not yet personalized by
   *  traits (v2 stage 2 decision: role-level schedule first, traits as a
   *  later overlay). Drives `choose`'s sleep gate and `beginIdle`'s `work`
   *  routing via `getScheduledActivity`. */
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
  private pendingAction: PlannedAction | null = null
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
  private readonly labelEl: HTMLDivElement
  /** Set externally (e.g. by a QuestManager) — NpcAgent stays quest-agnostic. */
  private questMarker: string | null = null
  private highlighted = false
  private readonly playSound: (url: string, volume?: number) => void
  /** Last text/opacity actually written to `labelEl` — `textContent`/`style.opacity`
   *  writes invalidate CSS2D label layout, so skip them when nothing changed. */
  private lastLabelText = ''
  private lastLabelOpacity = -1

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
    playSound: (url: string, volume?: number) => void,
  ) {
    this.playSound = playSound
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
    this.workplace = workplace
    this.schedule = SCHEDULE_TEMPLATES[character.role]
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
    this.labelEl.textContent = this.displayName
    this.lastLabelText = this.displayName
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
    playSound: (url: string, volume?: number) => void = () => {},
    modelUrl = modelUrlFor(member.character.gender, treeIndex),
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
        playSound,
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
        playSound,
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
    playSound: (url: string, volume?: number) => void,
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
      playSound,
    )
  }

  getActiveNeed(): NeedId {
    return this.activeNeed
  }

  /** What this NPC's `schedule` says it should be doing at `timeOfDay`
   *  (`dayNight.ts` convention, 0-1) — also called internally by `update()`
   *  each frame to drive the sleep gate and `beginIdle`'s `work` routing. */
  getScheduledActivity(timeOfDay: number): ScheduleActivity {
    return activityAt(this.schedule, timeOfDay)
  }

  getDialogueLine(): string {
    return pickDialogueLine(this.dialogueArchetype, this.activeNeed, this.isBusyPhase())
  }

  /** Dialogue-facing summary of what this NPC is doing right now — maps the
   *  private `phase`/`pendingAction` FSM state onto `CurrentActivity`, adding
   *  `nextBoundary(schedule, timeOfDay)` as `endHour` where it's meaningful
   *  ("...do HH:MM" — `sleep`/`work`, not `need`/`wander`). */
  getCurrentActivity(timeOfDay: number): CurrentActivity {
    const endHour = nextBoundary(this.schedule, timeOfDay)?.hour
    switch (this.phase) {
      case 'choose':
        return { kind: 'idle' }
      case 'execute':
      case 'goTo':
        if (this.pendingAction?.action === 'work') return { kind: 'work', endHour }
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

  /** `observerYaw` — player look direction (radians, same convention as
   *  `MouseLook`'s `state.yaw`), used only to dim this NPC's label when the
   *  player isn't facing toward it (see the gaze-cone opacity factor below).
   *  `timeOfDay` — `dayNight.ts`'s clock (0-1, 0=midnight), forwarded
   *  through `SettlementsManager`/`Settlement.update` — drives `schedule`
   *  via `getScheduledActivity` (sleep gate, `work` routing in
   *  `beginIdle`). `night_owl` NPCs ignore the sleep gate and keep their
   *  normal routine regardless of schedule.
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
      applyFatigue(this.health, this.fatigueRate * dt, HP_FLOOR)
    } else if (REST_PHASES.has(this.phase)) {
      rest(this.health, this.restRate * dt)
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
        const shouldSleep = scheduledActivity === 'sleep' && !this.traits.includes('night_owl')
        if (shouldSleep) {
          this.phase = 'goSleep'
          break
        }
        const need = pickNeed(this.needs)
        this.activeNeed = need
        if (need === 'idle') this.beginIdle(scheduledActivity)
        else this.beginNeed(need)
        break
      }
      case 'execute': {
        this.wait -= dt
        if (this.wait <= 0) {
          const action = this.pendingAction
          this.pendingAction = null
          action?.onComplete()
          if (action?.next) {
            this.pendingAction = action.next
            this.phase = 'goTo'
          } else {
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
        if (scheduledActivity !== 'sleep') this.phase = 'choose'
        else if (this.steerTo(this.home, dt)) this.phase = 'sleep'
        break
      case 'goTo': {
        const action = this.pendingAction
        if (!action) {
          this.phase = 'choose'
          break
        }
        if (this.steerTo(action.destination, dt)) {
          this.phase = 'execute'
          this.wait = action.duration
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
        if (scheduledActivity !== 'sleep') this.phase = 'choose'
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
      this.labelEl.textContent = labelText
    }
    const gaze = gazeOpacityFactor(
      this.mesh.position.x - observerPos.x,
      this.mesh.position.z - observerPos.z,
      observerYaw,
    )
    const opacity = labelOpacityForDistance(this.mesh.position.distanceTo(observerPos)) * gaze
    if (opacity !== this.lastLabelOpacity) {
      this.lastLabelOpacity = opacity
      this.labelEl.style.opacity = String(opacity)
    }
    this.mixer.update(dt)
  }

  dispose(): void {
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
    if (this.moving && this.walkAction) {
      this.crossfade(this.walkAction)
    } else if (this.isBusyPhase() && this.interactAction) {
      this.crossfade(this.interactAction)
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
   *  old `this.phase = 'goWell'` etc. one-liners. */
  private startAction(action: PlannedAction): void {
    this.pendingAction = action
    this.phase = 'goTo'
  }

  /** `need` is `'water' | 'food' | 'wood'` in practice — `'choose'` routes
   *  `'idle'` to `beginIdle` instead and already set `this.activeNeed`. */
  private beginNeed(need: NeedId): void {
    if (need === 'water') {
      const destination = Math.random() < HOME_WATER_CHANCE ? this.home : this.landmarks.well
      this.startAction({
        action: 'drink',
        destination,
        duration: 1.2 * this.waitMultiplier,
        onComplete: () => { this.needs.thirst = Math.max(0, this.needs.thirst - 0.65) },
      })
      return
    }
    if (need === 'food') {
      this.startAction({
        action: 'eat',
        destination: this.landmarks.garden,
        duration: 1.4 * this.waitMultiplier,
        onComplete: () => { this.needs.hunger = Math.max(0, this.needs.hunger - 0.6) },
      })
      return
    }
    if (need === 'wood' && this.landmarks.trees.length > 0) {
      const tree = this.landmarks.trees[this.treeIndex]!
      this.treeIndex = (this.treeIndex + 1) % this.landmarks.trees.length
      this.startAction({
        action: 'chop',
        destination: tree,
        duration: 1.6 * this.waitMultiplier,
        onComplete: () => {},
        next: {
          action: 'deposit',
          destination: this.landmarks.stockpile,
          duration: 0.8 * this.waitMultiplier,
          onComplete: () => { this.needs.woodDuty = Math.max(0, this.needs.woodDuty - 0.55) },
        },
      })
      return
    }
    // 'wood' need but this settlement has no trees yet — same idle fallback
    // as an unscheduled moment (not 'work': no point routing to a workplace
    // just because the wood need happened to fire).
    this.beginIdle('wake')
  }

  /** No active need (`pickNeed` returned `'idle'`) — either walk to the
   *  workplace and perform a generic `work` action (when `schedule` says
   *  `work` right now and a `workplace` exists), or fall back to the
   *  pre-schedule idle behavior (occasional dock walk, otherwise wander
   *  near home). */
  private beginIdle(scheduledActivity: ScheduleActivity): void {
    if (scheduledActivity === 'work' && this.workplace) {
      this.startAction({
        action: 'work',
        destination: this.workplace.position,
        duration: randRange(WORK_DURATION_RANGE) * this.waitMultiplier,
        onComplete: () => {},
      })
      return
    }
    if (this.landmarks.dockRoute.length > 1 && Math.random() < FOLLOW_DOCK_PATH_CHANCE) {
      this.pathWaypoints = this.landmarks.dockRoute
      this.pathIndex = 0
      this.phase = 'followPath'
      return
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = this.home.x + (Math.random() - 0.5) * 4
      const z = this.home.z + (Math.random() - 0.5) * 4
      if (this.isWalkable(x, z)) {
        this.target.set(x, 0, z)
        this.phase = 'wander'
        return
      }
    }
    this.target.copy(this.home)
    this.phase = 'wander'
  }

  private playReactionSound(): void {
    const pool = NPC_REACTION_SOUND_URLS[this.gender]
    const url = pool[Math.floor(Math.random() * pool.length)]
    if (url) this.playSound(url, REACTION_SOUND_VOLUME)
  }

  private isWalkable(x: number, z: number): boolean {
    return this.sampleHeight(x, z) > this.waterLevel + WATER_MARGIN
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
