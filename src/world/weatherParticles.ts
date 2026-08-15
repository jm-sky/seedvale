import * as THREE from 'three'
import type { WeatherState } from './weather'
import { isSystemEnabled } from '../debug/debugMode'

/** GPU-driven rain/snow (plan 040 §11-13 — closes the Etap 3 deviation noted
 *  in the implementation notes). Per-particle position/fall/drift is computed
 *  procedurally in the vertex shader from a fixed-at-creation attribute
 *  (`aRandom`: phase, speed/size variation, draw-order slot) plus `uTime` —
 *  no Transform Feedback / ping-pong buffers, since nothing here needs
 *  persistent GPU-side state that can't be reconstructed from
 *  `(seed attributes, elapsed time, weather params)`. JS only ever touches a
 *  handful of uniforms + the emitter's own transform (player-follow); there
 *  is no per-particle loop and no per-frame `BufferAttribute` upload.
 *
 *  "Wind" here is the same bounded sinusoidal sway the previous CPU
 *  implementation used (`drift`), not a new field — `WeatherState` (plan 040)
 *  intentionally carries no wind vector, and this task must not extend it. */

const VOLUME_RADIUS = 26
const VOLUME_HEIGHT = 20
const RAIN_MAX_COUNT = 900
const SNOW_MAX_COUNT = 500
const RAIN_FALL_SPEED = 14
const SNOW_FALL_SPEED = 1.6
const RAIN_DRIFT = 0.6
const SNOW_DRIFT = 0.4
const RAIN_SIZE = 0.16
const SNOW_SIZE = 0.24
const RAIN_MAX_OPACITY = 0.5
const SNOW_MAX_OPACITY = 0.85

const VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  uniform float uTime;
  uniform float uFallSpeed;
  uniform float uVolumeHeight;
  uniform float uDrift;
  uniform float uSize;
  uniform float uSizeScale;
  uniform float uVisibleFraction;

  // x = phase [0,1), y = fall speed multiplier, z = point-size multiplier,
  // w = draw-order slot [0,1) — set once at emitter creation, never reuploaded.
  attribute vec4 aRandom;

  void main() {
    float speed = max(0.05, uFallSpeed * aRandom.y);
    float period = uVolumeHeight / speed;
    // Wrapping the fall (and everything derived from it) into one period
    // keeps trig/position math bounded regardless of how large uTime grows
    // over a long session — same reason the CPU version reset on recycle.
    float localT = mod(uTime + aRandom.x * period, period);
    float fallProgress = localT * speed;

    vec3 pos = position;
    pos.y = uVolumeHeight - fallProgress;
    float wobblePhase = aRandom.x * 6.2831853;
    pos.x += sin(fallProgress * 0.3 + wobblePhase) * uDrift;
    pos.z += cos(fallProgress * 0.24 + wobblePhase) * uDrift * 0.6;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Intensity/quality gate: park this particle outside the clip volume
    // instead of branching on visibility — cheaper than a fragment discard
    // and needs no CPU-side particle count change when weather/quality shifts.
    if (aRandom.w > uVisibleFraction) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }

    gl_PointSize = uSize * aRandom.z * uSizeScale / max(0.001, -mvPosition.z);

    #include <fog_vertex>
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>

  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <fog_fragment>
  }
`

type Emitter = {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  maxOpacity: number
  /** Emitter-local clock — only advances while this emitter is the active
   *  weather type, so it never needs to sync with the world clock. */
  time: number
}

type EmitterConfig = {
  maxCount: number
  color: number
  size: number
  fallSpeed: number
  drift: number
  maxOpacity: number
}

function createEmitter(cfg: EmitterConfig): Emitter {
  const { maxCount } = cfg
  const geometry = new THREE.BufferGeometry()
  const position = new Float32Array(maxCount * 3)
  const random = new Float32Array(maxCount * 4)
  for (let i = 0; i < maxCount; i++) {
    position[i * 3 + 0] = (Math.random() - 0.5) * 2 * VOLUME_RADIUS
    position[i * 3 + 1] = 0
    position[i * 3 + 2] = (Math.random() - 0.5) * 2 * VOLUME_RADIUS
    random[i * 4 + 0] = Math.random()
    random[i * 4 + 1] = 0.85 + Math.random() * 0.3
    random[i * 4 + 2] = 0.7 + Math.random() * 0.6
    random[i * 4 + 3] = i / maxCount
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(random, 4))

  const uniforms: THREE.ShaderMaterial['uniforms'] = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uFallSpeed: { value: cfg.fallSpeed },
      uVolumeHeight: { value: VOLUME_HEIGHT },
      uDrift: { value: cfg.drift },
      uSize: { value: cfg.size },
      uSizeScale: { value: 300 },
      uColor: { value: new THREE.Color(cfg.color) },
      uOpacity: { value: 0 },
      uVisibleFraction: { value: 0 },
    },
  ])

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })

  const points = new THREE.Points(geometry, material)
  // Volume is recentered on the player every frame — culling against the
  // camera frustum by its (stale) local bounding sphere would pop it in/out.
  points.frustumCulled = false
  points.visible = false

  return { points, geometry, material, maxOpacity: cfg.maxOpacity, time: 0 }
}

function updateEmitter(
  emitter: Emitter,
  dt: number,
  active: boolean,
  intensity: number,
  sizeScale: number,
  qualityCeiling: number,
): void {
  const visible = isSystemEnabled('weather') && active && intensity > 0.02
  emitter.points.visible = visible
  if (!visible) return
  emitter.time += dt
  const u = emitter.material.uniforms
  u.uTime!.value = emitter.time
  u.uSizeScale!.value = sizeScale
  // Fewer particles active at low intensity reads as "light rain/snow"
  // without changing per-particle size/speed (same formula as the CPU
  // version); `qualityCeiling` additionally caps the budget on weaker
  // devices (plan 103 `quality.lodScale`), without touching GPU buffers.
  const densityFraction = Math.min(1, 0.25 + intensity * 0.75)
  u.uVisibleFraction!.value = Math.max(0.12, densityFraction * qualityCeiling)
  u.uOpacity!.value = emitter.maxOpacity * (0.35 + intensity * 0.65)
}

export type WeatherParticlesOptions = {
  /** Live accessor for `WorldConfig.quality.lodScale` (plan 103, 0.25..1) —
   *  read every frame so a mid-session preset change takes effect without
   *  reallocating the fixed-size particle buffers. */
  getLodScale: () => number
}

export type WeatherParticles = {
  addTo: (scene: THREE.Scene) => void
  update: (
    dt: number,
    weather: WeatherState,
    playerX: number,
    playerY: number,
    playerZ: number,
    cameraFovDeg: number,
    viewportHeight: number,
  ) => void
  dispose: () => void
}

export function createWeatherParticles(opts: WeatherParticlesOptions): WeatherParticles {
  const rain = createEmitter({
    maxCount: RAIN_MAX_COUNT,
    color: 0x9fb4c9,
    size: RAIN_SIZE,
    fallSpeed: RAIN_FALL_SPEED,
    drift: RAIN_DRIFT,
    maxOpacity: RAIN_MAX_OPACITY,
  })
  const snow = createEmitter({
    maxCount: SNOW_MAX_COUNT,
    color: 0xffffff,
    size: SNOW_SIZE,
    fallSpeed: SNOW_FALL_SPEED,
    drift: SNOW_DRIFT,
    maxOpacity: SNOW_MAX_OPACITY,
  })

  function update(
    dt: number,
    weather: WeatherState,
    playerX: number,
    playerY: number,
    playerZ: number,
    cameraFovDeg: number,
    viewportHeight: number,
  ): void {
    const centerY = playerY + VOLUME_HEIGHT * 0.4
    // Player-following volume: move the container, not the particles —
    // per-particle positions stay local offsets baked in at creation.
    rain.points.position.set(playerX, centerY, playerZ)
    snow.points.position.set(playerX, centerY, playerZ)

    // Perspective point-size attenuation three.js's own PointsMaterial gets
    // from the renderer automatically; a plain ShaderMaterial has to derive
    // it itself from the live camera/viewport.
    const fovRad = THREE.MathUtils.degToRad(cameraFovDeg)
    const sizeScale = viewportHeight > 0 && fovRad > 0
      ? viewportHeight / (2 * Math.tan(fovRad / 2))
      : 0
    const qualityCeiling = Math.max(0.25, Math.min(1, opts.getLodScale()))

    updateEmitter(rain, dt, weather.type === 'rain', weather.intensity, sizeScale, qualityCeiling)
    updateEmitter(snow, dt, weather.type === 'snow', weather.intensity, sizeScale, qualityCeiling)
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
