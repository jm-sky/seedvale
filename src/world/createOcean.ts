import { Mesh, PlaneGeometry, type Scene, type Vector3 } from 'three'
import { createWaterMaterial, setWaterDayNight, tickWaterTime } from './waterMaterial'

export type WorldOcean = {
  mesh: Mesh
  update: (dt: number) => void
  setDayNight: (dayFactor: number, sunDirection: Vector3) => void
  /** Recenters the ocean plane under the player — cheap (position only, no
   *  geometry/texture rebuild), unlike a chunked world's terrain/water. */
  follow: (x: number, z: number) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

/** Enough verts for world-space swell on the singleton; shore detail lives on
 *  chunk water. Wavelength is ~80 units, so ~12-unit faces are plenty. */
const OCEAN_SEGMENTS = 64

/**
 * Open-sea fill: one follow-the-player plane using the shared water shader
 * (`uOcean = 1`). No Water.js and no planar mirror (phase 3). Hidden inside
 * `fadeInner` so loaded chunk water owns the beach (`vCover` fade); visible
 * from `fadeOuter` out as the ring beyond streamed terrain.
 */
export function createOcean(
  size: number,
  waterLevel: number,
  fadeInner: number,
  fadeOuter: number,
): WorldOcean {
  const geometry = new PlaneGeometry(size, size, OCEAN_SEGMENTS, OCEAN_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)

  const material = createWaterMaterial({ ocean: 1, waterLevel, fadeInner, fadeOuter })

  const mesh = new Mesh(geometry, material)
  mesh.position.y = waterLevel + 0.02
  mesh.renderOrder = 0
  mesh.name = 'ocean'

  return {
    mesh,
    update(dt) {
      tickWaterTime(material, dt)
    },
    setDayNight(dayFactor, sunDirection) {
      setWaterDayNight(material, dayFactor, sunDirection)
    },
    follow(x, z) {
      mesh.position.x = x
      mesh.position.z = z
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
