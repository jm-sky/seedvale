import { afterEach, describe, expect, it } from 'vitest'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { SettlementResolveContext } from './settlementPlanCache'
import type { TerrainSamplers } from './settlementTerrain'
import { settlementOpportunityNpcsFromDef } from '../quests/opportunities/settlementNpcMaterialization'
import { generateFamilies } from './families'
import {
  appendAuthoredResidentFamily,
  createLostTreasureElderFamily,
  isLostTreasureElderFamily,
  LOST_TREASURE_ELDER_AGE,
  LOST_TREASURE_ELDER_FAMILY_ID,
  LOST_TREASURE_ELDER_GIVEN_NAME,
  selectLostTreasureChroniclesElderSettlement,
} from './lostTreasureChroniclesElderResident'
import { flattenedSettlementMembers, settlementNpcId } from './npcIdentity'
import { resolveInitialProfessionStaffing } from './professionStaffing'
import { generateSettlementDef } from './settlementGenerator'
import { clearSettlementDefCache, settlementDefFor } from './settlementPlanCache'

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

afterEach(() => {
  clearSettlementDefCache()
})

describe('lost treasure chronicles elder resident', () => {
  it('uses a story family id that is not the legacy reserved-home prefix', () => {
    expect(LOST_TREASURE_ELDER_FAMILY_ID.startsWith('family-reserved')).toBe(false)
    const family = createLostTreasureElderFamily(11, 'polish')
    expect(isLostTreasureElderFamily(family)).toBe(true)
    expect(family.id.startsWith('family-reserved')).toBe(false)
  })

  it('authors a single adult with a stable name and 72–78 age', () => {
    const a = createLostTreasureElderFamily(42, 'polish')
    const b = createLostTreasureElderFamily(42, 'polish')
    expect(a).toEqual(b)
    expect(a.members).toHaveLength(1)
    expect(a.members[0]?.name).toBe(LOST_TREASURE_ELDER_GIVEN_NAME)
    expect(a.members[0]?.age).toBe(LOST_TREASURE_ELDER_AGE)
    expect(a.members[0]?.age).toBeGreaterThanOrEqual(72)
    expect(a.members[0]?.age).toBeLessThanOrEqual(78)
    expect(a.members[0]?.relation).toBe('single')
    expect(a.members[0]?.character.gender).toBe('male')
  })

  it('appends after generated families so earlier NpcIds stay put', () => {
    const generated = generateFamilies(9, 'MD', false, 'polish')
    const elder = createLostTreasureElderFamily(9, 'polish')
    const injected = appendAuthoredResidentFamily(generated, elder)
    expect(injected.slice(0, generated.length)).toEqual(generated)
    expect(injected.at(-1)?.id).toBe(LOST_TREASURE_ELDER_FAMILY_ID)
    const index = flattenedSettlementMembers({ families: injected }).findIndex(
      (member) => member.name === LOST_TREASURE_ELDER_GIVEN_NAME,
    )
    expect(settlementNpcId('1_0', index)).toBe(`1_0:npc:${generated.reduce((n, f) => n + f.members.length, 0)}`)
  })

  it('does not mark the elder household as reserved for profession staffing', () => {
    const generated = generateFamilies(15, 'MD', false, 'polish')
    const injected = appendAuthoredResidentFamily(generated, createLostTreasureElderFamily(15, 'polish'))
    const staffed = resolveInitialProfessionStaffing(injected, {
      size: 'MD',
      terrain: 'forest',
      foodSourceType: 'foraging',
      dominantResource: null,
      isHome: false,
      seed: 15,
    })
    const elder = staffed.find(isLostTreasureElderFamily)
    expect(elder).toBeTruthy()
    expect(elder!.members[0]?.character.role).toBeTruthy()
  })

  it('selects the nearest SM/MD non-home settlement and ignores outposts and home', () => {
    const selected = selectLostTreasureChroniclesElderSettlement([
      { cell: { gx: 0, gz: 0 }, id: '0_0', size: 'MD', x: 0, z: 0, isHome: true },
      { cell: { gx: 1, gz: 0 }, id: '1_0', size: 'OUTPOST', x: 280, z: 0, isHome: false },
      { cell: { gx: 0, gz: 1 }, id: '0_1', size: 'LG', x: 0, z: 300, isHome: false },
      { cell: { gx: -1, gz: 0 }, id: '-1_0', size: 'SM', x: -200, z: 10, isHome: false },
      { cell: { gx: 1, gz: 1 }, id: '1_1', size: 'MD', x: 400, z: 400, isHome: false },
    ])
    expect(selected?.id).toBe('-1_0')
  })

  it('falls back to the nearest ordinary settlement when no SM/MD exists', () => {
    const selected = selectLostTreasureChroniclesElderSettlement([
      { cell: { gx: 1, gz: 0 }, id: '1_0', size: 'XL', x: 100, z: 0, isHome: false },
      { cell: { gx: 0, gz: 1 }, id: '0_1', size: 'LG', x: 0, z: 80, isHome: false },
    ])
    expect(selected?.id).toBe('0_1')
  })

  it('does not inject the elder through generateSettlementDef without an authored resident', () => {
    const def = generateSettlementDef({ gx: 1, gz: 0 }, 7, flatHeight, 0, 56, samplers, 1, region)
    expect(def?.families.some(isLostTreasureElderFamily)).toBe(false)
  })

  it('injects exactly one elder into the selected nearby settlement via the plan cache', () => {
    const seed = 7
    const ctx = ctxFor(seed)
    const home = settlementDefFor({ gx: 0, gz: 0 }, ctx)
    expect(home?.families.some(isLostTreasureElderFamily)).toBe(false)

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

    const hosts = neighbors.filter((def) => def.families.some(isLostTreasureElderFamily))
    expect(hosts).toHaveLength(1)
    const host = hosts[0]!
    expect(host.isHome).toBe(false)
    expect(host.size).not.toBe('OUTPOST')
    expect(['SM', 'MD']).toContain(host.size)
    expect(host.families.filter(isLostTreasureElderFamily)).toHaveLength(1)

    const members = flattenedSettlementMembers(host)
    const elderMembers = members.filter((member) => member.name === LOST_TREASURE_ELDER_GIVEN_NAME)
    expect(elderMembers).toHaveLength(1)
    expect(elderMembers[0]?.age).toBe(LOST_TREASURE_ELDER_AGE)

    const npcs = settlementOpportunityNpcsFromDef(host)
    const elderNpcs = npcs.filter((npc) => npc.householdId === LOST_TREASURE_ELDER_FAMILY_ID)
    expect(elderNpcs).toHaveLength(1)
    expect(elderNpcs[0]?.id).toBe(settlementNpcId(host.id, members.indexOf(elderMembers[0]!)))

    clearSettlementDefCache()
    const again = settlementDefFor({ gx: host.gx, gz: host.gz }, ctxFor(seed))
    expect(again?.families.some(isLostTreasureElderFamily)).toBe(true)
    expect(settlementOpportunityNpcsFromDef(again!).find((npc) => npc.householdId === LOST_TREASURE_ELDER_FAMILY_ID)?.id)
      .toBe(elderNpcs[0]?.id)
  })

  it('does not leak the elder into an unrelated distant settlement', () => {
    const ctx = ctxFor(7)
    settlementDefFor({ gx: 0, gz: 0 }, ctx)
    const far = settlementDefFor({ gx: 8, gz: 8 }, ctx)
    expect(far?.families.some(isLostTreasureElderFamily)).toBe(false)
  })
})
