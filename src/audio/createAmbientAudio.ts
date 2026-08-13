import type { AmbientSamplers } from './ambientWeights'
import type { AudioLoopHandle, WorldAudio } from './createWorldAudio'
import { ambientWeightsAt } from './ambientWeights'

/** Night ambience (crickets), audible through full night and crossfaded out across
 *  dawn/dusk in step with dayNight's dayFactor (0 = full night, 1 = full day) — no
 *  hard on/off switch at a fixed clock time. Source/license: public/sounds/README.md. */
const NIGHT_LOOP_URL = '/sounds/ambient-night-crickets-loop-01.ogg'
const NIGHT_MAX_VOLUME = 0.35

/** Day ambience (birds/wind) + coastal surf — area-dependent layers, crossfaded
 *  by `ambientWeightsAt`'s forest/ocean/mountain weights. Wind/meadow/soft-waves
 *  load lazily the first time their gain is non-zero. */
const FOREST_LOOP_URL = '/sounds/ambient-forest-loop-01.ogg'
const COAST_LOOP_URL = '/sounds/ambient-coast-seagulls-waves-01.ogg'
const COAST_SOFT_LOOP_URL = '/sounds/ambient-waves-soft-01.ogg'
const WIND_LOOP_URL = '/sounds/ambient-wind-loop-01.ogg'
const MEADOW_LOOP_URL = '/sounds/ambient-meadow-loop-01.ogg'
const FOREST_MAX_VOLUME = 0.3
const COAST_MAX_VOLUME = 0.4
const COAST_SOFT_MAX_VOLUME = 0.28
const WIND_MAX_VOLUME = 0.32
const MEADOW_MAX_VOLUME = 0.28

/** Terrain samplers are cheap but not free (a few `smoothstep`s) — resample
 *  the player's area weights on a throttle instead of every frame; gain
 *  still lerps smoothly every frame via `WorldAudio.update()`. */
const SAMPLE_INTERVAL = 0.25

/** `dayFactor` threshold below which the night loop is first created — a bit
 *  above the point its gain actually becomes audible (`1 - dayFactor`), so
 *  the buffer has a head start loading before dusk needs it. */
const NIGHT_LOOP_TRIGGER_DAY_FACTOR = 0.95

export type AmbientAudio = {
  /** Call once per frame. `dt` throttles the area-weight resample;
   *  `dayFactor` (0 full night .. 1 full day) drives the night/day crossfade;
   *  `playerX`/`playerZ` drive the area (forest/coast) crossfade. */
  update: (dt: number, dayFactor: number, playerX: number, playerZ: number) => void
  dispose: () => void
}

export function createAmbientAudio(worldAudio: WorldAudio, samplers: AmbientSamplers): AmbientAudio {
  // Forest ambience is the common case near any settlement, so it loads
  // eagerly like before. Night/coast are lazily created on first actual need
  // — a fresh game that never reaches dusk or the coast never pays for their
  // ~6.6 MB combined download at all (perf review AS1).
  const forestLoop = worldAudio.createLoop(FOREST_LOOP_URL)
  let nightLoop: AudioLoopHandle | null = null
  let coastLoop: AudioLoopHandle | null = null
  let coastSoftLoop: AudioLoopHandle | null = null
  let windLoop: AudioLoopHandle | null = null
  let meadowLoop: AudioLoopHandle | null = null
  let sampleAccum = 0

  function update(dt: number, dayFactor: number, playerX: number, playerZ: number): void {
    if (!nightLoop && dayFactor < NIGHT_LOOP_TRIGGER_DAY_FACTOR) {
      nightLoop = worldAudio.createLoop(NIGHT_LOOP_URL)
    }
    nightLoop?.setTargetGain((1 - dayFactor) * NIGHT_MAX_VOLUME)

    sampleAccum += dt
    if (sampleAccum < SAMPLE_INTERVAL) return
    sampleAccum = 0
    const w = ambientWeightsAt(playerX, playerZ, samplers)
    const meadow = (1 - w.ocean) * (1 - w.mountain) * (1 - w.forest)
    // Quieter/silent at night — birds are asleep.
    forestLoop.setTargetGain(w.forest * dayFactor * FOREST_MAX_VOLUME)
    if (!coastLoop && w.ocean > 0) {
      coastLoop = worldAudio.createLoop(COAST_LOOP_URL)
    }
    coastLoop?.setTargetGain(w.ocean * COAST_MAX_VOLUME)
    if (!coastSoftLoop && w.ocean > 0) {
      coastSoftLoop = worldAudio.createLoop(COAST_SOFT_LOOP_URL)
    }
    coastSoftLoop?.setTargetGain(w.ocean * COAST_SOFT_MAX_VOLUME)
    if (!windLoop && w.mountain > 0) {
      windLoop = worldAudio.createLoop(WIND_LOOP_URL)
    }
    windLoop?.setTargetGain(w.mountain * WIND_MAX_VOLUME)
    if (!meadowLoop && meadow > 0) {
      meadowLoop = worldAudio.createLoop(MEADOW_LOOP_URL)
    }
    meadowLoop?.setTargetGain(meadow * dayFactor * MEADOW_MAX_VOLUME)
  }

  function dispose(): void {
    nightLoop?.dispose()
    forestLoop.dispose()
    coastLoop?.dispose()
    coastSoftLoop?.dispose()
    windLoop?.dispose()
    meadowLoop?.dispose()
  }

  return { update, dispose }
}
