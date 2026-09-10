import { type Object3D, type Scene } from 'three'
import type { AnimalDef } from '../fauna/animalDefs'
import type { HeightSampler } from '../player/PlayerController'
import { placeOnGround } from '../settlement/props'
import {
  cartAcceptsAnimal,
  type CartRecord,
  hitchDistanceForAnimal,
  resolveCartHitchPose,
} from './cart'
import { CART_MODEL_YAW_OFFSET, createCartProp, disposeCartProp } from './cartProp'

export type { CartRecord }

export type CartEntry = CartRecord & { mesh: Object3D }

export type DraftAnimalLookup = (animalId: string) => {
  def: AnimalDef
  x: number
  z: number
  yaw: number
  dead: boolean
} | null

export type WorldCarts = {
  list: () => readonly CartEntry[]
  nodes: () => readonly CartRecord[]
  get: (id: string) => CartRecord | null
  place: (x: number, z: number, yaw: number) => CartRecord
  attach: (cartId: string, animalId: string, def: AnimalDef) => boolean
  detach: (cartId: string) => boolean
  /** One-way hitch constraint after animal movement. No AI. */
  update: (resolveAnimal: DraftAnimalLookup) => void
  pulledBy: (animalId: string) => CartRecord | null
  dispose: () => void
}

let nextCartId = 0

function cartRecord(entry: CartEntry): CartRecord {
  return {
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    pulledByAnimalId: entry.pulledByAnimalId,
  }
}

function applyPose(entry: CartEntry, x: number, z: number, yaw: number, sampleHeight: HeightSampler): void {
  entry.x = x
  entry.z = z
  entry.yaw = yaw
  entry.mesh.rotation.y = yaw
  placeOnGround(entry.mesh, x, z, sampleHeight)
}

/**
 * @domain fauna
 * @system world-carts
 * @role World-owned movable cart identity/runtime (plan fauna-007). Animal
 *  movement is authoritative; the cart is attached cargo with no AI.
 * @owns CartRecord
 */
export function createWorldCarts(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly CartRecord[] = [],
  demoSpawn?: { x: number, z: number, yaw: number },
): WorldCarts {
  const carts: CartEntry[] = []

  const spawn = (record: CartRecord): void => {
    const mesh = createCartProp()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    carts.push({ ...record, mesh })
  }

  for (const record of initial) spawn(record)
  if (initial.length === 0 && demoSpawn) {
    spawn({
      id: `cart:demo:${nextCartId++}`,
      x: demoSpawn.x,
      z: demoSpawn.z,
      yaw: demoSpawn.yaw,
      pulledByAnimalId: null,
    })
  }

  const find = (id: string): CartEntry | undefined => carts.find((entry) => entry.id === id)

  return {
    list: () => carts,
    nodes: () => carts.map(cartRecord),
    get(id) {
      const entry = find(id)
      return entry ? cartRecord(entry) : null
    },
    place(x, z, yaw) {
      const record: CartRecord = {
        id: `cart:${Date.now()}:${nextCartId++}`,
        x,
        z,
        yaw,
        pulledByAnimalId: null,
      }
      spawn(record)
      return record
    },
    attach(cartId, animalId, def) {
      if (!cartAcceptsAnimal(def)) return false
      const entry = find(cartId)
      if (!entry) return false
      if (entry.pulledByAnimalId === animalId) return true
      for (const other of carts) {
        if (other !== entry && other.pulledByAnimalId === animalId) return false
      }
      if (entry.pulledByAnimalId) return false
      entry.pulledByAnimalId = animalId
      return true
    },
    detach(cartId) {
      const entry = find(cartId)
      if (!entry) return false
      if (!entry.pulledByAnimalId) return true
      entry.pulledByAnimalId = null
      return true
    },
    update(resolveAnimal) {
      for (const entry of carts) {
        const animalId = entry.pulledByAnimalId
        if (!animalId) continue
        const animal = resolveAnimal(animalId)
        if (!animal) continue
        if (animal.dead || !cartAcceptsAnimal(animal.def)) {
          entry.pulledByAnimalId = null
          continue
        }
        const pose = resolveCartHitchPose(animal, hitchDistanceForAnimal(animal.def), CART_MODEL_YAW_OFFSET)
        applyPose(entry, pose.x, pose.z, pose.yaw, sampleHeight)
      }
    },
    pulledBy(animalId) {
      const entry = carts.find((c) => c.pulledByAnimalId === animalId)
      return entry ? cartRecord(entry) : null
    },
    dispose() {
      for (const entry of carts) {
        entry.mesh.removeFromParent()
        disposeCartProp(entry.mesh)
      }
      carts.length = 0
    },
  }
}
