import { describe, expect, it } from 'vitest'
import type { SettlementCell, SettlementDef } from '../../settlement/settlementGenerator'
import type { OpportunityNpc } from './worldQuestOpportunityTypes'
import { Inventory } from '../../items/Inventory'
import { QuestManager } from '../QuestManager'
import { validateQuestDefinitions } from '../quests'
import { materializeRpgQuestOpportunity } from './rpgQuestMaterialization'
import {
  collectOldPlaceSecretCandidate,
  collectRpgQuestOpportunities,
  collectSettlementAgreementCandidate,
  collectSuspiciousTransportCandidate,
  nearbyRpgSettlementDefs,
  parseRpgQuestId,
  rpgQuestId,
} from './rpgQuestMatrices'
import { collectWolfDenPressureOpportunities } from './settlementQuestOpportunities'
import { selectSettlementQuestOpportunities } from './settlementQuestSelection'
import {
  buildWorldDrivenSettlementQuests,
  materializeSettlementQuestOpportunity,
} from './worldQuestMaterialization'

const anna: OpportunityNpc = { id: '0_0:npc:0', name: 'Anna', role: 'farmer', child: false }
const hunter: OpportunityNpc = { id: '0_0:npc:1', name: 'Jan', role: 'hunter', child: false }
const child: OpportunityNpc = { id: '0_0:npc:2', name: 'Olek', role: 'farmer', child: true }
const guard: OpportunityNpc = { id: '0_0:npc:3', name: 'Marek', role: 'guard', child: false }

const neighborAdult: OpportunityNpc = { id: '1_0:npc:0', name: 'Anna', role: 'farmer', child: false }
const neighborHunter: OpportunityNpc = { id: '1_0:npc:1', name: 'Jan', role: 'hunter', child: false }
const neighborGuard: OpportunityNpc = { id: '1_0:npc:2', name: 'Marek', role: 'guard', child: false }

const homeNpcs = [anna, hunter, child, guard]
const neighborNpcs = [neighborAdult, neighborHunter, neighborGuard]

function speak(qm: QuestManager, npcId: string, actionIndex = 0): void {
  const override = qm.onInteract(npcId)
  override?.actions?.[actionIndex]?.onSelect()
}

function accept(qm: QuestManager, npcId: string): void {
  qm.onInteract(npcId)?.offer?.onAccept()
}

describe('RPG quest identity', () => {
  it('parses a deterministic id that includes matrix, settlement and source', () => {
    const id = rpgQuestId('old-place-secret', '1_0', 'monolith:4:-7:0:3f')
    expect(parseRpgQuestId(id)).toEqual({
      matrixId: 'old-place-secret',
      settlementId: '1_0',
      sourceId: 'monolith:4:-7:0:3f',
    })
    expect(parseRpgQuestId(rpgQuestId('suspicious-transport', '1_0', '1_0:npc:2'))).toEqual({
      matrixId: 'suspicious-transport',
      settlementId: '1_0',
      sourceId: '1_0:npc:2',
    })
  })
})

describe('Sekret starego miejsca eligibility', () => {
  it('emits no candidate without a real eligible landmark', () => {
    expect(collectOldPlaceSecretCandidate({
      settlementId: '1_0',
      landmarks: [],
    })).toBeUndefined()
  })

  it('skips occupied and cemetery landmarks', () => {
    expect(collectOldPlaceSecretCandidate({
      settlementId: '1_0',
      landmarks: [
        { id: 'cemetery:0:0:0:1', kind: 'cemetery' },
        { id: 'monolith:1:1:0:2', kind: 'monolith' },
      ],
      occupiedLandmarkIds: new Set(['monolith:1:1:0:2']),
    })).toBeUndefined()
  })

  it('binds the first unused eligible landmark as a lightweight candidate', () => {
    const candidate = collectOldPlaceSecretCandidate({
      settlementId: '1_0',
      landmarks: [
        { id: 'smallRuins:2:2:0:1', kind: 'smallRuins' },
        { id: 'monolith:3:3:0:1', kind: 'monolith' },
      ],
    })
    expect(candidate).toEqual({
      id: rpgQuestId('old-place-secret', '1_0', 'smallRuins:2:2:0:1'),
      settlementId: '1_0',
      kind: 'rpg-matrix',
      matrixId: 'old-place-secret',
      sourceId: 'smallRuins:2:2:0:1',
    })
    expect(candidate && 'stages' in candidate).toBe(false)
  })
})

describe('Podejrzany transport eligibility', () => {
  it('requires two adults', () => {
    expect(collectSuspiciousTransportCandidate({
      settlementId: '1_0',
      npcs: [neighborAdult, { id: '1_0:npc:9', name: 'Olek', role: 'farmer', child: true }],
    })).toBeUndefined()
  })

  it('binds the counterpart NPC id, not a parcel', () => {
    const candidate = collectSuspiciousTransportCandidate({
      settlementId: '1_0',
      npcs: neighborNpcs,
    })
    expect(candidate?.matrixId).toBe('suspicious-transport')
    expect(candidate?.sourceId).toBe(neighborGuard.id)
  })
})

describe('Umowa między osadami eligibility', () => {
  it('requires a different settlement with an adult NPC', () => {
    expect(collectSettlementAgreementCandidate({
      settlementId: '1_0',
      settlementX: 280,
      settlementZ: 0,
      npcs: neighborNpcs,
      otherSettlements: [],
    })).toBeUndefined()
    expect(collectSettlementAgreementCandidate({
      settlementId: '1_0',
      settlementX: 280,
      settlementZ: 0,
      npcs: neighborNpcs,
      otherSettlements: [{
        id: '2_0',
        name: 'Pusta',
        x: 560,
        z: 0,
        npcs: [{ id: '2_0:npc:0', name: 'Dziecko', role: 'farmer', child: true }],
      }],
    })).toBeUndefined()
  })

  it('picks the nearest other settlement from definitions, not stream state', () => {
    const candidate = collectSettlementAgreementCandidate({
      settlementId: '1_0',
      settlementX: 280,
      settlementZ: 0,
      npcs: neighborNpcs,
      otherSettlements: [
        { id: '2_0', name: 'Daleka', x: 560, z: 0, npcs: [anna] },
        { id: '0_0', name: 'Dolina', x: 0, z: 0, npcs: homeNpcs },
      ],
    })
    expect(candidate?.sourceId).toBe('0_0')
  })
})

describe('RPG materialization', () => {
  const landmarks = [{ id: 'stoneCircle:8:8:0:1', kind: 'stoneCircle' as const }]
  const otherSettlements = [
    { id: '0_0', name: 'Dolina', x: 0, z: 0, npcs: homeNpcs },
  ]
  const context = {
    npcsBySettlement: new Map<string, readonly OpportunityNpc[]>([
      ['0_0', homeNpcs],
      ['1_0', neighborNpcs],
    ]),
    settlementNameById: new Map([
      ['0_0', 'Dolina'],
      ['1_0', 'Lasowa'],
    ]),
  }

  it('does not materialize an unselected candidate', () => {
    const live = collectRpgQuestOpportunities({
      settlementId: '1_0',
      settlementX: 280,
      settlementZ: 0,
      npcs: neighborNpcs,
      landmarks,
      otherSettlements,
    })
    expect(live.length).toBeGreaterThan(0)
    const selected = selectSettlementQuestOpportunities({ candidates: live, limit: 0 })
    expect(selected).toEqual([])
  })

  it('materializes the same QuestDef for the same seed-equivalent context', () => {
    const input = {
      settlementId: '1_0',
      settlementName: 'Lasowa',
      spawners: [],
      npcs: neighborNpcs,
      includeWorldDriven: false as const,
      rpg: {
        settlementId: '1_0',
        settlementX: 280,
        settlementZ: 0,
        npcs: neighborNpcs,
        landmarks,
        otherSettlements,
        context,
      },
    }
    const first = buildWorldDrivenSettlementQuests(input)
    const second = buildWorldDrivenSettlementQuests(input)
    expect(first.length).toBeGreaterThan(0)
    expect(first).toEqual(second)
    expect(() => validateQuestDefinitions(first)).not.toThrow()
  })

  it('reconstructs the same old-place quest after the landmark is no longer live-eligible', () => {
    const live = collectOldPlaceSecretCandidate({
      settlementId: '1_0',
      landmarks,
    })!
    const first = materializeRpgQuestOpportunity(live, neighborNpcs, 'Lasowa')
    const reconstructed = collectRpgQuestOpportunities({
      settlementId: '1_0',
      settlementX: 280,
      settlementZ: 0,
      npcs: neighborNpcs,
      landmarks: [],
      otherSettlements,
      persistedQuestIds: [live.id],
    })
    const persisted = reconstructed.find((opportunity) => opportunity.id === live.id)
    expect(persisted).toEqual(live)
    const second = materializeRpgQuestOpportunity(persisted!, neighborNpcs, 'Lasowa')
    expect(second).toEqual(first)
    expect(second?.stages[0]?.objective).toEqual({
      type: 'interact_landmark',
      landmarkId: 'stoneCircle:8:8:0:1',
    })
  })

  it('keeps duplicate display names on distinct stable NPC ids across settlements', () => {
    const candidate = collectSettlementAgreementCandidate({
      settlementId: '1_0',
      settlementX: 280,
      settlementZ: 0,
      npcs: neighborNpcs,
      otherSettlements,
    })!
    const def = materializeRpgQuestOpportunity(candidate, neighborNpcs, 'Lasowa', context)!
    const talk = def.stages[0]?.objective
    expect(talk).toEqual({ type: 'talk_to_npc', npc: { npcId: anna.id } })
    expect(def.giver.npcId).toBe(neighborAdult.id)
    expect(def.giver.npcId).not.toBe(anna.id)
    expect(def.giverName).toBe('Anna')
  })
})

describe('shared opportunity selection', () => {
  it('keeps a world-driven candidate over RPG stories when the settlement slot is limited', () => {
    const [wolf] = collectWolfDenPressureOpportunities('0_0', [])
    const rpg = collectRpgQuestOpportunities({
      settlementId: '0_0',
      settlementX: 0,
      settlementZ: 0,
      npcs: homeNpcs,
      landmarks: [{ id: 'ruins:1:1:0:1', kind: 'ruins' }],
      otherSettlements: [{ id: '1_0', name: 'Lasowa', x: 280, z: 0, npcs: neighborNpcs }],
    })
    const selected = selectSettlementQuestOpportunities({
      candidates: [...rpg, wolf!],
      limit: 1,
    })
    expect(selected.some((opportunity) => opportunity.kind === 'wolf-den-pressure')).toBe(true)
    expect(selected.filter((opportunity) => opportunity.kind === 'rpg-matrix')).toHaveLength(0)
  })

  it('does not select the same RPG matrix twice in one settlement', () => {
    const duplicate = {
      id: rpgQuestId('old-place-secret', '1_0', 'monolith:9:9:0:1'),
      settlementId: '1_0',
      kind: 'rpg-matrix' as const,
      matrixId: 'old-place-secret' as const,
      sourceId: 'monolith:9:9:0:1',
    }
    const first = collectOldPlaceSecretCandidate({
      settlementId: '1_0',
      landmarks: [{ id: 'ruins:1:1:0:1', kind: 'ruins' }],
    })!
    const selected = selectSettlementQuestOpportunities({
      candidates: [first!, duplicate],
    })
    expect(selected.filter((opportunity) => opportunity.kind === 'rpg-matrix')).toHaveLength(1)
  })

  it('always rematerializes a persisted generated id even after the live source disappears', () => {
    const persistedId = rpgQuestId('old-place-secret', '1_0', 'stoneCircle:8:8:0:1')
    const defs = buildWorldDrivenSettlementQuests({
      settlementId: '1_0',
      settlementName: 'Lasowa',
      spawners: [],
      npcs: neighborNpcs,
      includeWorldDriven: false,
      persistedQuestIds: [persistedId],
      rpg: {
        settlementId: '1_0',
        settlementX: 280,
        settlementZ: 0,
        npcs: neighborNpcs,
        landmarks: [],
        otherSettlements: [{ id: '0_0', name: 'Dolina', x: 0, z: 0, npcs: homeNpcs }],
        persistedQuestIds: [persistedId],
        context: {
          npcsBySettlement: new Map([['1_0', neighborNpcs]]),
          settlementNameById: new Map([['1_0', 'Lasowa']]),
        },
      },
    })
    expect(defs[0]?.id).toBe(persistedId)
    expect(defs[0]?.stages[0]?.objective).toEqual({
      type: 'interact_landmark',
      landmarkId: 'stoneCircle:8:8:0:1',
    })
  })
})

describe('QuestManager path for Sekret starego miejsca', () => {
  it('completes through the existing interact_landmark objective', () => {
    const candidate = collectOldPlaceSecretCandidate({
      settlementId: '1_0',
      landmarks: [{ id: 'monolith:4:-7:0:3f', kind: 'monolith' }],
    })!
    const def = materializeSettlementQuestOpportunity(candidate, neighborNpcs, 'Lasowa')!
    const qm = new QuestManager([def], undefined, new Inventory())
    accept(qm, neighborHunter.id)
    expect(qm.onInteractObjective({ type: 'interact_landmark', landmarkId: 'monolith:9:9:0:3f' })).toBeNull()
    const override = qm.onInteractObjective({
      type: 'interact_landmark',
      landmarkId: 'monolith:4:-7:0:3f',
    })
    expect(override?.line).toContain('stare')
    expect(qm.getState(def.id)).toBe('ready_to_report')
    speak(qm, neighborHunter.id)
    expect(qm.getState(def.id)).toBe('complete')
  })
})

describe('QuestManager path for Podejrzany transport', () => {
  it('resolves choice outcomes once through talk_to_npc_choice', () => {
    const candidate = collectSuspiciousTransportCandidate({
      settlementId: '1_0',
      npcs: neighborNpcs,
    })!
    const def = materializeRpgQuestOpportunity(candidate, neighborNpcs, 'Lasowa')!
    expect(() => validateQuestDefinitions([def])).not.toThrow()
    const qm = new QuestManager([def], undefined, new Inventory())
    accept(qm, neighborAdult.id)
    speak(qm, neighborGuard.id)
    const before = qm.getState(def.id)
    expect(before).toBe('active')
    const choice = qm.onInteract(neighborGuard.id)
    expect(choice?.actions).toHaveLength(1)
    choice?.actions?.[0]?.onSelect()
    expect(qm.getState(def.id)).toBe('complete')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('report_it')
    expect(qm.onInteract(neighborGuard.id)?.actions).toBeUndefined()
  })
})

describe('nearby RPG settlement defs', () => {
  it('uses peekDef cells, not currently loaded settlements', () => {
    const defs = new Map<string, Pick<SettlementDef, 'id' | 'gx' | 'gz' | 'x' | 'z'>>([
      ['0_1', { id: '0_1', gx: 0, gz: 1, x: 0, z: 400 }],
      ['1_0', { id: '1_0', gx: 1, gz: 0, x: 280, z: 0 }],
    ])
    const found = nearbyRpgSettlementDefs(
      { gx: 0, gz: 0, id: '0_0', x: 0, z: 0 },
      (cell: SettlementCell) => (defs.get(`${cell.gx}_${cell.gz}`) ?? null) as SettlementDef | null,
    )
    expect(found.map((def) => def.id)).toEqual(['1_0', '0_1'])
  })
})
