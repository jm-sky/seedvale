import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { WeatherState } from './weather'
import { loadTexture } from '../assets/loadTexture'
import { isSystemEnabled } from '../debug/debugMode'

/** Local, cheap ground-fog garnish (plan world-terrain-014 §7-10) —
 *  supplements but never replaces `weatherVisuals.ts`'s global `THREE.Fog`.
 *  Player/camera-local presentation state, not simulation: no persistence,
 *  no `WorldBundle` ownership, same lifecycle shape (`addTo`/`update`/
 *  `dispose`) as `clouds.ts`. A small fixed pool of flattened, mostly
 *  horizontal cards (not upright sprites, which read as a vertical wall) is
 *  created once and recycled — `weather.type === 'fog'` only ever changes
 *  visibility/opacity, never object lifetime. */

const FOG_TEXTURE_URLS = ['/images/fog/fog-01.png']
const FOG_COUNT = 5
/** Local area half-extent (world units) a patch drifts within before being
 *  recycled to a new random offset — a square around the player, mirroring
 *  `clouds.ts`'s `AREA_HALF_WIDTH` wrap idea but centered rather than a wind
 *  lane, since ground fog has no directional travel requirement. */
const AREA_HALF_EXTENT = 45
const HEIGHT_ABOVE_GROUND_MIN = 0.6
const HEIGHT_ABOVE_GROUND_MAX = 2.4
const SCALE_MIN = 18
const SCALE_MAX = 32
const DRIFT_SPEED_MAX = 0.5
const BASE_OPACITY_MIN = 0.15
const BASE_OPACITY_MAX = 0.55
const VISIBLE_FRACTION_MIN = 0.4
const VISIBLE_FRACTION_MAX = 1

type FogPatch = {
  mesh: Mesh
  localX: number
  localZ: number
  driftX: number
  driftZ: number
  spawned: boolean
  /** Fixed at creation, `i / FOG_COUNT` — same visibility-threshold trick as
   *  `clouds.ts`'s `CloudSprite`, so density changes need no add/remove. */
  visibilityThreshold: number
}

function recyclePatch(patch: FogPatch, materials: MeshBasicMaterial[], playerX: number, playerZ: number, sampleHeight: HeightSampler): void {
  patch.localX = (Math.random() * 2 - 1) * AREA_HALF_EXTENT
  patch.localZ = (Math.random() * 2 - 1) * AREA_HALF_EXTENT
  const groundY = sampleHeight(playerX + patch.localX, playerZ + patch.localZ)
  const material = materials[Math.floor(Math.random() * materials.length)]
  patch.mesh.material = material
  const image = material.map!.image as { width: number, height: number }
  const size = SCALE_MIN + Math.random() * (SCALE_MAX - SCALE_MIN)
  patch.mesh.scale.set(size, size * (image.height / image.width), 1)
  patch.mesh.position.set(patch.localX, groundY + HEIGHT_ABOVE_GROUND_MIN + Math.random() * (HEIGHT_ABOVE_GROUND_MAX - HEIGHT_ABOVE_GROUND_MIN), patch.localZ)
  patch.mesh.rotation.z = Math.random() * Math.PI * 2
  patch.driftX = (Math.random() * 2 - 1) * DRIFT_SPEED_MAX
  patch.driftZ = (Math.random() * 2 - 1) * DRIFT_SPEED_MAX
  patch.spawned = true
}

export type GroundFogSystem = {
  addTo: (scene: Scene) => void
  update: (dt: number, weather: WeatherState, playerX: number, playerZ: number, sampleHeight: HeightSampler) => void
  dispose: () => void
}

export function createGroundFog(): GroundFogSystem {
  const group = new Group()
  const patches: FogPatch[] = []
  let materials: MeshBasicMaterial[] = []

  void Promise.allSettled(FOG_TEXTURE_URLS.map(loadTexture)).then((results) => {
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      materials.push(new MeshBasicMaterial({
        map: result.value,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: DoubleSide,
        // Unlit, camera/player-local garnish like `clouds.ts`'s sprites —
        // `fog: false` keeps it a dedicated layer rather than being washed
        // out/tinted by the same scene fog it's meant to visually supplement.
        fog: false,
        opacity: 0,
      }))
    }
    if (materials.length === 0) return // ground fog stays absent

    const geometry = new PlaneGeometry(1, 1)
    for (let i = 0; i < FOG_COUNT; i++) {
      const mesh = new Mesh(geometry, materials[0])
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      const patch: FogPatch = {
        mesh,
        localX: 0,
        localZ: 0,
        driftX: 0,
        driftZ: 0,
        spawned: false,
        visibilityThreshold: i / FOG_COUNT,
      }
      patches.push(patch)
      group.add(mesh)
    }
  }).catch(() => { /* ground fog stays absent if the texture fails to load */ })

  function update(dt: number, weather: WeatherState, playerX: number, playerZ: number, sampleHeight: HeightSampler): void {
    const isFog = weather.type === 'fog'
    group.visible = isSystemEnabled('weather') && isFog
    group.position.set(playerX, 0, playerZ)
    if (patches.length === 0) return

    const visibleFraction = isFog ? VISIBLE_FRACTION_MIN + (VISIBLE_FRACTION_MAX - VISIBLE_FRACTION_MIN) * weather.intensity : 0
    const opacity = isFog ? BASE_OPACITY_MIN + (BASE_OPACITY_MAX - BASE_OPACITY_MIN) * weather.intensity : 0
    for (const material of materials) material.opacity = opacity

    for (const patch of patches) {
      // Terrain height is sampled only on spawn/recycle (plan §8/#3), never
      // every frame — cheap even though `sampleHeight` walks live chunk data.
      if (!patch.spawned) {
        recyclePatch(patch, materials, playerX, playerZ, sampleHeight)
      } else {
        patch.localX += patch.driftX * dt
        patch.localZ += patch.driftZ * dt
        if (Math.abs(patch.localX) > AREA_HALF_EXTENT || Math.abs(patch.localZ) > AREA_HALF_EXTENT) {
          recyclePatch(patch, materials, playerX, playerZ, sampleHeight)
        } else {
          patch.mesh.position.x = patch.localX
          patch.mesh.position.z = patch.localZ
        }
      }
      patch.mesh.visible = patch.visibilityThreshold < visibleFraction
    }
  }

  return {
    addTo: (scene) => scene.add(group),
    update,
    dispose: () => {
      group.removeFromParent()
      for (const material of materials) material.dispose()
      materials = []
    },
  }
}
