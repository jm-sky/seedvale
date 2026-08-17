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
  const scale = params.scale ?? 10000

  const sky = new Sky()
  sky.scale.setScalar(scale)
  // Don't let scene fog wash out the dome.
  sky.material.fog = false

  const uniforms = sky.material.uniforms
  uniforms['mieCoefficient']!.value = 0.004
  uniforms['mieDirectionalG']!.value = 0.85
  // three r18x's Sky addon added built-in procedural clouds, on by default
  // (cloudCoverage: 0.4) — Seedvale already has its own weather/cloud system
  // (weatherVisuals.ts/weatherParticles.ts) and never asked for these. Left
  // enabled, they render a sin()-based hash noise projected as
  // direction.xz / direction.y, which blows up toward the horizon
  // (direction.y -> 0) and loses float precision — sharp rectangular
  // artifacts that grow with visible sky area — and get brighter facing the
  // sun (sunInfluence term), compounding the bloom white-out from issue 033.
  // 0 skips the shader's whole cloud branch (`if (... && cloudCoverage > 0.0)`).
  uniforms['cloudCoverage']!.value = 0

  const sunPosition = new Vector3()

  const applyParams = (p: SkyParams, light?: DirectionalLight) => {
    uniforms['turbidity']!.value = p.turbidity
    uniforms['rayleigh']!.value = p.rayleigh
    sunFromAngles(p.inclination, p.azimuth, sunPosition)
    uniforms['sunPosition']!.value.copy(sunPosition)
    if (light) {
      light.position.copy(sunPosition).normalize().multiplyScalar(100)
      light.target.position.set(0, 0, 0)
      const elev = MathUtils.clamp(sunPosition.y * 1.2, 0.15, 1)
      light.intensity = 0.85 + elev * 0.9
      light.color.setRGB(1, 0.95 + elev * 0.03, 0.85 + elev * 0.1)
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
      applyParams(params, light)
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
