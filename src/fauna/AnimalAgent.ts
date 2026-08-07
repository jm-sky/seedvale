import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import { labelOpacityForDistance } from '../ui/labelDistance'

/** Minimum clearance above waterLevel an animal will walk into or wander toward. */
const WATER_MARGIN = 0.3

export type AnimalRole = 'predator' | 'prey'
/** Matches Quaternius Ultimate Animated Animal Pack kinds used in Seedvale. */
export type AnimalKind = 'wolf' | 'fox' | 'deer' | 'stag'

const ANIMAL_LABELS: Record<AnimalKind, string> = {
  wolf: 'wilk',
  fox: 'lis',
  deer: 'sarna',
  stag: 'jeleń',
}

export type AnimalDef = {
  kind: AnimalKind
  role: AnimalRole
  color: number
  /** Capsule placeholder scale / height hint for GLB fit. */
  scale: number
  /** Target model height in world meters (GLB). */
  modelHeight: number
  walkSpeed: number
  sprintSpeed: number
  detectRange: number
  fleeRange: number
}

export const ANIMAL_DEFS: Record<AnimalKind, AnimalDef> = {
  wolf: {
    kind: 'wolf',
    role: 'predator',
    color: 0x5a5a62,
    scale: 0.85,
    modelHeight: 0.95,
    walkSpeed: 3.2,
    sprintSpeed: 6.5,
    detectRange: 18,
    fleeRange: 0,
  },
  fox: {
    kind: 'fox',
    role: 'predator',
    color: 0xb85a2a,
    scale: 0.55,
    modelHeight: 0.55,
    walkSpeed: 3.0,
    sprintSpeed: 6.2,
    detectRange: 15,
    fleeRange: 0,
  },
  deer: {
    kind: 'deer',
    role: 'prey',
    color: 0xa67c52,
    scale: 0.95,
    modelHeight: 1.15,
    walkSpeed: 3.5,
    sprintSpeed: 7.5,
    detectRange: 16,
    fleeRange: 14,
  },
  stag: {
    kind: 'stag',
    role: 'prey',
    color: 0x8a6238,
    scale: 1.05,
    modelHeight: 1.35,
    walkSpeed: 3.3,
    sprintSpeed: 7.2,
    detectRange: 17,
    fleeRange: 15,
  },
}

export class AnimalAgent {
  /** Visual root (GLB group or capsule mesh). */
  readonly mesh: THREE.Object3D
  readonly def: AnimalDef
  private readonly sampleHeight: HeightSampler
  private readonly waterLevel: number
  private readonly halfExtent: number
  private readonly isCapsule: boolean
  private target = new THREE.Vector3()
  private readonly fleeTarget = new THREE.Vector3()
  private wanderTimer = 0
  private readonly tmp = new THREE.Vector3()
  private readonly home = new THREE.Vector3()
  private moving = false
  private sprinting = false
  private readonly mixer: THREE.AnimationMixer | null
  private readonly idleAction: THREE.AnimationAction | null
  private readonly walkAction: THREE.AnimationAction | null
  private readonly gallopAction: THREE.AnimationAction | null
  private currentAction: THREE.AnimationAction | null = null
  private readonly label: CSS2DObject
  private readonly labelEl: HTMLDivElement

  constructor(
    def: AnimalDef,
    sampleHeight: HeightSampler,
    waterLevel: number,
    halfExtent: number,
    x: number,
    z: number,
    visual?: THREE.Object3D,
    animations: THREE.AnimationClip[] = [],
  ) {
    this.def = def
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
    this.halfExtent = halfExtent - 2
    this.home.set(x, 0, z)

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
    this.labelEl.textContent = ANIMAL_LABELS[def.kind]
    this.label = new CSS2DObject(this.labelEl)
    const labelHeight = this.isCapsule
      ? 0.45 * def.scale + 0.3
      : def.modelHeight + 0.3
    this.label.position.set(0, labelHeight, 0)
    this.mesh.add(this.label)

    this.snapY()
    this.pickWanderTarget()
  }

  /** World XZ position for proximity queries. */
  get xz(): THREE.Vector2 {
    return new THREE.Vector2(this.mesh.position.x, this.mesh.position.z)
  }

  dispose(): void {
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer?.stopAllAction()
  }

  update(dt: number, others: AnimalAgent[], observerPos: THREE.Vector3): void {
    this.moving = false
    this.sprinting = false
    if (this.def.role === 'predator') {
      this.updatePredator(dt, others)
    } else {
      this.updatePrey(dt, others)
    }
    this.clampBounds()
    this.snapY()
    this.updateAnim()
    this.labelEl.style.opacity = String(
      labelOpacityForDistance(this.mesh.position.distanceTo(observerPos)),
    )
    this.mixer?.update(dt)
  }

  private updatePredator(dt: number, others: AnimalAgent[]): void {
    const prey = this.nearest(others, 'prey', this.def.detectRange)
    if (prey) {
      this.sprinting = true
      this.steerToward(prey.mesh.position, this.def.sprintSpeed, dt)
      return
    }
    this.wander(dt)
  }

  private updatePrey(dt: number, others: AnimalAgent[]): void {
    const threat = this.nearest(others, 'predator', this.def.fleeRange)
    if (threat) {
      this.tmp.set(
        this.mesh.position.x - threat.mesh.position.x,
        0,
        this.mesh.position.z - threat.mesh.position.z,
      )
      if (this.tmp.lengthSq() < 1e-4) {
        this.tmp.set(1, 0, 0)
      }
      this.tmp.normalize()
      this.sprinting = true
      this.fleeTarget.set(
        this.mesh.position.x + this.tmp.x * 8,
        0,
        this.mesh.position.z + this.tmp.z * 8,
      )
      this.steerToward(this.fleeTarget, this.def.sprintSpeed, dt)
      return
    }
    this.wander(dt)
  }

  private wander(dt: number): void {
    this.wanderTimer -= dt
    if (this.wanderTimer <= 0 || this.arrived(this.target, 1.2)) {
      this.pickWanderTarget()
    }
    this.steerToward(this.target, this.def.walkSpeed, dt)
  }

  private pickWanderTarget(): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = 6 + Math.random() * 10
      const a = Math.random() * Math.PI * 2
      const x = this.home.x + Math.cos(a) * r
      const z = this.home.z + Math.sin(a) * r
      if (this.isWalkable(x, z)) {
        this.target.set(x, 0, z)
        this.wanderTimer = 3 + Math.random() * 4
        return
      }
    }
    this.target.copy(this.home)
    this.wanderTimer = 3 + Math.random() * 4
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
      if (o === this || o.def.role !== role) continue
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
    const lim = this.halfExtent
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -lim, lim)
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -lim, lim)
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
