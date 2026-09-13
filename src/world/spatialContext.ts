/**
 * Authoritative gameplay spatial identity for stacked surface/cave spaces at
 * the same X/Z. Derived from world position — not persisted per entity.
 *
 * @domain world
 */

export type WorldSpatialContext =
  | { kind: 'surface' }
  | { kind: 'cave', caveId: string }

/** Canonical immutable surface value — reuse instead of allocating per target. */
export const WORLD_SPATIAL_CONTEXT_SURFACE: WorldSpatialContext = { kind: 'surface' }

export function caveSpatialContext(caveId: string): WorldSpatialContext {
  return { kind: 'cave', caveId }
}

/** Semantic equality — never compare context objects by reference. */
export function spatialContextsEqual(a: WorldSpatialContext, b: WorldSpatialContext): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'surface') return true
  return a.caveId === (b as { kind: 'cave', caveId: string }).caveId
}
