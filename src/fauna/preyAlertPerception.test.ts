import { describe, expect, it } from 'vitest'
import { type PreyAlertCandidate, resolvePreyAlertThreat } from './preyAlertPerception'

const SELF = { x: 0, z: 0 }
const ALERT_RADIUS = 30

function candidate(overrides: Partial<PreyAlertCandidate>): PreyAlertCandidate {
  return {
    x: 10,
    z: 0,
    dead: false,
    role: 'predator',
    recentVocalizeAlert: null,
    huntingLiveTarget: false,
    ...overrides,
  }
}

describe('resolvePreyAlertThreat', () => {
  it('a nearby predator howl (ambient context) raises alert relevance', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ recentVocalizeAlert: { context: 'ambient' } })],
      ALERT_RADIUS,
    )
    expect(result).toEqual({ x: 10, z: 0 })
  })

  it('the same howl is ignored once beyond the alert radius', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ x: ALERT_RADIUS + 1, recentVocalizeAlert: { context: 'ambient' } })],
      ALERT_RADIUS,
    )
    expect(result).toBeNull()
  })

  it('expired vocalization (null) and no live hunt is ignored', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ recentVocalizeAlert: null, huntingLiveTarget: false })],
      ALERT_RADIUS,
    )
    expect(result).toBeNull()
  })

  it('a dead candidate is never a threat regardless of stimulus', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ dead: true, recentVocalizeAlert: { context: 'ambient' }, huntingLiveTarget: true })],
      ALERT_RADIUS,
    )
    expect(result).toBeNull()
  })

  it('a non-predator ambient vocalization (e.g. another sheep bleating) never counts as a threat', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ role: 'livestock', recentVocalizeAlert: { context: 'ambient' } })],
      ALERT_RADIUS,
    )
    expect(result).toBeNull()
  })

  it('a dog\'s alert-context bark raises relevance even though the dog is not a predator', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ role: 'livestock', recentVocalizeAlert: { context: 'alert' } })],
      ALERT_RADIUS,
    )
    expect(result).toEqual({ x: 10, z: 0 })
  })

  it('a live predator hunting something nearby raises relevance without any vocalization', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ recentVocalizeAlert: null, huntingLiveTarget: true })],
      ALERT_RADIUS,
    )
    expect(result).toEqual({ x: 10, z: 0 })
  })

  it('alertRadius <= 0 (e.g. a dog with fleeRange 0) never triggers, even for an in-range howl', () => {
    const result = resolvePreyAlertThreat(
      SELF.x, SELF.z,
      [candidate({ x: 1, recentVocalizeAlert: { context: 'ambient' } })],
      0,
    )
    expect(result).toBeNull()
  })

  it('same howl, different species: a smaller alertRadius (less skittish species) may ignore what a larger one reacts to', () => {
    const candidates = [candidate({ x: 20, recentVocalizeAlert: { context: 'ambient' } })]
    expect(resolvePreyAlertThreat(SELF.x, SELF.z, candidates, 15)).toBeNull()
    expect(resolvePreyAlertThreat(SELF.x, SELF.z, candidates, 25)).toEqual({ x: 20, z: 0 })
  })
})
