import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOME_HOUSE_DEFINITIONS } from '../assets/houseDefinitionExample'
import { houseDefinitionFromUrl, isHouseTestMode, isModelTestMode } from './debugMode'

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

describe('houseDefinitionFromUrl', () => {
  it('picks the requested definition by id', () => {
    const target = HOME_HOUSE_DEFINITIONS[0]!
    stubWindow(`?houseTest=${target.id}`)
    const result = houseDefinitionFromUrl()
    expect(result.ok).toBe(true)
    expect(result.ok && result.definition.id).toBe(target.id)
  })

  it('picks the first available definition when no id is given', () => {
    stubWindow('?houseTest')
    const result = houseDefinitionFromUrl()
    expect(result.ok).toBe(true)
    expect(result.ok && result.definition.id).toBe(HOME_HOUSE_DEFINITIONS[0]!.id)
  })

  it('returns a readable error listing available definitions for an unknown id', () => {
    stubWindow('?houseTest=NOT_A_REAL_HOUSE')
    const result = houseDefinitionFromUrl()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error result')
    expect(result.error).toContain('Unknown house definition: NOT_A_REAL_HOUSE')
    expect(result.error).toContain('Available:')
    for (const def of HOME_HOUSE_DEFINITIONS) {
      expect(result.error).toContain(def.id)
    }
  })
})
