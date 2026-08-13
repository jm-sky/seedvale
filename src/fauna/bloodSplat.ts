import { type Object3D } from 'three'
import { disposeObject3D, loadGltf, preparePropFitMax } from '../assets/loadGltf'

const BLOOD_SPLAT_URL = '/models/fx/blood_splat.glb'
/** Base longest-axis size (meters) before per-animal scale. */
const BLOOD_SPLAT_BASE = 1
const BLOOD_MIN = 0.55
const BLOOD_MAX = 1.4

let template: Object3D | null = null
let templatePromise: Promise<Object3D | null> | null = null

async function ensureTemplate(): Promise<Object3D | null> {
  if (template) return template
  if (!templatePromise) {
    templatePromise = (async () => {
      try {
        const model = await loadGltf(BLOOD_SPLAT_URL)
        // Authored as an XZ ground decal (Y ≈ 0) — do not pitch it upright.
        preparePropFitMax(model, BLOOD_SPLAT_BASE)
        template = model
        return model
      } catch (err) {
        console.warn('[fauna] failed to load blood_splat.glb', err)
        return null
      }
    })()
  }
  return templatePromise
}

/** Clone a ground-aligned splat sized from the animal's model height. */
export async function createBloodSplat(modelHeight: number): Promise<Object3D | null> {
  const tpl = await ensureTemplate()
  if (!tpl) return null
  const splat = tpl.clone()
  const size = Math.min(BLOOD_MAX, Math.max(BLOOD_MIN, 0.45 + modelHeight * 0.55))
  splat.scale.multiplyScalar(size / BLOOD_SPLAT_BASE)
  return splat
}

export function disposeBloodSplat(splat: Object3D | null): void {
  if (!splat) return
  splat.removeFromParent()
  disposeObject3D(splat)
}
