import type { NpcGender, Role } from './characters'
import {
  companionAnimationUrl,
  PLAYER_UBC_PEASANT_URL,
  PLAYER_UBC_RANGER_URL,
  PLAYER_UBC_WIZARD_URL,
} from '../player/playerVisualPreset'
import { isAdultAge } from '../settlement/professionStaffing'
import { createSeededRandom } from '../world/parseSeed'

const UBC_DIR = '/models/characters/ubc'
const NPC_VARIANT_DIR = `${UBC_DIR}/npc`

export const NPC_UBC_FEMALE_PEASANT_URL = `${UBC_DIR}/female_peasant.glb`
export const NPC_UBC_FEMALE_WIZARD_URL = `${UBC_DIR}/female_wizard.glb`
export const NPC_UBC_FEMALE_RANGER_URL = `${UBC_DIR}/female_ranger.glb`
export const NPC_UBC_FEMALE_KNIGHT_URL = `${UBC_DIR}/female_knight.glb`
/** Farmer sidecar — `T_Peasant_3` (sapphire vest), not the player's olive default. */
export const NPC_UBC_PEASANT_TINT_URL = `${UBC_DIR}/npc_peasant.webp`
/** Woodcutter sidecar — `T_Peasant_2` (earth brown), distinct from farmer sapphire. */
export const NPC_UBC_WOODCUTTER_TINT_URL = `${UBC_DIR}/npc_woodcutter.webp`
/** Trader sidecar — `T_Wizard_3` (crimson + silver), not the player's default Wizard. */
export const NPC_UBC_WIZARD_TINT_URL = `${UBC_DIR}/npc_wizard.webp`
/** Hunter sidecar — `T_Ranger_2` (dark violet), not the player's green default or brown tint. */
export const NPC_UBC_RANGER_TINT_URL = `${UBC_DIR}/npc_ranger.webp`
export const NPC_UBC_HAIR_1_URL = `${UBC_DIR}/hair_1.webp`
export const NPC_UBC_HAIR_2_URL = `${UBC_DIR}/hair_2.webp`

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

export type NpcOutfitId = 'modular' | 'peasant' | 'wizard' | 'ranger'
export type NpcUbcOutfitId = Exclude<NpcOutfitId, 'modular'>
export type NpcHairKind = 'simple' | 'long' | 'buzzed' | 'buns'
export type NpcClothingHueId = 'identity' | 'warm' | 'cool' | 'darker'

/** Multiply on cloned `MI_Peasant` / `MI_Wizard` / `MI_Ranger` / `MI_Knight` after the role sidecar. */
export const NPC_CLOTHING_HUE: Record<NpcClothingHueId, number> = {
  identity: 0xffffff,
  warm: 0xf2e6d8,
  cool: 0xdde4f0,
  darker: 0xc8c0b4,
}

const MALE_HAIR_KINDS: readonly NpcHairKind[] = ['simple', 'long', 'buzzed', 'buns']
/** Women use Hair_Long / Hair_Buns only — not SimpleParted or Hair_BuzzedFemale. */
const FEMALE_HAIR_KINDS: readonly NpcHairKind[] = ['long', 'buns']
const CLOTHING_HUE_IDS: readonly NpcClothingHueId[] = ['identity', 'warm', 'cool', 'darker']
const HAIR_TINT_URLS: readonly string[] = [NPC_UBC_HAIR_1_URL, NPC_UBC_HAIR_2_URL]
const BEARD_CHANCE = 0.35
/** Distinct from physical-profile salts (`PHYS` / SPEA streams). */
const APPEARANCE_SEED_SALT = 0x41505045

/**
 * Derived NPC look. Appearance is not persisted — reload/`WorldBundle`
 * rebuild recomputes it from gender + role + age + `npcId` (hair/beard/hue).
 *
 * @domain npc
 */
export type NpcAppearance = {
  animationUrl: string | null
  clothingHue: number
  hairTintUrl: string | null
  modelUrl: string
  outfit: NpcOutfitId
  tintUrl: string | null
}

export function modelUrlFor(gender: NpcGender, treeIndex: number): string {
  const pool = NPC_MODEL_URLS[gender]
  return pool[treeIndex % pool.length]!
}

function appearanceFor(
  modelUrl: string,
  outfit: NpcOutfitId,
  tintUrl: string | null,
  hairTintUrl: string | null = null,
  clothingHue: number = NPC_CLOTHING_HUE.identity,
): NpcAppearance {
  return {
    animationUrl: companionAnimationUrl(modelUrl),
    clothingHue,
    hairTintUrl,
    modelUrl,
    outfit,
    tintUrl,
  }
}

function hashNpcId(npcId: string): number {
  let h = 2166136261
  for (let i = 0; i < npcId.length; i++) {
    h ^= npcId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hairKindsFor(gender: NpcGender): readonly NpcHairKind[] {
  return gender === 'female' ? FEMALE_HAIR_KINDS : MALE_HAIR_KINDS
}

function pickIndex(random: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(random() * length))
}

function defaultUbcUrl(gender: NpcGender, outfit: NpcUbcOutfitId): string {
  if (outfit === 'peasant') {
    return gender === 'female' ? NPC_UBC_FEMALE_PEASANT_URL : PLAYER_UBC_PEASANT_URL
  }
  if (outfit === 'ranger') {
    return gender === 'female' ? NPC_UBC_FEMALE_RANGER_URL : PLAYER_UBC_RANGER_URL
  }
  return gender === 'female' ? NPC_UBC_FEMALE_WIZARD_URL : PLAYER_UBC_WIZARD_URL
}

function isPlayerDefaultCombo(
  gender: NpcGender,
  outfit: NpcUbcOutfitId,
  hair: NpcHairKind,
  beard: boolean,
): boolean {
  if (beard) return false
  if (gender === 'male' && hair === 'simple') return true
  // Female Peasant stem is Hair_Long. Wizard/Ranger stems were SimpleParted —
  // long hair lives in npc/female_*_long.glb.
  if (gender === 'female' && outfit === 'peasant' && hair === 'long') return true
  return false
}

/**
 * Baked hair/beard variant, or the shared player/default GLB for the
 * npc-039 / hunter-default combos.
 *
 * @domain npc
 */
export function ubcVariantModelUrl(
  gender: NpcGender,
  outfit: NpcUbcOutfitId,
  hair: NpcHairKind,
  beard: boolean,
): string {
  if (isPlayerDefaultCombo(gender, outfit, hair, beard)) {
    return defaultUbcUrl(gender, outfit)
  }
  const beardSuffix = beard ? '_beard' : ''
  return `${NPC_VARIANT_DIR}/${gender}_${outfit}_${hair}${beardSuffix}.glb`
}

function rollUbcVariant(npcId: string, gender: NpcGender, outfit: NpcUbcOutfitId): {
  clothingHue: number
  hairTintUrl: string
  modelUrl: string
} {
  const random = createSeededRandom(hashNpcId(npcId) ^ APPEARANCE_SEED_SALT)
  const hairs = hairKindsFor(gender)
  const hair = hairs[pickIndex(random, hairs.length)]!
  const beard = gender === 'male' && random() < BEARD_CHANCE
  const hairTintUrl = HAIR_TINT_URLS[pickIndex(random, HAIR_TINT_URLS.length)]!
  const hueId = CLOTHING_HUE_IDS[pickIndex(random, CLOTHING_HUE_IDS.length)]!
  return {
    clothingHue: NPC_CLOTHING_HUE[hueId],
    hairTintUrl,
    modelUrl: ubcVariantModelUrl(gender, outfit, hair, beard),
  }
}

const UBC_ROLE_LOOK: Partial<Record<Role, { outfit: NpcUbcOutfitId, tintUrl: string }>> = {
  farmer: { outfit: 'peasant', tintUrl: NPC_UBC_PEASANT_TINT_URL },
  woodcutter: { outfit: 'peasant', tintUrl: NPC_UBC_WOODCUTTER_TINT_URL },
  trader: { outfit: 'wizard', tintUrl: NPC_UBC_WIZARD_TINT_URL },
  hunter: { outfit: 'ranger', tintUrl: NPC_UBC_RANGER_TINT_URL },
}

/**
 * Adult farmer/woodcutter → Peasant UBC, adult trader → Wizard UBC, adult
 * hunter → Ranger UBC; everyone else (including children) stays on the
 * Modular pool. Role, not reserved name, selects the outfit. Hair/beard/hue
 * come from `npcId`, not role. Women only roll Hair_Long / Hair_Buns.
 *
 * @domain npc
 */
export function resolveNpcAppearance(opts: {
  age: number
  gender: NpcGender
  npcId: string
  role: Role
  treeIndex: number
}): NpcAppearance {
  if (!isAdultAge(opts.age)) {
    return appearanceFor(modelUrlFor(opts.gender, opts.treeIndex), 'modular', null)
  }
  const look = UBC_ROLE_LOOK[opts.role]
  if (look) {
    const variant = rollUbcVariant(opts.npcId, opts.gender, look.outfit)
    return appearanceFor(
      variant.modelUrl,
      look.outfit,
      look.tintUrl,
      variant.hairTintUrl,
      variant.clothingHue,
    )
  }
  return appearanceFor(modelUrlFor(opts.gender, opts.treeIndex), 'modular', null)
}
