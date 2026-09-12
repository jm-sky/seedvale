import { describe, expect, it, vi } from 'vitest'
import type { LightningThunderCue } from '../world/lightningEvents'
import type { WeatherState } from '../world/weather'
import type { AudioLoopHandle, WorldAudio } from './createWorldAudio'
import {
  createWeatherAudio,
  rainGainFor,
  stormWindGain,
  THUNDER_SOUND_URLS,
  thunderClipFor,
  thunderSoundUrl,
  thunderVolume,
} from './weatherSounds'

function weather(type: WeatherState['type'], intensity = 0.8): WeatherState {
  return { type, intensity, temperature: 12, startedAt: 0, endsAt: 0.3 }
}

function cue(simulatedDistanceM: number, strength = 1): LightningThunderCue {
  return { eventId: 'e', strength, simulatedDistanceM }
}

describe('weather audio gains', () => {
  it('plays rain for rain and storm, and storm wind only during storm', () => {
    expect(rainGainFor(weather('rain'), false)).toBeGreaterThan(0)
    expect(rainGainFor(weather('storm'), false)).toBeGreaterThan(rainGainFor(weather('rain'), false))
    expect(rainGainFor(weather('snow'), false)).toBe(0)
    expect(stormWindGain(weather('storm'), false)).toBeGreaterThan(0)
    expect(stormWindGain(weather('rain'), false)).toBe(0)
  })

  it('mutes rain/wind in a cave interior', () => {
    expect(rainGainFor(weather('storm'), true)).toBe(0)
    expect(stormWindGain(weather('storm'), true)).toBe(0)
  })

  it('picks thunder clips by simulated distance', () => {
    expect(thunderClipFor(120)).toBe('veryClose')
    expect(thunderClipFor(220)).toBe('veryClose')
    expect(thunderClipFor(500)).toBe('mid')
    expect(thunderClipFor(850)).toBe('mid')
    expect(thunderClipFor(1200)).toBe('distant')
    expect(thunderSoundUrl(120)).toBe(THUNDER_SOUND_URLS.veryClose)
    expect(thunderSoundUrl(500)).toBe(THUNDER_SOUND_URLS.mid)
    expect(thunderSoundUrl(1200)).toBe(THUNDER_SOUND_URLS.distant)
  })

  it('attenuates thunder in a cave and by clip distance', () => {
    const veryClose = cue(120)
    const mid = cue(500)
    const distant = cue(1200)
    expect(thunderVolume(veryClose, false)).toBeGreaterThan(thunderVolume(mid, false))
    expect(thunderVolume(mid, false)).toBeGreaterThan(thunderVolume(distant, false))
    expect(thunderVolume(veryClose, true)).toBeLessThan(thunderVolume(veryClose, false))
  })
})

describe('createWeatherAudio', () => {
  it('creates rain then storm-wind loops and plays each thunder event once', () => {
    const rainHandle: AudioLoopHandle = { setTargetGain: vi.fn(), dispose: vi.fn() }
    const windHandle: AudioLoopHandle = { setTargetGain: vi.fn(), dispose: vi.fn() }
    const playOnce = vi.fn()
    let loops = 0
    const worldAudio = {
      createLoop: vi.fn(() => {
        loops += 1
        return loops === 1 ? rainHandle : windHandle
      }),
      playOnce,
    } as unknown as WorldAudio
    const audio = createWeatherAudio(worldAudio)
    audio.update(weather('rain', 0.7), false)
    expect(worldAudio.createLoop).toHaveBeenCalledTimes(1)
    audio.update(weather('storm', 0.9), false)
    expect(worldAudio.createLoop).toHaveBeenCalledTimes(2)
    audio.update(weather('storm', 0.9), false, {
      eventId: 'lightning:1:0:0',
      strength: 0.8,
      simulatedDistanceM: 500,
    })
    expect(playOnce).toHaveBeenCalledTimes(1)
    expect(playOnce.mock.calls[0]![0]).toBe(THUNDER_SOUND_URLS.mid)
    audio.update(weather('storm', 0.9), false, {
      eventId: 'lightning:1:0:0',
      strength: 0.8,
      simulatedDistanceM: 500,
    })
    expect(playOnce).toHaveBeenCalledTimes(1)
    audio.dispose()
    expect(rainHandle.dispose).toHaveBeenCalledTimes(1)
    expect(windHandle.dispose).toHaveBeenCalledTimes(1)
  })
})
