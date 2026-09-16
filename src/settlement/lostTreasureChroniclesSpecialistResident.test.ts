import { afterEach, describe, expect, it } from 'vitest'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { SettlementResolveContext } from './settlementPlanCache'
import type { TerrainSamplers } from './settlementTerrain'
import { settlementOpportunityNpcsFromDef } from '../quests/opportunities/settlementNpcMaterialization'
import { generateFamilies } from './families'
import { createLostTreasureArchaeologistFamily } from './lostTreasureChroniclesArchaeologistResident'
import {
  appendAuthoredResidentFamilies,
  isLostTreasureElderFamily,
} from './lostTreasureChroniclesElderResident'
import {
  createLostTreasureSpecialistFamily,
  findLostTreasureSpecialistResident,
  isLostTreasureSpecialistFamily,
  LOST_TREASURE_SPECIALIST_AGE,
  LOST_TREASURE_SPECIALIST_FAMILY_ID,
  LOST_TREASURE_SPECIALIST_GIVEN_NAME,
  type LostTreasureSpecialistSettlementCandidate,
  selectLostTreasureChroniclesSpecialistSettlement,
} from './lostTreasureChroniclesSpecialistResident'
import { flattenedSettlementMembers, settlementNpcId } from './npcIdentity'
import { generateSettlementDef } from './settlementGenerator'
import {
  cachedLostTreasureArchaeologistHostCell,
  cachedLostTreasureSpecialistHostCell,
  clearSettlementDefCache,
  settlementDefFor,
} from './settlementPlanCache'

const flatHeight = (): number => 12
const samplers: TerrainSamplers = {
  sampleContinentalness: () => 0.55,
  sampleMountainRidge: () => 0.05,
  sampleMoistureRegion: () => 0.45,
}
const region = {
  coastThreshold: 0.45,
  desertThreshold: 0.35,
  desertThresholdWidth: 0.12,
  swampThreshold: 0.72,
  swampThresholdWidth: 0.15,
  village: {
    coreRadius: 9,
    houseRadius: 4.5,
    heightStrength: 0.8,
    tintStrength: 0.75,
    regionalHeightStrengthFlat: 0.3,
    regionalHeightStrengthMountain: 0.15,
  },
  roadNetwork: {
    dockSearchRadius: 140,
  },
} as RegionParams

function ctxFor(seed: number): SettlementResolveContext {
  return {
    seed,
    sampleHeight: flatHeight,
    waterLevel: 0,
    localSearchRadius: 56,
    terrainSamplers: samplers,
    heightScale: 1,
    region,
  }
}

function candidate(
  id: string,
  size: LostTreasureSpecialistSettlementCandidate['size'],
  x: number,
  z: number,
  isHome = false,
): LostTreasureSpecialistSettlementCandidate {
  const [gx, gz] = id.split('_').map(Number)
  return { cell: { gx: gx ?? 1, gz: gz ?? 0 }, id, size, x, z, isHome }
}

afterEach(() => {
  clearSettlementDefCache()
})

describe('lost treasure chronicles specialist resident', () => {
  it('uses a story family id that is not the legacy reserved-home prefix', () => {
    expect(LOST_TREASURE_SPECIALIST_FAMILY_ID.startsWith('family-reserved')).toBe(false)
    const family = createLostTreasureSpecialistFamily(11, 'polish')
    expect(isLostTreasureSpecialistFamily(family)).toBe(true)
    expect(family.members[0]?.name).toBe(LOST_TREASURE_SPECIALIST_GIVEN_NAME)
    expect(family.members[0]?.age).toBe(LOST_TREASURE_SPECIALIST_AGE)
  })

  it('is deterministic for the same cell seed', () => {
    const a = createLostTreasureSpecialistFamily(42, 'polish')
    const b = createLostTreasureSpecialistFamily(42, 'polish')
    expect(a).toEqual(b)
  })

  it('prefers a third settlement and falls back to the archaeologist host', () => {
    const distinct = selectLostTreasureChroniclesSpecialistSettlement([
      candidate('1_0', 'SM', 280, 0),
      candidate('2_0', 'LG', 560, 0),
      candidate('3_0', 'MD', 840, 0),
    ], '1_0', '2_0')
    expect(distinct?.id).toBe('3_0')

    const fallback = selectLostTreasureChroniclesSpecialistSettlement([
      candidate('0_0', 'XL', 0, 0, true),
      candidate('1_0', 'SM', 280, 0),
      candidate('2_0', 'LG', 560, 0),
    ], '1_0', '2_0')
    expect(fallback?.id).toBe('2_0')
  })

  it('does not require a third settlement and does not duplicate the elder', () => {
    const generated = generateFamilies(9, 'MD', false, 'polish')
    const injected = appendAuthoredResidentFamilies(generated, [
      createLostTreasureArchaeologistFamily(9, 'polish'),
      createLostTreasureSpecialistFamily(9, 'polish'),
    ])
    expect(injected.filter(isLostTreasureSpecialistFamily)).toHaveLength(1)
    const resident = findLostTreasureSpecialistResident({ id: '2_0', families: injected })
    expect(resident?.name).toBe(LOST_TREASURE_SPECIALIST_GIVEN_NAME)
    expect(resident?.npcId).toBeTruthy()
  })

  it('does not inject the specialist through generateSettlementDef without an authored resident', () => {
    const def = generateSettlementDef({ gx: 2, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    expect(def?.families.some(isLostTreasureSpecialistFamily)).toBe(false)
  })

  it('reconstructs a stable specialist identity and never forces a third settlement', () => {
    const seed = 7
    const ctx = ctxFor(seed)
    settlementDefFor({ gx: 0, gz: 0 }, ctx)
    const archaeologistCell = cachedLostTreasureArchaeologistHostCell()
    const specialistCell = cachedLostTreasureSpecialistHostCell()
    expect(specialistCell).toBeTruthy()
    const host = settlementDefFor(specialistCell!, ctx)
    expect(host).toBeTruthy()
    expect(host!.isHome).toBe(false)
    expect(host!.size).not.toBe('OUTPOST')
    expect(host!.families.filter(isLostTreasureSpecialistFamily)).toHaveLength(1)
    expect(host!.families.some(isLostTreasureElderFamily)).toBe(false)

    const members = flattenedSettlementMembers(host!)
    const authored = members.filter((member) => member.name === LOST_TREASURE_SPECIALIST_GIVEN_NAME)
    expect(authored).toHaveLength(1)
    const npcs = settlementOpportunityNpcsFromDef(host!)
    const authoredNpcs = npcs.filter((npc) => npc.householdId === LOST_TREASURE_SPECIALIST_FAMILY_ID)
    expect(authoredNpcs).toHaveLength(1)
    expect(authoredNpcs[0]?.id).toBe(settlementNpcId(host!.id, members.indexOf(authored[0]!)))

    if (archaeologistCell && specialistCell
      && archaeologistCell.gx === specialistCell.gx
      && archaeologistCell.gz === specialistCell.gz
    ) {
      expect(host!.families.filter(isLostTreasureSpecialistFamily)).toHaveLength(1)
    }

    clearSettlementDefCache()
    const again = settlementDefFor({ gx: host!.gx, gz: host!.gz }, ctxFor(seed))
    expect(
      settlementOpportunityNpcsFromDef(again!).find(
        (npc) => npc.householdId === LOST_TREASURE_SPECIALIST_FAMILY_ID,
      )?.id,
    ).toBe(authoredNpcs[0]?.id)
  })
})
