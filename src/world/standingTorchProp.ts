import { createProceduralTorchPost, createVillageTorchLight, type VillageTorch } from '../settlement/houseLighting'
import { VILLAGE_TORCH_HEIGHT, VILLAGE_TORCH_URL } from '../settlement/propSpecs'
import { loadPropOrFallback } from '../settlement/propUtils'
import type * as THREE from 'three'

let standingTorchPostTemplate: THREE.Object3D | null = null
let standingTorchTemplatePromise: Promise<void> | null = null

/** Starts loading the shared village-torch post GLB (falls back to the
 *  procedural post on failure) — safe to call repeatedly, one in-flight
 *  promise, same pattern as `settlement/campfireProps.ts`'s
 *  `preloadCampfireTemplates`. `createStandingTorchVisual` below clones
 *  synchronously from whatever is cached at call time — procedural if this
 *  hasn't resolved yet. */
export function preloadStandingTorchTemplate(): Promise<void> {
  standingTorchTemplatePromise ??= (async () => {
    standingTorchPostTemplate = await loadPropOrFallback(VILLAGE_TORCH_URL, VILLAGE_TORCH_HEIGHT, createProceduralTorchPost)
  })()
  return standingTorchTemplatePromise
}

/** Freestanding player-built torch visual/light (plan items-player-009) —
 *  clones the shared village-torch post template (or the procedural
 *  fallback) and wraps it in the existing village-torch runtime
 *  (`settlement/houseLighting.ts`'s `createVillageTorchLight`), the same
 *  flame/sparks/`PointLight` every settlement plaza/gate torch already uses.
 *  No separate torch lighting system. */
export function createStandingTorchVisual(): VillageTorch {
  const post = (standingTorchPostTemplate ?? createProceduralTorchPost()).clone(true)
  return createVillageTorchLight(post)
}
