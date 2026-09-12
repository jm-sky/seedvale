/** Plan world-terrain-020 Stage A — which production recipe a cave site gets,
 *  extended by plan world-terrain-024 with a third `dungeon` recipe.
 *
 *  Pure and Three.js-free: ordering and the roll are decided from the world
 *  seed plus each site's own stable `caveId`, never from streaming/iteration
 *  order and never from the player or camera. Nothing here builds or accepts
 *  a topology — acceptance stays owned by the topology builders, so the home
 *  guarantee is "the first *candidate whose adventure topology is actually
 *  accepted*", not "relabel the nearest cave". The dungeon guarantee is the
 *  same shape over a further band, after the adventure site has been reserved.
 *
 *  Deliberately not persisted: archetype is reproducible from
 *  `(worldSeed, pickLargeCaveSites(), home at the origin)`.
 *
 * @domain world-terrain
 */

import { LARGE_CAVE_MIN_HOME_DIST, type LargeCaveSite } from '../largeCaves'
import { makeCaveId } from './caveIdentity'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'

/** `natural` is the long-standing production cave; `adventure` is the longer,
 *  multi-section variant with a mandatory junction, side chamber and final
 *  chamber (plan world-terrain-020); `dungeon` is the still-larger branched
 *  recipe (plan world-terrain-024). Role/content lives here and on the cave
 *  runtime — never inside representation-neutral `CaveTopology`. */
export type CaveArchetype = 'natural' | 'adventure' | 'dungeon'

/** Deterministic probability that a *non-guaranteed* cave tries the adventure
 *  recipe. A rejected adventure attempt falls back to the unchanged natural
 *  recipe, so this is an attempt rate, not a final population share. */
export const ADVENTURE_ROLL_CHANCE = 0.15

/** Deterministic probability that a cave which is neither the guaranteed
 *  home adventure nor the guaranteed dungeon tries the dungeon recipe.
 *  Own RNG salt; a rejected dungeon still takes its existing adventure roll
 *  and then natural, so this cannot delete a cave. */
export const DUNGEON_ROLL_CHANCE = 0.05

/** Preferred home band for the guaranteed adventure cave: far enough that it
 *  is an actual trip out of the settlement (siting already forbids anything
 *  closer than `LARGE_CAVE_MIN_HOME_DIST`, so this never fights the siting
 *  authority), near enough to be a short exploratory walk. */
export const ADVENTURE_HOME_BAND_MIN = LARGE_CAVE_MIN_HOME_DIST
export const ADVENTURE_HOME_BAND_MAX = 300

/** Dungeon is a further expedition than the home adventure cave. Sites at
 *  least this far from home are tried before anything closer; the 400–550 m
 *  sweet band is a ranking preference inside that outer set, not a new
 *  siting constraint. */
export const DUNGEON_OUTER_BAND_MIN = 300
export const DUNGEON_PREFERRED_BAND_MIN = 400
export const DUNGEON_PREFERRED_BAND_MAX = 550
/** Ranking attractor inside the preferred dungeon band (mid-outer of the
 *  existing siting ring). */
const DUNGEON_PREFERRED_BAND_MID =
  (DUNGEON_PREFERRED_BAND_MIN + DUNGEON_PREFERRED_BAND_MAX) / 2

export type ArchetypeCandidate = {
  site: LargeCaveSite
  caveId: string
  /** Distance from the home settlement (the world origin). */
  homeDistance: number
  /** Inside `[ADVENTURE_HOME_BAND_MIN, ADVENTURE_HOME_BAND_MAX]`. */
  preferred: boolean
}

export type DungeonCandidate = {
  site: LargeCaveSite
  caveId: string
  homeDistance: number
  /** Inside `[DUNGEON_PREFERRED_BAND_MIN, DUNGEON_PREFERRED_BAND_MAX]`. */
  preferred: boolean
  /** `homeDistance >= DUNGEON_OUTER_BAND_MIN`. */
  outer: boolean
}

/**
 * Order in which existing cave sites are tried for the one guaranteed home
 * adventure cave: preferred home band first (nearest home first), then every
 * remaining existing site (also nearest first), with `caveId` as the stable
 * tie-break. Never synthesizes a site — the caller may only try what
 * `pickLargeCaveSites()` already produced.
 *
 * @domain world-terrain
 */
export function orderHomeAdventureCandidates(
  seed: number,
  sites: readonly LargeCaveSite[],
): ArchetypeCandidate[] {
  const candidates: ArchetypeCandidate[] = sites.map((site) => {
    const homeDistance = Math.hypot(site.x, site.z)
    return {
      site,
      caveId: makeCaveId(seed, site),
      homeDistance,
      preferred: homeDistance >= ADVENTURE_HOME_BAND_MIN && homeDistance <= ADVENTURE_HOME_BAND_MAX,
    }
  })
  return candidates.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
    if (a.homeDistance !== b.homeDistance) return a.homeDistance - b.homeDistance
    return a.caveId < b.caveId ? -1 : a.caveId > b.caveId ? 1 : 0
  })
}

/**
 * Order in which existing cave sites are tried for the one guaranteed dungeon,
 * after the guaranteed home adventure site has been reserved. Preferred
 * 400–550 m band first (closer to the band midpoint first), then remaining
 * sites at least `DUNGEON_OUTER_BAND_MIN` from home (nearest first), then any
 * leftover closer sites as a last-resort fallback. `caveId` is the stable
 * tie-break. Never synthesizes a site.
 *
 * @domain world-terrain
 */
export function orderGuaranteedDungeonCandidates(
  seed: number,
  sites: readonly LargeCaveSite[],
  reservedCaveId: string | null,
): DungeonCandidate[] {
  const candidates: DungeonCandidate[] = []
  for (const site of sites) {
    const caveId = makeCaveId(seed, site)
    if (caveId === reservedCaveId) continue
    const homeDistance = Math.hypot(site.x, site.z)
    candidates.push({
      site,
      caveId,
      homeDistance,
      preferred: homeDistance >= DUNGEON_PREFERRED_BAND_MIN && homeDistance <= DUNGEON_PREFERRED_BAND_MAX,
      outer: homeDistance >= DUNGEON_OUTER_BAND_MIN,
    })
  }
  return candidates.sort((a, b) => {
    const rank = (c: DungeonCandidate): number => (c.preferred ? 0 : c.outer ? 1 : 2)
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    if (a.preferred && b.preferred) {
      const aMid = Math.abs(a.homeDistance - DUNGEON_PREFERRED_BAND_MID)
      const bMid = Math.abs(b.homeDistance - DUNGEON_PREFERRED_BAND_MID)
      if (aMid !== bMid) return aMid - bMid
    } else if (a.homeDistance !== b.homeDistance) {
      return a.homeDistance - b.homeDistance
    }
    return a.caveId < b.caveId ? -1 : a.caveId > b.caveId ? 1 : 0
  })
}

/**
 * The independent deterministic `ADVENTURE_ROLL_CHANCE` roll for a cave that
 * is not the guaranteed home adventure cave. Own RNG salt, one draw — adding
 * or removing it can never shift an existing natural cave's structural,
 * feature, centerline or branch streams.
 *
 * @domain world-terrain
 */
export function rollsAdventure(caveId: string): boolean {
  return createCaveRandom(caveId, CAVE_RNG_SALT.archetype)() < ADVENTURE_ROLL_CHANCE
}

/**
 * The independent deterministic `DUNGEON_ROLL_CHANCE` roll for a cave that is
 * neither the guaranteed home adventure nor the guaranteed dungeon. Own salt,
 * so it can never shift `rollsAdventure()` or any structural stream.
 *
 * @domain world-terrain
 */
export function rollsDungeon(caveId: string): boolean {
  return createCaveRandom(caveId, CAVE_RNG_SALT.dungeonArchetype)() < DUNGEON_ROLL_CHANCE
}

export type ArchetypeAssignment<T> = {
  site: LargeCaveSite
  caveId: string
  archetype: CaveArchetype
  topology: T
}

/**
 * Decides, for one world, which existing cave site gets which recipe, and
 * returns only the sites whose topology was actually accepted — in the
 * original siting order, so nothing downstream depends on the order the
 * decisions were made in.
 *
 * `buildTopology` is the acceptance authority (it returns `null` for a site
 * whose terrain cannot carry that recipe); this function never relaxes it and
 * never invents a site:
 *
 * 1. try `adventure` over `orderHomeAdventureCandidates()` and keep the first
 *    genuinely accepted one as the guaranteed home adventure cave;
 * 2. reserve that site, then try `dungeon` over
 *    `orderGuaranteedDungeonCandidates()` and keep the first accepted one as
 *    the guaranteed dungeon;
 * 3. every other site takes its own independent `rollsDungeon()` then
 *    `rollsAdventure()` — guaranteed caves are not rolled again;
 * 4. a site that rolled `dungeon` but whose dungeon topology is rejected
 *    still takes its existing adventure roll, then the unchanged `natural`
 *    recipe, so a new archetype roll can never delete a cave that natural
 *    would have accepted.
 *
 * Each site is offered a given recipe at most once: rejected guarantee
 * candidates are remembered, not rebuilt.
 *
 * @domain world-terrain
 */
export function assignCaveArchetypes<T>(
  seed: number,
  sites: readonly LargeCaveSite[],
  buildTopology: (site: LargeCaveSite, archetype: CaveArchetype) => T | null,
): ArchetypeAssignment<T>[] {
  const adventureAttempts = new Map<string, T | null>()
  let guaranteedAdventureCaveId: string | null = null
  for (const candidate of orderHomeAdventureCandidates(seed, sites)) {
    const topology = buildTopology(candidate.site, 'adventure')
    adventureAttempts.set(candidate.caveId, topology)
    if (topology) {
      guaranteedAdventureCaveId = candidate.caveId
      break
    }
  }

  const dungeonAttempts = new Map<string, T | null>()
  let guaranteedDungeonCaveId: string | null = null
  for (const candidate of orderGuaranteedDungeonCandidates(seed, sites, guaranteedAdventureCaveId)) {
    const topology = buildTopology(candidate.site, 'dungeon')
    dungeonAttempts.set(candidate.caveId, topology)
    if (topology) {
      guaranteedDungeonCaveId = candidate.caveId
      break
    }
  }

  const accepted: ArchetypeAssignment<T>[] = []
  for (const site of sites) {
    const caveId = makeCaveId(seed, site)
    if (caveId === guaranteedAdventureCaveId) {
      accepted.push({ site, caveId, archetype: 'adventure', topology: adventureAttempts.get(caveId)! })
      continue
    }
    if (caveId === guaranteedDungeonCaveId) {
      accepted.push({ site, caveId, archetype: 'dungeon', topology: dungeonAttempts.get(caveId)! })
      continue
    }
    if (rollsDungeon(caveId)) {
      const dungeon = dungeonAttempts.has(caveId)
        ? dungeonAttempts.get(caveId)!
        : buildTopology(site, 'dungeon')
      if (dungeon) {
        accepted.push({ site, caveId, archetype: 'dungeon', topology: dungeon })
        continue
      }
    }
    if (rollsAdventure(caveId)) {
      const adventure = adventureAttempts.has(caveId)
        ? adventureAttempts.get(caveId)!
        : buildTopology(site, 'adventure')
      if (adventure) {
        accepted.push({ site, caveId, archetype: 'adventure', topology: adventure })
        continue
      }
    }
    const natural = buildTopology(site, 'natural')
    if (natural) accepted.push({ site, caveId, archetype: 'natural', topology: natural })
  }
  return accepted
}
