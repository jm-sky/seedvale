import { urlParamValue } from '../debug/debugMode'
import { PLAYER_MODEL_URL } from './PlayerController'

/** UBC Peasant/Ranger player meshes (items-player-033 / 034). */
export const PLAYER_UBC_PEASANT_URL = '/models/characters/ubc/male_peasant.glb'
export const PLAYER_UBC_RANGER_URL = '/models/characters/ubc/male_ranger.glb'
/** In-place UAL1 subset: Idle_Loop, Walk_Loop, Sprint_Loop, Sword_Attack. */
export const PLAYER_UBC_ANIMATION_URL = '/models/characters/ubc/ual1_player.glb'
/** Alt BaseColor for Peasant (`T_Peasant_2_BaseColor`) — brown, not cream. */
export const PLAYER_UBC_PEASANT_BROWN_URL = '/models/characters/ubc/male_peasant_brown.webp'
/** Alt BaseColor for Ranger (`T_Ranger_3_BaseColor`) — brown, not green. */
export const PLAYER_UBC_RANGER_BROWN_URL = '/models/characters/ubc/male_ranger_brown.webp'

export type PlayerVisualId = 'adventurer' | 'peasant' | 'ranger'
export type PlayerOutfitTint = 'default' | 'brown'

export type PlayerVisualPreset = {
  animationUrl: string | null
  id: PlayerVisualId
  modelUrl: string
}

/** Resolved player look: URL override, else body-slot equipment (plan 034). */
export type PlayerAppearance = PlayerVisualPreset & {
  tint: PlayerOutfitTint
  tintUrl: string | null
}

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
  if (id === 'adventurer' || id === 'peasant' || id === 'ranger') return id
  console.warn(`[player] unknown ?player=${raw}; using equipment/default Peasant`)
  return null
}

/**
 * Body-slot armor → UBC outfit. Empty slot is Peasant; any worn body armor
 * (leather, chainmail, future kinds) is Ranger until a distinct mesh exists.
 */
export function resolveEquipmentOutfit(bodyKind: string | null | undefined): 'peasant' | 'ranger' {
  return bodyKind == null ? 'peasant' : 'ranger'
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
  if (id === 'peasant') return PLAYER_UBC_PEASANT_BROWN_URL
  if (id === 'ranger') return PLAYER_UBC_RANGER_BROWN_URL
  return null
}

/**
 * URL override wins; otherwise body armor selects Peasant vs Ranger.
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

/** Other UBC mesh to warm in the GLB cache so the first armor swap does not hitch. */
export function ubcPreloadUrls(currentModelUrl: string): readonly string[] {
  if (currentModelUrl === PLAYER_UBC_PEASANT_URL) return [PLAYER_UBC_RANGER_URL]
  if (currentModelUrl === PLAYER_UBC_RANGER_URL) return [PLAYER_UBC_PEASANT_URL]
  return []
}
