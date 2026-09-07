import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Scene,
} from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { WeatherState } from './weather'
import { loadTexture } from '../assets/loadTexture'
import { isSystemEnabled } from '../debug/debugMode'

/**
 * Local ground-fog presentation system (plan world-terrain-014 §7-10).
 *
 * Supplements, but never replaces, `weatherVisuals.ts`'s global `THREE.Fog`.
 * Fog patches are player-local presentation state: they are not persisted and
 * do not belong to `WorldBundle`.
 *
 * A small fixed pool of upright fog cards is created once and recycled.
 * Patches:
 * - stay within a ring around the player,
 * - face the player,
 * - drift slowly,
 * - follow terrain height,
 * - vary visibility and opacity with fog intensity.
 */
const FOG_TEXTURE_URLS = ['/images/fog/fog-blend-01.png']

const FOG_COUNT = 5

const MIN_DISTANCE_FROM_PLAYER = 30
const AREA_HALF_EXTENT = 45

const HEIGHT_ABOVE_GROUND_MIN = 0.3
const HEIGHT_ABOVE_GROUND_MAX = 1.6

const SCALE_MIN = 18
const SCALE_MAX = 32

const DRIFT_SPEED_MAX = 0.5

const BASE_OPACITY_MIN = 0.1
const BASE_OPACITY_MAX = 0.3

const VISIBLE_FRACTION_MIN = 0.4
const VISIBLE_FRACTION_MAX = 1

type FogPatch = {
  mesh: Mesh
  localX: number
  localZ: number
  driftX: number
  driftZ: number
  spawned: boolean
  yOffset: number

  /**
   * Fixed at creation as `i / FOG_COUNT`.
   * Allows fog density to change without adding/removing meshes.
   */
  visibilityThreshold: number
}

function randomFogPosition(): { x: number, z: number } {
  const angle = Math.random() * Math.PI * 2
  const radius = MIN_DISTANCE_FROM_PLAYER + Math.random() * (AREA_HALF_EXTENT - MIN_DISTANCE_FROM_PLAYER)

  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  }
}

function randomDrift(): number {
  return (Math.random() * 2 - 1) * DRIFT_SPEED_MAX
}

function facePlayer(patch: FogPatch): void {
  patch.mesh.rotation.y = Math.atan2(
    -patch.localX,
    -patch.localZ,
  )
}

function updatePatchHeight(
  patch: FogPatch,
  playerX: number,
  playerZ: number,
  sampleHeight: HeightSampler,
): void {
  const groundY = sampleHeight(
    playerX + patch.localX,
    playerZ + patch.localZ,
  )

  patch.mesh.position.y = groundY + patch.yOffset
}

function updatePatchPosition(
  patch: FogPatch,
  playerX: number,
  playerZ: number,
  sampleHeight: HeightSampler,
): void {
  patch.mesh.position.x = patch.localX
  patch.mesh.position.z = patch.localZ

  updatePatchHeight(
    patch,
    playerX,
    playerZ,
    sampleHeight,
  )

  facePlayer(patch)
}

function shouldRecyclePatch(patch: FogPatch): boolean {
  const distanceFromPlayer = Math.hypot(
    patch.localX,
    patch.localZ,
  )

  return (
    Math.abs(patch.localX) > AREA_HALF_EXTENT
    || Math.abs(patch.localZ) > AREA_HALF_EXTENT
    || distanceFromPlayer < MIN_DISTANCE_FROM_PLAYER
  )
}

function recyclePatch(
  patch: FogPatch,
  materials: MeshBasicMaterial[],
  playerX: number,
  playerZ: number,
  sampleHeight: HeightSampler,
): void {
  const position = randomFogPosition()

  patch.localX = position.x
  patch.localZ = position.z

  const material = materials[
    Math.floor(Math.random() * materials.length)
  ]

  patch.mesh.material = material

  const image = material.map!.image as {
    width: number
    height: number
  }

  const size = SCALE_MIN + Math.random() * (SCALE_MAX - SCALE_MIN)

  patch.mesh.scale.set(
    size,
    size * (image.height / image.width),
    1,
  )

  patch.driftX = randomDrift()
  patch.driftZ = randomDrift()

  updatePatchPosition(
    patch,
    playerX,
    playerZ,
    sampleHeight,
  )

  patch.spawned = true
}

export type GroundFogSystem = {
  addTo: (scene: Scene) => void

  update: (
    dt: number,
    weather: WeatherState,
    playerX: number,
    playerZ: number,
    sampleHeight: HeightSampler,
  ) => void

  dispose: () => void
}

export function createGroundFog(): GroundFogSystem {
  const group = new Group()
  const patches: FogPatch[] = []

  let materials: MeshBasicMaterial[] = []

  void Promise.allSettled(
    FOG_TEXTURE_URLS.map(loadTexture),
  ).then((results) => {
    for (const result of results) {
      if (result.status !== 'fulfilled') continue

      materials.push(new MeshBasicMaterial({
        map: result.value,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: DoubleSide,

        // Dedicated visual layer: do not apply the global scene fog again.
        fog: false,
        opacity: 0,
      }))
    }

    if (materials.length === 0) {
      return
    }

    // Move the plane origin to its bottom edge so position.y represents
    // the height of the bottom of the fog card above the terrain.
    const geometry = new PlaneGeometry(1, 1)
    geometry.translate(0, 0.5, 0)

    for (let i = 0; i < FOG_COUNT; i++) {
      const mesh = new Mesh(geometry, materials[0])

      mesh.visible = false

      const patch: FogPatch = {
        mesh,

        localX: 0,
        localZ: 0,

        driftX: 0,
        driftZ: 0,

        spawned: false,

        yOffset:
          HEIGHT_ABOVE_GROUND_MIN
          + Math.random()
            * (HEIGHT_ABOVE_GROUND_MAX - HEIGHT_ABOVE_GROUND_MIN),

        visibilityThreshold: i / FOG_COUNT,
      }

      patches.push(patch)
      group.add(mesh)
    }
  }).catch(() => {
    // Ground fog stays absent if its textures fail to load.
  })

  function update(
    dt: number,
    weather: WeatherState,
    playerX: number,
    playerZ: number,
    sampleHeight: HeightSampler,
  ): void {
    const isFog = weather.type === 'fog'

    group.visible = isSystemEnabled('weather') && isFog

    group.position.set(
      playerX,
      0,
      playerZ,
    )

    if (patches.length === 0) {
      return
    }

    const visibleFraction = isFog
      ? VISIBLE_FRACTION_MIN
        + (VISIBLE_FRACTION_MAX - VISIBLE_FRACTION_MIN)
          * weather.intensity
      : 0

    const opacity = isFog
      ? BASE_OPACITY_MIN
        + (BASE_OPACITY_MAX - BASE_OPACITY_MIN)
          * weather.intensity
      : 0

    for (const material of materials) {
      material.opacity = opacity
    }

    for (const patch of patches) {
      if (!patch.spawned) {
        recyclePatch(
          patch,
          materials,
          playerX,
          playerZ,
          sampleHeight,
        )
      } else {
        patch.localX += patch.driftX * dt
        patch.localZ += patch.driftZ * dt

        if (shouldRecyclePatch(patch)) {
          recyclePatch(
            patch,
            materials,
            playerX,
            playerZ,
            sampleHeight,
          )
        } else {
          updatePatchPosition(
            patch,
            playerX,
            playerZ,
            sampleHeight,
          )
        }
      }

      patch.mesh.visible =
        patch.visibilityThreshold < visibleFraction
    }
  }

  return {
    addTo: (scene) => {
      scene.add(group)
    },

    update,

    dispose: () => {
      group.removeFromParent()

      for (const material of materials) {
        material.dispose()
      }

      materials = []
    },
  }
}
