import { describe, expect, it } from 'vitest'
import { createFoodBatch } from './foodFreshness'
import { resolveRawMeatSafetyRisk } from './foodSafety'

describe('resolveRawMeatSafetyRisk (plan items-player-023)', () => {
  it('returns null for non-meat food', () => {
    const batch = createFoodBatch(1, 0, 1)
    expect(resolveRawMeatSafetyRisk('mushroom', batch, 0)).toBeNull()
  })

  it('returns null for processed meat even with preserved sourceSpecies provenance', () => {
    const batch = createFoodBatch(1, 0, 1, 'boar')
    expect(resolveRawMeatSafetyRisk('roasted_meat', batch, 0)).toBeNull()
    expect(resolveRawMeatSafetyRisk('dried_meat', batch, 0)).toBeNull()
  })

  it('generic raw_meat with no provenance has a deterministic fallback profile', () => {
    const batch = createFoodBatch(1, 0, 1)
    const risk = resolveRawMeatSafetyRisk('raw_meat', batch, 0)
    expect(risk).not.toBeNull()
    expect(risk!.chance).toBeGreaterThan(0)
    expect(risk!.severity).toBeGreaterThan(0)
  })

  it('species-specific raw meat differs by species (low vs high risk)', () => {
    const rabbitBatch = createFoodBatch(1, 0, 1, 'rabbit')
    const wolfBatch = createFoodBatch(1, 0, 1, 'wolf')
    const rabbitRisk = resolveRawMeatSafetyRisk('rabbit_meat', rabbitBatch, 0)!
    const wolfRisk = resolveRawMeatSafetyRisk('wolf_meat', wolfBatch, 0)!
    expect(wolfRisk.chance).toBeGreaterThan(rabbitRisk.chance)
    expect(wolfRisk.severity).toBeGreaterThan(rabbitRisk.severity)
  })

  it('sourceSpecies on the batch takes precedence over the kind mapping', () => {
    // deer_meat batch mislabeled with wolf provenance (e.g. after a future
    // merge/transfer edge case) — the batch wins.
    const batch = createFoodBatch(1, 0, 1, 'wolf')
    const kindRisk = resolveRawMeatSafetyRisk('deer_meat', createFoodBatch(1, 0, 1, 'deer'), 0)!
    const batchRisk = resolveRawMeatSafetyRisk('deer_meat', batch, 0)!
    expect(batchRisk.chance).not.toBe(kindRisk.chance)
  })

  it('medium freshness risk is greater than fresh for the same species', () => {
    // freshDurationDays/mediumDurationDays for deer_meat is 1/1 (itemCatalog.ts).
    const batch = createFoodBatch(1, 0, 1, 'deer')
    const freshRisk = resolveRawMeatSafetyRisk('deer_meat', batch, 0.5)!
    const mediumRisk = resolveRawMeatSafetyRisk('deer_meat', batch, 1.5)!
    expect(mediumRisk.chance).toBeGreaterThan(freshRisk.chance)
    expect(mediumRisk.severity).toBe(freshRisk.severity)
  })

  it('spoiled raw meat returns null rather than an elevated risk', () => {
    const batch = createFoodBatch(1, 0, 1, 'deer')
    expect(resolveRawMeatSafetyRisk('deer_meat', batch, 5)).toBeNull()
  })

  it('a missing batch treats the food as fresh rather than throwing', () => {
    expect(resolveRawMeatSafetyRisk('raw_meat', undefined, 0)).not.toBeNull()
  })
})
