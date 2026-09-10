/** Plan world-terrain-008 B4.1 — presentation relevance/lifecycle seam.
 *  Gameplay/spatial truth is *not* owned here: a cave can stay queryable
 *  while presentation is inactive, queued or building. Collider
 *  registration is relevance-scoped and independent of mesh completion.
 *
 * @domain world-terrain
 */

export const CAVE_ACTIVATE_DISTANCE = 55
export const CAVE_DEACTIVATE_DISTANCE = 80

export type CavePresentationPhase = 'inactive' | 'queued' | 'building' | 'active'

export type CaveStreamingSnapshot = {
  phase: CavePresentationPhase
  generation: number
  collidersRegistered: boolean
  wanted: boolean
}

export type CaveStreamingStats = {
  wanted: number
  activePresentations: number
  queued: number
  building: number
  registeredColliders: number
}

export type CaveStreamingHooks = {
  registerColliders: (caveId: string) => void
  clearColliders: (caveId: string) => void
  requestPresentation: (caveId: string, generation: number, distance: number) => void
  reprioritisePresentation: (caveId: string, distance: number) => void
  cancelPresentation: (caveId: string) => void
  disposePresentation: (caveId: string) => void
}

/**
 * 55/80 m hysteresis: at or inside activate distance the cave is wanted;
 * at or beyond deactivate distance it is not; between those thresholds the
 * current relevance is retained so a boundary walk does not thrash.
 */
export function caveWantedAtDistance(distance: number, currentlyWanted: boolean): boolean {
  if (distance <= CAVE_ACTIVATE_DISTANCE) return true
  if (distance >= CAVE_DEACTIVATE_DISTANCE) return false
  return currentlyWanted
}

type Record = {
  phase: CavePresentationPhase
  generation: number
  collidersRegistered: boolean
  failed: boolean
}

/**
 * Owns presentation phase + generation identity + collider-registration
 * flags for the cave runtime. Does not own topology/SDF/queries.
 *
 * @domain world-terrain
 */
export function createCaveStreamingController(hooks: CaveStreamingHooks) {
  const records = new Map<string, Record>()
  const wanted = new Set<string>()

  function recordOf(caveId: string): Record {
    let rec = records.get(caveId)
    if (!rec) {
      rec = { phase: 'inactive', generation: 0, collidersRegistered: false, failed: false }
      records.set(caveId, rec)
    }
    return rec
  }

  function drop(caveId: string): void {
    const rec = recordOf(caveId)
    wanted.delete(caveId)
    rec.failed = false
    if (rec.collidersRegistered) {
      hooks.clearColliders(caveId)
      rec.collidersRegistered = false
    }
    if (rec.phase !== 'inactive') {
      rec.generation += 1
      rec.phase = 'inactive'
      hooks.cancelPresentation(caveId)
      hooks.disposePresentation(caveId)
    }
  }

  function apply(caveId: string, distance: number): void {
    const rec = recordOf(caveId)
    const isWanted = caveWantedAtDistance(distance, wanted.has(caveId))
    if (!isWanted) {
      drop(caveId)
      return
    }
    wanted.add(caveId)
    if (!rec.collidersRegistered) {
      hooks.registerColliders(caveId)
      rec.collidersRegistered = true
    }
    if (rec.phase === 'inactive') {
      if (rec.failed) return
      rec.phase = 'queued'
      hooks.requestPresentation(caveId, rec.generation, distance)
      return
    }
    if (rec.phase === 'queued') hooks.reprioritisePresentation(caveId, distance)
  }

  function markBuilding(caveId: string, generation: number): boolean {
    const rec = records.get(caveId)
    if (!rec || rec.generation !== generation) return false
    if (rec.phase !== 'queued') return false
    rec.phase = 'building'
    return true
  }

  function accept(caveId: string, generation: number): boolean {
    const rec = records.get(caveId)
    if (!rec || rec.generation !== generation) return false
    if (rec.phase !== 'building' && rec.phase !== 'queued') return false
    rec.phase = 'active'
    rec.failed = false
    return true
  }

  function fail(caveId: string, generation: number): void {
    const rec = records.get(caveId)
    if (!rec || rec.generation !== generation) return
    if (rec.phase !== 'queued' && rec.phase !== 'building') return
    rec.phase = 'inactive'
    rec.failed = true
  }

  function snapshot(caveId: string): CaveStreamingSnapshot | null {
    const rec = records.get(caveId)
    if (!rec) return null
    return {
      phase: rec.phase,
      generation: rec.generation,
      collidersRegistered: rec.collidersRegistered,
      wanted: wanted.has(caveId),
    }
  }

  function stats(): CaveStreamingStats {
    let activePresentations = 0
    let queued = 0
    let building = 0
    let registeredColliders = 0
    for (const rec of records.values()) {
      if (rec.phase === 'active') activePresentations++
      else if (rec.phase === 'queued') queued++
      else if (rec.phase === 'building') building++
      if (rec.collidersRegistered) registeredColliders++
    }
    return {
      wanted: wanted.size,
      activePresentations,
      queued,
      building,
      registeredColliders,
    }
  }

  function trackedIds(): string[] {
    const ids: string[] = []
    for (const [id, rec] of records) {
      if (wanted.has(id) || rec.phase !== 'inactive' || rec.collidersRegistered) ids.push(id)
    }
    return ids
  }

  function dispose(): void {
    for (const caveId of [...records.keys()]) drop(caveId)
    records.clear()
    wanted.clear()
  }

  return { apply, drop, markBuilding, accept, fail, snapshot, stats, trackedIds, dispose }
}
