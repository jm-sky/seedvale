import { describe, expect, it } from 'vitest'
import { engagedNpc, isEngagedNpc, isNpcEngagementOpen } from './npcEngagement'

const trader = { id: 'trader' }
const other = { id: 'other' }

describe('npcEngagement', () => {
  it('is closed when neither overlay is open', () => {
    const state = { dialogueOpen: false, dialogueNpc: trader, merchantOpen: false, merchantNpc: trader }
    expect(isNpcEngagementOpen(state)).toBe(false)
    expect(engagedNpc(state)).toBeNull()
    expect(isEngagedNpc(state, trader)).toBe(false)
  })

  it('freezes the dialogue NPC while talking', () => {
    const state = { dialogueOpen: true, dialogueNpc: trader, merchantOpen: false, merchantNpc: null }
    expect(isNpcEngagementOpen(state)).toBe(true)
    expect(engagedNpc(state)).toBe(trader)
    expect(isEngagedNpc(state, trader)).toBe(true)
    expect(isEngagedNpc(state, other)).toBe(false)
  })

  it('freezes the merchant NPC while trading', () => {
    const state = { dialogueOpen: false, dialogueNpc: null, merchantOpen: true, merchantNpc: trader }
    expect(isNpcEngagementOpen(state)).toBe(true)
    expect(engagedNpc(state)).toBe(trader)
    expect(isEngagedNpc(state, trader)).toBe(true)
    expect(isEngagedNpc(state, other)).toBe(false)
  })

  it('prefers dialogue when both overlays are somehow open', () => {
    const state = { dialogueOpen: true, dialogueNpc: other, merchantOpen: true, merchantNpc: trader }
    expect(engagedNpc(state)).toBe(other)
  })
})
