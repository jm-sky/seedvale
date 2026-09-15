import { describe, expect, it } from 'vitest'
import { NPC_HAIR_COLOR } from '../../ai/npcAppearance'
import { hairColorHexFor, parseHairColor } from './hairTint'

describe('hairColorHexFor', () => {
  it('maps ids to the NPC multiply palette', () => {
    expect(hairColorHexFor('black')).toBe(NPC_HAIR_COLOR.black)
    expect(hairColorHexFor('brown')).toBe(NPC_HAIR_COLOR.brown)
    expect(hairColorHexFor('redhead')).toBe(NPC_HAIR_COLOR.redhead)
    expect(hairColorHexFor('blond')).toBe(NPC_HAIR_COLOR.blond)
    expect(hairColorHexFor('grey')).toBe(NPC_HAIR_COLOR.grey)
  })
})

describe('parseHairColor', () => {
  it('accepts canonical ids and aliases', () => {
    expect(parseHairColor('black')).toBe('black')
    expect(parseHairColor('redhead')).toBe('redhead')
    expect(parseHairColor('red')).toBe('redhead')
    expect(parseHairColor('gray')).toBe('grey')
    expect(parseHairColor('nope')).toBeUndefined()
  })
})
