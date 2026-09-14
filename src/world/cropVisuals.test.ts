import { InstancedMesh } from 'three'
import { describe, expect, it } from 'vitest'
import { CROP_DEFS, type CropPlacement } from './cropLifecycle'
import {
  createCropPlacementVisual,
  CROP_VISUAL_INSTANCE_BUDGET,
  resolveCropRenderedCount,
  resolveCropVisualLayout,
} from './cropVisuals'
import { CROP_PLANT_FOOTPRINT_RADIUS, makePlantedCropId } from './plantedCrops'

function planted(cropId: CropPlacement['cropId'], id = makePlantedCropId(1, 4, 6)): CropPlacement {
  return { id, x: 4, z: 6, cropId, stageStartedAt: 0 }
}

function wild(cropId: CropPlacement['cropId'] = 'carrot'): CropPlacement {
  return { id: '0:0:crop0', x: 4, z: 6, cropId, stageStartedAt: 0 }
}

describe('resolveCropRenderedCount', () => {
  it('keeps wild crops as a single visual plant', () => {
    expect(resolveCropRenderedCount(wild('carrot'), CROP_DEFS.carrot)).toBe(1)
    expect(resolveCropRenderedCount(wild('potato'), CROP_DEFS.potato)).toBe(1)
  })

  it('caps planted visuals by the species budget, not logical population', () => {
    expect(resolveCropRenderedCount(planted('carrot'), CROP_DEFS.carrot)).toBe(CROP_VISUAL_INSTANCE_BUDGET.carrot)
    expect(CROP_VISUAL_INSTANCE_BUDGET.carrot).toBeLessThan(CROP_DEFS.carrot.logicalPlantsPerSowingUnit)
    expect(resolveCropRenderedCount(planted('carrot'), CROP_DEFS.carrot)).not.toBe(CROP_DEFS.carrot.yieldCount)
  })
})

describe('resolveCropVisualLayout', () => {
  it('is deterministic for the same placement identity', () => {
    const placement = planted('carrot')
    expect(resolveCropVisualLayout(placement, CROP_DEFS.carrot)).toEqual(
      resolveCropVisualLayout(placement, CROP_DEFS.carrot),
    )
  })

  it('does not change spatial offsets when the growth stage would change', () => {
    const placement = planted('potato')
    const first = resolveCropVisualLayout(placement, CROP_DEFS.potato)
    const later = resolveCropVisualLayout({ ...placement, stageStartedAt: 40 }, CROP_DEFS.potato)
    expect(later.map((t) => ({ dx: t.dx, dz: t.dz, yaw: t.yaw, scale: t.scale }))).toEqual(
      first.map((t) => ({ dx: t.dx, dz: t.dz, yaw: t.yaw, scale: t.scale })),
    )
  })

  it('keeps every instance inside the logical planting footprint', () => {
    for (const def of Object.values(CROP_DEFS)) {
      const layout = resolveCropVisualLayout(planted(def.id), def)
      expect(layout.length).toBeGreaterThan(0)
      for (const transform of layout) {
        expect(Math.hypot(transform.dx, transform.dz)).toBeLessThanOrEqual(CROP_PLANT_FOOTPRINT_RADIUS)
      }
    }
  })

  it('uses a different layout for a different placement id', () => {
    const a = resolveCropVisualLayout(planted('carrot', makePlantedCropId(1, 4, 6)), CROP_DEFS.carrot)
    const b = resolveCropVisualLayout(planted('carrot', makePlantedCropId(2, 4, 6)), CROP_DEFS.carrot)
    expect(a).not.toEqual(b)
  })
})

describe('createCropPlacementVisual', () => {
  it('instances a planted cluster as one InstancedMesh per template primitive, not one Object3D per plant', () => {
    const visual = createCropPlacementVisual(planted('carrot'), CROP_DEFS.carrot, 'mature', () => 0)
    expect(visual.userData.cropId).toBe(makePlantedCropId(1, 4, 6))
    expect(visual.children).toHaveLength(1)
    const instanced = visual.children[0] as InstancedMesh
    expect(instanced.isInstancedMesh).toBe(true)
    expect(instanced.count).toBe(resolveCropRenderedCount(planted('carrot'), CROP_DEFS.carrot))
    expect(instanced.count).toBeGreaterThan(1)
  })

  it('keeps a wild crop as a single instance', () => {
    const visual = createCropPlacementVisual(wild(), CROP_DEFS.carrot, 'young', () => 0)
    const instanced = visual.children[0] as InstancedMesh
    expect(instanced.count).toBe(1)
  })
})
