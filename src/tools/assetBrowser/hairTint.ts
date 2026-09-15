import { NPC_UBC_HAIR_1_URL, NPC_UBC_HAIR_2_URL } from '../../ai/npcAppearance'

/** UBC hair albedo sidecar in the asset browser (npc-040 runtime palettes). */
export type HairTintId = 'hair_1' | 'hair_2' | 'baked'

export const DEFAULT_HAIR_TINT: HairTintId = 'hair_1'

/** Sidecar URL, or `null` to restore the map baked into the GLB. */
export function hairTintUrlFor(id: HairTintId): string | null {
  if (id === 'baked') return null
  if (id === 'hair_2') return NPC_UBC_HAIR_2_URL
  return NPC_UBC_HAIR_1_URL
}

export function parseHairTint(raw: string | undefined): HairTintId | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'hair_1' || v === 'hair1' || v === '1') return 'hair_1'
  if (v === 'hair_2' || v === 'hair2' || v === '2') return 'hair_2'
  if (v === 'baked' || v === 'default' || v === 'glb') return 'baked'
  return undefined
}
