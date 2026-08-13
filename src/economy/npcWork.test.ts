import { describe, expect, it } from 'vitest'
import { WOODSHED_DEVELOPMENT } from './development'
import { commitRoleWork, commitWoodcutterDeposit } from './npcWork'
import { FARMING_PRODUCTION } from './production'
import { createSettlementEconomy } from './settlementEconomy'

const DEMANDS = [
  { kind: 'wood' as const, target: 8 },
  { kind: 'food' as const, target: 6 },
  { kind: 'water' as const, target: 6 },
]

describe('commitWoodcutterDeposit', () => {
  it('completed woodcutter work changes settlement stock', () => {
    const eco = createSettlementEconomy('s1', { wood: 1 }, DEMANDS)
    expect(commitWoodcutterDeposit(eco)).toBe(true)
    expect(eco.query('wood')).toBe(3)
  })

  it('pays the woodshed once stock covers the requirement', () => {
    const eco = createSettlementEconomy('s1', { wood: 3 }, DEMANDS)
    commitWoodcutterDeposit(eco)
    expect(eco.developmentStatus(WOODSHED_DEVELOPMENT.id)).toBe('unmet')
    expect(eco.query('wood')).toBe(5)
    commitWoodcutterDeposit(eco)
    expect(eco.developmentStatus(WOODSHED_DEVELOPMENT.id)).toBe('complete')
    expect(eco.query('wood')).toBe(1)
    commitWoodcutterDeposit(eco)
    expect(eco.developmentStatus(WOODSHED_DEVELOPMENT.id)).toBe('complete')
    expect(eco.query('wood')).toBe(3)
  })
})

describe('commitRoleWork', () => {
  it('does not mint wood from scheduled woodcutter presence', () => {
    const eco = createSettlementEconomy('s1', { wood: 1 }, DEMANDS)
    expect(commitRoleWork(eco, 'woodcutter')).toBe(false)
    expect(eco.query('wood')).toBe(1)
  })

  it('applies the shared farmer production hook (no-op until 069)', () => {
    const eco = createSettlementEconomy('s1', { food: 2 }, DEMANDS)
    expect(commitRoleWork(eco, 'farmer')).toBe(true)
    expect(eco.query('food')).toBe(2)
    expect(FARMING_PRODUCTION.outputs).toEqual([])
  })

  it('leaves guard/trader without a production recipe', () => {
    const eco = createSettlementEconomy('s1', { wood: 1 }, DEMANDS)
    expect(commitRoleWork(eco, 'guard')).toBe(false)
    expect(commitRoleWork(eco, 'trader')).toBe(false)
  })
})
