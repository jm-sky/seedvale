# Plan: Quest offer pacing and conservative settlement gating

**Created:** 2026-09-18
**Status:** `planned` 📋
**Type:** polish
**Priority:** high · **Effort:** M
**Depends on:** ~~quests-progression-004~~, quests-progression-033, quests-progression-034
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression` `relationships`
**Tags:** `offers` `pacing` `renown` `reputation`
**Roadmap:** `quests-and-reputation.md`

## Goal

Zmniejszyć wrażenie „taśmy questów”, w której po zakończeniu zadania NPC niemal natychmiast oferuje kolejne, bez agresywnego blokowania istniejącej zawartości.

V1 ma być konserwatywne:

> lepiej pozostawić trochę za dużo dostępnych questów niż ukryć zawartość za progiem, którego gracz nie ma naturalnej drogi osiągnąć.

Docelowy flow:

```text
QuestDef
→ existing availability
→ urgency / continuation policy
→ giver ordinary-offer cooldown
→ existing ranking / giver capacity
→ exposed offer
```

Nie tworzyć `QuestScheduler`, persistent offer queue, nowego systemu reputacji ani równoległego ownera quest state.

## 1. Existing mechanisms to extend

Reużyć obecne mechanizmy:

- `QuestManager.meetsAvailability()` jako canonical availability predicate;
- `QuestManager.eligibleNotOfferedCandidates()`;
- `QuestManager.selectableOfferIds()`;
- `QuestManager.admitOffersForGiver()`;
- `QuestOfferPolicy`;
- `QuestAvailability` / `QuestPrerequisite`;
- `QuestWorldTimeLookup`;
- istniejące settlement reputation/renown przez `QuestSocialAvailabilityLookup`;
- istniejący cap max 2 ordinary `active` / `ready_to_report` giver quests;
- istniejący `offerSuppressedUntilDay` po decline jako osobny mechanizm.

Nie zmieniać ownership świata: realny problem nadal należy do fauna/settlement/world, a quest tylko reprezentuje możliwość udziału gracza.

## 2. Ordinary giver cooldown

Po pomyślnym terminalnym zakończeniu ordinary questa:

```text
complete
→ giver ordinary-offer cooldown
→ 4–10 godzin świata
```

Cooldown dotyczy wyłącznie **nowych ordinary ofert tego samego givera**.

Nie blokuje:

- już `offered` questów;
- `active` questów;
- `ready_to_report`;
- report/hand-in;
- required `talk_to_npc` / `talk_to_npc_choice`;
- `dialogueActions`;
- interakcji z NPC jako targetem questa innego givera.

Cooldown nie uruchamia się po:

- `failed`;
- `abandoned`;
- `invalidated`;
- decline;
- accept;
- stage completion;
- wejściu w `ready_to_report`.

## 3. Deterministic cooldown duration

Czas ma być deterministyczny w zakresie:

```text
4h <= cooldown <= 10h
```

Seed/input powinien opierać się na stabilnych danych:

```text
worldSeed + giverNpcId + completedQuestId
```

Nie używać `Math.random()`.

Ta sama sytuacja w tym samym świecie ma dawać ten sam wynik.

## 4. Cooldown ownership and persistence

Cooldown jest quest-owned state na poziomie givera, nie per następny quest.

Semantyczny kontrakt:

```ts
ordinaryOfferCooldownUntilByGiver?: Record<NpcId, number>
```

Ma być eksportowany/restorowany razem z pozostałym state `QuestManager`.

Nie kopiować timestampu do wszystkich pozostałych `QuestProgressEntry`.

Starszy save bez pola:

```text
→ brak aktywnego giver cooldownu
```

Jeżeli obecny additive save contract pozwala na pole opcjonalne, nie robić sztucznego save-version bump.

## 5. Explicit continuation

Rozszerzyć `QuestOfferPolicy`:

```ts
export type QuestOfferPolicy = {
  priority?: number
  urgency?: 'normal' | 'urgent'
  exposure?: 'normal' | 'story'
  pacing?: 'ordinary' | 'continuation'
}
```

Brak `pacing` oznacza:

```text
ordinary
```

`continuation` oznacza bezpośredni ciąg fabularny, który powinien móc pojawić się natychmiast.

Samo:

```ts
{ type: 'quest_outcome', ... }
```

**nigdy automatycznie nie oznacza continuation**.

`quest_outcome` jest zależnością logiczną. `pacing: 'continuation'` jest osobną decyzją narracyjną.

## 6. Cooldown bypass

Giver cooldown omijają:

```text
offer.urgency === 'urgent'
offer.pacing === 'continuation'
```

`exposure: 'story'` samo w sobie **nie omija cooldownu**.

Story może oznaczać ważny authored quest, ale nie musi oznaczać sceny, która fabularnie powinna rozpocząć się natychmiast po poprzedniej.

Cooldown blokuje tylko admission nowej ordinary oferty. Nie zmienia obecnych semantyk `story` dotyczących exposure/cap/decline.

## 7. Completion and cooldown rule

Decyzja V1:

- ordinary quest zakończony przez `complete` ustawia nowy giver cooldown;
- quest z `pacing: 'continuation'` zakończony przez `complete` **nie ustawia giver cooldownu**;
- urgent quest zakończony przez `complete` **nie ustawia giver cooldownu**.

Celem jest, aby kryzys lub szybka sekwencja fabularna nie opóźniały późniejszych ordinary ofert bardziej niż wynika to z wcześniej istniejącego ordinary cooldownu.

Jeżeli przed urgent/continuation istniał już ordinary cooldown, nie kasować go ani nie przedłużać.

## 8. Admission order

Rozszerzyć istniejący pipeline zamiast tworzyć nowy.

Semantycznie:

```text
not_offered
→ source/world validity
→ authored availability prerequisites
→ decline suppression
→ classify urgent / continuation / ordinary
→ giver cooldown check for ordinary only
→ existing offer ranking
→ existing normal/urgent/story exposure rules
→ admit selected offer
```

`urgent` i `continuation` omijają giver pacing, ale nie omijają automatycznie:

- source validity;
- `quest_outcome` prerequisites;
- time-window prerequisite;
- innych jawnie authored warunków dostępności.

## 9. Active giver capacity

Zachować istniejący safety cap:

```text
max 2 ordinary active/ready_to_report giver quests
```

Nie obniżać go do 1.

Po tym planie typowy gameplay powinien częściej dawać:

```text
0–1 ordinary quest per NPC
```

ale wynikać ma to z pacingu i availability, nie z twardego globalnego limitu 1.

Obecne bypassy active-cap dla `urgent` / `story` pozostają bez zmian.

## 10. Conservative social gating policy

V1 nie gate'uje mechanicznie wszystkich istniejących questów.

Nowe progi settlement progression:

```text
renown 0
→ większość questów

renown >= 3
→ lekko podwyższona odpowiedzialność

renown >= 5
→ wyraźnie ważniejsza sprawa osady

renown > 5
→ nie używać w tym planie
```

Specific reputation dimension:

```text
minimum <= 3 w V1
```

i tylko wtedy, gdy wymiar ma oczywiste znaczenie fabularne.

Nie dodawać reputation gate tylko po to, żeby zmniejszyć liczbę ofert.

## 11. Exact V1 content decisions

Implementujący agent nie ma sam decydować, które istniejące kategorie gate'ować.

### World crisis / authoritative live problems

`wolf-den-pressure`, realny lost-livestock incident oraz inne istniejące questy wynikające z bieżącego problemu świata:

```text
new renown gate: none
new relation gate: none
```

Nie oznaczać automatycznie wszystkich world-driven opportunities jako `urgent`.

`urgent` ustawiać tylko dla problemu, którego aktualna semantyka rzeczywiście wymaga natychmiastowej reakcji. Jeśli obecny kod/source nie rozróżnia bezpośredniego kryzysu od zwykłej presji, pozostawić dany quest ordinary zamiast zgadywać.

### Profession quests

Hunter profession chain oraz guard profession/evening duty:

```text
new renown gate: none
new reputation gate: none
```

Zachować istniejące `quest_outcome` / `evening_offer_window` prerequisites.

Nie dodawać w V1 relation gate do późniejszych profession quests.

### RPG matrices

Ustawić:

```text
old-place-secret
→ renown >= 3

suspicious-transport
→ renown >= 3

settlement-agreement
→ renown >= 5
```

Nie dodawać do nich dodatkowego relation prerequisite w V1.

### Existing authored cave / personal / treasure stories

```text
new broad renown gate: none
new broad relation gate: none
```

Zachować istniejące authored prerequisites i dialogue-reaction gates.

Nie dokładać nowych progów tylko na podstawie tego, że quest jest „fabularny”.

## 12. Continuation audit — narrow scope

Przejrzeć tylko istniejące questy, które są bezpośrednimi kolejnymi częściami jednej historii.

Dodać `pacing: 'continuation'` wyłącznie wtedy, gdy:

1. poprzedni quest kończy się naturalnym bezpośrednim leadem;
2. następna część powinna fabularnie być dostępna od razu;
3. przerwa 4–10h wyglądałaby sztucznie.

Jeżeli istnieje wątpliwość:

```text
pozostawić ordinary
```

Nie utożsamiać continuation z każdym `quest_outcome`.

W implementation notes wypisać dokładne quest IDs zaklasyfikowane jako continuation; implementujący agent nie ma rozszerzać tej listy poza udokumentowane przypadki.

## 13. Urgent policy

Pilny quest reprezentuje **bieżący problem, którego odłożenie przez pacing byłoby sprzeczne ze stanem świata**.

Przykład docelowy:

```text
bezpośredni atak / aktywne zagrożenie dla osady lub livestock
→ urgent
→ bypass ordinary giver cooldown
```

Nie używać `urgent` jako ogólnego „ważny quest”.

Nie oznaczać automatycznie:

- wszystkich wolf quests;
- wszystkich generated quests;
- wszystkich story quests;
- wszystkich high-priority offers.

Jeżeli source state nie daje dziś wystarczającego sygnału do bezpiecznego rozpoznania realnego kryzysu, nie rozszerzać source systemu w tym planie tylko po to, żeby wymusić urgent.

## 14. Relation policy

Nie używać w tym planie `friendly` / `trusted` jako szerokiego pacing gate.

Player↔NPC relation pozostaje właściwe dla:

- prywatnych próśb;
- osobistych historii;
- sekretów;
- dialogue reactions;
- alternatywnych reakcji/rozwiązań.

Nowy hard relation gate można dodać tylko wtedy, gdy plan wyraźnie go wskazuje. V1 nie dodaje nowych broad relation gates.

## 15. Soft-lock guardrail

Dla każdego nowego renown/reputation prerequisite sprawdzić przed implementacją:

1. jakie istniejące, wcześniejsze źródła zwiększają wymagany stat;
2. czy są dostępne bez tego questa;
3. czy quest nie jest potrzebny do zdobycia własnego prerequisite;
4. czy alternatywne questy pozwalają osiągnąć próg;
5. czy persisted save sprzed zmiany nadal ma praktyczną drogę do odblokowania questa.

Jeśli dla konkretnego questa którykolwiek punkt nie jest potwierdzony przez obecny kod:

```text
nie dodawać gate'a
```

Wyjątkiem są trzy jawnie zatwierdzone RPG matrix gates z §11 — dla nich implementation notes mają potwierdzić źródła renown. Jeśli recon wykaże faktyczny soft-lock, zatrzymać ten gate i odnotować konflikt zamiast samodzielnie wymyślać nowy próg.

## 16. Generated opportunity limit

Nie zmieniać:

```ts
SETTLEMENT_QUEST_OPPORTUNITY_LIMIT = 2
```

To limit materializacji generated opportunities, nie pacing nowych ofert.

Nie próbować rozwiązać problemu przez zmniejszenie liczby materialized `QuestDef`.

## 17. Main implementation points

Zweryfikowane główne miejsca:

- `src/quests/quests.ts`
  - `QuestOfferPolicy`;
  - validation, jeśli nowa wartość polityki tego wymaga;
- `src/quests/QuestManager.ts`
  - quest-owned giver cooldown state;
  - terminal completion integration;
  - `selectableOfferIds()` / admission;
  - export/restore/reset;
- `src/persistence/saveData.ts`
  - tylko jeśli canonical quest save DTO wymaga jawnego rozszerzenia;
- `src/quests/opportunities/rpgQuestMaterialization.ts`
  - dokładnie trzy zatwierdzone renown gates;
- konkretne authored/builders
  - tylko dla jawnie potwierdzonych `continuation` lub `urgent`;
- `src/quests/QuestManager.test.ts` i odpowiednie opportunity tests.

Przy ważnych nowych publicznych/architektonicznych helperach dodać JSDoc z `@domain quests-progression`, jeśli pomaga to preflight/navigation.

## 18. Tests

Automated tests mają pokryć minimum:

1. ordinary quest `complete` ustawia giver cooldown;
2. cooldown mieści się deterministycznie w 4–10h;
3. ten sam seed/giver/quest daje ten sam cooldown;
4. podczas cooldownu kolejny ordinary `not_offered` quest givera nie jest exposable/admitted;
5. po expiry kolejny ordinary quest wraca do normalnego rankingu;
6. cooldown jednego NPC nie blokuje ofert innego NPC;
7. `failed`, `abandoned`, `invalidated` nie ustawiają cooldownu;
8. decline suppression pozostaje niezależne;
9. już `offered` quest nie zostaje cofnięty przez nowy cooldown;
10. report/hand-in/required foreign-quest interactions pozostają dostępne;
11. `urgent` omija giver cooldown;
12. `continuation` omija giver cooldown;
13. samo `quest_outcome` prerequisite nie omija cooldownu;
14. `story` bez `continuation` nie omija cooldownu;
15. completion `urgent` / `continuation` nie ustawia nowego ordinary cooldownu i nie kasuje istniejącego;
16. save/load zachowuje cooldown;
17. older save bez pola oznacza brak cooldownu;
18. active giver cap nadal wynosi max 2 ordinary;
19. `old-place-secret` jest hidden poniżej renown 3 i dostępny od 3;
20. `suspicious-transport` jest hidden poniżej renown 3 i dostępny od 3;
21. `settlement-agreement` jest hidden poniżej renown 5 i dostępny od 5;
22. istniejące ungated world/profession quests nie dostają przypadkowego nowego gate'a.

## 19. Non-goals

Nie robić w tym planie:

- `QuestScheduler`;
- persistent offer queue;
- global daily quest budget;
- dynamic/LLM quest generation;
- nowego reputation managera;
- przebudowy player↔NPC relation;
- automatycznego gate'owania wszystkich questów;
- globalnego max 1 quest/NPC;
- UI „locked quest”;
- nowych sposobów zdobywania relation/reputation/renown;
- rozszerzania world systems tylko po to, żeby stworzyć nowy urgency signal.

## 20. Verification

Technical:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

Manual browser verification wykonuje User.

Scenariusze do ręcznego sprawdzenia:

1. zakończyć ordinary quest i od razu ponownie porozmawiać z giverem — brak natychmiastowej kolejnej ordinary oferty;
2. przewinąć czas do wygaśnięcia 4–10h cooldownu — kolejna eligible oferta może się pojawić;
3. sprawdzić innego NPC podczas cooldownu pierwszego — jego oferty działają normalnie;
4. sprawdzić jawny continuation — pojawia się bez sztucznej przerwy;
5. sprawdzić realny urgent event, jeśli istniejący source pozwala go bezpiecznie oznaczyć — nie czeka na ordinary cooldown;
6. rozpocząć nową grę i potwierdzić, że pierwsza faza nadal ma wystarczająco dużo questów;
7. sprawdzić save rozpoczęty przed zmianą — brak utraty osiągalności istniejących questów.

## Success criteria

Po implementacji:

```text
ordinary quest complete
→ giver zwykle robi 4–10h przerwy przed nową ordinary ofertą

direct story continuation
→ może pojawić się od razu

real urgent problem
→ nie czeka na ordinary pacing

settlement progression
→ delikatnie odsłania część RPG opportunities przez renown 3/5

większość istniejącej zawartości
→ pozostaje osiągalna bez nowego grindu
```

Najważniejsza zasada V1:

> Jeśli nie jesteśmy pewni, że gate jest osiągalny i bezpieczny, nie dodajemy go. Pacing poprawiamy teraz; progresję zaostrzamy później na podstawie playtestów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
