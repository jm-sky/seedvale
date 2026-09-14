import * as THREE from 'three'
import type { RoadBridgeSpec } from '../terrain/roadBridge'
import { disposeObject3D } from '../assets/loadGltf'

/**
 * @domain world-terrain
 * @system roads
 * @role Minimal procedural V1 bridge presentation (plan world-terrain-033 §6)
 *   — a flat deck slab, two rail strips and two support piers, road-aligned
 *   and sized entirely from a deterministic `RoadBridgeSpec`. Deliberately
 *   simple: correct topology (deck spans the channel, river stays visible
 *   beneath, approaches meet the deck without a step) matters more than
 *   richness for V1. Kept out of `chunkManager.ts`'s attach path so bridge
 *   mesh construction stays in one focused module rather than growing a
 *   general structure framework.
 * @integration `ChunkManager` calls `createBridge(spec)` once per owner-chunk
 *   bridge instance on attach, adds the returned `group` to the scene, and
 *   calls `dispose()` on unload/rebuild. The deck itself is never registered
 *   as a collider — see `world/collision.ts`'s doc comment on why an OBB
 *   isn't a walkable surface; movement reads `RoadBridgeSpec` through the
 *   shared ground query instead (`ChunkManager.sampleSurfaceGround`).
 */

// `userData.sharedGpu` opts geometry/material out of `disposeObject3D`'s
// per-instance cleanup (`assets/loadGltf.ts`) — every bridge instance shares
// these, so disposing one bridge must never free them for every other.
const DECK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x8a6d4b, roughness: 0.9 })
const PIER_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 1 })
const RAIL_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.85 })
for (const mat of [DECK_MATERIAL, PIER_MATERIAL, RAIL_MATERIAL]) mat.userData.sharedGpu = true

/** Unit cube, scaled per-instance — every bridge deck/pier/rail shares this
 *  one geometry (no per-bridge geometry allocation). Local +X is the deck's
 *  long (road-aligned) axis before `group.rotation.y` is applied — the same
 *  "local +X -> world (dirX, dirZ)" convention `yawToward`/`directionFromYaw`
 *  already establish everywhere else a crossing angle is used. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
UNIT_BOX.userData.sharedGpu = true

/** Pier center distance from the deck center, as a fraction of half-span —
 *  keeps piers off the very tip of the deck, roughly under the bank instead
 *  of out past it. */
const PIER_INSET_FRACTION = 0.32
/** Pier footprint relative to deck width. */
const PIER_WIDTH_FRACTION = 0.5
/** How far a pier drops below the deck's underside (world units). */
const PIER_DROP = 2.2
const RAIL_HEIGHT = 0.5
const RAIL_THICKNESS = 0.12

export type BridgePresentation = {
  group: THREE.Group
  dispose: () => void
}

/** Builds one bridge's V1 procedural presentation from its deterministic
 *  spec — deck + two rails + two piers. Pure THREE construction; the caller
 *  owns scene attach and any collider registration (railings/abutments may
 *  use ordinary obstacle colliders, the deck must not). */
export function createBridge(spec: RoadBridgeSpec): BridgePresentation {
  const group = new THREE.Group()
  group.name = `bridge:${spec.id}`
  group.position.set(spec.x, 0, spec.z)
  group.rotation.y = spec.yaw

  const deck = new THREE.Mesh(UNIT_BOX, DECK_MATERIAL)
  deck.scale.set(spec.span, spec.deckThickness, spec.width)
  deck.position.y = spec.deckY - spec.deckThickness * 0.5
  deck.castShadow = true
  deck.receiveShadow = true
  group.add(deck)

  const railOffsetZ = spec.width * 0.5 - RAIL_THICKNESS * 0.5
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(UNIT_BOX, RAIL_MATERIAL)
    rail.scale.set(spec.span, RAIL_HEIGHT, RAIL_THICKNESS)
    rail.position.set(0, spec.deckY + RAIL_HEIGHT * 0.5, side * railOffsetZ)
    rail.castShadow = true
    group.add(rail)
  }

  const pierAlong = spec.span * 0.5 * (1 - PIER_INSET_FRACTION)
  const pierWidth = spec.width * PIER_WIDTH_FRACTION
  for (const side of [-1, 1] as const) {
    const pier = new THREE.Mesh(UNIT_BOX, PIER_MATERIAL)
    pier.scale.set(pierWidth, PIER_DROP, pierWidth)
    pier.position.set(side * pierAlong, spec.deckY - spec.deckThickness - PIER_DROP * 0.5, 0)
    pier.castShadow = true
    group.add(pier)
  }

  return {
    group,
    dispose() {
      disposeObject3D(group)
      group.removeFromParent()
    },
  }
}
