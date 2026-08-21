import { Mesh, type Scene, type Vector3 } from 'three'
import type { RiverChain, WorldRect } from '../terrain/riverNetwork'
import { buildRiverRibbonGeometry, clipChainToRect } from './riverGeometry'
import { createRiverWaterMaterial } from './riverWaterMaterial'
import { setWaterDayNight, tickWaterTime } from './waterMaterial'
import { WATER_RENDER_LAYER } from './waterMirror'

export type WorldRiver = {
  mesh: Mesh
  update: (dt: number) => void
  setDayNight: (dayFactor: number, sunDirection: Vector3) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

/**
 * Per-chunk river ribbon. `chains` are the cached, already-computed chains
 * from every river tile overlapping this chunk (`riverTileCache`) — this
 * function only clips + builds geometry, it never recomputes hydrology.
 * Returns `null` when nothing overlaps this chunk's rectangle, so the common
 * case (a chunk with no river nearby) costs nothing.
 */
export function createChunkRiver(
  chains: RiverChain[],
  chunkRect: WorldRect,
  chunkOriginX: number,
  chunkOriginZ: number,
  /** Samples this chunk's *actual* rendered terrain height (road/clearing-modified,
   *  same data the terrain mesh itself is built from) at a world point — used for
   *  ribbon Y instead of the chain's cached (road-agnostic) hydrology elevation, so
   *  the river never floats above or gets hidden under the real rendered ground. */
  sampleTerrainY: (worldX: number, worldZ: number) => number,
): WorldRiver | null {
  const runs = chains.flatMap((chain) => clipChainToRect(chain, chunkRect))
  const geometry = buildRiverRibbonGeometry(runs, chunkOriginX, chunkOriginZ, sampleTerrainY)
  if (!geometry) return null

  const material = createRiverWaterMaterial()
  const mesh = new Mesh(geometry, material)
  mesh.position.set(chunkOriginX, 0, chunkOriginZ)
  mesh.renderOrder = 1
  mesh.name = 'chunk-river'
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
      mesh.removeFromParent()
    },
  }
}
