import { describe, expect, it } from 'vitest'
import type { Personality } from './dialogue'
import {
  aboutSelfLine,
  aboutVillageLine,
  currentActivityLine,
  familyPhrase,
  goodbyeLine,
} from './dialogueTemplates'

const ARCHETYPES: readonly Personality[] = ['cheerful', 'calm', 'grumpy', 'curious']

describe('dialogueTemplates', () => {
  describe('familyPhrase', () => {
    it('is empty for no family members', () => {
      expect(familyPhrase([])).toBe('')
    })

    it('joins relation + name for each member', () => {
      expect(
        familyPhrase([
          { name: 'Anna', lastName: 'Kowalska', relation: 'wife' },
          { name: 'Tomek', lastName: 'Kowalski', relation: 'child' },
        ]),
      ).toBe('żona Anna, dziecko Tomek')
    })
  })

  describe('aboutSelfLine', () => {
    for (const archetype of ARCHETYPES) {
      it(`returns non-empty text for ${archetype}, with and without family`, () => {
        const withFamily = aboutSelfLine('Jan Kowalski', 'woodcutter', [
          { name: 'Anna', lastName: 'Kowalska', relation: 'wife' },
        ], archetype)
        const withoutFamily = aboutSelfLine('Jan Kowalski', 'woodcutter', [], archetype)
        expect(withFamily.length).toBeGreaterThan(0)
        expect(withoutFamily.length).toBeGreaterThan(0)
        expect(withFamily).toContain('Anna')
        expect(withoutFamily).not.toContain('rodzinę')
      })
    }
  })

  describe('currentActivityLine', () => {
    for (const archetype of ARCHETYPES) {
      it(`returns non-empty text for every activity kind (${archetype})`, () => {
        expect(currentActivityLine({ kind: 'sleep', endHour: 6 }, archetype).length).toBeGreaterThan(0)
        expect(currentActivityLine({ kind: 'work', endHour: 18 }, archetype).length).toBeGreaterThan(0)
        expect(currentActivityLine({ kind: 'eat', endHour: 13 }, archetype).length).toBeGreaterThan(0)
        expect(currentActivityLine({ kind: 'wander' }, archetype).length).toBeGreaterThan(0)
        expect(currentActivityLine({ kind: 'idle' }, archetype).length).toBeGreaterThan(0)
        expect(currentActivityLine({ kind: 'talking' }, archetype).length).toBeGreaterThan(0)
        expect(currentActivityLine({ kind: 'need', need: 'water' }, archetype).length).toBeGreaterThan(0)
      })
    }

    it('mentions the formatted end hour only when provided', () => {
      expect(currentActivityLine({ kind: 'work', endHour: 18 }, 'calm')).toContain('18:00')
      expect(currentActivityLine({ kind: 'wander' }, 'calm')).not.toMatch(/\d{2}:\d{2}/)
    })

    it('formats a fractional hour with rounded minutes', () => {
      expect(currentActivityLine({ kind: 'sleep', endHour: 5.5 }, 'calm')).toContain('05:30')
    })
  })

  describe('aboutVillageLine', () => {
    for (const archetype of ARCHETYPES) {
      it(`returns non-empty text with and without a dominant resource (${archetype})`, () => {
        const withResource = aboutVillageLine(
          'Seedvale',
          'MD',
          'ocean',
          'fishing',
          { id: 'r1', type: 'fish', x: 0, z: 0, radius: 10, richness: 0.8 },
          archetype,
        )
        const withoutResource = aboutVillageLine('Seedvale', 'MD', 'ocean', 'fishing', null, archetype)
        expect(withResource.length).toBeGreaterThan(0)
        expect(withoutResource.length).toBeGreaterThan(0)
        expect(withResource).toContain('ryby')
      })
    }
  })

  describe('goodbyeLine', () => {
    for (const archetype of ARCHETYPES) {
      it(`returns non-empty text for ${archetype}`, () => {
        expect(goodbyeLine(archetype).length).toBeGreaterThan(0)
      })
    }
  })
})
