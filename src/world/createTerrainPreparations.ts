import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { ChunkManager } from '../terrain/chunkManager'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import {
  type CompletedTerrainPreparation,
  completedTerrainPreparationFrom,
  progressiveHeights,
  type TerrainPreparationRecord,
} from '../terrain/terrainPreparation'
import { createTerrainPreparationMarker } from './terrainPreparationProp'

export type TerrainPreparationEntry = TerrainPreparationRecord & { mesh: Object3D }

export type TerrainPreparations = {
  list: () => readonly TerrainPreparationEntry[]
  nodes: () => readonly TerrainPreparationRecord[]
  /** Compact completed-area facts (plan world-019) — persisted independently
   *  of active construction records. */
  completed: () => readonly CompletedTerrainPreparation[]
  find: (id: string) => TerrainPreparationEntry | undefined
  /** Registers a confirmed preparation's marker + seeds its exact-height
   *  terrain overlay (plan §4/§8) — the caller has already validated and
   *  computed the full record. */
  place: (record: TerrainPreparationRecord) => TerrainPreparationEntry
  /** Sets absolute `completedWork` and pushes the matching progressive
   *  heights into `chunkManager` in the same step (plan npc-018 §15 folded
   *  this in — every caller immediately re-derived and pushed heights
   *  anyway, so this is no longer split across two calls). Reaching
   *  `requiredWork` finalizes the single completion transition. */
  setCompletedWork: (id: string, completedWork: number) => boolean
  /** Actor-neutral work contribution (plan npc-018 §15) — clamps `workAmount`
   *  to the target's actual remaining work, applies it through
   *  `setCompletedWork`, and reports what was actually accepted plus whether
   *  this call finished the preparation. `null` if `id` is unknown. A later
   *  contribution against an already-completed id reports `completed: true`
   *  with zero accepted work rather than `null`, so concurrent final
   *  contributions cannot double-complete or look like invalidation. The
   *  caller (a Work Contract's NPC execution) credits only the returned
   *  `acceptedWork`, never the requested amount. */
  contributeWork: (id: string, workAmount: number) => { acceptedWork: number, completed: boolean } | null
  /** True once `id` has reached `requiredWork`, even after its active record
   *  was removed (plan npc-018 §16) — the only way to distinguish
   *  "completed, so no longer active" from "invalidated/never existed" once
   *  `find(id)` returns `undefined`. Seeded from persisted completed-area
   *  facts on load (plan world-019). */
  wasCompleted: (id: string) => boolean
  /** Removes the marker (abandonment of still-active work) — does
   *  *not* touch the terrain heights already written into `chunkManager`,
   *  and does not create a completed-area record. Completion goes through
   *  `contributeWork` / `setCompletedWork` instead. */
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
  initialCompleted: readonly CompletedTerrainPreparation[] = [],
): TerrainPreparations {
  const entries: TerrainPreparationEntry[] = []
  const completedAreas: CompletedTerrainPreparation[] = initialCompleted.map((record) => (
    completedTerrainPreparationFrom(record)
  ))
  const completedIds = new Set(completedAreas.map((record) => record.id))

  const unspawn = (entry: TerrainPreparationEntry): void => {
    const index = entries.indexOf(entry)
    if (index < 0) return
    entries.splice(index, 1)
    disposeObject3D(entry.mesh)
    entry.mesh.removeFromParent()
  }

  const finalizeCompletion = (entry: TerrainPreparationEntry): void => {
    if (!completedIds.has(entry.id)) {
      completedAreas.push(completedTerrainPreparationFrom(entry))
      completedIds.add(entry.id)
    }
    unspawn(entry)
  }

  const applyProgress = (entry: TerrainPreparationEntry, completedWork: number): void => {
    entry.completedWork = Math.max(0, completedWork)
    const progress = entry.requiredWork > 0 ? entry.completedWork / entry.requiredWork : 1
    chunkManager.applyExactHeights(entry.id, progressiveHeights(entry.originalHeights, entry.targetHeight, progress))
    if (entry.completedWork >= entry.requiredWork) finalizeCompletion(entry)
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
    completed: () => completedAreas.map((record) => completedTerrainPreparationFrom(record)),
    find,
    place: (record) => spawn(record),
    setCompletedWork(id, completedWork) {
      const entry = find(id)
      if (!entry) return completedIds.has(id)
      applyProgress(entry, completedWork)
      return true
    },
    contributeWork(id, workAmount) {
      const entry = find(id)
      if (!entry) return completedIds.has(id) ? { acceptedWork: 0, completed: true } : null
      const remaining = Math.max(0, entry.requiredWork - entry.completedWork)
      const acceptedWork = Math.max(0, Math.min(workAmount, remaining))
      if (acceptedWork > 0 || entry.completedWork >= entry.requiredWork) {
        applyProgress(entry, entry.completedWork + acceptedWork)
      }
      return { acceptedWork, completed: completedIds.has(id) }
    },
    wasCompleted: (id) => completedIds.has(id),
    remove(id) {
      const entry = find(id)
      if (!entry) return false
      unspawn(entry)
      return true
    },
    dispose() {
      for (const entry of [...entries]) unspawn(entry)
      completedAreas.length = 0
      completedIds.clear()
    },
  }
}
