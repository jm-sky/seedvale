import { describe, expect, it } from 'vitest'
import type { TreasureLandmarkCandidate } from './treasureSites'
import { cemeteryGraveLayout } from '../settlement/props'
import { rotateOffsetY } from '../settlement/propUtils'
import {
  attemptTreasureUnlock,
  authoredTreasureReservedIds,
  completeTreasureSites,
  MAX_KEY_DISTANCE,
  MIN_KEY_DISTANCE,
  resolveTreasureChestDrafts,
  resolveTreasureSites,
  treasureBuriedSpotId,
  treasureChestId,
  treasureKeyInstanceId,
  treasureKeyPickupId,
  treasureSiteId,
} from './treasureSites'

function ruins(id: string, x: number, z: number): TreasureLandmarkCandidate {
  return { id, kind: 'smallRuins', x, z, rotationY: 0.4, scale: 1 }
}

function cemetery(id: string, x: number, z: number): TreasureLandmarkCandidate {
  return { id, kind: 'cemetery', x, z, rotationY: 0.7, scale: 1, cemeterySize: 'SM' }
}

function monolith(id: string, x: number, z: number): TreasureLandmarkCandidate {
  return { id, kind: 'monolith', x, z, rotationY: 0, scale: 1 }
}

const RESERVED = authoredTreasureReservedIds({
  landmarkId: 'ruins:dark-forest-treasure',
  locationId: 'ruins:dark-forest-treasure',
  chestId: 'world-container:dark-forest-treasure',
  mapPickupId: 'treasure-map-pickup:dark-forest-treasure',
})

describe('treasureSites (world-024)', () => {
  it('derives stable namespaced ids from the site id', () => {
    const id = treasureSiteId('ruins', 'smallRuins:1:2:0:abc')
    expect(treasureChestId(id)).toBe(`world-container:${id}`)
    expect(treasureKeyInstanceId(id)).toBe(`item:treasure-key:${id}`)
    expect(treasureKeyPickupId(id)).toBe(`treasure-key-pickup:${id}`)
    expect(treasureBuriedSpotId(id)).toBe(`treasure-key:${id}`)
  })

  it('produces the same sites when candidate order changes', () => {
    const ruinsA = ruins('smallRuins:a', 280, 40)
    const ruinsB = ruins('smallRuins:b', 310, -80)
    const forests = [{ x: 240, z: 120 }, { x: 400, z: -40 }]
    const input = {
      seed: 42,
      homeX: 0,
      homeZ: 0,
      reservedPlaceIds: RESERVED,
      ruinsCandidates: [ruinsA, ruinsB],
      deepForestCandidates: forests,
    }
    const first = resolveTreasureChestDrafts(input)
    const second = resolveTreasureChestDrafts({
      ...input,
      ruinsCandidates: [ruinsB, ruinsA],
      deepForestCandidates: [...forests].reverse(),
    })
    expect(second).toEqual(first)
    expect(first.length).toBeGreaterThan(0)
  })

  it('rejects reserved authored places instead of manufacturing a replacement', () => {
    const drafts = resolveTreasureChestDrafts({
      seed: 7,
      homeX: 0,
      homeZ: 0,
      reservedPlaceIds: new Set(['ruins:dark-forest-treasure']),
      ruinsCandidates: [{
        id: 'ruins:dark-forest-treasure',
        kind: 'ruins',
        x: 400,
        z: -300,
        rotationY: 0,
        scale: 1.2,
      }],
      deepForestCandidates: [],
    })
    expect(drafts).toEqual([])
  })

  it('does not require every archetype and does not invent a missing cave', () => {
    const drafts = resolveTreasureChestDrafts({
      seed: 11,
      homeX: 0,
      homeZ: 0,
      reservedPlaceIds: RESERVED,
      ruinsCandidates: [ruins('smallRuins:only', 250, 20)],
      deepForestCandidates: [],
    })
    expect(drafts.every((d) => d.archetype === 'ruins' || d.archetype === 'deepForest')).toBe(true)
    expect(drafts.some((d) => d.archetype === 'ruins')).toBe(true)
    expect(drafts.some((d) => d.archetype === 'deepForest')).toBe(false)
  })

  it('places keys inside the configured distance band and never in the chest', () => {
    const chestRuins = ruins('smallRuins:chest', 260, 0)
    const nearHost = monolith('monolith:near', 265, 0)
    const bandHost = monolith('monolith:band', 260 + 90, 0)
    const farHost = monolith('monolith:far', 260 + 400, 0)
    const sites = resolveTreasureSites({
      seed: 19,
      homeX: 0,
      homeZ: 0,
      reservedPlaceIds: RESERVED,
      ruinsCandidates: [chestRuins],
      deepForestCandidates: [],
      keyHosts: [nearHost, bandHost, farHost],
    })
    expect(sites).toHaveLength(1)
    const site = sites[0]!
    const dist = Math.hypot(site.key.x - site.chest.x, site.key.z - site.chest.z)
    expect(dist).toBeGreaterThanOrEqual(MIN_KEY_DISTANCE)
    expect(dist).toBeLessThanOrEqual(MAX_KEY_DISTANCE)
    expect(site.key.mode === 'abandoned' ? site.key.hostId : site.key.landmarkId).not.toBe(site.chest.containerId)
  })

  it('falls back to a terrain key when no landmark sits in the band', () => {
    const chestRuins = ruins('smallRuins:chest', 260, 0)
    const sites = resolveTreasureSites({
      seed: 23,
      homeX: 0,
      homeZ: 0,
      reservedPlaceIds: RESERVED,
      ruinsCandidates: [chestRuins],
      deepForestCandidates: [],
      keyHosts: [],
    })
    expect(sites).toHaveLength(1)
    expect(sites[0]!.key.mode).toBe('abandoned')
    if (sites[0]!.key.mode === 'abandoned') {
      expect(sites[0]!.key.hostKind).toBe('terrainFallback')
    }
    const dist = Math.hypot(sites[0]!.key.x - sites[0]!.chest.x, sites[0]!.key.z - sites[0]!.chest.z)
    expect(dist).toBeGreaterThanOrEqual(MIN_KEY_DISTANCE)
    expect(dist).toBeLessThanOrEqual(MAX_KEY_DISTANCE)
  })

  it('can bury a key on a real cemetery grave', () => {
    const chestRuins = ruins('smallRuins:chest', 260, 0)
    const host = cemetery('cemetery:host', 260 + 100, 20)
    const drafts = resolveTreasureChestDrafts({
      seed: 3,
      homeX: 0,
      homeZ: 0,
      reservedPlaceIds: RESERVED,
      ruinsCandidates: [chestRuins],
      deepForestCandidates: [],
    })
    const sites = completeTreasureSites({
      seed: 3,
      drafts,
      reservedPlaceIds: RESERVED,
      keyHostsBySiteId: new Map(drafts.map((d) => [d.id, [host]])),
    })
    const buried = sites.find((s) => s.key.mode === 'buried')
    expect(buried).toBeDefined()
    if (buried?.key.mode !== 'buried') return
    expect(buried.key.landmarkKind).toBe('cemetery')
    expect(buried.key.graveIndex).toBeTypeOf('number')
    const layout = cemeteryGraveLayout('SM', 1)
    const local = layout[buried.key.graveIndex!]!
    const rotated = rotateOffsetY(local.x, local.z, host.rotationY)
    expect(buried.key.x).toBeCloseTo(host.x + rotated.x)
    expect(buried.key.z).toBeCloseTo(host.z + rotated.z)
  })

  it('unlocks only with the exact required key instance', () => {
    const sites = resolveTreasureSites({
      seed: 5,
      homeX: 0,
      homeZ: 0,
      reservedPlaceIds: RESERVED,
      ruinsCandidates: [ruins('smallRuins:chest', 260, 0)],
      deepForestCandidates: [],
      keyHosts: [monolith('monolith:band', 350, 0)],
    })
    const site = sites[0]!
    const unlocked = new Set<string>()
    expect(attemptTreasureUnlock(sites, unlocked, site.chest.containerId, () => false).kind).toBe('locked')
    expect(unlocked.size).toBe(0)
    const otherKey = attemptTreasureUnlock(
      sites,
      unlocked,
      site.chest.containerId,
      (id) => id === 'item:treasure-key:other',
    )
    expect(otherKey.kind).toBe('locked')
    const ok = attemptTreasureUnlock(
      sites,
      unlocked,
      site.chest.containerId,
      (id) => id === site.requiredKeyId,
    )
    expect(ok.kind).toBe('unlocked')
    expect(unlocked.has(site.chest.containerId)).toBe(true)
    expect(attemptTreasureUnlock(sites, unlocked, site.chest.containerId, () => false).kind).toBe('open')
    expect(attemptTreasureUnlock(sites, unlocked, 'world-container:player-chest', () => true).kind).toBe('not-treasure')
  })
})
