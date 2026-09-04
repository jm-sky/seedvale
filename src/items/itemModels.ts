import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { ItemKind } from './items'
import { loadGltf, preparePropFitMax } from '../assets/loadGltf'
import type { Group, Object3D } from 'three'

type GroundGlbSpec = {
  url: string
  /** Longest bbox axis after fit (meters). */
  maxSize: number
  /** Optional local rotation so the tool rests on the ground. */
  groundRotation?: readonly [number, number, number]
}

/** Ground pickup GLBs — scale by longest axis (not height alone). */
export const ITEM_GLB_SPECS: Partial<Record<ItemKind, GroundGlbSpec>> = {
  axe: { url: '/models/items/axe.glb', maxSize: 0.85 },
  knife: { url: '/models/items/knife.glb', maxSize: 0.35 },
  branch: {
    url: '/models/items/branch.glb',
    maxSize: 0.55,
    groundRotation: [0, 0, Math.PI / 2.4],
  },
  pitchfork: {
    url: '/models/items/pitchfork.glb',
    maxSize: 1.15,
    groundRotation: [0, 0, Math.PI / 2.2],
  },
  shovel: { url: '/models/items/shovel.glb', maxSize: 1.1 },
  sickle: {
    url: '/models/items/sickle.glb',
    maxSize: 0.45,
    groundRotation: [Math.PI / 2.5, 0, 0],
  },
  wooden_torch: {
    url: '/models/items/wooden_torch.glb',
    maxSize: 0.75,
    groundRotation: [0, 0, Math.PI / 2.3],
  },
  pickaxe: {
    url: '/models/items/pickaxe.glb',
    maxSize: 0.9,
    groundRotation: [0, 0, Math.PI / 2.2],
  },
  long_sword: {
    url: '/models/items/long_sword.glb',
    maxSize: 1.15,
    groundRotation: [0, 0, Math.PI / 2.4],
  },
  spear: {
    url: '/models/items/spear.glb',
    maxSize: 1.35,
    groundRotation: [0, 0, Math.PI / 2.2],
  },
  short_sword: {
    url: '/models/items/short_sword.glb',
    maxSize: 0.85,
    groundRotation: [0, 0, Math.PI / 2.4],
  },
  damascus_knife: { url: '/models/items/damascus_knife.glb', maxSize: 0.35 },
  damascus_short_sword: {
    url: '/models/items/damascus_short_sword.glb',
    maxSize: 0.9,
    groundRotation: [0, 0, Math.PI / 2.4],
  },
  damascus_long_sword: {
    url: '/models/items/damascus_long_sword.glb',
    maxSize: 1.2,
    groundRotation: [0, 0, Math.PI / 2.4],
  },
  obsidian_sword: {
    url: '/models/items/obsidian_sword.glb',
    maxSize: 1.25,
    groundRotation: [0, 0, Math.PI / 2.4],
  },
  battle_axe: { url: '/models/items/battle_axe.glb', maxSize: 0.95 },
  masterwork_sword: {
    url: '/models/items/masterwork_sword.glb',
    maxSize: 1.15,
    groundRotation: [0, 0, Math.PI / 2.4],
  },
  mushroom: { url: '/models/nature/mushroom_a.glb', maxSize: 0.3 },
  // Quaternius Bow_Wooden/Bow_Wooden2/Bow_Golden (Medieval Weapons Pack) — plan 162.
  // Authored Y-long like long_sword/spear/pitchfork; same Z-axis ground rotation.
  short_bow: {
    url: '/models/items/short_bow.glb',
    maxSize: 1,
    groundRotation: [0, 0, Math.PI / 2.2],
  },
  hunting_bow: {
    url: '/models/items/hunting_bow.glb',
    maxSize: 1.15,
    groundRotation: [0, 0, Math.PI / 2.2],
  },
  long_bow: {
    url: '/models/items/long_bow.glb',
    maxSize: 1.35,
    groundRotation: [0, 0, Math.PI / 2.2],
  },
  // Quaternius Arrow (Medieval Weapons Pack) — plan 162. Already authored lying
  // along Z (no ground rotation needed); shared by all three arrow ItemKinds.
  arrow: { url: '/models/items/arrow.glb', maxSize: 0.6 },
  broadhead_arrow: { url: '/models/items/arrow.glb', maxSize: 0.6 },
  war_arrow: { url: '/models/items/arrow.glb', maxSize: 0.6 },
  // Quaternius Fantasy/Farm/Nature packs — 2026-09-04 asset drop, see
  // docs/tmp/2026-09-04--new-3d-assets.md.
  backpack: { url: '/models/items/backpack.glb', maxSize: 0.5 },
  pan: { url: '/models/items/pan.glb', maxSize: 0.35 },
  rope: { url: '/models/items/rope.glb', maxSize: 0.4 },
  chest: { url: '/models/items/chest.glb', maxSize: 0.85 },
  tomato: { url: '/models/items/tomato.glb', maxSize: 0.1 },
  // coin: { url: '/models/items/coin.glb', maxSize: 0.2 },
  roasted_meat: { url: '/models/items/steak.glb', maxSize: 0.25 },
  beef: { url: '/models/items/steak.glb', maxSize: 0.25 },
  fish: { url: '/models/items/fish.glb', maxSize: 0.35 },
}

const prepared = new Map<ItemKind, Group>()

/** Warm GLB templates so `createItemMesh` can clone synchronously. */
export async function preloadItemGlbModels(
  kinds: readonly ItemKind[] = Object.keys(ITEM_GLB_SPECS) as ItemKind[],
): Promise<void> {
  await Promise.all(kinds.map(async (kind) => {
    if (prepared.has(kind)) return
    const spec = ITEM_GLB_SPECS[kind]
    if (!spec) return
    try {
      const model = await loadGltf(spec.url)
      if (spec.groundRotation) {
        model.rotation.set(
          spec.groundRotation[0],
          spec.groundRotation[1],
          spec.groundRotation[2],
        )
      }
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
