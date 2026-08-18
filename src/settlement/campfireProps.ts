import * as THREE from 'three'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import { createEmbers, createIgniteBurst, createSparks } from '../shared/getFireParticles'
import {
  CAMPFIRE_FIT_MAX,
  CAMPFIRE_FLAME_FIT_MAX,
  CAMPFIRE_FLAME_Y,
  CAMPFIRE_UNLIT_URL,
  FIRE_FX_URL,
} from './propSpecs'

/** `'pit'` — stone ring + stacked wood. `'simple'` — wood only (stones hidden
 *  on the GLB, or a bare ash+branch pile on the procedural fallback). */
export type CampfireBodyKind = 'pit' | 'simple'

type CampfireLayer = 'stone' | 'wood'

let campfireBodyTemplate: THREE.Object3D | null = null
let campfireFlameTemplate: THREE.Object3D | null = null
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
 *  Safe to call repeatedly — one in-flight promise. */
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
    try {
      const fire = await loadGltf(FIRE_FX_URL)
      preparePropFitMax(fire, CAMPFIRE_FLAME_FIT_MAX)
      // Same orientation as village torch posts — authored +Y up. Do not copy
      // PlayerTorch's extra π/2 (that aligns a stick tip to +Z and dumps the
      // billboard on its side in world space).
      campfireFlameTemplate = fire
    } catch (err) {
      console.warn('[campfire] fire.glb unavailable — procedural cone flame', err)
    }
  })()
  return campfireTemplatesPromise
}

export function peekCampfireFlameTemplate(): THREE.Object3D | null {
  return campfireFlameTemplate
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

/** How small a near-spent fire shrinks to and how large a freshly-stacked
 *  one grows to, relative to `setSize(1)`'s normal single-branch look — see
 *  `CampfireFlame.setSize`. */
const FLAME_MIN_SIZE = 0.55
const FLAME_MAX_SIZE = 1.8

/** The lightable/toggleable fire visual for a settlement's own campfire —
 *  separate from `createCampfire()`'s static stone-ring/wood body (world
 *  remains in `terrain/chunkEnvironment.ts` stay unlit). `object` bundles
 *  an optional `fire.glb` (else an emissive cone) + a low-range point light
 *  + rising spark/ember particles (`shared/getFireParticles.ts`). `update`
 *  must be called each frame while lit. Pass `flameMesh` for the GLB tip;
 *  omit it for the procedural cone (`PlayerTorch` / village-torch fallback). */
export type CampfireFlame = {
  object: THREE.Group
  update: (dt: number) => void
  setSize: (factor: number) => void
  /** `0` = only embers, no cone/light/sparks yet; `1` = fully grown-in flame
   *  — driven by `VillageFire`'s ignition ramp (`IGNITE_DURATION_SEC`).
   *  Defaults to `1`, so callers that never call this (village torches
   *  reusing this same flame, `createVillageTorchLight`) keep the previous
   *  instant-full-flame look. */
  setIntensity: (t: number) => void
  /** One-shot white flint-strike spark burst — call once at the start of an
   *  actual player ignition action, not for autonomous/night lighting. */
  igniteBurst: () => void
}

function muteObjectLights(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ('isLight' in obj && (obj as { isLight?: boolean }).isLight) {
      const light = obj as THREE.PointLight
      light.intensity = 0
      // Plan 157 §3.2 — a permanently-muted embedded light (e.g. one authored
      // into a GLB flame model) should never count toward NUM_POINT_LIGHTS.
      light.visible = false
    }
  })
}

/** Unlit clone of fire.glb materials — Standard + 0.75 opacity made the
 *  inner faces (lit by the campfire PointLight) glow while outward walls
 *  shaded dark. Basic + full opacity keeps the whole billboard emissive. */
function makeUnlitFlameMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const converted = mats.map((mat) => {
      const src = mat as THREE.MeshStandardMaterial
      const color = src.emissive && src.emissive.getHex() !== 0
        ? src.color.clone().lerp(src.emissive, 0.55)
        : (src.color?.clone() ?? new THREE.Color(0xff9a3c))
      return new THREE.MeshBasicMaterial({
        color,
        map: src.map ?? null,
        alphaMap: src.alphaMap ?? null,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        side: THREE.DoubleSide,
        fog: true,
        toneMapped: false,
      })
    })
    mesh.material = converted.length === 1 ? converted[0]! : converted
  })
}

export function createCampfireFlame(
  scale = 1,
  flameMesh: THREE.Object3D | null = null,
): CampfireFlame {
  const flame = new THREE.Group()

  let meshVisual: THREE.Object3D
  const meshBaseScale = 1
  let restY = 0
  let riseFromBase = false
  if (flameMesh) {
    const glFlame = flameMesh.clone(true)
    muteObjectLights(glFlame)
    makeUnlitFlameMaterials(glFlame)
    // Keep preparePropFitMax foot alignment on the mesh. Scale/rise the pivot
    // so ignition grows up from the coals instead of puffing in XYZ mid-air.
    const pivot = new THREE.Group()
    pivot.add(glFlame)
    restY = CAMPFIRE_FLAME_Y * scale
    pivot.position.y = restY
    flame.add(pivot)
    meshVisual = pivot
    riseFromBase = true
  } else {
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff9a3c,
      emissive: 0xff6a1a,
      emissiveIntensity: 1.4,
      flatShading: true,
    })
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28 * scale, 0.6 * scale, 6), flameMat)
    cone.position.y = 0.3 * scale
    flame.add(cone)
    meshVisual = cone
  }

  const baseIntensity = 6
  const baseDistance = 16 * scale
  const light = new THREE.PointLight(0xff8a3c, baseIntensity, baseDistance, 2)
  light.position.y = 0.35 * scale
  flame.add(light)

  const sparks = createSparks(scale)
  flame.add(sparks.points)

  const embers = createEmbers(scale)
  flame.add(embers.points)

  const burst = createIgniteBurst(scale)
  flame.add(burst.points)

  flame.visible = false

  let sizeFactor = 1
  let igniteRamp = 1

  function applyVisual() {
    const clampedSize = THREE.MathUtils.clamp(sizeFactor, FLAME_MIN_SIZE, FLAME_MAX_SIZE)
    // Smoothstep so the flame eases in/out of full size instead of growing
    // at a constant linear rate (plan 130 §4).
    const eased = igniteRamp * igniteRamp * (3 - 2 * igniteRamp)
    flame.scale.setScalar(clampedSize)
    meshVisual.visible = eased > 0.08
    if (riseFromBase) {
      // Only Y grows — XZ stays at rest width so the flame doesn't peak
      // oversized then settle. Pivot origin is the coals.
      meshVisual.scale.set(1, Math.max(0.08, eased), 1)
      meshVisual.position.y = restY
    } else {
      meshVisual.scale.setScalar(Math.max(0.05, eased) * meshBaseScale)
    }
    light.intensity = baseIntensity * clampedSize * eased
    light.distance = baseDistance * clampedSize
    sparks.material.opacity = eased
  }

  function setSize(factor: number) {
    sizeFactor = factor
    applyVisual()
  }
  function setIntensity(t: number) {
    igniteRamp = THREE.MathUtils.clamp(t, 0, 1)
    applyVisual()
  }
  setSize(1)

  function update(dt: number) {
    sparks.update(dt)
    embers.update(dt)
    burst.update(dt)
  }

  return { object: flame, update, setSize, setIntensity, igniteBurst: () => burst.trigger() }
}

/** Body + toggleable flame for settlement / player-built fires. */
export function createLitCampfireVisual(
  kind: CampfireBodyKind,
  scale = 1,
): { group: THREE.Group, flame: CampfireFlame } {
  const group = createCampfireBody(kind, scale)
  const flame = createCampfireFlame(scale, peekCampfireFlameTemplate())
  group.add(flame.object)
  return { group, flame }
}
