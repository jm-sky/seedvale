import * as THREE from 'three'

const fireAtlas = new THREE.TextureLoader().load('/images/flame/fire_atlas.png')
fireAtlas.colorSpace = THREE.SRGBColorSpace

type PoolParticle = {
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  lifetime: number
  atlasIndex: number
}

export type ParticlePool = {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial | THREE.PointsMaterial
  update: (delta: number) => void
}

/** One-shot variant of `ParticlePool` for the flint ignition burst — dormant
 *  (fully faded, no per-frame respawn) until `trigger()` resets every
 *  particle to a fresh, forceful spawn at once. */
export type BurstPool = ParticlePool & { trigger: () => void }

type PoolTuning = {
  count: number
  color: number
  size: number
  /** Random spawn offset from the pool's local origin (the flame base). */
  spawnRadius: number
  upSpeed: readonly [number, number]
  lateralSpeed: number
  gravity: number
  /** Fraction of lateral velocity removed per second. */
  drag: number
  lifetime: readonly [number, number]
}

function randRange([lo, hi]: readonly [number, number]): number {
  return lo + Math.random() * (hi - lo)
}

function spawnParticle(tuning: PoolTuning, scale: number): PoolParticle {
  const angle = Math.random() * Math.PI * 2
  const radius = Math.random() * tuning.spawnRadius * scale
  return {
    position: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * tuning.lateralSpeed * scale,
      randRange(tuning.upSpeed) * scale,
      (Math.random() - 0.5) * tuning.lateralSpeed * scale,
    ),
    age: 0,
    lifetime: randRange(tuning.lifetime),
    atlasIndex: Math.random() < 0.5 ? 0 : 1,
  }
}

/** Shared fixed-size particle pool backing sparks/embers/ignite bursts — one
 *  `THREE.Points` per pool, particles are mutated in place every frame, no
 *  allocation in `update()`. Per-particle fade near end of life is a vertex
 *  `color` attribute (darkened toward black) combined with additive
 *  blending, so it reads as fading out without a custom shader —
 *  `PointsMaterial.opacity` alone can't vary per particle.
 *
 *  `continuous: true` respawns a particle in place as soon as it dies (a
 *  steady rising shower — sparks/embers). `continuous: false` freezes dead
 *  particles invisible until something external re-triggers them (the flint
 *  burst, see `createIgniteBurst`). */
function createParticlePool(
  tuning: PoolTuning,
  scale: number,
  options: { continuous: boolean },
): ParticlePool & { particles: PoolParticle[] } {
  const particles = Array.from({ length: tuning.count }, () => {
    const particle = spawnParticle(tuning, scale)
    if (options.continuous) particle.age = Math.random() * particle.lifetime
    else particle.age = particle.lifetime // start dormant
    return particle
  })

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count * 3), 3)
  const colorAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count * 3), 3)
  const atlasAttribute = new THREE.BufferAttribute(new Float32Array(tuning.count), 1)

  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('color', colorAttribute)
  geometry.setAttribute('atlasIndex', atlasAttribute)

  const material = new THREE.PointsMaterial({
    color: tuning.color,
    size: tuning.size * scale,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  })

  function update(delta: number) {
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i]!
      particle.age += delta

      if (particle.age >= particle.lifetime) {
        if (!options.continuous) {
          colorAttribute.setXYZ(i, 0, 0, 0)
          continue
        }
        particles[i] = spawnParticle(tuning, scale)
      } else {
        particle.velocity.y -= tuning.gravity * delta
        const damp = Math.max(0, 1 - tuning.drag * delta)
        particle.velocity.x *= damp
        particle.velocity.z *= damp
        particle.position.addScaledVector(particle.velocity, delta)
      }

      const current = particles[i]!
      const t = THREE.MathUtils.clamp(current.age / current.lifetime, 0, 1)
      const fade = 1 - t * t
      atlasAttribute.setX(i, current.atlasIndex)
      positionAttribute.setXYZ(i, current.position.x, current.position.y, current.position.z)
      colorAttribute.setXYZ(i, fade, fade, fade)
    }
    positionAttribute.needsUpdate = true
    colorAttribute.needsUpdate = true
    atlasAttribute.needsUpdate = true
  }

  return { points: new THREE.Points(geometry, material), geometry, material, update, particles }
}

const SPARK_TUNING: PoolTuning = {
  count: 8,
  color: 0xffb347,
  size: 0.05,
  spawnRadius: 0.08,
  upSpeed: [0.7, 1.2],
  lateralSpeed: 0.35,
  gravity: 0.6,
  drag: 0.15,
  lifetime: [0.7, 1.3],
}

/** Normal fire sparks — small count, warm colour, continuous cheap shower
 *  rising from the flame base with gravity pulling them back down. */
export function createSparks(scale: number): ParticlePool {
  const pool = createParticlePool(SPARK_TUNING, scale, { continuous: true })
  return { points: pool.points, geometry: pool.geometry, material: pool.material, update: pool.update }
}

const EMBER_TUNING: PoolTuning = {
  count: 10,
  color: 0xff5522,
  size: 0.045,
  spawnRadius: 0.14,
  upSpeed: [0.08, 0.22],
  lateralSpeed: 0.08,
  gravity: 0.05,
  drag: 0.05,
  lifetime: [1.4, 2.4],
}

/** Glowing embers at the flame base — a handful of slow-drifting emissive
 *  points, visible even while the flame itself is still just ramping up
 *  from ignition. */
export function createEmbers(scale: number): ParticlePool {
  const pool = createParticlePool(EMBER_TUNING, scale, { continuous: true })
  return { points: pool.points, geometry: pool.geometry, material: pool.material, update: pool.update }
}

const TORCH_SPARK_TUNING: PoolTuning = {
  count: 12,
  color: 0xffb347,
  size: 0.045,
  spawnRadius: 0.09,
  upSpeed: [0.45, 0.9],
  lateralSpeed: 0.22,
  gravity: 0.2,
  drag: 0.1,
  lifetime: [0.9, 1.6],
}

/** A handful of larger, faster-rising sparks for a post-mounted torch, seen
 *  from a few meters away — unlike `createEmbers`' subtle near-ground drift
 *  (tuned for a campfire's base), these visibly climb a meter-plus above
 *  the flame before fading. */
export function createTorchSparks(scale: number): ParticlePool {
  const pool = createParticlePool(TORCH_SPARK_TUNING, scale, { continuous: true })
  return { points: pool.points, geometry: pool.geometry, material: pool.material, update: pool.update }
}

const IGNITE_BURST_TUNING: PoolTuning = {
  count: 12,
  color: 0xffffff,
  size: 0.06,
  spawnRadius: 0.05,
  upSpeed: [1.6, 2.6],
  lateralSpeed: 1.1,
  gravity: 1.6,
  drag: 0.4,
  lifetime: [0.35, 0.6],
}

/** One-shot white flint-strike burst — dormant until `trigger()`, which
 *  resets every particle to a fresh, forceful spawn at once. Reuses the same
 *  pool machinery as `createSparks`/`createEmbers` instead of spinning up a
 *  second particle system. */
export function createIgniteBurst(scale: number): BurstPool {
  const pool = createParticlePool(IGNITE_BURST_TUNING, scale, { continuous: false })
  pool.update(0)
  return {
    points: pool.points,
    geometry: pool.geometry,
    material: pool.material,
    update: pool.update,
    trigger() {
      for (const particle of pool.particles) {
        const fresh = spawnParticle(IGNITE_BURST_TUNING, scale)
        particle.position.copy(fresh.position)
        particle.velocity.copy(fresh.velocity)
        particle.age = 0
        particle.lifetime = fresh.lifetime
      }
    },
  }
}
