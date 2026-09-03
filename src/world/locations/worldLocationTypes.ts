export type WorldLocationKind = 'settlement' | 'cave' | 'cemetery' | 'lake' | 'mountainPeak'

/**
 * A concrete, named place in the world (plan world-012) — pure world data,
 * never a Three.js/render object. Identity (`id`) is stable across reloads:
 * derived from world seed + source generator, never from save-game state.
 *
 * `id` is self-describing (`<kind>:<sourceId>`, except `cemetery` which
 * reuses `chunkEnvironment.ts`'s own `cemetery:...` landmark id verbatim) so
 * `worldLocationCatalog.ts` can resolve a location back to its position by
 * id alone, without keeping a global index of every location that ever
 * existed.
 */
export type WorldLocation = {
  id: string
  kind: WorldLocationKind
  x: number
  z: number
  name: string
  /** Ranks how "worth mentioning" a landmark is when the guard/merchant pick
   *  from a pool of candidates (plan §5) — not a spawn probability. `0` for
   *  `settlement` (plan §5 — settlements use nearest-distance, never this
   *  pool). */
  discoveryWeight: number
}

export type DiscoveryRange = 'near' | 'medium' | 'far'

const WORLD_LOCATION_KINDS: readonly WorldLocationKind[] = ['settlement', 'cave', 'cemetery', 'lake', 'mountainPeak']

/**
 * Reads the `WorldLocationKind` encoded in a `WorldLocation.id`'s
 * `<kind>:...` prefix (see the `id` doc above). For callers that only need
 * the kind and want to avoid a full `WorldLocationCatalog.getById()` resolve
 * — e.g. per-frame world-map marker colouring, where `getById` can mean an
 * array scan (caves) or a chunk lookup (cemeteries) per visible marker.
 * `null` for a malformed id.
 */
export function worldLocationKindFromId(id: string): WorldLocationKind | null {
  const sep = id.indexOf(':')
  if (sep < 0) return null
  const candidate = id.slice(0, sep)
  return (WORLD_LOCATION_KINDS as readonly string[]).includes(candidate) ? (candidate as WorldLocationKind) : null
}
