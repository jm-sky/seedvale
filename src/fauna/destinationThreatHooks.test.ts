import { describe, expect, it } from 'vitest'
import type { AnimalKind } from './AnimalAgent'
import { collectDestinationThreats } from './destinationThreatHooks'

type TestAgent = {
  animalId: string
  isDead: () => boolean
  isFrenzied: () => boolean
  isRabid: () => boolean
  isThreateningHuman: () => boolean
  dangerSignificance: number
  def: { kind: AnimalKind, humanDanger?: { baseline: number, aggressiveFloor: number } }
  mesh: { position: { x: number, z: number } }
}

function agent(overrides: Partial<TestAgent> & { animalId: string, x: number, z: number }): TestAgent {
  return {
    animalId: overrides.animalId,
    isDead: overrides.isDead ?? (() => false),
    isFrenzied: overrides.isFrenzied ?? (() => false),
    isRabid: overrides.isRabid ?? (() => false),
    isThreateningHuman: overrides.isThreateningHuman ?? (() => false),
    dangerSignificance: overrides.dangerSignificance ?? 1,
    def: overrides.def ?? { kind: 'wolf', humanDanger: { baseline: 0.45, aggressiveFloor: 0.75 } },
    mesh: { position: { x: overrides.x, z: overrides.z } },
  }
}

describe('collectDestinationThreats', () => {
  it('includes a live wolf within radius with its projected human danger', () => {
    const wolf = agent({ animalId: 'wolf-1', x: 5, z: 0 })
    const threats = collectDestinationThreats([wolf], 0, 0, 10)
    expect(threats).toEqual([{ animalId: 'wolf-1', x: 5, z: 0, humanDanger: 0.45 }])
  })

  it('excludes a dead animal', () => {
    const wolf = agent({ animalId: 'wolf-1', x: 1, z: 0, isDead: () => true })
    expect(collectDestinationThreats([wolf], 0, 0, 10)).toEqual([])
  })

  it('excludes an animal outside the scan radius', () => {
    const wolf = agent({ animalId: 'wolf-1', x: 50, z: 0 })
    expect(collectDestinationThreats([wolf], 0, 0, 10)).toEqual([])
  })

  it('excludes harmless prey/livestock (no humanDanger config) even nearby', () => {
    const deer = agent({ animalId: 'deer-1', x: 1, z: 0, def: { kind: 'deer' } })
    expect(collectDestinationThreats([deer], 0, 0, 10)).toEqual([])
  })

  it('includes meaningful latent danger even when not actively threatening a human', () => {
    const wolf = agent({ animalId: 'wolf-1', x: 1, z: 0, isThreateningHuman: () => false })
    const threats = collectDestinationThreats([wolf], 0, 0, 10)
    expect(threats[0]?.humanDanger).toBeGreaterThan(0)
  })

  it('raises the projected danger for a frenzied animal', () => {
    const calm = agent({ animalId: 'fox-1', x: 1, z: 0, def: { kind: 'fox', humanDanger: { baseline: 0.03, aggressiveFloor: 0.5 } } })
    const frenzied = agent({
      animalId: 'fox-2',
      x: 1,
      z: 0,
      isFrenzied: () => true,
      def: { kind: 'fox', humanDanger: { baseline: 0.03, aggressiveFloor: 0.5 } },
    })
    const [calmThreat] = collectDestinationThreats([calm], 0, 0, 10)
    const [frenziedThreat] = collectDestinationThreats([frenzied], 0, 0, 10)
    expect(frenziedThreat!.humanDanger).toBeGreaterThan(calmThreat!.humanDanger)
  })
})
