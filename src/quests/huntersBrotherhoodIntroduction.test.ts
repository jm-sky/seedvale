import { describe, expect, it } from 'vitest'
import type { Role } from '../ai/characters'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import { Inventory } from '../items/Inventory'
import {
  buildHuntersBrotherhoodIntroductionQuest,
  HUNTERS_BROTHERHOOD_JOINED_OUTCOME,
  huntersBrotherhoodIntroductionQuestId,
  resolveHuntersBrotherhoodBinding,
} from './huntersBrotherhoodIntroduction'
import {
  buildHunterProfessionQuests,
  HUNTER_III_COMPLETE_OUTCOME,
  hunterProfessionQuestId,
  selectHunterQuestGiver,
} from './opportunities/hunterProfessionQuests'
import { QuestManager } from './QuestManager'

function npc(id: string, name: string, role: Role, child = false): OpportunityNpc {
  return { id, name, role, child }
}

const homeHunter = npc('home:npc:4', 'Jan', 'hunter')
const homeFarmer = npc('home:npc:0', 'Anna', 'farmer')
const homeGuard = npc('home:npc:1', 'Marek', 'guard')
const homeChild = npc('home:npc:2', 'Kasia', 'farmer', true)
const nearHunter = npc('near:npc:0', 'Olek', 'hunter')
const nearFarmer = npc('near:npc:1', 'Basia', 'farmer')
const nearSmith = npc('near:npc:2', 'Tomek', 'blacksmith')
const farGuard = npc('far:npc:0', 'Piotr', 'guard')
const farFarmer = npc('far:npc:1', 'Ewa', 'farmer')
const farWoodcutter = npc('far:npc:2', 'Staś', 'woodcutter')

const home = {
  id: 'home',
  name: 'Dolina',
  npcs: [homeFarmer, homeGuard, homeChild, homeHunter],
}

const near = {
  id: 'near',
  name: 'Borowice',
  npcs: [nearHunter, nearFarmer, nearSmith],
}

const far = {
  id: 'far',
  name: 'Brzeg',
  npcs: [farGuard, farFarmer, farWoodcutter],
}

const thicket = {
  id: 'home:thicket',
  type: 'thicket',
  kind: 'deer',
  x: 10,
  z: 10,
  maxPreyCount: 3,
  respawnIntervalDays: 1,
  daysSinceLastRespawn: 0,
  state: 'active',
  deathsThisCycle: 0,
  disabledAtDay: null,
} as PreySpawner

function castInput(
  homeNpcs: readonly OpportunityNpc[] = home.npcs,
  neighbors: readonly { id: string, name: string, npcs: readonly OpportunityNpc[] }[] = [near, far],
) {
  return {
    home: { ...home, npcs: homeNpcs },
    neighbors,
  }
}

function speak(qm: QuestManager, npcId: string): string | undefined {
  return qm.onInteract(npcId)?.actions?.[0]?.onSelect()
}

describe('Hunters Brotherhood introduction (plan quests-progression-048)', () => {
  it('resolves a stable distinct cast with the home Hunter giver as inviter/practical', () => {
    const first = resolveHuntersBrotherhoodBinding(castInput())
    const again = resolveHuntersBrotherhoodBinding(castInput())
    expect(first).toEqual(again)
    expect(first?.inviterNpcId).toBe(selectHunterQuestGiver(home.npcs)?.id)
    expect(first?.practicalNpcId).toBe(first?.inviterNpcId)
    expect(first?.secondSettlementId).toBe(near.id)
    const ids = [first!.practicalNpcId, first!.masterNpcId, first!.trophyNpcId, first!.ambitiousNpcId]
    expect(new Set(ids).size).toBe(4)
    expect(first!.masterNpcId).toBe(nearHunter.id)
  })

  it('prefers a second-settlement Hunter as master and falls back to the first adult', () => {
    const withHunter = resolveHuntersBrotherhoodBinding(castInput())
    expect(withHunter?.masterNpcId).toBe(nearHunter.id)

    const noHunter = resolveHuntersBrotherhoodBinding(castInput(home.npcs, [{
      ...near,
      npcs: [nearFarmer, nearSmith, npc('near:npc:3', 'Iga', 'guard')],
    }]))
    expect(noHunter?.masterNpcId).toBe(nearFarmer.id)
    expect(noHunter?.masterNpcId).not.toBe(homeHunter.id)
  })

  it('succeeds with fewer than four professional Hunters and does not mutate professions', () => {
    const homeNpcs = [
      npc('home:npc:0', 'Anna', 'farmer'),
      npc('home:npc:4', 'Jan', 'hunter'),
    ]
    const neighborNpcs = [
      npc('near:npc:1', 'Basia', 'farmer'),
      npc('near:npc:2', 'Tomek', 'blacksmith'),
      npc('near:npc:3', 'Iga', 'guard'),
    ]
    const rolesBefore = [...homeNpcs, ...neighborNpcs].map((entry) => `${entry.id}:${entry.role}`)
    const binding = resolveHuntersBrotherhoodBinding(castInput(homeNpcs, [{ ...near, npcs: neighborNpcs }]))
    expect(binding).toBeDefined()
    expect([binding!.practicalNpcId, binding!.masterNpcId, binding!.trophyNpcId, binding!.ambitiousNpcId]
      .map((id) => [...homeNpcs, ...neighborNpcs].find((entry) => entry.id === id)?.role)
      .filter((role) => role === 'hunter')).toHaveLength(1)
    expect([...homeNpcs, ...neighborNpcs].map((entry) => `${entry.id}:${entry.role}`)).toEqual(rolesBefore)
  })

  it('skips a neighbor that cannot supply the remaining adults, then yields no binding when none can', () => {
    const thinNear = { ...near, npcs: [nearHunter] }
    const binding = resolveHuntersBrotherhoodBinding(castInput(
      [homeHunter, homeFarmer],
      [thinNear, far],
    ))
    expect(binding?.secondSettlementId).toBe(far.id)
    expect(binding?.masterNpcId).toBe(farGuard.id)

    expect(resolveHuntersBrotherhoodBinding(castInput([homeHunter], [thinNear]))).toBeUndefined()
    expect(resolveHuntersBrotherhoodBinding(castInput(home.npcs, []))).toBeUndefined()
    expect(resolveHuntersBrotherhoodBinding(castInput(
      [homeFarmer, homeGuard, homeHunter],
      [],
    ))).toBeUndefined()
  })

  it('materializes a story invitation gated on the real Hunter III outcome', () => {
    const quest = buildHuntersBrotherhoodIntroductionQuest(castInput())
    expect(quest).toBeDefined()
    const inviterId = selectHunterQuestGiver(home.npcs)!.id
    expect(quest!.id).toBe(huntersBrotherhoodIntroductionQuestId(home.id, inviterId))
    expect(quest!.offer).toEqual({ exposure: 'story' })
    expect(quest!.availability).toEqual({
      prerequisites: [{
        type: 'quest_outcome',
        questId: hunterProfessionQuestId(home.id, inviterId, 3),
        outcomeIds: [HUNTER_III_COMPLETE_OUTCOME],
      }],
    })
    expect(quest!.stages[0]?.mode).toBe('all')
    expect(quest!.stages[0]?.objectives?.map((slot) => slot.id)).toEqual(['master', 'trophy', 'ambitious'])
    expect(quest!.stages[0]?.objectives?.map((slot) => (
      slot.objective.type === 'talk_to_npc' ? slot.objective.npc.npcId : undefined
    ))).toEqual([
      quest && resolveHuntersBrotherhoodBinding(castInput())!.masterNpcId,
      quest && resolveHuntersBrotherhoodBinding(castInput())!.trophyNpcId,
      quest && resolveHuntersBrotherhoodBinding(castInput())!.ambitiousNpcId,
    ])
    expect(quest!.outcomes.map((outcome) => outcome.id)).toEqual([HUNTERS_BROTHERHOOD_JOINED_OUTCOME])
    expect(quest!.outcomes[0]?.reward).toBeUndefined()
  })

  it('becomes eligible only after Hunter III, then joins exactly once after all three talks', () => {
    const hunterDefs = buildHunterProfessionQuests({
      settlementId: home.id,
      settlementName: home.name,
      npcs: home.npcs,
      spawners: [thicket],
    })
    const brotherhood = buildHuntersBrotherhoodIntroductionQuest(castInput())!
    const binding = resolveHuntersBrotherhoodBinding(castInput())!
    const qm = new QuestManager([...hunterDefs, brotherhood], undefined, new Inventory())
    expect(qm.isQuestAvailable(brotherhood.id)).toBe(false)

    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 1), 'hunter_i_complete')
    expect(qm.isQuestAvailable(brotherhood.id)).toBe(false)
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 2), 'hunter_ii_complete')
    expect(qm.isQuestAvailable(brotherhood.id)).toBe(false)
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 3), HUNTER_III_COMPLETE_OUTCOME)
    expect(qm.isQuestAvailable(brotherhood.id)).toBe(true)

    qm.onInteract(binding.inviterNpcId)?.offer?.onAccept()
    expect(qm.getState(brotherhood.id)).toBe('active')
    speak(qm, binding.trophyNpcId)
    expect(qm.getState(brotherhood.id)).toBe('active')
    speak(qm, binding.ambitiousNpcId)
    expect(qm.getState(brotherhood.id)).toBe('active')
    speak(qm, binding.masterNpcId)
    expect(qm.getState(brotherhood.id)).toBe('ready_to_report')
    speak(qm, binding.inviterNpcId)
    expect(qm.getState(brotherhood.id)).toBe('complete')
    expect(qm.exportProgress().find((entry) => entry.id === brotherhood.id)?.resolvedOutcomeId)
      .toBe(HUNTERS_BROTHERHOOD_JOINED_OUTCOME)
    expect(qm.resolveQuest(brotherhood.id, HUNTERS_BROTHERHOOD_JOINED_OUTCOME)).toBe(false)
  })

  it('rebuilds the same ids from persisted progress after save/load', () => {
    const hunterDefs = buildHunterProfessionQuests({
      settlementId: home.id,
      settlementName: home.name,
      npcs: home.npcs,
      spawners: [thicket],
    })
    const first = buildHuntersBrotherhoodIntroductionQuest(castInput())!
    const binding = resolveHuntersBrotherhoodBinding(castInput())!
    const qm = new QuestManager([...hunterDefs, first], undefined, new Inventory())
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 1), 'hunter_i_complete')
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 2), 'hunter_ii_complete')
    qm.resolveQuest(hunterProfessionQuestId(home.id, binding.inviterNpcId, 3), HUNTER_III_COMPLETE_OUTCOME)
    qm.onInteract(binding.inviterNpcId)?.offer?.onAccept()
    speak(qm, binding.masterNpcId)
    const saved = qm.exportProgress()

    const rebuilt = buildHuntersBrotherhoodIntroductionQuest(castInput())!
    expect(rebuilt.id).toBe(first.id)
    expect(rebuilt.giver.npcId).toBe(first.giver.npcId)
    expect(rebuilt.stages[0]?.objectives?.map((slot) => (
      slot.objective.type === 'talk_to_npc' ? slot.objective.npc.npcId : undefined
    ))).toEqual(first.stages[0]?.objectives?.map((slot) => (
      slot.objective.type === 'talk_to_npc' ? slot.objective.npc.npcId : undefined
    )))

    const restored = new QuestManager(
      [...hunterDefs, rebuilt],
      undefined,
      new Inventory(),
      { progress: saved, relations: {} },
    )
    expect(restored.getState(rebuilt.id)).toBe('active')
    speak(restored, binding.trophyNpcId)
    speak(restored, binding.ambitiousNpcId)
    expect(restored.getState(rebuilt.id)).toBe('ready_to_report')
    speak(restored, binding.inviterNpcId)
    expect(restored.exportProgress().find((entry) => entry.id === rebuilt.id)?.resolvedOutcomeId)
      .toBe(HUNTERS_BROTHERHOOD_JOINED_OUTCOME)
  })
})
