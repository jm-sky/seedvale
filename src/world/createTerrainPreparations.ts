import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { ChunkManager } from '../terrain/chunkManager'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { progressiveHeights, type TerrainPreparationRecord } from '../terrain/terrainPreparation'
import { createTerrainPreparationMarker } from './terrainPreparationProp'

export type TerrainPreparationEntry = TerrainPreparationRecord & { mesh: Object3D }

export type TerrainPreparations = {
  list: () => readonly TerrainPreparationEntry[]
  nodes: () => readonly TerrainPreparationRecord[]
  find: (id: string) => TerrainPreparationEntry | undefined
  /** Registers a confirmed preparation's marker + seeds its exact-height
   *  terrain overlay (plan §4/§8) — the caller has already validated and
   *  computed the full record. */
  place: (record: TerrainPreparationRecord) => TerrainPreparationEntry
  /** Sets absolute `completedWork` and pushes the matching progressive
   *  heights into `chunkManager` in the same step (plan npc-018 §15 folded
   *  this in — every caller immediately re-derived and pushed heights
   *  anyway, so this is no longer split across two calls). Never changes
   *  the mesh/marker. */
  setCompletedWork: (id: string, completedWork: number) => boolean
  /** Actor-neutral work contribution (plan npc-018 §15) — clamps `workAmount`
   *  to the target's actual remaining work, applies it through
   *  `setCompletedWork`, and reports what was actually accepted plus whether
   *  this call finished the preparation. `null` if `id` is unknown. The
   *  caller (a Work Contract's NPC execution) credits only the returned
   *  `acceptedWork`, never the requested amount. */
  contributeWork: (id: string, workAmount: number) => { acceptedWork: number, completed: boolean } | null
  /** True once `id` has reached `requiredWork`, even after its record was
   *  since removed (plan npc-018 §16) — the only way to distinguish
   *  "completed, so no longer active" from "invalidated/never existed" once
   *  `find(id)` returns `undefined`. Session-lifetime only, never persisted:
   *  a save only ever contains still-active preparations. */
  wasCompleted: (id: string) => boolean
  /** Removes the marker (completion or, in principle, abandonment) — does
   *  *not* touch the terrain heights already written into `chunkManager`;
   *  the caller decides whether to bake final heights first. */
  remove: (id: string) => boolean
  dispose: () => void
}

/**
 * Runtime store for active terrain-preparation work sites (plan
 * `world-terrain-002` §4/§8) — same "player chose the spot, whole record
 * round-trips through the save" shape as `PlayerWells`/`PlacedTraps`. Owns
 * only the temporary marker prop; the terrain shaping itself lives in
 * `ChunkManager`'s own exact-height overlay (`applyExactHeights`), reapplied
 * here on construction so a chunk that streams in later (or a restored save)
 * shows the preparation's current progress immediately. `contributeWork` is
 * the actor-neutral seam (plan npc-018 §15) an NPC's Work Contract execution
 * shares with the player's own progress push — both ultimately route through
 * `applyProgress` so `completedWork`/heights/`wasCompleted` can never drift
 * between the two callers.
 */
export function createTerrainPreparations(
  scene: Scene,
  chunkManager: ChunkManager,
  sampleHeight: HeightSampler,
  initial: readonly TerrainPreparationRecord[] = [],
): TerrainPreparations {
  const entries: TerrainPreparationEntry[] = []
  const completedIds = new Set<string>()

  const applyProgress = (entry: TerrainPreparationEntry, completedWork: number): void => {
    entry.completedWork = Math.max(0, completedWork)
    const progress = entry.requiredWork > 0 ? entry.completedWork / entry.requiredWork : 1
    chunkManager.applyExactHeights(entry.id, progressiveHeights(entry.originalHeights, entry.targetHeight, progress))
    if (entry.completedWork >= entry.requiredWork) completedIds.add(entry.id)
  }

  const spawn = (record: TerrainPreparationRecord): TerrainPreparationEntry => {
    const mesh = createTerrainPreparationMarker()
    placeOnGround(mesh, record.center.x, record.center.z, sampleHeight)
    scene.add(mesh)
    const entry: TerrainPreparationEntry = { ...record, mesh }
    entries.push(entry)
    return entry
  }

  for (const record of initial) {
    applyProgress(spawn(record), record.completedWork)
  }

  const find = (id: string): TerrainPreparationEntry | undefined => entries.find((e) => e.id === id)

  const toRecord = (entry: TerrainPreparationEntry): TerrainPreparationRecord => ({
    id: entry.id,
    center: entry.center,
    size: entry.size,
    targetHeight: entry.targetHeight,
    originalHeights: entry.originalHeights,
    requiredWork: entry.requiredWork,
    completedWork: entry.completedWork,
    status: entry.status,
  })

  return {
    list: () => entries,
    nodes: () => entries.map(toRecord),
    find,
    place: (record) => spawn(record),
    setCompletedWork(id, completedWork) {
      const entry = find(id)
      if (!entry) return false
      applyProgress(entry, completedWork)
      return true
    },
    contributeWork(id, workAmount) {
      const entry = find(id)
      if (!entry) return null
      const remaining = Math.max(0, entry.requiredWork - entry.completedWork)
      const acceptedWork = Math.max(0, Math.min(workAmount, remaining))
      if (acceptedWork > 0) applyProgress(entry, entry.completedWork + acceptedWork)
      return { acceptedWork, completed: entry.completedWork >= entry.requiredWork }
    },
    wasCompleted: (id) => completedIds.has(id),
    remove(id) {
      const index = entries.findIndex((e) => e.id === id)
      if (index < 0) return false
      const [entry] = entries.splice(index, 1)
      disposeObject3D(entry.mesh)
      entry.mesh.removeFromParent()
      return true
    },
    dispose() {
      for (const entry of entries) {
        disposeObject3D(entry.mesh)
        entry.mesh.removeFromParent()
      }
      entries.length = 0
    },
  }
}
