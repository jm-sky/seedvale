import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import {
  depleteGrassPatch,
  type GrassForageOverrides,
  type GrassPatchCandidate,
  grassPatchCandidatesNear,
  isGrassPatchAvailable,
  pruneGrassForageOverrides,
} from './grassForage'

/** How far (world units) around the observer patch visuals are kept spawned
 *  — independent of, and smaller than, gameplay search radii need to be;
 *  only affects what's rendered (plan fauna-010 "Performance": no dense
 *  visual layer). */
const PATCH_VISUAL_RADIUS = 36
/** How often the visible set is resynced — throttled like every other
 *  low-frequency world system, not a per-frame scan. */
const PATCH_VISUAL_REFRESH_SEC = 2

export type GrassForageService = {
  /** Existing, currently-available patches within `radius` of `(x, z)` —
   *  `AnimalAgent.findGrassPatchTarget` further filters these by its own
   *  live `isWalkable`/village-avoidance/roam-radius checks. */
  queryNear: (x: number, z: number, radius: number, nowDays: number) => readonly GrassPatchCandidate[]
  isAvailable: (id: string, nowDays: number) => boolean
  /** Atomically depletes `id`; `false` (no relief should be granted) if it
   *  was already depleted by a faster competitor. */
  consume: (id: string, nowDays: number) => boolean
  /** Sparse depletion overrides — `SaveData.grassForagePatches`. */
  serialize: () => GrassForageOverrides
  /** Resyncs visible patch meshes near `(observerX, observerZ)`, throttled
   *  internally — call once per frame from `Fauna.update()`. */
  tickVisuals: (dt: number, observerX: number, observerZ: number, nowDays: number) => void
  dispose: () => void
}

function createPatchMesh(): THREE.Object3D {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a9c4a, flatShading: true })
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22 + (i % 2) * 0.08, 4), mat)
    blade.position.set((i - 2) * 0.08, 0.11, ((i * 37) % 5) * 0.03 - 0.06)
    blade.rotation.z = (i - 2) * 0.12
    group.add(blade)
  }
  return group
}

/**
 * Runtime wrapper over `grassForage.ts`'s pure domain logic (plan fauna-010
 * §3/§4) — mirrors `world/createBeehives.ts`'s domain/runtime split. Owns
 * patch visual meshes (created lazily near the observer, removed on
 * depletion/out-of-range) and the shared `GrassForageOverrides` record,
 * mutated in place so a `WorldBundle` rebuild can simply pass the same
 * reference through again (same contract as `ResourceDepletionState`).
 *
 * `AnimalAgent` never touches this module directly — it only sees the
 * `GrassForageService` interface, injected per-tick into `update()`.
 */
export function createGrassForagePatches(
  scene: THREE.Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  seed: number,
  /** Terrain-only openness check (e.g. `sampleForestFactor(x, z) < 0.5`) —
   *  see `grassPatchCandidatesNear`'s `isSuitable` doc. */
  isOpenGround: (x: number, z: number) => boolean,
  overrides: GrassForageOverrides = {},
): GrassForageService {
  const meshes = new Map<string, THREE.Object3D>()
  let visualRefreshTimer = 0

  const isSuitable = (x: number, z: number): boolean =>
    sampleHeight(x, z) > waterLevel + 0.3 && isOpenGround(x, z)

  function removeMesh(id: string): void {
    const mesh = meshes.get(id)
    if (!mesh) return
    mesh.removeFromParent()
    disposeObject3D(mesh)
    meshes.delete(id)
  }

  function ensureMesh(candidate: GrassPatchCandidate): void {
    if (meshes.has(candidate.id)) return
    const mesh = createPatchMesh()
    mesh.position.set(candidate.x, sampleHeight(candidate.x, candidate.z), candidate.z)
    scene.add(mesh)
    meshes.set(candidate.id, mesh)
  }

  return {
    queryNear(x, z, radius, nowDays) {
      return grassPatchCandidatesNear(x, z, radius, seed, isSuitable)
        .filter((c) => isGrassPatchAvailable(overrides, c.id, nowDays))
    },
    isAvailable(id, nowDays) {
      return isGrassPatchAvailable(overrides, id, nowDays)
    },
    consume(id, nowDays) {
      const consumed = depleteGrassPatch(overrides, id, nowDays)
      if (consumed) removeMesh(id)
      return consumed
    },
    serialize() {
      return { ...overrides }
    },
    tickVisuals(dt, observerX, observerZ, nowDays) {
      visualRefreshTimer -= dt
      if (visualRefreshTimer > 0) return
      visualRefreshTimer = PATCH_VISUAL_REFRESH_SEC
      pruneGrassForageOverrides(overrides, nowDays)
      const visible = grassPatchCandidatesNear(observerX, observerZ, PATCH_VISUAL_RADIUS, seed, isSuitable)
        .filter((c) => isGrassPatchAvailable(overrides, c.id, nowDays))
      const visibleIds = new Set(visible.map((c) => c.id))
      for (const id of meshes.keys()) if (!visibleIds.has(id)) removeMesh(id)
      for (const c of visible) ensureMesh(c)
    },
    dispose() {
      for (const id of Array.from(meshes.keys())) removeMesh(id)
    },
  }
}
