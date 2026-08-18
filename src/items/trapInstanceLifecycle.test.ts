import { describe, expect, it } from 'vitest'
import { createTrapInstance, trapInstanceFromWorld } from './trapItemInstances'

describe('trap instance lifecycle boundaries (plan 155)', () => {
  it('preserves id and durability from world back to inventory shape', () => {
    const source = createTrapInstance('trap_good')
    source.durability = 3
    const fromWorld = trapInstanceFromWorld(source.id, 'good', source.durability)
    expect(fromWorld).toEqual({
      id: source.id,
      kind: 'trap_good',
      durability: 3,
    })
  })

  it('does not copy world-only trap fields into inventory instances', () => {
    const instance = trapInstanceFromWorld('trap:abc', 'simple', 0.5)
    expect(Object.keys(instance).sort()).toEqual(['durability', 'id', 'kind'])
  })
})
