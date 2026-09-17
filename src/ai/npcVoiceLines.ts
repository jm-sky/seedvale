import type { NpcGender, Role } from './characters'
import { lifeStageForAge } from '../settlement/npcPhysicalProfile'

/**
 * NPC voice-line pool selection (plan 202 / npc-044) — assigns each NPC one of
 * the 5 recorded voice actors in the Super Dialogue Audio Pack v1
 * (public/sounds/README.md) and picks lines from the greeting/farewell/
 * confirmation/reaction/quest-complete categories. Plan npc-044 adds a
 * hierarchical generated-asset resolver (`resolveNpcVoiceLine`) with legacy
 * Super Dialogue pools as final fallback. Pure data + pure selection
 * functions, no dependency on `NpcAgent`'s runtime/FSM state —
 * `NpcAgent` only reads the pools/pickers below (`voiceActorForIndex` at
 * construction, `playReactionSound()` per-reaction) and owns none of this
 * itself.
 */

/** One of the 5 recorded voice actors — assigned deterministically per NPC
 *  (`voiceActorForIndex`), the same way `npcAppearance`'s `modelUrlFor` picks a
 *  body model, so each NPC keeps one consistent voice all session instead
 *  of a random one per line. */
export type NpcVoiceActor = 'alex' | 'ian' | 'sean' | 'karen' | 'meghan'

const NPC_VOICE_ACTORS: Record<NpcGender, readonly NpcVoiceActor[]> = {
  male: ['alex', 'ian', 'sean'],
  female: ['karen', 'meghan'],
}

export function voiceActorForIndex(gender: NpcGender, treeIndex: number): NpcVoiceActor {
  const pool = NPC_VOICE_ACTORS[gender]
  return pool[treeIndex % pool.length]!
}

function genderForVoiceActor(actor: NpcVoiceActor): NpcGender {
  return NPC_VOICE_ACTORS.male.includes(actor) ? 'male' : 'female'
}

const ALL_VOICE_ACTORS: readonly NpcVoiceActor[] = ['alex', 'ian', 'sean', 'karen', 'meghan']

/** Builds `/sounds/{gender}-{slug}-{actor}-{NN}.ogg` pools for a Super Dialogue
 *  Audio Pack v1 category, one array per voice actor. Sources/licenses:
 *  public/sounds/README.md. */
function voiceLinePool(slug: string, count: number): Record<NpcVoiceActor, readonly string[]> {
  const pool = {} as Record<NpcVoiceActor, readonly string[]>
  for (const actor of ALL_VOICE_ACTORS) {
    const gender = genderForVoiceActor(actor)
    pool[actor] = Array.from(
      { length: count },
      (_, i) => `/sounds/${gender}-${slug}-${actor}-${String(i + 1).padStart(2, '0')}.ogg`,
    )
  }
  return pool
}

/** Flattens a category's per-actor files into one array per gender — for pools
 *  (like quest-complete, below) that are only ever picked by gender, not by
 *  the giver's specific voice actor. */
function voiceLinePoolByGender(slug: string, count: number): Record<NpcGender, readonly string[]> {
  const byActor = voiceLinePool(slug, count)
  return {
    male: NPC_VOICE_ACTORS.male.flatMap((actor) => byActor[actor]),
    female: NPC_VOICE_ACTORS.female.flatMap((actor) => byActor[actor]),
  }
}

/** "Hmm/Huh?/Wow!" clips (Miscellaneous category) — extra per-actor variety
 *  merged into `NPC_REACTION_SOUND_URLS` picks in `NpcAgent.playReactionSound()`. */
export const NPC_HMM_VOICE_URLS = voiceLinePool('hmm', 3)

/** "Hello/Hey/Welcome/Greetings" clips (Greeting category) — played when a
 *  dialogue panel opens with this NPC. */
export const NPC_GREETING_SOUND_URLS = voiceLinePool('greeting', 4)

/** "Goodbye/Take care/Farewell/Good luck" clips (Farewell category) — played
 *  when a dialogue panel closes without accepting an offer. */
export const NPC_FAREWELL_SOUND_URLS = voiceLinePool('farewell', 4)

/** "Yes/You got it/On my way/Alright" clips (Confirmation category) — played
 *  when the player accepts this NPC's dialogue offer. */
export const NPC_CONFIRMATION_SOUND_URLS = voiceLinePool('confirmation', 4)

function pickVoiceLine(pool: Record<NpcVoiceActor, readonly string[]>, actor: NpcVoiceActor): string | undefined {
  const lines = pool[actor]
  return lines[Math.floor(Math.random() * lines.length)]
}

/** Random greeting line for this NPC's assigned voice actor — call when a
 *  dialogue panel opens with them. */
export function pickNpcGreetingSound(actor: NpcVoiceActor): string | undefined {
  return pickVoiceLine(NPC_GREETING_SOUND_URLS, actor)
}

/** Random farewell line — call when a dialogue panel closes without accepting
 *  an offer. */
export function pickNpcFarewellSound(actor: NpcVoiceActor): string | undefined {
  return pickVoiceLine(NPC_FAREWELL_SOUND_URLS, actor)
}

/** Random confirmation line — call when the player accepts this NPC's
 *  dialogue offer. */
export function pickNpcConfirmationSound(actor: NpcVoiceActor): string | undefined {
  return pickVoiceLine(NPC_CONFIRMATION_SOUND_URLS, actor)
}

/** Short reaction clips played once when an NPC enters `lookAtPlayer` — one pool
 *  per gender. Sources/licenses: public/sounds/README.md. */
export const NPC_REACTION_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: ['/sounds/male-hmm-01.m4a', '/sounds/male-hmm-02.ogg'],
  female: ['/sounds/female-hmm-01.ogg', '/sounds/female-hmm-02.ogg'],
}

/** Short "thank you" clips played once a quest is turned in — one pool per
 *  gender, keyed by the giver's gender (only the name is known at that call
 *  site — see `QuestManager.playQuestCompleteSound` — so this can't be keyed
 *  by voice actor). Sources/licenses: public/sounds/README.md. */
const NPC_THANK_YOU_VOICE_URLS = voiceLinePoolByGender('thank-you', 4)

export const NPC_QUEST_COMPLETE_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: ['/sounds/male-thank-you-01.mp3', '/sounds/male-thank-you-02.ogg', ...NPC_THANK_YOU_VOICE_URLS.male],
  female: ['/sounds/female-thank-you-01.mp3', ...NPC_THANK_YOU_VOICE_URLS.female],
}

/** Quiet enough to stay under dialogue/ambient, audible enough to register —
 *  `NpcAgent.playReactionSound()`'s playback volume. */
export const REACTION_SOUND_VOLUME = 0.5

/**
 * Short, non-verbal "friendly talk" murmur played when a Social Place
 * `conversation` actually begins (plan settlements-npcs-004 §3) — a
 * consequence of the existing `conversation` action, not a random ambient
 * NPC-proximity sound. Deliberately **not** the Super Dialogue Audio Pack's
 * spoken lines above: distinct short, wordless chatter clips.
 *
 * These clips don't exist in `public/sounds/` yet (manual asset addition —
 * see `docs/assets/SOUNDS.md`); the pools stay empty until then, so
 * `pickNpcFriendlyTalkSound` returns `undefined` and playback is a silent
 * no-op — same "gap in the lookup, no fetch attempted" shape as
 * `audio/animalSounds.ts`'s `ANIMAL_SOUND_URLS`. Once added, fill the arrays
 * below with the real filenames (suggested convention:
 * `/sounds/npc-talk-{gender}-{NN}.ogg`, split by gender only — no per-actor
 * pool, per the plan's "opcjonalnie rozdzielony na pule męskie/żeńskie").
 */
export const NPC_FRIENDLY_TALK_SOUND_URLS: Record<NpcGender, readonly string[]> = {
  male: [],
  female: [],
}

/** Quieter than a reaction sound — background chatter, not a foregrounded cue. */
export const FRIENDLY_TALK_SOUND_VOLUME = 0.25

export function pickNpcFriendlyTalkSound(gender: NpcGender): string | undefined {
  const pool = NPC_FRIENDLY_TALK_SOUND_URLS[gender]
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Semantic dialogue voice events resolved by `resolveNpcVoiceLine` (npc-044). */
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

/**
 * Presentation-only age band for generated voice filenames (`young` / `old`).
 * Not an authoritative NPC lifecycle state — derived from `lifeStageForAge`.
 * @domain npc
 */
export type NpcVoiceAgeBand = 'young' | 'old'

/** Minimal NPC identity consumed by the voice resolver — avoids importing `NpcAgent`. */
export type NpcVoiceResolveInput = {
  id: string
  gender: NpcGender
  role: Role
  age: number
  voiceActor: NpcVoiceActor
}

/**
 * Maps real age → voice filename age band. Middle adulthood returns `null`
 * (skip age-keyed lookup steps). Thresholds follow `lifeStageForAge`:
 * young ≤ youngAdult (≤24); old ≥ elderly (≥65).
 * @domain npc
 */
export function voiceAgeBandForAge(age: number): NpcVoiceAgeBand | null {
  const stage = lifeStageForAge(age)
  if (stage === 'infant' || stage === 'child' || stage === 'teen' || stage === 'youngAdult') {
    return 'young'
  }
  if (stage === 'elderly' || stage === 'veryElderly') return 'old'
  return null
}

/** Simulation `trader` ships as voice scope `merchant` in generated filenames. */
export function voiceScopeForRole(role: Role): string {
  return role === 'trader' ? 'merchant' : role
}

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

function pickLegacyVoiceLine(
  intent: NpcVoiceSemanticIntent,
  actor: NpcVoiceActor,
): string | undefined {
  switch (intent) {
    case 'confirmation':
      return pickNpcConfirmationSound(actor)

    case 'farewell':
      return pickNpcFarewellSound(actor)

    case 'greeting':
      return pickNpcGreetingSound(actor)

    default:
      return undefined
  }
}

/**
 * Resolve a spoken NPC bark URL from semantic intent + NPC identity.
 * Hierarchy: NPC-specific → profession(+age) → general(+age) → legacy
 * Super Dialogue actor pool (greeting/farewell/confirmation only) → undefined.
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
  return pickLegacyVoiceLine(intent, npc.voiceActor)
}
