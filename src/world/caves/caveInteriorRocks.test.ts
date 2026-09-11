/** Plan world-terrain-022 — deterministic interior rock clutter: bounded
 *  fitting, floor Y from the cave's own heightfield, size-class clearance
 *  ordering, central-route protection, content-anchor breathing room, and
 *  bounded instanced rendering (never one mesh per rock). */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { CaveArchetype } from './caveArchetype'
import type { CaveTopology } from './caveTopology'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  caveHeightfieldWalkSurfaceAt,
} from '../../debug/caves/caveHeightfieldFixtures'
import { CAVE_CONTENT_PLACEMENT, type CaveContentAnchor } from './caveContentAnchors'
import { chamberCandidates, incomingHeading, passageWallCandidates } from './caveHeightfieldPlacement'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'
import {
  type CaveInteriorRockPlacement,
  createCaveInteriorRocksGroup,
  getCaveInteriorRockTemplates,
  resolveCaveInteriorRocks,
} from './caveInteriorRocks'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }
const walk = caveHeightfieldWalkSurfaceAt

function build(id: (typeof CAVE_HEIGHTFIELD_FIXTURE_IDS)[number]): {
  topology: CaveTopology
  heightfield: CaveHeightfieldRepresentation
} {
  const topology = buildCaveHeightfieldFixture(id)
  const heightfield = buildCaveHeightfieldRepresentation(topology, walk, TEST_CONFIG).heightfield
  return { topology, heightfield }
}

function resolve(
  id: (typeof CAVE_HEIGHTFIELD_FIXTURE_IDS)[number],
  archetype: CaveArchetype = 'natural',
  contentAnchors: readonly CaveContentAnchor[] = [],
): readonly CaveInteriorRockPlacement[] {
  const { topology, heightfield } = build(id)
  return resolveCaveInteriorRocks({ archetype, topology, heightfield, contentAnchors })
}

describe('resolveCaveInteriorRocks (plan world-terrain-022)', () => {
  it('is deterministic for the same fixture, including across independent rebuilds', () => {
    const first = resolve('bend')
    const { topology, heightfield } = build('bend')
    const second = resolveCaveInteriorRocks({ archetype: 'natural', topology, heightfield, contentAnchors: [] })
    expect(second).toEqual(first)
    expect(resolve('bend')).toEqual(first)
  })

  it('produces non-empty output for both natural and adventure archetypes', () => {
    expect(resolve('bend', 'natural').length).toBeGreaterThan(0)
    expect(resolve('bend', 'adventure').length).toBeGreaterThan(0)
  })

  it('places every rock inside the cave void, away from open sky and the grid edge', () => {
    const { heightfield } = build('bend')
    const rocks = resolve('bend')
    expect(rocks.length).toBeGreaterThan(0)
    for (const rock of rocks) {
      const sample = sampleHeightfieldAt(heightfield, rock.x, rock.z)
      expect(sample.outsideGrid).toBe(false)
      expect(sample.openSky).toBe(false)
      expect(sample.gap).toBeGreaterThan(0)
    }
  })

  it('takes floor Y from the heightfield sample, never surface terrain or topology node Y', () => {
    const { topology, heightfield } = build('branch')
    const rocks = resolve('branch')
    expect(rocks.length).toBeGreaterThan(0)
    for (const rock of rocks) {
      const sample = sampleHeightfieldAt(heightfield, rock.x, rock.z)
      expect(rock.y).toBe(sample.floorY)
      const nearestNodeY = Math.min(...topology.nodes.map((n) => Math.abs(n.position.y - rock.y)))
      expect(nearestNodeY).toBeGreaterThan(0)
    }
  })

  it('gives large placements a strictly larger clearance requirement than small placements', () => {
    // The 'basic' chamber (11m wide / 5.8m tall) is the only fixture chamber
    // that clears the large-class width/height thresholds.
    const { heightfield } = build('basic')
    const rocks = resolve('basic')
    const large = rocks.filter((r) => r.sizeClass === 'large')
    const small = rocks.filter((r) => r.sizeClass === 'small')
    expect(large.length).toBeGreaterThan(0)
    expect(small.length).toBeGreaterThan(0)
    for (const rock of large) {
      const sample = sampleHeightfieldAt(heightfield, rock.x, rock.z)
      expect(sample.gap).toBeGreaterThanOrEqual(2.6)
    }
  })

  it('keeps medium/large rocks off the central route in a straight passage', () => {
    // 'basic' is a straight-line cave: entrance/passage/chamber all sit at
    // x=0, so lateral offset from the through-route is literally |rock.x|.
    const rocks = resolve('basic')
    const mediumOrLarge = rocks.filter((r) => r.sizeClass !== 'small')
    expect(mediumOrLarge.length).toBeGreaterThan(0)
    for (const rock of mediumOrLarge) {
      expect(Math.abs(rock.x)).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('gives existing content anchors breathing room instead of overlapping them', () => {
    const { topology, heightfield } = build('basic')
    const chamber = topology.nodes.find((n) => n.id === 'chamber')!
    const anchor: CaveContentAnchor = {
      id: `${topology.caveId}:wagon`,
      caveId: topology.caveId,
      role: 'wagon',
      x: chamber.position.x,
      y: chamber.position.y,
      z: chamber.position.z,
      yaw: 0,
    }
    const rocks = resolveCaveInteriorRocks({
      archetype: 'adventure',
      topology,
      heightfield,
      contentAnchors: [anchor],
    })
    const minRockFootprint = 0.3 // smallest ROCK_SIZE_SPEC.small.footprintRadius
    for (const rock of rocks) {
      const dist = Math.hypot(rock.x - anchor.x, rock.z - anchor.z)
      expect(dist).toBeGreaterThanOrEqual(CAVE_CONTENT_PLACEMENT.wagon.footprintRadius + minRockFootprint)
    }
  })

  it('never exceeds the bounded per-site candidate fan (shared with content-anchor fitting)', () => {
    const { topology } = build('basic')
    const chamber = topology.nodes.find((n) => n.id === 'chamber')!
    const heading = incomingHeading(topology, chamber.id)
    const limit = 8
    const chamberList = chamberCandidates(chamber, heading, 1, limit)
    expect(chamberList.length).toBeGreaterThan(0)
    expect(chamberList.length).toBeLessThanOrEqual(limit)
    const seg = topology.segments.find((s) => s.to === chamber.id)!
    const wall = passageWallCandidates(seg, 0.5, 1, chamber.targetWidth / 2, limit)
    expect(wall.candidates.length).toBeGreaterThan(0)
    expect(wall.candidates.length).toBeLessThanOrEqual(limit)
  })

  it('freezes the returned placement list', () => {
    const rocks = resolve('basic')
    expect(Object.isFrozen(rocks)).toBe(true)
    expect(Object.isFrozen(rocks[0])).toBe(true)
  })
})

describe('cave interior rock rendering (instanced, not one mesh per rock)', () => {
  it('exposes a small, fixed template set', () => {
    const templates = getCaveInteriorRockTemplates()
    expect(templates.length).toBe(5)
    // Memoized module-level singleton — never rebuilt per call.
    expect(getCaveInteriorRockTemplates()).toBe(templates)
  })

  it('buckets many placements into far fewer InstancedMesh objects than rocks', () => {
    const rocks = resolve('basic')
    expect(rocks.length).toBeGreaterThan(5)
    const templates = getCaveInteriorRockTemplates()
    const result = createCaveInteriorRocksGroup(rocks, templates)
    expect(result).toBeDefined()
    let instancedMeshCount = 0
    result!.group.traverse((obj) => {
      if ((obj as THREE.InstancedMesh).isInstancedMesh) instancedMeshCount++
    })
    // Bucket count is bounded by (template count x meshes per template) — a
    // rock cluster template has several pebble meshes, so this can exceed
    // `templates.length`, but it is fixed regardless of rock count and stays
    // far below one mesh per rock.
    expect(instancedMeshCount).toBeGreaterThan(0)
    expect(instancedMeshCount).toBeLessThan(rocks.length)
    result!.dispose()
  })

  it('returns undefined for an empty placement list', () => {
    expect(createCaveInteriorRocksGroup([], getCaveInteriorRockTemplates())).toBeUndefined()
  })

  it('marks shared template geometry/material so cross-cave disposal is safe', () => {
    const templates = getCaveInteriorRockTemplates()
    for (const root of templates) {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        expect(mesh.geometry.userData.sharedGpu).toBe(true)
        const mat = mesh.material as THREE.Material
        expect(mat.userData.sharedGpu).toBe(true)
      })
    }
  })
})
