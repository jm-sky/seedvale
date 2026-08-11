import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
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
import { labelOpacityForDistance } from '../ui/labelDistance'
import {
  type AnimalLifeState,
  BIAS_STRENGTH,
  createAnimalLifeState,
  NEED_ELEVATED_THRESHOLD,
  relieveElevatedNeeds,
  STAMINA_REST_THRESHOLD,
  tickAnimalLife,
} from './AnimalLife'
import { createHealthState, damageFor, damageVsHuman, MAX_HP } from './faunaCombat'
import { isPlayerNoticed } from './playerAwareness'
import {
  decidePredatorHumanIntent,
  type PredatorHumanIntent,
  PROVOCATION_SECONDS,
} from './predatorHumanDecision'

/** Minimum clearance above waterLevel an animal will walk into or wander toward. */
const WATER_MARGIN = 0.3
/** Distance at which a predator can bite the prey it's chasing. */
const CONTACT_RANGE = 0.8
/** Minimum seconds between bites from the same predator, so contact doesn't
 *  melt prey HP in a single frame. */
const ATTACK_COOLDOWN = 0.6
/** Seconds a corpse stays in the scene (frozen pose) before it's disposed. */
const CORPSE_LINGER_SECONDS = 60
/** Busy-channel duration for shovel-burying a corpse. */
export const BURY_DURATION_SEC = 1.5
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
/** Radius (world units) within which a *lit* campfire (village or
 *  player-placed, see `app/createApp.ts`'s `litFires`) repels any animal,
 *  predator or prey alike — pure distance, no facing cone (you don't need to
 *  be looking at a fire to smell/hear it). */
const FIRE_AVOID_RADIUS = 11
/** Distance the flee-target point is placed beyond the animal, along the
 *  away-from-threat direction — shared by fleeing a predator, the player, or
 *  a campfire (`fleeFrom()`). */
const FLEE_DISTANCE = 8
/** Radius (world units) around a village center that's off-limits to `wild`
 *  animals for both wandering and predator hunting — plan 044 §2.3/§2.4:
 *  wild animals avoid settled ground, predators don't treat the village as
 *  hunting grounds. No hard wall — just excluded from candidate wander
 *  targets and from `updatePredator`'s prey search. */
const VILLAGE_AVOID_RADIUS = 20
/** Radius (world units) over which the flee-direction village bias (`fleeFrom`)
 *  ramps in — beyond this, fleeing wild/domestic animals behave the same
 *  (the village is too far away to matter to which way they run). */
const VILLAGE_FLEE_INFLUENCE_RADIUS = 45
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

type FaunaActionKind = 'attack' | 'chase' | 'flee' | 'wander'

type EnvironmentSense = {
  playerActive: boolean
  playerDistance: number
  fireNearby: boolean
  nearestFire: { x: number, z: number } | null
}

export type AnimalRole = 'predator' | 'prey' | 'livestock'
/** `wild` animals are wary of humans/the village and avoid it; `domestic`
 *  animals aren't afraid of people and treat the village/farmstead as safe
 *  ground to flee toward (plan 044 §2.3/§2.4). */
export type AnimalSociability = 'wild' | 'domestic'
/** wolf/fox/deer/stag match the Quaternius Ultimate Animated Animal Pack GLBs
 *  (`public/models/fauna/`); the rest (plan 044) have no GLB and always use
 *  the procedural visuals in `proceduralAnimals.ts` instead. */
export type AnimalKind =
  | 'wolf'
  | 'fox'
  | 'deer'
  | 'stag'
  | 'rabbit'
  | 'duck'
  | 'boar'
  | 'horse'
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
  /** Hard radius (m) within which the animal notices the player regardless
   *  of facing direction — startled at close range. */
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

export class AnimalAgent {
  /** Visual root (GLB group or capsule mesh). */
  readonly mesh: THREE.Object3D
  readonly def: AnimalDef
  private readonly sampleHeight: HeightSampler
  private readonly waterLevel: number
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
  private lastHpRatio = -1
  private lastStaminaRatio = -1
  private lastSatietyRatio = -1
  private lastHydrationRatio = -1
  readonly health: HealthState
  readonly life: AnimalLifeState
  private attackCooldown = 0
  private timeSinceDeath = 0
  private isNight = false
  private highlighted = false
  /** Counts down from `ALERT_HOLD_SEC` after last noticing the player —
   *  hysteresis for `checkEnvironmentalDanger()`, see its comment. */
  private alertTimer = 0
  /** This frame's loaded-settlement centers, refreshed at the top of every
   *  `update()` call — read by `fleeFrom`/`wander`/`updatePredator` without
   *  threading it through every method signature (plan 044 §2.3/§2.4). */
  private currentVillages: readonly { x: number, z: number }[] = []
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

  constructor(
    def: AnimalDef,
    sampleHeight: HeightSampler,
    waterLevel: number,
    x: number,
    z: number,
    visual?: THREE.Object3D,
    animations: THREE.AnimationClip[] = [],
    wanderRadius: readonly [number, number] = DEFAULT_WANDER_RADIUS,
  ) {
    this.def = def
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
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
    this.mesh.userData.animalKind = def.kind
    this.mesh.userData.animalRole = def.role

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
    const labelHeight = this.isCapsule
      ? 0.45 * def.scale + 0.3
      : def.modelHeight + 0.3
    this.label.position.set(0, labelHeight, 0)
    this.mesh.add(this.label)

    this.snapY()
    this.pickWanderTarget()
  }

  dispose(): void {
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer?.stopAllAction()
  }

  isDead(): boolean {
    return this.health.dead
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
    return this.health.dead && this.timeSinceDeath >= CORPSE_LINGER_SECONDS
  }

  /** Player shovel-bury: mark corpse for disposal on the next fauna/settlement tick. */
  bury(): void {
    if (!this.health.dead) return
    this.timeSinceDeath = CORPSE_LINGER_SECONDS
  }

  takeDamage(damage: number, source?: 'player'): void {
    if (this.health.dead) return
    damageHealth(this.health, damage)
    if (source === 'player') {
      this.provokedTimer = PROVOCATION_SECONDS
      // Force an immediate re-score so healthy wolves can retaliate this frame.
      this.humanDecisionTimer = 0
    }
    if (this.health.dead) this.collapse()
  }

  /** Tip the corpse onto its side (relative to its facing direction) instead
   *  of leaving it frozen standing up. */
  private collapse(): void {
    this.mixer?.stopAllAction()
    const side = Math.random() < 0.5 ? 1 : -1
    this.mesh.rotation.z = side * (Math.PI / 2)
    this.mesh.position.y += this.isCapsule ? 0.2 * this.def.scale : this.def.modelHeight * 0.3
    this.lastHpRatio = 0
    this.hpFillEl.style.width = '0%'
    this.labelBarsEl.style.display = 'none'
  }

  update(
    dt: number,
    others: AnimalAgent[],
    observerPos: THREE.Vector3,
    dayFactor: number,
    forestFactor: number,
    litFires: readonly { x: number, z: number }[],
    villages: readonly { x: number, z: number }[] = [],
    nearbyHumanCount = 1,
    /** Optional fauna→human damage seam (plan 056). Absent → chase only. */
    onHumanHit?: (damage: number) => void,
  ): void {
    if (this.health.dead) {
      this.timeSinceDeath += dt
      return
    }
    if (this.attackCooldown > 0) this.attackCooldown -= dt
    if (this.alertTimer > 0) this.alertTimer -= dt
    if (this.provokedTimer > 0) this.provokedTimer -= dt
    this.isNight = dayFactor <= 0
    this.moving = false
    this.sprinting = false
    this.currentVillages = villages
    const sense = this.senseEnvironment(observerPos, dayFactor, forestFactor, litFires)

    if (sense.playerActive) {
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
        if (this.cachedHumanIntent === 'attack') {
          this.setIntent('attack', copyVec3(observerPos))
          this.chaseHuman(observerPos, dt, onHumanHit)
        } else {
          this.setIntent('flee', copyVec3(observerPos))
          this.fleeFrom(observerPos.x, observerPos.z, dt)
        }
      } else {
        this.setIntent('flee', copyVec3(observerPos))
        this.fleeFrom(observerPos.x, observerPos.z, dt)
      }
    } else if (sense.nearestFire) {
      this.humanDecisionTimer = 0
      this.provokedTimer = 0
      this.setIntent('flee', { x: sense.nearestFire.x, z: sense.nearestFire.z })
      this.fleeFrom(sense.nearestFire.x, sense.nearestFire.z, dt)
    } else if (this.def.role === 'predator') {
      this.humanDecisionTimer = 0
      this.provokedTimer = 0
      this.updatePredator(dt, others)
    } else {
      this.humanDecisionTimer = 0
      this.provokedTimer = 0
      this.updatePrey(dt, others)
    }
    this.clampBounds()
    this.snapY()
    this.updateAnim()
    tickAnimalLife(this.life, dt, this.sprinting)
    const hpRatio = this.health.maxHp > 0 ? this.health.currentHp / this.health.maxHp : 0
    if (hpRatio !== this.lastHpRatio) {
      this.lastHpRatio = hpRatio
      this.hpFillEl.style.width = `${Math.round(hpRatio * 100)}%`
    }
    const staminaRatio = this.life.stamina.max > 0
      ? this.life.stamina.current / this.life.stamina.max
      : 0
    if (staminaRatio !== this.lastStaminaRatio) {
      this.lastStaminaRatio = staminaRatio
      this.staminaFillEl.style.width = `${Math.round(staminaRatio * 100)}%`
    }
    const satietyRatio = 1 - this.life.hunger
    if (satietyRatio !== this.lastSatietyRatio) {
      this.lastSatietyRatio = satietyRatio
      this.satietyFillEl.style.width = `${Math.round(satietyRatio * 100)}%`
    }
    const hydrationRatio = 1 - this.life.thirst
    if (hydrationRatio !== this.lastHydrationRatio) {
      this.lastHydrationRatio = hydrationRatio
      this.hydrationFillEl.style.width = `${Math.round(hydrationRatio * 100)}%`
    }
    const opacity = labelOpacityForDistance(this.mesh.position.distanceTo(observerPos))
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
      provoked: this.provokedTimer > 0,
      aggressionRoll,
    })
  }

  /** Sprint toward a human; bite via `onHumanHit` when in contact (plan 056). */
  private chaseHuman(
    observerPos: THREE.Vector3,
    dt: number,
    onHumanHit?: (damage: number) => void,
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

  private attackHuman(onHumanHit: (damage: number) => void): void {
    if (this.attackCooldown > 0) return
    if (isExhausted(this.life.stamina)) return
    this.attackCooldown = ATTACK_COOLDOWN
    drainStamina(this.life.stamina, ATTACK_STAMINA_COST)
    onHumanHit(damageVsHuman(this.def.kind))
  }

  /**
   * Player-notice + campfire sensing — checked ahead of predator/prey
   * dynamics. Returns structured perception for decision scoring; movement
   * is chosen by `update()` (plan 055: perception ≠ action).
   */
  private senseEnvironment(
    observerPos: THREE.Vector3,
    dayFactor: number,
    forestFactor: number,
    litFires: readonly { x: number, z: number }[],
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
    const noticed = isPlayerNoticed({
      distance,
      facingDot,
      panicRange: this.def.playerPanicRange,
      noticeRange: this.def.playerNoticeRange,
      dayFactor,
      forestFactor,
      minFacingDot: PLAYER_NOTICE_CONE_DOT,
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
  private nearestVillage(): { x: number, z: number } | null {
    let best: { x: number, z: number } | null = null
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
      const falloff = Math.max(0, 1 - vDist / VILLAGE_FLEE_INFLUENCE_RADIUS)
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

  /** True if `pos` is within `VILLAGE_AVOID_RADIUS` of any loaded settlement —
   *  used to make wild predators give up a chase that runs into the village
   *  (plan 044 §2.4's "lis niechętnie wchodzi do bezpiecznego obszaru i może
   *  przerwać pościg") and to keep wild wander targets off settled ground. */
  private isNearVillage(pos: { x: number, z: number }): boolean {
    for (const v of this.currentVillages) {
      if (Math.hypot(pos.x - v.x, pos.z - v.z) < VILLAGE_AVOID_RADIUS) return true
    }
    return false
  }

  private updatePredator(dt: number, others: AnimalAgent[]): void {
    const prey = this.nearest(others, 'prey', this.def.detectRange)
    if (prey && this.isNearVillage(prey.mesh.position)) {
      this.setIntent('wander')
      this.wander(dt)
      return
    }
    if (prey) {
      if (isExhausted(this.life.stamina)) {
        this.setIntent('wander')
        this.wander(dt)
        return
      }
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
      this.setIntent('flee', copyVec3(threat.mesh.position))
      this.fleeFrom(threat.mesh.position.x, threat.mesh.position.z, dt)
      return
    }
    this.setIntent('wander')
    this.wander(dt)
  }

  private wander(dt: number): void {
    this.wanderTimer -= dt
    const timerExpired = this.wanderTimer <= 0
    if (timerExpired || this.arrived(this.target, 1.2)) {
      relieveElevatedNeeds(this.life)
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
    const [minR, maxR] = this.wanderRadius
    const bias = this.needWanderBias()
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = (minR + Math.random() * (maxR - minR)) * bias
      const a = Math.random() * Math.PI * 2
      const x = this.home.x + Math.cos(a) * r
      const z = this.home.z + Math.sin(a) * r
      if (this.isWalkable(x, z) && (this.def.sociability !== 'wild' || !this.isNearVillage({ x, z }))) {
        this.target.set(x, 0, z)
        this.wanderTimer = (3 + Math.random() * 4) / bias
        return
      }
    }
    this.target.copy(this.home)
    this.wanderTimer = (3 + Math.random() * 4) / bias
  }

  private isWalkable(x: number, z: number): boolean {
    return this.sampleHeight(x, z) > this.waterLevel + WATER_MARGIN
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

    const stepX = this.tmp.x * speed * dt
    const stepZ = this.tmp.z * speed * dt
    const x = this.mesh.position.x
    const z = this.mesh.position.z
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
      const clip = clips.find((c) => c.name === name)
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
