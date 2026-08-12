import type { ItemKind } from '../items/items'
import type { BiomeWeights } from '../terrain/biomeRegions'

/** Explicit lifecycle stages — not inferred from model scale. */
export type TreeGrowthStage =
  | 'sapling'
  | 'young'
  | 'mature'
  | 'old'
  | 'limbed'
  | 'felled'
  | 'harvested'

/** Living crown ages (growth). Chop mid-stages are separate. */
export type TreeLivingAge = 'sapling' | 'young' | 'mature' | 'old'

/** Independent of age — drives position within height ranges (plan 073). */
export type TreeSizeClass = 'small' | 'medium' | 'large'

/** Renderer discriminator — living crown vs multi-stage chop visuals. */
export type TreeVisualKind = 'living' | 'limbed' | 'felled' | 'stump'

export type TreeId = string

/** Sparse runtime override — only trees that diverge from procedural default
 *  + lazy world-time growth (typically harvested / mid-chop / mid-regrowth). */
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

/** Stages that advance via world-time growth (not chop progress). */
type TimedGrowthStage = 'sapling' | 'young' | 'mature' | 'harvested'

/** Ideal game-days per stage at growthRate = 1. */
export const STAGE_DURATION_DAYS: Record<TimedGrowthStage, number> = {
  sapling: 0.5,
  young: 1.0,
  /** Mature → old (only when sizeClass allows). */
  mature: 2.0,
  /** Stump / dead wood before sapling regrowth. */
  harvested: 0.75,
}

/** World-meter height ranges per living age (plan 073). Ranges may overlap. */
export const HEIGHT_RANGE_M: Record<TreeLivingAge, { min: number, max: number }> = {
  sapling: { min: 0.5, max: 2 },
  young: { min: 1.5, max: 6 },
  mature: { min: 4, max: 15 },
  old: { min: 12, max: 25 },
}

/** Nominal position within a height range before jitter. */
export const SIZE_CLASS_T: Record<TreeSizeClass, number> = {
  small: 0.15,
  medium: 0.5,
  large: 0.85,
}

/** Procedural sizeClass roll weights (must sum ≈ 1). */
export const SIZE_CLASS_WEIGHTS: Record<TreeSizeClass, number> = {
  small: 0.35,
  medium: 0.5,
  large: 0.15,
}

/** Half-width of jitter around SIZE_CLASS_T (clamped to 0..1). */
export const SIZE_JITTER_HALF = 0.12

/** When sizeClass may be `old`, chance to spawn as old instead of mature. */
export const OLD_SPAWN_CHANCE = 0.5

/**
 * Template heights after `prepareProp` — must stay aligned with `TREE_SPECS`
 * index order in `settlement/props.ts`.
 */
export const TREE_TEMPLATE_HEIGHT_M: readonly number[] = [4.2, 3.8, 4.6, 4.4, 4.8, 3.6]

/** Chop remnant scale relative to the tree's mature living height. */
export const CHOP_SCALE_MULT: Record<'limbed' | 'felled' | 'harvested', number> = {
  limbed: 0.85,
  felled: 0.28,
  harvested: 0.28,
}

const CANOPY_RADIUS = 8
const CANOPY_WEIGHT = 0.35

export type HarvestYield = { kind: ItemKind, count: number }

type ChoppableLiving = 'mature' | 'old'

/** Per-step chop yields (`branch` — no parallel `wood`). */
export const CHOP_YIELDS: Record<ChoppableLiving | 'limbed' | 'felled', HarvestYield> = {
  mature: { kind: 'branch', count: 2 },
  old: { kind: 'branch', count: 2 },
  limbed: { kind: 'branch', count: 2 },
  felled: { kind: 'branch', count: 3 },
}

/** Final-step yield (bucking) — kept for callers that check capacity for one chop. */
export const HARVEST_YIELD: HarvestYield = CHOP_YIELDS.felled

const CHOP_NEXT: Record<ChoppableLiving | 'limbed' | 'felled', TreeGrowthStage> = {
  mature: 'limbed',
  old: 'limbed',
  limbed: 'felled',
  felled: 'harvested',
}

export function isChoppableStage(stage: TreeGrowthStage): boolean {
  return stage === 'mature' || stage === 'old' || stage === 'limbed' || stage === 'felled'
}

export function isCanopyStage(stage: TreeGrowthStage): boolean {
  return stage === 'mature' || stage === 'old'
}

export function canReachOld(sizeClass: TreeSizeClass): boolean {
  return sizeClass === 'medium' || sizeClass === 'large'
}

export function yieldForChopStage(stage: TreeGrowthStage): HarvestYield | null {
  if (stage === 'mature' || stage === 'old' || stage === 'limbed' || stage === 'felled') {
    return { ...CHOP_YIELDS[stage] }
  }
  return null
}

export function treeVisualKind(stage: TreeGrowthStage): TreeVisualKind {
  if (stage === 'limbed') return 'limbed'
  if (stage === 'felled') return 'felled'
  if (stage === 'harvested') return 'stump'
  return 'living'
}

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
  sizeClass: TreeSizeClass
  /** 0..1 roll used inside height ranges (procedural, not saved). */
  sizeJitter: number
}

export type ResolvedTreeState = {
  id: TreeId
  stage: TreeGrowthStage
  scale: number
  /** When false, renderer should not show a living crown mesh. */
  showCrown: boolean
  visual: TreeVisualKind
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Map sizeClass + jitter → 0..1 position within a height range. */
export function sizeT(sizeClass: TreeSizeClass, sizeJitter: number): number {
  const jitter = (clamp01(sizeJitter) - 0.5) * 2 * SIZE_JITTER_HALF
  return clamp01(SIZE_CLASS_T[sizeClass] + jitter)
}

export function livingHeightM(
  age: TreeLivingAge,
  sizeClass: TreeSizeClass,
  sizeJitter: number,
): number {
  const range = HEIGHT_RANGE_M[age]
  return lerp(range.min, range.max, sizeT(sizeClass, sizeJitter))
}

export function templateHeightM(speciesIndex: number): number {
  return TREE_TEMPLATE_HEIGHT_M[speciesIndex] ?? TREE_TEMPLATE_HEIGHT_M[0]!
}

/**
 * Mesh scale so the prepared GLB (~templateHeightM) reaches the target
 * world height for this age / sizeClass.
 */
export function visualScaleForTree(
  speciesIndex: number,
  stage: TreeGrowthStage,
  sizeClass: TreeSizeClass,
  sizeJitter: number,
): number {
  const template = Math.max(0.01, templateHeightM(speciesIndex))
  if (stage === 'limbed' || stage === 'felled' || stage === 'harvested') {
    const matureH = livingHeightM('mature', sizeClass, sizeJitter)
    return (matureH * CHOP_SCALE_MULT[stage]) / template
  }
  const age: TreeLivingAge =
    stage === 'sapling' || stage === 'young' || stage === 'mature' || stage === 'old'
      ? stage
      : 'mature'
  return livingHeightM(age, sizeClass, sizeJitter) / template
}

/** Weighted roll for sizeClass from a 0..1 random. */
export function rollSizeClass(random01: number): TreeSizeClass {
  const r = clamp01(random01)
  if (r < SIZE_CLASS_WEIGHTS.small) return 'small'
  if (r < SIZE_CLASS_WEIGHTS.small + SIZE_CLASS_WEIGHTS.medium) return 'medium'
  return 'large'
}

/**
 * Procedural living age given sizeClass. `ageRoll` / `oldRoll` are independent
 * 0..1 uniforms. Sapling/young chances are caller-supplied.
 */
export function rollLivingAge(params: {
  sizeClass: TreeSizeClass
  ageRoll: number
  oldRoll: number
  saplingChance: number
  youngChance: number
}): TreeLivingAge {
  const { sizeClass, ageRoll, oldRoll, saplingChance, youngChance } = params
  const roll = clamp01(ageRoll)
  if (roll < saplingChance) return 'sapling'
  if (roll < saplingChance + youngChance) return 'young'
  if (canReachOld(sizeClass) && clamp01(oldRoll) < OLD_SPAWN_CHANCE) return 'old'
  return 'mature'
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

/** Local canopy competition — nearby mature/old trees reduce sapling/young growth. */
export function canopyGrowthFactor(matureNeighbors: number, stage: TreeGrowthStage): number {
  if (
    stage === 'mature' ||
    stage === 'old' ||
    stage === 'limbed' ||
    stage === 'felled' ||
    stage === 'harvested'
  ) {
    return 1
  }
  return 1 / (1 + Math.max(0, matureNeighbors) * CANOPY_WEIGHT)
}

/**
 * Advance stages from an anchor using elapsed world days and a constant
 * growth rate for the interval. Lazy — no per-frame ticks.
 * Chop mid-stages (`limbed` / `felled`) do not advance with time.
 * `allowOld` gates mature → old (small trees never become old).
 */
export function advanceStage(
  stage: TreeGrowthStage,
  stageStartedAt: number,
  worldDays: number,
  growthRate: number,
  allowOld = true,
): { stage: TreeGrowthStage, stageStartedAt: number } {
  let current = stage
  let started = stageStartedAt
  const rate = Math.max(0.05, growthRate)

  // Cap iterations so pathological rates can't loop forever.
  for (let i = 0; i < 8; i++) {
    if (current === 'old' || current === 'limbed' || current === 'felled') break
    if (current === 'mature' && !allowOld) break
    const duration = STAGE_DURATION_DAYS[current as TimedGrowthStage]
    if (duration === undefined) break
    const needed = duration / rate
    if (worldDays < started + needed) break
    started = started + needed
    if (current === 'sapling') current = 'young'
    else if (current === 'young') current = 'mature'
    else if (current === 'mature') current = 'old'
    else if (current === 'harvested') current = 'sapling'
  }
  return { stage: current, stageStartedAt: started }
}

function cellKey(x: number, z: number): string {
  return `${Math.floor(x / CANOPY_RADIUS)}:${Math.floor(z / CANOPY_RADIUS)}`
}

export type TreeHarvestStepResult =
  | { ok: true, yield: HarvestYield, stage: TreeGrowthStage }
  | { ok: false, reason: string }

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
  /** One chop step: mature|old→limbed→felled→harvested. */
  advanceHarvest: (
    id: TreeId,
    worldDays: number,
    env: TreeEnvSample,
  ) => TreeHarvestStepResult
  /** Advance all remaining chop steps to `harvested` (NPC one-shot). */
  harvestFully: (
    id: TreeId,
    worldDays: number,
    env: TreeEnvSample,
  ) => TreeHarvestStepResult
  /**
   * @deprecated Prefer `advanceHarvest` / `harvestFully`. Kept as alias of
   * `harvestFully` for older call sites.
   */
  harvest: (
    id: TreeId,
    worldDays: number,
    env: TreeEnvSample,
  ) => TreeHarvestStepResult
  findHarvestableNear: (
    x: number,
    z: number,
    radius: number,
    worldDays: number,
    envAt: (x: number, z: number) => TreeEnvSample,
  ) => TreePresence | null
  /** Loaded/registered trees within radius — uses spatial buckets (plan 057). */
  getNearbyPresence: (x: number, z: number, radius: number) => readonly TreePresence[]
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

  function allowOldFor(presence: TreePresence): boolean {
    return canReachOld(presence.sizeClass)
  }

  /** Canopy density uses env-only growth (no nested canopy) to avoid recursion. */
  function isEffectivelyMature(
    presence: TreePresence,
    worldDays: number,
    env: TreeEnvSample,
  ): boolean {
    const prefs = speciesPrefs(presence.speciesIndex)
    const rate = envGrowthFactor(env, prefs)
    const allowOld = allowOldFor(presence)
    const override = overrides.get(presence.id)
    const stage = override
      ? advanceStage(override.stage, override.stageStartedAt, worldDays, rate, allowOld).stage
      : advanceStage(presence.initialStage, 0, worldDays, rate, allowOld).stage
    return isCanopyStage(stage)
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
    const allowOld = allowOldFor(presence)

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
      const advanced = advanceStage(
        override.stage,
        override.stageStartedAt,
        worldDays,
        growthRate,
        allowOld,
      )
      stage = advanced.stage
      const procedural = advanceStage(presence.initialStage, 0, worldDays, growthRate, allowOld)
      // Prune sparse override once fully grown again and procedural growth
      // matches (harvest scar no longer needed).
      if (isCanopyStage(stage) && stage === procedural.stage) {
        overrides.delete(presence.id)
      } else if (stage !== override.stage || advanced.stageStartedAt !== override.stageStartedAt) {
        overrides.set(presence.id, { stage, stageStartedAt: advanced.stageStartedAt })
      }
    } else {
      stage = advanceStage(presence.initialStage, 0, worldDays, growthRate, allowOld).stage
    }

    const visual = treeVisualKind(stage)
    return {
      id: presence.id,
      stage,
      scale: visualScaleForTree(
        presence.speciesIndex,
        stage,
        presence.sizeClass,
        presence.sizeJitter,
      ),
      showCrown: visual === 'living',
      visual,
    }
  }

  function advanceHarvest(
    id: TreeId,
    worldDays: number,
    env: TreeEnvSample,
  ): TreeHarvestStepResult {
    const presence = byId.get(id)
    if (!presence) return { ok: false, reason: 'unknown-tree' }
    const current = resolvePresence(presence, env, worldDays)
    if (!isChoppableStage(current.stage)) {
      return { ok: false, reason: current.stage === 'harvested' ? 'already-harvested' : 'not-choppable' }
    }
    const from = current.stage as ChoppableLiving | 'limbed' | 'felled'
    const next = CHOP_NEXT[from]
    const yieldAmt = CHOP_YIELDS[from]
    overrides.set(id, { stage: next, stageStartedAt: worldDays })
    return { ok: true, yield: { ...yieldAmt }, stage: next }
  }

  function harvestFully(
    id: TreeId,
    worldDays: number,
    env: TreeEnvSample,
  ): TreeHarvestStepResult {
    let total = 0
    let lastStage: TreeGrowthStage | null = null
    for (let i = 0; i < 3; i++) {
      const step = advanceHarvest(id, worldDays, env)
      if (!step.ok) {
        if (i === 0) return step
        break
      }
      total += step.yield.count
      lastStage = step.stage
      if (step.stage === 'harvested') break
    }
    if (lastStage === null) return { ok: false, reason: 'not-choppable' }
    return { ok: true, yield: { kind: 'branch', count: total }, stage: lastStage }
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
    advanceHarvest,
    harvestFully,
    harvest: harvestFully,
    findHarvestableNear(x, z, radius, worldDays, envAt) {
      let best: TreePresence | null = null
      let bestDist = Infinity
      for (const id of nearbyIds(x, z, radius)) {
        const presence = byId.get(id)
        if (!presence) continue
        const dist = Math.hypot(presence.x - x, presence.z - z)
        if (dist > radius || dist >= bestDist) continue
        const resolved = resolvePresence(presence, envAt(presence.x, presence.z), worldDays)
        if (!isChoppableStage(resolved.stage)) continue
        best = presence
        bestDist = dist
      }
      return best
    },
    getNearbyPresence(x, z, radius) {
      const out: TreePresence[] = []
      for (const id of nearbyIds(x, z, radius)) {
        const presence = byId.get(id)
        if (!presence) continue
        if (Math.hypot(presence.x - x, presence.z - z) > radius) continue
        out.push(presence)
      }
      return out
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

const VALID_STAGES: ReadonlySet<string> = new Set([
  'felled',
  'harvested',
  'limbed',
  'mature',
  'old',
  'sapling',
  'young',
])

/** Defensive parse of saved overrides — invalid entries are skipped. */
export function parseTreeOverrides(value: unknown): Record<TreeId, TreeStateOverride> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<TreeId, TreeStateOverride> = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id !== 'string' || !id) continue
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as Record<string, unknown>
    const stage = rec.stage
    if (typeof stage !== 'string' || !VALID_STAGES.has(stage)) continue
    if (typeof rec.stageStartedAt !== 'number' || !Number.isFinite(rec.stageStartedAt)) continue
    out[id] = { stage: stage as TreeGrowthStage, stageStartedAt: rec.stageStartedAt }
  }
  return out
}
