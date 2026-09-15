/**
 * Presentation-only distance contract answering: up to what distance can
 * outdoor rendering safely assume that streamed terrain exists strongly
 * enough to support visible world objects (settlement buildings, cave
 * mouths, ...)? Derived only from `chunkSize`/`loadRadius` — the guaranteed
 * desired streaming ring — never from `unloadRadius`, which is retention
 * hysteresis and can vary with travel direction/history. Consumed by
 * `weatherVisuals.ts::capOutdoorFogToTerrainHorizon` to cap outdoor scene
 * fog so terrain-dependent meshes fade out before unsupported terrain can
 * be exposed. Must never influence simulation, streaming, or persistence.
 *
 * @domain world-terrain
 */
export type TerrainVisualHorizon = {
  /** Outdoor fog starts pulling in at this distance. */
  fadeStart: number
  /** Outdoor fog is fully opaque at/after this distance. Always inside the
   *  guaranteed `loadRadius * chunkSize` streamed-terrain footprint. */
  opaqueAt: number
}

/**
 * Pure. `loadRadius` is a Chebyshev chunk radius around the player's
 * current chunk, so the minimum guaranteed straight-line coverage from any
 * player position inside that chunk is `loadRadius * chunkSize` (worst case:
 * player standing at the far edge of their own chunk). `opaqueAt` is pulled
 * in from that guarantee by a safety margin rather than placed exactly on
 * the mathematical edge, and `fadeStart` sits a transition width before it
 * so the streaming boundary reads as a soft fade rather than a hard wall.
 *
 * @domain world-terrain
 */
export function terrainVisualHorizon(input: {
  chunkSize: number
  loadRadius: number
}): TerrainVisualHorizon {
  const { chunkSize, loadRadius } = input
  const guaranteed = loadRadius * chunkSize
  const opaqueAt = Math.max(chunkSize * 0.5, guaranteed - chunkSize * 0.5)
  const transitionWidth = Math.max(chunkSize * 0.35, opaqueAt * 0.25)
  const fadeStart = Math.max(chunkSize * 0.25, opaqueAt - transitionWidth)
  return { fadeStart, opaqueAt }
}
