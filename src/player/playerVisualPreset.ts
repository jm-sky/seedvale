import { urlParamValue } from '../debug/debugMode'
import { PLAYER_MODEL_URL } from './PlayerController'

const UBC_DIR = '/models/characters/ubc'

/** UBC player meshes (items-player-033 / 034 / 036). */
export const PLAYER_UBC_PEASANT_URL = `${UBC_DIR}/male_peasant.glb`
export const PLAYER_UBC_RANGER_URL = `${UBC_DIR}/male_ranger.glb`
export const PLAYER_UBC_KNIGHT_URL = `${UBC_DIR}/male_knight.glb`
export const PLAYER_UBC_KNIGHT_CLOTH_URL = `${UBC_DIR}/male_knight_cloth.glb`
export const PLAYER_UBC_NOBLE_URL = `${UBC_DIR}/male_noble.glb`
export const PLAYER_UBC_WIZARD_URL = `${UBC_DIR}/male_wizard.glb`
/** In-place UAL1 subset (locomotion/combat + coverage clips from items-player-035). */
export const PLAYER_UBC_ANIMATION_URL = `${UBC_DIR}/ual1_player.glb`

/**
 * Extra clip GLB for UBC outfit meshes (they ship with none). `ual1_player.glb`
 * itself and non-UBC URLs return `null`. Query strings on the model URL are ignored.
 */
export function companionAnimationUrl(modelUrl: string): string | null {
  const path = modelUrl.split('?')[0] ?? modelUrl
  if (!path.endsWith('.glb')) return null
  if (!path.startsWith(`${UBC_DIR}/`)) return null
  if (path === PLAYER_UBC_ANIMATION_URL) return null
  return PLAYER_UBC_ANIMATION_URL
}

export const PLAYER_UBC_PEASANT_BROWN_URL = `${UBC_DIR}/male_peasant_brown.webp`
export const PLAYER_UBC_RANGER_BROWN_URL = `${UBC_DIR}/male_ranger_brown.webp`
export const PLAYER_UBC_KNIGHT_BROWN_URL = `${UBC_DIR}/male_knight_brown.webp`
export const PLAYER_UBC_KNIGHT_CLOTH_BROWN_URL = `${UBC_DIR}/male_knight_cloth_brown.webp`
export const PLAYER_UBC_NOBLE_BROWN_URL = `${UBC_DIR}/male_noble_brown.webp`
export const PLAYER_UBC_WIZARD_BROWN_URL = `${UBC_DIR}/male_wizard_brown.webp`

export type PlayerVisualId =
  | 'adventurer'
  | 'peasant'
  | 'ranger'
  | 'knight'
  | 'knight_cloth'
  | 'noble'
  | 'wizard'
export type PlayerOutfitTint = 'default' | 'brown'
export type PlayerEquipmentOutfitId = 'peasant' | 'ranger' | 'knight'

export type PlayerVisualPreset = {
  animationUrl: string | null
  id: PlayerVisualId
  modelUrl: string
}

/** Resolved player look: URL override, else body-slot equipment (plan 034 / 036). */
export type PlayerAppearance = PlayerVisualPreset & {
  tint: PlayerOutfitTint
  tintUrl: string | null
}

const PLAYER_VISUAL_IDS: readonly PlayerVisualId[] = [
  'adventurer',
  'peasant',
  'ranger',
  'knight',
  'knight_cloth',
  'noble',
  'wizard',
]

const PRESETS: Record<PlayerVisualId, PlayerVisualPreset> = {
  adventurer: {
    id: 'adventurer',
    modelUrl: PLAYER_MODEL_URL,
    animationUrl: null,
  },
  peasant: {
    id: 'peasant',
    modelUrl: PLAYER_UBC_PEASANT_URL,
    animationUrl: PLAYER_UBC_ANIMATION_URL,
  },
  ranger: {
    id: 'ranger',
    modelUrl: PLAYER_UBC_RANGER_URL,
    animationUrl: PLAYER_UBC_ANIMATION_URL,
  },
  knight: {
    id: 'knight',
    modelUrl: PLAYER_UBC_KNIGHT_URL,
    animationUrl: PLAYER_UBC_ANIMATION_URL,
  },
  knight_cloth: {
    id: 'knight_cloth',
    modelUrl: PLAYER_UBC_KNIGHT_CLOTH_URL,
    animationUrl: PLAYER_UBC_ANIMATION_URL,
  },
  noble: {
    id: 'noble',
    modelUrl: PLAYER_UBC_NOBLE_URL,
    animationUrl: PLAYER_UBC_ANIMATION_URL,
  },
  wizard: {
    id: 'wizard',
    modelUrl: PLAYER_UBC_WIZARD_URL,
    animationUrl: PLAYER_UBC_ANIMATION_URL,
  },
}

const TINT_URL: Partial<Record<PlayerVisualId, string>> = {
  peasant: PLAYER_UBC_PEASANT_BROWN_URL,
  ranger: PLAYER_UBC_RANGER_BROWN_URL,
  knight: PLAYER_UBC_KNIGHT_BROWN_URL,
  knight_cloth: PLAYER_UBC_KNIGHT_CLOTH_BROWN_URL,
  noble: PLAYER_UBC_NOBLE_BROWN_URL,
  wizard: PLAYER_UBC_WIZARD_BROWN_URL,
}

const EQUIPMENT_MODEL_URLS: readonly string[] = [
  PLAYER_UBC_PEASANT_URL,
  PLAYER_UBC_RANGER_URL,
  PLAYER_UBC_KNIGHT_URL,
]

function isPlayerVisualId(value: string): value is PlayerVisualId {
  return (PLAYER_VISUAL_IDS as readonly string[]).includes(value)
}

function readSearchParams(search: string | null | undefined): URLSearchParams | null {
  if (search !== undefined && search !== null) {
    try {
      return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    } catch {
      return null
    }
  }
  return null
}

function readNamedParam(name: string, search?: string | null): string | null {
  const params = readSearchParams(search)
  if (params) {
    const raw = params.get(name)
    if (raw === null || raw.trim() === '') return null
    return raw.trim()
  }
  return urlParamValue(name)
}

/**
 * Whitelist `?player=` override, or `null` when the param is absent.
 * Unknown values warn and return `null` (equipment/default Peasant applies).
 * Never pass a raw URL path through from the query string.
 */
export function resolvePlayerUrlOverride(
  search?: string | null,
): PlayerVisualId | null {
  const raw = readNamedParam('player', search)
  if (raw === null) return null
  const id = raw.toLowerCase()
  if (isPlayerVisualId(id)) return id
  console.warn(`[player] unknown ?player=${raw}; using equipment/default Peasant`)
  return null
}

/**
 * Body-slot armor → UBC outfit. Empty slot is Peasant; leather is Ranger;
 * chainmail (and any other body armor) is Knight.
 */
export function resolveEquipmentOutfit(bodyKind: string | null | undefined): PlayerEquipmentOutfitId {
  if (bodyKind == null) return 'peasant'
  if (bodyKind === 'leather_armor') return 'ranger'
  return 'knight'
}

export function resolvePlayerTint(
  search: string | null | undefined,
  outfit: PlayerVisualId,
): PlayerOutfitTint {
  if (outfit === 'adventurer') return 'default'
  const raw = readNamedParam('playerTint', search)
  if (raw === null) return 'default'
  const value = raw.toLowerCase()
  if (value === 'brown') return 'brown'
  if (value === 'default' || value === 'cream' || value === 'green' || value === 'white') {
    return 'default'
  }
  console.warn(`[player] unknown ?playerTint=${raw}; using default albedo`)
  return 'default'
}

function tintUrlFor(id: PlayerVisualId, tint: PlayerOutfitTint): string | null {
  if (tint !== 'brown') return null
  return TINT_URL[id] ?? null
}

/**
 * URL override wins; otherwise body armor selects Peasant / Ranger / Knight.
 * Adventurer is only reachable through `?player=adventurer`.
 */
export function resolvePlayerAppearance(opts?: {
  search?: string | null
  bodyKind?: string | null
}): PlayerAppearance {
  const override = resolvePlayerUrlOverride(opts?.search)
  const id: PlayerVisualId = override ?? resolveEquipmentOutfit(opts?.bodyKind ?? null)
  const preset = PRESETS[id]
  const tint = resolvePlayerTint(opts?.search, id)
  return {
    ...preset,
    tint,
    tintUrl: tintUrlFor(id, tint),
  }
}

/**
 * Preset-only view of {@link resolvePlayerAppearance} (no equipment, no tint).
 * Absent `?player=` is now Peasant, not Adventurer (plan items-player-034).
 */
export function resolvePlayerVisualPreset(
  search?: string | null,
): PlayerVisualPreset {
  const appearance = resolvePlayerAppearance({ search, bodyKind: null })
  return { id: appearance.id, modelUrl: appearance.modelUrl, animationUrl: appearance.animationUrl }
}

/** Other equipment-driven UBC meshes to warm so the first armor swap does not hitch. */
export function ubcPreloadUrls(currentModelUrl: string): readonly string[] {
  if (!EQUIPMENT_MODEL_URLS.includes(currentModelUrl)) return []
  return EQUIPMENT_MODEL_URLS.filter((url) => url !== currentModelUrl)
}
