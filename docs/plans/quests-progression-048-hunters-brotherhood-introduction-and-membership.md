# Plan: Hunters Brotherhood introduction and membership

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~quests-progression-020~~, ~~quests-progression-033~~, ~~quests-progression-034~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `progression`
**Tags:** `hunters-brotherhood` `story` `npc-binding`
**Roadmap:** `quests-hunters-brotherhood.md`

## Goal

Rozpocząć fabularny wątek Hunters Brotherhood po ukończeniu istniejącego łańcucha Hunter I–III, bez tworzenia nowej frakcji, nowego systemu reputacji ani równoległego stanu członkostwa.

Akt I ma:

- użyć istniejącego Huntera, który prowadził Hunter I–III, jako znanego graczowi inicjatora;
- deterministycznie związać małą obsadę Brotherhood z realnymi dorosłymi NPC z osady domowej i jednej pobliskiej osady;
- nadać tym NPC role **fabularne**, niezależne od ich istniejącej profesji;
- przeprowadzić gracza przez krótkie zaproszenie i poznanie członków;
- zakończyć się trwałym quest outcome, który będzie jedynym źródłem prawdy dla „gracz dołączył / został przyjęty do kręgu” w kolejnych aktach.

Plan nie implementuje jeszcze konfliktu łowieckiego, habitat pressure ani polowania. Ma stworzyć stabilny fundament obsady i historii, który późniejsze plany mogą ponownie rozwiązać z tych samych world definitions.

## Why

Roadmap Hunters Brotherhood zakłada około czterech członków z dwóch osad: starego mistrza, łowcę trofeów, praktycznego łowcę i młodego ambitnego członka. Aktualny system profesji nie gwarantuje jednak czterech dorosłych NPC z `role === 'hunter'` — staffing dobiera role z faktycznego składu osady i warunków środowiskowych, a kolejne kopie tej samej profesji są demotowane.

Dlatego Brotherhood nie powinno nadpisywać `CharacterDef.role` ani wymagać czterech zawodowych Hunterów. `hunter`, `farmer`, `guard`, `blacksmith` itd. pozostają realnymi profesjami świata; `master`, `trophy`, `practical`, `ambitious` są wyłącznie rolami w tej konkretnej historii.

Istniejący quest stack ma już wszystkie potrzebne mechanizmy:

- Hunter III kończy się stabilnym outcome `hunter_iii_complete`;
- prerequisite `quest_outcome` może odblokować następny quest;
- `QuestOfferPolicy.exposure: 'story'` służy do linearnego story continuation i omija normalny giver cap/decline suppression;
- `talk_to_npc` oraz multi-objective `mode: 'all'` pozwalają poznać kilku członków bez nowego objective type;
- `NpcId` jest stabilną tożsamością questową;
- settlement definitions pozwalają rekonstruować NPC niezależnie od streamingu/camery;
- `nearbyRpgSettlementDefs()` pokazuje istniejący wzorzec bounded selection pobliskich osad bez full-world NPC scan.

## Core design

### 1. Story membership is a quest outcome

Nie dodawać:

- `player.brotherhoodMember`;
- `BrotherhoodManager`;
- osobnego faction reputation;
- osobnego persisted membership record.

Członkostwo w V1 jest faktem historii wynikającym z terminalnego outcome tego questa, np.:

```ts
hunters_brotherhood_joined
```

Kolejne akty używają normalnego `quest_outcome` prerequisite.

Jeżeli Brotherhood w przyszłości otrzyma rangi, przywileje lub niezależną symulację organizacji, dopiero wtedy można wydzielić szerszy system membership/faction state.

### 2. Stable Brotherhood binding

Dodać pure resolver obsady, np. w dedykowanym module questa:

```ts
export type HuntersBrotherhoodBinding = {
  homeSettlementId: string
  secondSettlementId: string
  inviterNpcId: NpcId
  masterNpcId: NpcId
  practicalNpcId: NpcId
  trophyNpcId: NpcId
  ambitiousNpcId: NpcId
}
```

Dokładny shape może zawierać presentation names, jeśli oszczędzi powtarzane lookupy przy materializacji, ale stable `NpcId` pozostaje authoritative identity.

Resolver ma pracować na `SettlementDef` / lekkich NPC projections, nie na runtime `NpcAgent`.

Nie zapisywać bindingu osobno w `SaveData`, jeśli może być deterministycznie odtworzony z tych samych settlement definitions i stabilnych NPC ids.

### 3. Two-settlement cast

Obsada powinna preferować czterech różnych dorosłych NPC z dwóch osad:

- `practical` — zawsze istniejący giver Hunter I–III z osady domowej; jest też `inviter`;
- `master` — preferuj dorosłego `hunter` z najbliższej drugiej osady, fallback na innego dorosłego;
- `trophy` — kolejny różny dorosły, preferuj `hunter`;
- `ambitious` — kolejny różny dorosły.

Druga osada powinna być wybierana bounded/deterministycznie według istniejącego wzorca nearest settlement definitions, bez zależności od aktualnego streamingu.

Nie wymagać, aby `trophy` lub `ambitious` mieli profesję `hunter`. Ich questowa rola fabularna nie zmienia pracy/schedule/economy danego NPC.

### 4. Eligibility and graceful absence

Quest może zostać zmaterializowany tylko wtedy, gdy:

- istnieje ten sam home Hunter giver, który materializuje Hunter I–III;
- istnieje wystarczająca liczba różnych dorosłych NPC, aby stworzyć sensowną obsadę;
- istnieje druga pobliska osada z przynajmniej jednym odpowiednim dorosłym NPC.

Nie generować sztucznych NPC tylko po to, aby spełnić fabularny roster.

Jeżeli konkretna seed/world composition nie daje minimalnego cast, quest pozostaje niematerializowany zamiast łamać identity invariants. Implementation notes powinny ustalić minimalną liczbę i fallback ordering na podstawie faktycznych settlement helperów.

## Quest flow

### Availability

Quest jest linear continuation po Hunter III:

```text
Hunter III outcome: hunter_iii_complete
→ Brotherhood invitation becomes eligible
```

Użyć `availability.prerequisites` z `quest_outcome`, nie ręcznego sprawdzania progress w composition root.

Quest powinien mieć:

```ts
offerPolicy: { exposure: 'story' }
```

To pozwala istniejącemu `QuestManager` traktować zaproszenie jako story continuation zamiast zwykłego errands queue item.

### Suggested stages

#### Stage 1 — invitation

Giver/practical Hunter zaprasza gracza do spotkania z resztą kręgu.

Nie dodawać specjalnego „accept membership” state poza normalnym accept questa.

#### Stage 2 — meet the Brotherhood

Użyć istniejących NPC objectives. Preferowany kształt:

```text
mode: all
[ ] talk to master
[ ] talk to trophy member
[ ] talk to ambitious member
```

Każda rozmowa powinna ujawniać ich odmienny punkt widzenia, ale jeszcze nie stawiać gracza przed wyborem strategicznym z Aktu III.

Practical/inviter jest już znany z Hunter I–III i nie musi być czwartym checkboxem tylko po to, by nabić licznik.

#### Stage 3 — acknowledgement / joining

Gracz wraca do mastera lub invitera — wybrać jeden stabilny finał i trzymać go konsekwentnie w kolejnych aktach.

Terminalny outcome:

```text
hunters_brotherhood_joined
```

Quest kończy onboarding do organizacji, nie nadaje rangi ani osobnego currency/reputation.

## Characterisation boundaries

### V1: narrative casting, not personality simulation

`OpportunityNpc` obecnie niesie tylko `id`, `name`, `role`, `child`, mimo że pełny `CharacterDef` posiada Big Five personality i traits.

Ten plan **nie powinien rozszerzać całej projekcji questowej o personality tylko po to, aby dobrać archetypy Brotherhood**. Dobór `master` / `trophy` / `ambitious` ma być deterministic i oparty o stabilną listę dorosłych + preferencję profesji tam, gdzie ma to sens.

Dalszy polish może później użyć realnej personality/traits do lepszego castingu bez zmiany publicznej semantyki bindingu.

### Do not mutate professions

Nigdy nie przepisywać `CharacterDef.role` na potrzeby historii.

Przykład:

```text
NPC profession: blacksmith
Brotherhood narrative role: trophy member
```

jest dozwolony, jeżeli resolver wybrał go jako członka. Wciąż pracuje jako blacksmith.

## Relationships and social consequences

Nie dodawać Brotherhood reputation.

Akt I może użyć normalnych istniejących konsekwencji:

- małe dodatnie relation deltas do invitera/mastera;
- ewentualnie niewielki `trust` / `competence` / settlement renown, jeśli pasuje do istniejącego reward balance.

Nie przyznawać dużych nagród materialnych — Hunter I–III już pełnią rolę profesjonalnego progression/reward chain. Ten quest otwiera historię.

Dokładne liczby ustalić względem pobliskich story/profession quests podczas implementation notes, nie tworzyć nowej skali.

## Persistence / reconstruction

Quest progress/outcome pozostaje własnością `QuestManager` i jego istniejącego persistence.

Brotherhood cast powinien być rekonstruowany z world definitions:

```text
home SettlementDef
+ stable Hunter I–III giver selection
+ bounded nearby SettlementDef selection
+ deterministic adult roster selection
→ same HuntersBrotherhoodBinding
```

Nie uzależniać identity od:

- kolejności stream-in runtime NPC agents;
- kamery/gracza;
- aktualnie loaded settlements;
- losowania wykonywanego przy każdym loadzie;
- display name matching.

Jeżeli persisted quest id musi pomóc rematerializacji accepted/completed questa, wykorzystać istniejący wzorzec generated/authored quest rematerialization zamiast nowego persistence record.

## Performance constraints

Ten plan nie powinien dodawać runtime simulation cost.

- Cast resolution odbywa się przy materializacji quest definitions, nie per frame.
- Druga osada jest wybierana z bounded nearby definitions, nie przez full-world NPC scan.
- Nie dodawać tick/update dla Brotherhood.
- Nie dodawać workerów ani cache managera.
- Quest dialogue/markers korzystają z istniejącego `QuestManager`.

## Expected integration points

Zweryfikować i wykorzystać podczas implementation notes/implementacji:

- `src/quests/opportunities/hunterProfessionQuests.ts`
  - `selectHunterQuestGiver()`;
  - stable Hunter I–III ids/outcomes;
  - obecny home-only composition path;
- `src/quests/opportunities/rpgQuestMatrices.ts`
  - `adultOpportunityNpcs()`;
  - `nearbyRpgSettlementDefs()` lub jego bounded-selection pattern;
- `src/quests/opportunities/settlementNpcMaterialization.ts`
  - deterministic `SettlementDef` → stable `NpcId` projection;
- `src/quests/opportunities/worldQuestOpportunityTypes.ts`
  - current lightweight `OpportunityNpc` boundary;
- `src/quests/quests.ts`
  - `QuestAvailability` / `quest_outcome` prerequisite;
  - `QuestOfferPolicy.exposure: 'story'`;
  - existing `talk_to_npc` and multi-objective contracts;
- `src/quests/QuestManager.ts`
  - existing story-offer and NPC talk semantics; no Brotherhood-specific branching;
- `src/app/createApp.ts`
  - composition root quest-definition assembly;
  - current home Hunter profession materialization;
- `src/settlement/professionStaffing.ts`
  - source of truth proving multiple `hunter` professions are not guaranteed;
- related tests in `src/quests/opportunities/*.test.ts` / `src/quests/*.test.ts`.

Important new public/architectural resolver functions/types should receive concise JSDoc and `@domain quests-progression` where useful for preflight discovery.

## Verification

Automated tests should cover at least:

1. **Prerequisite**
   - invitation is unavailable before Hunter III completion;
   - becomes eligible from the real `hunter_iii_complete` outcome.
2. **Stable cast**
   - same settlement definitions produce the same NPC ids across repeated resolution;
   - practical/inviter is the real Hunter profession quest giver;
   - all narrative roles use distinct adult NPC ids;
   - cast includes the selected second settlement.
3. **Profession independence**
   - cast succeeds when fewer than four NPCs have profession `hunter`;
   - narrative role assignment does not mutate settlement/NPC profession data.
4. **Fallbacks**
   - master prefers a second-settlement Hunter when available;
   - deterministic fallback works when second settlement has no Hunter;
   - insufficient adult roster yields no binding/quest rather than duplicate identities.
5. **Quest flow**
   - story offer policy is present;
   - meeting stage requires all intended distinct NPC conversations;
   - final completion records `hunters_brotherhood_joined` exactly once.
6. **Persistence/rematerialization**
   - accepted/completed quest can be rematerialized with the same binding after save/load/world bundle rebuild;
   - no Brotherhood-specific SaveData is introduced.
7. Run relevant unit tests, typecheck/build/lint according to repository workflow. Browser verification is performed by User, not AI.

## Non-goals

- Habitat pressure assessment (`fauna-031`).
- Hunting-ground investigation / why deer disappeared.
- Predator/food/population diagnosis.
- Ideological strategy conflict and player choice.
- Great Trophy / exceptional animal finale.
- New faction/reputation/rank system.
- New NPC profession or staffing rules.
- Personality-aware casting in V1.
- Brotherhood schedules, meetings or autonomous organization simulation.
- New quest objective types.
- New save schema solely for membership/cast.

## Follow-up

Po tym planie kolejny Brotherhood plan powinien implementować **hunting-ground investigation** i może już zależeć od `fauna-031`, wykorzystując ten sam deterministic Brotherhood binding zamiast ponownie dobierać nowych NPC.

> **Zrób git commit i push do main, rebase jeżeli trzeba**