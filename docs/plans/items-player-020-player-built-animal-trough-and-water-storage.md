# Plan: Player-built animal trough and water storage

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-017~~
**Domain:** `items-player`
**Subdomains:** `interaction` `items`
**Tags:** `construction` `trough` `water` `animals`
**Roadmap:** `horse-and-riding.md`

## Cel

Pozwolić graczowi zbudować w świecie poidło/koryto dla zwierząt, napełniać je rzeczywistą wodą przenoszoną w istniejących pojemnikach oraz udostępnić tę wodę istniejącemu systemowi thirst zwierząt.

Pierwszym istotnym przypadkiem gameplayowym jest koń należący do gracza, ale mechanizm nie może być specyficzny dla konia.

Docelowy flow:

```text
place trough
→ existing incremental construction
→ fill from carried water container
→ finite stored water
→ thirsty eligible animal selects trough
→ completion-time validation + atomic withdrawal
→ existing AnimalLife thirst relief
```

Nie tworzyć `HorseTrough`, specjalnego horse thirst systemu ani alternatywnego modelu wody.

## 1. Istniejące mechanizmy do rozszerzenia

Aktualny kod posiada już potrzebne podstawy:

- proceduralny `createTrough()` używany przez settlement livestock,
- animal thirst i water-target selection,
- household trough preference przed natural shoreline,
- `LiquidContainerItemInstance` dla bukłaków i wiader,
- ilościowy model cieczy w litrach w `liquidContainer.ts`,
- istniejący player ground-placement pipeline,
- incremental construction przez actor-neutral `contributeWork(...)`,
- persistence dla player-built structures.

Plan ma połączyć te mechanizmy, nie tworzyć równoległych.

## 2. Player-built trough

Dodać trough jako nowego consumera istniejącego buildable-construction contract.

Placement ma korzystać z obecnego wspólnego mechanizmu preview/site-validation/persistent unfinished structure. Postawienie obiektu nie może omijać incremental construction ani tworzyć od razu gotowego poidła.

Do prezentacji wykorzystać istniejące `createTrough()` jako proceduralny asset/fallback; nowy GLB nie jest wymagany.

## 3. Construction lifecycle

Trough przechodzi przez ten sam lifecycle co pozostałe małe player-built constructions:

```text
placement
→ persistent unfinished structure
→ contributeWork(id, amount)
→ completed structure
```

Unfinished trough:

- nie może przechowywać wody,
- nie jest animal water source,
- pozostaje persistent i zachowuje progress.

Materiały i required work dobrać w ramach istniejącego construction-cost modelu odpowiednio do małej drewnianej konstrukcji.

## 4. Water state

Gotowe trough przechowuje skończoną ilość wody.

Per-instance authoritative state powinien zawierać co najmniej:

```text
waterLitres
```

Pojemność nie powinna być duplikowana w każdym rekordzie, jeżeli wszystkie trough V1 są identyczne. Trzymać ją w definicji/stałej właściwej dla typu konstrukcji.

Invariant:

```text
0 <= waterLitres <= trough capacity
```

Nie używać `isFull`, `hasWater` ani `charges` jako równoległego stanu.

## 5. Filling from carried water

Player może przelać wodę z istniejącego carried liquid container do completed trough.

Obsługiwać każdy kompatybilny pojemnik z wodą przez istniejący liquid-container contract, bez specjalnego wymagania posiadania wiadra.

Transfer amount:

```text
min(available container water, free trough capacity)
```

Potrzebna jest jedna spójna operacja domenowa o semantyce równoważnej:

```text
pourWaterIntoTrough(containerInstance, trough)
```

która najpierw waliduje oba stany, a dopiero potem aktualizuje Inventory i trough world-state tak, aby nie był możliwy partial update tylko jednej strony.

Pojemnik pozostaje tym samym item instance i może zachować częściową zawartość.

Inne liquids, np. milk, muszą zostać odrzucone.

## 6. Existing water acquisition remains authoritative

Ten plan nie zmienia sposobu pozyskiwania wody.

Flow pozostaje:

```text
WaterSource
→ fill carried liquid container
→ carry water
→ pour into trough
```

Nie dodawać bezpośredniego połączenia trough → well ani automatycznego refill.

## 7. Animal thirst integration

Completed trough z `waterLitres > 0` musi stać się realnym kandydatem w istniejącym fauna water-selection pipeline.

Nie tworzyć osobnego animal-thirst path.

Rozszerzyć minimalnie obecny `ForagingContext`/water-source seam tak, aby podczas istniejącego elevated-thirst search fauna mogła otrzymać lokalne player-built trough candidates i ocenić je razem z aktualnymi źródłami.

Nie zakładać z góry nowego globalnego managera ani osobnego per-frame spatial scan.

## 8. Availability and relation to fauna-020

Trough jest animal infrastructure, nie horse-only feature.

Sam plan nie zależy od ukończenia `fauna-020`: construction, filling, persistence i fauna water-source integration powinny być użyteczne niezależnie.

Jeśli `fauna-020` jest już wdrożone, player-owned animals powinny móc preferować odpowiednie lokalne player-built trough przez mały availability/association contract.

Nie wymuszać współdzielenia dokładnie tego samego ownership typu przez animal i structure, jeśli current code nie uzasadnia takiego sprzężenia.

Nie dodawać horse-specific branch typu:

```ts
if (animal.kind === 'horse')
```

## 9. Drinking semantics

Existing `AnimalLife.drinkWater()` pozostaje authority dla thirst relief.

Sekwencja:

```text
animal selects trough
→ reaches interaction range
→ revalidate trough still exists and has enough water
→ atomic trough withdrawal succeeds
→ thirst relief
```

Jeżeli source mutation nie powiedzie się, relief nie może zostać przyznany.

To obejmuje przypadki, gdy przed dotarciem animal:

- inne zwierzę wypiło ostatnią wodę,
- gracz przelał/zużył wodę w sposób, który opróżnił trough,
- trough zostało usunięte lub przestało być valid source.

Po invalidation animal wraca do normalnego water search i może fallbackować do natural shoreline.

## 10. Presentation

Obecne `createTrough()` renderuje water-colored inset niezależnie od realnego stanu.

V1 ma odzwierciedlać minimum:

```text
waterLitres === 0
→ water mesh hidden

waterLitres > 0
→ water mesh visible
```

Nie wymagać płynnej wysokości powierzchni zależnej od litrażu.

## 11. Player interaction

Completed trough powinno oferować contextual fill action, gdy player niesie kompatybilny pojemnik zawierający wodę.

Feedback powinien rozróżniać co najmniej:

- structure unfinished,
- no carried water,
- trough already full,
- water transferred.

Wykorzystać istniejący interaction/action/UI seam. Nie tworzyć osobnego trough management screen.

## 12. Persistence

Player-built trough musi zachowywać po save/load:

- stable id,
- position/orientation,
- construction progress/completion,
- `waterLitres`,
- minimalną provenance/association potrzebną do istniejącego player-built structure lifecycle i fauna availability lookup.

Save/load nie może resetować trough do full ani empty.

Dostosować save schema/migration tylko w zakresie wymaganym przez aktualny persistence contract.

## 13. Performance

Animal trough lookup nie może dodawać globalnego scan wszystkich constructions co frame.

Search ma wykonywać się w istniejącym needs-resolution flow dopiero wtedy, gdy animal faktycznie szuka wody.

Preferować mały lokalny provider/query przekazywany przez obecny fauna context zamiast nowego high-frequency managera.

## Testy

Dodać testy kluczowych invariantów:

- trough korzysta z istniejącego placement validation contract,
- placed trough jest unfinished,
- `contributeWork` kończy konstrukcję zgodnie z existing contract,
- unfinished trough nie może przyjąć wody i nie jest water source,
- completed trough może zostać napełnione,
- transfer zmniejsza container i zwiększa trough dokładnie o tę samą ilość,
- transfer nie przekracza trough capacity,
- partial container można przelać całkowicie,
- partial free capacity przyjmuje tylko brakującą ilość,
- incompatible liquid jest odrzucany,
- empty trough nie jest valid water source,
- eligible thirsty animal może wybrać player-built trough,
- drinking zmniejsza `waterLitres` dopiero przy successful completion,
- drained trough nie daje thirst relief,
- dwa animals nie mogą wypić tej samej ostatniej porcji,
- opróżnienie trough przez playera po target selection, ale przed drinking completion, powoduje validation failure i brak relief,
- po invalidation działa istniejący fallback do innego water source,
- save/load zachowuje construction state i `waterLitres`,
- integracja z player-owned animal nie wymaga horse-specific branch.

## Manual verification

Użytkownik sprawdza w przeglądarce:

1. Trough można ustawić przez istniejący placement UX.
2. Pojawia się jako unfinished construction.
3. Praca stopniowo kończy budowę.
4. Puste gotowe trough nie pokazuje powierzchni wody.
5. Existing water container można napełnić z aktualnego `WaterSource`.
6. Wodę można przelać do trough.
7. Ilość wody znika z pojemnika i pojawia się w trough.
8. Częściowo pełne trough można dopełnić, ale nie przepełnić.
9. Spragnione eligible animal może podejść i napić się.
10. Ilość wody w trough maleje dopiero po skutecznym drinking action.
11. Opróżnione trough przestaje dawać relief.
12. Fallback do istniejącego naturalnego źródła nadal działa.
13. Save/load zachowuje trough, progress i ilość wody.

## Non-goals

Poza zakresem:

- zakup konia,
- quest reward horse,
- stajnia,
- automatic refill z well,
- water pipes,
- NPC water-hauling jobs,
- rain filling troughs,
- evaporation,
- freezing,
- contamination / trough water quality,
- przebudowa publicznych settlement troughs,
- trough sizes/upgrades,
- feeding trough / hay feeder,
- horse-specific bucket object,
- direct player drinking from trough,
- nowy trough GLB asset.

## Implementation guidance

Przed implementacją oprzeć się na aktualnym kodzie i zweryfikować co najmniej:

- ground placement definitions i player-built structure lifecycle,
- incremental construction / `contributeWork`,
- `src/items/liquidContainer.ts`,
- current garden watering/container mutation flow,
- `src/settlement/settlementStructures.ts` → `createTrough`,
- `src/fauna/animalForaging.ts`,
- `AnimalLife` thirst relief,
- current persistence dla player-built structures,
- aktualny contract `fauna-020`, jeśli jest już wdrożony.

Ważne nowe publiczne/architektoniczne funkcje i klasy powinny dostać JSDoc; użyć `@domain items-player` lub `@domain fauna` zgodnie z faktycznym ownership kodu.

Nie przenosić animal water decision logic do `items-player`: `items-player` posiada construction/player interaction i trough water state, fauna pozostaje właścicielem decyzji zwierzęcia o znalezieniu i użyciu źródła.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
