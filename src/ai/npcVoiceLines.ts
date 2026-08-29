import type { NpcGender } from './characters'

/**
 * NPC voice-line pool selection (plan 202) — assigns each NPC one of the 5
 * recorded voice actors in the Super Dialogue Audio Pack v1
 * (public/sounds/README.md) and picks lines from the greeting/farewell/
 * confirmation/reaction/quest-complete categories. Pure data + pure
 * selection functions, no dependency on `NpcAgent`'s runtime/FSM state —
 * `NpcAgent` only reads the pools/pickers below (`voiceActorForIndex` at
 * construction, `playReactionSound()` per-reaction) and owns none of this
 * itself.
 */

/** One of the 5 recorded voice actors — assigned deterministically per NPC
 *  (`voiceActorForIndex`), the same way `NpcAgent`'s `modelUrlFor` picks a
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
export const REACTION_SOUND_VOLUME = 0.35

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
