import type { HomeVillageSize } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { RiverQuery } from '../terrain/riverQuery'
import type { RolledVillageSize } from './families'
import type { TerrainSamplers } from './settlementTerrain'
import {
  cellsWithinRadius,
  probeSettlementSite,
  type SettlementCell,
} from './settlementGenerator'

/** Chebyshev ring around home for the first step-up settlement. */
export const SETTLEMENT_PROGRESSION_NEAR_RING = { min: 1, max: 2 } as const
/** Chebyshev ring around home for the guaranteed large settlement. */
export const SETTLEMENT_PROGRESSION_FAR_RING = { min: 3, max: 5 } as const

/** Dedicated candidate-order salts — must not reuse `cellSeed` or layout/name streams. */
export const SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT = 0x50724e52
export const SETTLEMENT_PROGRESSION_FAR_ORDER_SALT = 0x50724652

const HOME_CELL: SettlementCell = { gx: 0, gz: 0 }
const FAR_RING_MINIMUM: RolledVillageSize = 'LG'

export type SettlementProgressionWorldInput = {
  seed: number
  sampleHeight: HeightSampler
  waterLevel: number
  localSearchRadius: number
  terrainSamplers: TerrainSamplers
  heightScale: number
  region: RegionParams
  homeSize?: HomeVillageSize
}

export type SettlementProgressionTarget = {
  cell: SettlementCell
  minimum: RolledVillageSize
}

/**
 * Deterministic minimum-size policy for the near/far rings around home.
 * `null` means the cell keeps its ordinary `rollVillageSize()` path.
 *
 * @domain settlements
 */
export type SettlementProgressionPolicy = {
  readonly homeSize: RolledVillageSize
  readonly near: SettlementProgressionTarget | null
  readonly far: SettlementProgressionTarget | null
  minimumFor(cell: SettlementCell): RolledVillageSize | null
}

/** Chebyshev distance on the settlement grid. */
export function chebyshevCellDistance(a: SettlementCell, b: SettlementCell): number {
  return Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gz - b.gz))
}

/**
 * Settlement cells whose Chebyshev distance from home sits in `[min, max]`.
 *
 * @domain settlements
 */
export function settlementProgressionRingCells(
  ring: { readonly min: number, readonly max: number },
): SettlementCell[] {
  return cellsWithinRadius(HOME_CELL, ring.max).filter((cell) => {
    const distance = chebyshevCellDistance(cell, HOME_CELL)
    return distance >= ring.min && distance <= ring.max
  })
}

function progressionCandidateRank(seed: number, cell: SettlementCell, salt: number): number {
  let h = (cell.gx * 374761393 + cell.gz * 668265263) | 0
  h = (h ^ salt ^ (seed | 0)) | 0
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 1274126177)
  h = (h ^ (h >>> 16)) | 0
  h = Math.imul(h, 2246822519)
  h = (h ^ (h >>> 13) ^ (seed | 0)) | 0
  return h >>> 0
}

/**
 * Seeded order of ring candidates. Independent of streaming / lookup order.
 *
 * @domain settlements
 */
export function orderProgressionCandidates(
  seed: number,
  cells: readonly SettlementCell[],
  salt: number,
): SettlementCell[] {
  return [...cells].sort((a, b) => {
    const rankA = progressionCandidateRank(seed, a, salt)
    const rankB = progressionCandidateRank(seed, b, salt)
    if (rankA !== rankB) return rankA - rankB
    if (a.gx !== b.gx) return a.gx - b.gx
    return a.gz - b.gz
  })
}

function nearMinimumForHome(homeSize: RolledVillageSize): RolledVillageSize {
  return homeSize === 'SM' ? 'MD' : 'LG'
}

function probeCandidate(
  cell: SettlementCell,
  input: SettlementProgressionWorldInput,
  riverQuery: RiverQuery | undefined,
  minimumSize: RolledVillageSize,
) {
  return probeSettlementSite(
    cell,
    input.seed,
    input.sampleHeight,
    input.waterLevel,
    input.localSearchRadius,
    input.terrainSamplers,
    input.heightScale,
    input.region,
    input.homeSize ?? 'auto',
    riverQuery,
    minimumSize,
  )
}

function pickRingTarget(
  seed: number,
  ring: { readonly min: number, readonly max: number },
  salt: number,
  minimum: RolledVillageSize,
  input: SettlementProgressionWorldInput,
  riverQuery: RiverQuery | undefined,
): SettlementProgressionTarget | null {
  const ordered = orderProgressionCandidates(seed, settlementProgressionRingCells(ring), salt)
  for (const cell of ordered) {
    const probe = probeCandidate(cell, input, riverQuery, minimum)
    if (!probe.site || probe.wouldBeOutpost) continue
    return { cell, minimum }
  }
  return null
}

/**
 * Resolve near/far progression targets for default `homeSize: auto`.
 * Explicit `WorldConfig.settlements.homeSize` stays authoritative: no rings.
 *
 * @domain settlements
 */
export function resolveSettlementProgressionPolicy(
  input: SettlementProgressionWorldInput,
  riverQuery?: RiverQuery,
): SettlementProgressionPolicy | null {
  if ((input.homeSize ?? 'auto') !== 'auto') return null

  const homeProbe = probeSettlementSite(
    HOME_CELL,
    input.seed,
    input.sampleHeight,
    input.waterLevel,
    input.localSearchRadius,
    input.terrainSamplers,
    input.heightScale,
    input.region,
    'auto',
    riverQuery,
  )
  const homeSize = homeProbe.provisionalSize
  const nearMinimum = nearMinimumForHome(homeSize)
  const near = pickRingTarget(
    input.seed,
    SETTLEMENT_PROGRESSION_NEAR_RING,
    SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT,
    nearMinimum,
    input,
    riverQuery,
  )
  const far = pickRingTarget(
    input.seed,
    SETTLEMENT_PROGRESSION_FAR_RING,
    SETTLEMENT_PROGRESSION_FAR_ORDER_SALT,
    FAR_RING_MINIMUM,
    input,
    riverQuery,
  )

  const byKey = new Map<string, RolledVillageSize>()
  if (near) byKey.set(`${near.cell.gx}_${near.cell.gz}`, near.minimum)
  if (far) byKey.set(`${far.cell.gx}_${far.cell.gz}`, far.minimum)

  return {
    homeSize,
    near,
    far,
    minimumFor(cell) {
      return byKey.get(`${cell.gx}_${cell.gz}`) ?? null
    },
  }
}
