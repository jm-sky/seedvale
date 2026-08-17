import * as THREE from 'three'
import type { AnimalKind } from './AnimalAgent'
import { disposeObject3D, loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { createItemMesh } from '../items/items'
import { meatKindForAnimal } from './animalMeat'

const PILE_URL = '/models/fx/bones_pile.glb'
const BONE_URL = '/models/fx/large_bone.glb'
const HIDE_URL = '/models/fx/animal_hide.glb'

/** Longest-axis fit (meters) on the cached templates, before per-animal scale. */
const PILE_FIT = 0.9
const BONE_FIT = 0.55
const HIDE_FIT = 0.85

/** Species that get two large bones beside the pile (plan 138). */
const TWO_LARGE_BONE_KINDS: ReadonlySet<AnimalKind> = new Set([
  'boar',
  'cow',
  'deer',
  'donkey',
  'horse',
  'sheep',
  'stag',
])

const BONE_COLOR = 0xe8d9b8

const MEAT_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0.16, -0.22, 0.55],
  [-0.18, 0.08, -0.7],
  [0.04, 0.22, 1.1],
  [-0.08, -0.16, -1.4],
]

type RemainsTemplates = {
  pile: THREE.Object3D
  bone: THREE.Object3D
  hide: THREE.Object3D
}

let templates: RemainsTemplates | null = null
let templatesPromise: Promise<RemainsTemplates | null> | null = null

function remainsScale(modelHeight: number): number {
  return Math.min(1.6, Math.max(0.45, modelHeight * 0.55))
}

/** 1× for small/medium wild animals; 2× for deer/stag/boar/livestock. */
export function largeBoneCount(kind: AnimalKind): number {
  return TWO_LARGE_BONE_KINDS.has(kind) ? 2 : 1
}

/** 2 scraps always; +1–2 when `modelHeight > 0.55` (max 4). */
export function meatScrapCount(modelHeight: number): number {
  let n = 2
  if (modelHeight > 0.55) n += 1
  if (modelHeight > 0.85) n += 1
  return Math.min(4, n)
}

function addMeatScraps(group: THREE.Group, kind: AnimalKind, scale: number, count: number): void {
  const meatKind = meatKindForAnimal(kind)
  for (let i = 0; i < count; i++) {
    const [x, z, yaw] = MEAT_OFFSETS[i]!
    const scrap = createItemMesh(meatKind)
    scrap.position.set(x * scale, 0, z * scale)
    scrap.rotation.y = yaw
    scrap.scale.multiplyScalar((0.7 - i * 0.08) * scale)
    group.add(scrap)
  }
}

function addBone(group: THREE.Group, length: number, radius: number, x: number, z: number, yaw: number): void {
  const bone = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.75, length, 5),
    new THREE.MeshStandardMaterial({ color: BONE_COLOR, roughness: 0.85, flatShading: true }),
  )
  bone.rotation.z = Math.PI / 2
  bone.rotation.y = yaw
  bone.position.set(x, radius, z)
  bone.castShadow = true
  group.add(bone)
}

async function ensureTemplates(): Promise<RemainsTemplates | null> {
  if (templates) return templates
  if (!templatesPromise) {
    templatesPromise = (async () => {
      try {
        const [pile, bone, hide] = await Promise.all([
          loadGltf(PILE_URL),
          loadGltf(BONE_URL),
          loadGltf(HIDE_URL),
        ])
        preparePropFitMax(pile, PILE_FIT)
        preparePropFitMax(bone, BONE_FIT)
        preparePropFitMax(hide, HIDE_FIT)
        templates = { pile, bone, hide }
        return templates
      } catch (err) {
        console.warn('[fauna] failed to load harvested-remains GLB', err)
        return null
      }
    })()
  }
  return templatesPromise
}

function composeGlbRemains(
  tpl: RemainsTemplates,
  kind: AnimalKind,
  modelHeight: number,
): THREE.Group {
  const scale = remainsScale(modelHeight)
  const group = new THREE.Group()
  group.name = 'harvested-remains'

  const pile = tpl.pile.clone()
  pile.scale.multiplyScalar(scale)
  group.add(pile)

  const boneCount = largeBoneCount(kind)
  const boneA = tpl.bone.clone()
  boneA.scale.multiplyScalar(scale)
  boneA.position.set(0.32 * scale, 0, -0.14 * scale)
  boneA.rotation.y = 0.55
  group.add(boneA)
  if (boneCount > 1) {
    const boneB = tpl.bone.clone()
    boneB.scale.multiplyScalar(scale * 0.9)
    boneB.position.set(-0.28 * scale, 0, 0.2 * scale)
    boneB.rotation.y = -1.05
    group.add(boneB)
  }

  const hide = tpl.hide.clone()
  hide.scale.multiplyScalar(scale)
  hide.position.set(0.62 * scale, 0, 0.28 * scale)
  hide.rotation.y = 0.4
  group.add(hide)

  addMeatScraps(group, kind, scale, meatScrapCount(modelHeight))
  return group
}

/**
 * Sync procedural leftover pile (plan 137) — used by tests and as the GLB
 * load fallback. Bones, 1–2 meat scraps, hide box. Not a world pickup.
 */
export function createHarvestedRemains(kind: AnimalKind, modelHeight: number): THREE.Group {
  const scale = remainsScale(modelHeight)
  const group = new THREE.Group()
  group.name = 'harvested-remains'

  addBone(group, 0.42 * scale, 0.028 * scale, 0.08 * scale, 0.02 * scale, 0.35)
  addBone(group, 0.34 * scale, 0.022 * scale, -0.12 * scale, -0.06 * scale, -0.7)
  addBone(group, 0.22 * scale, 0.018 * scale, 0.02 * scale, 0.14 * scale, 1.1)
  if (modelHeight > 0.7) {
    addBone(group, 0.28 * scale, 0.02 * scale, -0.05 * scale, 0.1 * scale, 2.2)
  }

  addMeatScraps(group, kind, scale, modelHeight > 0.55 ? 2 : 1)

  const hide = createItemMesh('hide')
  hide.position.set(0.02 * scale, 0, 0.12 * scale)
  hide.rotation.y = 0.25
  hide.scale.multiplyScalar(0.85 * scale)
  group.add(hide)

  return group
}

/** GLB pile + large bone(s) + hide + 2–4 meat scraps (plan 138). Falls back
 *  to {@link createHarvestedRemains} when the templates fail to load. */
export async function createHarvestedRemainsAsync(
  kind: AnimalKind,
  modelHeight: number,
): Promise<THREE.Group> {
  const tpl = await ensureTemplates()
  if (!tpl) return createHarvestedRemains(kind, modelHeight)
  return composeGlbRemains(tpl, kind, modelHeight)
}

export function disposeHarvestedRemains(remains: THREE.Object3D | null): void {
  if (!remains) return
  remains.removeFromParent()
  disposeObject3D(remains)
}
