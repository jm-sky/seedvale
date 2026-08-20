/**
 * Quaternius "Universal Base Characters" + "Modular Character Outfits" (plan
 * 171). Base and outfit share one 65-bone rig (verified: identical joint
 * names/order in the source glTF), so `loadPlayerCharacterModel` rebinds the
 * outfit's meshes onto the base's own skeleton instead of keeping a second
 * copy — see `loadPlayerCharacter.ts`.
 */
export type CharacterSex = 'male' | 'female'

export type PlayerCharacterConfig = {
  sex: CharacterSex
  /** Outfit id (`CHARACTER_DEFS[sex].outfits` key), or `undefined` for the bare base body. */
  outfit?: string
}

type CharacterDef = {
  /** `''` means no wired model yet for this sex (see female note below). */
  baseModelUrl: string
  outfits: Partial<Record<string, string>>
}

/**
 * Female base character + outfits exist under `public/models/_main_character/`
 * as raw (unoptimized, ~4K-texture) source files only — not converted/wired
 * (see docs/assets/MODELS.md M50). Selecting `sex: 'female'` throws in
 * `resolveCharacterModelUrls` until that conversion happens; do not add a
 * placeholder URL here that would silently load an unoptimized 40MB+ asset.
 */
const CHARACTER_DEFS: Record<CharacterSex, CharacterDef> = {
  male: {
    baseModelUrl: '/models/_main_character/optimized/base_male.glb',
    outfits: {
      peasant: '/models/_main_character/optimized/outfit_male_peasant.glb',
    },
  },
  female: {
    baseModelUrl: '',
    outfits: {},
  },
}

/** Quaternius Universal Animation Library, trimmed to the clips the player
 *  uses, re-exported on the same 65-bone rig as the base character. */
export const PLAYER_ANIMATIONS_URL = '/models/_main_character/animations/player_locomotion.glb'

export const DEFAULT_PLAYER_CHARACTER: PlayerCharacterConfig = {
  sex: 'male',
  outfit: 'peasant',
}

export function resolveCharacterModelUrls(
  config: PlayerCharacterConfig,
): { baseModelUrl: string, outfitModelUrl: string | null } {
  const def = CHARACTER_DEFS[config.sex]
  if (!def.baseModelUrl) {
    throw new Error(`[player] character sex "${config.sex}" has no wired base model yet`)
  }
  const outfitModelUrl = config.outfit ? def.outfits[config.outfit] ?? null : null
  return { baseModelUrl: def.baseModelUrl, outfitModelUrl }
}
