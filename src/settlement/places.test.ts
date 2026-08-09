import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { SettlementLandmarks } from './props'
import { workplaceFor } from './places'

function makeLandmarks(overrides: Partial<SettlementLandmarks> = {}): SettlementLandmarks {
  return {
    well: new Vector3(1, 0, 1),
    stockpile: new Vector3(2, 0, 2),
    garden: new Vector3(3, 0, 3),
    market: new Vector3(4, 0, 4),
    homes: [],
    trees: [],
    dockRoute: [],
    ...overrides,
  }
}

describe('workplaceFor', () => {
  it('farmer -> garden', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'farmer', landmarks, 0)?.position).toBe(landmarks.garden)
  })

  it('trader -> market', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'trader', landmarks, 0)?.position).toBe(landmarks.market)
  })

  it('guard -> well', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'guard', landmarks, 0)?.position).toBe(landmarks.well)
  })

  it('miner -> stockpile', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'miner', landmarks, 0)?.position).toBe(landmarks.stockpile)
  })

  it('fisher -> dock when present, else falls back to well', () => {
    const withDock = makeLandmarks({ dock: new Vector3(9, 0, 9) })
    expect(workplaceFor('s1', 'fisher', withDock, 0)?.position).toBe(withDock.dock)

    const withoutDock = makeLandmarks()
    expect(workplaceFor('s1', 'fisher', withoutDock, 0)?.position).toBe(withoutDock.well)
  })

  it('woodcutter -> round-robin tree, null if no trees', () => {
    const trees = [new Vector3(0, 0, 0), new Vector3(5, 0, 5)]
    const landmarks = makeLandmarks({ trees })
    expect(workplaceFor('s1', 'woodcutter', landmarks, 0)?.position).toBe(trees[0])
    expect(workplaceFor('s1', 'woodcutter', landmarks, 1)?.position).toBe(trees[1])
    expect(workplaceFor('s1', 'woodcutter', landmarks, 2)?.position).toBe(trees[0])

    expect(workplaceFor('s1', 'woodcutter', makeLandmarks(), 0)).toBeNull()
  })

  it('ids are namespaced by settlement id', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('village_a', 'guard', landmarks, 0)?.id).toBe('village_a:workplace:well')
  })
})
