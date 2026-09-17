/** Plan quests-progression-056 — rollback-safe exact-instance transfer. */

import { describe, expect, it } from 'vitest'
import type { ItemInstance } from '../../items/itemInstances'
import { withdrawInstanceRollbackSafe } from './containerInstanceTransfer'

function fakeStore(initial: ItemInstance[]) {
  const contents = [...initial]
  const depositCalls: ItemInstance[] = []
  return {
    contents,
    depositCalls,
    withdrawInstance(_containerId: string, instanceId: string): ItemInstance | null {
      const index = contents.findIndex((instance) => instance.id === instanceId)
      if (index === -1) return null
      const [instance] = contents.splice(index, 1)
      return instance ?? null
    },
    depositInstance(_containerId: string, instance: ItemInstance): boolean {
      depositCalls.push(instance)
      contents.push(instance)
      return true
    },
  }
}

describe('withdrawInstanceRollbackSafe', () => {
  it('moves the exact instance id from source to destination on success', () => {
    const instance: ItemInstance = { id: 'quest:bandit-treasure:cave:ledger', kind: 'bandit_ledger' }
    const store = fakeStore([instance])
    const added: ItemInstance[] = []
    const destination = { addInstance: (i: ItemInstance) => { added.push(i); return true } }

    const result = withdrawInstanceRollbackSafe(store, 'box', instance.id, destination)

    expect(result).toBe(instance)
    expect(added).toEqual([instance])
    expect(store.contents).toEqual([])
    expect(store.depositCalls).toEqual([])
  })

  it('restores the exact same instance to source when the destination add fails, without a second withdraw', () => {
    const instance: ItemInstance = { id: 'quest:bandit-treasure:cave:valuable', kind: 'marked_valuable' }
    const store = fakeStore([instance])
    const destination = { addInstance: () => false }

    const result = withdrawInstanceRollbackSafe(store, 'box', instance.id, destination)

    expect(result).toBeNull()
    expect(store.depositCalls).toEqual([instance])
    expect(store.contents).toEqual([instance])
  })

  it('returns null without touching the destination when the source has no such instance', () => {
    const store = fakeStore([])
    const added: ItemInstance[] = []
    const destination = { addInstance: (i: ItemInstance) => { added.push(i); return true } }

    const result = withdrawInstanceRollbackSafe(store, 'box', 'missing', destination)

    expect(result).toBeNull()
    expect(added).toEqual([])
  })

  it('throws rather than silently losing the item when the rollback deposit itself fails', () => {
    const instance: ItemInstance = { id: 'coin-like', kind: 'bandit_ledger' }
    const store = {
      withdrawInstance: () => instance,
      depositInstance: () => false,
    }
    const destination = { addInstance: () => false }

    expect(() => withdrawInstanceRollbackSafe(store, 'box', instance.id, destination)).toThrow()
  })
})
