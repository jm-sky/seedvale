/** Plan world-terrain-008 B4.1 — presentation relevance/lifecycle seam.
 *  Gameplay/spatial truth is *not* owned here: a cave can stay queryable
 *  while presentation is inactive, queued or building. Since
 *  world-terrain-019 there is nothing else to register on relevance —
 *  cave containment is a heightfield query, not a collider set.
 *
 * @domain world-terrain
 */

export const CAVE_ACTIVATE_DISTANCE = 55
export const CAVE_DEACTIVATE_DISTANCE = 80

export type CavePresentationPhase = 'inactive' | 'queued' | 'building' | 'active'

export type CaveStreamingSnapshot = {
  phase: CavePresentationPhase
  generation: number
  wanted: boolean
}

export type CaveStreamingStats = {
  wanted: number
  activePresentations: number
  queued: number
  building: number
}

export type CaveStreamingHooks = {
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
  failed: boolean
}

/**
 * Owns presentation phase + generation identity for the cave runtime. Does
 * not own topology / heightfield / queries.
 *
 * @domain world-terrain
 */
export function createCaveStreamingController(hooks: CaveStreamingHooks) {
  const records = new Map<string, Record>()
  const wanted = new Set<string>()

  function recordOf(caveId: string): Record {
    let rec = records.get(caveId)
    if (!rec) {
      rec = { phase: 'inactive', generation: 0, failed: false }
      records.set(caveId, rec)
    }
    return rec
  }

  function drop(caveId: string): void {
    const rec = recordOf(caveId)
    wanted.delete(caveId)
    rec.failed = false
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
      wanted: wanted.has(caveId),
    }
  }

  function stats(): CaveStreamingStats {
    let activePresentations = 0
    let queued = 0
    let building = 0
    for (const rec of records.values()) {
      if (rec.phase === 'active') activePresentations++
      else if (rec.phase === 'queued') queued++
      else if (rec.phase === 'building') building++
    }
    return {
      wanted: wanted.size,
      activePresentations,
      queued,
      building,
    }
  }

  function trackedIds(): string[] {
    const ids: string[] = []
    for (const [id, rec] of records) {
      if (wanted.has(id) || rec.phase !== 'inactive') ids.push(id)
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

// ── Main-thread presentation build queue (world-terrain-019 B) ──────────────

export type CavePresentationQueue = {
  /** Queue (or re-queue with a new generation) one cave's build. */
  request: (caveId: string, generation: number, distance: number) => void
  reprioritise: (caveId: string, distance: number) => void
  cancel: (caveId: string) => void
  /** Runs up to `maxJobs` pending builds, nearest first. Returns how many
   *  ran. Call once per frame from the cave update. */
  drain: (maxJobs?: number) => number
  readonly queuedCount: number
  clear: () => void
}

/**
 * Nearest-first queue of pending *synchronous* presentation builds. The
 * heightfield mesh is cheap enough to assemble on the main thread, so no
 * worker/protocol is involved; the queue only spreads several simultaneous
 * activations over successive frames (hitch control) while keeping the
 * request / reprioritise / cancel / generation semantics the streaming
 * controller expects. A cancelled or re-requested cave never runs its stale
 * generation — `build` receives the generation the request carried and the
 * controller's `markBuilding` / `accept` reject anything stale.
 *
 * @domain world-terrain
 */
export function createCavePresentationQueue(
  build: (caveId: string, generation: number) => void,
): CavePresentationQueue {
  const pending = new Map<string, { generation: number, distance: number }>()

  function drain(maxJobs = 1): number {
    let ran = 0
    while (ran < maxJobs && pending.size > 0) {
      let bestId: string | null = null
      let bestDistance = Infinity
      for (const [caveId, job] of pending) {
        if (bestId === null || job.distance < bestDistance) {
          bestDistance = job.distance
          bestId = caveId
        }
      }
      if (bestId === null) break
      const job = pending.get(bestId)!
      pending.delete(bestId)
      build(bestId, job.generation)
      ran++
    }
    return ran
  }

  return {
    request(caveId, generation, distance) {
      pending.set(caveId, { generation, distance })
    },
    reprioritise(caveId, distance) {
      const job = pending.get(caveId)
      if (job) job.distance = distance
    },
    cancel(caveId) {
      pending.delete(caveId)
    },
    drain,
    get queuedCount() {
      return pending.size
    },
    clear() {
      pending.clear()
    },
  }
}
