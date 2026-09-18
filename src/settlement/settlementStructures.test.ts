import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { buildInstancedProps } from '../render/instancedProps'
import { GARDEN_BED_GAP, GARDEN_BED_W, gardenBedCount } from './gardenScale'
import { disableCastShadow } from './propUtils'
import { cropsBedPlacements, wellPropPlacement } from './settlementStructures'

describe('wellPropPlacement', () => {
  it('carries the world anchor through with fixed rotation/scale', () => {
    const placement = wellPropPlacement(12.5, -4.25, 3.1, 'landmark-well-0')
    expect(placement).toEqual({
      speciesIndex: 0,
      x: 12.5,
      z: -4.25,
      groundY: 3.1,
      rotationY: 0,
      scale: 1,
      key: 'landmark-well-0',
    })
  })

  it('omits the key when none is given', () => {
    const placement = wellPropPlacement(0, 0, 0)
    expect(placement.key).toBeUndefined()
  })
})

describe('cropsBedPlacements', () => {
  it('produces one placement per bed, spaced by GARDEN_BED_W + GARDEN_BED_GAP', () => {
    const placements = cropsBedPlacements(100, 50, 7.5, 3, 'garden-0')
    expect(placements).toHaveLength(3)
    for (let i = 1; i < placements.length; i++) {
      expect(placements[i]!.x - placements[i - 1]!.x).toBeCloseTo(GARDEN_BED_W + GARDEN_BED_GAP, 6)
    }
  })

  it('centers the bed row on (gardenX, gardenZ) and keeps a single shared groundY', () => {
    const placements = cropsBedPlacements(100, 50, 7.5, 3, 'garden-0')
    const first = placements[0]!
    const last = placements[placements.length - 1]!
    expect((first.x + last.x) / 2).toBeCloseTo(100, 6)
    for (const p of placements) {
      expect(p.z).toBe(50)
      expect(p.groundY).toBe(7.5)
      expect(p.rotationY).toBe(0)
      expect(p.scale).toBe(1)
    }
  })

  it('matches createGarden/gardenBedCount for every GardenScale', () => {
    expect(cropsBedPlacements(0, 0, 0, gardenBedCount('S'))).toHaveLength(1)
    expect(cropsBedPlacements(0, 0, 0, gardenBedCount('M'))).toHaveLength(2)
    expect(cropsBedPlacements(0, 0, 0, gardenBedCount('L'))).toHaveLength(3)
  })

  it('prefixes instance keys with the given garden id', () => {
    const placements = cropsBedPlacements(0, 0, 0, 2, 'garden-3')
    expect(placements.map((p) => p.key)).toEqual(['garden-3:0', 'garden-3:1'])
  })

  it('clamps a non-positive bed count to a single bed', () => {
    expect(cropsBedPlacements(0, 0, 0, 0)).toHaveLength(1)
  })
})

describe('settlement well instancing shadow buckets', () => {
  /** Mirrors `buildSettlementProps`'s `wellTemplate` / `wellTemplateNoShadow`
   *  split (plan settlements-019): same shared geometry/material, only
   *  `castShadow` differs between the two flatten roots. */
  function makeWellTemplate(): Group {
    const root = new Group()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return root
  }

  it('keeps central (shadow-casting) and household (no-shadow) wells in separate InstancedMesh buckets sharing geometry', () => {
    const shadowTemplate = makeWellTemplate()
    const noShadowTemplate = disableCastShadow(shadowTemplate.clone(true)) as Group

    const central = buildInstancedProps(
      [shadowTemplate],
      [wellPropPlacement(0, 0, 0, 'central')],
      'settlement-well-central',
    )!
    const household = buildInstancedProps(
      [noShadowTemplate],
      [wellPropPlacement(5, 5, 0, 'household-0'), wellPropPlacement(10, 5, 0, 'household-1')],
      'settlement-well-household',
    )!

    const centralMesh = central.group.children[0] as unknown as Mesh
    const householdMesh = household.group.children[0] as unknown as Mesh
    expect(centralMesh.castShadow).toBe(true)
    expect(householdMesh.castShadow).toBe(false)
    // Same shared geometry/material reference — no per-bucket GPU duplication.
    expect(householdMesh.geometry).toBe(centralMesh.geometry)
    expect(householdMesh.material).toBe(centralMesh.material)
  })
})
