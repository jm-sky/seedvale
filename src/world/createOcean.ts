import { type Camera, Mesh, PlaneGeometry, type Scene, type Vector3, type WebGLRenderer } from 'three'
import { createWaterMaterial, setWaterDayNight, tickWaterTime } from './waterMaterial'
import {
  bindWaterMirror,
  WATER_RENDER_LAYER,
  type WaterMirror,
} from './waterMirror'

export type WorldOcean = {
  mesh: Mesh
  update: (dt: number) => void
  setDayNight: (dayFactor: number, sunDirection: Vector3) => void
  /** Recenters the ocean plane under the player — cheap (position only, no
   *  geometry/texture rebuild), unlike a chunked world's terrain/water. */
  follow: (x: number, z: number) => void
  setReflections: (enabled: boolean) => void
  /** Shared 128² planar pass — throttled to 30 Hz inside `waterMirror`. */
  renderMirror: (renderer: WebGLRenderer, scene: Scene, camera: Camera) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

/** Enough verts for world-space swell on the singleton; shore detail lives on
 *  chunk water. Wavelength is ~80 units, so ~12-unit faces are plenty. */
const OCEAN_SEGMENTS = 64

/**
 * Open-sea fill: one follow-the-player plane using the shared water shader
 * (`uOcean = 1`). Hidden inside `fadeInner` so loaded chunk water owns the
 * beach (`vCover` fade); visible from `fadeOuter` out as the ring beyond
 * streamed terrain. Owns the shared WaterMirror RT (dispose with this ocean).
 */
export function createOcean(
  size: number,
  waterLevel: number,
  fadeInner: number,
  fadeOuter: number,
  waterMirror: WaterMirror,
): WorldOcean {
  const geometry = new PlaneGeometry(size, size, OCEAN_SEGMENTS, OCEAN_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)

  const material = createWaterMaterial({ ocean: 1, waterLevel, fadeInner, fadeOuter })
  bindWaterMirror(material, waterMirror)

  const mesh = new Mesh(geometry, material)
  mesh.position.y = waterLevel + 0.02
  mesh.renderOrder = 0
  mesh.name = 'ocean'
  mesh.layers.set(WATER_RENDER_LAYER)

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
    setReflections(enabled) {
      waterMirror.setEnabled(enabled)
    },
    renderMirror(renderer, scene, camera) {
      waterMirror.render(renderer, scene, camera)
    },
    addTo(scene) {
      scene.add(mesh)
    },
    dispose() {
      waterMirror.dispose()
      geometry.dispose()
      material.dispose()
      mesh.removeFromParent()
    },
  }
}
