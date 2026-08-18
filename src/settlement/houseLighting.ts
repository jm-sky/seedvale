import * as THREE from 'three'
import { discoverGlbAnchors, resolveAssetAnchors } from '../assets/anchorResolve'
import { anchorsForAsset } from '../assets/assetAnchorData'
import { mergeAnchorDefs } from '../assets/assetAnchors'
import { createCampfireFlame } from './campfireProps'
import {
  HOUSE_FLOOR_LAMP_Y,
  HOUSE_LAMP_MAX_LOCAL_Y,
  type HouseCatalogEntry,
  type HouseLampMount,
  type HouseLampStyle,
} from './houseCatalog'

const HOUSE_LAMP_OFF_COLOR = new THREE.Color(0x3a2c22)
const HOUSE_LAMP_ON_COLOR = new THREE.Color(0xffb35c)

/** Small lamp mounted on a house wall — a lantern-sized cube rather than a
 *  window-sized pane, toggled continuously via `setNightIntensity(t)`
 *  (0 = daylight, dark/unlit fixture; 1 = full night glow), see
 *  `settlement/createSettlement.ts`'s day/night wiring. `MeshBasicMaterial`
 *  (unlit) so it doesn't pick up ordinary scene shading and read as a plain
 *  lit card during the day — previously a `MeshStandardMaterial` plane, which
 *  stayed visibly bright under daylight even at `emissiveIntensity: 0` (see
 *  plan `2026-08-08--044` §1.1's "hanging square" report; the wall-mount fix
 *  there addressed positioning, not this). Kept as one cheap unlit cube + one
 *  short-falloff, unshadowed point light per house rather than anything more
 *  elaborate — a handful of these per loaded settlement is the same order of
 *  magnitude as the existing campfire flame light.
 *
 *  `mountHeight`/`mountZ` place the lamp against an actual wall — derived by
 *  the caller from the specific hut's own bounding box (`buildSettlementProps`),
 *  since catalog hut variants (`houseCatalog.ts`) don't share the fallback
 *  `createHut()` box's proportions. `mountZ` is pulled in slightly from the
 *  raw bounding-box edge since that edge is often the roof eave, not the
 *  wall face, on the GLB hut models. */
export type HouseLight = {
  readonly object: THREE.Object3D
  setNightIntensity: (t: number) => void
}

/** Night-auto village torch post (plaza / gate) — not player-fueled. */
export type VillageTorch = {
  readonly object: THREE.Object3D
  setLit: (lit: boolean) => void
  update: (dt: number) => void
}

/** `createHouseLight`'s mount point is now a real point on the hut's exterior
 *  surface (`findWallMount` below), not an assumed Z-facing wall — `mountX`/
 *  `mountZ` place the lamp there, offset a little in/out along that surface's
 *  outward normal (approximated as the direction from the vertical axis to
 *  the point, accurate enough for the roughly-boxy catalog hut shapes), and
 *  the lamp geometry is rotated to sit flush against it from any angle.
 *
 *  Wall fixtures are half the reference lantern size; floor-center keeps full
 *  size. Prefer `lanternBody` GLB (plan 085); procedural box body is fallback.
 */
export function createHouseLight(
  mountHeight: number,
  mountX: number,
  mountZ: number,
  style: HouseLampStyle = 'wall',
  lanternBody: THREE.Object3D | null = null,
  explicitYaw?: number,
): HouseLight {
  const group = new THREE.Group()
  const scale = style === 'wall' ? 0.5 : 1

  const outwardLen = Math.hypot(mountX, mountZ) || 1
  const nx = mountX / outwardLen
  const nz = mountZ / outwardLen
  const yaw = explicitYaw ?? Math.atan2(nx, nz)

  const stickOut = style === 'wall' ? 0.04 * scale : 0
  const cx = mountX + nx * stickOut
  const cy = mountHeight
  const cz = mountZ + nz * stickOut

  let lampMat: THREE.MeshBasicMaterial | null = null

  if (lanternBody) {
    const body = lanternBody.clone(true)
    body.position.set(cx, cy, cz)
    body.rotation.y = yaw
    group.add(body)
  } else {
    // Reference lantern (scale=1); wall uses 50%.
    const bodyW = 0.12 * scale
    const bodyH = 0.16 * scale
    const bodyD = 0.08 * scale
    const plateW = 0.14 * scale
    const plateH = 0.04 * scale
    const plateD = 0.14 * scale
    const halfBody = bodyH * 0.5
    const halfPlate = plateH * 0.5

    const baseMat = new THREE.MeshBasicMaterial({ color: 0x6b4226 })
    lampMat = new THREE.MeshBasicMaterial({ color: HOUSE_LAMP_OFF_COLOR })

    const top = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), baseMat)
    top.position.set(cx, cy + halfBody + halfPlate, cz)
    top.rotation.y = yaw
    group.add(top)

    const base = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), baseMat)
    base.position.set(cx, cy - halfBody - halfPlate, cz)
    base.rotation.y = yaw
    group.add(base)

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), lampMat)
    lamp.position.set(cx, cy, cz)
    lamp.rotation.y = yaw
    group.add(lamp)
  }

  const light = new THREE.PointLight(0xffb35c, 0, 4.5 * scale, 2)
  light.position.set(cx - nx * 0.08 * scale, cy, cz - nz * 0.08 * scale)
  group.add(light)

  return {
    object: group,
    setNightIntensity(t) {
      const clamped = Math.max(0, Math.min(1, t))
      if (lampMat) lampMat.color.lerpColors(HOUSE_LAMP_OFF_COLOR, HOUSE_LAMP_ON_COLOR, clamped)
      light.intensity = clamped * (style === 'wall' ? 0.85 : 1)
    },
  }
}

export function createProceduralTorchPost(): THREE.Object3D {
  const group = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
  )
  pole.position.y = 0.7
  pole.castShadow = true
  group.add(pole)
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.05, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, flatShading: true }),
  )
  head.position.y = 1.45
  head.castShadow = true
  group.add(head)
  return group
}

/** Freestanding village torch — GLB post + tip flame, toggled at dusk/dawn. */
export function createVillageTorchLight(
  post: THREE.Object3D,
  flameTip: THREE.Object3D | null,
): VillageTorch {
  const group = new THREE.Group()
  group.add(post)

  let flameUpdate: ((dt: number) => void) | null = null
  let flameObj: THREE.Object3D
  if (flameTip) {
    flameObj = flameTip
    flameObj.position.set(0, 1.45, 0)
    flameObj.visible = false
    group.add(flameObj)
  } else {
    const flame = createCampfireFlame(0.35)
    flameObj = flame.object
    flameObj.position.set(0, 1.4, 0)
    flameUpdate = flame.update
    group.add(flameObj)
  }

  const light = new THREE.PointLight(0xff8a3c, 0, 14, 2)
  light.position.set(0, 1.5, 0)
  group.add(light)

  let lit = false
  return {
    object: group,
    setLit(on) {
      lit = on
      flameObj.visible = on
      light.intensity = on ? 3.2 : 0
    },
    update(dt) {
      if (lit) flameUpdate?.(dt)
    },
  }
}

/** How far outside a hut's footprint to start each search ray — comfortably
 *  past any catalog/fallback hut's extent. */
const WALL_MOUNT_SEARCH_RADIUS = 20
/** Tried lowest-first within each catalog entry's `lightHeightFractions`. */
const DEFAULT_LIGHT_HEIGHT_FRACTIONS = [0.22, 0.3, 0.38] as const
const WALL_MOUNT_ANGLE_STEPS = 16

/** Finds a real point on a loaded hut's exterior surface to mount a wall
 *  lamp against. Replaces an earlier approach that placed the lamp at a
 *  fraction of the model's raw bounding-box Z extent — which assumed a
 *  symmetric, Z-facing box. Catalog entries supply height fractions so
 *  roof-heavy First Age huts don't mount lamps in the roof volume.
 *
 *  Searches outside-in from several heights and angles around the hut and
 *  returns the first real surface hit. `hut` must still be in its
 *  own post-`prepareProp` local frame (before `placeOnGround` moves it into
 *  world space). Returns `null` if no surface is found. */
/** Finds a wall-lamp mount in the hut's **local** frame (child of `hut`).
 *  Rays are cast in world space via `hut.matrixWorld`, then hits are converted
 *  with `worldToLocal` — required after `prepareProp` offsets the root.
 *  Rejects roof/underside normals and anything above the door-band cap. */
function findWallMount(
  hut: THREE.Object3D,
  hutHeight: number,
  heightFractions: readonly number[] = DEFAULT_LIGHT_HEIGHT_FRACTIONS,
  maxHeightFraction = 0.45,
): HouseLampMount | null {
  hut.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  raycaster.far = WALL_MOUNT_SEARCH_RADIUS * 2
  const originLocal = new THREE.Vector3()
  const origin = new THREE.Vector3()
  const dirLocal = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const worldNormal = new THREE.Vector3()
  const localHit = new THREE.Vector3()
  const maxY = Math.min(hutHeight * maxHeightFraction, HOUSE_LAMP_MAX_LOCAL_Y)

  for (const heightFraction of heightFractions) {
    const y = hutHeight * heightFraction
    if (y > maxY) continue

    for (let i = 0; i < WALL_MOUNT_ANGLE_STEPS; i++) {
      const angle = (i / WALL_MOUNT_ANGLE_STEPS) * Math.PI * 2
      const dx = Math.sin(angle)
      const dz = Math.cos(angle)
      originLocal.set(dx * WALL_MOUNT_SEARCH_RADIUS, y, dz * WALL_MOUNT_SEARCH_RADIUS)
      dirLocal.set(-dx, 0, -dz)
      origin.copy(originLocal).applyMatrix4(hut.matrixWorld)
      dir.copy(dirLocal).transformDirection(hut.matrixWorld).normalize()
      raycaster.set(origin, dir)
      const hit = raycaster.intersectObject(hut, true)[0]
      if (!hit?.face) continue
      worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize()
      if (Math.abs(worldNormal.y) > 0.45) continue
      if (worldNormal.dot(dir) > -0.15) continue
      localHit.copy(hit.point)
      hut.worldToLocal(localHit)
      if (localHit.y < 0.45 || localHit.y > maxY) continue
      return { x: localHit.x, y: localHit.y, z: localHit.z }
    }
  }
  return null
}

/** Provisional +Z wall face from bbox — always places a lamp so we can tune
 *  via console (`lampMount` paste into `houseCatalog`). */
function provisionalWallMount(hut: THREE.Object3D): HouseLampMount {
  hut.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(hut)
  const world = new THREE.Vector3(
    (box.min.x + box.max.x) * 0.5,
    Math.min(1.75, HOUSE_LAMP_MAX_LOCAL_Y),
    box.max.z - 0.08,
  )
  hut.worldToLocal(world)
  return {
    x: world.x,
    y: Math.max(0.5, Math.min(HOUSE_LAMP_MAX_LOCAL_Y, world.y)),
    z: world.z,
  }
}

export type ResolvedHouseLampMount = HouseLampMount & { source: string, yaw?: number }

function resolveLampMountFromAnchor(
  hut: THREE.Object3D,
  assetId: string,
): ResolvedHouseLampMount | null {
  const glb = discoverGlbAnchors(hut)
  const metadata = anchorsForAsset(assetId)
  const merged = mergeAnchorDefs(glb.defs, metadata)
  const lampDef = merged.defs.find((d) => d.name === 'lamp_mount')
  if (!lampDef) return null

  const { anchors } = resolveAssetAnchors(hut, [lampDef], {
    glbNames: new Set(glb.defs.map((d) => d.name)),
    metadataNames: new Set(metadata.map((d) => d.name)),
  })
  const resolved = anchors.find((a) => a.def.name === 'lamp_mount')
  if (!resolved) return null

  const pos = new THREE.Vector3()
  resolved.localMatrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3())

  let yaw: number | undefined
  if (resolved.hasOrientation) {
    const forward = new THREE.Vector3(0, 0, 1).applyMatrix4(resolved.localMatrix)
    forward.sub(pos)
    if (forward.lengthSq() > 1e-8) {
      forward.normalize()
      yaw = Math.atan2(forward.x, forward.z)
    }
  }

  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    source: 'anchor',
    ...(yaw !== undefined ? { yaw } : {}),
  }
}

/** Anchor → catalog override → floor center → wall raycast → bbox provisional. */
export function resolveHouseLampMount(
  entry: HouseCatalogEntry,
  hut: THREE.Object3D,
  hutHeight: number,
): ResolvedHouseLampMount {
  const assetId = `house:${entry.id}`
  const fromAnchor = resolveLampMountFromAnchor(hut, assetId)
  if (fromAnchor) return fromAnchor

  if (entry.lampMount) {
    return { ...entry.lampMount, source: 'catalog' }
  }
  if (entry.lampStyle === 'floorCenter') {
    return { x: 0, y: HOUSE_FLOOR_LAMP_Y, z: 0, source: 'floorCenter' }
  }
  const wall = findWallMount(
    hut,
    hutHeight,
    entry.lightHeightFractions,
    entry.lightMaxHeightFraction,
  )
  if (wall) return { ...wall, source: 'raycast' }
  return { ...provisionalWallMount(hut), source: 'bboxProvisional' }
}
