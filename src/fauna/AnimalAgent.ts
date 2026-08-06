import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'

export type AnimalRole = 'predator' | 'prey'
export type AnimalKind = 'bear' | 'deer' | 'rabbit' | 'wolf'

export type AnimalDef = {
  kind: AnimalKind
  role: AnimalRole
  color: number
  scale: number
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
    walkSpeed: 3.2,
    sprintSpeed: 6.5,
    detectRange: 18,
    fleeRange: 0,
  },
  bear: {
    kind: 'bear',
    role: 'predator',
    color: 0x4a3428,
    scale: 1.15,
    walkSpeed: 2.6,
    sprintSpeed: 5.2,
    detectRange: 14,
    fleeRange: 0,
  },
  deer: {
    kind: 'deer',
    role: 'prey',
    color: 0xa67c52,
    scale: 0.95,
    walkSpeed: 3.5,
    sprintSpeed: 7.5,
    detectRange: 16,
    fleeRange: 14,
  },
  rabbit: {
    kind: 'rabbit',
    role: 'prey',
    color: 0xc4b8a8,
    scale: 0.45,
    walkSpeed: 2.8,
    sprintSpeed: 6.8,
    detectRange: 12,
    fleeRange: 11,
  },
}

export class AnimalAgent {
  readonly mesh: THREE.Mesh
  readonly def: AnimalDef
  private readonly sampleHeight: HeightSampler
  private readonly waterLevel: number
  private readonly halfExtent: number
  private target = new THREE.Vector3()
  private wanderTimer = 0
  private readonly tmp = new THREE.Vector3()
  private readonly home = new THREE.Vector3()

  constructor(
    def: AnimalDef,
    sampleHeight: HeightSampler,
    waterLevel: number,
    halfExtent: number,
    x: number,
    z: number,
  ) {
    this.def = def
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
    this.halfExtent = halfExtent - 2
    this.home.set(x, 0, z)

    const radius = 0.28 * def.scale
    const length = 0.55 * def.scale
    const geometry = new THREE.CapsuleGeometry(radius, length, 3, 6)
    const material = new THREE.MeshStandardMaterial({
      color: def.color,
      flatShading: true,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.position.set(x, 0, z)
    this.mesh.userData.animalKind = def.kind
    this.mesh.userData.animalRole = def.role
    this.snapY()
    this.pickWanderTarget()
  }

  /** World XZ position for proximity queries. */
  get xz(): THREE.Vector2 {
    return new THREE.Vector2(this.mesh.position.x, this.mesh.position.z)
  }

  update(dt: number, others: AnimalAgent[]): void {
    if (this.def.role === 'predator') {
      this.updatePredator(dt, others)
    } else {
      this.updatePrey(dt, others)
    }
    this.clampBounds()
    this.snapY()
  }

  private updatePredator(dt: number, others: AnimalAgent[]): void {
    const prey = this.nearest(others, 'prey', this.def.detectRange)
    if (prey) {
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
      this.mesh.position.x += this.tmp.x * this.def.sprintSpeed * dt
      this.mesh.position.z += this.tmp.z * this.def.sprintSpeed * dt
      this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
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
    const r = 6 + Math.random() * 10
    const a = Math.random() * Math.PI * 2
    this.target.set(
      this.home.x + Math.cos(a) * r,
      0,
      this.home.z + Math.sin(a) * r,
    )
    this.wanderTimer = 3 + Math.random() * 4
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
    this.mesh.position.x += this.tmp.x * speed * dt
    this.mesh.position.z += this.tmp.z * speed * dt
    this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
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
    this.mesh.position.y = y + 0.45 * this.def.scale
  }
}
