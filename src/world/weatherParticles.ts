import * as THREE from 'three'
import type { WeatherState } from './weather'

/** Rain/snow point-cloud volumes that follow the player — same `Points` +
 *  manual `BufferAttribute` update pattern as `shared/getFireParticles.ts`,
 *  scaled up into a box volume (rather than one fire's local shower) since
 *  precipitation has to cover the visible frustum around a moving player.
 *  Positions are stored as offsets from the emitter center and re-added every
 *  frame, so the volume "follows" the player without any world-space drift. */

const VOLUME_RADIUS = 26
const VOLUME_HEIGHT = 20
const RAIN_COUNT = 900
const SNOW_COUNT = 500
const RAIN_FALL_SPEED = 14
const SNOW_FALL_SPEED = 1.6
const RAIN_MAX_OPACITY = 0.5
const SNOW_MAX_OPACITY = 0.85

type Particle = { x: number, y: number, z: number }

function randomOffset(): number {
  return (Math.random() - 0.5) * 2 * VOLUME_RADIUS
}

function spawnParticle(): Particle {
  return { x: randomOffset(), y: Math.random() * VOLUME_HEIGHT, z: randomOffset() }
}

type Emitter = {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  material: THREE.PointsMaterial
  particles: Particle[]
  fallSpeed: number
  drift: number
  maxOpacity: number
}

function createEmitter(
  count: number,
  opts: { color: number, size: number, fallSpeed: number, drift: number, maxOpacity: number },
): Emitter {
  const particles = Array.from({ length: count }, spawnParticle)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  const material = new THREE.PointsMaterial({
    color: opts.color,
    size: opts.size,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geometry, material)
  // Volume is recentered on the player every frame — culling against the
  // camera frustum by its (stale) local bounding sphere would pop it in/out.
  points.frustumCulled = false
  points.visible = false
  return { points, geometry, material, particles, fallSpeed: opts.fallSpeed, drift: opts.drift, maxOpacity: opts.maxOpacity }
}

function updateEmitter(
  emitter: Emitter,
  dt: number,
  active: boolean,
  intensity: number,
  centerX: number,
  centerY: number,
  centerZ: number,
): void {
  emitter.points.visible = active && intensity > 0.02
  if (!emitter.points.visible) {
    emitter.material.opacity = 0
    return
  }
  const posAttr = emitter.geometry.attributes.position as THREE.BufferAttribute
  // Fewer particles active at low intensity reads as "light rain/snow"
  // without changing per-particle size/speed.
  const visibleCount = Math.max(1, Math.floor(emitter.particles.length * Math.min(1, 0.25 + intensity * 0.75)))
  for (let i = 0; i < emitter.particles.length; i++) {
    if (i >= visibleCount) {
      // Park unused particles far below so they don't render as a stray dot.
      posAttr.setXYZ(i, centerX, centerY - 1000, centerZ)
      continue
    }
    const p = emitter.particles[i]
    p.y -= emitter.fallSpeed * dt
    p.x += Math.sin(p.y * 0.3 + i) * emitter.drift * dt
    if (p.y < -1) {
      p.x = randomOffset()
      p.y = VOLUME_HEIGHT
      p.z = randomOffset()
    }
    posAttr.setXYZ(i, centerX + p.x, centerY + p.y, centerZ + p.z)
  }
  posAttr.needsUpdate = true
  emitter.material.opacity = emitter.maxOpacity * (0.35 + intensity * 0.65)
}

export type WeatherParticles = {
  addTo: (scene: THREE.Scene) => void
  update: (dt: number, weather: WeatherState, playerX: number, playerY: number, playerZ: number) => void
  dispose: () => void
}

export function createWeatherParticles(): WeatherParticles {
  const rain = createEmitter(RAIN_COUNT, {
    color: 0x9fb4c9,
    size: 0.09,
    fallSpeed: RAIN_FALL_SPEED,
    drift: 0.6,
    maxOpacity: RAIN_MAX_OPACITY,
  })
  const snow = createEmitter(SNOW_COUNT, {
    color: 0xffffff,
    size: 0.14,
    fallSpeed: SNOW_FALL_SPEED,
    drift: 0.4,
    maxOpacity: SNOW_MAX_OPACITY,
  })

  function update(dt: number, weather: WeatherState, playerX: number, playerY: number, playerZ: number): void {
    const centerY = playerY + VOLUME_HEIGHT * 0.4
    updateEmitter(rain, dt, weather.type === 'rain', weather.intensity, playerX, centerY, playerZ)
    updateEmitter(snow, dt, weather.type === 'snow', weather.intensity, playerX, centerY, playerZ)
  }

  return {
    addTo: (scene) => {
      scene.add(rain.points)
      scene.add(snow.points)
    },
    update,
    dispose: () => {
      rain.points.removeFromParent()
      snow.points.removeFromParent()
      rain.geometry.dispose()
      rain.material.dispose()
      snow.geometry.dispose()
      snow.material.dispose()
    },
  }
}
