import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './AnimalAgent'
import {
  HERD_SPECIES,
  type HerdMemberLike,
  JUVENILE_SCALE_FACTOR,
  pickHerdLeader,
} from './herdCohesion'

function member(animalId: string, herdId: string, dead = false): HerdMemberLike {
  return { animalId, herdId, isDead: () => dead }
}

describe('pickHerdLeader', () => {
  it('deterministically picks the lexicographically smallest live animalId', () => {
    const herd = [member('deer-5', 'deer-herd-0'), member('deer-2', 'deer-herd-0'), member('deer-9', 'deer-herd-0')]
    expect(pickHerdLeader(herd, 'deer-herd-0')?.animalId).toBe('deer-2')
  })

  it('every follower computing it independently agrees on the same pick', () => {
    const herd = [member('deer-5', 'deer-herd-0'), member('deer-2', 'deer-herd-0')]
    const a = pickHerdLeader(herd, 'deer-herd-0')
    const b = pickHerdLeader([...herd].reverse(), 'deer-herd-0')
    expect(a?.animalId).toBe(b?.animalId)
  })

  it('reassigns to the next-smallest id once the current pick dies', () => {
    const herd = [member('deer-2', 'deer-herd-0', true), member('deer-5', 'deer-herd-0')]
    expect(pickHerdLeader(herd, 'deer-herd-0')?.animalId).toBe('deer-5')
  })

  it('ignores members of other herds', () => {
    const herd = [member('deer-1', 'deer-herd-1'), member('deer-2', 'deer-herd-0')]
    expect(pickHerdLeader(herd, 'deer-herd-0')?.animalId).toBe('deer-2')
  })

  it('returns null when the herd is empty or fully dead', () => {
    expect(pickHerdLeader([], 'deer-herd-0')).toBeNull()
    expect(pickHerdLeader([member('deer-2', 'deer-herd-0', true)], 'deer-herd-0')).toBeNull()
  })
})

describe('lookup tables stay in sync with ANIMAL_DEFS', () => {
  it('every HERD_SPECIES key is a real AnimalKind', () => {
    for (const kind of Object.keys(HERD_SPECIES)) {
      expect(ANIMAL_DEFS).toHaveProperty(kind)
    }
  })

  it('every JUVENILE_SCALE_FACTOR key is a real AnimalKind with a factor in (0,1)', () => {
    for (const [kind, factor] of Object.entries(JUVENILE_SCALE_FACTOR)) {
      expect(ANIMAL_DEFS).toHaveProperty(kind)
      expect(factor).toBeGreaterThan(0)
      expect(factor).toBeLessThan(1)
    }
  })
})
