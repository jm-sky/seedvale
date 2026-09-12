import { describe, expect, it } from 'vitest'
import { CONDITION_MAX } from '../world/condition'
import { applyStructureDamage, structureRepairPolicy } from './structureCondition'
import {
  beginRegistryStructureRepair,
  contributeRegistryStructureRepairWork,
  createSettlementStructureStateRegistry,
} from './structureStateRegistry'

const policy = structureRepairPolicy('residential')!

describe('createSettlementStructureStateRegistry', () => {
  it('resolves a pristine default for a structure that was never mutated', () => {
    const registry = createSettlementStructureStateRegistry()
    const state = registry.resolve('home', 'building-house-0', 3)
    expect(state.condition).toBe(CONDITION_MAX)
    expect(state.repair).toBeUndefined()
    expect(registry.get('home', 'building-house-0')).toBeUndefined()
  })

  it('keys structures by settlement + structureId, never colliding across settlements', () => {
    const registry = createSettlementStructureStateRegistry()
    registry.set(applyStructureDamage(registry.resolve('home', 'building-house-0', 0), 50, 0))
    expect(registry.resolve('home', 'building-house-0', 0).condition).toBe(50)
    expect(registry.resolve('other-village', 'building-house-0', 0).condition).toBe(CONDITION_MAX)
  })

  it('serializes only mutated structures and restores them from a snapshot', () => {
    const registry = createSettlementStructureStateRegistry()
    registry.set(applyStructureDamage(registry.resolve('home', 'building-house-0', 0), 30, 0))
    const snapshot = registry.serialize()
    expect(Object.keys(snapshot)).toHaveLength(1)

    const restored = createSettlementStructureStateRegistry(snapshot)
    expect(restored.resolve('home', 'building-house-0', 0).condition).toBe(70)
    // A structure absent from an older/partial save restores pristine.
    expect(restored.resolve('home', 'building-house-1', 0).condition).toBe(CONDITION_MAX)
  })

  it('listForSettlement only returns structures actually stored for that settlement', () => {
    const registry = createSettlementStructureStateRegistry()
    registry.set(applyStructureDamage(registry.resolve('home', 'building-house-0', 0), 20, 0))
    registry.set(applyStructureDamage(registry.resolve('other-village', 'building-house-0', 0), 20, 0))
    expect(registry.listForSettlement('home')).toHaveLength(1)
    expect(registry.listForSettlement('unknown-settlement')).toHaveLength(0)
  })

  it('clear() empties every stored structure', () => {
    const registry = createSettlementStructureStateRegistry()
    registry.set(applyStructureDamage(registry.resolve('home', 'building-house-0', 0), 20, 0))
    registry.clear()
    expect(registry.get('home', 'building-house-0')).toBeUndefined()
  })
})

describe('beginRegistryStructureRepair / contributeRegistryStructureRepairWork', () => {
  it('starts a repair, persists it, and a second contribution completes it', () => {
    const registry = createSettlementStructureStateRegistry()
    registry.set(applyStructureDamage(registry.resolve('home', 'building-house-0', 0), 60, 0))

    const started = beginRegistryStructureRepair(
      registry, policy, 'home', 'building-house-0', 0,
      () => true, () => {},
    )
    expect(started.status).toBe('started')
    expect(registry.get('home', 'building-house-0')?.repair).toBeDefined()

    const requiredWork = registry.get('home', 'building-house-0')!.repair!.requiredWork
    const first = contributeRegistryStructureRepairWork(registry, 'home', 'building-house-0', requiredWork / 2, 1)
    expect(first.completed).toBe(false)
    expect(registry.get('home', 'building-house-0')?.repair).toBeDefined()

    const second = contributeRegistryStructureRepairWork(registry, 'home', 'building-house-0', requiredWork, 2)
    expect(second.completed).toBe(true)
    expect(registry.get('home', 'building-house-0')?.repair).toBeUndefined()
    expect(registry.get('home', 'building-house-0')?.condition).toBe(CONDITION_MAX)
  })

  it('a blocked begin does not store a repair episode', () => {
    const registry = createSettlementStructureStateRegistry()
    registry.set(applyStructureDamage(registry.resolve('home', 'building-house-0', 0), 60, 0))
    const outcome = beginRegistryStructureRepair(
      registry, policy, 'home', 'building-house-0', 0,
      () => false, () => {},
    )
    expect(outcome.status).toBe('blocked')
    expect(registry.get('home', 'building-house-0')?.repair).toBeUndefined()
  })
})
