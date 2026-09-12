import { describe, expect, it } from 'vitest'
import type { NpcAgent } from '../ai/NpcAgent'
import type { QuestDef } from '../quests/quests'
import type { Settlement } from '../settlement/createSettlement'
import { Inventory } from '../items/Inventory'
import { QuestManager } from '../quests/QuestManager'
import {
  closeNpcDialogueMenu,
  openNpcDialogueMenu,
  resolveNpcDialogueHelp,
  resolveNpcDialogueOpenTopic,
  selectNpcDialogueHelpAction,
  ui,
} from './store'

function quest(
  partial: Omit<QuestDef, 'title' | 'description' | 'outcomes' | 'giver'> & Partial<Pick<QuestDef, 'title' | 'description' | 'outcomes' | 'giver'>>,
): QuestDef {
  const giver = partial.giver ?? { npcId: partial.giverName }
  return {
    ...partial,
    giver,
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.offerLine,
    outcomes: partial.outcomes ?? [{
      id: 'complete',
      state: 'complete',
      consequences: { relations: [{ npc: giver, delta: 1 }] },
    }],
  }
}

const ANNA_ID = 'anna-id'
const PIOTR_ID = 'piotr-id'
const WRONG_JAN_ID = 'other-settlement:npc:7'

const talkToPiotrQuest = quest({
  id: 'relay',
  giverName: 'Anna',
  giver: { npcId: ANNA_ID },
  offerLine: 'offer',
  stages: [
    {
      objective: { type: 'talk_to_npc', npc: { npcId: PIOTR_ID } },
      description: 'talk',
      reminderLine: 'remind',
      playerLine: 'Anna mówiła, że jutro idziecie na ryby o świcie.',
      progressLine: 'piotr quest line',
    },
  ],
  reportPromptLine: 'Przekazałeś już Piotrowi?',
  reportPlayerLine: 'Tak. Będzie o świcie.',
  reportLine: 'report',
})

function acceptOffer(qm: QuestManager, npcId: string): void {
  const offer = qm.onInteract(npcId)
  offer?.offer?.onAccept()
}

function stubNpc(
  name: string,
  id: string,
  dialogueLine = 'generic greeting',
  paymentClaim: { contractId: string, npcId: string, coins: number } | null = null,
): NpcAgent {
  return {
    id,
    name,
    displayName: name,
    getDialogueLine: () => dialogueLine,
    preparePaymentRequest: () => paymentClaim,
    pendingVoluntaryJoinProposal: () => null,
    voiceActor: 'alex',
    mesh: { position: { x: 0, y: 0, z: 0 } },
  } as NpcAgent
}

const stubSettlement = { isHome: true, name: 'Test' } as Settlement

describe('openNpcDialogueMenu talk_to_npc seam (plan quests-progression-014)', () => {
  it('opens on the topic list and does not advance talk_to_npc until the authored action', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    acceptOffer(qm, ANNA_ID)
    expect(qm.getState('relay')).toBe('active')

    openNpcDialogueMenu(stubNpc('Piotr', PIOTR_ID), stubSettlement, qm, 12)

    expect(ui.npcDialogueMenu.helpResult).toBeNull()
    expect(resolveNpcDialogueOpenTopic()).toBeNull()
    expect(qm.getState('relay')).toBe('active')
    expect(qm.exportProgress()[0]?.stageIndex).toBe(0)

    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('Tak?')
    expect(ui.npcDialogueMenu.helpResult?.actions?.[0]?.label).toBe(
      'Anna mówiła, że jutro idziecie na ryby o świcie.',
    )
    expect(qm.getState('relay')).toBe('active')

    selectNpcDialogueHelpAction(0)
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('piotr quest line')
    expect(ui.npcDialogueMenu.helpResult?.actions).toBeUndefined()
    expect(qm.getState('relay')).toBe('ready_to_report')

    closeNpcDialogueMenu()

    openNpcDialogueMenu(stubNpc('Piotr', PIOTR_ID), stubSettlement, qm, 12)
    expect(resolveNpcDialogueOpenTopic()).toBeNull()
    expect(qm.getState('relay')).toBe('ready_to_report')
    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.actions).toBeUndefined()
    closeNpcDialogueMenu()
  })

  it('keeps the topic picker when only the generic greeting fallback applies', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    openNpcDialogueMenu(stubNpc('Piotr', PIOTR_ID, 'hello there'), stubSettlement, qm, 12)

    expect(ui.npcDialogueMenu.helpResult).toBeNull()
    expect(resolveNpcDialogueOpenTopic()).toBeNull()
    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('hello there')

    closeNpcDialogueMenu()
  })

  it('does not auto-open help for a quest offer; accept appears only after the help topic', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    openNpcDialogueMenu(stubNpc('Anna', ANNA_ID), stubSettlement, qm, 12)

    expect(resolveNpcDialogueOpenTopic()).toBeNull()
    expect(qm.getState('relay')).toBe('not_offered')
    expect(ui.npcDialogueMenu.helpResult).toBeNull()

    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('offer')
    expect(ui.npcDialogueMenu.helpResult?.offer).toBeDefined()
    expect(qm.getState('relay')).toBe('offered')

    closeNpcDialogueMenu()
  })

  it('does not resolve ready_to_report on open; the authored report action resolves once', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    acceptOffer(qm, ANNA_ID)
    openNpcDialogueMenu(stubNpc('Piotr', PIOTR_ID), stubSettlement, qm, 12)
    resolveNpcDialogueHelp()
    selectNpcDialogueHelpAction(0)
    closeNpcDialogueMenu()
    expect(qm.getState('relay')).toBe('ready_to_report')

    openNpcDialogueMenu(stubNpc('Anna', ANNA_ID), stubSettlement, qm, 12)
    expect(resolveNpcDialogueOpenTopic()).toBeNull()
    expect(qm.getState('relay')).toBe('ready_to_report')

    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('Przekazałeś już Piotrowi?')
    expect(ui.npcDialogueMenu.helpResult?.actions?.[0]?.label).toBe('Tak. Będzie o świcie.')
    selectNpcDialogueHelpAction(0)
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('report')
    expect(qm.getState('relay')).toBe('complete')

    selectNpcDialogueHelpAction(0)
    expect(qm.getState('relay')).toBe('complete')
    expect(qm.getRelation(ANNA_ID)).toBe(1)

    closeNpcDialogueMenu()
    openNpcDialogueMenu(stubNpc('Anna', ANNA_ID), stubSettlement, qm, 12)
    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.actions).toBeUndefined()
    closeNpcDialogueMenu()
  })

  it('still auto-opens payment claims as the explicit exception', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    openNpcDialogueMenu(
      stubNpc('Piotr', PIOTR_ID, 'hello there', { contractId: 'c1', npcId: 'n1', coins: 4 }),
      stubSettlement,
      qm,
      12,
    )

    expect(resolveNpcDialogueOpenTopic()).toBe('payment')
    expect(ui.npcDialogueMenu.paymentClaim?.coins).toBe(4)
    closeNpcDialogueMenu()
  })

  it('does not advance talk_to_npc for a same-name NPC with a different id', () => {
    const qm = new QuestManager([talkToPiotrQuest], undefined, new Inventory())
    acceptOffer(qm, ANNA_ID)
    openNpcDialogueMenu(stubNpc('Piotr', WRONG_JAN_ID), stubSettlement, qm, 12)
    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.line).toBe('generic greeting')
    expect(ui.npcDialogueMenu.helpResult?.actions).toBeUndefined()
    expect(qm.getState('relay')).toBe('active')
    closeNpcDialogueMenu()
  })
})
