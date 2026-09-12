import { WEATHER_CYCLE_DAYS, type WeatherState } from './weather'

/** World-level thunder scare payload — consumed by fauna audio/visuals.
 *  Non-positional: weather is a global cycle, so scare uses simulated
 *  acoustic distance rather than a player-relative strike coordinate. */
export type ThunderScareStimulus = {
  source: 'thunder'
  eventId: string
  strength: number
  simulatedDistanceM: number
}

/** Speed of sound used for thunder delay (m/s). Presentation-only. */
export const THUNDER_SPEED_OF_SOUND_M_PER_S = 343
const MIN_DISTANCE_M = 90
const MAX_DISTANCE_M = 1500
const MAX_SLOTS = 6
const FLASH_DURATION_SEC = 0.18
const SCARE_HOLD_SEC = 0.4
const SLOT_OCCURRENCE_BASE = 0.28
const SLOT_OCCURRENCE_INTENSITY = 0.52

/** Same Wang-style mix as `weather.ts` — kept local so weather stays
 *  allocation-free and this schedule does not import a private helper. */
function hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

/**
 * One deterministic lightning/thunder occurrence inside a weather cycle.
 * Identity is stable for `(seed, cycle, slot)` so audio/visuals/fauna can
 * consume the same event without per-tick `Math.random()`.
 *
 * @domain world
 */
export type LightningEvent = {
  eventId: string
  cycleIndex: number
  slot: number
  /** 0..1 strike intensity. */
  strength: number
  /** Simulated listener-to-strike distance (m) — drives thunder delay. */
  simulatedDistanceM: number
  /** `elapsedDays` when the flash occurs. */
  flashAtDays: number
  /** Real-time seconds after flash until thunder. */
  thunderDelaySec: number
}

/**
 * Bounded lightning schedule for one weather cycle. Empty unless `weather`
 * is an active storm. Pure — same inputs always yield the same events.
 *
 * @domain world
 */
export function lightningEventsForCycle(
  seed: number,
  weather: WeatherState,
): LightningEvent[] {
  if (weather.type !== 'storm') return []
  const cycleIndex = Math.floor(weather.startedAt / WEATHER_CYCLE_DAYS + 1e-9)
  const slotSpan = WEATHER_CYCLE_DAYS / MAX_SLOTS
  const events: LightningEvent[] = []
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const occurRoll = hash01(seed, cycleIndex, 0x71e32 + slot)
    const chance = SLOT_OCCURRENCE_BASE + weather.intensity * SLOT_OCCURRENCE_INTENSITY
    if (occurRoll >= chance) continue
    const strength = 0.35 + hash01(seed, cycleIndex, 0x9e3779b9 + slot) * 0.65
    const simulatedDistanceM = MIN_DISTANCE_M
      + hash01(seed, cycleIndex, 0x517cc1b7 + slot) * (MAX_DISTANCE_M - MIN_DISTANCE_M)
    const flashAtDays = weather.startedAt + (slot + 0.18) * slotSpan
    events.push({
      eventId: `lightning:${seed}:${cycleIndex}:${slot}`,
      cycleIndex,
      slot,
      strength,
      simulatedDistanceM,
      flashAtDays,
      thunderDelaySec: simulatedDistanceM / THUNDER_SPEED_OF_SOUND_M_PER_S,
    })
  }
  return events
}

export type LightningThunderCue = {
  eventId: string
  strength: number
  simulatedDistanceM: number
}

export type LightningPresentation = {
  flashAmount: number
  scareStimulus: ThunderScareStimulus | null
  thunder: LightningThunderCue | null
}

type PendingThunder = {
  event: LightningEvent
  remainingSec: number
}

type ActiveFlash = {
  event: LightningEvent
  ageSec: number
}

function flashEnvelope(ageSec: number, strength: number): number {
  if (ageSec < 0 || ageSec > FLASH_DURATION_SEC) return 0
  const peak = ageSec < 0.045 ? 1 : 1 - (ageSec - 0.045) / (FLASH_DURATION_SEC - 0.045)
  return strength * peak
}

function scareFrom(event: LightningEvent): ThunderScareStimulus {
  return {
    source: 'thunder',
    eventId: event.eventId,
    strength: event.strength,
    simulatedDistanceM: event.simulatedDistanceM,
  }
}

export type LightningRuntimeInput = {
  seed: number
  elapsedDays: number
  weather: WeatherState
  dt: number
  dayLengthSec: number
  /** False during time-skip: consume crossed events without audio/visuals. */
  present: boolean
}

/**
 * Frame-local lightning presentation over the pure cycle schedule.
 * Tracks fired event ids so a flash/thunder/scare is emitted once per event.
 *
 * @domain world
 */
export function createLightningRuntime(): {
  tick: (input: LightningRuntimeInput) => LightningPresentation
} {
  let lastElapsedDays: number | null = null
  const fired = new Set<string>()
  let flash: ActiveFlash | null = null
  const pendingThunder: PendingThunder[] = []
  let scare: { stimulus: ThunderScareStimulus, remainingSec: number } | null = null
  let lastCycleIndex = -1

  function consumeEvent(event: LightningEvent, present: boolean): void {
    if (fired.has(event.eventId)) return
    fired.add(event.eventId)
    if (!present) return
    flash = { event, ageSec: 0 }
    pendingThunder.push({
      event,
      remainingSec: event.thunderDelaySec,
    })
  }

  function tick(input: LightningRuntimeInput): LightningPresentation {
    const cycleIndex = Math.floor(input.elapsedDays / WEATHER_CYCLE_DAYS)
    if (cycleIndex !== lastCycleIndex) {
      fired.clear()
      lastCycleIndex = cycleIndex
    }

    if (input.weather.type !== 'storm') {
      flash = null
      pendingThunder.length = 0
      scare = null
      lastElapsedDays = input.elapsedDays
      return { flashAmount: 0, scareStimulus: null, thunder: null }
    }

    const events = lightningEventsForCycle(input.seed, input.weather)
    const previous = lastElapsedDays
    lastElapsedDays = input.elapsedDays

    const worldDt = previous === null
      ? Number.POSITIVE_INFINITY
      : (input.elapsedDays - previous) * input.dayLengthSec
    const live = input.present && previous !== null && worldDt >= 0 && worldDt < 2.5

    if (previous !== null) {
      const lo = previous
      const hi = input.elapsedDays
      for (const event of events) {
        if (event.flashAtDays > lo && event.flashAtDays <= hi) {
          consumeEvent(event, live)
        }
      }
    }

    let thunder: LightningThunderCue | null = null
    if (flash) {
      flash.ageSec += input.dt
      if (flash.ageSec > FLASH_DURATION_SEC) flash = null
    }
    if (scare) {
      scare.remainingSec -= input.dt
      if (scare.remainingSec <= 0) scare = null
    }
    if (live) {
      for (let i = pendingThunder.length - 1; i >= 0; i--) {
        const pending = pendingThunder[i]!
        pending.remainingSec -= input.dt
        if (pending.remainingSec > 0) continue
        pendingThunder.splice(i, 1)
        if (!thunder) {
          thunder = {
            eventId: pending.event.eventId,
            strength: pending.event.strength,
            simulatedDistanceM: pending.event.simulatedDistanceM,
          }
          scare = {
            stimulus: scareFrom(pending.event),
            remainingSec: SCARE_HOLD_SEC,
          }
        }
      }
    } else {
      pendingThunder.length = 0
    }

    return {
      flashAmount: flash ? flashEnvelope(flash.ageSec, flash.event.strength) : 0,
      scareStimulus: scare?.stimulus ?? null,
      thunder,
    }
  }

  return { tick }
}
