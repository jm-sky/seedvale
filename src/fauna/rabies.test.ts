import { describe, expect, it } from 'vitest'
import {
  isRabiesCorpseContact,
  pickRabidTarget,
  RABIES_BITE_INFECTION_CHANCE,
  RABIES_CORPSE_CONTACT_RADIUS,
  RABIES_CORPSE_INFECTION_CHANCE,
  rollsRabiesInfection,
} from './AnimalAgent'

describe('rollsRabiesInfection (plan fauna-001 — shared bite/corpse roll)', () => {
  it('succeeds when the roll lands below the chance', () => {
    expect(rollsRabiesInfection(RABIES_BITE_INFECTION_CHANCE, 0)).toBe(true)
    expect(rollsRabiesInfection(RABIES_BITE_INFECTION_CHANCE, RABIES_BITE_INFECTION_CHANCE - 0.01)).toBe(true)
  })

  it('fails when the roll lands at or above the chance', () => {
    expect(rollsRabiesInfection(RABIES_BITE_INFECTION_CHANCE, RABIES_BITE_INFECTION_CHANCE)).toBe(false)
    expect(rollsRabiesInfection(RABIES_BITE_INFECTION_CHANCE, 0.999)).toBe(false)
  })

  it('is a plain deterministic comparison — same inputs always produce the same outcome', () => {
    expect(rollsRabiesInfection(0.5, 0.4)).toBe(rollsRabiesInfection(0.5, 0.4))
  })
})

describe('isRabiesCorpseContact (plan fauna-001 — 0.5 m rotting-corpse exposure)', () => {
  const infectedRotting = { corpsePhase: 'rotting' as const, corpseInfected: true }

  it('is contact when within the 0.5 m radius of an infected rotting corpse', () => {
    expect(isRabiesCorpseContact({ ...infectedRotting, distance: 0.49 })).toBe(true)
    expect(isRabiesCorpseContact({ ...infectedRotting, distance: 0 })).toBe(true)
  })

  it('is not contact at or beyond the 0.5 m radius', () => {
    expect(isRabiesCorpseContact({ ...infectedRotting, distance: RABIES_CORPSE_CONTACT_RADIUS })).toBe(false)
    expect(isRabiesCorpseContact({ ...infectedRotting, distance: 5 })).toBe(false)
  })

  it('is never contact from a healthy corpse, even at zero distance', () => {
    expect(isRabiesCorpseContact({ corpsePhase: 'rotting', corpseInfected: false, distance: 0 })).toBe(false)
  })

  it('is never contact from an infected corpse outside the rotting phase', () => {
    expect(isRabiesCorpseContact({ corpsePhase: 'fresh', corpseInfected: true, distance: 0 })).toBe(false)
    expect(isRabiesCorpseContact({ corpsePhase: 'bones', corpseInfected: true, distance: 0 })).toBe(false)
  })
})

type TestAnimal = { animalId: string, dead: boolean, x: number, z: number }

function candidate(animalId: string, x: number, z: number, dead = false): TestAnimal {
  return { animalId, dead, x, z }
}

function toRabidCandidate(a: TestAnimal): { animalId: string, isDead: () => boolean, mesh: { position: { x: number, z: number } } } {
  return { animalId: a.animalId, isDead: () => a.dead, mesh: { position: { x: a.x, z: a.z } } }
}

describe('pickRabidTarget (plan fauna-001 — rabid animal target selection)', () => {
  const self = { animalId: 'wolf-1', mesh: { position: { x: 0, z: 0 } } }

  it('picks the nearest live animal regardless of role/kind', () => {
    const near = candidate('deer-near', 2, 0)
    const far = candidate('sheep-far', 10, 0)
    const picked = pickRabidTarget(self, [far, near].map(toRabidCandidate), 20)
    expect(picked?.animalId).toBe('deer-near')
  })

  it('ignores dead candidates', () => {
    const dead = candidate('deer-dead', 1, 0, true)
    const alive = candidate('sheep-alive', 5, 0)
    const picked = pickRabidTarget(self, [dead, alive].map(toRabidCandidate), 20)
    expect(picked?.animalId).toBe('sheep-alive')
  })

  it('never picks itself', () => {
    const onlySelf = candidate('wolf-1', 0, 0)
    const picked = pickRabidTarget(self, [onlySelf].map(toRabidCandidate), 20)
    expect(picked).toBeNull()
  })

  it('returns null when nothing is within range', () => {
    const tooFar = candidate('deer-far', 100, 0)
    const picked = pickRabidTarget(self, [tooFar].map(toRabidCandidate), 20)
    expect(picked).toBeNull()
  })
})

describe('rabies infection chance constants (plan fauna-001)', () => {
  it('are configured, in-range probabilities, not scattered magic numbers', () => {
    expect(RABIES_BITE_INFECTION_CHANCE).toBeGreaterThan(0)
    expect(RABIES_BITE_INFECTION_CHANCE).toBeLessThan(1)
    expect(RABIES_CORPSE_INFECTION_CHANCE).toBe(0.5)
    expect(RABIES_CORPSE_CONTACT_RADIUS).toBe(0.5)
  })
})
