import * as THREE from 'three'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { createFireVisual, FIRE_SIZE_CLAMP } from '../shared/getFireParticles'
import { CAMPFIRE_FIT_MAX, CAMPFIRE_UNLIT_URL } from './propSpecs'

/** `'pit'` — stone ring + stacked wood. `'simple'` — wood only (stones hidden
 *  on the GLB, or a bare ash+branch pile on the procedural fallback). */
export type CampfireBodyKind = 'pit' | 'simple'

type CampfireLayer = 'stone' | 'wood'

let campfireBodyTemplate: THREE.Object3D | null = null
let campfireTemplatesPromise: Promise<void> | null = null

function meshMaterialNames(mesh: THREE.Mesh): string {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return mats.map((m) => m.name ?? '').join(' ')
}

function tagCampfireLayers(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const names = meshMaterialNames(mesh)
    if (/stone/i.test(names)) mesh.userData.campfireLayer = 'stone' satisfies CampfireLayer
    else if (/wood/i.test(names)) mesh.userData.campfireLayer = 'wood' satisfies CampfireLayer
  })
}

function applyCampfireBodyKind(root: THREE.Object3D, kind: CampfireBodyKind): void {
  if (kind !== 'simple') return
  root.traverse((obj) => {
    if (obj.userData.campfireLayer === 'stone') obj.visible = false
  })
}

function asGroup(object: THREE.Object3D): THREE.Group {
  if (object instanceof THREE.Group) return object
  const group = new THREE.Group()
  group.add(object)
  return group
}

/** Starts GLB parse off the `PlacedFires.place()` / chunk-finalize path.
 *  Safe to call repeatedly — one in-flight promise. Flame is a shared
 *  particle VFX (`shared/getFireParticles.ts`), not a GLB — only the body
 *  needs preloading here. */
export function preloadCampfireTemplates(): Promise<void> {
  campfireTemplatesPromise ??= (async () => {
    try {
      const model = await loadGltf(CAMPFIRE_UNLIT_URL)
      preparePropFitMax(model, CAMPFIRE_FIT_MAX)
      tagCampfireLayers(model)
      campfireBodyTemplate = model
    } catch (err) {
      console.warn('[campfire] campfire_unlit.glb unavailable — procedural body', err)
    }
  })()
  return campfireTemplatesPromise
}

function cloneCampfireBodyFromTemplate(scale: number, kind: CampfireBodyKind): THREE.Group {
  const clone = campfireBodyTemplate!.clone(true)
  clone.scale.multiplyScalar(scale)
  applyCampfireBodyKind(clone, kind)
  return asGroup(clone)
}

function createProceduralCampfirePit(scale: number): THREE.Group {
  const fire = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6f6b63, flatShading: true })
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x2b2724, flatShading: true, roughness: 1 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, flatShading: true })

  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.55 * scale, 10), ashMat)
  ash.rotation.x = -Math.PI / 2
  ash.position.y = 0.02
  ash.receiveShadow = true
  fire.add(ash)

  const ringCount = 8
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 * scale, 0), stoneMat)
    stone.position.set(Math.cos(a) * 0.6 * scale, 0.08 * scale, Math.sin(a) * 0.6 * scale)
    stone.rotation.set(a, a * 0.7, 0)
    stone.castShadow = true
    fire.add(stone)
  }

  for (let i = 0; i < 3; i++) {
    const a = i * 2.1
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025 * scale, 0.03 * scale, 0.7 * scale, 5),
      woodMat,
    )
    branch.rotation.set(Math.PI / 2 - 0.25, 0, a)
    branch.position.y = 0.05 * scale
    branch.castShadow = true
    fire.add(branch)
  }

  return fire
}

function createProceduralSimpleFireBase(scale: number): THREE.Group {
  const fire = new THREE.Group()
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x2b2724, flatShading: true, roughness: 1 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, flatShading: true })

  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.4 * scale, 10), ashMat)
  ash.rotation.x = -Math.PI / 2
  ash.position.y = 0.02
  ash.receiveShadow = true
  fire.add(ash)

  for (let i = 0; i < 2; i++) {
    const a = i * 2.4
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022 * scale, 0.028 * scale, 0.55 * scale, 5),
      woodMat,
    )
    branch.rotation.set(Math.PI / 2 - 0.25, 0, a)
    branch.position.y = 0.04 * scale
    branch.castShadow = true
    fire.add(branch)
  }

  return fire
}

export function createCampfireBody(kind: CampfireBodyKind, scale = 1): THREE.Group {
  if (campfireBodyTemplate) return cloneCampfireBodyFromTemplate(scale, kind)
  return kind === 'simple' ? createProceduralSimpleFireBase(scale) : createProceduralCampfirePit(scale)
}

/** Old campfire remains — stone ring + stacked wood (GLB) or procedural
 *  fallback. Purely decorative, not an `Interactable` (see plans/archive/2026-08-07--030). */
export function createCampfire(scale = 1): THREE.Group {
  return createCampfireBody('pit', scale)
}

/** A minimal "prosta ognisko" base — stacked wood without the stone ring
 *  (GLB wood layer, or procedural ash+branches). Used by `PlacedFires.ts`
 *  for the cheaper, shorter-burning `kind: 'simple'` fire (plan 050 / 135). */
export function createSimpleFireBase(scale = 1): THREE.Group {
  return createCampfireBody('simple', scale)
}

/** The lightable/toggleable fire visual for a settlement's own campfire —
 *  separate from `createCampfire()`'s static stone-ring/wood body (world
 *  remains in `terrain/chunkEnvironment.ts` stay unlit). `object` bundles the
 *  shared flame/spark/ember particle VFX (`shared/getFireParticles.ts`) + a
 *  low-range point light. `update` must be called each frame while lit. */
export type CampfireFlame = {
  object: THREE.Group
  update: (dt: number) => void
  setSize: (factor: number) => void
  /** `0` = only embers, no flame/light/sparks yet; `1` = fully grown-in flame
   *  — driven by `VillageFire`'s ignition ramp (`IGNITE_DURATION_SEC`).
   *  Defaults to `1`, so callers that never call this (village torches, which
   *  build their own bundle directly via `createFireVisual`) keep the
   *  previous instant-full-flame look. */
  setIntensity: (t: number) => void
  /** One-shot white flint-strike spark burst — call once at the start of an
   *  actual player ignition action, not for autonomous/night lighting. */
  igniteBurst: () => void
}

export function createCampfireFlame(scale = 1): CampfireFlame {
  const flame = new THREE.Group()

  const fireVisual = createFireVisual({ size: scale })
  flame.add(fireVisual.object)

  const baseIntensity = 6
  const baseDistance = 16 * scale
  const light = new THREE.PointLight(0xff8a3c, baseIntensity, baseDistance, 2)
  light.position.y = 0.35 * scale
  flame.add(light)

  flame.visible = false

  let sizeFactor = 1

  function applyLight() {
    const clampedSize = THREE.MathUtils.clamp(sizeFactor, FIRE_SIZE_CLAMP[0], FIRE_SIZE_CLAMP[1])
    light.intensity = baseIntensity * clampedSize * fireVisual.rampFactor() * fireVisual.flicker()
    light.distance = baseDistance * clampedSize
  }

  function setSize(factor: number) {
    sizeFactor = factor
    fireVisual.setSize(factor)
    applyLight()
  }

  function setIntensity(t: number) {
    fireVisual.setIntensity(t)
    applyLight()
  }

  setSize(1)

  function update(dt: number) {
    fireVisual.update(dt)
    applyLight()
  }

  return { object: flame, update, setSize, setIntensity, igniteBurst: () => fireVisual.igniteBurst() }
}

/** Body + toggleable flame for settlement / player-built fires. */
export function createLitCampfireVisual(
  kind: CampfireBodyKind,
  scale = 1,
): { group: THREE.Group, flame: CampfireFlame } {
  const group = createCampfireBody(kind, scale)
  const flame = createCampfireFlame(scale)
  group.add(flame.object)
  return { group, flame }
}

/** Plan 175 — procedural grate: an iron-rod frame sitting over the fire, so it
 *  reads as physical cooking equipment rather than a second, independent
 *  object floating near the flame. No GLB exists yet (`docs/assets/MODELS.md`);
 *  this is the fallback the plan explicitly allows shipping without one. Only
 *  ever attached as a child of an existing fire's own group
 *  (`settlement/PlacedFires.ts`) — it registers no light of its own. */
export function createGrateVisual(scale = 1): THREE.Group {
  const grate = new THREE.Group()
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, flatShading: true, metalness: 0.6, roughness: 0.5 })

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6 * scale, 0.03 * scale, 6, 16), ironMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.32 * scale
  ring.castShadow = true
  grate.add(ring)

  const barCount = 6
  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1) - 0.5
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * scale, 0.018 * scale, 1.1 * scale, 5), ironMat)
    bar.rotation.z = Math.PI / 2
    bar.position.set(0, 0.32 * scale, t * 1.05 * scale)
    bar.castShadow = true
    grate.add(bar)
  }

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * scale, 0.02 * scale, 0.32 * scale, 5), ironMat)
    leg.position.set(Math.cos(a) * 0.55 * scale, 0.16 * scale, Math.sin(a) * 0.55 * scale)
    leg.castShadow = true
    grate.add(leg)
  }

  return grate
}
