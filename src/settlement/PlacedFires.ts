import { type Object3D, type Scene, Vector3 } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { createCampfire, createCampfireFlame, placeOnGround } from './props'
import { createVillageFire, type VillageFire } from './VillageFire'

/** Persisted shape — positions aren't derivable from the seed (player chose
 *  them), so the full record round-trips through the save, same as
 *  `items/createDroppedItems.ts`'s `DroppedItem`. Lit/fuel state is *not*
 *  persisted (consistent with settlement campfires, see plans/2026-08-08--038
 *  "Poza zakresu") — every placed fire loads unlit, ready to relight. */
export type PlacedFire = { id: string, x: number, z: number }

export type PlacedFireEntry = PlacedFire & { fire: VillageFire }

export type PlacedFires = {
  list: () => readonly PlacedFireEntry[]
  nodes: () => readonly PlacedFire[]
  place: (x: number, z: number) => void
  update: (dt: number) => void
  dispose: () => void
}

let nextFireId = 0

/**
 * Player-built campfires — the freeform counterpart to a settlement's own
 * fixed campfire (`VillageFire.ts`/`props.ts`'s `buildSettlementProps`,
 * MD/LG villages only). Built from the pause menu ("Zbuduj ognisko", see
 * `app/createApp.ts`) for a branch+stone cost, placed wherever the player is
 * standing. Reuses the same visual (`createCampfire`/`createCampfireFlame`)
 * and state machine (`createVillageFire`) as settlement fires — lighting/
 * refueling via `[E]` is handled by the existing generic `campfire`
 * `Interactable` case, no new interaction code needed.
 */
export function createPlacedFires(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly PlacedFire[] = [],
): PlacedFires {
  const fires: PlacedFireEntry[] = []
  const meshes = new Map<string, Object3D>()

  const spawn = (pf: PlacedFire): void => {
    const group = createCampfire()
    placeOnGround(group, pf.x, pf.z, sampleHeight)
    const flame = createCampfireFlame()
    group.add(flame)
    scene.add(group)
    meshes.set(pf.id, group)
    fires.push({ ...pf, fire: createVillageFire(new Vector3(pf.x, sampleHeight(pf.x, pf.z), pf.z), flame) })
  }

  for (const pf of initial) spawn(pf)

  return {
    list: () => fires,
    nodes: () => fires.map(({ id, x, z }) => ({ id, x, z })),
    place(x, z) {
      spawn({ id: `fire:${Date.now()}:${nextFireId++}`, x, z })
    },
    update(dt) {
      for (const entry of fires) entry.fire.update(dt)
    },
    dispose() {
      for (const mesh of meshes.values()) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }
      meshes.clear()
      fires.length = 0
    },
  }
}
