import { Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { CampfireFlame } from './campfireProps'
import type { BlacksmithWorkplace, SettlementLandmarks, SettlementTreeLandmark } from './props'
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
    blacksmithWorkplaces: [],
    homes: [],
    houses: [],
    trees: [],
    dockRoute: [],
    landPlots: [],
    householdStorages: [],
    householdWoodStorages: [],
    settlementStorage: new Vector3(5, 0, 5),
    noticeBoard: new Vector3(7, 0, 7),
    ...overrides,
  }
}

describe('workplaceFor', () => {
  it('farmer -> garden', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'farmer', landmarks, 0, 0)?.position).toBe(landmarks.garden)
  })

  it('trader -> market', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'trader', landmarks, 0, 0)?.position).toBe(landmarks.market)
  })

  it('guard -> well', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'guard', landmarks, 0, 0)?.position).toBe(landmarks.well)
  })

  it('miner -> stockpile', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('s1', 'miner', landmarks, 0, 0)?.position).toBe(landmarks.stockpile)
  })

  it('fisher -> dock when present, else falls back to well', () => {
    const withDock = makeLandmarks({ dock: new Vector3(9, 0, 9) })
    expect(workplaceFor('s1', 'fisher', withDock, 0, 0)?.position).toBe(withDock.dock)

    const withoutDock = makeLandmarks()
    expect(workplaceFor('s1', 'fisher', withoutDock, 0, 0)?.position).toBe(withoutDock.well)
  })

  it('woodcutter -> round-robin tree, null if no trees', () => {
    const trees = [makeTree('t0', 0, 0), makeTree('t1', 5, 5)]
    const landmarks = makeLandmarks({ trees })
    expect(workplaceFor('s1', 'woodcutter', landmarks, 0, 0)?.position).toBe(trees[0]!.position)
    expect(workplaceFor('s1', 'woodcutter', landmarks, 1, 0)?.position).toBe(trees[1]!.position)
    expect(workplaceFor('s1', 'woodcutter', landmarks, 2, 0)?.position).toBe(trees[0]!.position)

    expect(workplaceFor('s1', 'woodcutter', makeLandmarks(), 0, 0)).toBeNull()
  })

  it('ids are namespaced by settlement id', () => {
    const landmarks = makeLandmarks()
    expect(workplaceFor('village_a', 'guard', landmarks, 0, 0)?.id).toBe('village_a:workplace:well')
  })

  it('textile_worker -> own home, else well (plan settlements-npcs-006)', () => {
    const home = new Vector3(6, 0, 6)
    const withHome = makeLandmarks({ homes: [home] })
    expect(workplaceFor('s1', 'textile_worker', withHome, 0, 0)?.position).toBe(home)
    expect(workplaceFor('s1', 'textile_worker', withHome, 0, 0)?.id).toBe('s1:workplace:textile:0')

    const withoutHome = makeLandmarks()
    expect(workplaceFor('s1', 'textile_worker', withoutHome, 0, 0)?.position).toBe(withoutHome.well)
  })

  describe('blacksmith (household-owned, plan settlements-npcs-024 Stage 1)', () => {
    it('scenario A — no blacksmith workplace anywhere -> null, no phantom Place', () => {
      const landmarks = makeLandmarks()
      expect(workplaceFor('s1', 'blacksmith', landmarks, 0, 0)).toBeNull()
      expect(workplaceFor('s1', 'blacksmith', landmarks, 0, 1)).toBeNull()
    })

    it('scenario B — one blacksmith household resolves its own workplace, not a settlement-wide one', () => {
      const workplace: BlacksmithWorkplace = { familyIndex: 1, position: new Vector3(11, 0, 11) }
      const landmarks = makeLandmarks({ blacksmithWorkplaces: [workplace] })

      expect(workplaceFor('s1', 'blacksmith', landmarks, 0, 1)?.position).toBe(workplace.position)
      // A non-blacksmith household index resolves nothing, even though the
      // settlement has a blacksmith workplace elsewhere.
      expect(workplaceFor('s1', 'blacksmith', landmarks, 0, 0)).toBeNull()
      expect(workplaceFor('s1', 'blacksmith', landmarks, 0, 2)).toBeNull()
    })

    it('scenario C — two blacksmith members in one household resolve the same stable Place id', () => {
      const workplace: BlacksmithWorkplace = { familyIndex: 1, position: new Vector3(11, 0, 11) }
      const landmarks = makeLandmarks({ blacksmithWorkplaces: [workplace] })

      const first = workplaceFor('s1', 'blacksmith', landmarks, 0, 1)
      const second = workplaceFor('s1', 'blacksmith', landmarks, 1, 1)
      expect(first?.id).toBe(second?.id)
      expect(first?.position).toBe(second?.position)
    })

    it('scenario D — two blacksmith households resolve distinct ids/positions, never the old singleton id', () => {
      const w0: BlacksmithWorkplace = { familyIndex: 0, position: new Vector3(1, 0, 1) }
      const w2: BlacksmithWorkplace = { familyIndex: 2, position: new Vector3(9, 0, 9) }
      const landmarks = makeLandmarks({ blacksmithWorkplaces: [w0, w2] })

      const place0 = workplaceFor('s1', 'blacksmith', landmarks, 0, 0)
      const place2 = workplaceFor('s1', 'blacksmith', landmarks, 0, 2)
      expect(place0?.position).toBe(w0.position)
      expect(place2?.position).toBe(w2.position)
      expect(place0?.id).not.toBe(place2?.id)
      expect(place0?.id).not.toBe('s1:workplace:blacksmith')
      expect(place2?.id).not.toBe('s1:workplace:blacksmith')
    })
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

  it('carries the isAvailable predicate through unchanged (plan npc-013 live fire state)', () => {
    const landmarks = makeLandmarks({
      campfire: { position: new Vector3(7, 0, 7), flame: {} as CampfireFlame },
    })
    const isAvailable = () => false
    const place = socialPlaceFor('village_a', landmarks, isAvailable)
    expect(place?.isAvailable).toBe(isAvailable)
  })
})
