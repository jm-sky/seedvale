import { describe, expect, it } from 'vitest'
import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { OpportunityNpc } from './worldQuestOpportunityTypes'
import { generateFamilies } from '../../settlement/families'
import { resolveInitialProfessionStaffing } from '../../settlement/professionStaffing'
import {
  collectSettlementQuestOpportunities,
  collectWolfDenPressureOpportunities,
  parseWolfDenPressureQuestId,
  wolfDenPressureQuestId,
  wolfDenPressureSourceStatus,
} from './settlementQuestOpportunities'
import {
  buildWorldDrivenSettlementQuests,
  materializeSettlementQuestOpportunity,
  opportunityNpcsFromSettlement,
  selectSettlementQuestGiver,
} from './worldQuestMaterialization'

function wolfDen(overrides: Partial<PreySpawner> = {}): PreySpawner {
  return {
    id: 'home:wolfDen',
    x: 0,
    z: 0,
    type: 'wolfDen',
    kind: 'wolf',
    respawnIntervalDays: Infinity,
    maxPreyCount: 2,
    daysSinceLastRespawn: 0,
    state: 'active',
    deathsThisCycle: 0,
    disabledAtDay: null,
    pressure: 0,
    humanTaste: false,
    canRecover: false,
    lastSettlementTripOpportunityDay: null,
    ...overrides,
  }
}

const anna: OpportunityNpc = { id: 'home:npc:0', name: 'Anna', role: 'farmer', child: false }
const hunter: OpportunityNpc = { id: 'home:npc:4', name: 'Jan', role: 'hunter', child: false }
const child: OpportunityNpc = { id: 'home:npc:5', name: 'Olek', role: 'farmer', child: true }

describe('wolf-den pressure opportunity identity', () => {
  it('uses a deterministic id from settlement and spawner identity', () => {
    const first = collectWolfDenPressureOpportunities('home', [wolfDen()])
    const second = collectWolfDenPressureOpportunities('home', [wolfDen({ pressure: 0.75 })])
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(first[0]?.id).toBe(wolfDenPressureQuestId('home:wolfDen'))
    expect(first[0]?.id).toBe(second[0]?.id)
    expect(first[0]?.spawnerId).toBe('home:wolfDen')
    expect(parseWolfDenPressureQuestId(first[0]!.id)).toEqual({ spawnerId: 'home:wolfDen' })
  })

  it('does not duplicate the same den across a refresh', () => {
    const spawners = [wolfDen({ pressure: 0.75 })]
    const merged = collectSettlementQuestOpportunities({
      settlementId: 'home',
      spawners,
      persistedQuestIds: [wolfDenPressureQuestId('home:wolfDen')],
    })
    expect(merged).toHaveLength(1)
  })

  it('is a candidate record and does not include a QuestDef', () => {
    const [opportunity] = collectWolfDenPressureOpportunities('home', [wolfDen()])
    expect(opportunity).toEqual({
      id: 'world:wolf-den-pressure:home:wolfDen',
      settlementId: 'home',
      kind: 'wolf-den-pressure',
      spawnerId: 'home:wolfDen',
    })
    expect(opportunity && 'stages' in opportunity).toBe(false)
  })

  it('records a deterministic candidate even before the live den exists', () => {
    expect(collectWolfDenPressureOpportunities('home', [])).toEqual([{
      id: 'world:wolf-den-pressure:home:wolfDen',
      settlementId: 'home',
      kind: 'wolf-den-pressure',
      spawnerId: 'home:wolfDen',
    }])
  })
})

describe('wolf-den pressure live status', () => {
  it('is absent before pressure activates', () => {
    expect(wolfDenPressureSourceStatus(wolfDen())).toBe('absent')
  })

  it('is present while pressure is live and the den stands', () => {
    expect(wolfDenPressureSourceStatus(wolfDen({ pressure: 0.75 }))).toBe('present')
  })

  it('is resolved after permanent destruction', () => {
    expect(wolfDenPressureSourceStatus(wolfDen({
      pressure: 0.75,
      state: 'disabled',
      canRecover: false,
    }))).toBe('resolved')
  })

  it('is absent when the spawner is missing', () => {
    expect(wolfDenPressureSourceStatus(undefined)).toBe('absent')
  })
})

describe('world-driven quest materialization', () => {
  it('materializes a selected opportunity into a normal QuestDef with stable ids', () => {
    const [opportunity] = collectWolfDenPressureOpportunities('home', [wolfDen({ pressure: 0.75 })])
    const first = materializeSettlementQuestOpportunity(opportunity!, [anna, hunter], 'Dolina')
    const second = materializeSettlementQuestOpportunity(opportunity!, [anna, hunter], 'Dolina')
    expect(first?.id).toBe(opportunity?.id)
    expect(first).toEqual(second)
    expect(first?.giver.npcId).toBe(hunter.id)
    expect(first?.giverName).toBe('Jan')
    expect(first?.settlementId).toBe('home')
    expect(first?.stages[0]?.objective).toEqual({ type: 'destroy_spawn_point', spawnerId: 'home:wolfDen' })
  })

  it('prefers a hunter giver and skips children', () => {
    expect(selectSettlementQuestGiver([child, anna, hunter], 'wolf-den-pressure')?.id).toBe(hunter.id)
    expect(selectSettlementQuestGiver([child, anna], 'wolf-den-pressure')?.id).toBe(anna.id)
  })

  it('always has an adult fallback on a staffed settlement roster', () => {
    const families = generateFamilies(11, 'MD', false, 'polish')
    const staffed = resolveInitialProfessionStaffing(families, {
      size: 'MD',
      terrain: 'forest',
      foodSourceType: 'garden',
      dominantResource: null,
      isHome: false,
      seed: 11,
    })
    const npcs = opportunityNpcsFromSettlement({ id: '1_0', families: staffed })
    const giver = selectSettlementQuestGiver(npcs, 'wolf-den-pressure')
    expect(giver).toBeDefined()
    expect(giver!.child).toBe(false)
    const hunterNpc = npcs.find((npc) => npc.role === 'hunter' && !npc.child)
    if (hunterNpc) expect(giver!.id).toBe(hunterNpc.id)
  })

  it('reconstructs the same definition from persisted source refs after the den disappears', () => {
    const persistedId = wolfDenPressureQuestId('home:wolfDen')
    const withDen = buildWorldDrivenSettlementQuests({
      settlementId: 'home',
      settlementName: 'Dolina',
      spawners: [wolfDen({ pressure: 0.75 })],
      npcs: [anna, hunter],
    })
    const afterGone = buildWorldDrivenSettlementQuests({
      settlementId: 'home',
      settlementName: 'Dolina',
      spawners: [],
      npcs: [anna, hunter],
      persistedQuestIds: [persistedId],
    })
    expect(withDen[0]?.id).toBe(persistedId)
    expect(afterGone[0]).toEqual(withDen[0])
  })

  it('derives opportunity NPCs from flattened settlement family order', () => {
    const npcs = opportunityNpcsFromSettlement({
      id: 'home',
      families: [{
        id: 'f0',
        members: [
          { name: 'Anna', relation: 'single', character: { role: 'farmer' } },
          { name: 'Olek', relation: 'child', character: { role: 'farmer' } },
        ],
      }],
    } as unknown as Parameters<typeof opportunityNpcsFromSettlement>[0])
    expect(npcs).toEqual([
      { id: 'home:npc:0', name: 'Anna', role: 'farmer', child: false },
      { id: 'home:npc:1', name: 'Olek', role: 'farmer', child: true },
    ])
  })
})
