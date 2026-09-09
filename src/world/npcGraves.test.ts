import { describe, expect, it } from 'vitest'
import {
  createNpcGraves,
  ensureNpcBurialGrave,
  graveIdForDeceased,
} from './npcGraves'

describe('npcGraves (plan npc-011)', () => {
  it('uses a stable grave id per deceased NPC', () => {
    expect(graveIdForDeceased('0_0:npc:3')).toBe('grave:0_0:npc:3')
  })

  it('ensure is idempotent for the same deceased', () => {
    const graves = {
      records: [] as { id: string, deceasedNpcId: string }[],
      ensure(record: { id: string, deceasedNpcId: string }) {
        if (this.records.some((r) => r.deceasedNpcId === record.deceasedNpcId || r.id === record.id)) return false
        this.records.push(record)
        return true
      },
      hasForDeceased(id: string) {
        return this.records.some((r) => r.deceasedNpcId === id)
      },
    }
    expect(ensureNpcBurialGrave({
      graves: graves as never,
      deceasedNpcId: '0_0:npc:0',
      x: 1,
      z: 2,
      yaw: 0.5,
      buriedAtDays: 3,
    })).toBe(true)
    expect(ensureNpcBurialGrave({
      graves: graves as never,
      deceasedNpcId: '0_0:npc:0',
      x: 1,
      z: 2,
      yaw: 0.5,
      buriedAtDays: 3,
    })).toBe(false)
    expect(graves.records).toHaveLength(1)
  })

  it('round-trips records through nodes()', () => {
    const scene = { add: () => {} }
    const graves = createNpcGraves(scene as never, () => 0, [{
      id: graveIdForDeceased('0_0:npc:1'),
      x: 4,
      z: -2,
      yaw: 1,
      deceasedNpcId: '0_0:npc:1',
      buriedAtDays: 2.5,
    }])
    expect(graves.nodes()).toEqual([{
      id: 'grave:0_0:npc:1',
      x: 4,
      z: -2,
      yaw: 1,
      deceasedNpcId: '0_0:npc:1',
      buriedAtDays: 2.5,
    }])
    graves.dispose()
  })
})
