import { afterEach, describe, expect, it, vi } from 'vitest'
import { isModelTestMode } from './debugMode'

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
