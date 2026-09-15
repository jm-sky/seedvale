import { NPC_HAIR_COLOR, type NpcHairColorId } from '../../ai/npcAppearance'

/** UBC hair color multiply in the asset browser (same palette as NPC runtime). */
export type HairColorId = NpcHairColorId

export const DEFAULT_HAIR_COLOR: HairColorId = 'brown'

export function hairColorHexFor(id: HairColorId): number {
  return NPC_HAIR_COLOR[id]
}

export function parseHairColor(raw: string | undefined): HairColorId | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'black') return 'black'
  if (v === 'brown') return 'brown'
  if (v === 'redhead' || v === 'red') return 'redhead'
  if (v === 'blond') return 'blond'
  if (v === 'grey' || v === 'gray') return 'grey'
  return undefined
}
