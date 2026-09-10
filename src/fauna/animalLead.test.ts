import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './animalDefs'
import {
  hitchDistanceFor,
  isDraftDef,
  isLeadableDef,
  LEAD_START_DISTANCE,
  LEAD_STOP_DISTANCE,
  resolveLeadMovement,
} from './animalLead'

describe('animalLead', () => {
  it('treats presence of AnimalDef.lead / draft as the capability, not kind checks', () => {
    expect(isLeadableDef(ANIMAL_DEFS.horse)).toBe(true)
    expect(isLeadableDef(ANIMAL_DEFS.donkey)).toBe(true)
    expect(isLeadableDef(ANIMAL_DEFS.cow)).toBe(false)
    expect(isDraftDef(ANIMAL_DEFS.horse)).toBe(true)
    expect(isDraftDef(ANIMAL_DEFS.donkey)).toBe(true)
    expect(isDraftDef(ANIMAL_DEFS.cow)).toBe(false)
    expect(hitchDistanceFor(ANIMAL_DEFS.horse)).toBe(2.35)
    expect(hitchDistanceFor(ANIMAL_DEFS.donkey)).toBe(2.15)
  })

  it('starts follow beyond the lead start band and holds until the stop band', () => {
    const state = { following: false }
    const animal = { x: 0, z: 0 }
    const far = { x: LEAD_START_DISTANCE + 1, z: 0 }
    expect(resolveLeadMovement(true, state, animal, far, ANIMAL_DEFS.horse, false, false).kind)
      .toBe('follow')
    expect(state.following).toBe(true)

    const mid = { x: (LEAD_START_DISTANCE + LEAD_STOP_DISTANCE) / 2, z: 0 }
    expect(resolveLeadMovement(true, state, animal, mid, ANIMAL_DEFS.horse, false, false).kind)
      .toBe('follow')

    const near = { x: LEAD_STOP_DISTANCE - 0.4, z: 0 }
    expect(resolveLeadMovement(true, state, animal, near, ANIMAL_DEFS.horse, false, false).kind)
      .toBe('none')
    expect(state.following).toBe(false)
  })

  it('suppresses movement while detached, mounted, or dead', () => {
    const state = { following: true }
    const animal = { x: 0, z: 0 }
    const far = { x: 20, z: 0 }
    expect(resolveLeadMovement(false, state, animal, far, ANIMAL_DEFS.horse, false, false).kind)
      .toBe('none')
    expect(resolveLeadMovement(true, state, animal, far, ANIMAL_DEFS.horse, true, false).kind)
      .toBe('none')
    expect(resolveLeadMovement(true, state, animal, far, ANIMAL_DEFS.horse, false, true).kind)
      .toBe('none')
    expect(resolveLeadMovement(true, state, animal, far, ANIMAL_DEFS.cow, false, false).kind)
      .toBe('none')
  })
})
