import { describe, expect, it } from 'vitest'
import type { MapKnownLocation } from '../../world/map/mapTypes'
import { MINIMAP_SCALE } from './drawMinimap'
import {
  classifyNavigationTargetMinimap,
  isMinimapCanvasPoint,
  minimapHalfRange,
  minimapQueryViewport,
  selectNearbyMinimapPois,
} from './minimapLocationMarkers'

function loc(id: string, x: number, z: number): MapKnownLocation {
  return {
    id,
    kind: 'landmark',
    x,
    z,
    state: 'confirmed',
    source: 'exploration',
  }
}

function canvasPoint(
  worldX: number,
  worldZ: number,
  playerX: number,
  playerZ: number,
  yaw: number,
  size: number,
  scale: number,
): { x: number, y: number } {
  const centerX = size / 2
  const centerY = size / 2
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const dx = worldX - playerX
  const dz = worldZ - playerZ
  const rx = dx * cos - dz * sin
  const ry = dx * sin + dz * cos
  return { x: centerX + rx * scale, y: centerY + ry * scale }
}

describe('selectNearbyMinimapPois', () => {
  const size = 200
  const scale = MINIMAP_SCALE
  const playerX = 0
  const playerZ = 0
  const yaw = 0

  it('includes a known location on the minimap canvas as nearby POI', () => {
    const known = [loc('cave:a', 10, 0)]
    const { x, y } = canvasPoint(10, 0, playerX, playerZ, yaw, size, scale)
    expect(isMinimapCanvasPoint(x, y, size)).toBe(true)
    const pois = selectNearbyMinimapPois(known, new Set(), (l) => {
      const p = canvasPoint(l.x, l.z, playerX, playerZ, yaw, size, scale)
      return isMinimapCanvasPoint(p.x, p.y, size)
    })
    expect(pois.map((p) => p.id)).toEqual(['cave:a'])
  })

  it('excludes locations the player does not know (caller passes only known list)', () => {
    const pois = selectNearbyMinimapPois([], new Set(), () => true)
    expect(pois).toEqual([])
  })

  it('does not treat off-canvas known locations as nearby POI (no edge arrow layer)', () => {
    const far = loc('lake:b', 500, 0)
    const pois = selectNearbyMinimapPois([far], new Set(), (l) => {
      const p = canvasPoint(l.x, l.z, playerX, playerZ, yaw, size, scale)
      return isMinimapCanvasPoint(p.x, p.y, size)
    })
    expect(pois).toEqual([])
  })

  it('skips a location that is also an active navigation target', () => {
    const known = [loc('cave:c', 5, 0)]
    const pois = selectNearbyMinimapPois(known, new Set(['cave:c']), (l) => {
      const p = canvasPoint(l.x, l.z, playerX, playerZ, yaw, size, scale)
      return isMinimapCanvasPoint(p.x, p.y, size)
    })
    expect(pois).toEqual([])
  })
})

describe('classifyNavigationTargetMinimap', () => {
  const halfRange = minimapHalfRange(200, MINIMAP_SCALE)

  it('marks an in-range target with a minimap marker', () => {
    expect(
      classifyNavigationTargetMinimap(10, 0, 0, 0, halfRange, 'cave:t', 1),
    ).toEqual({ type: 'marker', id: 'cave:t', slot: 1 })
  })

  it('marks an out-of-range target with an edge arrow, not POI', () => {
    expect(
      classifyNavigationTargetMinimap(500, 0, 0, 0, halfRange, 'cave:t', 2),
    ).toEqual({ type: 'edge_arrow', id: 'cave:t', slot: 2 })
  })
})

describe('minimap zoom and viewport', () => {
  it('shrinks query viewport when minimap zoom increases so fewer POI qualify', () => {
    const size = 200
    const lowZoom = minimapQueryViewport(0, 0, size, MINIMAP_SCALE * 1)
    const highZoom = minimapQueryViewport(0, 0, size, MINIMAP_SCALE * 3)
    expect(highZoom.maxX - highZoom.minX).toBeLessThan(lowZoom.maxX - lowZoom.minX)
    const atEdge = loc('cemetery:d', 40, 0)
    const inLow = atEdge.x >= lowZoom.minX && atEdge.x <= lowZoom.maxX
    const inHigh = atEdge.x >= highZoom.minX && atEdge.x <= highZoom.maxX
    expect(inLow).toBe(true)
    expect(inHigh).toBe(false)
  })

  it('drops POI that fall outside the canvas after projection at higher zoom', () => {
    const size = 200
    const playerX = 0
    const playerZ = 0
    const yaw = 0
    const worldX = 45
    const lowScale = MINIMAP_SCALE
    const highScale = MINIMAP_SCALE * 3
    const lowPoint = canvasPoint(worldX, 0, playerX, playerZ, yaw, size, lowScale)
    const highPoint = canvasPoint(worldX, 0, playerX, playerZ, yaw, size, highScale)
    expect(isMinimapCanvasPoint(lowPoint.x, lowPoint.y, size)).toBe(true)
    expect(isMinimapCanvasPoint(highPoint.x, highPoint.y, size)).toBe(false)
  })
})
