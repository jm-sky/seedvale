import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCaveHeightfieldTestMode, isModelTestMode, isWildBoarGlbEnabled } from './debugMode'

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

describe('isCaveHeightfieldTestMode', () => {
  it('is false when the flag is absent', () => {
    stubWindow('')
    expect(isCaveHeightfieldTestMode()).toBe(false)
  })

  it('is true when the flag is present', () => {
    stubWindow('?caveHeightfieldTest')
    expect(isCaveHeightfieldTestMode()).toBe(true)
  })

  it('is not triggered by modelTest', () => {
    stubWindow('?modelTest')
    expect(isCaveHeightfieldTestMode()).toBe(false)
  })
})

describe('isWildBoarGlbEnabled', () => {
  it('is on by default when the flag is absent', () => {
    stubWindow('')
    expect(isWildBoarGlbEnabled()).toBe(true)
  })

  it('stays on for a bare or truthy ?boarGlb', () => {
    stubWindow('?boarGlb')
    expect(isWildBoarGlbEnabled()).toBe(true)
    stubWindow('?boarGlb=1')
    expect(isWildBoarGlbEnabled()).toBe(true)
  })

  it('is off for ?boarGlb=0 / false / no', () => {
    stubWindow('?boarGlb=0')
    expect(isWildBoarGlbEnabled()).toBe(false)
    stubWindow('?boarGlb=false')
    expect(isWildBoarGlbEnabled()).toBe(false)
    stubWindow('?boarGlb=no')
    expect(isWildBoarGlbEnabled()).toBe(false)
  })
})
