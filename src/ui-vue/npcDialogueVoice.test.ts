import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NpcAgent } from '../ai/NpcAgent'
import type { Settlement } from '../settlement/createSettlement'
import { Inventory } from '../items/Inventory'
import { QuestManager } from '../quests/QuestManager'
import {
  acceptNpcDialogueOffer,
  closeNpcDialogueMenu,
  configureNpcVoiceSounds,
  openNpcDialogueMenu,
  resolveNpcDialogueHelp,
  selectNpcDialogueHelpAction,
  ui,
} from './store'

const stubSettlement = { isHome: true, name: 'Test' } as Settlement

function stubNpc(overrides: Partial<NpcAgent> & Pick<NpcAgent, 'id' | 'displayName'>): NpcAgent {
  return {
    name: overrides.displayName,
    gender: 'male',
    role: 'farmer',
    age: 40,
    voiceActor: 'alex',
    getDialogueLine: () => 'hello',
    preparePaymentRequest: () => null,
    pendingVoluntaryJoinProposal: () => null,
    mesh: { position: { x: 0, y: 0, z: 0 } },
    stopPlayerReactionVoice: () => {},
    ...overrides,
  } as NpcAgent
}

afterEach(() => {
  closeNpcDialogueMenu({ decline: false })
  configureNpcVoiceSounds(null)
})

describe('NPC dialogue voice intents', () => {
  it('openNpcDialogueMenu stops reaction voice then plays greeting once', () => {
    const playAt = vi.fn()
    const stopPlayerReactionVoice = vi.fn()
    configureNpcVoiceSounds(playAt)
    const npc = stubNpc({
      id: 'npc-1',
      displayName: 'Jan',
      role: 'guard',
      stopPlayerReactionVoice,
    })

    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)

    expect(stopPlayerReactionVoice).toHaveBeenCalledTimes(1)
    expect(playAt).toHaveBeenCalledTimes(1)
    expect(playAt.mock.calls[0]![0]).toMatch(/greeting/)
    expect(stopPlayerReactionVoice.mock.invocationCallOrder[0]!).toBeLessThan(
      playAt.mock.invocationCallOrder[0]!,
    )
  })

  it('acceptNpcDialogueOffer plays confirmation', () => {
    const playAt = vi.fn()
    configureNpcVoiceSounds(playAt)
    const onAccept = vi.fn()
    const npc = stubNpc({ id: 'npc-2', displayName: 'Jan', role: 'hunter' })
    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)
    playAt.mockClear()

    ui.npcDialogueMenu.helpResult = {
      line: 'offer',
      offer: { onAccept, onDecline: () => {} },
    }
    acceptNpcDialogueOffer()

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(playAt).toHaveBeenCalledTimes(1)
    expect(playAt.mock.calls[0]![0]).toMatch(/agree|confirmation/)
  })

  it('selectNpcDialogueHelpAction runs onSelect and does not play confirmation', () => {
    const playAt = vi.fn()
    configureNpcVoiceSounds(playAt)
    const onSelect = vi.fn(() => 'done line')
    const npc = stubNpc({ id: 'npc-3', displayName: 'Jan', role: 'hunter' })
    openNpcDialogueMenu(npc, stubSettlement, new QuestManager([], undefined, new Inventory()), 12)
    playAt.mockClear()

    ui.npcDialogueMenu.helpResult = {
      line: 'help',
      actions: [{ label: 'Turn in', onSelect }],
    }
    selectNpcDialogueHelpAction(0)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(ui.npcDialogueMenu.helpResult).toEqual({ line: 'done line' })
    expect(playAt).not.toHaveBeenCalled()
  })

  it('quest turn-in via help action does not add a store confirmation bark on top of QuestManager complete sound', () => {
    const playAt = vi.fn()
    const playSound = vi.fn()
    configureNpcVoiceSounds(playAt)

    const qm = new QuestManager(
      [{
        id: 'q1',
        giverName: 'Anna',
        giver: { npcId: 'anna-1' },
        title: 'q1',
        description: 'q1',
        offerLine: 'please',
        stages: [{
          objective: { type: 'talk_to_npc', npc: { npcId: 'piotr-1' } },
          description: 'talk',
          reminderLine: 'remind',
          playerLine: 'I talked to Piotr.',
          progressLine: 'thanks for telling me',
        }],
        reportPromptLine: 'Did you talk?',
        reportPlayerLine: 'Yes.',
        reportLine: 'thank you',
        outcomes: [{
          id: 'complete',
          state: 'complete',
          consequences: { relations: [{ npc: { npcId: 'anna-1' }, delta: 1 }] },
        }],
      }],
      playSound,
      new Inventory(),
    )
    qm.onInteract('anna-1')?.offer?.onAccept()
    // Advance talk_to_npc via Piotr so the quest is reportable.
    const piotrHelp = qm.onInteract('piotr-1')
    piotrHelp?.actions?.[0]?.onSelect()

    const npc = stubNpc({ id: 'anna-1', displayName: 'Anna', gender: 'female', role: 'farmer' })
    openNpcDialogueMenu(npc, stubSettlement, qm, 12)
    playAt.mockClear()
    playSound.mockClear()

    resolveNpcDialogueHelp()
    expect(ui.npcDialogueMenu.helpResult?.actions?.[0]?.label).toBe('Yes.')
    selectNpcDialogueHelpAction(0)

    expect(playSound).toHaveBeenCalledTimes(1)
    expect(playSound.mock.calls[0]![0]).toMatch(/thank-you|thank_you|male-thank|female-thank/)
    expect(playAt).not.toHaveBeenCalled()
  })
})
