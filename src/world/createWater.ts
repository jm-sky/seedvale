import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  type Scene,
  type Vector3,
} from 'three'
import { createWaterMaterial, setWaterDayNight, tickWaterTime } from './waterMaterial'
import { bindWaterMirror, WATER_RENDER_LAYER, type WaterMirror } from './waterMirror'

export type WorldWater = {
  mesh: Mesh
  update: (dt: number) => void
  /** 0 = full night, 1 = full day — darkens/tints water in step with sky/fog/lights. */
  setDayNight: (dayFactor: number, sunDirection: Vector3) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

function createDataTexture(data: Float32Array, resolution: number): DataTexture {
  const tex = new DataTexture(data, resolution, resolution, RedFormat, FloatType)
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

/** Cap on water mesh segments — keeps the shoreline mask sharp without matching
 *  the terrain 1:1 at very high resolutions (water doesn't need that much detail). */
const MAX_WATER_SEGMENTS = 256

/**
 * Per-chunk water from the shared lake/ocean shader family. Waves live in
 * world XZ so neighbouring chunks stay in phase. Ocean cells (bodyScale 1)
 * are drawn here with the shoreline mask — the singleton ocean fills only
 * the open sea beyond loaded chunks.
 * Returns `null` when the chunk has no submerged texels at all, so dry chunks
 * (the common case in an open world) cost nothing.
 */
export function createChunkWater(
  heights: Float32Array,
  floorHeights: Float32Array,
  bodyScale: Float32Array,
  resolution: number,
  chunkOriginX: number,
  chunkOriginZ: number,
  chunkSize: number,
  waterLevel: number,
  waterMirror?: WaterMirror,
): WorldWater | null {
  let hasWater = false
  for (let i = 0; i < heights.length; i++) {
    if (heights[i]! <= waterLevel + 0.35) {
      hasWater = true
      break
    }
  }
  if (!hasWater) return null

  const segments = Math.min(resolution - 1, MAX_WATER_SEGMENTS)
  const geometry = new PlaneGeometry(chunkSize, chunkSize, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const heightTex = createDataTexture(heights, resolution)
  const floorTex = createDataTexture(floorHeights, resolution)
  const bodyScaleTex = createDataTexture(bodyScale, resolution)

  const material = createWaterMaterial({
    ocean: 0,
    waterLevel,
    mapSize: chunkSize,
    heightmap: heightTex,
    floorHeights: floorTex,
    bodyScale: bodyScaleTex,
  })
  if (waterMirror) bindWaterMirror(material, waterMirror)

  const mesh = new Mesh(geometry, material)
  mesh.position.set(chunkOriginX, waterLevel + 0.07, chunkOriginZ)
  mesh.renderOrder = 1
  mesh.name = 'chunk-water'
  mesh.layers.set(WATER_RENDER_LAYER)

  return {
    mesh,
    update(dt) {
      tickWaterTime(material, dt)
    },
    setDayNight(dayFactor, sunDirection) {
      setWaterDayNight(material, dayFactor, sunDirection)
    },
    addTo(scene) {
      scene.add(mesh)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      heightTex.dispose()
      floorTex.dispose()
      bodyScaleTex.dispose()
      mesh.removeFromParent()
    },
  }
}
