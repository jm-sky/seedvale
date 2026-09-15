import { afterEach, describe, expect, it } from 'vitest'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { SettlementResolveContext } from './settlementPlanCache'
import type { TerrainSamplers } from './settlementTerrain'
import { settlementOpportunityNpcsFromDef } from '../quests/opportunities/settlementNpcMaterialization'
import { generateFamilies } from './families'
import {
  createLostTreasureArchaeologistFamily,
  findLostTreasureArchaeologistResident,
  isLostTreasureArchaeologistFamily,
  LOST_TREASURE_ARCHAEOLOGIST_AGE,
  LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID,
  LOST_TREASURE_ARCHAEOLOGIST_GIVEN_NAME,
  type LostTreasureArchaeologistSettlementCandidate,
  selectLostTreasureChroniclesArchaeologistSettlement,
} from './lostTreasureChroniclesArchaeologistResident'
import {
  appendAuthoredResidentFamily,
  createLostTreasureElderFamily,
  isLostTreasureElderFamily,
  LOST_TREASURE_ELDER_FAMILY_ID,
} from './lostTreasureChroniclesElderResident'
import { flattenedSettlementMembers, settlementNpcId } from './npcIdentity'
import { resolveInitialProfessionStaffing } from './professionStaffing'
import { generateSettlementDef } from './settlementGenerator'
import {
  cachedLostTreasureArchaeologistHostCell,
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
  size: LostTreasureArchaeologistSettlementCandidate['size'],
  x: number,
  z: number,
  isHome = false,
): LostTreasureArchaeologistSettlementCandidate {
  const [gx, gz] = id.split('_').map(Number)
  return { cell: { gx: gx ?? 1, gz: gz ?? 0 }, id, size, x, z, isHome }
}

afterEach(() => {
  clearSettlementDefCache()
})

describe('lost treasure chronicles archaeologist resident', () => {
  it('uses a story family id that is not the legacy reserved-home prefix', () => {
    expect(LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID.startsWith('family-reserved')).toBe(false)
    const family = createLostTreasureArchaeologistFamily(11, 'polish')
    expect(isLostTreasureArchaeologistFamily(family)).toBe(true)
    expect(family.id.startsWith('family-reserved')).toBe(false)
  })

  it('authors a single adult trader with a stable name', () => {
    const a = createLostTreasureArchaeologistFamily(42, 'polish')
    const b = createLostTreasureArchaeologistFamily(42, 'polish')
    expect(a).toEqual(b)
    expect(a.members).toHaveLength(1)
    expect(a.members[0]?.name).toBe(LOST_TREASURE_ARCHAEOLOGIST_GIVEN_NAME)
    expect(a.members[0]?.age).toBe(LOST_TREASURE_ARCHAEOLOGIST_AGE)
    expect(a.members[0]?.relation).toBe('single')
    expect(a.members[0]?.character.gender).toBe('male')
    expect(a.members[0]?.character.role).toBe('trader')
  })

  it('appends after generated families so earlier NpcIds stay put', () => {
    const generated = generateFamilies(9, 'LG', false, 'polish')
    const archaeologist = createLostTreasureArchaeologistFamily(9, 'polish')
    const injected = appendAuthoredResidentFamily(generated, archaeologist)
    expect(injected.slice(0, generated.length)).toEqual(generated)
    expect(injected.at(-1)?.id).toBe(LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID)
    const found = findLostTreasureArchaeologistResident({ id: '2_0', families: injected })
    expect(found?.npcId).toBe(
      settlementNpcId('2_0', generated.reduce((n, family) => n + family.members.length, 0)),
    )
  })

  it('does not mark the archaeologist household as reserved for profession staffing', () => {
    const generated = generateFamilies(15, 'LG', false, 'polish')
    const injected = appendAuthoredResidentFamily(
      generated,
      createLostTreasureArchaeologistFamily(15, 'polish'),
    )
    const staffed = resolveInitialProfessionStaffing(injected, {
      size: 'LG',
      terrain: 'forest',
      foodSourceType: 'foraging',
      dominantResource: null,
      isHome: false,
      seed: 15,
    })
    const family = staffed.find(isLostTreasureArchaeologistFamily)
    expect(family).toBeTruthy()
    expect(family!.members[0]?.character.role).toBeTruthy()
  })

  it('picks the nearest larger MD/LG/XL and never reuses the elder settlement', () => {
    const selected = selectLostTreasureChroniclesArchaeologistSettlement([
      candidate('2_0', 'SM', 200, 0),
      candidate('1_0', 'MD', 280, 0),
      candidate('3_0', 'LG', 560, 0),
      candidate('0_1', 'XL', 0, 800),
    ], '2_0')
    expect(selected?.id).toBe('1_0')
  })

  it('falls back to the nearest remaining town when nothing is strictly larger', () => {
    const selected = selectLostTreasureChroniclesArchaeologistSettlement([
      candidate('1_0', 'MD', 100, 0),
      candidate('4_0', 'MD', 500, 0),
    ], '1_0')
    expect(selected?.id).toBe('4_0')
  })

  it('ignores home and outposts', () => {
    const selected = selectLostTreasureChroniclesArchaeologistSettlement([
      candidate('0_0', 'XL', 0, 0, true),
      candidate('1_0', 'OUTPOST', 280, 0),
      candidate('0_1', 'LG', 0, 300),
    ], '2_0')
    expect(selected?.id).toBe('0_1')
  })

  it('does not inject the archaeologist through generateSettlementDef without an authored resident', () => {
    const def = generateSettlementDef({ gx: 2, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    expect(def?.families.some(isLostTreasureArchaeologistFamily)).toBe(false)
  })

  it('injects the archaeologist into a different settlement than the 037 elder', () => {
    const seed = 7
    const ctx = ctxFor(seed)
    const home = settlementDefFor({ gx: 0, gz: 0 }, ctx)
    expect(home?.families.some(isLostTreasureElderFamily)).toBe(false)
    expect(home?.families.some(isLostTreasureArchaeologistFamily)).toBe(false)

    const neighbors = [
      settlementDefFor({ gx: 1, gz: 0 }, ctx),
      settlementDefFor({ gx: -1, gz: 0 }, ctx),
      settlementDefFor({ gx: 0, gz: 1 }, ctx),
      settlementDefFor({ gx: 0, gz: -1 }, ctx),
      settlementDefFor({ gx: 1, gz: 1 }, ctx),
      settlementDefFor({ gx: -1, gz: -1 }, ctx),
      settlementDefFor({ gx: 1, gz: -1 }, ctx),
      settlementDefFor({ gx: -1, gz: 1 }, ctx),
    ].filter((def) => def != null)

    const elderHosts = neighbors.filter((def) => def.families.some(isLostTreasureElderFamily))
    expect(elderHosts).toHaveLength(1)

    const hostCell = cachedLostTreasureArchaeologistHostCell()
    expect(hostCell).toBeTruthy()
    const host = settlementDefFor(hostCell!, ctx)
    expect(host).toBeTruthy()
    expect(host!.id).not.toBe(elderHosts[0]!.id)
    expect(host!.isHome).toBe(false)
    expect(host!.size).not.toBe('OUTPOST')
    expect(['MD', 'LG', 'XL']).toContain(host!.size)
    expect(host!.families.filter(isLostTreasureArchaeologistFamily)).toHaveLength(1)
    expect(host!.families.some(isLostTreasureElderFamily)).toBe(false)

    const members = flattenedSettlementMembers(host!)
    const authored = members.filter((member) => member.name === LOST_TREASURE_ARCHAEOLOGIST_GIVEN_NAME)
    expect(authored).toHaveLength(1)
    expect(authored[0]?.age).toBe(LOST_TREASURE_ARCHAEOLOGIST_AGE)

    const npcs = settlementOpportunityNpcsFromDef(host!)
    const authoredNpcs = npcs.filter((npc) => npc.householdId === LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID)
    expect(authoredNpcs).toHaveLength(1)
    expect(authoredNpcs[0]?.id).toBe(settlementNpcId(host!.id, members.indexOf(authored[0]!)))

    clearSettlementDefCache()
    const again = settlementDefFor({ gx: host!.gx, gz: host!.gz }, ctxFor(seed))
    expect(again?.families.some(isLostTreasureArchaeologistFamily)).toBe(true)
    expect(
      settlementOpportunityNpcsFromDef(again!).find(
        (npc) => npc.householdId === LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID,
      )?.id,
    ).toBe(authoredNpcs[0]?.id)
  })

  it('does not leak the archaeologist into an unrelated distant settlement', () => {
    const ctx = ctxFor(7)
    settlementDefFor({ gx: 0, gz: 0 }, ctx)
    const far = settlementDefFor({ gx: 8, gz: 8 }, ctx)
    expect(far?.families.some(isLostTreasureArchaeologistFamily)).toBe(false)
    expect(far?.families.some(isLostTreasureElderFamily)).toBe(false)
  })

  it('does not shift the 037 elder family id when both are injected separately', () => {
    const generated = generateFamilies(9, 'MD', false, 'polish')
    const withElder = appendAuthoredResidentFamily(generated, createLostTreasureElderFamily(9, 'polish'))
    expect(withElder.filter(isLostTreasureElderFamily)).toHaveLength(1)
    expect(withElder.at(-1)?.id).toBe(LOST_TREASURE_ELDER_FAMILY_ID)
  })
})
