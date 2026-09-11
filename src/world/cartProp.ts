import * as THREE from 'three'
import { disposeObject3D, loadGltf, markSharedGpu, preparePropFitMax } from '../assets/loadGltf'

/** Parked Quaternius pushcart — folder name is historical (see lily pad). */
export const CART_MODEL_URL = '/models/parked/cart.glb'
/** Longest-axis fit; merchant wagon uses 3.8, this is a hand cart. */
export const CART_FIT_MAX = 2.2
/** Applied on top of animal yaw if the GLB's forward axis is inverted. */
export const CART_MODEL_YAW_OFFSET = 0

let cartTemplate: THREE.Group | null = null
let cartLoad: Promise<void> | null = null

function createProceduralCart(): THREE.Group {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85, flatShading: true })
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.4, roughness: 0.6, flatShading: true })

  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 1.55), wood)
  bed.position.y = 0.42
  bed.castShadow = true
  bed.receiveShadow = true
  group.add(bed)

  const sideGeo = new THREE.BoxGeometry(0.06, 0.38, 1.5)
  const left = new THREE.Mesh(sideGeo, wood)
  left.position.set(-0.46, 0.62, 0)
  const right = left.clone()
  right.position.x = 0.46
  group.add(left, right)

  const front = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.38, 0.06), wood)
  front.position.set(0, 0.62, 0.74)
  const back = front.clone()
  back.position.z = -0.74
  group.add(front, back)

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), wood)
  shaft.position.set(0, 0.55, 1.05)
  group.add(shaft)

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10)
  const addWheel = (x: number, z: number): void => {
    const wheel = new THREE.Mesh(wheelGeo, iron)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.28, z)
    wheel.castShadow = true
    group.add(wheel)
  }
  addWheel(-0.52, 0.38)
  addWheel(0.52, 0.38)
  addWheel(-0.52, -0.38)
  addWheel(0.52, -0.38)

  return group
}

/**
 * @domain fauna
 * @role Cart visual template (GLB or procedural fallback). Logical hitch is
 *  authoritative even when the mesh is the fallback.
 */
export async function preloadCartProp(): Promise<void> {
  if (cartTemplate || cartLoad) {
    await cartLoad
    return
  }
  cartLoad = (async () => {
    try {
      const model = await loadGltf(CART_MODEL_URL)
      preparePropFitMax(model, CART_FIT_MAX)
      cartTemplate = model
    } catch (err) {
      console.warn('[cart] failed to load cart.glb, using procedural prop', err)
      cartTemplate = createProceduralCart()
      markSharedGpu(cartTemplate)
    }
  })()
  await cartLoad
}

export function createCartProp(): THREE.Group {
  if (cartTemplate) return cartTemplate.clone(true) as THREE.Group
  return createProceduralCart()
}

export function disposeCartProp(mesh: THREE.Object3D): void {
  disposeObject3D(mesh)
}
