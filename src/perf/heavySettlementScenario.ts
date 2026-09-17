import type { VillageSize } from '../settlement/families'
import type { SettlementCell, SettlementDef } from '../settlement/settlementGenerator'
import type { ScenarioSettlement } from './types'
import { cellsWithinRadius } from '../settlement/settlementGenerator'

/**
 * Chebyshev cell radius around home for `settlement-heavy` selection
 * (plan tools-016). Seeded at 4 (~9×9 cells, skipping home) so the
 * canonical tools-001 fixture (seed 42) can reach a large mountain
 * settlement without a full-world scan. Bump deliberately if a future
 * fixture/seed has no mountain candidate inside this bound — never fall
 * back silently to a different terrain.
 *
 * @domain tools
 */
export const HEAVY_SETTLEMENT_SEARCH_RADIUS = 4

/** Full village-size order for heavy-settlement ranking (plan tools-016).
 *  Distinct from `rolledVillageSizeRank`, which excludes `OUTPOST`. */
const VILLAGE_SIZE_RANK: Record<VillageSize, number> = {
  OUTPOST: 0,
  SM: 1,
  MD: 2,
  LG: 3,
  XL: 4,
}

export type HeavySettlementSelectOk = { ok: true; def: SettlementDef }
export type HeavySettlementSelectFail = { ok: false; reason: string }
export type HeavySettlementSelectResult = HeavySettlementSelectOk | HeavySettlementSelectFail

export type HeavySettlementPeek = (cell: SettlementCell) => SettlementDef | null

/** Count family members on a def without constructing NPC agents. */
export function settlementResidentCount(def: Pick<SettlementDef, 'families'>): number {
  let n = 0
  for (const family of def.families) n += family.members.length
  return n
}

/**
 * Pick the heaviest mountain `SettlementDef` in a fixed Chebyshev ring
 * around home (plan tools-016). Pure over `peekDef` — does not depend on
 * loaded runtime settlements or camera streaming.
 *
 * Ranking: size desc → resident count desc → distanceSq asc → id asc.
 * Failure is explicit; never silently falls back to home or non-mountain.
 *
 * @domain tools
 */
export function selectHeavySettlement(args: {
  home: Pick<SettlementDef, 'gx' | 'gz'>
  peekDef: HeavySettlementPeek
  /** Defaults to {@link HEAVY_SETTLEMENT_SEARCH_RADIUS}. */
  radius?: number
}): HeavySettlementSelectResult {
  const radius = args.radius ?? HEAVY_SETTLEMENT_SEARCH_RADIUS
  const homeCell: SettlementCell = { gx: args.home.gx, gz: args.home.gz }
  let best: SettlementDef | null = null
  let bestSizeRank = -1
  let bestResidents = -1
  let bestDistSq = Number.POSITIVE_INFINITY

  for (const cell of cellsWithinRadius(homeCell, radius)) {
    if (cell.gx === homeCell.gx && cell.gz === homeCell.gz) continue
    const def = args.peekDef(cell)
    if (!def || def.terrain !== 'mountain') continue

    const sizeRank = VILLAGE_SIZE_RANK[def.size]
    const residents = settlementResidentCount(def)
    const dx = def.gx - homeCell.gx
    const dz = def.gz - homeCell.gz
    const distSq = dx * dx + dz * dz

    const better
      = sizeRank > bestSizeRank
      || (sizeRank === bestSizeRank && residents > bestResidents)
      || (sizeRank === bestSizeRank && residents === bestResidents && distSq < bestDistSq)
      || (
        sizeRank === bestSizeRank
        && residents === bestResidents
        && distSq === bestDistSq
        && (best === null || def.id < best.id)
      )

    if (!better) continue
    best = def
    bestSizeRank = sizeRank
    bestResidents = residents
    bestDistSq = distSq
  }

  if (!best) {
    return {
      ok: false,
      reason:
        `no mountain SettlementDef within Chebyshev radius ${radius} of home `
        + `(${homeCell.gx},${homeCell.gz})`,
    }
  }
  return { ok: true, def: best }
}

/** Build the optional PerfContext settlement descriptor from a selected def. */
export function scenarioSettlementFromDef(def: SettlementDef): ScenarioSettlement {
  return {
    id: def.id,
    name: def.name,
    terrain: def.terrain,
    size: def.size,
    familyCount: def.families.length,
    residentCount: settlementResidentCount(def),
    x: def.x,
    z: def.z,
  }
}
