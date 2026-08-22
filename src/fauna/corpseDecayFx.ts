import * as THREE from 'three'

/**
 * Lightweight rotting-corpse presentation (plan 188) — a handful of green
 * "flies"/spore points plus one translucent low-poly fog blob, both purely
 * cosmetic (no shadows, no per-corpse worker/emitter). Owned and
 * distance/phase-gated by `AnimalAgent` (`updateRotFx`): created only while
 * a corpse is in the `rotting` phase and within FX range, disposed the
 * instant either condition stops holding. Not a global particle framework —
 * one small group per currently-relevant corpse.
 */

const PARTICLE_COUNT = 7
const PARTICLE_COLOR = 0x6fae3f
const FOG_COLOR = 0x5a6b4a

export function createCorpseRotFx(modelHeight: number): THREE.Group {
  const group = new THREE.Group()
  group.name = 'corpse-rot-fx'
  const radius = Math.max(0.3, modelHeight * 0.5)

  const positions = new Float32Array(PARTICLE_COUNT * 3)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2
    positions[i * 3] = Math.cos(angle) * radius * 0.6
    positions[i * 3 + 1] = 0.15 + (i % 3) * 0.1
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.6
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const particleMaterial = new THREE.PointsMaterial({
    color: PARTICLE_COLOR,
    size: 0.06,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  })
  const points = new THREE.Points(geometry, particleMaterial)
  points.name = 'rot-particles'
  group.add(points)

  const fogGeometry = new THREE.IcosahedronGeometry(radius * 0.7, 0)
  const fogMaterial = new THREE.MeshBasicMaterial({
    color: FOG_COLOR,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const fog = new THREE.Mesh(fogGeometry, fogMaterial)
  fog.name = 'rot-fog'
  fog.position.y = 0.2
  group.add(fog)

  return group
}

/** Cheap idle animation (slow spin + fog pulse) driven by accumulated `dt`,
 *  not wall-clock time — purely cosmetic, never read back as lifecycle state. */
export function animateCorpseRotFx(fx: THREE.Object3D, dt: number): void {
  const elapsed = ((fx.userData.elapsed as number | undefined) ?? 0) + dt
  fx.userData.elapsed = elapsed
  fx.rotation.y = elapsed * 0.25
  const fog = fx.children.find((child) => child.name === 'rot-fog') as THREE.Mesh | undefined
  const fogMaterial = fog?.material as THREE.MeshBasicMaterial | undefined
  if (fogMaterial) fogMaterial.opacity = 0.14 + Math.sin(elapsed * 1.2) * 0.05
}

export function disposeCorpseRotFx(fx: THREE.Object3D | null): void {
  if (!fx) return
  fx.removeFromParent()
  fx.traverse((obj) => {
    const points = obj as THREE.Points
    if (points.geometry) points.geometry.dispose()
    const material = (obj as THREE.Points | THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined
    if (Array.isArray(material)) {
      for (const m of material) m.dispose()
    } else {
      material?.dispose()
    }
  })
}
