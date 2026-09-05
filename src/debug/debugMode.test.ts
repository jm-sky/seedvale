import { afterEach, describe, expect, it, vi } from 'vitest'
import { caveSpikeVariant, isModelTestMode } from './debugMode'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubWindow(search: string): void {
  vi.stubGlobal('window', { location: { search } })
}

describe('isModelTestMode', () => {
  it('is false when the flag is absent', () => {
    stubWindow('')
    expect(isModelTestMode()).toBe(false)
  })

  it('is true when the flag is present', () => {
    stubWindow('?modelTest')
    expect(isModelTestMode()).toBe(true)
  })

  it('is not triggered by an unrelated query param', () => {
    stubWindow('?debug=1')
    expect(isModelTestMode()).toBe(false)
  })
})

describe('caveSpikeVariant', () => {
  it('defaults to sdf when the param is absent', () => {
    stubWindow('')
    expect(caveSpikeVariant()).toBe('sdf')
  })

  it('resolves sdf explicitly', () => {
    stubWindow('?caveSpike=sdf')
    expect(caveSpikeVariant()).toBe('sdf')
  })

  it('resolves sweep as an explicit override', () => {
    stubWindow('?caveSpike=sweep')
    expect(caveSpikeVariant()).toBe('sweep')
  })
})
