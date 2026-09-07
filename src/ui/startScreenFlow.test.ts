import { describe, expect, it } from 'vitest'
import type { SaveManagementEntry } from '../persistence/saveSlots'
import type { StartScreenChoice } from './createStartScreen'
import { resolveStartScreenAction, shouldOpenStartScreen } from './startScreenFlow'

function healthy(id: string): SaveManagementEntry {
  return { status: 'ok', id, name: id, savedAt: 1, seed: 42, playerName: 'Anna', elapsedDays: 0 }
}

const broken: SaveManagementEntry = { status: 'invalid', id: 'slot_broken' }

describe('shouldOpenStartScreen (plan ui-input-011 §1)', () => {
  it('opens the Start Screen for a confirmed-empty save listing instead of creating a world', () => {
    expect(shouldOpenStartScreen({ ok: true, entries: [] })).toBe(true)
  })

  it('opens the Start Screen for a listing with saves', () => {
    expect(shouldOpenStartScreen({ ok: true, entries: [healthy('a')] })).toBe(true)
  })

  it('keeps the persistence-004 §4 distinction: a storage failure is not the empty state', () => {
    expect(shouldOpenStartScreen({ ok: false })).toBe(false)
  })
})

describe('resolveStartScreenAction (plan ui-input-011 §2)', () => {
  it('stays on the Start Screen after deleting the final save', () => {
    const choice: StartScreenChoice = { type: 'delete', id: 'a' }
    expect(resolveStartScreenAction(choice, [], 'a')).toEqual({ kind: 'stay' })
  })

  it('stays on the Start Screen after deleting one of several saves', () => {
    const choice: StartScreenChoice = { type: 'delete', id: 'a' }
    expect(resolveStartScreenAction(choice, [healthy('b')], null)).toEqual({ kind: 'stay' })
  })

  it('never creates a world for "continue" when there is nothing healthy left', () => {
    expect(resolveStartScreenAction({ type: 'continue' }, [], null)).toEqual({ kind: 'stay' })
    expect(resolveStartScreenAction({ type: 'continue' }, [broken], null)).toEqual({ kind: 'stay' })
  })

  it('continues into the active slot when one exists', () => {
    expect(resolveStartScreenAction({ type: 'continue' }, [healthy('a')], 'a')).toEqual({ kind: 'loadSave', id: 'a' })
  })

  it('loads an explicitly picked slot', () => {
    expect(resolveStartScreenAction({ type: 'load', id: 'b' }, [healthy('a'), healthy('b')], 'a'))
      .toEqual({ kind: 'loadSave', id: 'b' })
  })

  it('carries save name, player name and the unresolved seed intent separately (plan §4/§6)', () => {
    const choice: StartScreenChoice = {
      type: 'new',
      name: 'Gra 1',
      playerName: 'Anna',
      seedChoice: { kind: 'generate' },
    }
    expect(resolveStartScreenAction(choice, [], null)).toEqual({
      kind: 'newGame',
      name: 'Gra 1',
      playerName: 'Anna',
      // Still `generate` — resolving it (and materializing a SeedRecord) is
      // `main.ts`'s job *after* the player confirmed, never a side effect of
      // rendering or deciding.
      seedChoice: { kind: 'generate' },
    })
  })

  it('keeps player name independent of the save name', () => {
    const action = resolveStartScreenAction(
      { type: 'new', name: 'Wyprawa', playerName: 'Jan', seedChoice: { kind: 'existing', seed: 7 } },
      [healthy('a')],
      'a',
    )
    expect(action).toEqual({
      kind: 'newGame',
      name: 'Wyprawa',
      playerName: 'Jan',
      seedChoice: { kind: 'existing', seed: 7 },
    })
  })
})
