/**
 * Canonical mineable-deposit definition (plan world-018) — the mining
 * boundary between content sources and `ResourceDeposits` runtime instances.
 *
 * Distinct from `NaturalResource`, which stays a surface environmental
 * descriptor for settlement-site scoring. Surface ores adapt into this
 * shape; landmark-owned cave deposits are authored here directly.
 *
 * @domain world
 */

import type { NaturalResource } from './naturalResources'
import {
  spatialContextsEqual,
  WORLD_SPATIAL_CONTEXT_SURFACE,
  type WorldSpatialContext,
} from '../world/spatialContext'
import {
  isMineableOre,
  type MineableOre,
  resolveRemaining,
  type ResourceDepletionState,
} from './depositMining'

/**
 * Authoritative mineable deposit used by streaming, queries and `mine()`.
 *
 * `richness` is quality/significance, never raw quantity. `initialReserve`
 * is the optional finite extractable capacity; absent means the existing
 * richness-derived hit count.
 *
 * @domain world
 */
export type MineableDepositDefinition = {
  id: string
  type: MineableOre
  x: number
  y: number
  z: number
  spatialContext: WorldSpatialContext
  richness: number
  /** Explicit initial extractable quantity. Omit to keep `hitsForRichness`. */
  initialReserve?: number
  radius: number
}

export type DepositQueryOptions = {
  y?: number
  /** Querier spatial domain. Defaults to surface so NPC miners keep
   *  receiving only ordinary surface targets until cave traversal exists. */
  spatialContext?: WorldSpatialContext
}

/** Surface ore `NaturalResource` → canonical mineable definition. */
export function mineableDepositFromNaturalResource(
  resource: NaturalResource,
  sampleHeight: (x: number, z: number) => number,
): MineableDepositDefinition | null {
  if (!isMineableOre(resource.type)) return null
  return {
    id: resource.id,
    type: resource.type,
    x: resource.x,
    y: sampleHeight(resource.x, resource.z),
    z: resource.z,
    spatialContext: WORLD_SPATIAL_CONTEXT_SURFACE,
    richness: resource.richness,
    radius: resource.radius,
  }
}

/**
 * Remaining hits: persisted override (including 0) wins; else explicit
 * initial reserve; else richness-derived 3–7.
 *
 * @domain world
 */
export function resolveDepositRemaining(
  state: ResourceDepletionState,
  definition: Pick<MineableDepositDefinition, 'id' | 'richness' | 'initialReserve'>,
): number {
  return resolveRemaining(state, definition.id, definition.richness, definition.initialReserve)
}

export function querySpatialContext(
  options?: DepositQueryOptions,
): WorldSpatialContext {
  return options?.spatialContext ?? WORLD_SPATIAL_CONTEXT_SURFACE
}

/** Resource queries filter spatial domain; they do not pathfind. */
export function depositMatchesQueryContext(
  definition: Pick<MineableDepositDefinition, 'spatialContext'>,
  queryContext: WorldSpatialContext,
): boolean {
  return spatialContextsEqual(definition.spatialContext, queryContext)
}
