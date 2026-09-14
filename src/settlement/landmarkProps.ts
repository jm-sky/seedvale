import * as THREE from 'three'
import type { EnvironmentKind } from '../terrain/chunkEnvironment'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import {
  LANDMARK_BOAT_FIT_MAX,
  LANDMARK_BOAT_URL,
  LANDMARK_OLD_TREE_FIT_MAX,
  LANDMARK_OLD_TREE_URL,
  LANDMARK_SHIPWRECK_FIT_MAX,
  LANDMARK_SHIPWRECK_URL,
  LANDMARK_TOWER_FIT_MAX,
  LANDMARK_TOWER_URL,
  LANDMARK_WAGON_FIT_MAX,
  LANDMARK_WAGON_URL,
} from './propSpecs'

type LandmarkGlbKind = 'boat' | 'shipwreck' | 'tower' | 'oldTree' | 'wagon'

const templates: Partial<Record<LandmarkGlbKind, THREE.Object3D | null>> = {}
let preloadPromise: Promise<void> | null = null

function asGroup(object: THREE.Object3D): THREE.Group {
  if (object instanceof THREE.Group) return object
  const group = new THREE.Group()
  group.add(object)
  return group
}

function createProceduralBoat(scale: number): THREE.Group {
  const g = new THREE.Group()
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true, roughness: 0.95 })
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8 * scale, 0.35 * scale, 0.7 * scale), hullMat)
  hull.position.y = 0.2 * scale
  hull.castShadow = true
  g.add(hull)
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.35 * scale, 0.7 * scale, 4), hullMat)
  bow.rotation.z = Math.PI / 2
  bow.position.set(1.1 * scale, 0.2 * scale, 0)
  g.add(bow)
  return g
}

function createProceduralShipwreck(scale: number): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true, roughness: 1 })
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5.5 * scale, 1.2 * scale, 1.8 * scale), mat)
  hull.position.set(0, 0.55 * scale, 0)
  hull.rotation.z = 0.18
  hull.castShadow = true
  g.add(hull)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 3.2 * scale, 5), mat)
  mast.position.set(-0.6 * scale, 1.4 * scale, 0.2 * scale)
  mast.rotation.z = -0.55
  mast.castShadow = true
  g.add(mast)
  return g
}

function createProceduralTower(scale: number): THREE.Group {
  const g = new THREE.Group()
  const stone = new THREE.MeshStandardMaterial({ color: 0x7a756c, flatShading: true, roughness: 1 })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * scale, 1.35 * scale, 6.5 * scale, 8), stone)
  shaft.position.y = 3.25 * scale
  shaft.castShadow = true
  g.add(shaft)
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.45 * scale, 1.2 * scale, 0.7 * scale, 8), stone)
  crown.position.y = 6.7 * scale
  crown.castShadow = true
  g.add(crown)
  return g
}

/** Distinct placeholder only — never a scaled normal vegetation tree. */
function createProceduralOldTreeMarker(scale: number): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a4030, flatShading: true, roughness: 1, wireframe: true })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * scale, 0.9 * scale, 4 * scale, 6), mat)
  trunk.position.y = 2 * scale
  g.add(trunk)
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 * scale, 0), mat)
  crown.position.y = 5.2 * scale
  g.add(crown)
  return g
}

function createProceduralWagon(scale: number): THREE.Group {
  const g = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e5236, flatShading: true, roughness: 0.95 })
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2 * scale, 0.55 * scale, 1.2 * scale), wood)
  bed.position.y = 0.75 * scale
  bed.castShadow = true
  g.add(bed)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, flatShading: true })
  for (const [x, z] of [
    [-0.7, 0.7],
    [0.7, 0.7],
    [-0.7, -0.7],
    [0.7, -0.7],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.35 * scale, 0.12 * scale, 10), wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x * scale, 0.35 * scale, z * scale)
    wheel.castShadow = true
    g.add(wheel)
  }
  return g
}

const SPECS: Record<LandmarkGlbKind, { url: string, fitMax: number, fallback: (scale: number) => THREE.Group }> = {
  boat: { url: LANDMARK_BOAT_URL, fitMax: LANDMARK_BOAT_FIT_MAX, fallback: createProceduralBoat },
  shipwreck: {
    url: LANDMARK_SHIPWRECK_URL,
    fitMax: LANDMARK_SHIPWRECK_FIT_MAX,
    fallback: createProceduralShipwreck,
  },
  tower: { url: LANDMARK_TOWER_URL, fitMax: LANDMARK_TOWER_FIT_MAX, fallback: createProceduralTower },
  oldTree: {
    url: LANDMARK_OLD_TREE_URL,
    fitMax: LANDMARK_OLD_TREE_FIT_MAX,
    fallback: createProceduralOldTreeMarker,
  },
  wagon: { url: LANDMARK_WAGON_URL, fitMax: LANDMARK_WAGON_FIT_MAX, fallback: createProceduralWagon },
}

/** Preload landmark GLB templates once at ChunkManager boot — never await
 *  during chunk finalization (plan world-terrain-027). */
export function preloadLandmarkTemplates(): Promise<void> {
  preloadPromise ??= (async () => {
    await Promise.all(
      (Object.keys(SPECS) as LandmarkGlbKind[]).map(async (kind) => {
        const spec = SPECS[kind]
        try {
          const model = await loadGltf(spec.url)
          preparePropFitMax(model, spec.fitMax)
          templates[kind] = model
        } catch (err) {
          console.warn(`[landmark] ${spec.url} unavailable — procedural fallback`, err)
          templates[kind] = null
        }
      }),
    )
  })()
  return preloadPromise
}

export function isLandmarkGlbKind(kind: EnvironmentKind): kind is LandmarkGlbKind {
  return kind === 'boat' || kind === 'shipwreck' || kind === 'tower' || kind === 'oldTree' || kind === 'wagon'
}

/** Sync clone from preloaded cache, or a distinct procedural fallback.
 *  Old-tree never uses a scaled vegetation tree. */
export function createLandmarkProp(kind: LandmarkGlbKind, scale: number): THREE.Group {
  const template = templates[kind]
  if (template) {
    const clone = template.clone(true)
    clone.scale.multiplyScalar(scale)
    return asGroup(clone)
  }
  return SPECS[kind].fallback(scale)
}
