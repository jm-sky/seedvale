import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { ItemKind } from './items'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import type { Group, Object3D } from 'three'

/** Ground pickup scale: longest bbox axis in world meters.
 *  Pitchfork/sickle are authored flat/long — do not use height-only `prepareProp`
 *  (that blew pitchforks up to ~30 m). */
export const ITEM_GLB_SPECS: Partial<Record<ItemKind, { url: string, maxSize: number }>> = {
  pitchfork: { url: '/models/items/pitchfork.glb', maxSize: 1.15 },
  sickle: { url: '/models/items/sickle.glb', maxSize: 0.45 },
}

const prepared = new Map<ItemKind, Group>()

/** Warm GLB templates so `createItemMesh` can clone synchronously. Safe to call
 *  more than once — no-ops for kinds already prepared. */
export async function preloadItemGlbModels(
  kinds: readonly ItemKind[] = Object.keys(ITEM_GLB_SPECS) as ItemKind[],
): Promise<void> {
  await Promise.all(kinds.map(async (kind) => {
    if (prepared.has(kind)) return
    const spec = ITEM_GLB_SPECS[kind]
    if (!spec) return
    try {
      const model = await loadGltf(spec.url)
      // Orient for ground pickup first, then fit by longest axis.
      if (kind === 'pitchfork') model.rotation.z = Math.PI / 2.2
      if (kind === 'sickle') model.rotation.x = Math.PI / 2.5
      preparePropFitMax(model, spec.maxSize)
      prepared.set(kind, model)
    } catch (err) {
      console.warn(`[items] failed to load ${spec.url}, using procedural mesh`, err)
    }
  }))
}

/** Sync clone of a preloaded GLB, or `null` if not warmed / load failed. */
export function cloneItemGlb(kind: ItemKind): Object3D | null {
  const template = prepared.get(kind)
  if (!template) return null
  return cloneSkinned(template)
}
