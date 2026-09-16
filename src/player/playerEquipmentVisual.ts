import type { ItemKind } from '../items/items'

const UBC_DIR = '/models/characters/ubc'
const UBC_ACCESSORIES = `${UBC_DIR}/accessories`

export const PLAYER_UBC_LEATHER_PAULDRON_URL = `${UBC_ACCESSORIES}/male_leather_pauldron.glb`
export const PLAYER_UBC_RANGER_PAULDRON_URL = `${UBC_ACCESSORIES}/male_ranger_pauldron.glb`
export const PLAYER_UBC_KNIGHT_PAULDRON_SPIKE_URL = `${UBC_ACCESSORIES}/male_knight_pauldron_spike.glb`
export const PLAYER_UBC_KNIGHT_PAULDRON_ROUND_URL = `${UBC_ACCESSORIES}/male_knight_pauldron_round.glb`

const LEATHER_PAULDRON_BROWN_TINT_URL = `${UBC_DIR}/male_noble_brown.webp`

export type PlayerEquipmentVisualTint = 'brown'

export type PlayerEquipmentVisualAlignment = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
}

export type PlayerEquipmentVisual = {
  modelUrl: string
  tint?: PlayerEquipmentVisualTint
  alignment?: PlayerEquipmentVisualAlignment
}

const EQUIPMENT_VISUALS: Partial<Record<ItemKind, PlayerEquipmentVisual>> = {
  leather_pauldron: {
    modelUrl: PLAYER_UBC_LEATHER_PAULDRON_URL,
    tint: 'brown',
  },
  ranger_pauldron: {
    modelUrl: PLAYER_UBC_RANGER_PAULDRON_URL,
  },
  knight_pauldron_spike: {
    modelUrl: PLAYER_UBC_KNIGHT_PAULDRON_SPIKE_URL,
  },
  knight_pauldron_round: {
    modelUrl: PLAYER_UBC_KNIGHT_PAULDRON_ROUND_URL,
  },
}

/**
 * Presentation-only mapping from an equipped item kind to a skinned UBC
 * accessory. Gameplay stats and prices stay in the item catalog.
 *
 * @domain items-player
 */
export function resolvePlayerEquipmentVisual(kind: ItemKind): PlayerEquipmentVisual | null {
  return EQUIPMENT_VISUALS[kind] ?? null
}

/** Accessory tint sidecar. Independent of `?playerTint=` on the body outfit. */
export function resolvePlayerEquipmentVisualTintUrl(
  visual: PlayerEquipmentVisual,
): string | null {
  return visual.tint === 'brown' ? LEATHER_PAULDRON_BROWN_TINT_URL : null
}
