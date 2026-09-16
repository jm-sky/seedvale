import { describe, expect, it } from 'vitest'
import { RESERVED_CHARACTERS } from './characters'
import { formatPolishSurnameForGender, generateNpcName, NAME_CULTURES, surnameForGender } from './nameCultures'

// Plan 199 — the 4 quest-critical reserved names (`characters.ts`) must never
// be drawn for an unrelated procedurally generated NPC, or `QuestManager`/
// dialogue/label-marker code (which identifies the giver/target purely by
// `NpcAgent.name`) could be fooled into treating a random villager as the
// real quest giver.
describe('generateNpcName reserved-name exclusion', () => {
  const reservedNames = new Set(RESERVED_CHARACTERS.map((c) => c.name))

  it('never returns a reserved name across a wide sweep of seeds/indices/cultures', () => {
    for (const culture of NAME_CULTURES) {
      for (const gender of ['male', 'female'] as const) {
        for (let seed = 0; seed < 200; seed++) {
          for (let npcIndex = 0; npcIndex < 5; npcIndex++) {
            const name = generateNpcName(seed, npcIndex, gender, culture)
            expect(reservedNames.has(name)).toBe(false)
          }
        }
      }
    }
  })
})

describe('formatPolishSurnameForGender', () => {
  it('inflects recognized Polish endings independently of NameCulture', () => {
    expect(formatPolishSurnameForGender('Leśniewski', 'female')).toBe('Leśniewska')
    expect(formatPolishSurnameForGender('Kowalski', 'female')).toBe('Kowalska')
    expect(formatPolishSurnameForGender('Górski', 'female')).toBe('Górska')
    expect(formatPolishSurnameForGender('Nowicki', 'female')).toBe('Nowicka')
    expect(formatPolishSurnameForGender('Zieliński', 'male')).toBe('Zieliński')
    expect(formatPolishSurnameForGender('Hornblower', 'female')).toBe('Hornblower')
    expect(formatPolishSurnameForGender('Nowak', 'female')).toBe('Nowak')
  })

  it('keeps surnameForGender culture-gated for generated culture pools', () => {
    expect(surnameForGender('Kowalski', 'polish', 'female')).toBe('Kowalska')
    expect(surnameForGender('Kowalski', 'english', 'female')).toBe('Kowalski')
    expect(surnameForGender('Kowalski', 'spanish', 'female')).toBe('Kowalski')
  })
})
