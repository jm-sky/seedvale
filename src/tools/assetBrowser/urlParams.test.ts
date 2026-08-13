import { describe, expect, it } from 'vitest'
import type { BrowserState } from './state'
import {
  applyAssetBrowserUrlParams,
  hasAssetBrowserUrlParams,
  parseAssetBrowserUrlParams,
} from './urlParams'

function baseState(overrides: Partial<BrowserState> = {}): BrowserState {
  return {
    referenceId: 'character:player',
    targetId: null,
    freeUrl: '',
    referenceAnchor: 'hand.right',
    targetAnchor: null,
    layout: 'quad',
    activeView: 0,
    renderMode: 'diagnostic',
    lightingPreset: 'alignment',
    background: 'dark',
    showGrid: true,
    showAxes: true,
    showGround: true,
    showBbox: true,
    wireframe: false,
    showOverlay: true,
    focus: 'scene',
    focusRadius: null,
    timeOfDay: 0.5,
    torchFuelRatio: 1,
    pose: 'rest',
    resetTransformOnReload: false,
    reportText: '',
    statusMessage: 'Ready',
    invalidSelection: null,
    ...overrides,
  }
}

describe('parseAssetBrowserUrlParams', () => {
  it('reads reference/target ids and anchors', () => {
    const parsed = parseAssetBrowserUrlParams(
      '?reference=character:player&target=held:axe&referenceAnchor=hand.right&targetAnchor=grip',
    )
    expect(parsed).toEqual({
      referenceId: 'character:player',
      targetId: 'held:axe',
      referenceAnchor: 'hand.right',
      targetAnchor: 'grip',
    })
    expect(hasAssetBrowserUrlParams(parsed)).toBe(true)
  })

  it('accepts aliases and free URL', () => {
    expect(parseAssetBrowserUrlParams('?ref=house:hut_d&url=/models/items/axe.glb')).toEqual({
      referenceId: 'house:hut_d',
      freeUrl: '/models/items/axe.glb',
    })
    expect(parseAssetBrowserUrlParams('?targetUrl=/models/a.glb&refAnchor=origin')).toEqual({
      freeUrl: '/models/a.glb',
      referenceAnchor: 'origin',
    })
  })

  it('treats empty values as clear', () => {
    expect(parseAssetBrowserUrlParams('?reference=&target=')).toEqual({
      referenceId: null,
      targetId: null,
    })
  })

  it('returns empty object when no relevant params', () => {
    expect(parseAssetBrowserUrlParams('?debug=1')).toEqual({})
    expect(hasAssetBrowserUrlParams({})).toBe(false)
  })

  it('reads focus / layout / pose / display flags', () => {
    expect(parseAssetBrowserUrlParams(
      '?target=held:knife&focus=hand&focusRadius=0.3&layout=single&view=perspective&pose=idle&bbox=0&overlay=0&lighting=torch',
    )).toEqual({
      targetId: 'held:knife',
      focus: 'hand',
      focusRadius: 0.3,
      layout: 'single',
      activeView: 3,
      pose: 'idle',
      showBbox: false,
      showOverlay: false,
      lightingPreset: 'torch',
    })
  })
})

describe('applyAssetBrowserUrlParams', () => {
  it('overrides only present fields', () => {
    const state = baseState()
    const applied = applyAssetBrowserUrlParams(state, {
      targetId: 'held:axe',
      targetAnchor: 'grip',
    })
    expect(applied).toBe(true)
    expect(state.referenceId).toBe('character:player')
    expect(state.referenceAnchor).toBe('hand.right')
    expect(state.targetId).toBe('held:axe')
    expect(state.targetAnchor).toBe('grip')
    expect(state.freeUrl).toBe('')
  })

  it('clears targetId when only free URL is set', () => {
    const state = baseState({ targetId: 'held:axe' })
    applyAssetBrowserUrlParams(state, { freeUrl: '/models/items/axe.glb' })
    expect(state.targetId).toBeNull()
    expect(state.freeUrl).toBe('/models/items/axe.glb')
  })

  it('lets free URL and target id coexist when both provided', () => {
    const state = baseState()
    applyAssetBrowserUrlParams(state, {
      targetId: 'held:axe',
      freeUrl: '/models/items/axe.glb',
    })
    expect(state.targetId).toBe('held:axe')
    expect(state.freeUrl).toBe('/models/items/axe.glb')
  })
})
