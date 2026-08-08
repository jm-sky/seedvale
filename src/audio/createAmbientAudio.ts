import type { AmbientSamplers } from './ambientWeights'
import type { WorldAudio } from './createWorldAudio'
import { ambientWeightsAt } from './ambientWeights'

/** Night ambience (crickets), audible through full night and crossfaded out across
 *  dawn/dusk in step with dayNight's dayFactor (0 = full night, 1 = full day) — no
 *  hard on/off switch at a fixed clock time. Source/license: public/sounds/README.md. */
const NIGHT_LOOP_URL = '/sounds/ambient-night-crickets-loop-01.wav'
const NIGHT_MAX_VOLUME = 0.35

/** Day ambience (birds/wind) + coastal surf — area-dependent layers, crossfaded
 *  by `ambientWeightsAt`'s forest/ocean weights. Already in `public/sounds/`
 *  (see README.md), previously unused. No mountain-wind asset yet — that
 *  layer is intentionally omitted rather than silently 404ing every load. */
const FOREST_LOOP_URL = '/sounds/ambient-forest-loop-01.wav'
const COAST_LOOP_URL = '/sounds/ambient-coast-seagulls-waves-01.wav'
const FOREST_MAX_VOLUME = 0.3
const COAST_MAX_VOLUME = 0.4

/** Terrain samplers are cheap but not free (a few `smoothstep`s) — resample
 *  the player's area weights on a throttle instead of every frame; gain
 *  still lerps smoothly every frame via `WorldAudio.update()`. */
const SAMPLE_INTERVAL = 0.25

export type AmbientAudio = {
  /** Call once per frame. `dt` throttles the area-weight resample;
   *  `dayFactor` (0 full night .. 1 full day) drives the night/day crossfade;
   *  `playerX`/`playerZ` drive the area (forest/coast) crossfade. */
  update: (dt: number, dayFactor: number, playerX: number, playerZ: number) => void
  dispose: () => void
}

export function createAmbientAudio(worldAudio: WorldAudio, samplers: AmbientSamplers): AmbientAudio {
  const nightLoop = worldAudio.createLoop(NIGHT_LOOP_URL)
  const forestLoop = worldAudio.createLoop(FOREST_LOOP_URL)
  const coastLoop = worldAudio.createLoop(COAST_LOOP_URL)
  let sampleAccum = 0

  function update(dt: number, dayFactor: number, playerX: number, playerZ: number): void {
    nightLoop.setTargetGain((1 - dayFactor) * NIGHT_MAX_VOLUME)

    sampleAccum += dt
    if (sampleAccum < SAMPLE_INTERVAL) return
    sampleAccum = 0
    const w = ambientWeightsAt(playerX, playerZ, samplers)
    // Quieter/silent at night — birds are asleep.
    forestLoop.setTargetGain(w.forest * dayFactor * FOREST_MAX_VOLUME)
    coastLoop.setTargetGain(w.ocean * COAST_MAX_VOLUME)
  }

  function dispose(): void {
    nightLoop.dispose()
    forestLoop.dispose()
    coastLoop.dispose()
  }

  return { update, dispose }
}
