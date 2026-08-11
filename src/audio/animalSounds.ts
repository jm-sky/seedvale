/** Animal one-shots on `[E]` interact. Sources/licenses: public/sounds/README.md. */

import type { AnimalKind } from '../fauna/AnimalAgent'

export const ANIMAL_SOUND_URLS: Partial<Record<AnimalKind, string>> = {
  chicken: '/sounds/animal-chicken-01.wav',
  cow: '/sounds/animal-cow-01.wav',
  wolf: '/sounds/animal-wolf-01.wav',
}

/** Quiet enough under dialogue/ambient; chicken bed is long so keep it softer. */
const ANIMAL_SFX_VOLUME: Partial<Record<AnimalKind, number>> = {
  chicken: 0.28,
  cow: 0.4,
  wolf: 0.4,
}

const DEFAULT_ANIMAL_SFX_VOLUME = 0.35

type PlayOnce = (url: string, volume?: number) => void

/** Plays the species clip when one exists — no-op for kinds without a sound yet. */
export function playAnimalSound(kind: AnimalKind, playOnce: PlayOnce): void {
  const url = ANIMAL_SOUND_URLS[kind]
  if (!url) return
  playOnce(url, ANIMAL_SFX_VOLUME[kind] ?? DEFAULT_ANIMAL_SFX_VOLUME)
}
