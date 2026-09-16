import { describe, expect, it } from 'vitest'
import {
  depleteRenewableWorldItem,
  isRenewableWorldItem,
  isRenewableWorldItemAvailable,
  isWorldItemPlacementAvailable,
  pruneRenewableWorldItems,
  renewableRespawnDays,
  type RenewableWorldItemOverrides,
} from './renewableWorldItems'

describe('renewableWorldItems (plan items-player-043)', () => {
  it('marks only mint/yarrow/herb as renewable with the V1 respawn table', () => {
    expect(isRenewableWorldItem('mint')).toBe(true)
    expect(isRenewableWorldItem('yarrow')).toBe(true)
    expect(isRenewableWorldItem('herb')).toBe(true)
    expect(isRenewableWorldItem('stone')).toBe(false)
    expect(isRenewableWorldItem('mushroom')).toBe(false)
    expect(renewableRespawnDays('mint')).toBe(1.5)
    expect(renewableRespawnDays('yarrow')).toBe(2)
    expect(renewableRespawnDays('herb')).toBe(7)
  })

  it('treats an absent override as available', () => {
    const overrides: RenewableWorldItemOverrides = {}
    expect(isRenewableWorldItemAvailable(overrides, '0:0:f1', 5)).toBe(true)
  })

  it('hides mint until 1.5 days and restores at the boundary', () => {
    const overrides: RenewableWorldItemOverrides = {}
    expect(depleteRenewableWorldItem(overrides, '0:0:f1', 'mint', 10)).toBe(true)
    expect(isRenewableWorldItemAvailable(overrides, '0:0:f1', 10)).toBe(false)
    expect(isRenewableWorldItemAvailable(overrides, '0:0:f1', 11.49)).toBe(false)
    expect(isRenewableWorldItemAvailable(overrides, '0:0:f1', 11.5)).toBe(true)
  })

  it('uses 2.0 days for yarrow and 7.0 for rare herb', () => {
    const overrides: RenewableWorldItemOverrides = {}
    depleteRenewableWorldItem(overrides, 'y', 'yarrow', 0)
    depleteRenewableWorldItem(overrides, 'h', 'herb', 0)
    expect(isRenewableWorldItemAvailable(overrides, 'y', 1.99)).toBe(false)
    expect(isRenewableWorldItemAvailable(overrides, 'y', 2)).toBe(true)
    expect(isRenewableWorldItemAvailable(overrides, 'h', 6.99)).toBe(false)
    expect(isRenewableWorldItemAvailable(overrides, 'h', 7)).toBe(true)
  })

  it('rejects a second deplete while still unavailable', () => {
    const overrides: RenewableWorldItemOverrides = {}
    expect(depleteRenewableWorldItem(overrides, '0:0:f1', 'mint', 3)).toBe(true)
    expect(depleteRenewableWorldItem(overrides, '0:0:f1', 'mint', 3)).toBe(false)
  })

  it('prunes expired overrides', () => {
    const overrides: RenewableWorldItemOverrides = { a: 10, b: 100 }
    pruneRenewableWorldItems(overrides, 10)
    expect(overrides.a).toBeUndefined()
    expect(overrides.b).toBe(100)
  })

  it('keeps finite collected ids permanently unavailable', () => {
    const collected = new Set(['0:0:0'])
    const overrides: RenewableWorldItemOverrides = {}
    expect(isWorldItemPlacementAvailable(
      { id: '0:0:0', kind: 'stone' },
      collected,
      overrides,
      99,
    )).toBe(false)
  })

  it('gates renewable placements by overlay while finite kinds ignore it', () => {
    const overrides: RenewableWorldItemOverrides = {}
    depleteRenewableWorldItem(overrides, '0:0:f2', 'mint', 1)
    expect(isWorldItemPlacementAvailable(
      { id: '0:0:f2', kind: 'mint' },
      new Set(),
      overrides,
      1,
    )).toBe(false)
    expect(isWorldItemPlacementAvailable(
      { id: '0:0:f2', kind: 'mint' },
      new Set(),
      overrides,
      3,
    )).toBe(true)
    expect(isWorldItemPlacementAvailable(
      { id: '0:0:1', kind: 'shell' },
      new Set(),
      overrides,
      1,
    )).toBe(true)
  })
})
