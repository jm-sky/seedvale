import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BrowserState } from '../state'
import {
  applyLayoutPersist,
  clearLayoutPersist,
  loadLayoutPersist,
  saveLayoutPersist,
} from './layoutPersist'

const store = new Map<string, string>()

function installLocalStorageMock(): void {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
  })
}

function stubState(overrides: Partial<BrowserState> = {}): BrowserState {
  return {
    layout: 'quad',
    activeView: 0,
    splitX: 0.5,
    splitY: 0.5,
    ...overrides,
  } as BrowserState
}

describe('layoutPersist', () => {
  beforeEach(() => {
    installLocalStorageMock()
    clearLayoutPersist()
  })
  afterEach(() => {
    clearLayoutPersist()
  })

  it('round-trips layout splits through localStorage', () => {
    saveLayoutPersist({
      layout: 'single',
      activeView: 3,
      splitX: 0.35,
      splitY: 0.65,
    })
    expect(loadLayoutPersist()).toEqual({
      version: 1,
      layout: 'single',
      activeView: 3,
      splitX: 0.35,
      splitY: 0.65,
    })
  })

  it('applies stored layout onto browser state', () => {
    saveLayoutPersist({
      layout: 'single',
      activeView: 2,
      splitX: 0.4,
      splitY: 0.6,
    })
    const state = stubState()
    expect(applyLayoutPersist(state)).toBe(true)
    expect(state.layout).toBe('single')
    expect(state.activeView).toBe(2)
    expect(state.splitX).toBe(0.4)
    expect(state.splitY).toBe(0.6)
  })

  it('rejects corrupt payloads', () => {
    localStorage.setItem('seedvale.assetBrowser.layout.v1', '{"version":1}')
    expect(loadLayoutPersist()).toBeNull()
  })
})
