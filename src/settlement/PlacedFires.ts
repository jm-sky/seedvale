import { type Object3D, type Scene, Vector3 } from 'three'
import type { PlayAt } from '../audio/createWorldAudio'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { playActionFireExtinguish, playActionFireIgnite } from '../audio/fireSounds'
import { createLitCampfireVisual, placeOnGround, preloadCampfireTemplates } from './props'
import { createVillageFire, type VillageFire } from './VillageFire'

/** `'pit'` — built from 4x stone (`createCampfireBody('pit')` stone ring), same
 *  fuel-per-branch as a settlement fire (longer burn). `'simple'` — built
 *  directly from 2x branch (`createCampfireBody('simple')`, wood only), shorter
 *  burn. See `docs/plans/archive/2026-08-09--050`. */
export type PlacedFireKind = 'simple' | 'pit'

/** Seconds of burn time one branch adds for a `kind: 'simple'` fire — shorter
 *  than a fire pit's default (`VillageFire.ts`'s `FUEL_PER_BRANCH`, 75s),
 *  reflecting that it's just a bare pile of branches, no stone ring to bank
 *  the heat. */
const SIMPLE_FIRE_FUEL_PER_BRANCH = 40

/** Real seconds a burnt-out `'simple'` fire's ash/branches linger before
 *  despawning — a bare pile of branches doesn't stick around like a built
 *  stone ring does. */
const SIMPLE_FIRE_DESPAWN_DELAY = 60 * 60

/** Real seconds a burnt-out `'pit'` fire's stone ring lingers before
 *  despawning — much longer than `'simple'`, it's a built structure worth
 *  keeping around to relight rather than instant clutter cleanup. */
const PIT_FIRE_DESPAWN_DELAY = 7 * 24 * 60 * 60

/** Habitat-destroy spectacle (plan 137) — not a player camp. After the ~5 min
 *  burn, drop the ring quickly so the cave/thicket keeps its own `[E]` and
 *  does not become "Zapal ognisko w palenisku". */
export const HABITAT_BURN_DESPAWN_DELAY = 8

export type PlaceFireOpts = { habitatBurn?: boolean }

const despawnDelayFor = (entry: PlacedFireEntry): number => {
  if (entry.habitatBurn) return HABITAT_BURN_DESPAWN_DELAY
  return entry.kind === 'simple' ? SIMPLE_FIRE_DESPAWN_DELAY : PIT_FIRE_DESPAWN_DELAY
}

/** Player-built camps are `[E]`-lit and saved. Habitat-destroy fires are not. */
export function isPlayerPlacedFire(entry: { habitatBurn: boolean }): boolean {
  return !entry.habitatBurn
}

/** Persisted shape — positions aren't derivable from the seed (player chose
 *  them), so the full record round-trips through the save, same as
 *  `items/createDroppedItems.ts`'s `DroppedItem`. Lit/fuel state is *not*
 *  persisted (consistent with settlement campfires, see plans/archive/2026-08-08--038
 *  "Poza zakresu") — every placed fire loads unlit, ready to relight, so the
 *  despawn-after-burnout countdown below (`unlitSeconds`) restarts too. */
export type PlacedFire = { id: string, x: number, z: number, kind: PlacedFireKind }

export type PlacedFireEntry = {
  fire: VillageFire
  /** Set once `fire` is observed lit — a `'pit'` placed cold and never yet
   *  lit shouldn't start counting down to despawn. */
  everLit: boolean
  /** Seconds since `fire` was last seen lit; only advances once `everLit`.
   *  Reset to 0 whenever the fire is lit or refueled. */
  unlitSeconds: number
  /** Plan 137 habitat destroy — visual burn only, not a relightable camp. */
  habitatBurn: boolean
} & PlacedFire

export type PlacedFires = {
  list: () => readonly PlacedFireEntry[]
  nodes: () => readonly PlacedFire[]
  /** Places a new fire at (x, z) and returns the live entry. A `'simple'`
   *  fire starts already lit (its 2-branch build cost doubles as its starting
   *  fuel, see `app/createApp.ts`'s `buildSimpleFire`) — a `'pit'` starts
   *  cold unless the caller lights it (plan 137 habitat destroy lights a pit
   *  immediately with the 4 consumed branches as fuel). */
  place: (x: number, z: number, kind: PlacedFireKind, opts?: PlaceFireOpts) => PlacedFireEntry
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
  playAt?: PlayAt,
): PlacedFires {
  const fires: PlacedFireEntry[] = []
  const meshes = new Map<string, Object3D>()

  void preloadCampfireTemplates()

  const spawn = (pf: PlacedFire & { habitatBurn?: boolean }): void => {
    const { group, flame } = createLitCampfireVisual(pf.kind === 'simple' ? 'simple' : 'pit')
    placeOnGround(group, pf.x, pf.z, sampleHeight)
    scene.add(group)
    meshes.set(pf.id, group)
    const fuelPerBranch = pf.kind === 'simple' ? SIMPLE_FIRE_FUEL_PER_BRANCH : undefined
    fires.push({
      ...pf,
      habitatBurn: pf.habitatBurn === true,
      fire: createVillageFire(
        new Vector3(pf.x, sampleHeight(pf.x, pf.z), pf.z),
        flame,
        fuelPerBranch,
        playAt
          ? {
            onLight: (pos, source) => { if (source === 'player') playActionFireIgnite(playAt, pos) },
            onExtinguish: (pos) => playActionFireExtinguish(playAt, pos),
          }
          : undefined,
      ),
      everLit: false,
      unlitSeconds: 0,
    })
  }

  const despawn = (id: string): void => {
    const mesh = meshes.get(id)
    if (mesh) {
      mesh.removeFromParent()
      disposeObject3D(mesh)
      meshes.delete(id)
    }
    const index = fires.findIndex((entry) => entry.id === id)
    if (index !== -1) fires.splice(index, 1)
  }

  for (const pf of initial) spawn(pf)

  return {
    list: () => fires,
    nodes: () => fires
      .filter(isPlayerPlacedFire)
      .map(({ id, x, z, kind }) => ({ id, x, z, kind })),
    place(x, z, kind, opts) {
      spawn({
        id: `fire:${Date.now()}:${nextFireId++}`,
        x,
        z,
        kind,
        habitatBurn: opts?.habitatBurn === true,
      })
      const entry = fires[fires.length - 1]!
      if (kind === 'simple') {
        // Both consumed branches count toward starting fuel — the build
        // action already took 2 from the inventory (`app/createApp.ts`).
        entry.fire.light()
        entry.fire.addFuel()
      }
      return entry
    },
    update(dt) {
      // Snapshot first — `despawn` splices `fires`, which would skip the
      // next entry if we walked the live array while removing from it.
      for (const entry of [...fires]) {
        entry.fire.update(dt)
        if (entry.fire.isLit()) {
          entry.everLit = true
          entry.unlitSeconds = 0
          continue
        }
        if (!entry.everLit) continue
        entry.unlitSeconds += dt
        if (entry.unlitSeconds >= despawnDelayFor(entry)) despawn(entry.id)
      }
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
