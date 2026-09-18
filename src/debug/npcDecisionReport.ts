import type { NeedId } from '../ai/Needs'
import type { ActionId } from '../ai/NpcAgent'
import type { HistoryFilter } from './domainHistory'
import type { NpcTraceEvent } from './npcTrace'
import { filterHistory } from './domainHistory'

/**
 * Pure read-only projections over bounded NPC trace histories (plan
 * tools-013). Never reruns scoring, never mutates agents, never owns buffers.
 *
 * @domain tools
 */

export const NPC_TRACE_LIFETIME_NOTE =
  'NPC traces cover live agents only (bounded ring buffer, not persisted across settlement unload/rebuild).'

const DEFAULT_CYCLE_LIMIT = 8
const DEFAULT_CONTRACT_LIMIT = 5

export type NpcDecisionCycleProjection = {
  simTime: number
  need: NeedId | null
  selectedStrategy: string | null
  action: ActionId | null
  eventTypes: readonly string[]
}

export type NpcAnimalThreatResponseProjection = {
  simTime: number
  response: 'defend' | 'flee'
  defendScore: number | null
  fleeScore: number
  canFight: boolean
  healthRatio: number
  neuroticism: number
  hasMeleeCapability: boolean
  hasRangedCapability: boolean
  guardResponsibility: boolean
}

export type NpcAnimalThreatProjection = {
  sensedCount: number
  lastSensed: { simTime: number; animalId: string; distance: number } | null
  responses: readonly NpcAnimalThreatResponseProjection[]
  combatStarted: number
  combatEnded: number
  combatHitsTaken: number
  diedInCombat: boolean
}

type ContractEvaluatedEvent = Extract<NpcTraceEvent, { type: 'contract.evaluated' }>

export type NpcContractEvaluationProjection = {
  simTime: number
  candidates: ContractEvaluatedEvent['candidates']
  accepted: { simTime: number; contractId: string; score: number } | null
}

export type NpcCombatSummaryProjection = {
  started: number
  ended: number
  hits: number
  died: boolean
}

export type NpcDecisionDiagnostics = {
  npcId: string
  traceLifetimeNote: string
  recentCycles: readonly NpcDecisionCycleProjection[]
  animalThreat: NpcAnimalThreatProjection
  contractEvaluations: readonly NpcContractEvaluationProjection[]
  combat: NpcCombatSummaryProjection
}

export type SettlementDecisionReport = {
  settlementId: string
  settlementName: string
  traceLifetimeNote: string
  loadedNpcCount: number
  npcs: readonly NpcDecisionDiagnostics[]
}

function finishCycle(partial: {
  simTime: number
  need: NeedId | null
  selectedStrategy: string | null
  action: ActionId | null
  eventTypes: readonly string[]
}): NpcDecisionCycleProjection {
  return {
    simTime: partial.simTime,
    need: partial.need,
    selectedStrategy: partial.selectedStrategy,
    action: partial.action,
    eventTypes: partial.eventTypes,
  }
}

/** Groups `need.selected` → `strategy.selected` → `action.planned` chains in
 *  buffer order (equal `simTime` keeps insertion order). */
export function projectNpcDecisionCycles(
  events: readonly NpcTraceEvent[],
  limit = DEFAULT_CYCLE_LIMIT,
): readonly NpcDecisionCycleProjection[] {
  const cycles: NpcDecisionCycleProjection[] = []
  let current: {
    simTime: number
    need: NeedId | null
    selectedStrategy: string | null
    action: ActionId | null
    eventTypes: string[]
  } | null = null

  for (const event of events) {
    if (event.type === 'need.selected') {
      if (current) cycles.push(finishCycle(current))
      current = {
        simTime: event.simTime,
        need: event.need,
        selectedStrategy: null,
        action: null,
        eventTypes: ['need.selected'],
      }
      continue
    }
    if (!current) continue
    if (event.type === 'strategy.selected' && event.need === current.need) {
      current.selectedStrategy = event.selected
      current.eventTypes.push('strategy.selected')
    } else if (event.type === 'action.planned') {
      current.action = event.action
      current.eventTypes.push('action.planned')
    }
  }
  if (current) cycles.push(finishCycle(current))
  return cycles.slice(-limit)
}

function mapThreatResponse(event: NpcTraceEvent & { type: 'animalThreat.response' }): NpcAnimalThreatResponseProjection {
  return {
    simTime: event.simTime,
    response: event.response,
    defendScore: event.defendScore ?? null,
    fleeScore: event.fleeScore,
    canFight: event.canFight,
    healthRatio: event.healthRatio,
    neuroticism: event.neuroticism,
    hasMeleeCapability: event.hasMeleeCapability,
    hasRangedCapability: event.hasRangedCapability,
    guardResponsibility: event.guardResponsibility,
  }
}

/** Summarizes animal-threat perception, arbitration and combat outcomes. */
export function projectNpcAnimalThreat(events: readonly NpcTraceEvent[]): NpcAnimalThreatProjection {
  let sensedCount = 0
  let lastSensed: NpcAnimalThreatProjection['lastSensed'] = null
  const responses: NpcAnimalThreatResponseProjection[] = []
  let combatStarted = 0
  let combatEnded = 0
  let combatHitsTaken = 0
  let diedInCombat = false

  for (const event of events) {
    switch (event.type) {
      case 'animalThreat.response':
        responses.push(mapThreatResponse(event))
        break
      case 'animalThreat.sensed':
        sensedCount++
        lastSensed = { simTime: event.simTime, animalId: event.animalId, distance: event.distance }
        break
      case 'combat.died':
        diedInCombat = true
        break
      case 'combat.ended':
        combatEnded++
        break
      case 'combat.hit':
        combatHitsTaken++
        break
      case 'combat.started':
        combatStarted++
        break
    }
  }

  return {
    sensedCount,
    lastSensed,
    responses,
    combatStarted,
    combatEnded,
    combatHitsTaken,
    diedInCombat,
  }
}

export function projectNpcCombatSummary(events: readonly NpcTraceEvent[]): NpcCombatSummaryProjection {
  const threat = projectNpcAnimalThreat(events)
  return {
    started: threat.combatStarted,
    ended: threat.combatEnded,
    hits: threat.combatHitsTaken,
    died: threat.diedInCombat,
  }
}

/** Pairs each `contract.evaluated` with the next `contract.accepted` at the
 *  same or later sim time before the following evaluation pass. */
export function projectNpcContractEvaluations(
  events: readonly NpcTraceEvent[],
  limit = DEFAULT_CONTRACT_LIMIT,
): readonly NpcContractEvaluationProjection[] {
  const out: NpcContractEvaluationProjection[] = []
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!
    if (event.type !== 'contract.evaluated') continue
    let accepted: NpcContractEvaluationProjection['accepted'] = null
    for (let j = i + 1; j < events.length; j++) {
      const next = events[j]!
      if (next.type === 'contract.evaluated') break
      if (next.type === 'contract.accepted') {
        accepted = { simTime: next.simTime, contractId: next.contractId, score: next.score }
        break
      }
    }
    out.push({ simTime: event.simTime, candidates: event.candidates, accepted })
  }
  return out.slice(-limit)
}

/** Compact per-NPC diagnostics from one live trace snapshot. */
export function buildNpcDecisionDiagnostics(
  npcId: string,
  events: readonly NpcTraceEvent[],
  filter?: HistoryFilter,
): NpcDecisionDiagnostics {
  const filtered = filter ? filterHistory(events, filter) : events
  return {
    npcId,
    traceLifetimeNote: NPC_TRACE_LIFETIME_NOTE,
    recentCycles: projectNpcDecisionCycles(filtered),
    animalThreat: projectNpcAnimalThreat(filtered),
    contractEvaluations: projectNpcContractEvaluations(filtered),
    combat: projectNpcCombatSummary(filtered),
  }
}
