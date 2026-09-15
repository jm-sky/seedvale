/**
 * World-resource-owned gold deposits for the abandoned mountain mine
 * (plan world-018). Consumes the `world-terrain-017` landmark and Cave V2
 * interior placement candidates — never rescans terrain or selects a cave.
 *
 * @domain world
 */

import type { AbandonedMineLandmark } from '../world/caves/abandonedMineLandmark'
import type { CaveInteriorPlacementCandidate, CaveInteriorPlacementView } from '../world/caves/caveInteriorPlacement'
import type { MineableDepositDefinition } from './mineableDeposit'
import { openingDirection } from '../world/caves/caveOrientation'
import { createSeededRandom } from '../world/parseSeed'
import {
  caveSpatialContext,
  WORLD_SPATIAL_CONTEXT_SURFACE,
  type WorldSpatialContext,
} from '../world/spatialContext'

export const MINE_GOLD_SLOTS = [
  'exterior-primary',
  'exterior-secondary',
  'interior-shallow',
  'interior-mid',
  'interior-deep',
] as const

export type MineGoldSlot = (typeof MINE_GOLD_SLOTS)[number]

const EXTERIOR_SLOTS: readonly MineGoldSlot[] = ['exterior-primary', 'exterior-secondary']
const INTERIOR_SLOTS: readonly MineGoldSlot[] = ['interior-shallow', 'interior-mid', 'interior-deep']

const TOTAL_SALT = 'mine-gold-total'
const PLACEMENT_SALT = 'mine-gold-placement'
const WEIGHT_SALT = 'mine-gold-reserve-weights'

const MIN_TOTAL_RESERVE = 500
const MAX_TOTAL_RESERVE = 1000
const MIN_SLOT_RESERVE = 20
const MINE_DEPOSIT_RADIUS = 6
const MIN_DEPOSIT_SEPARATION = 5
const MIN_ENTRANCE_DISTANCE = 6
const ENTRANCE_CENTERLINE_KEEP = 3
const ANCHOR_CLEARANCE = 2.4
const LAND_MARGIN = 0.5

const BASE_SLOT_WEIGHT: Record<MineGoldSlot, number> = {
  'exterior-primary': 1.0,
  'exterior-secondary': 0.9,
  'interior-shallow': 1.15,
  'interior-mid': 1.3,
  'interior-deep': 1.45,
}

const SLOT_RICHNESS: Record<MineGoldSlot, number> = {
  'exterior-primary': 0.82,
  'exterior-secondary': 0.8,
  'interior-shallow': 0.9,
  'interior-mid': 0.94,
  'interior-deep': 0.98,
}

const EXTERIOR_OFFSETS: readonly { along: number, side: number }[] = [
  { along: 10, side: 6.5 },
  { along: 12, side: -7 },
  { along: 8.5, side: 8.5 },
  { along: 14, side: -5.5 },
  { along: 9, side: -9 },
  { along: 13, side: 5 },
  { along: 16, side: 8 },
  { along: 16, side: -8 },
  { along: 11, side: 11 },
  { along: 11, side: -11 },
]

export type AbandonedMineDepositInput = {
  worldSeed: number
  landmark: AbandonedMineLandmark
  placement: CaveInteriorPlacementView
  sampleHeight: (x: number, z: number) => number
  waterLevel: number
  spatialContextAt: (x: number, y: number, z: number) => WorldSpatialContext
  contentAnchors?: readonly { x: number, z: number }[]
}

type SlotBinding = {
  slot: MineGoldSlot
  x: number
  y: number
  z: number
  spatialContext: WorldSpatialContext
}

function hashMineStream(worldSeed: number, mineId: string, salt: string): number {
  let h = (worldSeed ^ 0x018ca7e) >>> 0
  for (let i = 0; i < mineId.length; i++) {
    h = Math.imul(h ^ mineId.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  return (h ^ (h >>> 16)) >>> 0
}

function mineRng(worldSeed: number, mineId: string, salt: string): () => number {
  return createSeededRandom(hashMineStream(worldSeed, mineId, salt))
}

/** Stable deposit id from mine identity + semantic slot — never candidate order. */
export function mineGoldDepositId(mineId: string, slot: MineGoldSlot): string {
  return `${mineId}:gold:${slot}`
}

/**
 * Deterministic total mine reserve in 500–1000, triangular-like around 750.
 *
 * @domain world
 */
export function pickMineGoldTotalReserve(rng: () => number): number {
  const a = MIN_TOTAL_RESERVE + rng() * (MAX_TOTAL_RESERVE - MIN_TOTAL_RESERVE)
  const b = MIN_TOTAL_RESERVE + rng() * (MAX_TOTAL_RESERVE - MIN_TOTAL_RESERVE)
  return Math.round((a + b) * 0.5)
}

/**
 * Integer reserves that sum exactly to `total`. Largest-remainder method,
 * then a min-per-slot lift taken from the current largest share.
 *
 * @domain world
 */
export function allocateIntegerReserves(total: number, weights: readonly number[]): number[] {
  const n = weights.length
  if (n === 0) return []
  const minEach = Math.min(MIN_SLOT_RESERVE, Math.floor(total / n))
  const sumW = weights.reduce((sum, weight) => sum + weight, 0)
  const safeSum = sumW > 0 ? sumW : n
  const raw = weights.map((weight) => (weight / safeSum) * total)
  const result = raw.map((value) => Math.floor(value))
  let remainder = total - result.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  let step = 0
  while (remainder > 0) {
    result[order[step % n]!.index]! += 1
    remainder -= 1
    step += 1
  }
  for (let i = 0; i < n; i++) {
    const deficit = minEach - result[i]!
    if (deficit <= 0) continue
    let donor = 0
    for (let j = 1; j < n; j++) {
      if (result[j]! > result[donor]!) donor = j
    }
    if (result[donor]! - deficit < minEach && donor === i) continue
    if (result[donor]! - deficit < 1) continue
    result[i] = minEach
    result[donor]! -= deficit
  }
  return result
}

function farEnough(x: number, z: number, taken: readonly { x: number, z: number }[]): boolean {
  return taken.every((point) => Math.hypot(point.x - x, point.z - z) >= MIN_DEPOSIT_SEPARATION)
}

function clearOfAnchors(
  x: number,
  z: number,
  anchors: readonly { x: number, z: number }[],
): boolean {
  return anchors.every((anchor) => Math.hypot(anchor.x - x, anchor.z - z) >= ANCHOR_CLEARANCE)
}

function compareInterior(
  a: CaveInteriorPlacementCandidate,
  b: CaveInteriorPlacementCandidate,
): number {
  if (a.depthFromEntrance !== b.depthFromEntrance) return a.depthFromEntrance - b.depthFromEntrance
  if (a.targetWidth !== b.targetWidth) return b.targetWidth - a.targetWidth
  if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1
  if (a.x !== b.x) return a.x - b.x
  return a.z - b.z
}

function pickInterior(
  pool: readonly CaveInteriorPlacementCandidate[],
  prefer: 'shallow' | 'deep' | 'mid',
  taken: readonly { x: number, z: number }[],
  anchors: readonly { x: number, z: number }[],
): CaveInteriorPlacementCandidate | null {
  const eligible = pool.filter((candidate) => (
    farEnough(candidate.x, candidate.z, taken) && clearOfAnchors(candidate.x, candidate.z, anchors)
  ))
  if (eligible.length === 0) return null
  const ranked = [...eligible].sort(compareInterior)
  if (prefer === 'shallow') return ranked[0] ?? null
  if (prefer === 'deep') return ranked[ranked.length - 1] ?? null
  return ranked[Math.floor((ranked.length - 1) / 2)] ?? null
}

type ExteriorCandidate = { x: number, y: number, z: number, side: number }

function exteriorCandidates(input: AbandonedMineDepositInput, rng: () => number): ExteriorCandidate[] {
  const { placement, landmark, sampleHeight, waterLevel, spatialContextAt } = input
  const out = openingDirection(placement.entrance.yaw)
  const right = { dx: out.dz, dz: -out.dx }
  const originX = landmark.x
  const originZ = landmark.z
  const outList: ExteriorCandidate[] = []
  for (const offset of EXTERIOR_OFFSETS) {
    const along = offset.along + (rng() - 0.5) * 1.2
    const side = offset.side + (rng() - 0.5) * 1.0
    const x = originX + out.dx * along + right.dx * side
    const z = originZ + out.dz * along + right.dz * side
    const y = sampleHeight(x, z)
    if (y <= waterLevel + LAND_MARGIN) continue
    if (Math.hypot(x - originX, z - originZ) < MIN_ENTRANCE_DISTANCE) continue
    const lateral = Math.abs((x - originX) * right.dx + (z - originZ) * right.dz)
    const alongDist = (x - originX) * out.dx + (z - originZ) * out.dz
    if (alongDist >= 0 && alongDist < MIN_ENTRANCE_DISTANCE && lateral < ENTRANCE_CENTERLINE_KEEP) continue
    if (spatialContextAt(x, y, z).kind !== 'surface') continue
    outList.push({ x, y, z, side: offset.side })
  }
  return outList
}

function pickExteriors(
  candidates: readonly ExteriorCandidate[],
  count: number,
): ExteriorCandidate[] {
  if (count <= 0) return []
  const picked: ExteriorCandidate[] = []
  const remaining = [...candidates]
  while (picked.length < count && remaining.length > 0) {
    let bestIndex = 0
    let best = remaining[0]!
    for (let i = 1; i < remaining.length; i++) {
      const candidate = remaining[i]!
      const opposite = picked.length === 1 && Math.sign(candidate.side) !== Math.sign(picked[0]!.side)
      const bestOpposite = picked.length === 1 && Math.sign(best.side) !== Math.sign(picked[0]!.side)
      if (opposite && !bestOpposite) {
        best = candidate
        bestIndex = i
        continue
      }
      if (opposite === bestOpposite && farEnough(candidate.x, candidate.z, picked) && !farEnough(best.x, best.z, picked)) {
        best = candidate
        bestIndex = i
        continue
      }
      if (opposite === bestOpposite && farEnough(candidate.x, candidate.z, picked) === farEnough(best.x, best.z, picked)) {
        if (candidate.x < best.x || (candidate.x === best.x && candidate.z < best.z)) {
          best = candidate
          bestIndex = i
        }
      }
    }
    if (!farEnough(best.x, best.z, picked) && picked.length > 0) {
      remaining.splice(bestIndex, 1)
      continue
    }
    picked.push(best)
    remaining.splice(bestIndex, 1)
  }
  return picked
}

function bindSlots(input: AbandonedMineDepositInput): SlotBinding[] {
  const anchors = input.contentAnchors ?? []
  const interiors = input.placement.candidates.filter((candidate) => (
    candidate.x !== input.landmark.x || candidate.z !== input.landmark.z
  ))
  const placementRng = mineRng(input.worldSeed, input.landmark.mineId, PLACEMENT_SALT)
  const exteriors = exteriorCandidates(input, placementRng)

  const tryLayout = (exteriorCount: number, interiorSlots: readonly MineGoldSlot[]): SlotBinding[] | null => {
    const chosenExteriors = pickExteriors(exteriors, exteriorCount)
    if (chosenExteriors.length < exteriorCount) return null
    const bindings: SlotBinding[] = []
    for (let i = 0; i < chosenExteriors.length; i++) {
      const chosen = chosenExteriors[i]!
      bindings.push({
        slot: EXTERIOR_SLOTS[i]!,
        x: chosen.x,
        y: chosen.y,
        z: chosen.z,
        spatialContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      })
    }
    const taken = bindings.map((binding) => ({ x: binding.x, z: binding.z }))
    const prefers: Record<MineGoldSlot, 'shallow' | 'mid' | 'deep'> = {
      'exterior-primary': 'shallow',
      'exterior-secondary': 'shallow',
      'interior-shallow': 'shallow',
      'interior-mid': 'mid',
      'interior-deep': 'deep',
    }
    for (const slot of interiorSlots) {
      const picked = pickInterior(interiors, prefers[slot], taken, anchors)
      if (!picked) return null
      bindings.push({
        slot,
        x: picked.x,
        y: picked.y,
        z: picked.z,
        spatialContext: caveSpatialContext(input.landmark.caveId),
      })
      taken.push({ x: picked.x, z: picked.z })
    }
    return bindings
  }

  return tryLayout(2, INTERIOR_SLOTS)
    ?? tryLayout(1, INTERIOR_SLOTS)
    ?? tryLayout(2, ['interior-shallow', 'interior-deep'])
    ?? tryLayout(1, ['interior-shallow', 'interior-deep'])
    ?? []
}

function slotWeights(rng: () => number, slots: readonly MineGoldSlot[]): number[] {
  return slots.map((slot) => BASE_SLOT_WEIGHT[slot] * (0.85 + rng() * 0.3))
}

/**
 * Deterministic abandoned-mine gold definitions. Empty when the landmark
 * cannot host the required minimum (1 exterior + 2 interior).
 *
 * @domain world
 */
export function generateAbandonedMineGoldDeposits(
  input: AbandonedMineDepositInput,
): MineableDepositDefinition[] {
  if (input.placement.caveId !== input.landmark.caveId) return []
  const bindings = bindSlots(input)
  const exteriorCount = bindings.filter((binding) => binding.spatialContext.kind === 'surface').length
  const interiorCount = bindings.length - exteriorCount
  if (exteriorCount < 1 || interiorCount < 2) return []

  const totalRng = mineRng(input.worldSeed, input.landmark.mineId, TOTAL_SALT)
  const totalReserve = pickMineGoldTotalReserve(totalRng)
  const weightRng = mineRng(input.worldSeed, input.landmark.mineId, WEIGHT_SALT)
  const slots = bindings.map((binding) => binding.slot)
  const reserves = allocateIntegerReserves(totalReserve, slotWeights(weightRng, slots))

  return bindings.map((binding, index) => ({
    id: mineGoldDepositId(input.landmark.mineId, binding.slot),
    type: 'gold' as const,
    x: binding.x,
    y: binding.y,
    z: binding.z,
    spatialContext: binding.spatialContext,
    richness: SLOT_RICHNESS[binding.slot],
    initialReserve: reserves[index]!,
    radius: MINE_DEPOSIT_RADIUS,
  }))
}
