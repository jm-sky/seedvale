import { describe, expect, it } from 'vitest'
import type { NpcTraceEvent } from './npcTrace'
import {
  buildNpcDecisionDiagnostics,
  projectNpcContractEvaluations,
  projectNpcDecisionCycles,
} from './npcDecisionReport'

describe('projectNpcDecisionCycles', () => {
  it('groups need → strategy → action in buffer order without reordering equal simTime', () => {
    const events: NpcTraceEvent[] = [
      { simTime: 1, type: 'need.selected', need: 'water', pressures: [] },
      { simTime: 1, type: 'strategy.selected', need: 'water', candidates: [], selected: 'well' },
      { simTime: 1, type: 'action.planned', action: 'work', queueId: null },
      { simTime: 2, type: 'need.selected', need: 'food', pressures: [] },
    ]
    const cycles = projectNpcDecisionCycles(events)
    expect(cycles).toHaveLength(2)
    expect(cycles[0]).toMatchObject({
      simTime: 1,
      need: 'water',
      selectedStrategy: 'well',
      action: 'work',
      eventTypes: ['need.selected', 'strategy.selected', 'action.planned'],
    })
    expect(cycles[1]).toMatchObject({ simTime: 2, need: 'food', selectedStrategy: null, action: null })
  })
})

describe('projectNpcContractEvaluations', () => {
  it('pairs evaluation with the next acceptance before another evaluation', () => {
    const breakdown = {
      scope: 'measurable' as const,
      expectedReward: 10,
      suitability: 5,
      travelCost: 0,
      workCost: 3,
      scheduleConflict: 0,
      provisionPenalty: 0,
      score: 12,
    }
    const events: NpcTraceEvent[] = [
      { simTime: 5, type: 'contract.evaluated', candidates: [{ contractId: 'a', score: 12, breakdown }] },
      { simTime: 5.1, type: 'contract.accepted', contractId: 'a', score: 12 },
      { simTime: 10, type: 'contract.evaluated', candidates: [{ contractId: 'b', score: -1, breakdown: { ...breakdown, score: -1 } }] },
    ]
    const passes = projectNpcContractEvaluations(events)
    expect(passes).toHaveLength(2)
    expect(passes[0]?.accepted?.contractId).toBe('a')
    expect(passes[1]?.accepted).toBeNull()
  })
})

describe('buildNpcDecisionDiagnostics', () => {
  it('respects HistoryFilter types without duplicating events', () => {
    const events: NpcTraceEvent[] = [
      { simTime: 1, type: 'animalThreat.sensed', animalId: 'w1', distance: 3 },
      {
        simTime: 2,
        type: 'animalThreat.response',
        response: 'flee',
        canFight: false,
        healthRatio: 1,
        defendScore: null,
        fleeScore: 1.9,
        hasMeleeCapability: false,
        hasRangedCapability: false,
        neuroticism: 0.5,
        guardResponsibility: false,
      },
      { simTime: 3, type: 'queue.joined', queueId: 'well' },
    ]
    const report = buildNpcDecisionDiagnostics('npc:0', events, { types: ['animalThreat.sensed', 'animalThreat.response'] })
    expect(report.animalThreat.sensedCount).toBe(1)
    expect(report.animalThreat.responses).toHaveLength(1)
    expect(report.combat.started).toBe(0)
  })
})
