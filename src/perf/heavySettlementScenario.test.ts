import { describe, expect, it } from 'vitest'
import type { FamilyDef } from '../settlement/families'
import type { SettlementCell, SettlementDef } from '../settlement/settlementGenerator'
import {
  HEAVY_SETTLEMENT_SEARCH_RADIUS,
  selectHeavySettlement,
  settlementResidentCount,
} from './heavySettlementScenario'

type StubDef = Pick<
  SettlementDef,
  'id' | 'gx' | 'gz' | 'x' | 'z' | 'y' | 'size' | 'families' | 'terrain' | 'name' | 'isHome'
>

function members(n: number): FamilyDef['members'] {
  return Array.from({ length: n }, (_, i) => ({
    name: `N${i}`,
    lastName: 'Test',
    relation: 'single' as const,
    character: {} as FamilyDef['members'][number]['character'],
    scale: 1,
    age: 30,
  }))
}

function stub(partial: Partial<StubDef> & Pick<StubDef, 'id' | 'gx' | 'gz' | 'size' | 'terrain'>): SettlementDef {
  const families: readonly FamilyDef[] = partial.families
    ?? [{ id: `${partial.id}-f0`, members: members(2) }]
  return {
    id: partial.id,
    gx: partial.gx,
    gz: partial.gz,
    x: partial.x ?? partial.gx * 280,
    z: partial.z ?? partial.gz * 280,
    y: partial.y ?? 0,
    size: partial.size,
    families,
    clearings: {} as SettlementDef['clearings'],
    isHome: partial.isHome ?? false,
    terrain: partial.terrain,
    name: partial.name ?? partial.id,
    nameCulture: 'polish',
    dominantResource: null,
    foodSourceType: 'field',
    plan: {} as SettlementDef['plan'],
  }
}

function peekFrom(defs: SettlementDef[]): (cell: SettlementCell) => SettlementDef | null {
  const map = new Map(defs.map((d) => [`${d.gx},${d.gz}`, d]))
  return (cell) => map.get(`${cell.gx},${cell.gz}`) ?? null
}

const home = { gx: 0, gz: 0 }

describe('selectHeavySettlement', () => {
  it('ignores non-mountain settlements', () => {
    const result = selectHeavySettlement({
      home,
      radius: 2,
      peekDef: peekFrom([
        stub({ id: '1_0', gx: 1, gz: 0, size: 'XL', terrain: 'forest', families: [{ id: 'a', members: members(20) }] }),
        stub({ id: '0_1', gx: 0, gz: 1, size: 'SM', terrain: 'mountain', families: [{ id: 'b', members: members(2) }] }),
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.def.id).toBe('0_1')
    expect(result.def.terrain).toBe('mountain')
  })

  it('prefers larger size over smaller size with more residents', () => {
    const result = selectHeavySettlement({
      home,
      radius: 2,
      peekDef: peekFrom([
        stub({ id: '1_0', gx: 1, gz: 0, size: 'SM', terrain: 'mountain', families: [{ id: 'a', members: members(20) }] }),
        stub({ id: '0_1', gx: 0, gz: 1, size: 'LG', terrain: 'mountain', families: [{ id: 'b', members: members(3) }] }),
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.def.id).toBe('0_1')
    expect(result.def.size).toBe('LG')
  })

  it('breaks equal size by resident count', () => {
    const result = selectHeavySettlement({
      home,
      radius: 2,
      peekDef: peekFrom([
        stub({ id: '1_0', gx: 1, gz: 0, size: 'MD', terrain: 'mountain', families: [{ id: 'a', members: members(4) }] }),
        stub({ id: '0_1', gx: 0, gz: 1, size: 'MD', terrain: 'mountain', families: [{ id: 'b', members: members(8) }] }),
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.def.id).toBe('0_1')
    expect(settlementResidentCount(result.def)).toBe(8)
  })

  it('tie-breaks equal size and residents by distance then id', () => {
    const farther = stub({
      id: '2_0',
      gx: 2,
      gz: 0,
      size: 'XL',
      terrain: 'mountain',
      families: [{ id: 'a', members: members(5) }],
    })
    const nearerB = stub({
      id: '0_1',
      gx: 0,
      gz: 1,
      size: 'XL',
      terrain: 'mountain',
      families: [{ id: 'b', members: members(5) }],
    })
    const nearerA = stub({
      id: '1_0',
      gx: 1,
      gz: 0,
      size: 'XL',
      terrain: 'mountain',
      families: [{ id: 'c', members: members(5) }],
    })
    const result = selectHeavySettlement({
      home,
      radius: 2,
      peekDef: peekFrom([farther, nearerB, nearerA]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Both nearer cells are distanceSq=1; id asc → '0_1' before '1_0'
    expect(result.def.id).toBe('0_1')
  })

  it('fails explicitly when no mountain candidate exists', () => {
    const result = selectHeavySettlement({
      home,
      radius: 1,
      peekDef: peekFrom([
        stub({ id: '1_0', gx: 1, gz: 0, size: 'XL', terrain: 'forest' }),
        stub({ id: '0_0', gx: 0, gz: 0, size: 'XL', terrain: 'mountain', isHome: true }),
      ]),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/no mountain SettlementDef/)
  })

  it('skips the home cell even when it is mountain', () => {
    const result = selectHeavySettlement({
      home,
      radius: 1,
      peekDef: peekFrom([
        stub({ id: '0_0', gx: 0, gz: 0, size: 'XL', terrain: 'mountain', isHome: true }),
      ]),
    })
    expect(result.ok).toBe(false)
  })

  it('exports a frozen search radius', () => {
    expect(HEAVY_SETTLEMENT_SEARCH_RADIUS).toBe(4)
  })
})
