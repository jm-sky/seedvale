import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnerType } from '../fauna/AnimalSpawner'
import type { ItemKind } from '../items/items'
import { WOLF_DEN_ID } from '../fauna/AnimalSpawner'

export type QuestState =
  | 'active'
  | 'complete'
  | 'not_offered'
  | 'offered'
  | 'ready_to_report'

/** Coarse sympathy tiers derived from `QuestManager`'s numeric relation —
 *  see `RELATION_LEVEL_THRESHOLDS`. Ordered low to high. */
export type RelationLevel = 'stranger' | 'acquainted' | 'friendly' | 'trusted'

/** Minimum numeric relation for each level. Centralized here so availability
 *  gating and UI/tuning read a single source of truth (plan 093 Etap A/B). */
export const RELATION_LEVEL_THRESHOLDS: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 1,
  friendly: 3,
  trusted: 6,
}

/** Highest level first, so `relationToLevel` can return on the first match. */
const RELATION_LEVELS_DESCENDING: readonly RelationLevel[] = ['trusted', 'friendly', 'acquainted', 'stranger']

export function relationToLevel(relation: number): RelationLevel {
  for (const level of RELATION_LEVELS_DESCENDING) {
    if (relation >= RELATION_LEVEL_THRESHOLDS[level]) return level
  }
  return 'stranger'
}

/** Gates whether a quest is offered at all. Absent = always available
 *  (existing v2 quests keep their current behaviour). */
export type QuestAvailability = {
  relation?: { npcName: string, minimum: RelationLevel }
}

/** End-of-quest effects applied once by `QuestManager.completeQuest()`.
 *  Absent fields fall back to the v2 flat defaults (`QUEST_RELATION_REWARD`/
 *  `QUEST_EXP_REWARD`) so existing quests are unaffected. */
export type QuestEffects = {
  relation?: number
  exp?: number
}

export type QuestObjective =
  | { type: 'talk_to_npc', npcName: string }
  | { type: 'interact_well' }
  | { type: 'interact_tree' }
  | { type: 'interact_spawner', spawnerType: SpawnerType }
  | { type: 'spot_animal', kind: AnimalKind }
  | { type: 'gather_item', kind: ItemKind, count: number }
  /** "A dangerous wolf" (plan 093 Etap D) — defined by kind, but
   *  `QuestManager` binds it to one concrete `AnimalAgent.animalId` the
   *  moment this stage becomes active (via an injected resolver, not by
   *  importing fauna itself), so only that individual's death clears it. */
  | { type: 'kill_target_animal', kind: AnimalKind }
  /** The wolf den's whole initial pack is dead (plan 093 Etap E) — reported
   *  by `Fauna.isWolfDenCleared()`, not per-individual like `animal_died`,
   *  since the den (not one wolf) is the world entity with identity here. */
  | { type: 'clear_wolf_den', denId: string }
  /** "A lost farm animal" (plan 093 Etap G) — like `kill_target_animal`,
   *  defined by kind and bound to one concrete `AnimalAgent.animalId` when
   *  the stage becomes active, but cleared by the player finding it (an
   *  `[E]` interact reporting `animal_found`) rather than killing it. The
   *  resolver searches settlement livestock as well as wild fauna, so
   *  `kind` alone is enough to pick the right population (sheep/chicken/etc.
   *  only ever exist as livestock; wolf/deer/etc. only ever exist as wild
   *  fauna) — no separate "owned" objective shape needed. */
  | { type: 'find_animal', kind: AnimalKind }

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
  /** Optional inventory grant on turn-in (plan 090 sword from Strażnik). */
  reward?: { kind: ItemKind, count: number }
  /** Relation gate; quest stays `not_offered` and hidden from the giver/log
   *  until met (plan 093 Etap A). */
  availability?: QuestAvailability
  /** Overrides the flat v2 relation/exp reward on completion (plan 093 Etap B). */
  effects?: QuestEffects
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
    reportLine: 'Dzięki, akurat mi się przydała. Weź ten miecz — przyda Ci się w drodze.',
    reward: { kind: 'long_sword', count: 1 },
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
  {
    id: 'zagubiona-owca',
    giverName: 'Anna',
    offerLine:
      'Owca gdzieś mi się zawieruszyła. Rozejrzysz się po okolicy i ją znajdziesz?',
    stages: [
      {
        objective: { type: 'find_animal', kind: 'sheep' },
        description: 'Znajdź zagubioną owcę.',
        reminderLine: 'Owca wciąż się gdzieś włóczy.',
        progressLine: 'Jest! Wróć i powiedz Annie, gdzie ją znalazłeś.',
      },
    ],
    reportLine: 'Uff, dzięki. Już się bałam, że coś ją spotkało.',
  },
  {
    id: 'drewno-na-naprawe',
    giverName: 'Piotr',
    offerLine: 'Płot mi się rozłazi — zbierzesz kilka gałęzi, żebym miał czym go naprawić?',
    stages: [
      {
        objective: { type: 'gather_item', kind: 'branch', count: 5 },
        description: 'Zbierz 5 gałęzi.',
        reminderLine: 'Masz już dość gałęzi na naprawę?',
      },
    ],
    reportLine: 'To starczy w zupełności. Płot znów będzie trzymał się kupy.',
  },
  {
    id: 'grozny-wilk',
    giverName: 'Anna',
    offerLine:
      'W okolicy wioski pojawił się groźny wilk. Ludzie boją się wychodzić poza osadę — zajmiesz się nim?',
    stages: [
      {
        objective: { type: 'kill_target_animal', kind: 'wolf' },
        description: 'Znajdź i pokonaj groźnego wilka.',
        reminderLine: 'Wilk wciąż grasuje w okolicy.',
        progressLine: 'Wilk pokonany. Wróć do Anny.',
      },
    ],
    reportLine: 'Dzięki Tobie znowu można spokojnie wychodzić poza osadę.',
    availability: { relation: { npcName: 'Anna', minimum: 'trusted' } },
    effects: { relation: 2, exp: 20 },
  },
  {
    id: 'wilcza-jama',
    giverName: 'Anna',
    offerLine:
      'Te wilki skądś się biorą — mają jamę niedaleko. Znajdź ją i rozwiąż ten problem raz na zawsze.',
    stages: [
      {
        objective: { type: 'clear_wolf_den', denId: WOLF_DEN_ID },
        description: 'Znajdź wilczą jamę i zlikwiduj zagrożenie.',
        reminderLine: 'Jama wciąż jest zamieszkana.',
        progressLine: 'Jama opustoszała. Wróć do Anny.',
      },
    ],
    reportLine: 'Teraz w okolicy będzie spokojniej. Dziękuję.',
    availability: { relation: { npcName: 'Anna', minimum: 'trusted' } },
    effects: { relation: 3, exp: 30 },
  },
]
