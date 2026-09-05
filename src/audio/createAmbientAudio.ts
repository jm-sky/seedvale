import { MathUtils } from 'three'
import type { WeatherState, WeatherType } from '../world/weather'
import type { AmbientSamplers } from './ambientWeights'
import type { AudioLoopHandle, WorldAudio } from './createWorldAudio'
import { lakeProximityAt } from '../terrain/waterBodyKind'
import { type AmbientEventDefinition, createAmbientEventRuntime } from './ambientEvents'
import { ambientWeightsAt } from './ambientWeights'
import { frogsTimeFactor } from './frogAmbience'
import { nightPhase } from './nightPhase'

/** Night ambience (crickets) — active through the night, crossfaded out over
 *  a tunable window instead of a hard on/off switch at a fixed clock time.
 *  Source/license: public/sounds/README.md. */
const NIGHT_LOOP_URL = '/sounds/ambient-night-crickets-loop-01.ogg'
const NIGHT_MAX_VOLUME = 0.35

/** Day ambience (birds/wind) + coastal surf — area-dependent layers, crossfaded
 *  by `ambientWeightsAt`'s forest/ocean/mountain weights. Wind/meadow/soft-waves/
 *  birds load lazily the first time their gain is non-zero. */
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

/** Bird ambient (plan world-006 §1) — one sample for now (`-2`/`-3` staged
 *  for future random-variant crossfade, out of scope here per the plan).
 *  Stronger in forest than in open meadow (plan §4), silent over
 *  ocean/mountain (both already excluded from `forest`/meadow weights by
 *  `ambientWeightsAt`). Source/license: public/sounds/README.md. */
const BIRDS_LOOP_URL = '/sounds/meadowsinging-birds-1.ogg'
const BIRDS_FOREST_MAX_VOLUME = 0.3
const BIRDS_MEADOW_MAX_VOLUME = 0.18

/** Fractions of the night's length (dusk → dawn) bounding the cricket
 *  profile's rise / sustained peak / taper phases — tunable per plan §2. */
const CRICKET_RISE_END = 0.15
const CRICKET_PEAK_END = 0.65
const CRICKET_TAPER_END = 0.85

/** Cricket time-of-day profile (plan world-006 §2): silent by day, rising at
 *  dusk, active through most of the night, then a smooth taper into a quiet
 *  stretch before dawn — rather than the flat "full volume for the whole
 *  night" `1 - dayFactor` gave. */
export function cricketsTimeFactor(timeOfDay: number): number {
  const phase = nightPhase(timeOfDay)
  if (phase === null) return 0
  if (phase < CRICKET_RISE_END) return MathUtils.smoothstep(phase, 0, CRICKET_RISE_END)
  if (phase < CRICKET_PEAK_END) return 1
  if (phase < CRICKET_TAPER_END) return 1 - MathUtils.smoothstep(phase, CRICKET_PEAK_END, CRICKET_TAPER_END)
  return 0
}

/** Weather → ambient multiplier for birds/crickets/frogs (plan world-006 §3,
 *  frogs added by plan world-016) — independent of the time-of-day/biome
 *  factors so each stays separately tunable (plan §5). Rain scales
 *  continuously with `weather.intensity` instead of a hard light/heavy
 *  split, so a strengthening storm reads as one continuous change rather
 *  than a step. Not wired to `fog` in the plan's table — treated close to
 *  `cloudy` (thick fog muffles birds a little more than plain cloud cover,
 *  crickets/frogs barely care). */
export type WeatherAmbientFactor = { birds: number, crickets: number, frogs: number }

const WEATHER_AMBIENT_FACTOR: Record<Exclude<WeatherType, 'rain'>, WeatherAmbientFactor> = {
  clear: { birds: 1, crickets: 1, frogs: 1 },
  cloudy: { birds: 0.7, crickets: 0.85, frogs: 0.9 },
  fog: { birds: 0.5, crickets: 0.8, frogs: 0.85 },
  snow: { birds: 0, crickets: 0, frogs: 0 },
}

export function weatherAmbientFactor(weather: WeatherState): WeatherAmbientFactor {
  if (weather.type !== 'rain') return WEATHER_AMBIENT_FACTOR[weather.type]
  return {
    birds: 1 - weather.intensity * 1.8,
    crickets: 1 - weather.intensity,
    frogs: 1 - weather.intensity * 0.6,
  }
}

/** Owl hoot — random forest-at-night one-shot, not a loop. Owl isn't a fauna
 *  species (no `AnimalAgent`), so `animalSounds.ts`'s per-entity spontaneous-
 *  vocalization cooldown doesn't apply; this is the ambient module's own
 *  equivalent, a single global timer since there's no entity behind it.
 *  Source/license: public/sounds/README.md. */
const OWL_SOUND_URL = '/sounds/ambient-owl-at-night.ogg'
const OWL_SFX_VOLUME = 1
const OWL_COOLDOWN_MIN_SEC = 5 * 60
const OWL_COOLDOWN_MAX_SEC = 12 * 60
/** Chance per recheck once the cooldown has elapsed. */
const OWL_CHANCE = 0.15
/** Once the cooldown clears without a successful roll, how soon to retry —
 *  same shape as `animalSounds.ts`'s `VOCALIZE_RECHECK_SEC`. */
const OWL_RECHECK_SEC = 20
const OWL_MIN_FOREST_WEIGHT = 0.3
/** Random offset radius so the hoot reads as "somewhere in the forest"
 *  rather than pinned to the player — kept inside `playAt`'s `maxDistance`
 *  (28, see `createWorldAudio.ts`) so it's still audible. */
const OWL_OFFSET_MIN_M = 8
const OWL_OFFSET_MAX_M = 22

/** Owl migrated onto the shared `ambientEvents.ts` runtime (plan world-016)
 *  — same tuning/semantics as the previous dedicated timer, just expressed
 *  as data + an eligibility predicate instead of its own cooldown state. */
const OWL_EVENT: AmbientEventDefinition = {
  id: 'owl',
  sounds: [OWL_SOUND_URL],
  volume: OWL_SFX_VOLUME,
  offset: { min: OWL_OFFSET_MIN_M, max: OWL_OFFSET_MAX_M },
  cooldown: { min: OWL_COOLDOWN_MIN_SEC, max: OWL_COOLDOWN_MAX_SEC },
  recheckSec: OWL_RECHECK_SEC,
  chance: OWL_CHANCE,
  isEligible: (ctx) => ctx.nightPhase !== null && ctx.forestWeight >= OWL_MIN_FOREST_WEIGHT,
}

/** Lake frogs — local environmental ambience (plan world-016 §5/§6), not a
 *  fauna species: gain is driven by `lakeProximityAt()` × the frog day/night
 *  profile × weather, using the same lazy single-loop pattern as
 *  coast/wind/meadow/birds rather than positional per-lake sources.
 *  Source/license: public/sounds/README.md. */
const FROG_LOOP_URL = '/sounds/ambient-lake-frogs-loop-01.ogg'
const FROG_MAX_VOLUME = 0.32

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
   *  `dayFactor` (0 full night .. 1 full day) drives the day layers'
   *  (forest/meadow/birds) day/night crossfade; `timeOfDay` (`dayNight.ts`,
   *  0-1) drives the crickets' dusk/night/pre-dawn profile, which needs
   *  finer resolution than `dayFactor` gives across the night half;
   *  `weather` scales birds/crickets/frogs (plan world-006 §3, world-016);
   *  `playerX`/`playerZ` drive the area (forest/coast) crossfade and the
   *  lake-frog proximity sampler. */
  update: (
    dt: number,
    dayFactor: number,
    timeOfDay: number,
    weather: WeatherState,
    playerX: number,
    playerZ: number,
  ) => void
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
  let birdsLoop: AudioLoopHandle | null = null
  let frogLoop: AudioLoopHandle | null = null
  let sampleAccum = 0
  // `lastForestWeight` is refreshed only inside the throttled `sampleAccum`
  // block below (same staleness the area loops already tolerate) and feeds
  // the owl event's eligibility check every frame via `ambientEvents`.
  let lastForestWeight = 0
  const ambientEvents = createAmbientEventRuntime(worldAudio, [OWL_EVENT])

  function update(
    dt: number,
    dayFactor: number,
    timeOfDay: number,
    weather: WeatherState,
    playerX: number,
    playerZ: number,
  ): void {
    const weatherFactor = weatherAmbientFactor(weather)
    if (!nightLoop && dayFactor < NIGHT_LOOP_TRIGGER_DAY_FACTOR) {
      nightLoop = worldAudio.createLoop(NIGHT_LOOP_URL)
    }
    nightLoop?.setTargetGain(cricketsTimeFactor(timeOfDay) * weatherFactor.crickets * NIGHT_MAX_VOLUME)

    ambientEvents.update(dt, {
      nightPhase: nightPhase(timeOfDay),
      forestWeight: lastForestWeight,
      playerX,
      playerZ,
    })

    sampleAccum += dt
    if (sampleAccum < SAMPLE_INTERVAL) return
    sampleAccum = 0
    const w = ambientWeightsAt(playerX, playerZ, samplers)
    lastForestWeight = w.forest
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
    if (!birdsLoop && (w.forest > 0 || meadow > 0)) {
      birdsLoop = worldAudio.createLoop(BIRDS_LOOP_URL)
    }
    birdsLoop?.setTargetGain(
      (w.forest * BIRDS_FOREST_MAX_VOLUME + meadow * BIRDS_MEADOW_MAX_VOLUME) * dayFactor * weatherFactor.birds,
    )

    const lakeProximity = lakeProximityAt(playerX, playerZ, samplers)
    if (!frogLoop && lakeProximity > 0) {
      frogLoop = worldAudio.createLoop(FROG_LOOP_URL)
    }
    frogLoop?.setTargetGain(lakeProximity * frogsTimeFactor(timeOfDay) * weatherFactor.frogs * FROG_MAX_VOLUME)
  }

  function dispose(): void {
    nightLoop?.dispose()
    forestLoop.dispose()
    coastLoop?.dispose()
    coastSoftLoop?.dispose()
    windLoop?.dispose()
    meadowLoop?.dispose()
    birdsLoop?.dispose()
    frogLoop?.dispose()
  }

  return { update, dispose }
}
