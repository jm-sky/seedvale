import { type Object3D, type Scene, Vector3 } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { createCampfire, createCampfireFlame, createSimpleFireBase, placeOnGround } from './props'
import { createVillageFire, type VillageFire } from './VillageFire'

/** `'pit'` — built from 4x stone (`createCampfire`'s stone-ring look), same
 *  fuel-per-branch as a settlement fire (longer burn). `'simple'` — built
 *  directly from 2x branch (`createSimpleFireBase`, no stone ring), shorter
 *  burn. See `docs/plans/2026-08-09--050`. */
export type PlacedFireKind = 'simple' | 'pit'

/** Seconds of burn time one branch adds for a `kind: 'simple'` fire — shorter
 *  than a fire pit's default (`VillageFire.ts`'s `FUEL_PER_BRANCH`, 75s),
 *  reflecting that it's just a bare pile of branches, no stone ring to bank
 *  the heat. */
const SIMPLE_FIRE_FUEL_PER_BRANCH = 40

/** Persisted shape — positions aren't derivable from the seed (player chose
 *  them), so the full record round-trips through the save, same as
 *  `items/createDroppedItems.ts`'s `DroppedItem`. Lit/fuel state is *not*
 *  persisted (consistent with settlement campfires, see plans/2026-08-08--038
 *  "Poza zakresu") — every placed fire loads unlit, ready to relight. */
export type PlacedFire = { id: string, x: number, z: number, kind: PlacedFireKind }

export type PlacedFireEntry = PlacedFire & { fire: VillageFire }

export type PlacedFires = {
  list: () => readonly PlacedFireEntry[]
  nodes: () => readonly PlacedFire[]
  /** Places a new fire at (x, z). A `'simple'` fire starts already lit (its
   *  2-branch build cost doubles as its starting fuel, see
   *  `app/createApp.ts`'s `buildSimpleFire`) — a `'pit'` starts cold, lit
   *  later via the generic `[E]` campfire interaction. */
  place: (x: number, z: number, kind: PlacedFireKind) => void
  update: (dt: number) => void
  dispose: () => void
}

let nextFireId = 0

/**
 * Player-built campfires — the freeform counterpart to a settlement's own
 * fixed campfire (`VillageFire.ts`/`props.ts`'s `buildSettlementProps`,
 * MD/LG villages only). Built from the pause menu/quick actions (see
 * `app/createApp.ts`) for a branch or stone cost, placed wherever the player
 * is standing. Reuses the same state machine (`createVillageFire`) as
 * settlement fires — lighting/refueling via `[E]` is handled by the existing
 * generic `campfire` `Interactable` case, no new interaction code needed.
 */
export function createPlacedFires(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly PlacedFire[] = [],
): PlacedFires {
  const fires: PlacedFireEntry[] = []
  const meshes = new Map<string, Object3D>()

  const spawn = (pf: PlacedFire): void => {
    const group = pf.kind === 'simple' ? createSimpleFireBase() : createCampfire()
    placeOnGround(group, pf.x, pf.z, sampleHeight)
    const flame = createCampfireFlame()
    group.add(flame)
    scene.add(group)
    meshes.set(pf.id, group)
    const fuelPerBranch = pf.kind === 'simple' ? SIMPLE_FIRE_FUEL_PER_BRANCH : undefined
    fires.push({ ...pf, fire: createVillageFire(new Vector3(pf.x, sampleHeight(pf.x, pf.z), pf.z), flame, fuelPerBranch) })
  }

  for (const pf of initial) spawn(pf)

  return {
    list: () => fires,
    nodes: () => fires.map(({ id, x, z, kind }) => ({ id, x, z, kind })),
    place(x, z, kind) {
      spawn({ id: `fire:${Date.now()}:${nextFireId++}`, x, z, kind })
      if (kind === 'simple') {
        // Both consumed branches count toward starting fuel — the build
        // action already took 2 from the inventory (`app/createApp.ts`).
        const entry = fires[fires.length - 1]!
        entry.fire.light()
        entry.fire.addFuel()
      }
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
