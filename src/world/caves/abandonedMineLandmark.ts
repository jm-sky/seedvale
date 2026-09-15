/**
 * Catalog-owned abandoned mountain-mine landmark (plan world-terrain-017).
 *
 * `mineId` is semantic identity derived from world seed + a stable slot.
 * `caveId` is production cave identity. They remain distinct and bind
 * deterministically. Selection never creates a cave archetype, never
 * consumes generic cave RNG, and never inspects quest/save/container state.
 *
 * @domain world-terrain
 */

import type { LargeCavePlacementInput, LargeCaveSite } from '../largeCaves'
import type { CaveArchetype } from './caveArchetype'
import type { CaveTopology } from './caveTopology'
import { makeCaveId } from './caveIdentity'
import { pickMountainCaveSite } from './mountainCaveSites'
import {
  bestMassifNeighbourhood,
  collectSuitableMassifs,
  evaluateMassifSuitability,
  type MassifHit,
  type MassifSampleFns,
  type MassifSearchEnvelope,
} from './mountainMassif'

/** Stable semantic slot — never derived from a cave array index. */
export const ABANDONED_MINE_SLOT = 'abandoned-mountain-mine'
const MINE_ID_SALT = 0xa81e017

/** Bounded regional search: expand before any macro-terrain fallback. */
export const MINE_SEARCH_ENVELOPES: readonly MassifSearchEnvelope[] = [
  { minDist: 180, maxDist: 900 },
  { minDist: 900, maxDist: 1800 },
  { minDist: 1800, maxDist: 2800 },
]

const MASSIFS_TRIED_PER_ENVELOPE = 8

export type AbandonedMineCaveSource = 'existing-cave' | 'guaranteed-site'

/**
 * Semantic mine landmark. No topology, heightfield or runtime object is
 * copied here — only identity and the representative entrance position.
 *
 * @domain world-terrain
 */
export type AbandonedMineLandmark = {
  mineId: string
  caveId: string
  x: number
  z: number
  caveSource: AbandonedMineCaveSource
}

export type AbandonedMineAuthoredExclusions = {
  /** Deterministic world-composition reservations (quest cave bindings). */
  reservedCaveIds?: ReadonlySet<string>
  /** Authored anchor ids already claimed by an incompatible binding. */
  claimedAnchorIds?: ReadonlySet<string>
}

export type AbandonedMineEligibleCave = {
  caveId: string
  archetype: CaveArchetype
  x: number
  z: number
  topology: CaveTopology
  contentAnchorIds?: readonly string[]
}

export type AbandonedMineExtraAssignment = {
  site: LargeCaveSite
  caveId: string
  archetype: Exclude<CaveArchetype, 'dungeon'>
  topology: CaveTopology
}

export type AbandonedMineResolveInput = {
  seed: number
  placement: LargeCavePlacementInput
  samples: MassifSampleFns
  acceptedCaves: readonly AbandonedMineEligibleCave[]
  buildTopology: (site: LargeCaveSite, archetype: CaveArchetype) => CaveTopology | null
  exclusions?: AbandonedMineAuthoredExclusions
}

export type AbandonedMineResolveResult = {
  landmark: AbandonedMineLandmark
  extraAssignment: AbandonedMineExtraAssignment | null
  envelopeIndex: number
  usedGuarantee: boolean
  usedDegradedMassif: boolean
}

/**
 * `mineId` from world seed + semantic slot. Independent of cave identity,
 * array order and presentation lifetime.
 *
 * @domain world-terrain
 */
export function makeMineId(seed: number, slot: string = ABANDONED_MINE_SLOT): string {
  let h = (seed ^ MINE_ID_SALT) >>> 0
  for (let i = 0; i < slot.length; i++) {
    h = Math.imul(h ^ slot.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  h = (h ^ (h >>> 16)) >>> 0
  return `abandonedMine:${h.toString(16).padStart(8, '0')}`
}

/**
 * Cave id created only for the landmark guarantee — skip it in quest
 * hash-picks so adding the mine cannot retarget existing cave stories.
 *
 * @domain world-terrain
 */
export function landmarkRequiredMineCaveId(
  landmark: AbandonedMineLandmark | null | undefined,
): string | null {
  return landmark?.caveSource === 'guaranteed-site' ? landmark.caveId : null
}

/**
 * Structural capacity: a walk-in cave with a chamber. No mesh scan.
 *
 * @domain world-terrain
 */
export function caveHasMineCapacity(topology: CaveTopology): boolean {
  return topology.nodes.some((node) => node.kind === 'chamber') && topology.segments.length >= 1
}

/**
 * V1 eligibility: natural/adventure, spatially a massif, not dungeon, not
 * reserved by an incompatible authored binding. Does not inspect mutable
 * loot/quest/save state and does not mutate claims.
 *
 * @domain world-terrain
 */
export function caveIsMineEligible(
  cave: AbandonedMineEligibleCave,
  samples: MassifSampleFns,
  exclusions?: AbandonedMineAuthoredExclusions,
): boolean {
  if (cave.archetype === 'dungeon') return false
  if (cave.archetype !== 'natural' && cave.archetype !== 'adventure') return false
  if (exclusions?.reservedCaveIds?.has(cave.caveId)) return false
  if (cave.contentAnchorIds?.some((id) => exclusions?.claimedAnchorIds?.has(id))) return false
  if (!caveHasMineCapacity(cave.topology)) return false
  return evaluateMassifSuitability(cave.x, cave.z, samples).suitable
}

function homeDistance(x: number, z: number): number {
  return Math.hypot(x, z)
}

function inEnvelope(x: number, z: number, envelope: MassifSearchEnvelope): boolean {
  const dist = homeDistance(x, z)
  return dist >= envelope.minDist && dist <= envelope.maxDist
}

function placedFromAccepted(accepted: readonly AbandonedMineEligibleCave[]): LargeCaveSite[] {
  return accepted.map((cave) => ({
    x: cave.x,
    z: cave.z,
    yaw: 0,
    length: 12,
    variant: 0,
  }))
}

function compareExisting(
  a: { score: number, caveId: string },
  b: { score: number, caveId: string },
): number {
  if (a.score !== b.score) return b.score - a.score
  return a.caveId < b.caveId ? -1 : a.caveId > b.caveId ? 1 : 0
}

function tryGuaranteeAtMassif(
  input: AbandonedMineResolveInput,
  massif: MassifHit,
  placed: LargeCaveSite[],
): AbandonedMineExtraAssignment | null {
  const site = pickMountainCaveSite(input.placement, massif.x, massif.z, placed)
  if (!site) return null
  for (const archetype of ['natural', 'adventure'] as const) {
    const topology = input.buildTopology(site, archetype)
    if (!topology || !caveHasMineCapacity(topology)) continue
    const caveId = topology.caveId || makeCaveId(input.seed, site)
    return { site, caveId, archetype, topology }
  }
  return null
}

function landmarkFromExisting(
  seed: number,
  cave: AbandonedMineEligibleCave,
): AbandonedMineLandmark {
  return {
    mineId: makeMineId(seed),
    caveId: cave.caveId,
    x: cave.x,
    z: cave.z,
    caveSource: 'existing-cave',
  }
}

function landmarkFromGuarantee(
  seed: number,
  assignment: AbandonedMineExtraAssignment,
): AbandonedMineLandmark {
  return {
    mineId: makeMineId(seed),
    caveId: assignment.caveId,
    x: assignment.site.x,
    z: assignment.site.z,
    caveSource: 'guaranteed-site',
  }
}

/**
 * Bounded regional search for the abandoned mine:
 * existing suitable massif + eligible accepted cave, then existing massif +
 * guaranteed production site, then a degraded existing-terrain neighbourhood
 * if no fully suitable massif exists. Does not inject macro terrain.
 *
 * @domain world-terrain
 */
export function resolveAbandonedMineLandmark(
  input: AbandonedMineResolveInput,
): AbandonedMineResolveResult | null {
  const placed = placedFromAccepted(input.acceptedCaves)

  for (let envelopeIndex = 0; envelopeIndex < MINE_SEARCH_ENVELOPES.length; envelopeIndex++) {
    const envelope = MINE_SEARCH_ENVELOPES[envelopeIndex]!

    const existing: { cave: AbandonedMineEligibleCave, score: number }[] = []
    for (const cave of input.acceptedCaves) {
      if (!inEnvelope(cave.x, cave.z, envelope)) continue
      if (!caveIsMineEligible(cave, input.samples, input.exclusions)) continue
      const evaluation = evaluateMassifSuitability(cave.x, cave.z, input.samples)
      existing.push({ cave, score: evaluation.score })
    }
    existing.sort((a, b) => compareExisting(
      { score: a.score, caveId: a.cave.caveId },
      { score: b.score, caveId: b.cave.caveId },
    ))
    const bestExisting = existing[0]
    if (bestExisting) {
      return {
        landmark: landmarkFromExisting(input.seed, bestExisting.cave),
        extraAssignment: null,
        envelopeIndex,
        usedGuarantee: false,
        usedDegradedMassif: false,
      }
    }

    const massifs = collectSuitableMassifs(envelope, input.samples).slice(0, MASSIFS_TRIED_PER_ENVELOPE)
    for (const massif of massifs) {
      const extra = tryGuaranteeAtMassif(input, massif, placed)
      if (!extra) continue
      return {
        landmark: landmarkFromGuarantee(input.seed, extra),
        extraAssignment: extra,
        envelopeIndex,
        usedGuarantee: true,
        usedDegradedMassif: false,
      }
    }
  }

  const lastEnvelope = MINE_SEARCH_ENVELOPES[MINE_SEARCH_ENVELOPES.length - 1]!
  const degraded = bestMassifNeighbourhood(lastEnvelope, input.samples)
  if (degraded && degraded.evaluation.meanRidge > 0.08) {
    const extra = tryGuaranteeAtMassif(input, degraded, placed)
    if (extra) {
      return {
        landmark: landmarkFromGuarantee(input.seed, extra),
        extraAssignment: extra,
        envelopeIndex: MINE_SEARCH_ENVELOPES.length - 1,
        usedGuarantee: true,
        usedDegradedMassif: true,
      }
    }
  }

  return null
}
