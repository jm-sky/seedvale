import type { HomeVillageSize } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { RiverQuery } from '../terrain/riverQuery'
import type { VillageSize } from './families'
import type { TerrainSamplers } from './settlementTerrain'
import { pickNameCulture } from '../ai/nameCultures'
import { generateSettlementName } from '../shared/SettlementName'
import {
  createLostTreasureArchaeologistFamily,
  LOST_TREASURE_ARCHAEOLOGIST_SETTLEMENT_SEARCH_RADIUS,
  selectLostTreasureChroniclesArchaeologistSettlement,
} from './lostTreasureChroniclesArchaeologistResident'
import {
  createLostTreasureElderFamily,
  LOST_TREASURE_ELDER_SETTLEMENT_SEARCH_RADIUS,
  selectLostTreasureChroniclesElderSettlement,
} from './lostTreasureChroniclesElderResident'
import {
  createLostTreasureSpecialistFamily,
  LOST_TREASURE_SPECIALIST_SETTLEMENT_SEARCH_RADIUS,
  selectLostTreasureChroniclesSpecialistSettlement,
} from './lostTreasureChroniclesSpecialistResident'
import {
  cellFromId,
  cellKey,
  cellSeed,
  cellsWithinRadius,
  generateSettlementDef,
  probeSettlementSite,
  type SettlementCell,
  type SettlementDef,
  type SettlementSiteProbe,
} from './settlementGenerator'
import {
  fallbackSettlementName,
  pickUniqueSettlementName,
  predecessorSettlementCells,
} from './settlementNameUniqueness'
import {
  resolveSettlementProgressionPolicy,
  type SettlementProgressionPolicy,
} from './settlementProgression'

/** Shared generation context for the single settlement-definition cache
 *  (plan 047 §9.14–15). Both `SettlementsManager` and `RoadNetwork` must
 *  resolve defs through this module — never keep a second authoritative cache. */
export type SettlementResolveContext = {
  seed: number
  sampleHeight: HeightSampler
  waterLevel: number
  localSearchRadius: number
  terrainSamplers: TerrainSamplers
  heightScale: number
  region: RegionParams
  /** Home village size override (`WorldConfig.settlements.homeSize`). */
  homeSize?: HomeVillageSize
}

/** The running world's canonical river geometry lookup (`terrain/riverQuery.ts`).
 *  World-scoped rather than a `SettlementResolveContext` field on purpose: the
 *  def cache below is itself world-scoped and "first resolver wins", so if one
 *  caller (`SettlementsManager`) passed a query and another (`ChunkManager`'s
 *  road context) did not, a village's layout would silently depend on which
 *  one asked first. One registration point makes that impossible.
 *  `null` (the default, and after `clearSettlementDefCache`) means settlements
 *  generate river-agnostically, as they did before world-terrain river
 *  integration — the behaviour unit tests and any hydrology-less caller get. */
let activeRiverQuery: RiverQuery | null = null

/** Registers the river query for the world being built. Call once per world
 *  (`ChunkManager` construction), always *after* `clearSettlementDefCache()`
 *  has dropped the previous world's defs. */
export function setSettlementRiverQuery(query: RiverQuery | null): void {
  activeRiverQuery = query
}

/** The world's canonical river lookup, for the other world-scoped worldgen
 *  consumers that must see the *same* hydrology as settlement placement —
 *  currently `roadNetwork.ts`'s river-aware routing (plan world-terrain-023
 *  §4). Reading the one registration rather than threading a query through
 *  each `RoadNetworkContext` is what makes caller order (`ChunkManager`'s road
 *  context vs. `SettlementsManager`'s) worldgen-insignificant: both contexts
 *  share one route cache, so both must resolve routes against identical
 *  rivers. `null` before registration — routing then behaves river-agnostically,
 *  exactly as it did before this plan. */
export function worldRiverQuery(): RiverQuery | null {
  return activeRiverQuery
}

const defCache = new Map<string, SettlementDef | null>()
const namingInputCache = new Map<string, SettlementSiteProbe>()
const uniqueNameCache = new Map<string, string | null>()

/** Derived near/far size policy for the current world. Cleared with defs. */
let progressionPolicy: SettlementProgressionPolicy | null | undefined
/** Memoized host cell key for the Lost Treasure Chronicles elder, or `null` when none. */
let elderHostCellKey: string | null | undefined
/** Memoized host cell key for the Lost Treasure Chronicles archaeologist, or `null` when none. */
let archaeologistHostCellKey: string | null | undefined
/** Memoized host cell key for the Lost Treasure Chronicles specialist, or `null` when none. */
let specialistHostCellKey: string | null | undefined

export function clearSettlementDefCache(): void {
  defCache.clear()
  namingInputCache.clear()
  uniqueNameCache.clear()
  activeRiverQuery = null
  progressionPolicy = undefined
  elderHostCellKey = undefined
  archaeologistHostCellKey = undefined
  specialistHostCellKey = undefined
}

function progressionPolicyFor(ctx: SettlementResolveContext): SettlementProgressionPolicy | null {
  if (progressionPolicy !== undefined) return progressionPolicy
  progressionPolicy = resolveSettlementProgressionPolicy(ctx, activeRiverQuery ?? undefined)
  return progressionPolicy
}

function probeArgs(cell: SettlementCell, ctx: SettlementResolveContext) {
  return [
    cell,
    ctx.seed,
    ctx.sampleHeight,
    ctx.waterLevel,
    ctx.localSearchRadius,
    ctx.terrainSamplers,
    ctx.heightScale,
    ctx.region,
    ctx.homeSize ?? 'auto',
    activeRiverQuery ?? undefined,
    progressionPolicyFor(ctx)?.minimumFor(cell) ?? undefined,
  ] as const
}

function namingInputsFor(cell: SettlementCell, ctx: SettlementResolveContext): SettlementSiteProbe {
  const key = cellKey(cell)
  const cached = namingInputCache.get(key)
  if (cached) return cached
  const probe = probeSettlementSite(...probeArgs(cell, ctx))
  namingInputCache.set(key, probe)
  return probe
}

/**
 * Unique display name for `cell` from a stable predecessor order — not stream order.
 * Memoized per world; naming inputs only (no village layout) for predecessors.
 *
 * @domain settlements
 */
function uniqueNameFor(cell: SettlementCell, ctx: SettlementResolveContext): string | null {
  const key = cellKey(cell)
  if (uniqueNameCache.has(key)) return uniqueNameCache.get(key)!
  const inputs = namingInputsFor(cell, ctx)
  if (!inputs.site || inputs.terrain === undefined) {
    uniqueNameCache.set(key, null)
    return null
  }
  const takenNames = new Set<string>()
  for (const predecessor of predecessorSettlementCells(cell)) {
    const name = uniqueNameFor(predecessor, ctx)
    if (name) takenNames.add(name)
  }
  const seedForCell = cellSeed(ctx.seed, cell)
  const { terrain, dominantResource = null } = inputs
  const attempt0 = generateSettlementName(seedForCell, terrain, dominantResource, 0)
  const name = pickUniqueSettlementName({
    takenNames,
    candidate: (attempt) => generateSettlementName(seedForCell, terrain, dominantResource, attempt),
    fallback: fallbackSettlementName(attempt0, cell),
  })
  uniqueNameCache.set(key, name)
  return name
}

function applyResolvedSettlementName(def: SettlementDef, name: string): void {
  def.name = name
  def.plan.identity.name = name
}

function elderHostCellFor(ctx: SettlementResolveContext): SettlementCell | null {
  if (elderHostCellKey !== undefined) return elderHostCellKey ? cellFromId(elderHostCellKey) : null
  const origin: SettlementCell = { gx: 0, gz: 0 }
  const selected = selectLostTreasureChroniclesElderSettlement(
    probeCandidatesWithin(ctx, origin, LOST_TREASURE_ELDER_SETTLEMENT_SEARCH_RADIUS),
  )
  elderHostCellKey = selected ? cellKey(selected.cell) : null
  return selected?.cell ?? null
}

function probeCandidatesWithin(
  ctx: SettlementResolveContext,
  origin: SettlementCell,
  radius: number,
): Array<{
  cell: SettlementCell
  id: string
  size: VillageSize
  x: number
  z: number
  isHome: boolean
}> {
  const candidates = []
  for (const cell of cellsWithinRadius(origin, radius)) {
    if (cell.gx === origin.gx && cell.gz === origin.gz) continue
    const probe = namingInputsFor(cell, ctx)
    if (!probe.site) continue
    candidates.push({
      cell,
      id: cellKey(cell),
      size: probe.wouldBeOutpost ? 'OUTPOST' as const : probe.provisionalSize,
      x: probe.site.x,
      z: probe.site.z,
      isHome: false,
    })
  }
  return candidates
}

function archaeologistHostCellFor(ctx: SettlementResolveContext): SettlementCell | null {
  if (archaeologistHostCellKey !== undefined) {
    return archaeologistHostCellKey ? cellFromId(archaeologistHostCellKey) : null
  }
  const origin: SettlementCell = { gx: 0, gz: 0 }
  const elderHost = elderHostCellFor(ctx)
  const selected = selectLostTreasureChroniclesArchaeologistSettlement(
    probeCandidatesWithin(ctx, origin, LOST_TREASURE_ARCHAEOLOGIST_SETTLEMENT_SEARCH_RADIUS),
    elderHost ? cellKey(elderHost) : null,
  )
  archaeologistHostCellKey = selected ? cellKey(selected.cell) : null
  return selected?.cell ?? null
}

function specialistHostCellFor(ctx: SettlementResolveContext): SettlementCell | null {
  if (specialistHostCellKey !== undefined) {
    return specialistHostCellKey ? cellFromId(specialistHostCellKey) : null
  }
  const origin: SettlementCell = { gx: 0, gz: 0 }
  const elderHost = elderHostCellFor(ctx)
  const archaeologistHost = archaeologistHostCellFor(ctx)
  const selected = selectLostTreasureChroniclesSpecialistSettlement(
    probeCandidatesWithin(ctx, origin, LOST_TREASURE_SPECIALIST_SETTLEMENT_SEARCH_RADIUS),
    elderHost ? cellKey(elderHost) : null,
    archaeologistHost ? cellKey(archaeologistHost) : null,
  )
  specialistHostCellKey = selected ? cellKey(selected.cell) : null
  return selected?.cell ?? null
}

function authoredResidentsFor(cell: SettlementCell, ctx: SettlementResolveContext) {
  const seedForCell = cellSeed(ctx.seed, cell)
  const nameCulture = pickNameCulture(seedForCell)
  const residents = []
  const elderHost = elderHostCellFor(ctx)
  if (elderHost && elderHost.gx === cell.gx && elderHost.gz === cell.gz) {
    residents.push(createLostTreasureElderFamily(seedForCell, nameCulture))
  }
  const archaeologistHost = archaeologistHostCellFor(ctx)
  if (archaeologistHost && archaeologistHost.gx === cell.gx && archaeologistHost.gz === cell.gz) {
    residents.push(createLostTreasureArchaeologistFamily(seedForCell, nameCulture))
  }
  const specialistHost = specialistHostCellFor(ctx)
  if (specialistHost && specialistHost.gx === cell.gx && specialistHost.gz === cell.gz) {
    residents.push(createLostTreasureSpecialistFamily(seedForCell, nameCulture))
  }
  return residents
}

/** Test/debug seam: `undefined` before first resolve, then the memoized archaeologist host (or `null`). */
export function cachedLostTreasureArchaeologistHostCell(): SettlementCell | null | undefined {
  return archaeologistHostCellKey === undefined
    ? undefined
    : archaeologistHostCellKey
      ? cellFromId(archaeologistHostCellKey)
      : null
}

/** Test/debug seam: `undefined` before first resolve, then the memoized specialist host (or `null`). */
export function cachedLostTreasureSpecialistHostCell(): SettlementCell | null | undefined {
  return specialistHostCellKey === undefined
    ? undefined
    : specialistHostCellKey
      ? cellFromId(specialistHostCellKey)
      : null
}

export function settlementDefFor(
  cell: SettlementCell,
  ctx: SettlementResolveContext,
): SettlementDef | null {
  const key = cellKey(cell)
  if (defCache.has(key)) return defCache.get(key)!
  const resolvedName = uniqueNameFor(cell, ctx)
  const def = generateSettlementDef(...probeArgs(cell, ctx), authoredResidentsFor(cell, ctx))
  if (def && resolvedName) applyResolvedSettlementName(def, resolvedName)
  defCache.set(key, def)
  return def
}

export function cachedSettlementDefCount(): number {
  return defCache.size
}

/** Test/debug seam: `undefined` before first resolve, then the memoized policy (or `null`). */
export function cachedSettlementProgressionPolicy(): SettlementProgressionPolicy | null | undefined {
  return progressionPolicy
}
