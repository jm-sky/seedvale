import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import type { SettlementLandmarks } from '../settlement/props'
import {
  createNeedState,
  needColor,
  type NeedId,
  needLabel,
  type NeedState,
  pickNeed,
  tickNeeds,
} from './Needs'

const WALK_SPEED = 2.4
const ARRIVE = 0.55
const HALF_HEIGHT = 0.75

type Phase =
  | 'choose'
  | 'chop'
  | 'deposit'
  | 'drink'
  | 'eat'
  | 'goGarden'
  | 'goStock'
  | 'goTree'
  | 'goWell'
  | 'wander'

export class NpcAgent {
  readonly mesh: THREE.Mesh
  readonly label: CSS2DObject
  private readonly sampleHeight: HeightSampler
  private readonly landmarks: SettlementLandmarks
  private readonly needs: NeedState
  private readonly home: THREE.Vector3
  private phase: Phase = 'choose'
  private activeNeed: NeedId = 'idle'
  private target = new THREE.Vector3()
  private treeIndex: number
  private wait = 0
  private readonly tmp = new THREE.Vector3()
  private readonly labelEl: HTMLDivElement

  constructor(
    sampleHeight: HeightSampler,
    landmarks: SettlementLandmarks,
    home: THREE.Vector3,
    treeIndex: number,
    needOffset: number,
  ) {
    this.sampleHeight = sampleHeight
    this.landmarks = landmarks
    this.home = home.clone()
    this.treeIndex = treeIndex % Math.max(1, landmarks.trees.length)
    this.needs = createNeedState(needOffset)

    const geometry = new THREE.CapsuleGeometry(0.28, 0.7, 3, 6)
    const material = new THREE.MeshStandardMaterial({
      color: needColor('idle'),
      flatShading: true,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.position.copy(home)
    this.mesh.position.y = sampleHeight(home.x, home.z) + HALF_HEIGHT

    this.labelEl = document.createElement('div')
    this.labelEl.className = 'npc-label'
    this.labelEl.textContent = needLabel('idle')
    this.label = new CSS2DObject(this.labelEl)
    this.label.position.set(0, 1.35, 0)
    this.mesh.add(this.label)
  }

  getActiveNeed(): NeedId {
    return this.activeNeed
  }

  update(dt: number): void {
    tickNeeds(this.needs, dt)

    switch (this.phase) {
      case 'choose':
        this.beginNeed(pickNeed(this.needs))
        break
      case 'chop':
        this.wait -= dt
        if (this.wait <= 0) this.phase = 'goStock'
        break
      case 'deposit':
        this.wait -= dt
        if (this.wait <= 0) {
          this.needs.woodDuty = Math.max(0, this.needs.woodDuty - 0.55)
          this.phase = 'choose'
        }
        break
      case 'drink':
        this.wait -= dt
        if (this.wait <= 0) {
          this.needs.thirst = Math.max(0, this.needs.thirst - 0.65)
          this.phase = 'choose'
        }
        break
      case 'eat':
        this.wait -= dt
        if (this.wait <= 0) {
          this.needs.hunger = Math.max(0, this.needs.hunger - 0.6)
          this.phase = 'choose'
        }
        break
      case 'goGarden':
        if (this.steerTo(this.landmarks.garden, dt)) {
          this.phase = 'eat'
          this.wait = 1.4
        }
        break
      case 'goStock':
        if (this.steerTo(this.landmarks.stockpile, dt)) {
          this.phase = 'deposit'
          this.wait = 0.8
        }
        break
      case 'goTree':
        if (this.steerTo(this.target, dt)) {
          this.phase = 'chop'
          this.wait = 1.6
        }
        break
      case 'goWell':
        if (this.steerTo(this.landmarks.well, dt)) {
          this.phase = 'drink'
          this.wait = 1.2
        }
        break
      case 'wander':
        if (this.steerTo(this.target, dt)) this.phase = 'choose'
        break
    }

    this.mesh.position.y =
      this.sampleHeight(this.mesh.position.x, this.mesh.position.z) + HALF_HEIGHT
    ;(this.mesh.material as THREE.MeshStandardMaterial).color.setHex(
      needColor(this.activeNeed),
    )
    this.labelEl.textContent = needLabel(this.activeNeed)
  }

  disposeLabel(): void {
    this.label.removeFromParent()
    this.labelEl.remove()
  }

  private beginNeed(need: NeedId): void {
    this.activeNeed = need
    if (need === 'water') {
      this.phase = 'goWell'
      return
    }
    if (need === 'food') {
      this.phase = 'goGarden'
      return
    }
    if (need === 'wood' && this.landmarks.trees.length > 0) {
      const tree = this.landmarks.trees[this.treeIndex]!
      this.treeIndex = (this.treeIndex + 1) % this.landmarks.trees.length
      this.target.copy(tree)
      this.phase = 'goTree'
      return
    }
    this.target.set(
      this.home.x + (Math.random() - 0.5) * 4,
      0,
      this.home.z + (Math.random() - 0.5) * 4,
    )
    this.phase = 'wander'
  }

  private steerTo(dest: THREE.Vector3, dt: number): boolean {
    this.tmp.set(dest.x, 0, dest.z)
    this.tmp.x -= this.mesh.position.x
    this.tmp.z -= this.mesh.position.z
    const dist = Math.hypot(this.tmp.x, this.tmp.z)
    if (dist < ARRIVE) return true
    this.tmp.multiplyScalar(1 / dist)
    this.mesh.position.x += this.tmp.x * WALK_SPEED * dt
    this.mesh.position.z += this.tmp.z * WALK_SPEED * dt
    this.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z)
    return false
  }
}
