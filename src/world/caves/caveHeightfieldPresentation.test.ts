/** Plan world-terrain-019 — cave mouth presentation polish: contour-driven
 *  rocks stay outside the opening, never own collision, and remain optional. */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  caveHeightfieldWalkSurfaceAt,
} from '../../debug/caves/caveHeightfieldFixtures'
import {
  createCaveHeightfieldMaterial,
  createCaveHeightfieldPresentation,
  createMouthRocks,
  createMouthUndersideMaskMaterial,
} from './caveHeightfieldPresentation'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
  mouthOpeningAt,
} from './caveHeightfieldRepresentation'
import { openingDirection } from './caveOrientation'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }
const walk = caveHeightfieldWalkSurfaceAt

function build(id: (typeof CAVE_HEIGHTFIELD_FIXTURE_IDS)[number]): CaveHeightfieldRepresentation {
  return buildCaveHeightfieldRepresentation(buildCaveHeightfieldFixture(id), walk, TEST_CONFIG).heightfield
}

function openingOf(field: CaveHeightfieldRepresentation): (x: number, z: number) => number {
  return (x, z) => mouthOpeningAt(field, walk, x, z)
}

function rockSnapshot(group: THREE.Group): number[] {
  const rows: number[] = []
  for (const child of group.children) {
    const mesh = child.children[0] as THREE.Mesh | undefined
    const meshScale = mesh?.scale
    rows.push(
      child.position.x,
      child.position.y,
      child.position.z,
      child.rotation.y,
      meshScale?.x ?? 0,
      meshScale?.y ?? 0,
      meshScale?.z ?? 0,
      child.userData.mouthRockKind === 'anchor' ? 1 : 0,
    )
  }
  return rows
}

describe('createMouthRocks (presentation only)', () => {
  it('places rocks outside the opening contour and leaves the exit path free', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const field = build(id)
      const opening = openingOf(field)
      const rocks = createMouthRocks(field, opening, walk)
      expect(rocks.children.length).toBeGreaterThan(0)
      const out = openingDirection(field.entrance.yaw)
      const sideX = -out.dz
      const sideZ = out.dx
      const half = field.entrance.width * 0.5
      for (const rock of rocks.children) {
        expect(opening(rock.position.x, rock.position.z)).toBeLessThan(0)
        const dx = rock.position.x - field.entrance.x
        const dz = rock.position.z - field.entrance.z
        const along = dx * out.dx + dz * out.dz
        const lat = dx * sideX + dz * sideZ
        expect(along).toBeLessThan(0.55)
        if (along > -1.1) {
          expect(Math.abs(lat)).toBeGreaterThan(half * 0.55)
        }
      }
      for (let along = 0; along <= 3; along += 0.25) {
        const cx = field.entrance.x + out.dx * along
        const cz = field.entrance.z + out.dz * along
        for (const rock of rocks.children) {
          expect(Math.hypot(rock.position.x - cx, rock.position.z - cz)).toBeGreaterThan(1.15)
        }
      }
    }
  })

  it('frames both doorway flanks, still bounded', () => {
    const field = build('basic')
    const rocks = createMouthRocks(field, openingOf(field), walk)
    expect(rocks.children.length).toBeGreaterThanOrEqual(6)
    expect(rocks.children.length).toBeLessThanOrEqual(30)
  })

  it('puts the large anchor rocks on the doorway sides, not the grass lip', () => {
    const field = build('basic')
    const rocks = createMouthRocks(field, openingOf(field), walk)
    const out = openingDirection(field.entrance.yaw)
    const sideX = -out.dz
    const sideZ = out.dx
    const anchors = rocks.children.filter((c) => c.userData.mouthRockKind === 'anchor')
    const fillers = rocks.children.filter((c) => c.userData.mouthRockKind === 'filler')
    expect(anchors.length).toBeGreaterThanOrEqual(2)
    expect(fillers.length).toBeGreaterThan(0)
    const sides = new Set<number>()
    for (const rock of anchors) {
      const dx = rock.position.x - field.entrance.x
      const dz = rock.position.z - field.entrance.z
      const along = dx * out.dx + dz * out.dz
      const lat = dx * sideX + dz * sideZ
      expect(Math.abs(along)).toBeLessThan(0.8)
      expect(Math.abs(lat)).toBeGreaterThan(field.entrance.width * 0.4)
      sides.add(lat > 0 ? 1 : -1)
    }
    expect(sides.has(1)).toBe(true)
    expect(sides.has(-1)).toBe(true)
  })

  it('is deterministic for identical field and contour', () => {
    const field = build('bend')
    const opening = openingOf(field)
    const a = createMouthRocks(field, opening, walk)
    const b = createMouthRocks(field, opening, walk)
    expect(a.children.length).toBe(b.children.length)
    expect(rockSnapshot(a)).toEqual(rockSnapshot(b))
  })

  it('does not attach collider authority to any rock', () => {
    const field = build('basic')
    const rocks = createMouthRocks(field, openingOf(field), walk)
    rocks.traverse((obj) => {
      expect(obj.userData.collider).toBeUndefined()
      expect(obj.userData.isCollider).toBeUndefined()
    })
  })

  it('follows the walk surface with a shallow sink', () => {
    const field = build('basic')
    const rocks = createMouthRocks(field, openingOf(field), walk)
    for (const rock of rocks.children) {
      const sink = walk(rock.position.x, rock.position.z) - rock.position.y
      expect(sink).toBeGreaterThan(0.1)
      expect(sink).toBeLessThan(0.45)
    }
  })
})

describe('createCaveHeightfieldPresentation', () => {
  it('still assembles mesh and underside mask when rocks are disabled', () => {
    const field = build('basic')
    const caveMaterial = createCaveHeightfieldMaterial()
    const maskMaterial = createMouthUndersideMaskMaterial()
    const presentation = createCaveHeightfieldPresentation({
      field,
      walkSurfaceAt: walk,
      caveMaterial,
      maskMaterial,
      rocks: false,
    })
    expect(presentation.rockCount).toBe(0)
    const names = presentation.group.children.map((c) => c.name)
    expect(names).toContain(`cave-interior:${field.caveId}`)
    expect(names).toContain('cave-mouth-mask')
    expect(names).not.toContain('cave-mouth-rocks')
    expect(presentation.maskVertices).toBeGreaterThan(80)
    expect((caveMaterial as THREE.MeshStandardMaterial).side).toBe(THREE.FrontSide)
  })

  it('includes contour rocks when enabled, without changing the mask', () => {
    const field = build('basic')
    const caveMaterial = createCaveHeightfieldMaterial()
    const maskMaterial = createMouthUndersideMaskMaterial()
    const withRocks = createCaveHeightfieldPresentation({
      field,
      walkSurfaceAt: walk,
      caveMaterial,
      maskMaterial,
      rocks: true,
    })
    const withoutRocks = createCaveHeightfieldPresentation({
      field,
      walkSurfaceAt: walk,
      caveMaterial,
      maskMaterial,
      rocks: false,
    })
    expect(withRocks.rockCount).toBeGreaterThanOrEqual(6)
    expect(withRocks.group.children.map((c) => c.name)).toContain('cave-mouth-rocks')
    expect(withRocks.maskVertices).toBe(withoutRocks.maskVertices)
    expect(withRocks.buffers.vertices).toBe(withoutRocks.buffers.vertices)
  })
})
