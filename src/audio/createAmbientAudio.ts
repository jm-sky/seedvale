import type { WorldAudio } from './createWorldAudio'

/** Night ambience (crickets), audible through full night and crossfaded out across
 *  dawn/dusk in step with dayNight's dayFactor (0 = full night, 1 = full day) — no
 *  hard on/off switch at a fixed clock time. Source/license: public/sounds/README.md. */
const NIGHT_LOOP_URL = '/sounds/ambient-night-crickets-loop-01.wav'
const NIGHT_MAX_VOLUME = 0.35

export type AmbientAudio = {
  /** Call once per frame with dayNight's dayFactor (0 = full night, 1 = full day). */
  update: (dayFactor: number) => void
  dispose: () => void
}

export function createAmbientAudio(worldAudio: WorldAudio): AmbientAudio {
  const nightLoop = worldAudio.createLoop(NIGHT_LOOP_URL)

  function update(dayFactor: number): void {
    nightLoop.setTargetGain((1 - dayFactor) * NIGHT_MAX_VOLUME)
  }

  function dispose(): void {
    nightLoop.dispose()
  }

  return { update, dispose }
}
