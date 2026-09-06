# Plan: Authored RPG Quests

**Created:** 2026-09-06  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-002, quests-progression-004  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `relationships` `rewards`  
**Tags:** `quests` `rpg` `story` `outcomes` `rewards`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać pierwszy właściwy pakiet ręcznie zaprojektowanych questów RPG, wykorzystujących istniejące systemy Seedvale zamiast kolejnej warstwy infrastruktury.

Questy mają pokazać, że system wspiera:

```text
poznanie NPC
→ problem / historia
→ kilka etapów
→ decyzja lub sposób rozwiązania
→ różne outcomes
→ reward
→ relation / reputation / renown
→ dalsze konsekwencje
```

Najważniejszym rezultatem planu jest **nowy gameplay i historie**, nie nowy framework.

## 1. Zakres contentu

Dodać **3 authored RPG questlines**.

Każda powinna mieć własny charakter:

1. **osobista historia NPC**,
2. **konflikt / decyzja między ludźmi**,
3. **większa sprawa dotycząca osady lub okolicy**.

Łącznie celować w około:

```text
5–7 nowych QuestDef
```

ponieważ questline może składać się z 1–3 kolejnych questów.

Nie robić kilkunastu prostych fetch questów.

Lepiej:

```text
3 historie × kilka znaczących kroków
```

niż:

```text
15 niezależnych errands
```

# Questline A — Zaginiona przesyłka

## 2. Założenie

NPC powierza graczowi odnalezienie przesyłki / pakunku, który nie dotarł do osady.

Historia wykorzystuje eksplorację i daje pierwszy rzeczywisty wybór dotyczący znalezionego dobra.

Preferowany giver:

```text
Piotr
```

jeżeli aktualna rola i dialogue tej postaci nadal pasują po reconie implementacyjnym.

Nie tworzyć nowego NPC tylko dla questa.

## 3. Etap eksploracyjny

Quest prowadzi gracza do istniejącego landmark/place.

Preferować istniejący:

```text
interact_landmark
```

Nie tworzyć nowego systemu śladów ani quest-only world object, jeżeli obecne landmarki wystarczają.

Pierwszy questline powinien wykorzystywać istniejący świat.

## 4. Znaleziona przesyłka

Jeżeli istniejący inventory/world-item system pozwala bez dużej infrastruktury, przesyłka powinna być reprezentowana jako realny item.

Preferowana nazwa:

```ts
sealed_package
```

Item:

- może być przenoszony przez inventory,
- nie ma normalnej wartości handlowej,
- nie powinien pojawiać się w zwykłym merchant catalog,
- istnieje jako quest-relevant world item.

Jeżeli obecna architektura itemów nie pozwala sensownie dodać takiego przedmiotu bez dużego quest-item subsystemu, nie tworzyć osobnego inventory.

Wtedy interaction przy miejscu odnalezienia może być wystarczającym deterministic state transition.

Recon implementacyjny ma wybrać prostsze rozwiązanie zgodne z aktualnym kodem.

## 5. Outcomes przesyłki

Quest musi mieć co najmniej dwa realne rozwiązania.

### `returned_sealed`

Gracz oddaje przesyłkę bez naruszania jej.

Konsekwencje:

```text
Piotr relation +1
local integrity +8
local trust +5
renown +2
```

Reward:

```text
coins: 15
visibility: shown
```

### `opened_and_returned`

Jeżeli implementacja realnego otwierania przesyłki wymagałaby nowego generic interaction frameworka, nie dodawać go tylko dla tego questa.

W takim przypadku zastąpić ten outcome drugim rozwiązaniem możliwym przez istniejące mechaniki.

Jeżeli otwieranie jest tanie do implementacji:

```text
mniejsza / brak premii integrity
Piotr relation 0 lub -1
```

oraz ewentualnie gracz poznaje informację wykorzystaną później.

### Zasada

Nie symulować wyboru wyłącznie przyciskiem:

```text
[A] dobry outcome
[B] zły outcome
```

jeżeli istniejące działania świata mogą naturalnie wyrazić decyzję.

# Questline B — Spór mieszkańców

## 6. Założenie

Dwoje istniejących NPC ma sprzeczne interesy.

Preferować prosty, lokalny konflikt:

```text
Anna potrzebuje zasobu / pomocy
Piotr chce wykorzystać ten sam zasób inaczej
```

Dokładny temat dobrać po reconie aktualnych NPC, professions, households i settlement state.

Nie tworzyć konfliktu sprzecznego z istniejącymi rolami postaci.

## 7. Cel gameplay

Gracz poznaje obie strony.

Quest wykorzystuje:

```text
talk_to_npc
gather_item
```

oraz istniejące interactions tam, gdzie pasują.

Nie dodawać dialogue tree engine.

Obecny staged dialogue + Quest Outcomes powinien wystarczyć.

## 8. Decyzja

Gracz powinien móc zakończyć sprawę na co najmniej dwa sposoby:

```text
support_anna
support_piotr
```

Opcjonalny trzeci outcome:

```text
compromise
```

tylko jeżeli można go zrealizować bez budowania dodatkowego generic systemu.

## 9. Konsekwencje

Przykładowy kontrakt:

### `support_anna`

```text
Anna relation +2
Piotr relation -1

benevolence +3
renown +2
```

### `support_piotr`

```text
Piotr relation +2
Anna relation -1

competence +3
renown +2
```

### `compromise`

Jeżeli istnieje:

```text
Anna relation +1
Piotr relation +1

trust +3
integrity +3
renown +3
```

Dokładne dimension deltas dopasować do finalnej treści konfliktu.

Nie traktować reputation jako morality score.

Konsekwencja musi wynikać z tego, **jak społeczność interpretuje konkretne działanie**.

## 10. Brak jednej „poprawnej” odpowiedzi

Quest nie powinien mieć technicznie oznaczonego:

```ts
goodEnding: true
```

Każdy outcome może mieć:

- korzyści,
- koszty,
- inne relacje,
- inne dalsze możliwości.

Nie projektować morality axis.

# Questline C — Przysługa dla społeczności

## 11. Założenie

Większy authored quest dotyczący osady lub jej bezpieczeństwa.

Powinien wykorzystywać więcej niż jeden istniejący system.

Preferowany charakter:

```text
problem społeczności
→ investigation / preparation
→ działanie w świecie
→ rozwiązanie
```

Możliwe istniejące mechaniki:

- fauna,
- landmarks,
- gathering,
- combat,
- settlement,
- NPC dialogue.

Nie wymagać wykorzystania wszystkich.

## 12. Availability

Questline C ma wykorzystać `quests-progression-004`.

Nie powinien być dostępny od początku.

Preferowany gate:

```text
renown >= 10
```

oraz ewentualnie:

```text
relation >= friendly
```

z giverem.

Nie ustawiać wysokiego progu wymagającego grind.

Celem jest:

> społeczność zaczyna powierzać graczowi ważniejsze sprawy, ponieważ już coś o nim wie.

## 13. Multi-stage structure

Quest powinien mieć około 3 etapów.

Preferowany rytm:

```text
1. investigate
2. prepare / acquire / talk
3. resolve problem
```

Nie każdy etap ma być:

```text
idź do NPC → wróć → idź do NPC → wróć
```

Wykorzystać świat.

# Non-monetary reward

## 14. Jeden znaczący reward

Jedna z trzech historii powinna kończyć się możliwością otrzymania pierwszej **znaczącej nagrody niematerialnej / niebędącej zwykłym itemem**.

Preferowana decyzja:

```text
prawo do działki
```

ponieważ Seedvale posiada już:

```text
LandOwnershipRegistry
landPlotKey
ownedLandPlots persistence
```

Nie tworzyć generic:

```ts
reward: {
  type: 'land'
}
```

wewnątrz QuestManager.

Quest outcome powinien uruchomić consequence obsługiwaną przez domain ownera.

## 15. Land grant consequence

Dodać wąski consequence seam dla ownership.

Preferowany model:

```ts
type QuestOwnershipConsequence = {
  type: 'grant_land'
  plotKey: string
}
```

lub równoważny typed contract zgodny z aktualnym modelem `QuestConsequences` po implementacji `002`.

QuestManager:

```text
resolve outcome
→ dispatch/apply narrow consequence
```

Composition/domain integration:

```text
grant_land
→ LandOwnershipRegistry
```

QuestManager nie może:

- posiadać land state,
- bezpośrednio modyfikować settlement internals,
- tworzyć równoległego `questOwnedLand`.

## 16. Konkretna działka

Nie hardcodować przypadkowego world coordinate.

Recon aktualnego land ownership/building systemu ma znaleźć istniejący sposób identyfikacji działki.

Reward musi wskazywać stabilny `plotKey`/domain identity.

Jeżeli aktualny system nie posiada bezpiecznego sposobu wybrania konkretnej działki authored questowi, nie budować dużego land-allocation systemu w tym planie.

W takim przypadku użyć prostszego non-monetary reward opisanego w sekcji fallback.

## 17. Fallback dla non-monetary reward

Jeżeli land grant okaże się nieproporcjonalnie kosztowny względem planu, zrobić recon dostępnych domain-owned unlocks.

Kolejność preferencji:

```text
1. land plot
2. existing access/unlock mechanism
3. horse ownership — tylko jeśli istnieje już realny owner
4. helper — tylko jeśli obecny helper/work system semantycznie pasuje
```

Nie tworzyć:

- fake house ownership,
- fake horse ownership,
- generic follower system,
- generic unlock registry

tylko po to, żeby mieć reward.

Jeżeli żaden domain mechanism nie jest gotowy, zachować seam w planie, ale użyć wyjątkowego istniejącego item reward.

# Reward design

## 18. Różnorodność

Nie każdy authored quest powinien kończyć się coins.

W pakiecie powinny wystąpić:

```text
coins
item
relation
reputation
renown
non-monetary/domain reward
```

Nie wszystkie jednocześnie w każdym queście.

## 19. Hidden rewards

Co najmniej jeden quest powinien wykorzystać:

```ts
visibility: 'hidden'
```

Przykład:

NPC prosi gracza o osobistą pomoc bez obiecywania zapłaty.

Po rozwiązaniu może wręczyć:

```text
item / coins / inną nagrodę
```

Quest Log nie zdradza jej wcześniej.

## 20. Reward proportionality

Stosować skalę z `quests-progression-003`.

Authored RPG quest może płacić więcej niż prosty paid quest, jeśli:

- jest wieloetapowy,
- ryzykowny,
- wymaga podróży,
- ma istotne konsekwencje.

Nie używać drogich mieczy jako przypadkowych nagród za drobne przysługi.

# Existing systems first

## 21. Reuse objectives

Preferować istniejące:

```text
talk_to_npc
interact_well
interact_tree
interact_spawner
spot_animal
gather_item
kill_target_animal
clear_wolf_den
find_animal
interact_landmark
```

Nowy `QuestObjective` dodawać tylko wtedy, gdy przynajmniej jeden z nowych questów rzeczywiście go potrzebuje i nie da się sensownie wyrazić przez istniejące mechanizmy.

Nie tworzyć objectives spekulacyjnie.

## 22. Quest-specific interactions

Jeżeli authored story potrzebuje małej specyficznej interakcji, preferować wąskie rozszerzenie istniejącego interaction/event path.

Nie tworzyć generic quest scripting system.

Przykład:

```text
interakcja z konkretnym istniejącym obiektem
→ QuestManager otrzymuje event
→ odpowiedni active quest może zareagować
```

# Outcome selection

## 23. Real actions wybierają outcome

Preferować:

```text
działanie gracza w świecie
→ outcome
```

nad:

```text
modal
→ wybierz zakończenie A/B/C
```

Przykłady:

```text
oddanie przedmiotu Annie
→ support_anna

oddanie przedmiotu Piotrowi
→ support_piotr
```

Jeżeli wybór jest czysto dialogowy i nie ma sensownego działania world-side, można wykorzystać istniejący interaction UI.

Nie budować pełnego branching dialogue engine.

## 24. Outcome exactly once

Każda gałąź musi używać `resolveQuest(questId, outcomeId)` z `002`.

Po resolution:

- inny outcome nie może zostać zastosowany,
- reward nie może zostać ponownie odebrany,
- consequences nie mogą zostać ponownie zastosowane,
- save/load zachowuje wybór.

# Quest chains

## 25. Małe chains przez prerequisites

Nie tworzyć `QuestChainManager`.

Jeżeli historia ma:

```text
Quest A
→ Quest B
```

Quest B używa:

```ts
{
  type: 'quest_outcome',
  questId: 'quest-a',
  outcomeIds: [...]
}
```

z `quests-progression-004`.

## 26. Outcome-dependent continuation

Co najmniej jedna historia powinna pokazać:

```text
Outcome A
→ dalszy quest dostępny

Outcome B
→ ten quest nie jest dostępny
```

Nie musi istnieć osobna pełna gałąź contentu dla każdego outcome.

Persistent consequence wystarczy.

# NPC consistency

## 27. Recon przed napisaniem historii

Przed finalizacją tekstów questów sprawdzić aktualne:

- NPC names,
- professions,
- households,
- relationships,
- settlement roles,
- existing dialogue,
- existing authored quests.

Nie pisać historii w oderwaniu od aktualnych postaci.

Jeżeli aktualne NPC nie mają wystarczającego characterization, rozszerzyć ich dialogue/content minimalnie w ramach questów.

Nie tworzyć nowego character biography subsystem.

## 28. NPC nie są quest dispenserami

Offer dialogue powinien wynikać z sytuacji NPC.

Po resolution ich późniejsze dialogue powinno przynajmniej minimalnie uznawać ważny outcome, jeśli istniejący dialogue mechanism pozwala na to bez dużej przebudowy.

Przykład:

```text
gracza pomógł Annie w sporze
→ późniejsza rozmowa z Anną może to wspomnieć
```

Nie wymagać pełnego memory/dialogue systemu.

# World consistency

## 29. Nie tworzyć fikcyjnych konsekwencji

Jeżeli quest mówi:

> naprawiliśmy most

to świat powinien rzeczywiście posiadać mechanizm/stage pozwalający reprezentować tę zmianę.

Jeżeli go nie ma, napisać quest inaczej.

Nie używać narracji:

```text
„odbudowaliśmy dom”
```

gdy dom pozostaje wizualnie i systemowo zniszczony.

## 30. World independence

Authored quest może czekać na gracza.

Nie implementować w tym planie automatycznego rozwiązania authored stories przez NPC.

Jednocześnie nie wprowadzać world state, który istnieje wyłącznie wtedy, gdy kamera/gracz znajduje się w pobliżu.

# Content quality

## 31. Każda historia musi mieć własny gameplay identity

Nie robić:

```text
Questline A = gather 5
Questline B = gather 6
Questline C = gather 8
```

Docelowo:

```text
A → exploration / discovery / trust

B → social conflict / choice

C → multi-system community problem
```

## 32. Dialogi

Teksty powinny być krótkie i naturalne.

NPC powinien:

- powiedzieć, czego chce,
- wyjaśnić wystarczający kontekst,
- nie recytować systemów gry,
- reagować na rezultat.

Unikać:

```text
„Twoja reputacja competence wynosi teraz 20.”
```

Systemowe informacje pozostają w UI.

# UI

## 33. Quest Log

Wykorzystać UI z `002–004`.

Dla nowych questów pokazywać:

- title,
- description,
- giver,
- current objective,
- progress,
- shown reward.

Nie dodawać osobnego ekranu story quests.

## 34. Resolved outcome

Po zakończeniu historia powinna pozostać czytelna w Quest Log na tyle, na ile pozwala model z `002`.

Jeżeli `resultText` został wdrożony w `002`, wykorzystać go dla znaczących outcomes.

Nie pokazywać technicznych ID:

```text
support_anna
returned_sealed
```

graczaowi.

# Tests

## 35. Questline tests

Dla każdej historii przetestować:

- availability,
- stage progression,
- odpowiednie interactions,
- outcome resolution,
- reward,
- consequences,
- persistence.

## 36. Branching

Co najmniej jedna historia:

```text
Outcome A
Outcome B
```

Test:

- A blokuje późniejsze zastosowanie B,
- B blokuje późniejsze zastosowanie A,
- różne rewards/consequences,
- save/load zachowuje wybrane rozwiązanie.

## 37. Prerequisites

Testować co najmniej:

- outcome-dependent continuation,
- relation gate,
- reputation albo renown gate.

Nie każdy quest musi używać każdego gate.

## 38. Non-monetary reward

Jeżeli wdrożony land grant:

- outcome przyznaje dokładnie właściwy plot,
- ownership działa przez istniejący registry,
- reward applied exactly once,
- save/load zachowuje ownership,
- QuestManager nie posiada duplicated ownership state.

# Docs

## 39. Aktualizacja dokumentacji

Po implementacji zaktualizować odpowiednie:

- `docs/state/player-systems.md`
- `docs/state/npc.md`
- `docs/state/settlements.md` — jeżeli wykorzystany land ownership
- `docs/state/persistence.md` — tylko jeśli zmienia się schema/serialization
- `docs/vision/quests.md`

`docs/vision/quests.md` powinien jasno mówić, że Seedvale wspiera trzy źródła questów:

```text
Authored RPG
Contextual
Emergent world
```

i że authored RPG quests są pełnoprawną częścią projektu, a nie tymczasowym rozwiązaniem przed procedural quests.

Dodać implementation notes zgodnie z `docs/plans/PLANNING.md`.

Nie uruchamiać `pnpm docs:sync` ręcznie.

# Non-goals

Plan nie obejmuje:

- generic dialogue tree engine,
- cinematic system,
- voice acting,
- procedural quest generation,
- JobManager,
- quest board,
- world-driven quest generator,
- generic condition DSL,
- generic quest scripting language,
- quest chapter manager,
- generic morality system,
- witness/gossip system,
- automated world resolution,
- quest expiration,
- generic house ownership,
- generic horse ownership,
- generic follower system,
- dużego rozszerzenia liczby NPC.

# Implementation order

1. Wykonać recon aktualnych NPC, households, settlement roles i istniejącego quest contentu.
2. Zweryfikować finalne API po `002` i `004`.
3. Rozpisać konkretne trzy historie i ich outcomes przed zmianą kodu.
4. Dopasować je do istniejących objectives/interactions.
5. Dodać tylko minimalne brakujące interaction mechanisms.
6. Zaimplementować Questline A.
7. Zaimplementować Questline B z realnym branching.
8. Zaimplementować Questline C z availability gate.
9. Dodać non-monetary reward przez istniejącego domain ownera, preferując land ownership.
10. Dodać outcome-aware dialogue tam, gdzie jest tanie i wartościowe.
11. Dodać tests.
12. Zaktualizować canonical docs.
13. Dodać implementation notes.

Dla ważnych nowych publicznych/integration seams dodać JSDoc oraz, gdzie pomaga preflight:

```ts
@domain quests-progression
```

# Verification

## Automated

Uruchomić odpowiednie:

- quest definition tests,
- QuestManager tests,
- availability tests,
- reputation integration tests,
- inventory/reward tests,
- land ownership tests, jeżeli dotyczy,
- persistence tests,
- typecheck,
- build.

## Manual — User

User sprawdza w przeglądarce:

1. Dostępne są trzy wyraźnie różne historie RPG.
2. Questy mają sensowny kontekst i pasują do istniejących NPC.
3. Nie wszystkie historie są prostymi fetch questami.
4. Co najmniej jeden quest daje realny wybór.
5. Różne rozwiązania powodują różne consequences.
6. Relation konkretnych NPC zmienia się zgodnie z wyborem.
7. Reputation/renown zmieniają się tylko tam, gdzie ma to sens.
8. Co najmniej jedna historia odblokowuje dalszy quest przez prerequisite.
9. Jeden ważniejszy quest nie jest dostępny od początku.
10. Shown i hidden rewards działają poprawnie.
11. Co najmniej jedna historia daje znaczącą non-monetary reward, jeżeli recon potwierdzi gotowy domain mechanism.
12. Save/load zachowuje wybrane outcomes i consequences.
13. Existing paid quests i wcześniejsze questy nie mają regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**