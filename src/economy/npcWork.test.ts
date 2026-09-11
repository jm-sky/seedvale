import { describe, expect, it } from 'vitest'
import { createHousehold } from '../settlement/household'
import { WOODSHED_DEVELOPMENT } from './development'
import { commitHunterArrowProduction, commitRoleWork, commitWoodcutterDeposit, commitWoolMaterialProduction } from './npcWork'
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

  it('records stock history at the supplied completion time', () => {
    const eco = createSettlementEconomy('s1', { wood: 1 }, DEMANDS)
    expect(commitWoodcutterDeposit(eco, 15)).toBe(true)
    expect(eco.history()[0]).toMatchObject({ type: 'stock.added', kind: 'wood', amount: 2, simTime: 15 })
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
    const eco = createSettlementEconomy('s1', {}, DEMANDS)
    eco.depositFood('carrot', 2)
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

describe('commitHunterArrowProduction (settlements-npcs-003)', () => {
  it('produces arrows into Household.items and consumes the household branch', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('branch', 1)
    expect(commitHunterArrowProduction(household)).toBe(true)
    expect(household.items.count('branch')).toBe(0)
    expect(household.items.count('arrow')).toBe(1)
  })

  it('does not mint arrows when called with neither material, regardless of simTime', () => {
    const household = createHousehold('h', 's', 'home')
    expect(commitHunterArrowProduction(household, 9)).toBe(false)
    expect(household.items.count('arrow')).toBe(0)
  })

  it('falls back to beam once branch is exhausted', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('beam', 1)
    expect(commitHunterArrowProduction(household)).toBe(true)
    expect(household.items.count('beam')).toBe(0)
    expect(household.items.count('arrow')).toBe(8)
  })

  it('returns false without touching Household.items when neither material is available', () => {
    const household = createHousehold('h', 's', 'home')
    expect(commitHunterArrowProduction(household)).toBe(false)
    expect(household.items.count('arrow')).toBe(0)
  })

  it('a normal (non-hunter) household is unaffected — no arrow recipe runs implicitly', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('branch', 2)
    // Regular role-work dispatch (commitRoleWork) never touches Household.items.
    expect(commitRoleWork(createSettlementEconomy('s', {}, []), 'farmer')).toBe(true)
    expect(household.items.count('branch')).toBe(2)
    expect(household.items.count('arrow')).toBe(0)
  })
})

describe('commitWoolMaterialProduction (settlements-npcs-006)', () => {
  it('consumes 4 wool and creates 12 wool_material in Household.items', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('wool', 4)
    expect(commitWoolMaterialProduction(household, 9)).toBe(true)
    expect(household.items.count('wool')).toBe(0)
    expect(household.items.count('wool_material')).toBe(12)
  })

  it('returns false without mutation when the household has fewer than 4 wool', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('wool', 3)
    expect(commitWoolMaterialProduction(household)).toBe(false)
    expect(household.items.count('wool')).toBe(3)
    expect(household.items.count('wool_material')).toBe(0)
  })

  it('does not run from commitRoleWork — textile is not a stock recipe', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('wool', 4)
    expect(commitRoleWork(createSettlementEconomy('s', {}, []), 'textile_worker')).toBe(false)
    expect(household.items.count('wool')).toBe(4)
    expect(household.items.count('wool_material')).toBe(0)
  })
})
