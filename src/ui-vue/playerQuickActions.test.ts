import { describe, expect, it } from 'vitest'
import type { ActionAvailability } from '../app/actions/actionContracts'
import type { QuickActionsFireAvailability } from './store'
import { FIRE_QUICK_ACTIONS, type FireActionHandlers, visibleFireActions } from './playerQuickActions'

const OK: ActionAvailability = { available: true }
const NOT_OK = (id: string): ActionAvailability => ({ available: false, missing: [{ kind: 'target', id }] })

function fullyAvailable(): QuickActionsFireAvailability {
  return {
    lightBranch: OK,
    lightWoodenTorch: OK,
    buildFirePit: OK,
    buildSimpleFire: OK,
    buildWoodPile: OK,
    buildGrate: OK,
  }
}

function noopHandlers(): FireActionHandlers {
  return {
    onLightBranch: () => ({ ok: true }),
    onLightWoodenTorch: () => ({ ok: true }),
    onBuildFirePit: () => ({ ok: true }),
    onBuildSimpleFire: () => ({ ok: true }),
    onBuildWoodPile: () => ({ ok: true }),
    onBuildGrate: () => ({ ok: true }),
  }
}

describe('visibleFireActions', () => {
  it('always returns the complete catalog, never filtering unavailable entries', () => {
    const avail: QuickActionsFireAvailability = {
      ...fullyAvailable(),
      buildGrate: NOT_OK('grateTarget'),
      lightWoodenTorch: NOT_OK('torchNotLit'),
    }

    const rows = visibleFireActions(avail, noopHandlers())

    expect(rows.map((r) => r.id).sort()).toEqual(FIRE_QUICK_ACTIONS.map((d) => d.id).sort())
  })

  it('sorts available actions before unavailable ones, preserving catalog order within each group', () => {
    const avail: QuickActionsFireAvailability = {
      lightBranch: NOT_OK('torchNotLit'),
      lightWoodenTorch: OK,
      buildFirePit: NOT_OK('firePlacement'),
      buildSimpleFire: OK,
      buildWoodPile: NOT_OK('firePlacement'),
      buildGrate: NOT_OK('grateTarget'),
    }
    // Catalog order is: lightBranch, lightWoodenTorch, buildFirePit, buildSimpleFire, buildWoodPile, buildGrate.
    // Available subset in catalog order: lightWoodenTorch, buildSimpleFire.
    // Unavailable subset in catalog order: lightBranch, buildFirePit, buildWoodPile, buildGrate.

    const rows = visibleFireActions(avail, noopHandlers())

    expect(rows.map((r) => r.id)).toEqual(['lightWoodenTorch', 'buildSimpleFire', 'lightBranch', 'buildFirePit', 'buildWoodPile', 'buildGrate'])
    expect(rows.map((r) => r.available)).toEqual([true, true, false, false, false, false])
  })

  it('exposes the structural missing requirements for an unavailable row', () => {
    const avail: QuickActionsFireAvailability = {
      ...fullyAvailable(),
      buildSimpleFire: {
        available: false,
        missing: [
          { kind: 'capability', capability: 'fire_starting' },
          { kind: 'item', item: 'branch', required: 2, actual: 0 },
        ],
      },
    }

    const rows = visibleFireActions(avail, noopHandlers())
    const row = rows.find((r) => r.id === 'buildSimpleFire')!

    expect(row.available).toBe(false)
    expect(row.missing).toEqual([
      { kind: 'capability', capability: 'fire_starting' },
      { kind: 'item', item: 'branch', required: 2, actual: 0 },
    ])
  })

  it('run() turns a failed execute into a toast describing every missing requirement', () => {
    const handlers: FireActionHandlers = {
      ...noopHandlers(),
      onBuildSimpleFire: () => ({
        ok: false,
        missing: [
          { kind: 'capability', capability: 'fire_starting' },
          { kind: 'item', item: 'branch', required: 2, actual: 1 },
        ],
      }),
    }
    const rows = visibleFireActions(fullyAvailable(), handlers)
    const row = rows.find((r) => r.id === 'buildSimpleFire')!

    const result = row.run()

    expect(result.ok).toBe(false)
    expect(result.kind).toBe('error')
    expect(result.toast).toContain('krzesiwa')
    expect(result.toast).toContain('gałąź')
  })

  it('run() throws instead of silently treating a missing handler as unavailable', () => {
    const handlers = { ...noopHandlers(), onBuildGrate: null }
    const rows = visibleFireActions(fullyAvailable(), handlers)
    const row = rows.find((r) => r.id === 'buildGrate')!

    expect(() => row.run()).toThrow(/buildGrate/)
  })
})
