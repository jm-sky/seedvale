import { describe, expect, it } from 'vitest'
import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { OpportunityNpc } from './worldQuestOpportunityTypes'
import { Inventory } from '../../items/Inventory'
import { QuestManager } from '../QuestManager'
import {
  buildHunterProfessionQuests,
  hunterProfessionQuestId,
  selectHunterQuestGiver,
} from './hunterProfessionQuests'

const hunter: OpportunityNpc = { id: 'home:npc:4', name: 'Jan', role: 'hunter', child: false }
const anna: OpportunityNpc = { id: 'home:npc:0', name: 'Anna', role: 'farmer', child: false }

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

function hunterDefs() {
  return buildHunterProfessionQuests({
    settlementId: 'home',
    settlementName: 'Dolina',
    npcs: [anna, hunter],
    spawners: [thicket],
  })
}

describe('hunter profession quests (plan quests-progression-020)', () => {
  it('materializes a stable hunter giver and quest ids', () => {
    expect(selectHunterQuestGiver([anna, hunter])?.id).toBe(hunter.id)
    const defs = hunterDefs()
    expect(defs).toHaveLength(3)
    const i = hunterProfessionQuestId('home', hunter.id, 1)
    expect(defs[0]?.id).toBe(i)
    expect(defs[0]?.giver.npcId).toBe(hunter.id)
    expect(defs[1]?.giver.npcId).toBe(hunter.id)
    expect(defs[2]?.giver.npcId).toBe(hunter.id)
  })

  it('gates Hunter II behind Hunter I outcome', () => {
    const defs = hunterDefs()
    const qm = new QuestManager(defs, undefined, new Inventory())
    const ii = defs[1]!
    expect(qm.isQuestAvailable(ii.id)).toBe(false)
    qm.resolveQuest(defs[0]!.id, 'hunter_i_complete')
    expect(qm.isQuestAvailable(ii.id)).toBe(true)
  })

  it('reconstructs the same giver across rematerialization', () => {
    const first = hunterDefs()
    const again = hunterDefs()
    expect(first.map((d) => d.giver.npcId)).toEqual(again.map((d) => d.giver.npcId))
  })
})
