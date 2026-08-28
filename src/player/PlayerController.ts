import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { PlayAt } from '../audio/createWorldAudio'
import type { KeyState } from '../input/Keyboard'
import type { ToolKind } from '../items/HeldTool'
import type { FootstepSurface } from '../terrain/footstepSurface'
import { disposeObject3D, loadGltfAnimated, prepareProp } from '../assets/loadGltf'
import {
  playFootstep,
  playJumpLand,
  playJumpTakeoff,
  playWaterLap,
} from '../audio/playerMoveSounds'
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_DISTANCE_MIN,
  type LookState,
} from '../input/MouseLook'
import {
  createHeldToolObject,
  findRightHandSocket,
  mountHeldToolOnSocket,
} from '../items/heldToolVisual'
import { createHealthState, type HealthState } from '../shared/HealthState'
import { isExhausted } from '../shared/StaminaState'
import { applySlopeMovementConstraint } from '../terrain/slopeConstraint'
import { applyBarPercent, computeBarPercent, createAgentLabel, createLabelBar } from '../ui/agentStatusLabel'
import { type Collider, resolvePosition } from '../world/collision'
import { resolveCameraBoom } from './cameraBoom'
import { computeEncumbrance } from './playerEncumbrance'
import { createPlayerNeeds, type PlayerNeeds, tickPlayerMovementVigor, tickPlayerStamina } from './PlayerNeeds'
import { accumulateSneakUse, applySneakSpeedModifier, createPlayerSkills, type PlayerSkills } from './PlayerSkills'
import { integrateVerticalMotion } from './verticalMotion'

/** Stationary/moving/sprinting classification of the player's current
 *  movement, derived from the same `moving`/`sprinting` flags `update()`
 *  already tracks each frame — no new state. Consumed by fauna detection
 *  (plan 124 §4, `fauna/playerAwareness.ts`) to scale Sneak's benefit. */
export type PlayerMovementState = 'stationary' | 'moving' | 'sprinting'

const MOVE_SPEED = 8
/** Matches the capsule fallback's `CapsuleGeometry` radius (plan 097 §2.2) —
 *  the GLB model has no measured collision shape, so this stands in for both. */
const PLAYER_COLLISION_RADIUS = 0.35
const SPRINT_MULTIPLIER = 1.8
/** Airborne lean (radians) — no jump clip on the rig (plan 097 §4 pyt. 5), so
 *  this reuses the `crouch()`/`lieDown()` trick of rotating `modelRoot` only. */
const JUMP_TILT_MAX = 0.25
const JUMP_TILT_FACTOR = 0.05
/** Look-at height eases from chest-level (far/default zoom) up toward eye-level as the camera zooms in. */
const LOOK_AT_OFFSET_FAR = 0.9
const LOOK_AT_OFFSET_NEAR = 1.6
export const PLAYER_HEIGHT = 1.8
const PLAYER_LABEL = 'Ja'
const PLAYER_MAX_HP = 100
/** How far below the surface the player can sink while swimming — caps out in deep
 *  water so the head still breaks the surface instead of vanishing into the seabed. */
const MAX_SWIM_DEPTH = 1.2
/** Rotation (radians) applied to the model root to lie it flat on the ground
 *  for `lieDown()` — the Quaternius rig has no dedicated sleep/rest clip, so
 *  this tips the whole model onto its back instead, the same trick
 *  `fauna/AnimalAgent.ts`'s `collapse()` uses for corpses. */
const LIE_DOWN_ROTATION_X = -Math.PI / 2
/** Small upward nudge so the now-horizontal body doesn't clip into the
 *  ground (the model's local origin/feet stay at the wrapper's y=0). */
const LIE_DOWN_Y_OFFSET = 0.25
/** Procedural squat for camp-rest setup/teardown — no crouch clip on the
 *  Quaternius Adventurer rig, so we tip + sink the model root only (wrapper
 *  / label stay upright). */
const CROUCH_ROTATION_X = 0.45
const CROUCH_Y_OFFSET = -0.35
const FOOTSTEP_WALK_INTERVAL = 0.45
const FOOTSTEP_SPRINT_INTERVAL = 0.28

type PlayerPose = 'stand' | 'crouch' | 'lie'

/*
  Planned animations:
    Idle:
     - normal
     - tired
     - with torch
     - with melee weapon
     - with bow

    Walk:
     - normal
     - run
     - crouch
     - with torch
     - with melee weapon
     - with bow

    Combat:
      - sword slash
      - bow aim
      - bow release

    Other:
      - jump
      - fall
      - lay down
      - stand up
      - lying down
      - die
      - swim
      - eat
      - drink

  Current Adventurer animations:
  - `Death`
  - `Gun_Shoot`
  - `HitRecieve`
  - `HitRecieve_2`
  - `Idle`
  - `Idle_Gun`
  - `Idle_Gun_Pointing`
  - `Idle_Gun_Shoot`
  - `Idle_Neutral`
  - `Idle_Sword`
  - `Interact`
  - `Kick_Left`
  - `Kick_Right`
  - `Punch_Left`
  - `Punch_Right`
  - `Roll`
  - `Run`
  - `Run_Back`
  - `Run_Left`
  - `Run_Right`
  - `Run_Shoot`
  - `Sword_Slash`
  - `Walk`
  - `Wave`

  Current Hero animations:
  - `Idle`
  - `Walk`
  - `Bow.shoot`
  - `Jump`
  - `Run`
  - `Sword.slash`
*/

/** Quaternius Ultimate Modular Men — distinct from the NPC roster. */
export const PLAYER_MODEL_URL = '/models/characters/Adventurer.glb'

export type HeightSampler = (x: number, z: number) => number
/** `ChunkManager.collidersNear` (plan 097 §2.2) — kept as its own alias
 *  instead of importing `ChunkManager` here, same reasoning as `HeightSampler`. */
export type ColliderSource = (x: number, z: number) => readonly Collider[]

export class PlayerController {
  /** Wrapper group; feet sit at local y=0, world y is set in snapToGround. */
  readonly mesh: THREE.Object3D
  /** Shared survival HP — domain state only in v1 (no death UI / respawn). */
  readonly health: HealthState
  /** Stamina/vigor/hunger/thirst (plan 106) — `stamina` is ticked here
   *  (tightly coupled to sprint below); `app/gameLoop.ts` ticks the other
   *  three pools each frame via `PlayerNeeds.ts`'s helpers. */
  readonly needs: PlayerNeeds
  /** Sneak + future skills (plan 124 §1) — value/active state only, no
   *  progression yet. */
  readonly skills: PlayerSkills
  private readonly camera: THREE.PerspectiveCamera
  private readonly keys: KeyState
  private readonly look: LookState
  private sampleHeight: HeightSampler
  private sampleFloor: HeightSampler
  private waterLevel: number
  private collidersNear: ColliderSource
  private sampleFootstepSurface: (x: number, z: number) => FootstepSurface
  private readonly isCapsule: boolean
  /** The GLB scene root (or capsule mesh) — rotated independently of `mesh`
   *  (the wrapper, which also carries the label at a fixed height) for
   *  `lieDown()` / `crouch()`, so the nameplate stays floating above the
   *  character instead of tipping over with the body. */
  private readonly modelRoot: THREE.Object3D
  private pose: PlayerPose = 'stand'
  /** Plan 150 — temporary incapacitation at 0 HP; distinct from `health.dead`. */
  private downed = false
  private downedTimer = 0
  /** Feeds deterministic defense rolls (`combat/defenseResolver.ts`). */
  private defenseAttempt = 0
  /** Vertical speed (m/s), +up. Zeroed/`grounded=true` on teleport (`snapToGround`)
   *  and while underwater — jumping/falling only apply on dry land (plan 097 §2.3). */
  private verticalVelocity = 0
  private grounded = true
  /** Set by `jump()`, consumed (and cleared) on the next `updateVerticalMotion`. */
  private jumpRequested = false
  private readonly mixer: THREE.AnimationMixer | null
  private readonly idleAction: THREE.AnimationAction | null
  private readonly walkAction: THREE.AnimationAction | null
  private readonly runAction: THREE.AnimationAction | null
  private readonly attackAction: THREE.AnimationAction | null
  /** Adventurer ships no dedicated bow clip — `Idle_Gun_Pointing`/`Gun_Shoot`
   *  are the closest same-rig stand-ins for draw-hold/release (plan 162
   *  follow-up, see the plan's implementation summary). `Universal Animation
   *  Library`/Mixamo `Pro Longbow Pack` clips were checked and are not
   *  usable: different skeletons (UE mannequin / `mixamorig:*`) than
   *  Adventurer's own rig, and UAL doesn't ship bow-specific content anyway. */
  private readonly aimDrawAction: THREE.AnimationAction | null
  private readonly rangedReleaseAction: THREE.AnimationAction | null
  private currentAction: THREE.AnimationAction | null = null
  /** True while `playerMelee` is in-flight — `syncAnimation` must not
   *  overwrite `Sword_Slash` with Idle/Walk until recovery ends. */
  private meleeAttacking = false
  /** True while a bow draw is held (`playerRanged` state `draw`) —
   *  `syncAnimation` must not overwrite the aim pose with Idle/Walk. */
  private rangedDrawing = false
  private moving = false
  private sprinting = false
  /** True while riding a mount (plan fauna-003) — suspends normal WASD/
   *  gravity/collision movement in `update()`; the riding system
   *  (`app/actions/mountActions.ts`) calls `setMountedTransform()` every
   *  frame instead, copying the mount's seat transform onto this same
   *  `mesh` (never reparented, so camera/gaze/interactables/streaming all
   *  keep reading world-space `mesh.position` unmodified). */
  private mounted = false
  /** Set once per frame by `setEncumbrance()` (plan 164 §9) — `app/gameLoop.ts`
   *  is the sole caller, right before `update()`. */
  private encumbranceSpeedMultiplier = 1
  private encumbranceBlocked = false
  /** Metres travelled while sneaking since the last Sneak XP award (plan 128
   *  §1). Runtime-only and reset whenever Sneak switches off — standing still
   *  with the toggle on earns nothing. */
  private sneakUseDistance = 0
  private wasInWater = false
  private footstepAccum = 0
  private playAt: PlayAt | null = null
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()
  private readonly camOffset = new THREE.Vector3()
  private readonly label: CSS2DObject
  private readonly labelEl: HTMLDivElement
  private readonly labelNameEl: HTMLDivElement
  private readonly hpFillEl: HTMLDivElement
  private lastHpPercent = -1
  /** Quaternius `WristR` (or null on capsule fallback / missing bone). */
  private readonly rightWrist: THREE.Object3D | null
  private heldToolObject: THREE.Object3D | null = null
  private heldToolKind: ToolKind | null = null
  /** Bumps on each `setHeldTool` so stale async GLB loads are ignored. */
  private heldToolLoadToken = 0
  /** Empty group parented on the hand socket, between it and the mounted
   *  held-tool object (plan 123) — `setMeleeSwing` rotates only this, so the
   *  tool's normal `HELD_ATTACH` grip transform (set on `heldToolObject`
   *  itself) is never touched by the attack animation. */
  private heldToolSwingPivot: THREE.Object3D | null = null

  private constructor(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    isCapsule: boolean,
    camera: THREE.PerspectiveCamera,
    keys: KeyState,
    look: LookState,
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    sampleFootstepSurface: (x: number, z: number) => FootstepSurface,
  ) {
    this.camera = camera
    this.keys = keys
    this.look = look
    this.sampleHeight = sampleHeight
    this.sampleFloor = sampleFloor
    this.waterLevel = waterLevel
    this.collidersNear = collidersNear
    this.sampleFootstepSurface = sampleFootstepSurface
    this.isCapsule = isCapsule
    this.health = createHealthState(PLAYER_MAX_HP)
    this.needs = createPlayerNeeds()
    this.skills = createPlayerSkills()

    this.mesh = new THREE.Group()
    this.mesh.add(root)
    this.mesh.position.set(0, 0, 0)
    this.modelRoot = root
    this.rightWrist = isCapsule ? null : findRightHandSocket(root)
    if (!isCapsule && !this.rightWrist) {
      console.warn('[player] right-hand bone not found; held tools parent to model root (feet)')
    }

    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(root)
      this.idleAction = this.findAction(animations, ['Idle', 'Idle_Neutral'])
      this.walkAction = this.findAction(animations, ['Walk', 'Run'])
      this.runAction = this.findAction(animations, ['Run'])
      this.attackAction = this.findAction(animations, ['Sword_Slash', 'Punch_Right', 'Punch_Left'])
      this.aimDrawAction = this.findAction(animations, ['Idle_Gun_Pointing', 'Idle_Gun'])
      this.rangedReleaseAction = this.findAction(animations, ['Gun_Shoot', 'Idle_Gun_Shoot'])
      this.playAction(this.idleAction)
    } else {
      this.mixer = null
      this.idleAction = null
      this.walkAction = null
      this.runAction = null
      this.attackAction = null
      this.aimDrawAction = null
      this.rangedReleaseAction = null
    }

    const hpBar = createLabelBar('hp')
    this.hpFillEl = hpBar.fill
    const labelDom = createAgentLabel(PLAYER_LABEL, [hpBar], PLAYER_HEIGHT + 0.55)
    this.labelEl = labelDom.el
    this.labelNameEl = labelDom.nameEl
    this.label = labelDom.label
    this.mesh.add(this.label)

    this.snapToGround()
    this.syncCamera()
  }

  /** World one-shots for footsteps / jump / splash — same `playAt` as the rest of the mixer. */
  setMoveAudio(playAt: PlayAt | null): void {
    this.playAt = playAt
  }

  static async create(
    camera: THREE.PerspectiveCamera,
    keys: KeyState,
    look: LookState,
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    sampleFootstepSurface: (x: number, z: number) => FootstepSurface,
    modelUrl = PLAYER_MODEL_URL,
  ): Promise<PlayerController> {
    try {
      const { scene, animations } = await loadGltfAnimated(modelUrl)
      prepareProp(scene, PLAYER_HEIGHT)
      return new PlayerController(
        scene,
        animations,
        false,
        camera,
        keys,
        look,
        sampleHeight,
        sampleFloor,
        waterLevel,
        collidersNear,
        sampleFootstepSurface,
      )
    } catch (err) {
      console.warn(`[player] failed to load ${modelUrl}, using capsule`, err)
      return PlayerController.createCapsuleFallback(
        camera,
        keys,
        look,
        sampleHeight,
        sampleFloor,
        waterLevel,
        collidersNear,
        sampleFootstepSurface,
      )
    }
  }

  private static createCapsuleFallback(
    camera: THREE.PerspectiveCamera,
    keys: KeyState,
    look: LookState,
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    sampleFootstepSurface: (x: number, z: number) => FootstepSurface,
  ): PlayerController {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0xc45c26,
        flatShading: true,
      }),
    )
    body.position.y = 0.8
    body.castShadow = true
    return new PlayerController(
      body,
      [],
      true,
      camera,
      keys,
      look,
      sampleHeight,
      sampleFloor,
      waterLevel,
      collidersNear,
      sampleFootstepSurface,
    )
  }

  /** Call after terrain rebuild. */
  setGround(
    sampleHeight: HeightSampler,
    sampleFloor: HeightSampler,
    waterLevel: number,
    collidersNear: ColliderSource,
    sampleFootstepSurface: (x: number, z: number) => FootstepSurface,
  ): void {
    this.sampleHeight = sampleHeight
    this.sampleFloor = sampleFloor
    this.waterLevel = waterLevel
    this.collidersNear = collidersNear
    this.sampleFootstepSurface = sampleFootstepSurface
    this.snapToGround()
  }

  setName(name: string): void {
    this.labelNameEl.textContent = name.trim() || PLAYER_LABEL
  }

  /**
   * Attach / clear a held tool mesh on the right wrist (inventory still owns
   * the item; this is visual only). Capsule / missing-bone fallback parents
   * to the body root (looks wrong — prefer fixing the socket).
   */
  /** Right-hand bone (or model root fallback) for held tools / lit lights. */
  handSocket(): THREE.Object3D {
    return this.rightWrist ?? this.modelRoot
  }

  /** Currently-mounted held-tool mesh (visual only), or `null` while
   *  unarmed/still loading. */
  getHeldToolObject(): THREE.Object3D | null {
    return this.heldToolObject
  }

  setHeldTool(kind: ToolKind | null): void {
    if (kind === this.heldToolKind) return
    this.heldToolKind = kind
    const loadToken = ++this.heldToolLoadToken
    if (this.heldToolObject) {
      this.heldToolObject.removeFromParent()
      disposeObject3D(this.heldToolObject)
      this.heldToolObject = null
    }
    if (this.heldToolSwingPivot) {
      this.heldToolSwingPivot.removeFromParent()
      this.heldToolSwingPivot = null
    }
    if (!kind) return

    const parent = this.handSocket()
    const pivot = new THREE.Group()
    parent.add(pivot)
    void createHeldToolObject(kind).then((tool) => {
      if (loadToken !== this.heldToolLoadToken || this.heldToolKind !== kind) {
        disposeObject3D(tool)
        pivot.removeFromParent()
        return
      }
      this.heldToolObject = mountHeldToolOnSocket(tool, pivot, kind, {
        characterRoot: this.modelRoot,
        characterHeight: PLAYER_HEIGHT,
      })
      this.heldToolSwingPivot = pivot
    })
  }

  /** Additive rotation (radians) on the held-tool socket during a melee
   *  attack (plan 123) — layered via `heldToolSwingPivot` so it composes
   *  cleanly on top of the tool's own grip transform regardless of whether
   *  that transform came from `HELD_ATTACH` or the anchor-pair solver.
   *  `null` resets to the tool's normal held pose. No-op before the held
   *  tool's async GLB load resolves (pivot not yet created). */
  setMeleeSwing(rotation: { x: number, y: number, z: number } | null): void {
    if (!this.heldToolSwingPivot) return
    if (!rotation) {
      this.heldToolSwingPivot.rotation.set(0, 0, 0)
      return
    }
    this.heldToolSwingPivot.rotation.set(rotation.x, rotation.y, rotation.z)
  }

  /** True when Adventurer's `Sword_Slash` (or punch fallback) is available —
   *  callers skip the procedural tool-pivot swing so it doesn't double the
   *  arm motion already in the clip. Capsule fallback has no clip. */
  hasMeleeAttackClip(): boolean {
    return this.attackAction !== null
  }

  /** Plays the attack clip once, time-scaled to `durationSec` so the slash
   *  lands with `playerMelee`'s hit window (damage resolves at wind-up end /
   *  ~1/3 of the total attack). No-op on the capsule fallback. */
  beginMeleeAttack(durationSec: number): void {
    this.meleeAttacking = true
    if (!this.attackAction) return
    const clipDuration = this.attackAction.getClip().duration
    const timeScale = durationSec > 1e-4 ? clipDuration / durationSec : 1
    this.currentAction?.fadeOut(0.08)
    this.attackAction.reset()
    this.attackAction.setLoop(THREE.LoopOnce, 1)
    this.attackAction.clampWhenFinished = true
    this.attackAction.setEffectiveTimeScale(timeScale)
    this.attackAction.setEffectiveWeight(1)
    this.attackAction.fadeIn(0.08).play()
    this.currentAction = this.attackAction
  }

  /** Lets `syncAnimation` return to idle/walk after recovery (or a modal
   *  cancel). Safe to call when idle. */
  endMeleeAttack(): void {
    this.meleeAttacking = false
  }

  /** True when a same-rig aim/draw stand-in clip is available — no dedicated
   *  bow animation ships with Adventurer or any checked-compatible pack
   *  (see the `aimDrawAction` field doc). Capsule fallback has no clip. */
  hasRangedDrawClip(): boolean {
    return this.aimDrawAction !== null
  }

  /** Starts/holds the aim-draw pose loop — call every frame while
   *  `playerRanged.state() === 'draw'`. No-op once already playing, and a
   *  no-op entirely if no stand-in clip was found. */
  beginRangedDraw(): void {
    this.rangedDrawing = true
    if (!this.aimDrawAction || this.currentAction === this.aimDrawAction) return
    this.currentAction?.fadeOut(0.15)
    this.aimDrawAction.reset()
    this.aimDrawAction.setLoop(THREE.LoopRepeat, Infinity)
    this.aimDrawAction.setEffectiveWeight(1)
    this.aimDrawAction.fadeIn(0.15).play()
    this.currentAction = this.aimDrawAction
  }

  /** Lets `syncAnimation` return to idle/walk once the draw ends (fired,
   *  cancelled, downed, or a modal/tool-switch cancel). Safe to call when
   *  not drawing. */
  endRangedDraw(): void {
    this.rangedDrawing = false
  }

  /** One-shot release snap timed to the bow's release+recovery window — the
   *  ranged counterpart of `beginMeleeAttack`'s time-scaled clip. Call once,
   *  on the exact frame a shot fires. No-op if no stand-in clip was found;
   *  `rangedDrawing` stays true underneath so a subsequent `endRangedDraw()`
   *  (once `playerRanged` actually reaches `idle`) still returns to
   *  idle/walk rather than snapping back to the aim-hold pose. */
  playRangedRelease(durationSec: number): void {
    if (!this.rangedReleaseAction) return
    const clipDuration = this.rangedReleaseAction.getClip().duration
    const timeScale = durationSec > 1e-4 ? clipDuration / durationSec : 1
    this.currentAction?.fadeOut(0.05)
    this.rangedReleaseAction.reset()
    this.rangedReleaseAction.setLoop(THREE.LoopOnce, 1)
    this.rangedReleaseAction.clampWhenFinished = true
    this.rangedReleaseAction.setEffectiveTimeScale(timeScale)
    this.rangedReleaseAction.setEffectiveWeight(1)
    this.rangedReleaseAction.fadeIn(0.05).play()
    this.currentAction = this.rangedReleaseAction
  }

  /** Current movement tier for fauna stealth calculations (plan 124 §4) —
   *  reuses `update()`'s own `moving`/`sprinting` flags. */
  movementState(): PlayerMovementState {
    if (!this.moving) return 'stationary'
    return this.sprinting ? 'sprinting' : 'moving'
  }

  /** Recomputes movement-speed overload from this frame's carried load (plan
   *  164 §9) — `app/gameLoop.ts` is the sole caller, once per frame, right
   *  before `update()`. Kept as an explicit setter (not inventory access on
   *  `this`) so `PlayerController` stays free of `Inventory`/container
   *  coupling — see `player/playerEncumbrance.ts`'s single authoritative calc. */
  setEncumbrance(loadKg: number, capacityKg: number): void {
    const result = computeEncumbrance(loadKg, capacityKg)
    this.encumbranceSpeedMultiplier = result.speedMultiplier
    this.encumbranceBlocked = result.blocked
  }

  setPosition(x: number, z: number): void {
    this.mesh.position.x = x
    this.mesh.position.z = z
    this.snapToGround()
    this.syncCamera()
  }

  /** Turns the character to face `(x, z)` — an instant snap, matching the
   *  existing movement-facing convention (no rotation smoothing anywhere on
   *  this rig). Used to soften the aim requirement for melee (plan 124 §4)
   *  without touching camera yaw or the hit-resolution arc test. */
  faceToward(x: number, z: number): void {
    const dx = x - this.mesh.position.x
    const dz = z - this.mesh.position.z
    if (Math.hypot(dx, dz) < 1e-4) return
    this.mesh.rotation.y = Math.atan2(dx, dz)
  }

  /** Turns the character to face along `aimYaw` — the same yaw convention
   *  `resolveRangedDirection`/`resolveMeleeHits`/`yawToward` use (`-sin(yaw)`,
   *  `-cos(yaw)`), converted to this rig's own facing convention (`π` apart,
   *  same relationship `faceToward`'s `atan2(dx, dz)` has to `yawToward`'s
   *  `atan2(-dx, -dz)`). Used to keep a ranged draw's visual facing
   *  continuously in sync with the committed aim direction fired at release
   *  (plan 186) instead of snapping once and then drifting from the live aim. */
  faceAimYaw(aimYaw: number): void {
    this.mesh.rotation.y = aimYaw + Math.PI
  }

  /** Collision-safe displacement toward a point — the melee gap-close/
   *  fallback hop (plan 124 §3). Never a teleport: `dx`/`dz` are already
   *  bounded by the caller (`playerMelee.requestAttack`'s `moveX`/`moveZ`).
   *  Mirrors `update()`'s per-frame movement resolution so the player can't
   *  lunge through walls/houses. */
  gapClose(dx: number, dz: number): void {
    if (dx === 0 && dz === 0) return
    const candidateX = this.mesh.position.x + dx
    const candidateZ = this.mesh.position.z + dz
    const resolved = resolvePosition(
      candidateX,
      candidateZ,
      PLAYER_COLLISION_RADIUS,
      this.collidersNear(candidateX, candidateZ),
    )
    this.mesh.position.x = resolved.x
    this.mesh.position.z = resolved.z
    this.snapToGround()
    this.syncCamera()
  }

  /** Procedural squat — camp-rest setup/teardown between stand and lie. */
  crouch(): void {
    if (this.pose === 'crouch') return
    this.clearPoseVisual()
    this.pose = 'crouch'
    // Resting invalidates Sneak (plan 124 §2) — the only existing pose
    // transition that makes the mode meaningless, so this is the one place
    // it auto-deactivates.
    this.skills.sneak.active = false
    this.currentAction?.fadeOut(0.15)
    this.currentAction = null
    this.modelRoot.rotation.x = CROUCH_ROTATION_X
    this.modelRoot.position.y = CROUCH_Y_OFFSET
  }

  /** Tips the model onto its back and freezes animation — used while resting
   *  (`app/createApp.ts`'s "Rozbij obóz"/"Odpocznij w mieście" quick
   *  actions). `update()` skips movement/animation entirely while not
   *  standing; the camera keeps following so the world stays visible around
   *  the sleeping character during the sped-up clock. */
  lieDown(): void {
    if (this.pose === 'lie') return
    this.clearPoseVisual()
    this.pose = 'lie'
    // Same reasoning as `crouch()` — town rest calls this directly without
    // going through the crouch phase first.
    this.skills.sneak.active = false
    this.currentAction?.fadeOut(0.15)
    this.currentAction = null
    this.modelRoot.rotation.x = LIE_DOWN_ROTATION_X
    this.mesh.position.y += LIE_DOWN_Y_OFFSET
  }

  /** No-op if already standing. Clears crouch or lie visuals. */
  standUp(): void {
    if (this.pose === 'stand' && !this.downed) return
    this.clearPoseVisual()
    this.pose = 'stand'
    this.playAction(this.idleAction)
  }

  isDowned(): boolean {
    return this.downed
  }

  /** HP reached 0 — lie down for `durationSec`, then `tickDowned` stands up. */
  enterDowned(durationSec: number): void {
    if (this.downed) return
    this.downed = true
    this.downedTimer = durationSec
    this.meleeAttacking = false
    this.rangedDrawing = false
    this.lieDown()
  }

  /** Advances the downed timer; returns true when the player just stood up. */
  tickDowned(dt: number): boolean {
    if (!this.downed) return false
    this.downedTimer -= dt
    if (this.downedTimer > 0) return false
    this.downed = false
    this.downedTimer = 0
    this.standUp()
    return true
  }

  nextDefenseAttempt(): number {
    this.defenseAttempt += 1
    return this.defenseAttempt
  }

  /** Edge-triggered request, consumed on the next `updateVerticalMotion` —
   *  no-op while airborne (no double jump), underwater, or crouched/lying. */
  jump(): void {
    if (this.pose !== 'stand' || this.downed) return
    this.jumpRequested = true
  }

  /** Enters/exits mounted locomotion (plan fauna-003 §5/§6). No-op if already
   *  in the requested state. Movement/position is not touched here — the
   *  riding system calls `setMountedTransform()` separately, every frame. */
  setMounted(mounted: boolean): void {
    if (this.mounted === mounted) return
    this.mounted = mounted
    this.moving = false
    this.sprinting = false
    this.meleeAttacking = false
    this.rangedDrawing = false
    // No riding animation clip exists on this rig (plan fauna-003 §7) — the
    // accepted fallback is a static seated pose, i.e. just Idle, correctly
    // positioned and moving with the mount, instead of the walk/run cycle
    // `syncAnimation()` would otherwise pick.
    this.playAction(this.idleAction)
  }

  isMounted(): boolean {
    return this.mounted
  }

  /** Copies the mount's seat world transform onto the player (plan fauna-003
   *  §6) — called once per frame by the riding system, before `update()`
   *  runs, so this frame's `syncCamera()`/gaze/interactables all see the
   *  fresh position. */
  setMountedTransform(x: number, y: number, z: number, yaw: number): void {
    this.mesh.position.set(x, y, z)
    this.mesh.rotation.y = yaw
  }

  update(dt: number, dayLengthSec: number): void {
    if (this.mounted) {
      this.syncCamera()
      this.syncHpBar()
      this.mixer?.update(dt)
      return
    }
    if (this.downed) {
      tickPlayerStamina(this.needs.stamina, dt, false)
      this.syncCamera()
      this.syncHpBar()
      this.mixer?.update(dt)
      return
    }
    if (this.pose !== 'stand') {
      tickPlayerStamina(this.needs.stamina, dt, false)
      this.syncCamera()
      this.syncHpBar()
      this.mixer?.update(dt)
      return
    }
    const { yaw } = this.look
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
    this.right.set(-this.forward.z, 0, this.forward.x)

    this.wish.set(0, 0, 0)
    if (this.keys.forward) this.wish.add(this.forward)
    if (this.keys.backward) this.wish.sub(this.forward)
    if (this.keys.left) this.wish.sub(this.right)
    if (this.keys.right) this.wish.add(this.right)

    if (this.encumbranceBlocked) this.wish.set(0, 0, 0)
    this.moving = this.wish.lengthSq() > 0
    this.sprinting = this.moving && this.keys.sprint && !isExhausted(this.needs.stamina)
    tickPlayerStamina(this.needs.stamina, dt, this.sprinting)
    if (this.moving) tickPlayerMovementVigor(this.needs.vigor, dt, this.sprinting, dayLengthSec)
    if (!this.skills.sneak.active) this.sneakUseDistance = 0
    if (this.moving) {
      const baseSpeed = (this.sprinting ? MOVE_SPEED * SPRINT_MULTIPLIER : MOVE_SPEED) * this.encumbranceSpeedMultiplier
      const speed = applySneakSpeedModifier(baseSpeed, this.skills.sneak.active)
      this.wish.normalize().multiplyScalar(speed * dt)
      // Steep terrain scales down (and, past the max walkable angle, removes)
      // the uphill component of the move — across-slope/downhill are
      // untouched (plan 183).
      const slopeWish = applySlopeMovementConstraint(
        this.wish.x,
        this.wish.z,
        this.mesh.position.x,
        this.mesh.position.z,
        this.sampleHeight,
      )
      this.wish.x = slopeWish.x
      this.wish.z = slopeWish.z
      // Sneak progresses from distance actually sneaked, not from frames with
      // the toggle on (plan 128 §1 "nie przyznawać XP co klatkę").
      if (this.skills.sneak.active) {
        this.sneakUseDistance = accumulateSneakUse(this.skills, this.sneakUseDistance, this.wish.length())
      }
      const candidateX = this.mesh.position.x + this.wish.x
      const candidateZ = this.mesh.position.z + this.wish.z
      const resolved = resolvePosition(
        candidateX,
        candidateZ,
        PLAYER_COLLISION_RADIUS,
        this.collidersNear(candidateX, candidateZ),
      )
      this.mesh.position.x = resolved.x
      this.mesh.position.z = resolved.z
      // A slope-blocked wish can collapse to zero — keep facing the last
      // direction instead of snapping to atan2(0, 0).
      if (this.wish.lengthSq() > 0) {
        this.mesh.rotation.y = Math.atan2(this.wish.x, this.wish.z)
      }
    }

    this.updateVerticalMotion(dt)
    this.tickFootsteps(dt)
    this.syncCamera()
    this.syncAnimation()
    this.syncHpBar()
    this.mixer?.update(dt)
  }

  /** Undo the visual offsets of the current pose before switching. */
  private clearPoseVisual(): void {
    if (this.pose === 'lie') {
      this.mesh.position.y -= LIE_DOWN_Y_OFFSET
    }
    this.modelRoot.rotation.x = 0
    this.modelRoot.position.y = 0
  }

  private syncHpBar(): void {
    const percent = computeBarPercent(this.health.currentHp, this.health.maxHp)
    this.lastHpPercent = applyBarPercent(this.hpFillEl, percent, this.lastHpPercent)
  }

  dispose(): void {
    this.setHeldTool(null)
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer?.stopAllAction()
    // GLB clones share GPU resources with the loader cache — only free the capsule fallback.
    if (this.isCapsule) disposeObject3D(this.mesh)
  }

  private findAction(
    animations: THREE.AnimationClip[],
    names: string[],
  ): THREE.AnimationAction | null {
    if (!this.mixer) return null
    for (const name of names) {
      const clip = animations.find((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())
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

  private syncAnimation(): void {
    if (this.meleeAttacking && this.attackAction) return
    if (this.rangedDrawing && this.aimDrawAction) return
    if (!this.moving) {
      this.playAction(this.idleAction)
      return
    }
    const moveAction = this.sprinting
      ? (this.runAction ?? this.walkAction)
      : this.walkAction
    this.playAction(moveAction ?? this.idleAction)
  }

  /** Teleport case (construction, `setPosition`, `setGround`) — snaps straight
   *  to ground/water and clears any in-flight jump/fall state. Per-frame
   *  movement uses `updateVerticalMotion` instead. */
  private snapToGround(): void {
    const { x, z } = this.mesh.position
    const groundY = this.sampleHeight(x, z)
    if (groundY <= this.waterLevel) {
      // Underwater: sink toward the real seabed instead of the flattened-to-waterLevel
      // mesh, capped so deep water still leaves the head above the surface.
      const floorY = this.sampleFloor(x, z)
      const depth = Math.min(this.waterLevel - floorY, MAX_SWIM_DEPTH)
      this.mesh.position.y = this.waterLevel - depth
    } else {
      this.mesh.position.y = groundY
    }
    this.verticalVelocity = 0
    this.grounded = true
    this.jumpRequested = false
    this.wasInWater = groundY <= this.waterLevel
    this.footstepAccum = 0
    this.modelRoot.rotation.x = 0
  }

  /** Per-frame gravity/jump (plan 097 §2.3 + 158 slope-stick). Underwater
   *  keeps the existing swim behaviour and blocks jumping/falling. */
  private updateVerticalMotion(dt: number): void {
    const { x, z } = this.mesh.position
    const groundY = this.sampleHeight(x, z)
    if (groundY <= this.waterLevel) {
      if (!this.wasInWater && this.playAt) {
        playWaterLap(this.playAt, { x, y: this.waterLevel, z })
      }
      this.wasInWater = true
      const floorY = this.sampleFloor(x, z)
      const depth = Math.min(this.waterLevel - floorY, MAX_SWIM_DEPTH)
      this.mesh.position.y = this.waterLevel - depth
      this.verticalVelocity = 0
      this.grounded = true
      this.jumpRequested = false
      this.modelRoot.rotation.x = 0
      return
    }
    this.wasInWater = false

    const next = integrateVerticalMotion({
      y: this.mesh.position.y,
      verticalVelocity: this.verticalVelocity,
      grounded: this.grounded,
      groundY,
      dt,
      jumpRequested: this.jumpRequested,
    })
    this.jumpRequested = false
    this.mesh.position.y = next.y
    this.verticalVelocity = next.verticalVelocity
    this.grounded = next.grounded

    if (next.tookOff && this.playAt) {
      playJumpTakeoff(this.playAt, { x, y: next.y, z })
    }
    if (next.landed) {
      if (this.playAt) {
        playJumpLand(
          this.playAt,
          { x, y: next.y, z },
          this.sampleFootstepSurface(x, z),
        )
      }
      this.footstepAccum = 0
    }

    this.modelRoot.rotation.x = this.grounded
      ? 0
      : THREE.MathUtils.clamp(
          -this.verticalVelocity * JUMP_TILT_FACTOR,
          -JUMP_TILT_MAX,
          JUMP_TILT_MAX,
        )
  }

  private tickFootsteps(dt: number): void {
    if (!this.playAt || !this.moving || !this.grounded || this.wasInWater) {
      if (!this.moving) this.footstepAccum = 0
      return
    }
    const interval = this.sprinting ? FOOTSTEP_SPRINT_INTERVAL : FOOTSTEP_WALK_INTERVAL
    this.footstepAccum += dt
    if (this.footstepAccum < interval) return
    this.footstepAccum = 0
    const surface = this.sampleFootstepSurface(this.mesh.position.x, this.mesh.position.z)
    playFootstep(
      this.playAt,
      { x: this.mesh.position.x, y: this.mesh.position.y, z: this.mesh.position.z },
      this.sprinting,
      surface,
    )
  }

  /** Third-person boom. Desired pose is unconstrained orbit; `resolveCameraBoom`
   *  then pulls along the look-at → camera segment so the lens stays out of
   *  the heightfield and house-sized colliders (plan 097 circles, extruded). */
  private syncCamera(): void {
    const { yaw, pitch, distance } = this.look
    const cosPitch = Math.cos(pitch)
    this.camOffset.set(
      Math.sin(yaw) * cosPitch,
      Math.sin(pitch),
      Math.cos(yaw) * cosPitch,
    )
    this.camOffset.multiplyScalar(distance)

    const zoomT = THREE.MathUtils.clamp(
      (distance - CAMERA_DISTANCE_MIN) /
        (CAMERA_DISTANCE_DEFAULT - CAMERA_DISTANCE_MIN),
      0,
      1,
    )
    const lookAtOffset = THREE.MathUtils.lerp(
      LOOK_AT_OFFSET_NEAR,
      LOOK_AT_OFFSET_FAR,
      zoomT,
    )
    const targetY = this.mesh.position.y + lookAtOffset
    const originX = this.mesh.position.x
    const originZ = this.mesh.position.z
    const desiredX = originX + this.camOffset.x
    const desiredY = targetY + this.camOffset.y
    const desiredZ = originZ + this.camOffset.z
    const resolved = resolveCameraBoom({
      originX,
      originY: targetY,
      originZ,
      camX: desiredX,
      camY: desiredY,
      camZ: desiredZ,
      sampleHeight: this.sampleHeight,
      colliders: this.collidersNear(originX, originZ),
    })
    this.camera.position.set(resolved.x, resolved.y, resolved.z)
    this.camera.lookAt(originX, targetY, originZ)
  }
}
