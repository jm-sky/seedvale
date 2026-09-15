import type { NpcGender, Role } from './characters'
import {
  companionAnimationUrl,
  PLAYER_UBC_PEASANT_URL,
  PLAYER_UBC_WIZARD_URL,
} from '../player/playerVisualPreset'
import { isAdultAge } from '../settlement/professionStaffing'

const UBC_DIR = '/models/characters/ubc'

export const NPC_UBC_FEMALE_PEASANT_URL = `${UBC_DIR}/female_peasant.glb`
export const NPC_UBC_FEMALE_WIZARD_URL = `${UBC_DIR}/female_wizard.glb`
/** Farmer sidecar — `T_Peasant_3` (sapphire vest), not the player's olive default. */
export const NPC_UBC_PEASANT_TINT_URL = `${UBC_DIR}/npc_peasant.webp`
/** Woodcutter sidecar — `T_Peasant_2` (earth brown), distinct from farmer sapphire. */
export const NPC_UBC_WOODCUTTER_TINT_URL = `${UBC_DIR}/npc_woodcutter.webp`
/** Trader sidecar — `T_Wizard_3` (crimson + silver), not the player's default Wizard. */
export const NPC_UBC_WIZARD_TINT_URL = `${UBC_DIR}/npc_wizard.webp`

/** Quaternius Modular Men/Women — village-flavoured variants, one pool per gender. */
export const NPC_MODEL_URLS: Record<NpcGender, readonly string[]> = {
  male: [
    '/models/characters/Farmer.glb',
    '/models/characters/Worker.glb',
    '/models/characters/Casual_Hoodie.glb',
    '/models/characters/Casual_2.glb',
  ],
  female: [
    '/models/characters/Female_Worker.glb',
    '/models/characters/Female_Casual.glb',
    '/models/characters/Female_Medieval.glb',
    '/models/characters/Female_Formal.glb',
  ],
}

export type NpcOutfitId = 'modular' | 'peasant' | 'wizard'

/**
 * Derived NPC look. Appearance is not persisted — reload/`WorldBundle`
 * rebuild recomputes it from gender + role + age.
 *
 * @domain npc
 */
export type NpcAppearance = {
  animationUrl: string | null
  modelUrl: string
  outfit: NpcOutfitId
  tintUrl: string | null
}

export function modelUrlFor(gender: NpcGender, treeIndex: number): string {
  const pool = NPC_MODEL_URLS[gender]
  return pool[treeIndex % pool.length]!
}

function ubcPeasantUrl(gender: NpcGender): string {
  return gender === 'female' ? NPC_UBC_FEMALE_PEASANT_URL : PLAYER_UBC_PEASANT_URL
}

function ubcWizardUrl(gender: NpcGender): string {
  return gender === 'female' ? NPC_UBC_FEMALE_WIZARD_URL : PLAYER_UBC_WIZARD_URL
}

function appearanceFor(
  modelUrl: string,
  outfit: NpcOutfitId,
  tintUrl: string | null,
): NpcAppearance {
  return {
    animationUrl: companionAnimationUrl(modelUrl),
    modelUrl,
    outfit,
    tintUrl,
  }
}

/**
 * Adult farmer/woodcutter → Peasant UBC, adult trader → Wizard UBC; everyone
 * else (including children) stays on the Modular pool. Role, not reserved
 * name, selects the outfit.
 *
 * @domain npc
 */
export function resolveNpcAppearance(opts: {
  age: number
  gender: NpcGender
  role: Role
  treeIndex: number
}): NpcAppearance {
  if (!isAdultAge(opts.age)) {
    return appearanceFor(modelUrlFor(opts.gender, opts.treeIndex), 'modular', null)
  }
  if (opts.role === 'farmer') {
    return appearanceFor(ubcPeasantUrl(opts.gender), 'peasant', NPC_UBC_PEASANT_TINT_URL)
  }
  if (opts.role === 'woodcutter') {
    return appearanceFor(ubcPeasantUrl(opts.gender), 'peasant', NPC_UBC_WOODCUTTER_TINT_URL)
  }
  if (opts.role === 'trader') {
    return appearanceFor(ubcWizardUrl(opts.gender), 'wizard', NPC_UBC_WIZARD_TINT_URL)
  }
  return appearanceFor(modelUrlFor(opts.gender, opts.treeIndex), 'modular', null)
}
