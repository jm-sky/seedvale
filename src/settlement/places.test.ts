import { Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { CampfireFlame } from './campfireProps'
import type { SettlementLandmarks, SettlementTreeLandmark } from './props'
import { homePlaceId, socialPlaceFor, workplaceFor } from './places'

function makeTree(id: string, x: number, z: number): SettlementTreeLandmark {
  return {
    id,
    position: new Vector3(x, 0, z),
    mesh: new Object3D(),
    speciesIndex: 0,
    sizeClass: 'medium',
    sizeJitter: 0.5,
    initialStage: 'mature',
  }
}

function makeLandmarks(overrides: Partial<SettlementLandmarks> = {}): SettlementLandmarks {
  const garden = new Vector3(3, 0, 3)
  return {
    well: new Vector3(1, 0, 1),
    stockpile: new Vector3(2, 0, 2),
    garden,
    gardens: [garden],
    market: new Vector3(4, 0, 4),
    blacksmith: new Vector3(6, 0, 6),
    homes: [],
    houses: [],
    trees: [],
    dockRoute: [],
    landPlots: [],
    householdStorages: [],
    settlementStorage: new Vector3(5, 0, 5),
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

  it('blacksmith -> anvil/grind workbench landmark', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'blacksmith', landmarks, 0)?.position).toBe(landmarks.blacksmith)
  })

  it('fisher -> dock when present, else falls back to well', () => {
    const withDock = makeLandmarks({ dock: new Vector3(9, 0, 9) })
    expect(workplaceFor('s1', 'fisher', withDock, 0)?.position).toBe(withDock.dock)

    const withoutDock = makeLandmarks()
    expect(workplaceFor('s1', 'fisher', withoutDock, 0)?.position).toBe(withoutDock.well)
  })

  it('woodcutter -> round-robin tree, null if no trees', () => {
    const trees = [makeTree('t0', 0, 0), makeTree('t1', 5, 5)]
    const landmarks = makeLandmarks({ trees })
    expect(workplaceFor('s1', 'woodcutter', landmarks, 0)?.position).toBe(trees[0]!.position)
    expect(workplaceFor('s1', 'woodcutter', landmarks, 1)?.position).toBe(trees[1]!.position)
    expect(workplaceFor('s1', 'woodcutter', landmarks, 2)?.position).toBe(trees[0]!.position)

    expect(workplaceFor('s1', 'woodcutter', makeLandmarks(), 0)).toBeNull()
  })

  it('ids are namespaced by settlement id', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('village_a', 'guard', landmarks, 0)?.id).toBe('village_a:workplace:well')
  })
})

describe('homePlaceId', () => {
  it('namespaces by settlement id and index, matching the existing home Place id format', () => {
    expect(homePlaceId('0_0', 2)).toBe('0_0:home:2')
    expect(homePlaceId('1_-2', 0)).toBe('1_-2:home:0')
  })
})

describe('socialPlaceFor', () => {
  it('null when the settlement has no campfire', () => {
    expect(socialPlaceFor('s1', makeLandmarks())).toBeNull()
  })

  it('wraps the existing campfire position as a social Place, no new position/visual', () => {
    const campfirePosition = new Vector3(7, 0, 7)
    const landmarks = makeLandmarks({
      campfire: { position: campfirePosition, flame: {} as CampfireFlame },
    })
    const place = socialPlaceFor('village_a', landmarks)
    expect(place).toEqual({ id: 'village_a:social:campfire', type: 'social', position: campfirePosition })
    expect(place?.position).toBe(campfirePosition)
  })
})
