import type { AnimalKind } from './animalDefs'
import { disposeObject3D } from '../assets/loadGltf'
import { createItemMesh } from '../items/items'
import type { Object3D } from 'three'

/**
 * @domain fauna
 * @role Manual, per-species visual transform for the attached saddlebags
 *  model (plan fauna-039 §8/§9) — deliberately separate from
 *  `AnimalDef.pack` (gameplay capacity). Presentation never gates or
 *  influences gameplay: a missing/zeroed entry still attaches the model at
 *  the animal's own origin, and a GLB load failure only ever falls back to
 *  `createItemMesh`'s procedural stand-in (never affects pack truth).
 */
export type SaddlebagsPlacement = {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
}

/** Placeholder transforms (identity) — the user tunes these per species
 *  during browser verification (plan fauna-039 §8). */
export const SADDLEBAGS_PLACEMENT: Partial<Record<AnimalKind, SaddlebagsPlacement>> = {
  horse: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  donkey: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
}

/** Builds one attached-to-animal saddlebags visual, synchronously (same
 *  "GLB clone or procedural fallback" contract as every other
 *  `createItemMesh` caller — never a second loader/cache path). Caller
 *  (`AnimalAgent`) owns adding it to `mesh` and removing it again. */
export function createSaddlebagsAttachment(kind: AnimalKind): Object3D {
  const mesh = createItemMesh('saddlebags')
  const placement = SADDLEBAGS_PLACEMENT[kind]
  if (placement) {
    mesh.position.set(...placement.position)
    mesh.rotation.set(...placement.rotation)
    mesh.scale.set(...placement.scale)
  }
  return mesh
}

export function disposeSaddlebagsAttachment(mesh: Object3D): void {
  mesh.removeFromParent()
  disposeObject3D(mesh)
}
