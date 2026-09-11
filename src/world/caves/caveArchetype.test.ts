/** Plan world-terrain-020 Stage A — deterministic archetype assignment,
 *  tested without terrain or Three.js: ordering, the roll, the home guarantee
 *  and the adventure→natural regression fallback are all pure. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveArchetype } from './caveArchetype'
import { LARGE_CAVE_MIN_HOME_DIST } from '../largeCaves'
import {
  ADVENTURE_HOME_BAND_MAX,
  ADVENTURE_HOME_BAND_MIN,
  ADVENTURE_ROLL_CHANCE,
  assignCaveArchetypes,
  orderHomeAdventureCandidates,
  rollsAdventure,
} from './caveArchetype'
import { makeCaveId } from './caveIdentity'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'

const SEED = 1136726869

function siteAt(distance: number, angle: number): LargeCaveSite {
  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance,
    yaw: angle,
    length: 12,
    variant: 0.5,
  }
}

/** A spread of existing sites over the real siting ring (130–620 m). */
function ringSites(count = 8): LargeCaveSite[] {
  return Array.from({ length: count }, (_, i) => siteAt(150 + i * 61, 0.7 + i * 1.31))
}

/** Builder that accepts everything — isolates ordering/roll behaviour from
 *  topology acceptance. */
const acceptAll = (site: LargeCaveSite, archetype: CaveArchetype): string =>
  `${archetype}@${Math.round(site.x)}`

describe('orderHomeAdventureCandidates', () => {
  it('never fights the siting authority: the preferred band starts at LARGE_CAVE_MIN_HOME_DIST', () => {
    expect(ADVENTURE_HOME_BAND_MIN).toBe(LARGE_CAVE_MIN_HOME_DIST)
    expect(ADVENTURE_HOME_BAND_MAX).toBeGreaterThan(ADVENTURE_HOME_BAND_MIN)
  })

  it('offers preferred-band sites first, nearest home first, then the rest nearest first', () => {
    const near = siteAt(160, 0.2)
    const alsoNear = siteAt(240, 2.4)
    const far = siteAt(420, 4.1)
    const farther = siteAt(590, 5.5)
    const order = orderHomeAdventureCandidates(SEED, [farther, near, far, alsoNear])
    expect(order.map((c) => Math.round(c.homeDistance))).toEqual([160, 240, 420, 590])
    expect(order.slice(0, 2).every((c) => c.preferred)).toBe(true)
    expect(order.slice(2).some((c) => c.preferred)).toBe(false)
  })

  it('is independent of the order sites arrive in', () => {
    const sites = ringSites()
    const forward = orderHomeAdventureCandidates(SEED, sites).map((c) => c.caveId)
    const reversed = orderHomeAdventureCandidates(SEED, [...sites].reverse()).map((c) => c.caveId)
    expect(reversed).toEqual(forward)
  })

  it('only ever offers sites that already exist — it never synthesizes one', () => {
    const sites = ringSites()
    const order = orderHomeAdventureCandidates(SEED, sites)
    expect(order).toHaveLength(sites.length)
    expect(new Set(order.map((c) => c.site))).toEqual(new Set(sites))
  })

  it('breaks an exact distance tie on stable cave identity, not input order', () => {
    const a = siteAt(200, 0.4)
    const b = siteAt(200, 3.9)
    const forward = orderHomeAdventureCandidates(SEED, [a, b]).map((c) => c.caveId)
    const backward = orderHomeAdventureCandidates(SEED, [b, a]).map((c) => c.caveId)
    expect(forward).toEqual(backward)
    expect(forward[0]! < forward[1]!).toBe(true)
  })
})

describe('rollsAdventure', () => {
  it('is exactly the archetype stream against the documented threshold', () => {
    for (const site of ringSites()) {
      const caveId = makeCaveId(SEED, site)
      const expected = createCaveRandom(caveId, CAVE_RNG_SALT.archetype)() < ADVENTURE_ROLL_CHANCE
      expect(rollsAdventure(caveId)).toBe(expected)
    }
  })

  it('uses its own salt, so adding the roll cannot shift a cave structural stream', () => {
    expect(CAVE_RNG_SALT.archetype).not.toBe(CAVE_RNG_SALT.structure)
    expect(CAVE_RNG_SALT.archetype).not.toBe(CAVE_RNG_SALT.branch)
    const caveId = makeCaveId(SEED, siteAt(200, 1))
    const structureFirst = createCaveRandom(caveId, CAVE_RNG_SALT.structure)()
    rollsAdventure(caveId)
    expect(createCaveRandom(caveId, CAVE_RNG_SALT.structure)()).toBe(structureFirst)
  })

  it('is stable per cave identity and repeatable', () => {
    const caveId = makeCaveId(SEED, siteAt(310, 2.2))
    expect(rollsAdventure(caveId)).toBe(rollsAdventure(caveId))
  })

  it('stays in the documented ballpark over a large fixed sample (sanity, not a statistical test)', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => makeCaveId(SEED, siteAt(150 + i, 0.11 * i)))
    const share = ids.filter(rollsAdventure).length / ids.length
    expect(share).toBeGreaterThan(0.10)
    expect(share).toBeLessThan(0.21)
  })
})

describe('assignCaveArchetypes', () => {
  it('guarantees exactly one adventure cave near home when a candidate accepts, and keeps it out of the roll', () => {
    const sites = ringSites()
    const assigned = assignCaveArchetypes(SEED, sites, acceptAll)
    const adventures = assigned.filter((a) => a.archetype === 'adventure')
    expect(adventures.length).toBeGreaterThanOrEqual(1)

    const order = orderHomeAdventureCandidates(SEED, sites)
    const guaranteed = order[0]!
    expect(assigned.find((a) => a.caveId === guaranteed.caveId)!.archetype).toBe('adventure')
    // Every *other* adventure cave in the world is there because it rolled one.
    for (const a of adventures) {
      if (a.caveId === guaranteed.caveId) continue
      expect(rollsAdventure(a.caveId)).toBe(true)
    }
    // ...and the guarantee holds even when the guaranteed cave's own roll said natural.
    expect(rollsAdventure(guaranteed.caveId)).toBe(false)
  })

  it('moves the guarantee to the next candidate when the nearest one rejects adventure, without adding a site', () => {
    const sites = ringSites()
    const order = orderHomeAdventureCandidates(SEED, sites)
    const rejected = new Set([order[0]!.caveId, order[1]!.caveId])
    const assigned = assignCaveArchetypes(SEED, sites, (site, archetype) => {
      if (archetype === 'adventure' && rejected.has(makeCaveId(SEED, site))) return null
      return acceptAll(site, archetype)
    })
    expect(assigned.find((a) => a.caveId === order[2]!.caveId)!.archetype).toBe('adventure')
    for (const caveId of rejected) {
      expect(assigned.find((a) => a.caveId === caveId)!.archetype).toBe('natural')
    }
    expect(assigned).toHaveLength(sites.length)
    expect(new Set(assigned.map((a) => a.site))).toEqual(new Set(sites))
  })

  it('has no adventure cave at all when no existing site can carry one — and still keeps every natural cave', () => {
    const sites = ringSites()
    const assigned = assignCaveArchetypes(SEED, sites, (site, archetype) =>
      archetype === 'adventure' ? null : acceptAll(site, archetype))
    expect(assigned.every((a) => a.archetype === 'natural')).toBe(true)
    expect(assigned).toHaveLength(sites.length)
  })

  it('falls back to the unchanged natural recipe when a rolled adventure is rejected, never dropping the cave', () => {
    const sites = ringSites()
    const order = orderHomeAdventureCandidates(SEED, sites)
    const guaranteed = order[0]!.caveId
    const rolled = sites.map((s) => makeCaveId(SEED, s)).filter((id) => id !== guaranteed && rollsAdventure(id))
    expect(rolled.length).toBeGreaterThan(0)

    const built: { caveId: string, archetype: CaveArchetype }[] = []
    const assigned = assignCaveArchetypes(SEED, sites, (site, archetype) => {
      const caveId = makeCaveId(SEED, site)
      built.push({ caveId, archetype })
      if (archetype === 'adventure' && caveId !== guaranteed) return null
      return acceptAll(site, archetype)
    })
    expect(assigned).toHaveLength(sites.length)
    for (const caveId of rolled) {
      expect(assigned.find((a) => a.caveId === caveId)!.archetype).toBe('natural')
      expect(built.filter((b) => b.caveId === caveId && b.archetype === 'natural')).toHaveLength(1)
    }
  })

  it('offers each site a given recipe at most once, even when it was a rejected home candidate', () => {
    const sites = ringSites()
    const attempts: string[] = []
    assignCaveArchetypes(SEED, sites, (site, archetype) => {
      attempts.push(`${makeCaveId(SEED, site)}:${archetype}`)
      return archetype === 'adventure' ? null : acceptAll(site, archetype)
    })
    expect(new Set(attempts).size).toBe(attempts.length)
  })

  it('returns sites in siting order and is independent of the order decisions were made in', () => {
    const sites = ringSites()
    const assigned = assignCaveArchetypes(SEED, sites, acceptAll)
    expect(assigned.map((a) => a.site)).toEqual(sites)
    const again = assignCaveArchetypes(SEED, [...sites], acceptAll)
    expect(again).toEqual(assigned)
  })
})
