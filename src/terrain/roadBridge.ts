/**
 * @domain world-terrain
 * @system roads
 * @role Bridge *projection* geometry — the plain-data `RoadBridgeSpec` an
 *   already-declared canonical `RoadRiverCrossing(kind = 'bridge')` (plan
 *   world-terrain-023) is turned into, plus the one oriented-footprint test
 *   every consumer shares (plan world-terrain-033). Mirrors `riverFord.ts`'s
 *   split: this module owns worker-safe type + pure query, `roadNetwork.ts`
 *   owns the settlement-layer projection (`bridgeSpecOf`) and bounded query
 *   (`bridgesNear`), same "terrain owns the shared shape, settlement produces
 *   it" seam `RoadCorridorSegment`/`FordProjection` already use.
 * @integration `terrain/chunkHeightmap.ts` reads {@link isOnBridgeDeck} to
 *   suppress road-height/tint shaping under an open span (never the river
 *   carve). `terrain/chunkManager.ts` reads the same test for bridge
 *   presentation ownership and the shared movement-ground query
 *   (`sampleBridgeDeck`/`sampleSurfaceGround`). No THREE.js, no route/crossing
 *   search — every bridge here is already decided.
 */

/** Deterministic, presentation-free bridge deck — plain numeric/string data
 *  only, worker-safe like `RoadCorridorSegment`/`FordProjection`. `id` is the
 *  owning `RoadRiverCrossing.id`, stable across chunk streaming order. */
export type RoadBridgeSpec = {
  id: string
  /** Deck center (world X/Z) — the crossing anchor. */
  x: number
  z: number
  /** Road heading through the crossing, `yawToward` convention. */
  yaw: number
  /** Unit road direction (`directionFromYaw(yaw)`), carried alongside `yaw`
   *  so every consumer can project into deck-local space without
   *  recomputing trig per query. */
  dirX: number
  dirZ: number
  /** Full deck length along the road, channel span plus bank/abutment
   *  clearance on both ends. */
  span: number
  /** Full deck width across the road. */
  width: number
  /** Deck walking-surface elevation — the one Y every consumer (presentation,
   *  movement ground, terrain-mask ownership) agrees on. */
  deckY: number
  /** Visual deck slab thickness (world units), presentation-only. */
  deckThickness: number
}

/** Projects `(x, z)` into `spec`'s deck-local frame: `along` the road axis
 *  (0 at the crossing anchor), `across` it. The one coordinate change every
 *  footprint test in this module builds on. */
function deckLocalCoords(spec: RoadBridgeSpec, x: number, z: number): { along: number, across: number } {
  const dx = x - spec.x
  const dz = z - spec.z
  return {
    along: dx * spec.dirX + dz * spec.dirZ,
    across: -dx * spec.dirZ + dz * spec.dirX,
  }
}

/** Whether `(x, z)` lies inside `spec`'s finite oriented deck rectangle — the
 *  single shared footprint presentation, the movement-ground query and the
 *  terrain-mask suppression all use, so they can never disagree on
 *  dimensions (plan world-terrain-033 §5/§8). */
export function isOnBridgeDeck(spec: RoadBridgeSpec, x: number, z: number): boolean {
  const { along, across } = deckLocalCoords(spec, x, z)
  return Math.abs(along) <= spec.span * 0.5 && Math.abs(across) <= spec.width * 0.5
}

/** First matching deck Y among `specs` at `(x, z)`, or `null` outside every
 *  footprint — the shared movement-ground query (plan world-terrain-033 §7).
 *  Specs never meaningfully overlap (bridges don't stack), so first-match is
 *  as good as strongest-match and needs no extra bookkeeping. */
export function bridgeDeckYAt(specs: readonly RoadBridgeSpec[], x: number, z: number): number | null {
  for (const spec of specs) {
    if (isOnBridgeDeck(spec, x, z)) return spec.deckY
  }
  return null
}

/** `true` when `(x, z)` falls inside any of `specs`' deck footprints — the
 *  terrain-mask suppression test (plan world-terrain-033 §8): road height/tint
 *  shaping must not carve a causeway under a real bridge deck. */
export function isOnAnyBridgeDeck(x: number, z: number, specs: readonly RoadBridgeSpec[]): boolean {
  for (const spec of specs) {
    if (isOnBridgeDeck(spec, x, z)) return true
  }
  return false
}
