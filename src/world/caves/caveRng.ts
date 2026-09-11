/** Plan world-terrain-008 B1 — deterministic, purpose-scoped RNG streams for
 *  Cave V2 production topology generation.
 *
 *  Milestone A's `buildSpikeTestTopology` derived every stream from the
 *  *world seed* alone (`seed ^ FEATURE_SEED_OFFSET`, ...), so every cave in
 *  the same world received the same feature roll and the same local wobble
 *  sequence, only transformed by each cave's own position/orientation —
 *  deterministic, but structurally clone-like (see implementation notes
 *  "All caves share the same structural RNG pattern").
 *
 *  Production streams instead key off each cave's own stable identity
 *  (`caveId`, already a pure function of world seed + site coordinates — see
 *  `caveIdentity.ts`) plus a purpose-specific salt, so different caves get
 *  independent structural decisions and toggling one purpose's detail never
 *  perturbs another's.
 *
 * @domain world-terrain
 */

import { createSeededRandom } from '../parseSeed'

function hashCaveStream(caveId: string, salt: number): number {
  let h = (salt ^ 0x2545f491) >>> 0
  for (let i = 0; i < caveId.length; i++) {
    h = Math.imul(h ^ caveId.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  h = (h ^ (h >>> 16)) >>> 0
  return h >>> 0
}

/** One salt per independent structural decision — never share a stream
 *  across purposes (that reintroduces call-order sensitivity within a
 *  single cave's own generation). */
export const CAVE_RNG_SALT = {
  structure: 0x01,
  feature: 0x02,
  centerline: 0x03,
  branch: 0x04,
  /** Cave heightfield spike (plan world-terrain-018): chamber lobe layout. */
  lobes: 0x05,
  /** Cave heightfield spike: low-frequency lateral wall variation. */
  macro: 0x06,
  /** Cave heightfield spike: floor detail noise. */
  floorDetail: 0x07,
  /** Cave heightfield spike: ceiling detail noise (independent of the floor). */
  ceilDetail: 0x08,
  /** Plan world-terrain-020: the per-cave `natural` vs `adventure` roll for a
   *  cave that is not the guaranteed home adventure cave. Its own stream so
   *  the roll never shifts a cave's structural/feature/branch sequence. */
  archetype: 0x09,
  /** Plan world-terrain-020: adventure route leg lengths and turn angles. */
  adventureLayout: 0x0a,
  /** Plan world-terrain-020: adventure cross-sections (widths/heights). */
  adventureShape: 0x0b,
  /** Plan world-terrain-020: adventure side-branch angle/length. */
  adventureBranch: 0x0c,
  /** Plan world-terrain-020: adventure chamber shelf/overhang features. */
  adventureFeature: 0x0d,
  /** Plan world-terrain-020: adventure passage centerline wobble. */
  adventureCenterline: 0x0e,
  /** Plan world-terrain-020 Stage B: preferred wall-side for content anchors.
   *  Own stream so yaw/offset never shifts topology or heightfield noise. */
  adventureContent: 0x0f,
  /** Plan world-terrain-022: generic interior rock/boulder clutter
   *  placement (size, position candidate order, yaw, scale, clustering).
   *  Own stream so toggling clutter never perturbs topology, heightfield
   *  noise or adventure content-anchor placement. */
  interiorRocks: 0x10,
} as const

/** Fresh `[0,1)` generator for `(caveId, salt)` — deterministic, and
 *  independent of any other cave's id or of world build/iteration order. */
export function createCaveRandom(caveId: string, salt: number): () => number {
  return createSeededRandom(hashCaveStream(caveId, salt))
}
