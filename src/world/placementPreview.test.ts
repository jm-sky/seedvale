import { describe, expect, it } from 'vitest'
import { createPlacementPreviewGhost, placementEntranceMarkerLocalZ } from './placementPreview'
import { residentialBuildingApproachLocal, residentialBuildingDefinition } from './residentialBuilding'

describe('placement entrance marker (plan items-player-022)', () => {
  it('sits on the local -Z footprint edge, the same front as residential approach', () => {
    const { depth } = residentialBuildingDefinition('small_house').footprint
    expect(placementEntranceMarkerLocalZ(depth)).toBe(-depth / 2)
    expect(residentialBuildingApproachLocal('small_house').z).toBeLessThan(placementEntranceMarkerLocalZ(depth))
    expect(residentialBuildingApproachLocal('medium_house').z).toBeLessThan(0)
  })

  it('shows the marker for a house box footprint, hides it otherwise, and rotates with yaw', () => {
    const ghost = createPlacementPreviewGhost()
    const { width, depth } = residentialBuildingDefinition('small_house').footprint
    ghost.setFootprint({ kind: 'box', width, depth })
    ghost.setEntranceMarker(true)
    const marker = ghost.group.children.find((child) => child.type === 'LineSegments')
    expect(marker?.visible).toBe(true)
    expect(marker?.position.z).toBe(placementEntranceMarkerLocalZ(depth))
    ghost.setTransform(8, 12, 1, Math.PI / 2)
    expect(ghost.group.rotation.y).toBe(Math.PI / 2)
    ghost.setEntranceMarker(false)
    expect(marker?.visible).toBe(false)
    ghost.setFootprint({ kind: 'circle', radius: 1 })
    ghost.setEntranceMarker(true)
    expect(marker?.visible).toBe(false)
    ghost.dispose()
  })
})
