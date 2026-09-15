import { describe, expect, it } from 'vitest'
import { Inventory, snapshotInventoryContents } from '../items/Inventory'
import { createTentInstance, type ItemInstance } from '../items/itemInstances'
import { createLiquidContainerInstance, fillLiquidContainer } from '../items/liquidContainer'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import { createExpeditionAssignments } from './createExpeditionAssignments'
import { provisionExpeditionAssignment, readyExpeditionAssignment } from './expeditionProvisioning'

function filledWaterskin(id: string): ItemInstance {
  const empty = { ...createLiquidContainerInstance('waterskin_medium'), id }
  return fillLiquidContainer(empty, 'water')!
}

function stockSource(opts?: { omit?: string, extraMeat?: number, extraFish?: number, maxWeight?: number }): Inventory {
  const source = new Inventory({}, Infinity)
  const addCount = (kind: Parameters<Inventory['add']>[0], n: number) => {
    if (opts?.omit === kind) return
    source.add(kind, n)
  }
  addCount('pickaxe', 3)
  addCount('blanket', 3)
  addCount('bandage', 6)
  addCount('shovel', 1)
  addCount('firestarter', 1)
  addCount('dried_meat', opts?.extraMeat ?? 9)
  addCount('dried_fish', opts?.extraFish ?? 0)
  if (opts?.omit !== 'knife') {
    for (const id of ['knife-a', 'knife-b', 'knife-c']) {
      source.addInstance({ ...createWeaponInstance('knife'), id })
    }
  }
  if (opts?.omit !== 'waterskin_medium') {
    for (const id of ['skin-a', 'skin-b', 'skin-c']) {
      source.addInstance(filledWaterskin(id))
    }
  }
  if (opts?.omit !== 'tent') source.addInstance({ ...createTentInstance(80, 'tent-leader') })
  return source
}

function trio() {
  const ids = ['s:npc:0', 's:npc:1', 's:npc:2'] as const
  const states = Object.fromEntries(ids.map((id) => [id, createNpcAuthoritativeState(id, 0)]))
  return { ids, states }
}

describe('expeditionProvisioning', () => {
  it('transfers the exact per-NPC and shared manifest, preferring dried meat then fish', () => {
    const { ids, states } = trio()
    const assignments = createExpeditionAssignments()
    const assignment = assignments.createForming({
      sponsorSettlementId: '0_0',
      destination: { kind: 'location', locationId: 'mine' },
      memberNpcIds: ids,
      createdAtDays: 1,
    })!
    const source = stockSource({ extraMeat: 5, extraFish: 8 })
    const result = provisionExpeditionAssignment({
      assignments,
      assignmentId: assignment.id,
      source,
      personalInventory: (id) => states[id]!.personalInventory,
      nowDays: 4,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.assignment.state).toBe('provisioned')
    expect(source.count('pickaxe')).toBe(0)
    expect(source.count('dried_meat')).toBe(0)
    expect(source.count('dried_fish')).toBe(4)
    expect(states[ids[0]]!.personalInventory.count('dried_meat')).toBe(3)
    expect(states[ids[1]]!.personalInventory.count('dried_meat')).toBe(2)
    expect(states[ids[1]]!.personalInventory.count('dried_fish')).toBe(1)
    expect(states[ids[2]]!.personalInventory.count('dried_fish')).toBe(3)
    expect(states[ids[0]]!.personalInventory.getInstance('tent-leader')?.kind).toBe('tent')
    expect(states[ids[0]]!.personalInventory.count('shovel')).toBe(1)
    expect(states[ids[1]]!.personalInventory.count('shovel')).toBe(0)
    expect(states[ids[0]]!.personalInventory.getInstance('skin-a')?.kind).toBe('waterskin_medium')
    expect(states[ids[0]]!.personalInventory.getInstance('knife-a')?.kind).toBe('knife')

    const again = provisionExpeditionAssignment({
      assignments,
      assignmentId: assignment.id,
      source,
      personalInventory: (id) => states[id]!.personalInventory,
      nowDays: 5,
    })
    expect(again.ok).toBe(true)
    expect(source.count('dried_fish')).toBe(4)
    expect(readyExpeditionAssignment(assignments, assignment.id, 6).ok).toBe(true)
    expect(assignments.find(assignment.id)?.state).toBe('ready')
  })

  it('rolls back when a required item is missing and when destination capacity fails', () => {
    const { ids, states } = trio()
    const assignments = createExpeditionAssignments()
    const assignment = assignments.createForming({
      sponsorSettlementId: '0_0',
      destination: { kind: 'location', locationId: 'mine' },
      memberNpcIds: ids,
      createdAtDays: 1,
    })!
    const missing = stockSource({ omit: 'tent' })
    const missingSnap = snapshotInventoryContents(missing)
    const missingResult = provisionExpeditionAssignment({
      assignments,
      assignmentId: assignment.id,
      source: missing,
      personalInventory: (id) => states[id]!.personalInventory,
      nowDays: 1,
    })
    expect(missingResult).toEqual({ ok: false, reason: 'missing-equipment' })
    expect(snapshotInventoryContents(missing)).toEqual(missingSnap)
    expect(states[ids[0]]!.personalInventory.count('pickaxe')).toBe(0)

    const tight = createNpcAuthoritativeState('s:npc:0', 0)
    tight.personalInventory.setBaseMaxWeight(0.001)
    const capacityStates: Record<string, typeof tight> = { ...states, 's:npc:0': tight }
    const source = stockSource()
    const sourceSnap = snapshotInventoryContents(source)
    const capacityResult = provisionExpeditionAssignment({
      assignments,
      assignmentId: assignment.id,
      source,
      personalInventory: (id) => capacityStates[id]!.personalInventory,
      nowDays: 1,
    })
    expect(capacityResult).toEqual({ ok: false, reason: 'inventory-capacity' })
    expect(snapshotInventoryContents(source)).toEqual(sourceSnap)
    expect(assignment.state).toBe('forming')
  })

  it('returns missing-settlement-storage when the source inventory is absent', () => {
    const assignments = createExpeditionAssignments()
    const assignment = assignments.createForming({
      sponsorSettlementId: '0_0',
      destination: { kind: 'settlement', settlementId: '1_0' },
      memberNpcIds: ['a', 'b', 'c'],
      createdAtDays: 1,
    })!
    expect(provisionExpeditionAssignment({
      assignments,
      assignmentId: assignment.id,
      source: undefined,
      personalInventory: () => new Inventory(),
      nowDays: 1,
    })).toEqual({ ok: false, reason: 'missing-settlement-storage' })
  })
})
