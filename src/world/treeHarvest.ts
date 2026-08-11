import type { ItemKind } from '../items/items'
import type { SettlementTreeLandmark } from '../settlement/props'
import type { TreeEnvSample, TreeGrowthStage, TreeLifecycle } from './treeLifecycle'
import { applyTreeStageVisual } from './treeVisuals'

/** Real-time seconds for the player axe chop channel (plan 057). */
export const CHOP_DURATION_SEC = 1.5

export type TreeHarvestResult =
  | { ok: true, yield: { kind: ItemKind, count: number }, stage: TreeGrowthStage }
  | { ok: false, reason: string }

function applyHarvestVisual(
  stage: TreeGrowthStage,
  opts?: {
    landmark?: SettlementTreeLandmark
    refreshChunkVisual?: (treeId: string) => boolean
  },
  treeId?: string,
): void {
  if (opts?.landmark) {
    opts.landmark.mesh = applyTreeStageVisual(opts.landmark.mesh, stage)
  } else if (treeId) {
    opts?.refreshChunkVisual?.(treeId)
  }
}

/**
 * One chop step for player (057) — mature→limbed→felled→harvested.
 * Shared with NPC via `harvestWorldTreeFully`.
 */
export function advanceWorldTreeHarvest(
  lifecycle: TreeLifecycle,
  treeId: string,
  worldDays: number,
  env: TreeEnvSample,
  opts?: {
    landmark?: SettlementTreeLandmark
    refreshChunkVisual?: (treeId: string) => boolean
  },
): TreeHarvestResult {
  const result = lifecycle.advanceHarvest(treeId, worldDays, env)
  if (!result.ok) return result
  applyHarvestVisual(result.stage, opts, treeId)
  return result
}

/**
 * NPC one-shot — collapses remaining chop steps to `harvested` and refreshes
 * the visual once to the final stump.
 */
export function harvestWorldTreeFully(
  lifecycle: TreeLifecycle,
  treeId: string,
  worldDays: number,
  env: TreeEnvSample,
  opts?: {
    landmark?: SettlementTreeLandmark
    refreshChunkVisual?: (treeId: string) => boolean
  },
): TreeHarvestResult {
  const result = lifecycle.harvestFully(treeId, worldDays, env)
  if (!result.ok) return result
  applyHarvestVisual(result.stage, opts, treeId)
  return result
}

/**
 * @deprecated Prefer `advanceWorldTreeHarvest` (player) or `harvestWorldTreeFully` (NPC).
 * Alias of `harvestWorldTreeFully` for older call sites.
 */
export function harvestWorldTree(
  lifecycle: TreeLifecycle,
  treeId: string,
  worldDays: number,
  env: TreeEnvSample,
  opts?: {
    landmark?: SettlementTreeLandmark
    refreshChunkVisual?: (treeId: string) => boolean
  },
): TreeHarvestResult {
  return harvestWorldTreeFully(lifecycle, treeId, worldDays, env, opts)
}
