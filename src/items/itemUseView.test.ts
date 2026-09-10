import { describe, expect, it } from 'vitest'
import type { LiquidContainerItemInstance } from './itemInstances'
import { Inventory } from './Inventory'
import { resolveConsumeUseView, resolveReadBookUseView } from './itemUseView'

function liquidInstance(id: string, amountLitres: number): LiquidContainerItemInstance {
  return { id, kind: 'waterskin_small', liquid: amountLitres > 0 ? 'water' : null, amountLitres }
}

describe('resolveConsumeUseView (plan items-player-024)', () => {
  it('returns null for a non-consumable kind', () => {
    expect(resolveConsumeUseView(new Inventory({ stone: 1 }), 'stone', 0)).toBeNull()
  })

  it('is enabled for fresh food, with an empty reasonLabel', () => {
    const inventory = new Inventory({})
    inventory.add('mushroom', 1, 0)
    const view = resolveConsumeUseView(inventory, 'mushroom', 0)
    expect(view).not.toBeNull()
    expect(view!.enabled).toBe(true)
    expect(view!.reasonLabel).toBe('')
    expect(view!.label).toBe('Zjedz')
  })

  it('is disabled with "Zepsute" once food has spoiled', () => {
    const inventory = new Inventory({})
    inventory.add('mushroom', 1, 0)
    const view = resolveConsumeUseView(inventory, 'mushroom', 100)
    expect(view!.enabled).toBe(false)
    expect(view!.reasonLabel).toBe('Zepsute')
  })

  it('uses the thirst verb ("Wypij") for a liquid container', () => {
    const inventory = new Inventory({})
    inventory.addInstance(liquidInstance('a', 2))
    const view = resolveConsumeUseView(inventory, 'waterskin_small', 0)
    expect(view!.label).toBe('Wypij')
    expect(view!.enabled).toBe(true)
  })

  it('is disabled with "Pusty" for an empty liquid container', () => {
    const inventory = new Inventory({})
    inventory.addInstance(liquidInstance('a', 0))
    const view = resolveConsumeUseView(inventory, 'waterskin_small', 0)
    expect(view!.enabled).toBe(false)
    expect(view!.reasonLabel).toBe('Pusty')
  })
})

describe('resolveReadBookUseView (plan items-player-024)', () => {
  const book = { skill: 'archery' as const, requiredSkillValue: 0.2, targetSkillValue: 0.4, tier: 'basic' as const }

  it('is disabled with "Zbyt trudna" below the required skill value', () => {
    const view = resolveReadBookUseView(book, 0.1)
    expect(view.enabled).toBe(false)
    expect(view.reasonLabel).toBe('Zbyt trudna')
  })

  it('is enabled while learnable (between required and target)', () => {
    const view = resolveReadBookUseView(book, 0.3)
    expect(view.enabled).toBe(true)
    expect(view.reasonLabel).toBe('')
  })

  it('is disabled with "Znana wiedza" once the skill already meets the target', () => {
    const view = resolveReadBookUseView(book, 0.4)
    expect(view.enabled).toBe(false)
    expect(view.reasonLabel).toBe('Znana wiedza')
  })
})
