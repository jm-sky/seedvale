import { describe, expect, it } from 'vitest'
import type { WorldLocationCatalog } from './worldLocationCatalog'
import type { WorldLocation } from './worldLocationTypes'
import {
  listKnownSettlementOptions,
  resolveCharacterReputationSettlementId,
  settlementIdFromLocationId,
} from './knownSettlementReputation'
import { createLocationKnowledge } from './locationKnowledge'

function fakeCatalog(locations: readonly WorldLocation[]): Pick<WorldLocationCatalog, 'getById'> {
  return {
    getById(id) {
      return locations.find((location) => location.id === id) ?? null
    },
  }
}

function settlementLocation(id: string, name: string): WorldLocation {
  return { id: `settlement:${id}`, kind: 'settlement', x: 0, z: 0, name, discoveryWeight: 0 }
}

describe('settlementIdFromLocationId', () => {
  it('reads SettlementDef.id from a settlement WorldLocation id', () => {
    expect(settlementIdFromLocationId('settlement:1_0')).toBe('1_0')
  })

  it('rejects non-settlement location ids', () => {
    expect(settlementIdFromLocationId('cave:alpha')).toBeNull()
    expect(settlementIdFromLocationId('lake:1,2')).toBeNull()
  })
})

describe('listKnownSettlementOptions', () => {
  const home = settlementLocation('0_0', 'Dolina')
  const foreign = settlementLocation('1_0', 'Brzeg')
  const catalog = fakeCatalog([
    home,
    foreign,
    { id: 'cave:alpha', kind: 'cave', x: 0, z: 0, name: 'Jaskinia', discoveryWeight: 1 },
  ])

  it('includes the known home settlement', () => {
    const knowledge = createLocationKnowledge([
      { id: home.id, state: 'confirmed', source: 'exploration' },
    ])
    expect(listKnownSettlementOptions(knowledge, catalog)).toEqual([
      { settlementId: '0_0', settlementName: 'Dolina' },
    ])
  })

  it('includes a physically confirmed foreign settlement', () => {
    const knowledge = createLocationKnowledge([
      { id: home.id, state: 'confirmed', source: 'exploration' },
      { id: foreign.id, state: 'confirmed', source: 'exploration' },
    ])
    expect(listKnownSettlementOptions(knowledge, catalog)).toEqual([
      { settlementId: '1_0', settlementName: 'Brzeg' },
      { settlementId: '0_0', settlementName: 'Dolina' },
    ])
  })

  it('includes a map-discovered settlement that is known but never visited', () => {
    const knowledge = createLocationKnowledge([
      { id: home.id, state: 'confirmed', source: 'exploration' },
      { id: foreign.id, state: 'discovered', source: 'map' },
    ])
    expect(listKnownSettlementOptions(knowledge, catalog).map((option) => option.settlementId))
      .toEqual(['1_0', '0_0'])
  })

  it('excludes an undiscovered catalog settlement', () => {
    const knowledge = createLocationKnowledge([
      { id: home.id, state: 'confirmed', source: 'exploration' },
    ])
    expect(listKnownSettlementOptions(knowledge, catalog).map((option) => option.settlementId))
      .toEqual(['0_0'])
  })

  it('excludes caves and other non-settlement knowledge', () => {
    const knowledge = createLocationKnowledge([
      { id: home.id, state: 'confirmed', source: 'exploration' },
      { id: 'cave:alpha', state: 'confirmed', source: 'exploration' },
    ])
    expect(listKnownSettlementOptions(knowledge, catalog)).toEqual([
      { settlementId: '0_0', settlementName: 'Dolina' },
    ])
  })

  it('skips a known settlement id that the catalog can no longer resolve', () => {
    const knowledge = createLocationKnowledge([
      { id: 'settlement:gone', state: 'confirmed', source: 'exploration' },
    ])
    expect(listKnownSettlementOptions(knowledge, catalog)).toEqual([])
  })

  it('does not consult catalog settlements that were never learned', () => {
    const knowledge = createLocationKnowledge()
    const scanningCatalog: Pick<WorldLocationCatalog, 'getById'> = {
      getById: () => {
        throw new Error('must not scan unknown catalog settlements')
      },
    }
    expect(listKnownSettlementOptions(knowledge, scanningCatalog)).toEqual([])
  })
})

describe('resolveCharacterReputationSettlementId', () => {
  const options = [
    { settlementId: '1_0', settlementName: 'Brzeg' },
    { settlementId: '0_0', settlementName: 'Dolina' },
  ]

  it('selects the current settlement when the player is in one', () => {
    expect(resolveCharacterReputationSettlementId({
      options,
      currentSettlementId: '1_0',
      lastVisitedSettlementId: '0_0',
      homeSettlementId: '0_0',
      previousSelectedSettlementId: '0_0',
    })).toBe('1_0')
  })

  it('keeps a previous selection outside settlements when that id is still known', () => {
    expect(resolveCharacterReputationSettlementId({
      options,
      currentSettlementId: null,
      lastVisitedSettlementId: '1_0',
      homeSettlementId: '0_0',
      previousSelectedSettlementId: '0_0',
    })).toBe('0_0')
  })

  it('uses last visited when outside and there is no previous selection', () => {
    expect(resolveCharacterReputationSettlementId({
      options,
      currentSettlementId: null,
      lastVisitedSettlementId: '1_0',
      homeSettlementId: '0_0',
      previousSelectedSettlementId: null,
    })).toBe('1_0')
  })

  it('falls back to home when last visited is unknown', () => {
    expect(resolveCharacterReputationSettlementId({
      options,
      currentSettlementId: null,
      lastVisitedSettlementId: '9_9',
      homeSettlementId: '0_0',
      previousSelectedSettlementId: null,
    })).toBe('0_0')
  })

  it('falls back to the first known option deterministically', () => {
    expect(resolveCharacterReputationSettlementId({
      options,
      currentSettlementId: null,
      lastVisitedSettlementId: null,
      homeSettlementId: 'missing',
      previousSelectedSettlementId: null,
    })).toBe('1_0')
  })

  it('returns null when there are no known settlements', () => {
    expect(resolveCharacterReputationSettlementId({
      options: [],
      currentSettlementId: '0_0',
      lastVisitedSettlementId: '0_0',
      homeSettlementId: '0_0',
      previousSelectedSettlementId: '0_0',
    })).toBeNull()
  })

  it('does not select an unknown current or last-visited id', () => {
    expect(resolveCharacterReputationSettlementId({
      options: [{ settlementId: '0_0', settlementName: 'Dolina' }],
      currentSettlementId: '1_0',
      lastVisitedSettlementId: '1_0',
      homeSettlementId: '0_0',
      previousSelectedSettlementId: '1_0',
    })).toBe('0_0')
  })
})
