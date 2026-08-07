import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnerType } from '../fauna/AnimalSpawner'
import type { ItemKind } from '../items/items'

export type QuestState =
  | 'active'
  | 'complete'
  | 'not_offered'
  | 'offered'
  | 'ready_to_report'

export type QuestObjective =
  | { type: 'talk_to_npc', npcName: string }
  | { type: 'interact_well' }
  | { type: 'interact_tree' }
  | { type: 'interact_spawner', spawnerType: SpawnerType }
  | { type: 'spot_animal', kind: AnimalKind }
  | { type: 'gather_item', kind: ItemKind, count: number }

export type QuestStage = {
  objective: QuestObjective
  /** Shown in the quest log for this stage. */
  description: string
  /** Giver's line while this stage is the active one (not yet cleared). */
  reminderLine: string
  /** Spoken at the point the objective is cleared — by the target NPC for
   *  `talk_to_npc`, or as the giver's line the next time you talk to them for
   *  world-interaction objectives. Not used for `gather_item` (cleared and
   *  reported in the same giver conversation — see `QuestManager`). */
  progressLine?: string
}

export type QuestDef = {
  id: string
  /** Must match an `NPC_NAMES` entry in `ai/NpcAgent.ts`. */
  giverName: string
  offerLine: string
  stages: readonly QuestStage[]
  /** Giver's line once every stage is cleared and the player reports back. */
  reportLine: string
}

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'relay-anna-piotr',
    giverName: 'Anna',
    offerLine:
      'Możesz przekazać wiadomość Piotrowi? Powiedz mu, że jutro idziemy na ryby o świcie.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npcName: 'Piotr' },
        description: 'Porozmawiaj z Piotrem.',
        reminderLine: 'Powiedziałeś już Piotrowi o rybach o świcie?',
        progressLine: 'Wiadomość od Anny? Dzięki, że przekazałeś — będę o świcie.',
      },
    ],
    reportLine: 'Świetnie, dziękuję za przekazanie wiadomości!',
  },
  {
    id: 'shells-dla-kasi',
    giverName: 'Kasia',
    offerLine: 'Zbierasz muszle nad morzem? Przydałyby mi się trzy do ozdobienia progu.',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'shell', count: 3 },
        description: 'Zbierz 3 muszle.',
        reminderLine: 'Znalazłeś już trzy muszle?',
      },
    ],
    reportLine: 'Piękne! Dziękuję, teraz próg będzie ładniejszy.',
  },
  {
    id: 'woda-dla-marka',
    giverName: 'Marek',
    offerLine: 'Ręce mam zajęte — zaczerpniesz dla mnie wody ze studni?',
    stages: [
      {
        objective: { type: 'interact_well' },
        description: 'Zaczerpnij wody ze studni.',
        reminderLine: 'Zaczerpnąłeś już wody?',
        progressLine: 'Zaczerpnąłeś wody. Wróć do Marka.',
      },
    ],
    reportLine: 'Dzięki, akurat mi się przydała.',
  },
  {
    id: 'zwiadowca',
    giverName: 'Piotr',
    offerLine:
      'Zwiadowca mi trzeba — sprawdź jaskinię z sarnami, wypatrz jelenia po drodze, i przynieś dwa kamienie z gór na dowód.',
    stages: [
      {
        objective: { type: 'interact_spawner', spawnerType: 'cave' },
        description: 'Zbadaj jaskinię z sarnami.',
        reminderLine: 'Byłeś już przy jaskini?',
        progressLine: 'Ślady sarn świeże, wszystko w porządku. Teraz wypatrz jelenia.',
      },
      {
        objective: { type: 'spot_animal', kind: 'stag' },
        description: 'Wypatrz jelenia w terenie.',
        reminderLine: 'Widziałeś już jelenia?',
        progressLine: 'Jeleń zauważony. Teraz kamienie z gór.',
      },
      {
        objective: { type: 'gather_item', kind: 'stone', count: 2 },
        description: 'Przynieś 2 kamienie z gór.',
        reminderLine: 'Masz już kamienie z gór?',
      },
    ],
    reportLine: 'Dobra robota, zwiadowco. Teraz wiem, że okolica bezpieczna.',
  },
]
