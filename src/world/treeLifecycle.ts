import type { ItemKind } from '../items/items'
import type { BiomeWeights } from '../terrain/biomeRegions'

/** Explicit lifecycle stages — not inferred from model scale. */
export type TreeGrowthStage = 'sapling' | 'young' | 'mature' | 'harvested'

export type TreeId = string

/** Sparse runtime override — only trees that diverge from procedural default
 *  + lazy world-time growth (typically harvested / mid-regrowth). */
export type TreeStateOverride = {
  stage: TreeGrowthStage
  /** `DayNightState.elapsedDays` when this stage began. */
  stageStartedAt: number
}

export type TreeEnvSample = {
  biome: BiomeWeights
  /** Fine local moisture (`tile.biomes` / `sampleBiome`), 0..1. */
  moisture: number
  /** Altitude fraction of heightScale above water, 0..1+. */
  altitude01: number
  /** Mountain ridge strength, 0..1. */
  mountainRidge: number
  /** Reserved for plan 040 — ignored in v1 when undefined. */
  season?: number
  /** Reserved for future groundwater — ignored in v1 when undefined. */
  groundwater?: number
}

/** Species preference weights (data-driven; index aligns with `TREE_SPECS`). */
export type TreeSpeciesPrefs = {
  desert: number
  swamp: number
  forest: number
  /** How well the species tolerates ridge/highland (1 = fine, 0 = hates it). */
  mountain: number
}

/** Ideal game-days per stage at growthRate = 1. */
export const STAGE_DURATION_DAYS: Record<Exclude<TreeGrowthStage, 'mature'>, number> = {
  sapling: 0.5,
  young: 1.0,
  /** Stump / dead wood before sapling regrowth. */
  harvested: 0.75,
}

/** Visual scale multipliers relative to the placement's mature base scale. */
export const STAGE_SCALE_MULT: Record<TreeGrowthStage, number> = {
  sapling: 0.35,
  young: 0.62,
  mature: 1,
  harvested: 0.28,
}

const CANOPY_RADIUS = 8
const CANOPY_WEIGHT = 0.35
/** Harvest yield uses the existing resource flow (`branch`) — no parallel `wood`. */
export const HARVEST_YIELD: { kind: ItemKind, count: number } = { kind: 'branch', count: 3 }

/** Default prefs per `TREE_SPECS` index (6 entries). */
export const TREE_SPECIES_PREFS: readonly TreeSpeciesPrefs[] = [
  { desert: 0.25, swamp: 0.55, forest: 1.0, mountain: 0.35 },
  { desert: 0.2, swamp: 0.5, forest: 1.0, mountain: 0.3 },
  { desert: 0.15, swamp: 0.45, forest: 1.0, mountain: 0.25 },
  { desert: 0.2, swamp: 0.4, forest: 0.95, mountain: 0.4 },
  { desert: 0.15, swamp: 0.5, forest: 1.0, mountain: 0.3 },
  { desert: 0.35, swamp: 0.3, forest: 0.65, mountain: 0.45 },
]

export type TreePresence = {
  id: TreeId
  x: number
  z: number
  speciesIndex: number
  /** Procedural default stage at world day 0 (before growth / overrides). */
  initialStage: TreeGrowthStage
  /** Mature visual base scale from placement. */
  baseScale: number
}

export type ResolvedTreeState = {
  id: TreeId
  stage: TreeGrowthStage
  scale: number
  /** When false, renderer should show stump instead of full tree mesh. */
  showCrown: boolean
}

/** Quantize world position so tiny float noise doesn't split ids. */
export function quantizeTreeCoord(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * Stable id from seed + quantized position + species — not Object3D ids or
 * array indexes. Chunk coords are implicit in world position.
 */
export function makeTreeId(
  seed: number,
  x: number,
  z: number,
  speciesIndex: number,
): TreeId {
  const qx = quantizeTreeCoord(x)
  const qz = quantizeTreeCoord(z)
  return `${seed}:${qx}:${qz}:${speciesIndex}`
}

export function speciesPrefs(speciesIndex: number): TreeSpeciesPrefs {
  return TREE_SPECIES_PREFS[speciesIndex] ?? TREE_SPECIES_PREFS[0]!
}

/**
 * Environment multiplies growth rate (does not only gate grow/don't grow).
 * Optional `season` / `groundwater` hooks are reserved for later plans.
 */
export function envGrowthFactor(env: TreeEnvSample, prefs: TreeSpeciesPrefs): number {
  const biomeFactor =
    env.biome.desert * prefs.desert +
    env.biome.swamp * prefs.swamp +
    env.biome.forest * prefs.forest

  const moistureFactor = 0.55 + Math.max(0, Math.min(1, env.moisture)) * 0.45

  // Highlands / ridges slow growth; mountain preference softens the penalty.
  const altitudePenalty =
    env.altitude01 <= 0.35 ? 1 : Math.max(0.15, 1 - (env.altitude01 - 0.35) * 1.4)
  const ridgePenalty = Math.max(0.12, 1 - env.mountainRidge * (1 - prefs.mountain))

  let seasonFactor = 1
  if (typeof env.season === 'number') {
    // Hook only — v1 does not implement seasons (plan 040).
    seasonFactor = 0.75 + 0.5 * Math.max(0, Math.min(1, env.season))
  }

  let groundwaterFactor = 1
  if (typeof env.groundwater === 'number') {
    groundwaterFactor = 0.7 + 0.4 * Math.max(0, Math.min(1, env.groundwater))
  }

  return Math.max(
    0.05,
    Math.min(1.6, biomeFactor * moistureFactor * altitudePenalty * ridgePenalty * seasonFactor * groundwaterFactor),
  )
}

/** Local canopy competition — nearby mature trees reduce sapling/young growth. */
export function canopyGrowthFactor(matureNeighbors: number, stage: TreeGrowthStage): number {
  if (stage === 'mature' || stage === 'harvested') return 1
  return 1 / (1 + Math.max(0, matureNeighbors) * CANOPY_WEIGHT)
}

export function visualScale(baseScale: number, stage: TreeGrowthStage): number {
  return baseScale * STAGE_SCALE_MULT[stage]
}

/**
 * Advance stages from an anchor using elapsed world days and a constant
 * growth rate for the interval. Lazy — no per-frame ticks.
 */
export function advanceStage(
  stage: TreeGrowthStage,
  stageStartedAt: number,
  worldDays: number,
  growthRate: number,
): { stage: TreeGrowthStage, stageStartedAt: number } {
  let current = stage
  let started = stageStartedAt
  const rate = Math.max(0.05, growthRate)

  // Cap iterations so pathological rates can't loop forever.
  for (let i = 0; i < 8; i++) {
    if (current === 'mature') break
    const duration = STAGE_DURATION_DAYS[current as Exclude<TreeGrowthStage, 'mature'>]
    const needed = duration / rate
    if (worldDays < started + needed) break
    started = started + needed
    if (current === 'sapling') current = 'young'
    else if (current === 'young') current = 'mature'
    else if (current === 'harvested') current = 'sapling'
  }
  return { stage: current, stageStartedAt: started }
}

function cellKey(x: number, z: number): string {
  return `${Math.floor(x / CANOPY_RADIUS)}:${Math.floor(z / CANOPY_RADIUS)}`
}

export type TreeLifecycle = {
  makeId: (x: number, z: number, speciesIndex: number) => TreeId
  /** Register a known tree for local canopy / harvest queries (chunk or settlement). */
  registerPresence: (presence: TreePresence) => void
  unregisterPresence: (id: TreeId) => void
  clearPresence: () => void
  resolve: (
    presence: TreePresence,
    env: TreeEnvSample,
    worldDays: number,
  ) => ResolvedTreeState
  /** Authoritative world harvest — shared by NPC and future player (057). */
  harvest: (
    id: TreeId,
    worldDays: number,
    env: TreeEnvSample,
  ) => { ok: true, yield: typeof HARVEST_YIELD } | { ok: false, reason: string }
  findHarvestableNear: (
    x: number,
    z: number,
    radius: number,
    worldDays: number,
    envAt: (x: number, z: number) => TreeEnvSample,
  ) => TreePresence | null
  countMatureNear: (
    x: number,
    z: number,
    excludeId: TreeId | null,
    worldDays: number,
    envAt: (x: number, z: number) => TreeEnvSample,
  ) => number
  getOverride: (id: TreeId) => TreeStateOverride | undefined
  serializeOverrides: () => Record<TreeId, TreeStateOverride>
  replaceOverrides: (overrides: Record<TreeId, TreeStateOverride>) => void
  clearOverrides: () => void
}

export function createTreeLifecycle(
  seed: number,
  initialOverrides: Record<TreeId, TreeStateOverride> = {},
): TreeLifecycle {
  const overrides = new Map<TreeId, TreeStateOverride>(Object.entries(initialOverrides))
  const byId = new Map<TreeId, TreePresence>()
  /** Spatial buckets for local (non-O(n²) global) canopy / harvest queries. */
  const byCell = new Map<string, Set<TreeId>>()

  const makeId = (x: number, z: number, speciesIndex: number) =>
    makeTreeId(seed, x, z, speciesIndex)

  function addToCell(presence: TreePresence): void {
    const key = cellKey(presence.x, presence.z)
    let set = byCell.get(key)
    if (!set) {
      set = new Set()
      byCell.set(key, set)
    }
    set.add(presence.id)
  }

  function removeFromCell(presence: TreePresence): void {
    const key = cellKey(presence.x, presence.z)
    const set = byCell.get(key)
    if (!set) return
    set.delete(presence.id)
    if (set.size === 0) byCell.delete(key)
  }

  function nearbyIds(x: number, z: number, radius: number): TreeId[] {
    const r = Math.ceil(radius / CANOPY_RADIUS)
    const cx = Math.floor(x / CANOPY_RADIUS)
    const cz = Math.floor(z / CANOPY_RADIUS)
    const out: TreeId[] = []
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const set = byCell.get(`${cx + dx}:${cz + dz}`)
        if (!set) continue
        for (const id of set) out.push(id)
      }
    }
    return out
  }

  /** Canopy density uses env-only growth (no nested canopy) to avoid recursion. */
  function isEffectivelyMature(
    presence: TreePresence,
    worldDays: number,
    env: TreeEnvSample,
  ): boolean {
    const prefs = speciesPrefs(presence.speciesIndex)
    const rate = envGrowthFactor(env, prefs)
    const override = overrides.get(presence.id)
    if (override) {
      return advanceStage(override.stage, override.stageStartedAt, worldDays, rate).stage === 'mature'
    }
    return advanceStage(presence.initialStage, 0, worldDays, rate).stage === 'mature'
  }

  function countMatureNearInternal(
    x: number,
    z: number,
    excludeId: TreeId | null,
    worldDays: number,
    envAt: (x: number, z: number) => TreeEnvSample,
  ): number {
    let count = 0
    for (const id of nearbyIds(x, z, CANOPY_RADIUS)) {
      if (excludeId && id === excludeId) continue
      const presence = byId.get(id)
      if (!presence) continue
      if (Math.hypot(presence.x - x, presence.z - z) > CANOPY_RADIUS) continue
      if (isEffectivelyMature(presence, worldDays, envAt(presence.x, presence.z))) count++
    }
    return count
  }

  function resolvePresence(
    presence: TreePresence,
    env: TreeEnvSample,
    worldDays: number,
  ): ResolvedTreeState {
    const prefs = speciesPrefs(presence.speciesIndex)
    const envRate = envGrowthFactor(env, prefs)
    const override = overrides.get(presence.id)
    const lookingStage = override?.stage ?? presence.initialStage

    const matureNeighbors = countMatureNearInternal(
      presence.x,
      presence.z,
      presence.id,
      worldDays,
      () => env,
    )
    const canopy = canopyGrowthFactor(matureNeighbors, lookingStage)
    const growthRate = envRate * canopy

    let stage: TreeGrowthStage
    if (override) {
      const advanced = advanceStage(override.stage, override.stageStartedAt, worldDays, growthRate)
      stage = advanced.stage
      const procedural = advanceStage(presence.initialStage, 0, worldDays, growthRate)
      // Prune sparse override once the tree is mature again and procedural
      // growth would also be mature (harvest scar no longer needed).
      if (stage === 'mature' && procedural.stage === 'mature') {
        overrides.delete(presence.id)
      } else if (stage !== override.stage || advanced.stageStartedAt !== override.stageStartedAt) {
        overrides.set(presence.id, { stage, stageStartedAt: advanced.stageStartedAt })
      }
    } else {
      stage = advanceStage(presence.initialStage, 0, worldDays, growthRate).stage
    }

    return {
      id: presence.id,
      stage,
      scale: visualScale(presence.baseScale, stage),
      showCrown: stage !== 'harvested',
    }
  }

  function registerPresence(presence: TreePresence): void {
    const existing = byId.get(presence.id)
    if (existing) removeFromCell(existing)
    byId.set(presence.id, presence)
    addToCell(presence)
  }

  function unregisterPresence(id: TreeId): void {
    const existing = byId.get(id)
    if (!existing) return
    removeFromCell(existing)
    byId.delete(id)
  }

  return {
    makeId,
    registerPresence,
    unregisterPresence,
    clearPresence() {
      byId.clear()
      byCell.clear()
    },
    resolve: resolvePresence,
    harvest(id, worldDays, env) {
      const presence = byId.get(id)
      if (!presence) return { ok: false, reason: 'unknown-tree' }
      const current = resolvePresence(presence, env, worldDays)
      if (current.stage !== 'mature') return { ok: false, reason: 'not-mature' }
      overrides.set(id, { stage: 'harvested', stageStartedAt: worldDays })
      return { ok: true, yield: { ...HARVEST_YIELD } }
    },
    findHarvestableNear(x, z, radius, worldDays, envAt) {
      let best: TreePresence | null = null
      let bestDist = Infinity
      for (const id of nearbyIds(x, z, radius)) {
        const presence = byId.get(id)
        if (!presence) continue
        const dist = Math.hypot(presence.x - x, presence.z - z)
        if (dist > radius || dist >= bestDist) continue
        const resolved = resolvePresence(presence, envAt(presence.x, presence.z), worldDays)
        if (resolved.stage !== 'mature') continue
        best = presence
        bestDist = dist
      }
      return best
    },
    countMatureNear(x, z, excludeId, worldDays, envAt) {
      return countMatureNearInternal(x, z, excludeId, worldDays, envAt)
    },
    getOverride(id) {
      return overrides.get(id)
    },
    serializeOverrides() {
      const out: Record<TreeId, TreeStateOverride> = {}
      for (const [id, value] of overrides) out[id] = { ...value }
      return out
    },
    replaceOverrides(next) {
      overrides.clear()
      for (const [id, value] of Object.entries(next)) {
        overrides.set(id, { stage: value.stage, stageStartedAt: value.stageStartedAt })
      }
    },
    clearOverrides() {
      overrides.clear()
    },
  }
}

/** Defensive parse of saved overrides — invalid entries are skipped. */
export function parseTreeOverrides(value: unknown): Record<TreeId, TreeStateOverride> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<TreeId, TreeStateOverride> = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id !== 'string' || !id) continue
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as Record<string, unknown>
    const stage = rec.stage
    if (
      stage !== 'sapling' &&
      stage !== 'young' &&
      stage !== 'mature' &&
      stage !== 'harvested'
    ) {
      continue
    }
    if (typeof rec.stageStartedAt !== 'number' || !Number.isFinite(rec.stageStartedAt)) continue
    out[id] = { stage, stageStartedAt: rec.stageStartedAt }
  }
  return out
}
