import { describe, expect, it } from 'vitest'
import { NPC_UBC_HAIR_1_URL, NPC_UBC_HAIR_2_URL } from '../../ai/npcAppearance'
import { hairTintUrlFor, parseHairTint } from './hairTint'

describe('hairTintUrlFor', () => {
  it('maps sidecar ids to npc-040 URLs and baked to null', () => {
    expect(hairTintUrlFor('hair_1')).toBe(NPC_UBC_HAIR_1_URL)
    expect(hairTintUrlFor('hair_2')).toBe(NPC_UBC_HAIR_2_URL)
    expect(hairTintUrlFor('baked')).toBeNull()
  })
})

describe('parseHairTint', () => {
  it('accepts canonical ids and aliases', () => {
    expect(parseHairTint('hair_1')).toBe('hair_1')
    expect(parseHairTint('2')).toBe('hair_2')
    expect(parseHairTint('glb')).toBe('baked')
    expect(parseHairTint('nope')).toBeUndefined()
  })
})
