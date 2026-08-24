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
  /** Pure bookkeeping — never changes the mesh/marker. The caller is
   *  responsible for pushing the matching progressive heights into
   *  `chunkManager` itself (`app/actions/terrainPreparationActions.ts`
   *  ticks both together every frame). */
  setCompletedWork: (id: string, completedWork: number) => boolean
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
 * shows the preparation's current progress immediately.
 */
export function createTerrainPreparations(
  scene: Scene,
  chunkManager: ChunkManager,
  sampleHeight: HeightSampler,
  initial: readonly TerrainPreparationRecord[] = [],
): TerrainPreparations {
  const entries: TerrainPreparationEntry[] = []

  const spawn = (record: TerrainPreparationRecord): TerrainPreparationEntry => {
    const mesh = createTerrainPreparationMarker()
    placeOnGround(mesh, record.center.x, record.center.z, sampleHeight)
    scene.add(mesh)
    const entry: TerrainPreparationEntry = { ...record, mesh }
    entries.push(entry)
    return entry
  }

  for (const record of initial) {
    spawn(record)
    const progress = record.requiredWork > 0 ? record.completedWork / record.requiredWork : 1
    chunkManager.applyExactHeights(record.id, progressiveHeights(record.originalHeights, record.targetHeight, progress))
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
      entry.completedWork = Math.max(0, completedWork)
      return true
    },
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
