import type { ItemKind } from '../items/items'
import type { SettlementTreeLandmark } from '../settlement/props'
import type { TreeEnvSample, TreeLifecycle } from './treeLifecycle'
import { applyHarvestedTreeVisual } from './treeVisuals'

export type TreeHarvestResult =
  | { ok: true, yield: { kind: ItemKind, count: number } }
  | { ok: false, reason: string }

/**
 * Shared world harvest (plan 058) — NPC and future player (057) call this,
 * never a parallel chopping system.
 */
export function harvestWorldTree(
  lifecycle: TreeLifecycle,
  treeId: string,
  worldDays: number,
  env: TreeEnvSample,
  opts?: {
    /** Settlement landmark to swap to a stump mesh. */
    landmark?: SettlementTreeLandmark
    /** Streamed chunk vegetation refresh. */
    refreshChunkVisual?: (treeId: string) => boolean
  },
): TreeHarvestResult {
  const result = lifecycle.harvest(treeId, worldDays, env)
  if (!result.ok) return result

  if (opts?.landmark) {
    opts.landmark.mesh = applyHarvestedTreeVisual(opts.landmark.mesh)
  } else {
    opts?.refreshChunkVisual?.(treeId)
  }
  return result
}
