/** Animal one-shots on `[E]` interact. Sources/licenses: public/sounds/README.md. */

import type { AnimalKind } from '../fauna/AnimalAgent'
import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

export const ANIMAL_SOUND_URLS: Partial<Record<AnimalKind, string[]>> = {
  chicken: ['/sounds/animal-chicken-01.ogg', '/sounds/animal-chicken-02.ogg'],
  cow: ['/sounds/animal-cow-01.ogg', '/sounds/animal-cow-02.ogg'],
  wolf: ['/sounds/animal-wolf-01.ogg'],
  horse: ['/sounds/animal-horse-01.ogg'],
  sheep: ['/sounds/animal-sheep-01.ogg'],
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
): { cooldownSec: number, fire: boolean } {
  const config = SPONTANEOUS_VOCALIZE_CONFIG[kind]
  if (!config) return { cooldownSec, fire: false }
  const remaining = cooldownSec - dt
  if (remaining > 0) return { cooldownSec: remaining, fire: false }
  if (rng() < config.chance) {
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
  playAnimalSound(kind, playAt, position)
}
