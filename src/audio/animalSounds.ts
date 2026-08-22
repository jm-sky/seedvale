/** Animal one-shots on `[E]` interact. Sources/licenses: public/sounds/README.md. */

import type { AnimalKind } from '../fauna/AnimalAgent'
import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

export const ANIMAL_SOUND_URLS: Partial<Record<AnimalKind, string>> = {
  chicken: '/sounds/animal-chicken-01.ogg',
  cow: '/sounds/animal-cow-01.ogg',
  wolf: '/sounds/animal-wolf-01.ogg',
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
  const url = ANIMAL_SOUND_URLS[kind]
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
