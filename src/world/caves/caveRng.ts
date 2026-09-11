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
} as const

/** Fresh `[0,1)` generator for `(caveId, salt)` — deterministic, and
 *  independent of any other cave's id or of world build/iteration order. */
export function createCaveRandom(caveId: string, salt: number): () => number {
  return createSeededRandom(hashCaveStream(caveId, salt))
}
