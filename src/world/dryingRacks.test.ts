import { describe, expect, it } from 'vitest'
import { isDryingComplete, pickDryingRecipe, startDryingProcess } from './dryingRacks'

describe('dryingRacks (plan 159)', () => {
  it('prefers raw meat kinds over fish', () => {
    const recipe = pickDryingRecipe((kind) => kind === 'raw_meat' || kind === 'fish')
    expect(recipe?.inputKind).toBe('raw_meat')
    expect(recipe?.output.kind).toBe('dried_meat')
  })

  it('falls back to fish when no meat is held', () => {
    const recipe = pickDryingRecipe((kind) => kind === 'fish')
    expect(recipe?.inputKind).toBe('fish')
    expect(recipe?.output.kind).toBe('dried_fish')
  })

  it('returns null when nothing dryable is held', () => {
    expect(pickDryingRecipe(() => false)).toBeNull()
  })

  it('starts and resolves a process from a recipe', () => {
    const recipe = pickDryingRecipe((kind) => kind === 'raw_meat')!
    const process = startDryingProcess('rack:1', recipe, 5)
    expect(process.input).toEqual([{ kind: 'raw_meat', count: 1 }])
    expect(isDryingComplete(process, 5)).toBe(false)
    expect(isDryingComplete(process, 5 + recipe.durationDays)).toBe(true)
  })
})
