/** Animal one-shots on `[E]` interact. Sources/licenses: public/sounds/README.md. */

import type { AnimalKind } from '../fauna/AnimalAgent'
import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

export const ANIMAL_SOUND_URLS: Partial<Record<AnimalKind, string[]>> = {
  chicken: ['/sounds/animal-chicken-01.ogg', '/sounds/animal-chicken-02.ogg'],
  cow: ['/sounds/animal-cow-01.ogg', '/sounds/animal-cow-02.ogg'],
  wolf: ['/sounds/animal-wolf-01.ogg'],
  horse: ['/sounds/animal-horse-01.ogg'],
  sheep: ['/sounds/animal-sheep-01.ogg'],
  // Plan fauna-011 — same clip doubles as the contextual guard/alert bark
  // (`AnimalAgent.updateDogVocalization()`'s `onVocalize`), same convention
  // as cow/sheep/chicken sharing one clip between both triggers (see
  // `SPONTANEOUS_VOCALIZE_SOUND_URLS`'s doc below). A second sample can be
  // appended here once recorded — the array already supports more than one.
  dog: ['/sounds/animal-dog-01.ogg'],
}

/** Quiet enough under dialogue/ambient; chicken bed is long so keep it softer. */
const ANIMAL_SFX_VOLUME: Partial<Record<AnimalKind, number>> = {
  chicken: 0.28,
  cow: 0.4,
  wolf: 0.4,
}

const DEFAULT_ANIMAL_SFX_VOLUME = 0.35

/** Plays the species clip when one exists — no-op for kinds without a sound yet. */
export function playAnimalSound(
  kind: AnimalKind,
  playAt: PlayAt,
  position: WorldSoundPosition,
): void {
  const urls = ANIMAL_SOUND_URLS[kind] ?? []
  const url = urls[Math.floor(Math.random() * urls.length)]
  if (!url) return
  playAt(url, position, ANIMAL_SFX_VOLUME[kind] ?? DEFAULT_ANIMAL_SFX_VOLUME)
}

/** Aggression/alert one-shots (plan 188) — a separate trigger from the `[E]`
 *  interact sound above: `Fauna`'s `onAnimalAggro` hook fires this once a
 *  predator commits to chasing a human, not on interact. Kinds without a
 *  configured growl are silent, same "data lookup, no species branch" shape
 *  as `ANIMAL_SOUND_URLS`. */
export const ANIMAL_AGGRO_SOUND_URLS: Partial<Record<AnimalKind, string>> = {
  bear: '/sounds/bear-growl.ogg',
}

const ANIMAL_AGGRO_SFX_VOLUME: Partial<Record<AnimalKind, number>> = {
  bear: 0.5,
}

const DEFAULT_ANIMAL_AGGRO_VOLUME = 0.4

export function playAnimalAggroSound(
  kind: AnimalKind,
  playAt: PlayAt,
  position: WorldSoundPosition,
): void {
  const url = ANIMAL_AGGRO_SOUND_URLS[kind]
  if (!url) return
  playAt(url, position, ANIMAL_AGGRO_SFX_VOLUME[kind] ?? DEFAULT_ANIMAL_AGGRO_VOLUME)
}

/** Spontaneous ambient vocalization (plan settlements-npcs-004 §1) —
 *  per-animal cooldown + probabilistic trigger instead of a flat global
 *  roll, so a lone cow doesn't moo on a fixed drumbeat and a big herd
 *  doesn't chorus together. `AnimalAgent` owns the per-instance cooldown
 *  number (same as its other timers, e.g. `attackCooldown`); this module
 *  only owns the tunable config and the pure tick/concurrency logic. */
type SpontaneousVocalizeConfig = {
  /** Random range (seconds) a fresh cooldown is redrawn from after firing. */
  cooldownMinSec: number
  cooldownMaxSec: number
  /** Chance per recheck once the cooldown has elapsed. */
  chance: number
}

const SPONTANEOUS_VOCALIZE_CONFIG: Partial<Record<AnimalKind, SpontaneousVocalizeConfig>> = {
  cow: { cooldownMinSec: 20 * 60, cooldownMaxSec: 40 * 60, chance: 0.12 },
  sheep: { cooldownMinSec: 20 * 60, cooldownMaxSec: 40 * 60, chance: 0.12 },
  // Somewhat shorter cooldown per plan §1 ("kura może mieć nieco krótszy cooldown").
  chicken: { cooldownMinSec: 10 * 60, cooldownMaxSec: 20 * 60, chance: 0.15 },
  // Base chance before `spontaneousVocalizeTimeWeight` scales it toward 0
  // outside each species' active window (plan fauna-009 §1/§4) — tuned
  // higher than cow/sheep/chicken's flat chance since it's rarely at full
  // weight.
  wolf: { cooldownMinSec: 6 * 60, cooldownMaxSec: 14 * 60, chance: 0.3 },
  rooster: { cooldownMinSec: 12 * 60, cooldownMaxSec: 25 * 60, chance: 0.25 },
}

/** Dawn/dusk anchors (`dayNight.ts`'s `timeOfDay` convention: 0 = midnight,
 *  0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk) — kept local here rather than
 *  imported, same convention/reasoning as `createAmbientAudio.ts`'s own
 *  `DUSK`/night-phase constants (this module stays independent of
 *  `world/dayNight.ts`). */
const DAWN_TIME = 0.25
const DUSK_TIME = 0.75

/** Circular distance between two `timeOfDay` values in `[0, 0.5]`. */
function circularTimeDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1
  return Math.min(d, 1 - d)
}

/** How far into the night half (in `timeOfDay` units, past the dawn/dusk
 *  boundary) `wolfHowlWeight` keeps ramping from `WOLF_TWILIGHT_WEIGHT` up
 *  to full weight — night's deepest point (midnight) is `0.25` from either
 *  boundary, so this stays well inside that. */
const WOLF_TWILIGHT_WIDTH = 0.15
const WOLF_TWILIGHT_WEIGHT = 0.35
const WOLF_DAY_WEIGHT = 0

/** Wolf howl time-of-day weighting (plan fauna-009 §1) — multiplies
 *  `SPONTANEOUS_VOCALIZE_CONFIG.wolf.chance`: full weight through the core
 *  of the night, ramping down to `WOLF_TWILIGHT_WEIGHT` right at dusk/dawn,
 *  `0` through the day. Pure/exported so it's unit-testable without an
 *  `AnimalAgent`. */
export function wolfHowlWeight(timeOfDay: number): number {
  if (timeOfDay > DAWN_TIME && timeOfDay < DUSK_TIME) return WOLF_DAY_WEIGHT
  const distFromBoundary = Math.min(
    circularTimeDistance(timeOfDay, DAWN_TIME),
    circularTimeDistance(timeOfDay, DUSK_TIME),
  )
  if (distFromBoundary >= WOLF_TWILIGHT_WIDTH) return 1
  return WOLF_TWILIGHT_WEIGHT + (1 - WOLF_TWILIGHT_WEIGHT) * (distFromBoundary / WOLF_TWILIGHT_WIDTH)
}

/** How close to dawn (`DAWN_TIME`), in `timeOfDay` units, the crow weight
 *  ramps down from its dawn peak to the flat daytime baseline. */
const ROOSTER_DAWN_WINDOW = 0.08
const ROOSTER_DAY_WEIGHT = 0.12
const ROOSTER_NIGHT_WEIGHT = 0

/** Rooster crow time-of-day weighting (plan fauna-009 §4) — multiplies
 *  `SPONTANEOUS_VOCALIZE_CONFIG.rooster.chance`: peaks at dawn, a low but
 *  non-zero baseline through the rest of the day, `0` at night. Needs the
 *  raw `timeOfDay` (not `dayFactor`) since dawn and dusk otherwise share the
 *  same `dayFactor`/elevation value. Pure/exported, same reason as
 *  `wolfHowlWeight`. */
export function roosterCrowWeight(timeOfDay: number): number {
  const distFromDawn = circularTimeDistance(timeOfDay, DAWN_TIME)
  if (distFromDawn < ROOSTER_DAWN_WINDOW) {
    return 1 - (1 - ROOSTER_DAY_WEIGHT) * (distFromDawn / ROOSTER_DAWN_WINDOW)
  }
  const isDay = timeOfDay > DAWN_TIME && timeOfDay < DUSK_TIME
  return isDay ? ROOSTER_DAY_WEIGHT : ROOSTER_NIGHT_WEIGHT
}

const SPONTANEOUS_VOCALIZE_WEIGHT: Partial<Record<AnimalKind, (timeOfDay: number) => number>> = {
  wolf: wolfHowlWeight,
  rooster: roosterCrowWeight,
}

/** `tickSpontaneousVocalizeCooldown`'s time-of-day `chanceMultiplier` for
 *  `kind` — `1` (no-op) for any kind without a configured weighting
 *  function, so cow/sheep/chicken's existing flat-chance behaviour is
 *  unaffected. `AnimalAgent.update()` is the sole caller, since it's the one
 *  place both `kind` and the world clock are already in scope. */
export function spontaneousVocalizeTimeWeight(kind: AnimalKind, timeOfDay: number): number {
  return SPONTANEOUS_VOCALIZE_WEIGHT[kind]?.(timeOfDay) ?? 1
}

/** Once the cooldown clears without a successful roll, how soon to retry —
 *  short relative to the cooldown itself so the wait feels probabilistic
 *  rather than snapping onto a second fixed timer. */
const VOCALIZE_RECHECK_SEC = 20

/** Initial per-instance cooldown for a freshly constructed animal — drawn
 *  from `[0, cooldownMax]` rather than the full `[min, max]` range so a
 *  just-loaded herd doesn't stay uniformly silent for a whole cooldown
 *  period; animals read as already "mid-cycle" when the player arrives.
 *  `Infinity` for any kind without a config, so `tickSpontaneousVocalizeCooldown`
 *  never fires for it. */
export function initialSpontaneousVocalizeCooldownSec(
  kind: AnimalKind,
  rng: () => number = Math.random,
): number {
  const config = SPONTANEOUS_VOCALIZE_CONFIG[kind]
  return config ? rng() * config.cooldownMaxSec : Infinity
}

/** Advances one animal's spontaneous-vocalization cooldown by `dt` seconds.
 *  Pure — takes/returns the cooldown value instead of owning it, so the
 *  caller (`AnimalAgent.update()`) keeps holding its own per-instance timers
 *  the same way it already does for `attackCooldown`/`alertTimer`. `rng` is
 *  injectable for deterministic tests, same convention as
 *  `ai/socialBehaviour.ts`'s `conversationDurationSec`/`conversationOutcome`. */
export function tickSpontaneousVocalizeCooldown(
  kind: AnimalKind,
  dt: number,
  cooldownSec: number,
  rng: () => number = Math.random,
  /** Extra multiplier folded into `config.chance` before the roll (plan
   *  fauna-009) — `spontaneousVocalizeTimeWeight()`'s dawn/night weighting
   *  for wolf howl / rooster crow. `1` (no-op) for every existing call site
   *  and every kind without a configured weighting function. */
  chanceMultiplier = 1,
): { cooldownSec: number, fire: boolean } {
  const config = SPONTANEOUS_VOCALIZE_CONFIG[kind]
  if (!config) return { cooldownSec, fire: false }
  const remaining = cooldownSec - dt
  if (remaining > 0) return { cooldownSec: remaining, fire: false }
  if (rng() < config.chance * chanceMultiplier) {
    const fresh = config.cooldownMinSec + rng() * (config.cooldownMaxSec - config.cooldownMinSec)
    return { cooldownSec: fresh, fire: true }
  }
  return { cooldownSec: VOCALIZE_RECHECK_SEC, fire: false }
}

/** Caps simultaneous spontaneous vocalizations (plan §1: "ograniczenie
 *  jednoczesnych odgłosów zwierząt, aby większe stada nie powodowały
 *  audio-spamu") — independent per-animal cooldowns can still roll close
 *  together in a big herd; this is the actual spam guard. Module-level by
 *  design, one shared gate across every animal — mirrors
 *  `createWorldAudio.ts`'s module-level `bufferCache`. */
const MAX_CONCURRENT_SPONTANEOUS = 3
const CONCURRENT_WINDOW_SEC = 6
let recentSpontaneousPlaysAt: number[] = []

/** Spontaneous-vocalization clip override (plan fauna-009) — species whose
 *  ambient spontaneous vocalization uses a different clip than the
 *  `[E]`-interact one-shot (`ANIMAL_SOUND_URLS`): wolf howl is a distinct
 *  clip from the interact growl, and rooster has no interact clip at all.
 *  `playSpontaneousAnimalSound` falls back to `ANIMAL_SOUND_URLS` for any
 *  kind without an entry here, so cow/sheep/chicken keep sharing their
 *  existing clip between both triggers. */
const SPONTANEOUS_VOCALIZE_SOUND_URLS: Partial<Record<AnimalKind, string[]>> = {
  wolf: ['/sounds/fauna-wolf-howl-1.ogg'],
  rooster: ['/sounds/fauna-rooster-crow-1.ogg'],
}

const SPONTANEOUS_VOCALIZE_VOLUME: Partial<Record<AnimalKind, number>> = {
  wolf: 0.55,
  rooster: 0.3,
}

/** Per-kind override for `playAt`'s distance falloff (plan fauna-009 §1:
 *  "howl słyszalny z większej odległości niż standardowa wokalizacja") —
 *  extends the existing spatial-audio falloff (`createWorldAudio.ts`'s
 *  `distanceGain`/`DISTANCE_MAX`) instead of a second playback path.
 *  `undefined` for any kind not listed here uses `playAt`'s own default. */
const SPONTANEOUS_VOCALIZE_MAX_DISTANCE: Partial<Record<AnimalKind, number>> = {
  wolf: 60,
}

/** Plays a spontaneous vocalization for `kind` unless the concurrent-play
 *  cap is already saturated. Separate from `playAnimalSound()`'s direct
 *  `[E]`-interact path (always plays — an explicit player action should
 *  never be silently dropped for spam control) and used for both the
 *  per-animal spontaneous roll and other world-triggered vocalizations
 *  (e.g. a chicken's egg-laid cluck) so neither duplicates the other's
 *  throttling. `nowSec` is injectable for tests; defaults to wall-clock. */
export function playSpontaneousAnimalSound(
  kind: AnimalKind,
  playAt: PlayAt,
  position: WorldSoundPosition,
  nowSec: number = performance.now() / 1000,
): void {
  recentSpontaneousPlaysAt = recentSpontaneousPlaysAt.filter((t) => nowSec - t < CONCURRENT_WINDOW_SEC)
  if (recentSpontaneousPlaysAt.length >= MAX_CONCURRENT_SPONTANEOUS) return
  recentSpontaneousPlaysAt.push(nowSec)
  const overrideUrls = SPONTANEOUS_VOCALIZE_SOUND_URLS[kind]
  if (!overrideUrls) {
    playAnimalSound(kind, playAt, position)
    return
  }
  const url = overrideUrls[Math.floor(Math.random() * overrideUrls.length)]
  if (!url) return
  playAt(
    url,
    position,
    SPONTANEOUS_VOCALIZE_VOLUME[kind] ?? DEFAULT_ANIMAL_SFX_VOLUME,
    undefined,
    SPONTANEOUS_VOCALIZE_MAX_DISTANCE[kind],
  )
}
