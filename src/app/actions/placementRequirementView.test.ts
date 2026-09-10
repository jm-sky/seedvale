import { describe, expect, it } from 'vitest'
import { derivePlacementPresentation, missingMaterialsReason, type PlacementRequirementView } from './placementRequirementView'

function beam(overrides: Partial<PlacementRequirementView> = {}): PlacementRequirementView {
  return {
    kind: 'beam',
    label: 'Belka',
    required: 7,
    inInventory: 2,
    nearbyWorld: 2,
    available: 4,
    missing: 3,
    ...overrides,
  }
}

describe('derivePlacementPresentation (plan ui-input-016)', () => {
  it('marks a legal, fully supplied site as ready', () => {
    expect(derivePlacementPresentation({
      geometryOk: true,
      geometryReason: '',
      requirements: [beam({ available: 7, missing: 0, inInventory: 4, nearbyWorld: 3 })],
    })).toMatchObject({
      valid: true,
      state: 'ready',
      canConfirm: true,
      confirmKind: 'place',
      reasonLabel: '',
    })
  })

  it('does not treat missing materials as geometry-invalid', () => {
    const view = derivePlacementPresentation({
      geometryOk: true,
      geometryReason: '',
      requirements: [beam()],
    })
    expect(view.state).toBe('preparation')
    expect(view.valid).toBe(false)
    expect(view.canConfirm).toBe(false)
    expect(view.reasonLabel).toContain('Belka')
  })

  it('keeps physically illegal sites invalid even when materials are present', () => {
    expect(derivePlacementPresentation({
      geometryOk: false,
      geometryReason: 'Tu jest za mokro.',
      requirements: [beam({ available: 7, missing: 0 })],
    })).toMatchObject({
      state: 'invalid',
      canConfirm: false,
      confirmKind: 'none',
      reasonLabel: 'Tu jest za mokro.',
    })
  })

  it('maps house slope preparation to a confirmable prepareTerrain action', () => {
    expect(derivePlacementPresentation({
      geometryOk: false,
      geometryReason: 'Teren jest zbyt stromy.',
      preparation: { reasonLabel: 'Przygotuj teren, aby postawić chatę.', canConfirm: true },
    })).toMatchObject({
      state: 'preparation',
      canConfirm: true,
      confirmKind: 'prepareTerrain',
    })
  })

  it('blocks terrain-prep confirm when digging capability is missing', () => {
    expect(derivePlacementPresentation({
      geometryOk: false,
      geometryReason: 'Teren jest zbyt stromy.',
      missingCapabilityReason: 'Potrzebujesz łopaty.',
      preparation: { reasonLabel: 'Potrzebujesz łopaty.', canConfirm: false },
    })).toMatchObject({
      state: 'preparation',
      canConfirm: false,
      confirmKind: 'none',
    })
  })
})

describe('missingMaterialsReason', () => {
  it('lists only kinds that are actually short', () => {
    expect(missingMaterialsReason([
      beam(),
      { ...beam(), kind: 'stone', label: 'Kamień', required: 2, available: 2, missing: 0 },
    ])).toBe('Brakuje: 3× Belka.')
  })
})
