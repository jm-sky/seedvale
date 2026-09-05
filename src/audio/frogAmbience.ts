import { MathUtils } from 'three'
import { nightPhase } from './nightPhase'

/**
 * @domain world
 * @system ambient-audio
 * @role Frog local-ambience day/night tuning curve (plan world-016) — a
 *   separate profile from crickets' (`createAmbientAudio.ts`'s
 *   `cricketsTimeFactor`) even though both derive from the same
 *   `nightPhase()` primitive, since the plan calls for frogs to be
 *   independently tunable.
 */

/** Fractions of the night's length (dusk → dawn) bounding the frog
 *  profile's rise / sustained peak / taper phases — tunable. */
const FROG_RISE_END = 0.12
const FROG_PEAK_END = 0.7
const FROG_TAPER_END = 0.95

/** Silent by day, rising at dusk, active through most of the night, then a
 *  smooth taper into a quiet pre-dawn stretch. */
export function frogsTimeFactor(timeOfDay: number): number {
  const phase = nightPhase(timeOfDay)
  if (phase === null) return 0
  if (phase < FROG_RISE_END) return MathUtils.smoothstep(phase, 0, FROG_RISE_END)
  if (phase < FROG_PEAK_END) return 1
  if (phase < FROG_TAPER_END) return 1 - MathUtils.smoothstep(phase, FROG_PEAK_END, FROG_TAPER_END)
  return 0
}
