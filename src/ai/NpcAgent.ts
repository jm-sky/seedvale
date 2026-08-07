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
  NPC_PERSONALITIES,
  PAUSE_PARAMS,
  type Personality,
  pickDialogueLine,
} from './dialogue'
import {
  createNeedState,
  needColor,
  type NeedId,
  needLabel,
  type NeedState,
  pickNeed,
  tickNeeds,
} from './Needs'

function randRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min)
}

const WALK_SPEED = 2.4
const ARRIVE = 0.55
const NPC_HEIGHT = 1.75
/** Minimum clearance above waterLevel an NPC will walk into or wander toward. */
const WATER_MARGIN = 0.3

export type NpcGender = 'male' | 'female'

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

const NPC_GENDERS: Record<(typeof NPC_NAMES)[number], NpcGender> = {
  Anna: 'female',
  Piotr: 'male',
  Kasia: 'female',
  Marek: 'male',
  Ola: 'female',
  Tomek: 'male',
  Zofia: 'female',
  Jacek: 'male',
}

function nameForIndex(treeIndex: number): (typeof NPC_NAMES)[number] {
  return NPC_NAMES[treeIndex % NPC_NAMES.length]!
}

/** Gender for a placeholder NPC name, or null for names outside the pool
 *  (defensive — quest defs reference these names by hand). */
export function genderForName(name: string): NpcGender | null {
  return (NPC_GENDERS as Record<string, NpcGender>)[name] ?? null
}

function modelUrlForIndex(treeIndex: number): string {
  const pool = NPC_MODEL_URLS[NPC_GENDERS[nameForIndex(treeIndex)]]
  return pool[treeIndex % pool.length]!
}

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
  | 'lookAtPlayer'
  | 'wander'

/** Phases the player's approach may interrupt to trigger a lookAtPlayer pause. */
const PAUSE_INTERRUPTIBLE_PHASES: readonly Phase[] = [
  'choose',
  'wander',
  'goGarden',
  'goStock',
  'goTree',
  'goWell',
]

export class NpcAgent {
  readonly mesh: THREE.Object3D
  readonly label: CSS2DObject
  readonly name: string
  readonly gender: NpcGender
  readonly personality: Personality
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
  private previousPhase: Phase | null = null
  private pauseTimer = 0
  private pauseCooldown = 0
  private readonly tmp = new THREE.Vector3()
  private readonly labelEl: HTMLDivElement
  /** Set externally (e.g. by a QuestManager) — NpcAgent stays quest-agnostic. */
  private questMarker: string | null = null
  private highlighted = false
  private readonly playSound: (url: string, volume?: number) => void

  private constructor(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    sampleHeight: HeightSampler,
    waterLevel: number,
    landmarks: SettlementLandmarks,
    home: THREE.Vector3,
    treeIndex: number,
    needOffset: number,
    playSound: (url: string, volume?: number) => void,
  ) {
    this.playSound = playSound
    this.sampleHeight = sampleHeight
    this.waterLevel = waterLevel
    this.landmarks = landmarks
    this.home = home.clone()
    const name = nameForIndex(treeIndex)
    this.name = name
    this.gender = NPC_GENDERS[name]
    this.personality = NPC_PERSONALITIES[treeIndex % NPC_PERSONALITIES.length]!
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
    playSound: (url: string, volume?: number) => void = () => {},
    modelUrl = modelUrlForIndex(treeIndex),
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
        playSound,
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
        playSound,
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
      treeIndex,
      needOffset,
      playSound,
    )
  }

  getActiveNeed(): NeedId {
    return this.activeNeed
  }

  getDialogueLine(): string {
    return pickDialogueLine(this.personality, this.activeNeed, this.isBusyPhase())
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

  update(dt: number, observerPos: THREE.Vector3): void {
    tickNeeds(this.needs, dt)
    this.moving = false

    if (this.pauseCooldown > 0) this.pauseCooldown -= dt
    if (this.pauseCooldown <= 0 && PAUSE_INTERRUPTIBLE_PHASES.includes(this.phase)) {
      const dx = this.mesh.position.x - observerPos.x
      const dz = this.mesh.position.z - observerPos.z
      const params = PAUSE_PARAMS[this.personality]
      if (Math.hypot(dx, dz) < params.triggerDistance) {
        this.previousPhase = this.phase
        this.phase = 'lookAtPlayer'
        this.pauseTimer = randRange(params.lookDurationRange)
        this.playReactionSound()
      }
    }

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
      case 'lookAtPlayer': {
        const dx = observerPos.x - this.mesh.position.x
        const dz = observerPos.z - this.mesh.position.z
        this.mesh.rotation.y = Math.atan2(dx, dz)
        this.pauseTimer -= dt
        if (this.pauseTimer <= 0) {
          this.phase = this.previousPhase ?? 'choose'
          this.previousPhase = null
          this.pauseCooldown = randRange(PAUSE_PARAMS[this.personality].cooldownRange)
        }
        break
      }
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
    this.labelEl.textContent = `${this.name} · ${needLabel(this.activeNeed)}${questSuffix}`
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
    if (this.moving && this.walkAction) {
      this.crossfade(this.walkAction)
    } else if (this.isBusyPhase() && this.interactAction) {
      this.crossfade(this.interactAction)
    } else if (this.idleAction) {
      this.crossfade(this.idleAction)
    }
  }

  private isBusyPhase(): boolean {
    return (
      this.phase === 'chop' ||
      this.phase === 'deposit' ||
      this.phase === 'drink' ||
      this.phase === 'eat' ||
      this.phase === 'lookAtPlayer'
    )
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

  private playReactionSound(): void {
    const pool = NPC_REACTION_SOUND_URLS[this.gender]
    const url = pool[Math.floor(Math.random() * pool.length)]
    if (url) this.playSound(url, REACTION_SOUND_VOLUME)
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
