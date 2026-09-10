import { describe, expect, it } from 'vitest'
import type { NpcAgent } from '../ai/NpcAgent'
import type { Settlement } from '../settlement/createSettlement'
import type { QuestDef } from '../quests/quests'
import { Inventory } from '../items/Inventory'
import { QuestManager } from '../quests/QuestManager'
import {
  closeNpcDialogueMenu,
  openNpcDialogueMenu,
  resolveNpcDialogueOpenTopic,
  ui,
} from './store'

function quest(
  partial: Omit<QuestDef, 'title' | 'description' | 'outcomes'> & Partial<Pick<QuestDef, 'title' | 'description' | 'outcomes'>>,
): QuestDef {
  return {
    ...partial,
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.offerLine,
    outcomes: partial.outcomes ?? [{
      id: 'complete',
      state: 'complete',
      consequences: { relations: [{ npcName: partial.giverName, delta: 1 }] },
    }],
  }
}

const talkToPiotrQuest = quest({
  id: 'relay',
  giverName: 'Anna',
  offerLine: 'offer',
  stages: [
    {
      objective: { type: 'talk_to_npc', npcName: 'Piotr' },
      description: 'talk',
      reminderLine: 'remind',
      progressLine: 'piotr quest line',
    },
  ],
  reportLine: 'report',
})

function acceptOffer(qm: QuestManager, npcName: string): void {
  const offer = qm.onInteract(npcName)
  offer?.offer?.onAccept()
}

function stubNpc(name: string, dialogueLine = 'generic greeting'): NpcAgent {
  return {
    name,
    displayName: name,
    getDialogueLine: () => dialogueLine,
    preparePaymentRequest: () => null,
    voiceActor: 'alex',
    mesh: { position: { x: 0, y: 0, z: 0 } },
  } as NpcAgent
}

const stubSettlement = { isHome: true, name: 'Test' } as Settlement

describe('openNpcDialogueMenu talk_to_npc seam', () => {
  it('opens on the quest line, advances the stage once, and does not require the generic help topic', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    acceptOffer(qm, 'Anna')
    expect(qm.getState('relay')).toBe('active')

    openNpcDialogueMenu(stubNpc('Piotr'), stubSettlement, qm, 12)

    expect(ui.npcDialogueMenu.helpFromQuestManager).toBe(true)
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('piotr quest line')
    expect(resolveNpcDialogueOpenTopic()).toBe('help')
    expect(qm.getState('relay')).toBe('ready_to_report')

    closeNpcDialogueMenu()

    openNpcDialogueMenu(stubNpc('Piotr'), stubSettlement, qm, 12)
    expect(ui.npcDialogueMenu.helpFromQuestManager).toBe(false)
    expect(resolveNpcDialogueOpenTopic()).toBeNull()
    expect(qm.getState('relay')).toBe('ready_to_report')
  })

  it('keeps the topic picker when only the generic greeting fallback applies', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    openNpcDialogueMenu(stubNpc('Piotr', 'hello there'), stubSettlement, qm, 12)

    expect(ui.npcDialogueMenu.helpFromQuestManager).toBe(false)
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('hello there')
    expect(resolveNpcDialogueOpenTopic()).toBeNull()

    closeNpcDialogueMenu()
  })
})
