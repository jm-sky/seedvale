import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import type { SettlementLandmarks } from '../settlement/props'
import {
  disposeObject3D,
  loadGltfAnimated,
  prepareProp,
} from '../assets/loadGltf'
import { labelOpacityForDistance } from '../ui/labelDistance'
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
const NPC_HEIGHT = 1.75
/** Minimum clearance above waterLevel an NPC will walk into or wander toward. */
const WATER_MARGIN = 0.3

/** Quaternius Modular Men — village-flavoured variants. */
export const NPC_MODEL_URLS = [
  '/models/characters/Farmer.glb',
  '/models/characters/Worker.glb',
  '/models/characters/Casual_Hoodie.glb',
  '/models/characters/Casual_2.glb',
] as const

/** Placeholder pool until the character DB (names + traits) lands. */
const NPC_NAMES = [
  'Anna',
  'Piotr',
  'Kasia',
  'Marek',
  'Ola',
  'Tomek',
  'Zofia',
  'Jacek',
] as const

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
  readonly mesh: THREE.Object3D
  readonly label: CSS2DObject
  readonly name: string
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
  private target = new THREE.Vector3()
  private treeIndex: number
  private wait = 0
  private moving = false
  private readonly tmp = new THREE.Vector3()
  private readonly labelEl: HTMLDivElement

  private constructor(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    sampleHeight: HeightSampler,
    waterLevel: number,
    landmarks: SettlementLandmarks,
    home: THREE.Vector3,
    treeIndex: number,
    needOffset: number,
  ) {
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
    this.landmarks = landmarks
    this.home = home.clone()
    this.name = NPC_NAMES[treeIndex % NPC_NAMES.length]!
    this.treeIndex = treeIndex % Math.max(1, landmarks.trees.length)
    this.needs = createNeedState(needOffset)

    prepareProp(root, NPC_HEIGHT)
    const wrapper = new THREE.Group()
    wrapper.add(root)
    this.mesh = wrapper
    this.mesh.position.copy(home)
    this.mesh.position.y = sampleHeight(home.x, home.z)

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
    this.labelEl.textContent = `${this.name} · ${needLabel('idle')}`
    this.label = new CSS2DObject(this.labelEl)
    this.label.position.set(0, NPC_HEIGHT + 0.55, 0)
    this.mesh.add(this.label)
  }

  static async create(
    sampleHeight: HeightSampler,
    waterLevel: number,
    landmarks: SettlementLandmarks,
    home: THREE.Vector3,
    treeIndex: number,
    needOffset: number,
    modelUrl = NPC_MODEL_URLS[treeIndex % NPC_MODEL_URLS.length]!,
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
        treeIndex,
        needOffset,
      )
    } catch (err) {
      console.warn(`[npc] failed to load ${modelUrl}, using capsule`, err)
      return NpcAgent.createCapsuleFallback(
        sampleHeight,
        waterLevel,
        landmarks,
        home,
        treeIndex,
        needOffset,
      )
    }
  }

  private static createCapsuleFallback(
    sampleHeight: HeightSampler,
    waterLevel: number,
    landmarks: SettlementLandmarks,
    home: THREE.Vector3,
    treeIndex: number,
    needOffset: number,
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
      treeIndex,
      needOffset,
    )
  }

  getActiveNeed(): NeedId {
    return this.activeNeed
  }

  update(dt: number, observerPos: THREE.Vector3): void {
    tickNeeds(this.needs, dt)
    this.moving = false

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
    this.labelEl.textContent = `${this.name} · ${needLabel(this.activeNeed)}`
    this.labelEl.style.opacity = String(
      labelOpacityForDistance(this.mesh.position.distanceTo(observerPos)),
    )
    this.mixer.update(dt)
  }

  dispose(): void {
    this.label.removeFromParent()
    this.labelEl.remove()
    this.mixer.stopAllAction()
    disposeObject3D(this.mesh)
  }

  disposeLabel(): void {
    this.dispose()
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
    const busy =
      this.phase === 'chop' ||
      this.phase === 'deposit' ||
      this.phase === 'drink' ||
      this.phase === 'eat'

    if (this.moving && this.walkAction) {
      this.crossfade(this.walkAction)
    } else if (busy && this.interactAction) {
      this.crossfade(this.interactAction)
    } else if (this.idleAction) {
      this.crossfade(this.idleAction)
    }
  }

  private crossfade(next: THREE.AnimationAction): void {
    if (next.isRunning() && next.getEffectiveWeight() > 0.9) return
    next.reset().fadeIn(0.2).play()
    for (const action of [this.idleAction, this.walkAction, this.interactAction]) {
      if (action && action !== next) action.fadeOut(0.2)
    }
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

  private isWalkable(x: number, z: number): boolean {
    return this.sampleHeight(x, z) > this.waterLevel + WATER_MARGIN
  }

  private steerTo(dest: THREE.Vector3, dt: number): boolean {
    this.tmp.set(dest.x, 0, dest.z)
    this.tmp.x -= this.mesh.position.x
    this.tmp.z -= this.mesh.position.z
    const dist = Math.hypot(this.tmp.x, this.tmp.z)
    if (dist < ARRIVE) return true
    this.tmp.multiplyScalar(1 / dist)
    const stepX = this.tmp.x * WALK_SPEED * dt
    const stepZ = this.tmp.z * WALK_SPEED * dt
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
