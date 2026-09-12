import { describe, expect, it } from 'vitest'
import { applyStructureDamage, pristineStructureState, STRUCTURE_REPAIR_RESUME_PRESSURE } from './structureCondition'
import { createNpcStructureRepairHooks } from './structureRepairCandidates'
import { createSettlementStructureStateRegistry } from './structureStateRegistry'

describe('createNpcStructureRepairHooks.pressure (plan settlements-npcs-034)', () => {
  const settlementId = 'home'
  const structureId = 'building-house-0'
  const position = { x: 0, y: 0, z: 0 }

  function hooksWithCondition(condition: number, registry = createSettlementStructureStateRegistry()) {
    const damaged = applyStructureDamage(pristineStructureState(settlementId, structureId, 0), 100 - condition, 0)
    registry.set(damaged)
    return createNpcStructureRepairHooks(settlementId, 0, position, registry)!
  }

  it('returns 0 when required repair materials are missing', () => {
    const registry = createSettlementStructureStateRegistry()
    const hooks = hooksWithCondition(40, registry)
    const pressure = hooks.pressure(0, () => false)
    expect(pressure).toBe(0)
  })

  it('returns non-zero pressure when quote materials are all available', () => {
    const registry = createSettlementStructureStateRegistry()
    const hooks = hooksWithCondition(40, registry)
    const pressure = hooks.pressure(0, () => true)
    expect(pressure).toBeGreaterThan(0)
  })

  it('returns resume pressure during an active repair without re-checking materials', () => {
    const registry = createSettlementStructureStateRegistry()
    const hooks = hooksWithCondition(40, registry)
    const started = hooks.beginRepair(0, () => true, () => {})
    expect(started.status).toBe('started')
    const pressure = hooks.pressure(0, () => false)
    expect(pressure).toBe(STRUCTURE_REPAIR_RESUME_PRESSURE)
  })
})
