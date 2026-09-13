/** Plan world-terrain-028 — derived adventure-cave content profiles and
 *  authored reservation/anchor-claim arbitration. Not persisted; reconstructs
 *  from accepted cave ids + declarative requests on every world build.
 *
 * @domain world-terrain
 */

import type { CaveContentAnchor } from './caveContentAnchors'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'

export const ADVENTURE_CAVE_CONTENT_PROFILES = ['EMPTY', 'QUEST_TREASURE', 'DOUBLE_TREASURE'] as const

export type AdventureCaveContentProfile = (typeof ADVENTURE_CAVE_CONTENT_PROFILES)[number]

/** Unreserved adventure caves roll below this threshold for `DOUBLE_TREASURE`. */
export const DOUBLE_TREASURE_PROFILE_THRESHOLD = 0.20

/**
 * Reserves an adventure cave's derived profile before the generic loot roll.
 * `EMPTY` blocks the 20% double-chest encounter for quest-owned caves.
 *
 * @domain world-terrain
 */
export type CaveAdventureProfileReservationRequest = {
  reservationKey: string
  caveId: string
  profile: 'QUEST_TREASURE' | 'EMPTY'
}

/**
 * Claims one concrete content anchor for authored story/loot placement.
 *
 * @domain world-terrain
 */
export type CaveContentAnchorClaimRequest = {
  reservationKey: string
  anchorId: string
}

export type CaveContentReservationRequests = {
  profileReservations?: readonly CaveAdventureProfileReservationRequest[]
  anchorClaims?: readonly CaveContentAnchorClaimRequest[]
}

export type ResolvedAnchorClaim = {
  reservationKey: string
  anchorId: string
  caveId: string
}

export type UnresolvedReservationReason =
  | 'cave_not_adventure'
  | 'cave_not_found'
  | 'profile_conflict'
  | 'anchor_not_found'
  | 'anchor_already_claimed'

export type UnresolvedReservation = {
  reservationKey: string
  reason: UnresolvedReservationReason
}

/**
 * Read-only derived policy for one world build. Query live from `WorldBundle`
 * after rebuild — do not capture across cave regeneration.
 *
 * @domain world-terrain
 */
export type CaveAdventureContentPolicy = {
  profileOf: (caveId: string) => AdventureCaveContentProfile | undefined
  claimOf: (reservationKey: string) => ResolvedAnchorClaim | undefined
  unresolved: readonly UnresolvedReservation[]
}

const EMPTY_UNRESOLVED: readonly UnresolvedReservation[] = Object.freeze([])

function anchorIndexById(anchors: readonly CaveContentAnchor[]): Map<string, CaveContentAnchor> {
  const map = new Map<string, CaveContentAnchor>()
  for (const a of anchors) map.set(a.id, a)
  return map
}

/**
 * Deterministic profile roll + authored arbitration for accepted adventure
 * caves. Anchor claims are validated against the supplied anchor list.
 *
 * @domain world-terrain
 */
export function resolveCaveAdventureContentPolicy(
  adventureCaveIds: readonly string[],
  contentAnchors: readonly CaveContentAnchor[],
  requests: CaveContentReservationRequests = {},
): CaveAdventureContentPolicy {
  const adventureSet = new Set(adventureCaveIds)
  const sortedCaveIds = [...adventureCaveIds].sort()
  const anchorById = anchorIndexById(contentAnchors)

  const profileByCave = new Map<string, AdventureCaveContentProfile>()
  const anchorOwner = new Map<string, string>()
  const claimByKey = new Map<string, ResolvedAnchorClaim>()
  const unresolved: UnresolvedReservation[] = []

  const profileReservations = [...(requests.profileReservations ?? [])].sort((a, b) =>
    a.reservationKey.localeCompare(b.reservationKey),
  )
  for (const req of profileReservations) {
    if (!adventureSet.has(req.caveId)) {
      unresolved.push({ reservationKey: req.reservationKey, reason: 'cave_not_found' })
      continue
    }
    if (profileByCave.has(req.caveId)) {
      unresolved.push({ reservationKey: req.reservationKey, reason: 'profile_conflict' })
      continue
    }
    profileByCave.set(req.caveId, req.profile === 'EMPTY' ? 'EMPTY' : 'QUEST_TREASURE')
  }

  const anchorClaims = [...(requests.anchorClaims ?? [])].sort((a, b) =>
    a.reservationKey.localeCompare(b.reservationKey),
  )
  for (const req of anchorClaims) {
    const anchor = anchorById.get(req.anchorId)
    if (!anchor) {
      unresolved.push({ reservationKey: req.reservationKey, reason: 'anchor_not_found' })
      continue
    }
    if (!adventureSet.has(anchor.caveId)) {
      unresolved.push({ reservationKey: req.reservationKey, reason: 'cave_not_adventure' })
      continue
    }
    const existingOwner = anchorOwner.get(req.anchorId)
    if (existingOwner !== undefined) {
      unresolved.push({ reservationKey: req.reservationKey, reason: 'anchor_already_claimed' })
      continue
    }
    anchorOwner.set(req.anchorId, req.reservationKey)
    claimByKey.set(req.reservationKey, {
      reservationKey: req.reservationKey,
      anchorId: req.anchorId,
      caveId: anchor.caveId,
    })
  }

  for (const caveId of sortedCaveIds) {
    if (profileByCave.has(caveId)) continue
    const random = createCaveRandom(caveId, CAVE_RNG_SALT.adventureContentProfile)
    profileByCave.set(
      caveId,
      random() < DOUBLE_TREASURE_PROFILE_THRESHOLD ? 'DOUBLE_TREASURE' : 'EMPTY',
    )
  }

  const frozenProfiles = Object.freeze(profileByCave) as Map<string, AdventureCaveContentProfile>
  const frozenClaims = Object.freeze(claimByKey) as Map<string, ResolvedAnchorClaim>
  const frozenUnresolved = unresolved.length === 0
    ? EMPTY_UNRESOLVED
    : Object.freeze(unresolved) as readonly UnresolvedReservation[]

  return {
    profileOf(caveId: string): AdventureCaveContentProfile | undefined {
      return frozenProfiles.get(caveId)
    },
    claimOf(reservationKey: string): ResolvedAnchorClaim | undefined {
      return frozenClaims.get(reservationKey)
    },
    unresolved: frozenUnresolved,
  }
}
