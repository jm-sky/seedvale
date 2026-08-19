import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO_VOLUMES,
  loadAudioVolumes,
  normalizeAudioVolumes,
  saveAudioVolumes,
} from './audioSettings'

function installMemoryLocalStorage(): void {
  const store = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memory,
  })
}

beforeEach(() => {
  installMemoryLocalStorage()
})

afterEach(() => {
  localStorage.clear()
})

describe('normalizeAudioVolumes', () => {
  it('defaults missing / invalid payloads to 1', () => {
    expect(normalizeAudioVolumes(null)).toEqual(DEFAULT_AUDIO_VOLUMES)
    expect(normalizeAudioVolumes(undefined)).toEqual(DEFAULT_AUDIO_VOLUMES)
    expect(normalizeAudioVolumes('loud')).toEqual(DEFAULT_AUDIO_VOLUMES)
    expect(normalizeAudioVolumes({ master: '0.2' })).toEqual(DEFAULT_AUDIO_VOLUMES)
  })

  it('fills omitted fields with 1', () => {
    expect(normalizeAudioVolumes({ ambient: 0.4 })).toEqual({
      master: 1,
      ambient: 0.4,
      sfx: 1,
    })
  })

  it('clamps out-of-range numbers and treats NaN as 1', () => {
    expect(normalizeAudioVolumes({ master: -0.2, ambient: 1.7, sfx: Number.NaN })).toEqual({
      master: 0,
      ambient: 1,
      sfx: 1,
    })
  })
})

describe('audioSettings localStorage', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadAudioVolumes()).toEqual(DEFAULT_AUDIO_VOLUMES)
  })

  it('round-trips saved volumes', () => {
    saveAudioVolumes({ master: 0.5, ambient: 0.25, sfx: 0.8 })
    expect(JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY)!)).toEqual({
      master: 0.5,
      ambient: 0.25,
      sfx: 0.8,
    })
    expect(loadAudioVolumes()).toEqual({ master: 0.5, ambient: 0.25, sfx: 0.8 })
  })

  it('clamps on save and ignores a corrupt stored blob', () => {
    saveAudioVolumes({ master: 2, ambient: -1, sfx: 0.3 })
    expect(loadAudioVolumes()).toEqual({ master: 1, ambient: 0, sfx: 0.3 })

    localStorage.setItem(AUDIO_STORAGE_KEY, '{not-json')
    expect(loadAudioVolumes()).toEqual(DEFAULT_AUDIO_VOLUMES)
  })

  it('writing defaults over a saved mix round-trips back to 1', () => {
    saveAudioVolumes({ master: 0.2, ambient: 0.4, sfx: 0.6 })
    saveAudioVolumes(DEFAULT_AUDIO_VOLUMES)
    expect(loadAudioVolumes()).toEqual(DEFAULT_AUDIO_VOLUMES)
  })
})
