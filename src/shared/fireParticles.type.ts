import * as THREE from 'three'

export type PoolParticle = {
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  lifetime: number
  atlasIndex: number
  sizeMul: number
  rotation: number
  rotationSpeed: number
  driftPhase: number
  driftFreq: number
}

export type ParticlePool = {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  update: (delta: number) => void
  /** Fade multiplier for the whole pool (0-1) — `createFireVisual` ramps this
   *  with a fire's ignition progress. */
  setIntensity: (t: number) => void
}

/** One-shot variant of `ParticlePool` for the flint ignition burst — dormant
 *  (fully faded, no per-frame respawn) until `trigger()` resets every
 *  particle to a fresh, forceful spawn at once. */
export type BurstPool = ParticlePool & { trigger: () => void }

export type PoolTuning = {
  count: number
  color: number
  size: number
  /** Per-particle point-size multiplier range — flame only (variety in flame
   *  scale); sparks/embers stay a fixed size (`[1, 1]`, the default). */
  sizeJitter?: readonly [number, number]
  /** Random spawn offset from the pool's local origin (the flame base). */
  spawnRadius: number
  upSpeed: readonly [number, number]
  lateralSpeed: number
  gravity: number
  /** Fraction of lateral velocity removed per second. */
  drag: number
  lifetime: readonly [number, number]
  /** Subtle sinusoidal lateral sway on top of velocity drift (world units,
   *  before `scale`) — flame only. */
  driftAmplitude?: number
  /** Per-particle rotation speed range (rad/s) — flame only. */
  rotationSpeed?: readonly [number, number]
  rotation?: readonly [number, number]
}

export type FireVisualOptions = {
  /** Overall scale — flame width/height/spread, ember spread, spark
   *  spread/velocity. Particle counts are independent of this. Roughly
   *  1.0-1.5 for a campfire, 0.6-0.9 for a torch. */
  size?: number
  flameCount?: number
  emberCount?: number
  sparkCount?: number
}
