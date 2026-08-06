import { type DirectionalLight, MathUtils, type Scene, Vector3 } from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

export type SkyParams = {
  inclination: number
  azimuth: number
  turbidity: number
  rayleigh: number
  scale?: number
}

export type WorldSky = {
  mesh: Sky
  sunPosition: Vector3
  setParams: (params: SkyParams, light: DirectionalLight) => void
  applySun: (light: DirectionalLight) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

function sunFromAngles(inclination: number, azimuth: number, out: Vector3): void {
  const theta = Math.PI * (inclination - 0.5)
  const phi = 2 * Math.PI * (azimuth - 0.5)
  out.set(
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
    Math.sin(phi) * Math.cos(theta),
  )
}

export function createSky(params: SkyParams): WorldSky {
  const scale = params.scale ?? 4500

  const sky = new Sky()
  sky.scale.setScalar(scale)

  const uniforms = sky.material.uniforms
  uniforms['mieCoefficient']!.value = 0.005
  uniforms['mieDirectionalG']!.value = 0.8

  const sunPosition = new Vector3()

  const applyParams = (p: SkyParams, light?: DirectionalLight) => {
    uniforms['turbidity']!.value = p.turbidity
    uniforms['rayleigh']!.value = p.rayleigh
    sunFromAngles(p.inclination, p.azimuth, sunPosition)
    uniforms['sunPosition']!.value.copy(sunPosition)
    if (light) {
      light.position.copy(sunPosition).multiplyScalar(80)
      light.target.position.set(0, 0, 0)
      const elev = MathUtils.clamp(sunPosition.y, 0, 1)
      light.intensity = 0.7 + elev * 0.6
    }
  }

  applyParams(params)

  return {
    mesh: sky,
    sunPosition,
    setParams(next, light) {
      applyParams(next, light)
    },
    applySun(light) {
      light.position.copy(sunPosition).multiplyScalar(80)
      light.target.position.set(0, 0, 0)
      const elev = MathUtils.clamp(sunPosition.y, 0, 1)
      light.intensity = 0.7 + elev * 0.6
    },
    addTo(scene) {
      scene.add(sky)
      scene.background = null
    },
    dispose() {
      sky.geometry.dispose()
      sky.material.dispose()
    },
  }
}
