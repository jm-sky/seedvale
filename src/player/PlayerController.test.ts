import { describe, expect, it } from 'vitest'
import { MELEE_STRENGTH_NEUTRAL } from '../combat/meleeStrength'
import { PLAYER_STARTING_ATTRIBUTES } from './PlayerController'

// `PlayerController` itself requires an async GLB load to construct (plan
// npc-019 §9/implementation notes — no heavy gameLoop/PlayerController
// integration harness solely for this constant); the starting-SPEA contract
// is fully covered by testing the exported constant it assigns verbatim.
describe('PLAYER_STARTING_ATTRIBUTES (plan npc-019 §6)', () => {
  it('starts all four SPEA attributes at exactly 0.6', () => {
    expect(PLAYER_STARTING_ATTRIBUTES).toEqual({
      strength: 0.6,
      perception: 0.6,
      endurance: 0.6,
      agility: 0.6,
    })
  })

  it('starts above the shared 0.5 neutral melee reference point', () => {
    expect(PLAYER_STARTING_ATTRIBUTES.strength).toBeGreaterThan(MELEE_STRENGTH_NEUTRAL)
  })
})
