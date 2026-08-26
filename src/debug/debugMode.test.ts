import { afterEach, describe, expect, it, vi } from 'vitest'
import { isHouseTestMode, isModelTestMode } from './debugMode'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubWindow(search: string): void {
  vi.stubGlobal('window', { location: { search } })
}

describe('isHouseTestMode / isModelTestMode', () => {
  it('is false when neither flag is present', () => {
    stubWindow('')
    expect(isHouseTestMode()).toBe(false)
    expect(isModelTestMode()).toBe(false)
  })

  it('modelTest still works on its own', () => {
    stubWindow('?modelTest')
    expect(isModelTestMode()).toBe(true)
    expect(isHouseTestMode()).toBe(false)
  })

  it('houseTest takes precedence over modelTest when both are present', () => {
    stubWindow('?houseTest&modelTest')
    expect(isHouseTestMode()).toBe(true)
    expect(isModelTestMode()).toBe(true)
    // Precedence itself is main.ts wiring — isHouseTestMode() being true is
    // what main.ts checks first.
  })

  it('is not triggered by an unrelated query param', () => {
    stubWindow('?debug=1')
    expect(isHouseTestMode()).toBe(false)
  })
})
