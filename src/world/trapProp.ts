import * as THREE from 'three'
import { disposeObject3D } from '../assets/loadGltf'
import { type TrapKind, type TrapState } from './animalTraps'

/**
 * Procedural visual for a placed animal trap (plan 141 §8/§22). No trap GLB
 * exists in the repo yet (`docs/assets/MODELS.md` M40) — `TrapDef.modelUrl`
 * is the single place a real asset gets wired in later; this is the fallback,
 * same convention as `fauna/proceduralAnimals.ts` and `items/tentProp.ts`.
 *
 * State is read from the shape itself, no extra UI: armed traps stand their
 * jaws open, a disarmed trap lies flat, a broken one is bent and rusted.
 */
type TrapPropParts = {
  jaws: THREE.Object3D[]
  metal: THREE.MeshStandardMaterial
}

/** Per-prop handles for `setTrapPropState`. A `WeakMap` (rather than
 *  `userData`) keeps this typed and drops entries with the prop itself. */
const partsByProp = new WeakMap<THREE.Object3D, TrapPropParts>()

const METAL_COLOR: Record<TrapKind, number> = {
  simple: 0x6f6a60,
  good: 0x9aa0a8,
}
const BROKEN_COLOR = 0x6b4128
const PLATE_COLOR = 0x4a3a2a

const TRAP_RADIUS: Record<TrapKind, number> = { simple: 0.34, good: 0.42 }

export function createTrapProp(kind: TrapKind): THREE.Group {
  const group = new THREE.Group()
  const radius = TRAP_RADIUS[kind]
  const metal = new THREE.MeshStandardMaterial({
    color: METAL_COLOR[kind],
    flatShading: true,
    metalness: kind === 'good' ? 0.55 : 0.25,
    roughness: 0.7,
  })

  const base = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.09, 4, 12), metal)
  base.rotation.x = -Math.PI / 2
  base.position.y = 0.04
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, 0.04, 8),
    new THREE.MeshStandardMaterial({ color: PLATE_COLOR, flatShading: true, roughness: 1 }),
  )
  plate.position.y = 0.03
  plate.receiveShadow = true
  group.add(plate)

  const jaws: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    // Hinge pivot at the ring edge so the jaw rotates up out of the ground,
    // exactly like the real thing — one transform per state change, no
    // per-frame animation (implementation notes §22).
    const hinge = new THREE.Group()
    hinge.position.set(0, 0.04, side * radius * 0.72)
    const jaw = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.78, radius * 0.07, 4, 8, Math.PI),
      metal,
    )
    jaw.rotation.set(-Math.PI / 2, 0, side > 0 ? 0 : Math.PI)
    jaw.position.y = 0.01
    jaw.castShadow = true
    hinge.add(jaw)
    group.add(hinge)
    jaws.push(hinge)
  }

  partsByProp.set(group, { jaws, metal })
  return group
}

/** Jaw hinge angle per state — `active` opens them wide, `placed` folds them
 *  down flat, `broken` leaves them half-collapsed and crooked. */
const JAW_PITCH: Record<TrapState, number> = {
  placed: 0,
  active: -1.25,
  broken: -0.35,
}

export function setTrapPropState(prop: THREE.Object3D, kind: TrapKind, state: TrapState): void {
  const parts = partsByProp.get(prop)
  if (!parts) return
  parts.jaws.forEach((hinge, index) => {
    const side = index === 0 ? -1 : 1
    hinge.rotation.x = JAW_PITCH[state] * side
    // A broken trap is visibly bent out of line, not just differently posed.
    hinge.rotation.z = state === 'broken' ? side * 0.35 : 0
  })
  prop.rotation.z = state === 'broken' ? 0.12 : 0
  parts.metal.color.setHex(state === 'broken' ? BROKEN_COLOR : METAL_COLOR[kind])
  parts.metal.metalness = state === 'broken' ? 0.05 : kind === 'good' ? 0.55 : 0.25
}

export function disposeTrapProp(prop: THREE.Object3D): void {
  prop.removeFromParent()
  partsByProp.delete(prop)
  disposeObject3D(prop)
}
