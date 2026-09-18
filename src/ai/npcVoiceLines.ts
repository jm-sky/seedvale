import type { NpcGender, Role } from './characters'
import { lifeStageForAge } from '../settlement/npcPhysicalProfile'

/**
 * NPC semantic voice resolution (plan npc-044, legacy-free since plan
 * npc-056) — resolves a spoken bark URL from semantic intent + NPC identity
 * against the static generated Fish Audio manifest only. Pure data + pure
 * selection functions, no dependency on `NpcAgent`'s runtime/FSM state —
 * `NpcAgent` only reads `resolveNpcVoiceLine` (per-reaction, per-bark) and
 * owns none of this itself. Missing coverage is presentation-only silence,
 * never a fallback pack and never a simulation change.
 */

/**
 * Deterministic presentation identity for "who/how this NPC sounds" —
 * separate from the semantic line intent ("what is being spoken"). Not
 * personality, profession state or quest state, and never persisted:
 * derived fresh from stable NPC identity + compatible presentation
 * attributes (role/gender/age) every time. A scope may resolve to only one
 * profile today; the type stays a plain id so a future scope can carry more
 * than one without reintroducing pack-specific fields into `NpcAgent`.
 *
 * @domain npc
 */
export type NpcVoiceProfileId = string

/**
 * Deterministic voice-profile selector — replaces the old per-NPC actor
 * assignment (`voiceActorForIndex`). Pure function of gender + role, so it
 * never depends on tree/array order or construction-time randomness, and
 * stays stable across reload/rebuild for the same NPC.
 *
 * @domain npc
 */
export function voiceProfileIdFor(gender: NpcGender, role: Role): NpcVoiceProfileId {
  return `${voiceScopeForRole(role)}:${gender}`
}

/**
 * Semantic voice events resolved by `resolveNpcVoiceLine` (npc-044 dialogue,
 * npc-049 contextual life/world barks, quests-progression quest voice).
 * Bark intents are presentation-only.
 */
export type NpcVoiceSemanticIntent =
  | 'greeting'
  | 'farewell'
  | 'confirmation'
  | 'thanks'
  | 'refusal'
  | 'attention'
  | 'warning'
  | 'well_wish'
  | 'quest_offer'
  | 'quest_accepted'
  | 'quest_declined'
  | 'quest_complete'
  | 'exhausted'
  | 'hungry'
  | 'weather_shelter'
  | 'danger_alert'
  | 'combat_start'
  | 'call_for_help'
  | 'livestock_danger'
  | 'guard_response'
  | 'work_finished'

/**
 * Presentation-only age band for generated voice filenames (`young` / `old`).
 * Not an authoritative NPC lifecycle state — derived from `lifeStageForAge`.
 * @domain npc
 */
export type NpcVoiceAgeBand = 'child' | 'young' | 'old'

/** Minimal NPC identity consumed by the voice resolver — avoids importing `NpcAgent`. */
export type NpcVoiceResolveInput = {
  id: string
  gender: NpcGender
  role: Role
  age: number
  voiceProfileId: NpcVoiceProfileId
}

/**
 * Maps real age → voice filename age band. Middle adulthood returns `null`
 * (skip age-keyed lookup steps). Thresholds follow `lifeStageForAge`:
 * young ≤ youngAdult (≤24); old ≥ elderly (≥65).
 * @domain npc
 */
export function voiceAgeBandForAge(age: number): NpcVoiceAgeBand | null {
  const stage = lifeStageForAge(age)
  if (stage === 'infant' || stage === 'child') {
    return 'child'
  }
  if (stage === 'teen' || stage === 'youngAdult') {
    return 'young'
  }
  if (stage === 'elderly' || stage === 'veryElderly') return 'old'
  return null
}

/** Simulation `trader` ships as voice scope `merchant` in generated filenames. */
export function voiceScopeForRole(role: Role): string {
  return role === 'trader' ? 'merchant' : role
}

/** Quiet enough to stay under dialogue/ambient, audible enough to register —
 *  `NpcAgent.playReactionSound()`'s playback volume. */
export const REACTION_SOUND_VOLUME = 0.5

/** Quieter than a reaction sound — background chatter, not a foregrounded cue.
 *  Still used by `NpcAgent.beginConversation()`'s campfire voice cue
 *  (plan npc-045) even though the old empty friendly-talk fallback pool is
 *  gone (plan npc-056). */
export const FRIENDLY_TALK_SOUND_VOLUME = 0.65

/**
 * Static generated-voice registry (npc-044). Keys are
 * `npc:<id>:<intent>`, `<scope>:<gender>:<intent>`, or
 * `<scope>:<gender>:<young|old>:<intent>`. Values are public URLs under
 * `/sounds/voices/`. Only assets that exist in the tree are listed — no
 * runtime probing.
 */
const GENERATED_VOICE_MANIFEST: Readonly<Record<string, readonly string[]>> = {
  'general:female:greeting': [
    '/sounds/voices/general_female_greeting_01.mp3',
  ],
  'general:female:farewell': [
    '/sounds/voices/general_female_farewell_01.mp3',
  ],

  'general:male:greeting': [
    '/sounds/voices/general_male_greeting_01.mp3',
  ],
  'general:male:farewell': [
    '/sounds/voices/general_male_farewell_01.mp3',
  ],

  'merchant:female:greeting': [
    '/sounds/voices/merchant_female_greeting_01.mp3',
    '/sounds/voices/merchant_female_greeting_02.mp3',
    '/sounds/voices/merchant_female_greeting_03.mp3',
  ],
  'merchant:female:farewell': [
    '/sounds/voices/merchant_female_farewell_01.mp3',
  ],
  'merchant:female:confirmation': [
    '/sounds/voices/merchant_female_agree_01.mp3',
  ],
  'merchant:female:thanks': [
    '/sounds/voices/merchant_female_thanks_01.mp3',
  ],
  'merchant:female:attention': [
    '/sounds/voices/merchant_female_attention_01.mp3',
  ],

  'guard:male:greeting': [
    '/sounds/voices/guard_male_greeting_01.mp3',
    '/sounds/voices/guard_male_greeting_02.mp3',
  ],
  'guard:male:farewell': [
    '/sounds/voices/guard_male_farewell_01.mp3',
  ],
  'guard:male:attention': [
    '/sounds/voices/guard_male_attention_01.mp3',
  ],
  'guard:male:refusal': [
    '/sounds/voices/guard_male_refusal_01.mp3',
  ],
  'guard:male:thanks': [
    '/sounds/voices/guard_male_thanks_01.mp3',
    '/sounds/voices/guard_male_thanks_02.mp3',
  ],
  'guard:male:quest_accepted': [
    '/sounds/voices/guard_male_quest_accepted_01.mp3',
    '/sounds/voices/guard_male_quest_accepted_02.mp3',
  ],
  'guard:male:quest_declined': [
    '/sounds/voices/guard_male_quest_declined_01.mp3',
    '/sounds/voices/guard_male_quest_declined_02.mp3',
  ],
  'guard:male:quest_complete': [
    '/sounds/voices/guard_male_quest_complete_01.mp3',
    '/sounds/voices/guard_male_quest_complete_02.mp3',
  ],

  'hunter:male:greeting': [
    '/sounds/voices/hunter_male_greeting_01.mp3',
    '/sounds/voices/hunter_male_greeting_02.mp3',
  ],
  'hunter:male:farewell': [
    '/sounds/voices/hunter_male_farewell_01.mp3',
    '/sounds/voices/hunter_male_farewell_02.mp3',
  ],
  'hunter:male:confirmation': [
    '/sounds/voices/hunter_male_agree_01.mp3',
  ],
  'hunter:male:attention': [
    '/sounds/voices/hunter_male_attention_01.mp3',
  ],
  'hunter:male:thanks': [
    '/sounds/voices/hunter_male_thanks_01.mp3',
  ],
  'hunter:male:warning': [
    '/sounds/voices/hunter_male_warning_01.mp3',
  ],
  'hunter:male:well_wish': [
    '/sounds/voices/hunter_male_well_wish_01.mp3',
    '/sounds/voices/hunter_male_well_wish_02.mp3',
  ],
  'hunter:male:quest_offer': [
    '/sounds/voices/hunter_male_quest_offer_01.mp3',
  ],
  'hunter:male:quest_accepted': [
    '/sounds/voices/hunter_male_quest_accepted_01.mp3',
    '/sounds/voices/hunter_male_quest_accepted_02.mp3',
  ],
  'hunter:male:quest_declined': [
    '/sounds/voices/hunter_male_quest_declined_01.mp3',
  ],
  'hunter:male:quest_complete': [
    '/sounds/voices/hunter_male_quest_complete_01.mp3',
    '/sounds/voices/hunter_male_quest_complete_02.mp3',
  ],

  // Contextual life / world barks (npc-049) — only files present on disk.
  'general:male:exhausted': [
    '/sounds/voices/general_male_exhausted_01.mp3',
  ],
  'general:female:exhausted': [
    '/sounds/voices/general_female_exhausted_01.mp3',
  ],
  'general:male:hungry': [
    '/sounds/voices/general_male_hungry_01.mp3',
  ],
  'general:male:weather_shelter': [
    '/sounds/voices/general_male_weather_shelter_01.mp3',
  ],
  'general:female:weather_shelter': [
    '/sounds/voices/general_female_weather_shelter_01.mp3',
  ],
  'guard:male:weather_shelter': [
    '/sounds/voices/guard_male_weather_shelter_01.mp3',
  ],
  'general:male:danger_alert': [
    '/sounds/voices/general_male_danger_alert_01.mp3',
  ],
  'general:female:danger_alert': [
    '/sounds/voices/general_female_danger_alert_01.mp3',
  ],
  'guard:male:danger_alert': [
    '/sounds/voices/guard_male_danger_alert_01.mp3',
  ],
  'hunter:male:danger_alert': [
    '/sounds/voices/hunter_male_danger_alert_01.mp3',
  ],
  'general:male:combat_start': [
    '/sounds/voices/general_male_combat_start_01.mp3',
  ],
  'guard:male:combat_start': [
    '/sounds/voices/guard_male_combat_start_01.mp3',
  ],
  'hunter:male:combat_start': [
    '/sounds/voices/hunter_male_combat_start_01.mp3',
  ],
  'general:male:call_for_help': [
    '/sounds/voices/general_male_call_for_help_01.mp3',
  ],
  'general:female:call_for_help': [
    '/sounds/voices/general_female_call_for_help_01.mp3',
  ],
  'guard:male:call_for_help': [
    '/sounds/voices/guard_male_call_for_help_01.mp3',
  ],
  'hunter:male:call_for_help': [
    '/sounds/voices/hunter_male_call_for_help_01.mp3',
  ],
  'shepherd:male:livestock_danger': [
    '/sounds/voices/shepherd_male_livestock_danger_01.mp3',
  ],
  'guard:male:guard_response': [
    '/sounds/voices/guard_male_guard_response_01.mp3',
  ],
  'general:male:work_finished': [
    '/sounds/voices/general_male_work_finished_01.mp3',
  ],
}

function pickFromUrlPool(pool: readonly string[] | undefined): string | undefined {
  if (!pool || pool.length === 0) return undefined
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Most-specific → least-specific generated lookup keys for one NPC + intent. */
export function buildNpcVoiceLookupKeys(
  npc: Pick<NpcVoiceResolveInput, 'id' | 'gender' | 'role' | 'age'>,
  intent: NpcVoiceSemanticIntent,
): readonly string[] {
  const scope = voiceScopeForRole(npc.role)
  const ageBand = voiceAgeBandForAge(npc.age)
  const keys: string[] = [`npc:${npc.id}:${intent}`]
  if (ageBand) keys.push(`${scope}:${npc.gender}:${ageBand}:${intent}`)
  keys.push(`${scope}:${npc.gender}:${intent}`)
  if (ageBand) keys.push(`general:${npc.gender}:${ageBand}:${intent}`)
  keys.push(`general:${npc.gender}:${intent}`)
  return keys
}

/**
 * Resolve a spoken NPC bark URL from semantic intent + NPC identity.
 * Hierarchy: NPC-specific → profession(+age) → general(+age) → undefined.
 * No legacy Super Dialogue fallback — missing generated coverage is
 * presentation-only silence.
 *
 * @domain npc
 */
export function resolveNpcVoiceLine(
  npc: NpcVoiceResolveInput,
  intent: NpcVoiceSemanticIntent,
): string | undefined {
  return resolveNpcVoiceLineWithManifest(GENERATED_VOICE_MANIFEST, npc, intent)
}

/** Manifest-injectable resolver — used by unit tests; production calls the bound wrapper. */
export function resolveNpcVoiceLineWithManifest(
  manifest: Readonly<Record<string, readonly string[]>>,
  npc: NpcVoiceResolveInput,
  intent: NpcVoiceSemanticIntent,
): string | undefined {
  for (const key of buildNpcVoiceLookupKeys(npc, intent)) {
    const hit = pickFromUrlPool(manifest[key])
    if (hit) return hit
  }
  return undefined
}
