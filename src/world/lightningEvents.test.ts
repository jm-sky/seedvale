import { describe, expect, it } from 'vitest'
import type { WeatherState } from './weather'
import {
  createLightningRuntime,
  lightningEventsForCycle,
  THUNDER_SPEED_OF_SOUND_M_PER_S,
} from './lightningEvents'
import { WEATHER_CYCLE_DAYS } from './weather'

function stormWeather(overrides: Partial<WeatherState> = {}): WeatherState {
  return {
    type: 'storm',
    intensity: 0.8,
    temperature: 18,
    startedAt: 0,
    endsAt: WEATHER_CYCLE_DAYS,
    ...overrides,
  }
}

const liveTick = {
  dt: 0.016,
  dayLengthSec: 480,
  present: true,
} as const

describe('lightningEventsForCycle', () => {
  it('is empty unless weather is storm', () => {
    expect(lightningEventsForCycle(1, { ...stormWeather(), type: 'rain' })).toEqual([])
  })

  it('is deterministic for the same seed and cycle', () => {
    const weather = stormWeather()
    expect(lightningEventsForCycle(42, weather)).toEqual(lightningEventsForCycle(42, weather))
  })

  it('keeps a unique eventId per slot and does not exceed the bounded slot count', () => {
    const events = lightningEventsForCycle(3, stormWeather({ intensity: 1 }))
    const ids = new Set(events.map((e) => e.eventId))
    expect(ids.size).toBe(events.length)
    expect(events.length).toBeGreaterThan(0)
    expect(events.length).toBeLessThanOrEqual(6)
  })

  it('places flash times inside the weather cycle', () => {
    const weather = stormWeather({ intensity: 1 })
    for (const event of lightningEventsForCycle(11, weather)) {
      expect(event.flashAtDays).toBeGreaterThanOrEqual(weather.startedAt)
      expect(event.flashAtDays).toBeLessThan(weather.endsAt)
      expect(event.simulatedDistanceM).toBeGreaterThanOrEqual(90)
      expect(event.simulatedDistanceM).toBeLessThanOrEqual(1500)
    }
  })

  it('grows thunder delay with simulated distance', () => {
    const events = lightningEventsForCycle(9, stormWeather({ intensity: 1 }))
    expect(events.length).toBeGreaterThan(1)
    const sorted = [...events].sort((a, b) => a.simulatedDistanceM - b.simulatedDistanceM)
    expect(sorted[0]!.thunderDelaySec).toBeCloseTo(
      sorted[0]!.simulatedDistanceM / THUNDER_SPEED_OF_SOUND_M_PER_S,
      10,
    )
    expect(sorted.at(-1)!.thunderDelaySec).toBeGreaterThan(sorted[0]!.thunderDelaySec)
  })
})

describe('createLightningRuntime', () => {
  it('emits flash at the crossing, then thunder and scare after the delay', () => {
    const runtime = createLightningRuntime()
    const weather = stormWeather({ intensity: 1 })
    const events = lightningEventsForCycle(4, weather)
    expect(events.length).toBeGreaterThan(0)
    const first = events[0]!
    runtime.tick({
      seed: 4,
      elapsedDays: first.flashAtDays - 0.0001,
      weather,
      ...liveTick,
    })
    const atFlash = runtime.tick({
      seed: 4,
      elapsedDays: first.flashAtDays + 1e-6,
      weather,
      ...liveTick,
    })
    expect(atFlash.flashAmount).toBeGreaterThan(0)
    expect(atFlash.thunder).toBeNull()
    expect(atFlash.scareStimulus).toBeNull()
    const afterDelay = runtime.tick({
      seed: 4,
      elapsedDays: first.flashAtDays + 1e-5,
      weather,
      dt: first.thunderDelaySec,
      dayLengthSec: 480,
      present: true,
    })
    expect(afterDelay.thunder?.eventId).toBe(first.eventId)
    expect(afterDelay.scareStimulus?.eventId).toBe(first.eventId)
    expect(afterDelay.scareStimulus?.simulatedDistanceM).toBe(first.simulatedDistanceM)
    const afterHold = runtime.tick({
      seed: 4,
      elapsedDays: first.flashAtDays + 0.02,
      weather,
      dt: 0.5,
      dayLengthSec: 480,
      present: true,
    })
    expect(afterHold.scareStimulus).toBeNull()
    expect(afterHold.flashAmount).toBe(0)
  })

  it('plays thunder only after the simulated delay', () => {
    const runtime = createLightningRuntime()
    const weather = stormWeather({ intensity: 1 })
    const events = lightningEventsForCycle(8, weather)
    const first = events[0]!
    runtime.tick({
      seed: 8,
      elapsedDays: first.flashAtDays - 1e-6,
      weather,
      ...liveTick,
    })
    const flash = runtime.tick({
      seed: 8,
      elapsedDays: first.flashAtDays + 1e-6,
      weather,
      ...liveTick,
    })
    expect(flash.thunder).toBeNull()
    const beforeDelay = runtime.tick({
      seed: 8,
      elapsedDays: first.flashAtDays + 1e-5,
      weather,
      dt: first.thunderDelaySec * 0.4,
      dayLengthSec: 480,
      present: true,
    })
    expect(beforeDelay.thunder).toBeNull()
    expect(beforeDelay.scareStimulus).toBeNull()
    const afterDelay = runtime.tick({
      seed: 8,
      elapsedDays: first.flashAtDays + 1e-5,
      weather,
      dt: first.thunderDelaySec,
      dayLengthSec: 480,
      present: true,
    })
    expect(afterDelay.thunder?.eventId).toBe(first.eventId)
    expect(afterDelay.scareStimulus?.eventId).toBe(first.eventId)
  })

  it('skips presentation for time-skip crossings of the same event', () => {
    const runtime = createLightningRuntime()
    const weather = stormWeather({ intensity: 1 })
    const first = lightningEventsForCycle(8, weather)[0]!
    runtime.tick({
      seed: 8,
      elapsedDays: first.flashAtDays - 1e-6,
      weather,
      dt: 0.016,
      dayLengthSec: 480,
      present: false,
    })
    const skipped = runtime.tick({
      seed: 8,
      elapsedDays: first.flashAtDays + 0.05,
      weather,
      dt: 0.016,
      dayLengthSec: 480,
      present: false,
    })
    expect(skipped.flashAmount).toBe(0)
    expect(skipped.thunder).toBeNull()
    expect(skipped.scareStimulus).toBeNull()
  })
})
