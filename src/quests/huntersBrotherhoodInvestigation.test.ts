import { describe, expect, it } from 'vitest'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { HabitatPressureScoreInput, HabitatPressureSnapshot } from '../fauna/habitatPressure'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import type { QuestLifecycleHooks } from './QuestManager'
import type { QuestHabitatPressureObservation } from './quests'
import { scoreHabitatPressure } from '../fauna/habitatPressure'
import { Inventory } from '../items/Inventory'
import {
  buildHuntersBrotherhoodIntroductionQuest,
  HUNTERS_BROTHERHOOD_JOINED_OUTCOME,
  resolveHuntersBrotherhoodBinding,
} from './huntersBrotherhoodIntroduction'
import {
  buildHuntersBrotherhoodInvestigationQuest,
  deriveBrotherhoodHabitatDiagnosis,
  describeBrotherhoodHabitatDiagnosis,
  habitatPressureObservationFromSnapshot,
  HUNTERS_BROTHERHOOD_INVESTIGATION_COMPLETE_OUTCOME,
  huntersBrotherhoodInvestigationQuestId,
  huntingGroundCandidateSpawners,
  rankHuntingGroundCandidates,
  selectHuntingGroundSpawnerId,
} from './huntersBrotherhoodInvestigation'
import { buildHunterProfessionQuests, HUNTER_III_COMPLETE_OUTCOME, hunterProfessionQuestId } from './opportunities/hunterProfessionQuests'
import { QuestManager } from './QuestManager'

function npc(id: string, name: string, role: OpportunityNpc['role']): OpportunityNpc {
  return { id, name, role, child: false }
}

const homeHunter = npc('home:npc:4', 'Jan', 'hunter')
const homeFarmer = npc('home:npc:0', 'Anna', 'farmer')
const nearHunter = npc('near:npc:0', 'Olek', 'hunter')
const nearFarmer = npc('near:npc:1', 'Basia', 'farmer')
const nearSmith = npc('near:npc:2', 'Tomek', 'blacksmith')

const home = { id: 'home', name: 'Dolina', npcs: [homeFarmer, homeHunter] }
const near = { id: 'near', name: 'Borowice', npcs: [nearHunter, nearFarmer, nearSmith] }

const castInput = { home, neighbors: [near] }
const binding = resolveHuntersBrotherhoodBinding(castInput)!

function spawner(id: string, overrides: Partial<PreySpawner> = {}): PreySpawner {
  return {
    id,
    x: 0,
    z: 0,
    type: 'thicket',
    kind: 'deer',
    maxPreyCount: 3,
    respawnIntervalDays: 1,
    daysSinceLastRespawn: 0,
    state: 'active',
    deathsThisCycle: 0,
    disabledAtDay: null,
    ...overrides,
  } as PreySpawner
}

function pressure(habitatId: string, overrides: Partial<HabitatPressureScoreInput> = {}): HabitatPressureSnapshot {
  return scoreHabitatPressure({
    habitatId,
    kind: 'deer',
    state: 'active',
    live: 3,
    capacity: 3,
    deathsThisCycle: 0,
    mortalityThreshold: 2,
    nearbyPredators: 0,
    forageAvailable: 10,
    ...overrides,
  })
}

const healthySnapshot = pressure('home:thicket')
const mortalitySnapshot = pressure('home:thicket', { deathsThisCycle: 1, mortalityThreshold: 2 }) // strained, mortality only (0.5)
const criticalPopulationSnapshot = pressure('near:thicket', { live: 0, capacity: 3 }) // critical, population-loss dominant (1.0)
const multiPressureSnapshot = pressure('home:thicket', {
  deathsThisCycle: 1,
  mortalityThreshold: 2,
  nearbyPredators: 3,
})

describe('Hunters Brotherhood hunting-ground candidate selection (plan quests-progression-049)', () => {
  it('bounds candidates to deer thickets of the two Brotherhood settlements', () => {
    const spawners = [
      spawner('home:thicket'),
      spawner('near:thicket'),
      spawner('far:thicket'),
      spawner('home:cave', { type: 'rockDen', kind: 'wolf' }),
      spawner('home:wolfDen', { type: 'wolfDen', kind: 'wolf' }),
    ]
    const candidates = huntingGroundCandidateSpawners(binding, spawners)
    expect(candidates.map((s) => s.id).sort()).toEqual(['home:thicket', 'near:thicket'])
  })

  it('ranks critical over strained, then by max component pressure, then stable id', () => {
    const ranked = rankHuntingGroundCandidates([
      { spawnerId: 'b:thicket', snapshot: mortalitySnapshot },
      { spawnerId: 'a:thicket', snapshot: criticalPopulationSnapshot },
    ])
    expect(ranked.map((c) => c.spawnerId)).toEqual(['a:thicket', 'b:thicket'])

    const tie = rankHuntingGroundCandidates([
      { spawnerId: 'z:thicket', snapshot: mortalitySnapshot },
      { spawnerId: 'a:thicket', snapshot: mortalitySnapshot },
    ])
    expect(tie.map((c) => c.spawnerId)).toEqual(['a:thicket', 'z:thicket'])
  })

  it('selects no target when every candidate is healthy', () => {
    const spawners = [spawner('home:thicket'), spawner('near:thicket')]
    const spawnerId = selectHuntingGroundSpawnerId(
      binding,
      spawners,
      (id) => (id === 'home:thicket' ? healthySnapshot : pressure(id)),
      0,
    )
    expect(spawnerId).toBeUndefined()
  })

  it('selects the deterministically worse of two unhealthy candidates', () => {
    const spawners = [spawner('home:thicket'), spawner('near:thicket')]
    const spawnerId = selectHuntingGroundSpawnerId(
      binding,
      spawners,
      (id) => (id === 'home:thicket' ? mortalitySnapshot : criticalPopulationSnapshot),
      0,
    )
    expect(spawnerId).toBe('near:thicket')
  })
})

describe('Hunters Brotherhood habitat diagnosis (plan quests-progression-049)', () => {
  it('derives a healthy diagnosis with no primary and no observed pressures', () => {
    const diagnosis = deriveBrotherhoodHabitatDiagnosis(healthySnapshot)
    expect(diagnosis).toEqual({ condition: 'healthy', primary: null, observedPressures: [] })
  })

  it('derives a mortality-only diagnosis without inventing predator/food pressure', () => {
    const diagnosis = deriveBrotherhoodHabitatDiagnosis(mortalitySnapshot)
    expect(diagnosis.condition).toBe('strained')
    expect(diagnosis.primary).toBe('mortality')
    expect(diagnosis.observedPressures).toEqual(['mortality'])
  })

  it('includes every significant secondary pressure in tie order', () => {
    const diagnosis = deriveBrotherhoodHabitatDiagnosis(multiPressureSnapshot)
    expect(diagnosis.observedPressures).toEqual(['mortality', 'predators'])
  })

  it('never attributes mortality to a cause in the narrative text', () => {
    const text = describeBrotherhoodHabitatDiagnosis(deriveBrotherhoodHabitatDiagnosis(mortalitySnapshot))
    expect(text).toContain('ostatnio padło sporo zwierząt')
    expect(text).not.toMatch(/wilk|wilcz|człowiek|ludzie|myśliw.*zabi/i)
  })

  it('reports a neutral recovered case for a healthy snapshot', () => {
    const text = describeBrotherhoodHabitatDiagnosis(deriveBrotherhoodHabitatDiagnosis(healthySnapshot))
    expect(text).toContain('ustabilizowała')
  })
})

describe('Hunters Brotherhood investigation quest materialization (plan quests-progression-049)', () => {
  it('does not materialize when no bound-settlement thicket has a meaningful problem', () => {
    const spawners = [spawner('home:thicket'), spawner('near:thicket')]
    const def = buildHuntersBrotherhoodInvestigationQuest({
      binding,
      spawners,
      getHabitatPressure: () => healthySnapshot,
      nowDays: 0,
    })
    expect(def).toBeUndefined()
  })

  it('binds the quest id and interact_spawner objective to the selected habitat', () => {
    const spawners = [spawner('home:thicket'), spawner('near:thicket')]
    const def = buildHuntersBrotherhoodInvestigationQuest({
      binding,
      spawners,
      getHabitatPressure: (id) => (id === 'home:thicket' ? mortalitySnapshot : healthySnapshot),
      nowDays: 0,
    })
    expect(def).toBeDefined()
    expect(def!.id).toBe(huntersBrotherhoodInvestigationQuestId(binding.homeSettlementId, binding.inviterNpcId, 'home:thicket'))
    expect(def!.giver.npcId).toBe(binding.masterNpcId)
    expect(def!.offer).toEqual({ exposure: 'story' })
    expect(def!.availability?.prerequisites).toEqual([{
      type: 'quest_outcome',
      questId: expect.stringContaining(binding.homeSettlementId),
      outcomeIds: [HUNTERS_BROTHERHOOD_JOINED_OUTCOME],
    }])
    expect(def!.stages).toHaveLength(1)
    expect(def!.stages[0]?.objective).toEqual({ type: 'interact_spawner', spawnerType: 'thicket', spawnerId: 'home:thicket' })
    expect(def!.outcomes.map((o) => o.id)).toEqual([HUNTERS_BROTHERHOOD_INVESTIGATION_COMPLETE_OUTCOME])
  })
})

function speak(qm: QuestManager, npcId: string): string | undefined {
  return qm.onInteract(npcId)?.actions?.[0]?.onSelect()
}

function joinBrotherhood(): { qm: QuestManager, hooks: QuestLifecycleHooks, spawnerId: string, investigationId: string } {
  const hunterDefs = buildHunterProfessionQuests({
    settlementId: home.id,
    settlementName: home.name,
    npcs: home.npcs,
    spawners: [spawner('home:thicket')],
  })
  const introduction = buildHuntersBrotherhoodIntroductionQuest(castInput)!
  const spawnerId = 'home:thicket'
  const investigation = buildHuntersBrotherhoodInvestigationQuest({
    binding,
    spawners: [spawner(spawnerId)],
    getHabitatPressure: () => mortalitySnapshot,
    nowDays: 0,
  })!

  const observations = new Map<string, HabitatPressureSnapshot>([[spawnerId, mortalitySnapshot]])
  const hooks: QuestLifecycleHooks = {
    onInteractSpawnerMatched: (questId, matchedSpawnerId) => {
      if (questId !== investigation.id || matchedSpawnerId !== spawnerId) return
      const snapshot = observations.get(matchedSpawnerId)
      if (!snapshot) return
      qm.recordObservation(questId, habitatPressureObservationFromSnapshot(snapshot))
    },
  }
  const qm: QuestManager = new QuestManager(
    [...hunterDefs, introduction, investigation],
    undefined,
    new Inventory(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    hooks,
  )

  qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 1), 'hunter_i_complete')
  qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 2), 'hunter_ii_complete')
  qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 3), HUNTER_III_COMPLETE_OUTCOME)
  qm.onInteract(binding.inviterNpcId)?.offer?.onAccept()
  speak(qm, binding.trophyNpcId)
  speak(qm, binding.ambitiousNpcId)
  speak(qm, binding.masterNpcId)
  qm.resolveQuest(introduction.id, HUNTERS_BROTHERHOOD_JOINED_OUTCOME)

  return { qm, hooks, spawnerId, investigationId: investigation.id }
}

describe('Hunters Brotherhood investigation lifecycle (plan quests-progression-049)', () => {
  it('is unavailable before Brotherhood membership', () => {
    const { qm, investigationId } = joinBrotherhoodStopBeforeOutcome()
    expect(qm.isQuestAvailable(investigationId)).toBe(false)
  })

  it('captures the observation once on the bound interact_spawner and reports it, not a later live re-read', () => {
    const { qm, spawnerId, investigationId } = joinBrotherhood()
    expect(qm.isQuestAvailable(investigationId)).toBe(true)

    qm.onInteract(binding.masterNpcId)?.offer?.onAccept()
    expect(qm.getState(investigationId)).toBe('active')

    const override = qm.onInteractObjective({ type: 'interact_spawner', spawnerType: 'thicket', spawnerId })
    expect(override).not.toBeNull()
    expect(qm.getState(investigationId)).toBe('ready_to_report')
    expect(qm.exportProgress().find((e) => e.id === investigationId)?.observation?.primary).toBe('mortality')

    // A second interaction after capture must not overwrite the recorded observation.
    qm.recordObservation(investigationId, habitatPressureObservationFromSnapshot(healthySnapshot))
    expect(qm.exportProgress().find((e) => e.id === investigationId)?.observation?.primary).toBe('mortality')

    const reportLine = speak(qm, binding.masterNpcId)
    expect(qm.getState(investigationId)).toBe('complete')
    expect(reportLine).toContain('ostatnio padło sporo zwierząt')
    expect(qm.exportProgress().find((e) => e.id === investigationId)?.resolvedOutcomeId)
      .toBe(HUNTERS_BROTHERHOOD_INVESTIGATION_COMPLETE_OUTCOME)
  })

  it('remains completable and reports a recovered habitat truthfully', () => {
    const hunterDefs = buildHunterProfessionQuests({
      settlementId: home.id,
      settlementName: home.name,
      npcs: home.npcs,
      spawners: [spawner('home:thicket')],
    })
    const introduction = buildHuntersBrotherhoodIntroductionQuest(castInput)!
    const spawnerId = 'home:thicket'
    const investigation = buildHuntersBrotherhoodInvestigationQuest({
      binding,
      spawners: [spawner(spawnerId)],
      getHabitatPressure: () => mortalitySnapshot,
      nowDays: 0,
    })!

    const hooks: QuestLifecycleHooks = {
      onInteractSpawnerMatched: (questId, matchedSpawnerId) => {
        if (questId !== investigation.id || matchedSpawnerId !== spawnerId) return
        // The world recovered between acceptance and inspection — the
        // capture must reflect the *current* snapshot, not the one used
        // to originally expose the quest.
        qm.recordObservation(questId, habitatPressureObservationFromSnapshot(healthySnapshot))
      },
    }
    const qm: QuestManager = new QuestManager(
      [...hunterDefs, introduction, investigation],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      hooks,
    )
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 1), 'hunter_i_complete')
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 2), 'hunter_ii_complete')
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 3), HUNTER_III_COMPLETE_OUTCOME)
    qm.onInteract(binding.inviterNpcId)?.offer?.onAccept()
    speak(qm, binding.trophyNpcId)
    speak(qm, binding.ambitiousNpcId)
    speak(qm, binding.masterNpcId)
    qm.resolveQuest(introduction.id, HUNTERS_BROTHERHOOD_JOINED_OUTCOME)

    qm.onInteract(binding.masterNpcId)?.offer?.onAccept()
    qm.onInteractObjective({ type: 'interact_spawner', spawnerType: 'thicket', spawnerId })
    const reportLine = speak(qm, binding.masterNpcId)
    expect(qm.getState(investigation.id)).toBe('complete')
    expect(reportLine).toContain('ustabilizowała')
  })

  it('preserves the captured observation across a save/load round trip', () => {
    const { qm, spawnerId, investigationId } = joinBrotherhood()
    qm.onInteract(binding.masterNpcId)?.offer?.onAccept()
    qm.onInteractObjective({ type: 'interact_spawner', spawnerType: 'thicket', spawnerId })
    const saved = qm.exportProgress()
    expect(saved.find((e) => e.id === investigationId)?.observation).toBeDefined()

    const hunterDefs = buildHunterProfessionQuests({
      settlementId: home.id,
      settlementName: home.name,
      npcs: home.npcs,
      spawners: [spawner('home:thicket')],
    })
    const introduction = buildHuntersBrotherhoodIntroductionQuest(castInput)!
    const investigation = buildHuntersBrotherhoodInvestigationQuest({
      binding,
      spawners: [spawner(spawnerId)],
      getHabitatPressure: () => mortalitySnapshot,
      nowDays: 0,
    })!
    const restored = new QuestManager(
      [...hunterDefs, introduction, investigation],
      undefined,
      new Inventory(),
      { progress: saved, relations: qm.exportRelations() },
    )
    expect(restored.getState(investigationId)).toBe('ready_to_report')
    const reportLine = speak(restored, binding.masterNpcId)
    expect(restored.getState(investigationId)).toBe('complete')
    expect(reportLine).toContain('ostatnio padło sporo zwierząt')
  })
})

function joinBrotherhoodStopBeforeOutcome(): { qm: QuestManager, investigationId: string } {
  const hunterDefs = buildHunterProfessionQuests({
    settlementId: home.id,
    settlementName: home.name,
    npcs: home.npcs,
    spawners: [spawner('home:thicket')],
  })
  const introduction = buildHuntersBrotherhoodIntroductionQuest(castInput)!
  const investigation = buildHuntersBrotherhoodInvestigationQuest({
    binding,
    spawners: [spawner('home:thicket')],
    getHabitatPressure: () => mortalitySnapshot,
    nowDays: 0,
  })!
  const qm = new QuestManager([...hunterDefs, introduction, investigation], undefined, new Inventory())
  return { qm, investigationId: investigation.id }
}

// Sanity check for the observation helper directly, independent of the
// candidate-selection tests above.
describe('habitatPressureObservationFromSnapshot (plan quests-progression-049)', () => {
  it('carries only the compact narrative fields, not the full snapshot', () => {
    const observation: QuestHabitatPressureObservation = habitatPressureObservationFromSnapshot(mortalitySnapshot)
    expect(observation).toEqual({
      type: 'habitat_pressure',
      habitatId: 'home:thicket',
      condition: 'strained',
      primary: 'mortality',
      observedPressures: ['mortality'],
    })
  })
})
