import * as THREE from 'three'
import type { BurstPool, FireVisualOptions, ParticlePool, PoolParticle, PoolTuning } from './fireParticles.type'

/**
 * Shared fire VFX (plan fire-vfx overhaul) — the single particle system behind
 * every flame in the game: settlement campfire, village/standing torches and
 * the player's handheld branch/torch. `createFireVisual()` is the entry point
 * most callers want (flame + sparks + embers, one ignite burst); the
 * individual `createFlameParticles`/`createFireSparks`/`createEmberParticles`
 * factories exist for callers that only need a single layer.
 *
 * Flame particles sample a 2x2 variant atlas (`/images/flame/fire_atlas.png`)
 * — narrow/vertical tongues in the top row, wider/irregular blobs in the
 * bottom row (`FLAME_ATLAS_COLUMNS`/`FLAME_ATLAS_ROWS`, not the file itself).
 * Sparks/embers/the ignite burst are untextured point sprites (a soft
 * circular falloff computed in the fragment shader) — no PNG, no extra
 * draw call/material per particle. Everything renders through `THREE.Points`
 * with a custom `ShaderMaterial`, particles are mutated in place every frame
 * (no per-frame allocation), and one `FireVisual` bundle costs exactly three
 * `THREE.Points` draw calls total (flame/sparks/embers) regardless of
 * particle count.
 */

const FLAME_ATLAS_COLUMNS = 2
const FLAME_ATLAS_ROWS = 2

const fireAtlas =
  typeof window !== 'undefined' ? new THREE.TextureLoader().load('/images/flame/fire_atlas.png') : undefined
if (fireAtlas) fireAtlas.colorSpace = THREE.SRGBColorSpace


/** Fast-rising bright points — visible sparks above the flame. */
const SPARK_TUNING: PoolTuning = {
  count: 7,
  color: 0xffb347,
  size: 0.075,
  spawnRadius: 0.09,
  upSpeed: [0.55, 1.05],
  lateralSpeed: 0.12,
  gravity: 0.35,
  drag: 0.15,
  lifetime: [1, 1.8],
}

/** Textured flame tongues — layered close to the fire base. */
const FLAME_TUNING: PoolTuning = {
  count: 11,
  color: 0xff8a3c,
  size: 1,
  sizeJitter: [0.65, 1.35],
  spawnRadius: 0.04,
  upSpeed: [0.01, 0.5],
  lateralSpeed: 0.018,
  gravity: 0,
  drag: 1.0,
  lifetime: [0.45, 0.7],
  driftAmplitude: 0.012,
  rotationSpeed: [-0.06, 0.06],
  rotation: [-0.08, 0.08],
}

/** Slow glowing points near the fire base — subtle ember layer. */
const EMBER_TUNING: PoolTuning = {
  count: 16,
  color: 0xee4411,
  size: 0.2,
  spawnRadius: 0.1,
  upSpeed: [0.01, 0.10],
  lateralSpeed: 0.035,
  gravity: 0.08,
  drag: 0.05,
  lifetime: [1.4, 2.0],
}


function randRange([lo, hi]: readonly [number, number]): number {
  return lo + Math.random() * (hi - lo)
}

/** Weighted atlas pick for flame particles — biases toward the narrow/
 *  vertical top-row variants (0, 1) so they dominate and naturally build the
 *  flame's vertical tongues, with the wide/irregular bottom-row variants
 *  (2, 3) filling in its base. */
function pickFlameVariant(): number {
  const narrow = Math.random() < 0.65
  return (narrow ? 0 : 2) + (Math.random() < 0.5 ? 0 : 1)
}

const PLAIN_VARIANT: () => number = () => 0

function spawnParticle(tuning: PoolTuning, scale: number, pickVariant: () => number): PoolParticle {
  const angle = Math.random() * Math.PI * 2
  const radius = Math.random() * tuning.spawnRadius * scale
  const [sizeLo, sizeHi] = tuning.sizeJitter ?? [1, 1]
  const [rotLo, rotHi] = tuning.rotationSpeed ?? [0, 0]
  return {
    position: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * tuning.lateralSpeed * scale,
      randRange(tuning.upSpeed) * scale,
      (Math.random() - 0.5) * tuning.lateralSpeed * scale,
    ),
    age: 0,
    lifetime: randRange(tuning.lifetime),
    atlasIndex: pickVariant(),
    sizeMul: sizeLo + Math.random() * (sizeHi - sizeLo),
    rotation: randRange(tuning.rotation ?? [0, 0]),
    rotationSpeed: randRange([rotLo, rotHi]),
    driftPhase: Math.random() * Math.PI * 2,
    driftFreq: 1.4 + Math.random() * 1.6,
  }
}

/** Shared fixed-size particle pool backing flame/sparks/embers/ignite bursts
 *  — one `THREE.Points` per pool, particles are mutated in place every frame,
 *  no allocation in `update()`. Per-particle fade near end of life is a
 *  vertex `color` attribute (darkened toward black) combined with additive
 *  blending, so it reads as fading out without extra blending passes.
 *
 *  `textured: true` (flame only) samples the 2x2 fire atlas at a per-particle
 *  `atlasIndex`/`rotation`/`sizeMul`; `textured: false` (sparks/embers/burst)
 *  renders a plain soft-circular point sprite — no texture sample, no PNG.
 *
 *  `continuous: true` respawns a particle in place as soon as it dies (a
 *  steady rising shower/flame). `continuous: false` freezes dead particles
 *  invisible until something external re-triggers them (the flint burst). */
function createParticlePool(
  tuning: PoolTuning,
  scale: number,
  options: { continuous: boolean, textured: boolean },
): ParticlePool & { particles: PoolParticle[] } {
  const pickVariant = options.textured ? pickFlameVariant : PLAIN_VARIANT
  const particles = Array.from({ length: tuning.count }, () => {
    const particle = spawnParticle(tuning, scale, pickVariant)
    if (options.continuous) particle.age = Math.random() * particle.lifetime
    else particle.age = particle.lifetime // start dormant
    return particle
  })

  const geometry = new THREE.BufferGeometry()
  const baseColor = new THREE.Color(tuning.color)
  const positionAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count * 3), 3)
  const colorAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count * 3), 3)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('color', colorAttribute)

  let atlasAttribute: THREE.BufferAttribute | null = null
  let sizeAttribute: THREE.BufferAttribute | null = null
  let rotationAttribute: THREE.BufferAttribute | null = null
  let ageAttribute: THREE.BufferAttribute | null = null

  if (options.textured) {
    atlasAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count), 1)
    sizeAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count), 1)
    rotationAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count), 1)
    ageAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count), 1)

    geometry.setAttribute('atlasIndex', atlasAttribute)
    geometry.setAttribute('sizeMul', sizeAttribute)
    geometry.setAttribute('rotation', rotationAttribute)
    geometry.setAttribute('ageFactor', ageAttribute)
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: fireAtlas },
      pointSize: { value: tuning.size * scale },
      intensity: { value: 1 },
    },

    vertexShader: options.textured
      ? `
        attribute float atlasIndex;
        attribute float sizeMul;
        attribute float rotation;
        attribute float ageFactor;
        attribute vec3 color;

        varying float vAtlasIndex;
        varying float vRotation;
        varying float vAge;
        varying vec3 vColor;

        uniform float pointSize;

        void main() {
          vAtlasIndex = atlasIndex;
          vRotation = rotation;
          vAge = ageFactor;
          vColor = color;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pointSize * sizeMul * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `
      : `
        attribute vec3 color;
        varying vec3 vColor;

        uniform float pointSize;

        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pointSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,

    fragmentShader: options.textured
      ? `
        uniform sampler2D map;
        uniform float intensity;

        varying float vAtlasIndex;
        varying float vRotation;
        varying float vAge;
        varying vec3 vColor;

        void main() {
          vec2 pc = gl_PointCoord - 0.5;
          float s = sin(vRotation);
          float c = cos(vRotation);
          pc = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y) + 0.5;

          float col = mod(vAtlasIndex, ${FLAME_ATLAS_COLUMNS.toFixed(1)});
          float row = floor(vAtlasIndex / ${FLAME_ATLAS_COLUMNS.toFixed(1)});
          float rowFromBottom = ${(FLAME_ATLAS_ROWS - 1).toFixed(1)} - row;
          vec2 uv = vec2(
            (col + pc.x) / ${FLAME_ATLAS_COLUMNS.toFixed(1)},
            (rowFromBottom + (1.0 - pc.y)) / ${FLAME_ATLAS_ROWS.toFixed(1)}
          );

          vec4 texel = texture2D(map, uv);
          if (texel.a < 0.01) discard;

          // Gradient temperatury:
          // vAge ~ 0.0: Jasny, gorący rdzeń (biel/żółć > 1.0 dla efektu gow/bloom)
          // vAge ~ 0.3: Klasyczny ciepły pomarańcz
          // vAge ~ 1.0: Ciemna czerwień na szczycie płomienia
          vec3 hotColor = mix(vec3(1.3, 1.2, 0.8), vec3(1.0, 0.4, 0.05), smoothstep(0.0, 0.3, vAge));
          vec3 coolColor = mix(vec3(1.0, 0.4, 0.05), vec3(0.4, 0.05, 0.01), smoothstep(0.3, 1.0, vAge));
          vec3 flameColor = mix(hotColor, coolColor, step(0.3, vAge));

          // Przenikanie: szybkie wygaszanie na samej górze
          float alphaFade = 1.0 - vAge * vAge;

          gl_FragColor = vec4(texel.rgb * flameColor * intensity, texel.a * alphaFade * intensity);
        }
      `
      : `
        uniform float intensity;
        varying vec3 vColor;

        void main() {
          vec2 pc = gl_PointCoord - 0.5;
          float falloff = smoothstep(0.5, 0.05, length(pc));
          if (falloff <= 0.001) discard;
          gl_FragColor = vec4(vColor * intensity, falloff * intensity);
        }
      `,

    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  function update(delta: number) {
    const driftAmp = tuning.driftAmplitude ?? 0
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i]!
      particle.age += delta

      if (particle.age >= particle.lifetime) {
        if (!options.continuous) {
          colorAttribute.setXYZ(i, 0, 0, 0)
          continue
        }
        particles[i] = spawnParticle(tuning, scale, pickVariant)
      } else {
        particle.velocity.y -= tuning.gravity * delta
        const damp = Math.max(0, 1 - tuning.drag * delta)
        particle.velocity.x *= damp
        particle.velocity.z *= damp
        particle.position.addScaledVector(particle.velocity, delta)
        particle.rotation += particle.rotationSpeed * delta
      }

      const current = particles[i]!
      const t = THREE.MathUtils.clamp(current.age / current.lifetime, 0, 1)
      const fade = 1 - t * t
      const drift =
        driftAmp === 0 ? 0 : Math.sin(current.age * current.driftFreq + current.driftPhase) * driftAmp * scale

      if (atlasAttribute) atlasAttribute.setX(i, current.atlasIndex)
      if (sizeAttribute) sizeAttribute.setX(i, current.sizeMul)
      if (rotationAttribute) rotationAttribute.setX(i, current.rotation)
      if (ageAttribute) ageAttribute.setX(i, t)

      positionAttribute.setXYZ(i, current.position.x + drift, current.position.y, current.position.z + drift * 0.6)
      colorAttribute.setXYZ(i, baseColor.r * fade, baseColor.g * fade, baseColor.b * fade)
    }
    positionAttribute.needsUpdate = true
    colorAttribute.needsUpdate = true
    if (atlasAttribute) atlasAttribute.needsUpdate = true
    if (sizeAttribute) sizeAttribute.needsUpdate = true
    if (rotationAttribute) rotationAttribute.needsUpdate = true
    if (ageAttribute) ageAttribute.needsUpdate = true
  }

  return {
    points: new THREE.Points(geometry, material),
    geometry,
    material,
    update,
    setIntensity(t: number) {
      material.uniforms.intensity!.value = t
    },
    particles,
  }
}

export type ParticleLayerOptions = { scale?: number, count?: number }


/** The flame itself — 10-12 overlapping textured particles, each an
 *  independently-scaled/timed/positioned pick from the 2x2 fire atlas.
 *  Narrow variants build the vertical tongues, wide variants the base. */
export function createFlameParticles(options: ParticleLayerOptions = {}): ParticlePool {
  const scale = options.scale ?? 1
  const tuning: PoolTuning = options.count ? { ...FLAME_TUNING, count: options.count } : FLAME_TUNING
  const pool = createParticlePool(tuning, scale, { continuous: true, textured: true })
  return {
    points: pool.points,
    geometry: pool.geometry,
    material: pool.material,
    update: pool.update,
    setIntensity: pool.setIntensity
  }
}


/** Fire sparks — plain bright points (no texture), a small count, rising
 *  mostly straight up with a little lateral drift and fade-out. */
export function createFireSparks(options: ParticleLayerOptions = {}): ParticlePool {
  const scale = options.scale ?? 1
  const tuning: PoolTuning = options.count ? { ...SPARK_TUNING, count: options.count } : SPARK_TUNING
  const pool = createParticlePool(tuning, scale, { continuous: true, textured: false })
  return { points: pool.points, geometry: pool.geometry, material: pool.material, update: pool.update, setIntensity: pool.setIntensity }
}

/** Glowing embers at the flame base — small, slow-drifting, less visible
 *  than the flame itself; visible even while the flame is still ramping up
 *  from ignition (see `createFireVisual`). */
export function createEmberParticles(options: ParticleLayerOptions = {}): ParticlePool {
  const scale = options.scale ?? 1
  const tuning: PoolTuning = options.count ? { ...EMBER_TUNING, count: options.count } : EMBER_TUNING
  const pool = createParticlePool(tuning, scale, { continuous: true, textured: false })
  return { points: pool.points, geometry: pool.geometry, material: pool.material, update: pool.update, setIntensity: pool.setIntensity }
}

const IGNITE_BURST_TUNING: PoolTuning = {
  count: 12,
  color: 0xffffff,
  size: 0.1,
  spawnRadius: 0.05,
  upSpeed: [1.6, 2.6],
  lateralSpeed: 1.1,
  gravity: 1.6,
  drag: 0.4,
  lifetime: [0.35, 0.6],
}

/** One-shot white flint-strike burst — dormant until `trigger()`, which
 *  resets every particle to a fresh, forceful spawn at once. Plain points,
 *  same rendering as `createFireSparks`. */
export function createIgniteBurst(scale: number): BurstPool {
  const pool = createParticlePool(IGNITE_BURST_TUNING, scale, { continuous: false, textured: false })
  pool.update(0)
  return {
    points: pool.points,
    geometry: pool.geometry,
    material: pool.material,
    update: pool.update,
    setIntensity: pool.setIntensity,
    trigger() {
      for (const particle of pool.particles) {
        const fresh = spawnParticle(IGNITE_BURST_TUNING, scale, PLAIN_VARIANT)
        particle.position.copy(fresh.position)
        particle.velocity.copy(fresh.velocity)
        particle.age = 0
        particle.lifetime = fresh.lifetime
      }
    },
  }
}

/** Cheap deterministic flicker — a sum of two incommensurate sines seeded
 *  per-fire (`seed`, generated once at fire creation) so many fires on
 *  screen don't pulse in lockstep, and reads less mechanically regular than
 *  a single sinusoid — without `Math.random()` in the per-frame path or a
 *  noise library. Returns roughly [0.9, 1.1]. */
export function fireFlicker(time: number, seed: number): number {
  const a = Math.sin(time * 3.7 + seed)
  const b = Math.sin(time * 1.3 + seed * 2.1)
  return 1 + (a * 0.6 + b * 0.4) * 0.1
}

/** How small a near-spent fire shrinks to and how large a freshly-stacked
 *  one grows to, relative to `setSize(1)`'s normal look — shared so a
 *  caller's own `PointLight` scaling (which `createFireVisual` doesn't own)
 *  can clamp to the same range as the visual. */
export const FIRE_SIZE_CLAMP: readonly [number, number] = [0.55, 1.8]

export type FireVisual = {
  object: THREE.Group
  update: (dt: number) => void
  setSize: (factor: number) => void
  setIntensity: (t: number) => void
  igniteBurst: () => void
  /** Current per-fire flicker (see `fireFlicker`) — callers reuse it for
   *  their own `PointLight` intensity so the light stays in phase with the
   *  visible flame. */
  flicker: () => number
  /** Current smoothstep-eased ignition ramp (`setIntensity`'s `t`, eased) —
   *  callers' own `PointLight` fades in with this the same way the flame/
   *  spark layers do. */
  rampFactor: () => number
}

/**
 * Combined flame + sparks + embers bundle — the shared fire VFX used by
 * settlement campfires, village/standing torches and the player's handheld
 * flame. Does not own a `PointLight`; callers keep their own (different
 * fires have different intensity/falloff/`pointLightBudget` needs).
 */
export function createFireVisual(options: FireVisualOptions = {}): FireVisual {
  const baseSize = options.size ?? 1
  const flame = createFlameParticles({ scale: baseSize, count: options.flameCount })
  const sparks = createFireSparks({ scale: baseSize, count: options.sparkCount })
  const embers = createEmberParticles({ scale: baseSize, count: options.emberCount })
  const burst = createIgniteBurst(baseSize)

  // Embers sit outside the flicker/ignite-ramp group — glowing coals stay
  // visible even before the flame itself has caught (ramp 0).
  const flameGroup = new THREE.Group()
  flameGroup.add(flame.points, sparks.points, burst.points)
  const object = new THREE.Group()
  object.add(flameGroup, embers.points)

  const seed = Math.random() * 1000
  let time = seed
  let sizeFactor = 1
  let igniteRamp = 1
  let lastFlick = 1
  let lastEased = 1

  function applyVisual() {
    const clampedSize = THREE.MathUtils.clamp(sizeFactor, FIRE_SIZE_CLAMP[0], FIRE_SIZE_CLAMP[1])
    lastEased = igniteRamp * igniteRamp * (3 - 2 * igniteRamp)
    const widthWobble = 1 + (lastFlick - 1) * 0.5
    flameGroup.scale.set(clampedSize * widthWobble, clampedSize * lastFlick, clampedSize * widthWobble)
    flameGroup.position.x = 0
    flame.setIntensity(Math.max(0.05, lastEased))
    sparks.setIntensity(lastEased)
  }

  applyVisual()

  return {
    object,
    update(dt: number) {
      time += dt * 4
      lastFlick = fireFlicker(time, seed)
      applyVisual()
      flame.update(dt)
      sparks.update(dt)
      embers.update(dt)
      burst.update(dt)
    },
    setSize(factor: number) {
      sizeFactor = factor
      applyVisual()
    },
    setIntensity(t: number) {
      igniteRamp = THREE.MathUtils.clamp(t, 0, 1)
      applyVisual()
    },
    igniteBurst: () => burst.trigger(),
    flicker: () => lastFlick,
    rampFactor: () => lastEased,
  }
}
