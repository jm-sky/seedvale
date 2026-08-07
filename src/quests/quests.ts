export type QuestState =
  | 'active'
  | 'complete'
  | 'not_offered'
  | 'offered'
  | 'ready_to_report'

export type QuestDef = {
  id: string
  /** Must match an `NPC_NAMES` entry in `ai/NpcAgent.ts`. */
  giverName: string
  targetName: string
  offerLine: string
  /** Giver's line while the quest is `active` (not yet delivered). */
  activeReminderLine: string
  /** Target's line when the player reaches them with an `active` quest. */
  targetLine: string
  /** Giver's line once the player reports back. */
  reportLine: string
}

/** v1: a single hardcoded relay quest — proves the pipeline before any content tooling. */
export const QUESTS: readonly QuestDef[] = [
  {
    id: 'relay-anna-piotr',
    giverName: 'Anna',
    targetName: 'Piotr',
    offerLine:
      'Możesz przekazać wiadomość Piotrowi? Powiedz mu, że jutro idziemy na ryby o świcie.',
    activeReminderLine: 'Powiedziałeś już Piotrowi o rybach o świcie?',
    targetLine: 'Wiadomość od Anny? Dzięki, że przekazałeś — będę o świcie.',
    reportLine: 'Świetnie, dziękuję za przekazanie wiadomości!',
  },
]
