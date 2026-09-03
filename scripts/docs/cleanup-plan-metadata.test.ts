import { describe, expect, it } from 'vitest'
import { findDuplicateRenames, pickCanonical } from './cleanup-plan-metadata.js'

describe('pickCanonical', () => {
  it('keeps the earlier Created date as canonical', () => {
    const a = { file: 'npc-005-a.md', domain: 'npc', id: 5, created: '2026-08-01' }
    const b = { file: 'npc-005-b.md', domain: 'npc', id: 5, created: '2026-09-01' }

    expect(pickCanonical(a, b)).toEqual({ canonical: a, duplicate: b })
    expect(pickCanonical(b, a)).toEqual({ canonical: a, duplicate: b })
  })

  it('throws rather than guess when Created dates are equal and git history is unavailable', () => {
    const a = { file: 'npc-005-a.md', domain: 'npc', id: 5, created: '2026-08-01' }
    const b = { file: 'npc-005-b.md', domain: 'npc', id: 5, created: '2026-08-01' }

    expect(() => pickCanonical(a, b)).toThrow(/Cannot safely determine/)
  })

  it('throws rather than guess when neither plan has a Created date', () => {
    const a = { file: 'npc-005-a.md', domain: 'npc', id: 5 }
    const b = { file: 'npc-005-b.md', domain: 'npc', id: 5 }

    expect(() => pickCanonical(a, b)).toThrow(/Cannot safely determine/)
  })
})

describe('findDuplicateRenames', () => {
  it('reassigns the newer duplicate to the next available ID in its domain', () => {
    const entries = [
      { file: 'fauna-003-wolf-settlement-entry.md', domain: 'fauna', id: 3, created: '2026-08-01' },
      { file: 'fauna-003-horse-riding.md', domain: 'fauna', id: 3, created: '2026-08-20' },
      { file: 'fauna-004-sheep.md', domain: 'fauna', id: 4, created: '2026-08-05' },
    ]

    const renames = findDuplicateRenames(entries)

    expect(renames).toEqual([
      {
        from: 'fauna-003-horse-riding.md',
        to: 'fauna-005-horse-riding.md',
        domain: 'fauna',
        oldId: 'fauna-003',
        newId: 'fauna-005',
      },
    ])
  })

  it('returns nothing when there are no duplicates', () => {
    const entries = [
      { file: 'npc-001-a.md', domain: 'npc', id: 1, created: '2026-08-01' },
      { file: 'npc-002-b.md', domain: 'npc', id: 2, created: '2026-08-02' },
    ]

    expect(findDuplicateRenames(entries)).toEqual([])
  })

  it('throws when three plans share the same ID', () => {
    const entries = [
      { file: 'npc-001-a.md', domain: 'npc', id: 1, created: '2026-08-01' },
      { file: 'npc-001-b.md', domain: 'npc', id: 1, created: '2026-08-02' },
      { file: 'npc-001-c.md', domain: 'npc', id: 1, created: '2026-08-03' },
    ]

    expect(() => findDuplicateRenames(entries)).toThrow(/More than two plans share ID/)
  })

  it('is idempotent: rerunning on the already-fixed set finds nothing more', () => {
    const entries = [
      { file: 'fauna-003-wolf-settlement-entry.md', domain: 'fauna', id: 3, created: '2026-08-01' },
      { file: 'fauna-005-horse-riding.md', domain: 'fauna', id: 5, created: '2026-08-20' },
      { file: 'fauna-004-sheep.md', domain: 'fauna', id: 4, created: '2026-08-05' },
    ]

    expect(findDuplicateRenames(entries)).toEqual([])
  })
})
