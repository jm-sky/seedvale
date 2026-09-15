import { describe, expect, it } from 'vitest'
import type { ConfiguredPredatorSpawner } from './closedPredatorPressure'
import {
  CLOSED_PREDATOR_PRESSURE_RADIUS,
  closedPressurePlacementSeed,
  closedPressureSpawnerId,
  resolveClosedPredatorPressure,
} from './closedPredatorPressure'

function site(id: string, x = 0, z = 0, footprintRadius = 40) {
  return { id, x, z, footprintRadius }
}

function spawner(overrides: Partial<ConfiguredPredatorSpawner> & Pick<ConfiguredPredatorSpawner, 'id'>): ConfiguredPredatorSpawner {
  return {
    x: 30,
    z: 0,
    type: 'rockDen',
    kind: 'wolf',
    maxPreyCount: 2,
    ...overrides,
  }
}

function addedCapacity(
  existing: readonly ConfiguredPredatorSpawner[],
  plan: ReturnType<typeof resolveClosedPredatorPressure>,
): number {
  const bumps = plan.capacityBumps.reduce((sum, bump) => {
    const original = existing.find((entry) => entry.id === bump.id)?.maxPreyCount ?? 0
    return sum + (bump.maxPreyCount - original)
  }, 0)
  const extras = plan.extraSpawners.reduce((sum, extra) => sum + extra.maxPreyCount, 0)
  return bumps + extras
}

describe('resolveClosedPredatorPressure', () => {
  it('fills only the missing capacity when natural pressure is below target', () => {
    const existing = [spawner({ id: 'home:cave', maxPreyCount: 2 })]
    const plan = resolveClosedPredatorPressure(existing, [site('1_0')])
    expect(addedCapacity(existing, plan)).toBe(1)
    expect(plan.extraSpawners).toHaveLength(0)
    expect(plan.capacityBumps).toEqual([{ id: 'home:cave', maxPreyCount: 3 }])
  })

  it('adds a minimum predator habitat when the radius has no predators', () => {
    const deer = spawner({ id: 'home:thicket', type: 'thicket', kind: 'deer', maxPreyCount: 3 })
    const plan = resolveClosedPredatorPressure([deer], [site('1_0')])
    expect(plan.capacityBumps).toEqual([])
    expect(plan.extraSpawners).toHaveLength(1)
    expect(plan.extraSpawners[0]).toMatchObject({
      id: closedPressureSpawnerId('1_0', 0),
      kind: 'wolf',
      type: 'rockDen',
    })
    expect(plan.extraSpawners[0]!.maxPreyCount).toBeGreaterThanOrEqual(2)
    expect(plan.extraSpawners.every((extra) => extra.kind !== 'deer')).toBe(true)
  })

  it('does not add capacity when natural pressure is already at or above the closed target', () => {
    const existing = [
      spawner({ id: 'home:cave', maxPreyCount: 2 }),
      spawner({ id: 'home:cave:bear', kind: 'bear', type: 'rockDen', maxPreyCount: 2, x: 20 }),
    ]
    const plan = resolveClosedPredatorPressure(existing, [site('1_0')])
    expect(addedCapacity(existing, plan)).toBe(0)
    expect(plan.extraSpawners).toHaveLength(0)
    expect(plan.capacityBumps).toHaveLength(0)
  })

  it('does not increase non-predator fauna', () => {
    const deer = spawner({ id: 'home:thicket', type: 'thicket', kind: 'deer', maxPreyCount: 3 })
    const plan = resolveClosedPredatorPressure([deer], [site('1_0')])
    expect(plan.capacityBumps.some((bump) => bump.id === deer.id)).toBe(false)
    expect(plan.extraSpawners.every((extra) => extra.kind !== 'deer')).toBe(true)
  })

  it('does not mutate wolfDen scenario spawners', () => {
    const den = spawner({ id: 'home:wolfDen', type: 'wolfDen', kind: 'wolf', maxPreyCount: 2 })
    const plan = resolveClosedPredatorPressure([den], [site('1_0')])
    expect(plan.capacityBumps.some((bump) => bump.id === den.id)).toBe(false)
  })

  it('does not stack overlapping closed-settlement bonuses', () => {
    const existing = [spawner({ id: 'home:cave', x: 0, z: 0, maxPreyCount: 2 })]
    const closeA = site('1_0', 0, 0)
    const closeB = site('1_1', 10, 0)
    expect(Math.hypot(closeA.x - closeB.x, closeA.z - closeB.z)).toBeLessThan(CLOSED_PREDATOR_PRESSURE_RADIUS)
    const together = resolveClosedPredatorPressure(existing, [closeB, closeA])
    const onlyA = resolveClosedPredatorPressure(existing, [closeA])
    expect(addedCapacity(existing, together)).toBe(addedCapacity(existing, onlyA))
  })

  it('uses stable extra ids independent of input/processing order', () => {
    const existing: ConfiguredPredatorSpawner[] = []
    const farA = site('2_0', 0, 0)
    const farB = site('0_2', 0, 400)
    const forward = resolveClosedPredatorPressure(existing, [farA, farB])
    const reverse = resolveClosedPredatorPressure(existing, [farB, farA])
    expect(forward.extraSpawners.map((extra) => extra.id).sort()).toEqual(
      reverse.extraSpawners.map((extra) => extra.id).sort(),
    )
    expect(new Set(forward.extraSpawners.map((extra) => extra.id)).size).toBe(forward.extraSpawners.length)
  })

  it('ignores live counts — only configured maxPreyCount matters', () => {
    const existing = [spawner({ id: 'home:cave', maxPreyCount: 2 })]
    const a = resolveClosedPredatorPressure(existing, [site('1_0')])
    const b = resolveClosedPredatorPressure(existing, [site('1_0')])
    expect(a).toEqual(b)
  })

  it('derives a stable dedicated placement seed from world seed + extra id', () => {
    const id = closedPressureSpawnerId('1_0', 0)
    expect(closedPressurePlacementSeed(99, id)).toBe(closedPressurePlacementSeed(99, id))
    expect(closedPressurePlacementSeed(99, id)).not.toBe(closedPressurePlacementSeed(100, id))
    expect(closedPressurePlacementSeed(99, id)).not.toBe(
      closedPressurePlacementSeed(99, closedPressureSpawnerId('1_1', 0)),
    )
  })
})
