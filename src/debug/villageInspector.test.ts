import { describe, expect, it } from 'vitest'
import type { SettlementCell, SettlementDef } from '../settlement/settlementGenerator'
import type { SettlementsManager } from '../settlement/SettlementsManager'
import { cellFromId, cellKey } from '../settlement/settlementGenerator'
import { findVillageDef } from './villageInspector'

describe('cellFromId', () => {
  it('round-trips cellKey, including negative coordinates', () => {
    const cells: SettlementCell[] = [{ gx: 0, gz: 0 }, { gx: 3, gz: -2 }, { gx: -7, gz: -9 }]
    for (const cell of cells) {
      expect(cellFromId(cellKey(cell))).toEqual(cell)
    }
  })

  it('returns null for malformed ids', () => {
    expect(cellFromId('abc')).toBeNull()
    expect(cellFromId('1_2_3')).toBeNull()
    expect(cellFromId('')).toBeNull()
    expect(cellFromId('1_')).toBeNull()
  })
})

describe('findVillageDef', () => {
  it('resolves an id to its def via peekDef', () => {
    const def = { id: '1_2', x: 280, z: 560, name: 'Test', size: 'MD' } as SettlementDef
    const manager = {
      peekDef: (cell: SettlementCell) => (cell.gx === 1 && cell.gz === 2 ? def : null),
    } as unknown as SettlementsManager
    expect(findVillageDef(manager, '1_2')).toBe(def)
  })

  it('returns null for a malformed id without calling peekDef', () => {
    const manager = { peekDef: () => { throw new Error('should not be called') } } as unknown as SettlementsManager
    expect(findVillageDef(manager, 'not-an-id')).toBeNull()
  })

  it('returns null when the cell has no def', () => {
    const manager = { peekDef: () => null } as unknown as SettlementsManager
    expect(findVillageDef(manager, '5_5')).toBeNull()
  })
})
