# Implementation Notes: Player-built animal trough and water storage

**Plan:** `items-player-020-player-built-animal-trough-and-water-storage.md`  
**Reviewed against:** current `main`, 2026-09-08

## Review summary

Plan pasuje do obecnej architektury, ale jedna rzecz wymaga doprecyzowania: w codebase nie ma wspólnego runtime `PlayerBuiltStructure`/managera. Każdy persistent buildable ma własny mały owner (`StandingTorches`, `Palisades`, `PlayerWells`, itd.) w `WorldBundle`. Trough powinien pójść tym samym wzorcem, zamiast tworzyć nową generyczną warstwę tylko dla tego planu.

Najmniejszy spójny kierunek to:

- `world/playerTrough.ts` — plain authoritative record + capacity/work/completion helpers;
- `world/createPlayerTroughs.ts` — runtime entries, mesh, `place()`, `contributeWork()`, water mutation/query, `nodes()`, `dispose()`;
- typed `playerTroughs` field w `WorldBundle`, przenoszony także przez in-session rebuild;
- fauna dostaje narrow query/consume contract przez istniejący context/dependency injection, bez importowania `WorldBundle` ani `createPlayerTroughs` do `animalForaging.ts`.

Nie tworzyć `ConstructionManager`, `WaterStorageManager` ani `HorseTrough`.

## Construction / placement

Aktualny canonical placement seam to `src/app/actions/placementActions.ts`:

- `GroundPlacementDefinition`;
- `evaluatePlacementSite()`;
- `previewGroundPlacement()`;
- confirmation ponownie resolve/revalidate site.

Dla lifecycle wzorować się przede wszystkim na aktualnym `src/world/createStandingTorches.ts` + `src/world/standingTorch.ts`: nowy record powstaje z `completedWork: 0`, a actor-neutral `contributeWork()` clampuje do remaining work i zwraca `acceptedWork` + completion. `items-player-017` jest już realnie wdrożony mimo starej sekcji discrepancy w jego implementation notes — source code jest tutaj authority.

Nie kopiować stage-based `PlayerWells.addWork()/transitionTo()`: trough ma prosty single-stage progress, więc model standing torch/palisade jest bliższy.

Materiały powinny nadal być pobierane przy skutecznym placement przez istniejący `constructionMaterials` flow; nie rozdzielać kosztu materiałów między work bouts.

Unfinished trough może rezerwować swój placement footprint, ale nie może wejść do water-source query ani przyjmować cieczy. Nie potrzeba per-frame construction update.

## Authoritative trough state

Trzymać na plain recordzie tylko stan wymagany do round-trip, np.:

```ts
id, x, z, yaw, completedWork, waterLitres
```

Pojemność i required work jako stałe domenowe, nie per-record. Wszystkie mutacje `waterLitres` powinny być skupione w ownerze/domain helpers; UI/fauna nie powinny przypisywać pola bezpośrednio.

Przydatny publiczny seam powinien być semantycznie mały:

```text
queryAvailableNear(x, z, radius)
addWater(id, litres)
consumeWater(id, litres) -> accepted/boolean
```

`consumeWater` musi re-checkować live record i wykonywać clamp/first-wins mutation. To jest odpowiednik `grassForage.consume()` i obecnego `household.water.remove()` w `animalForaging.ts`.

Nie dodawać osobnego `hasWater`/`isFull`; derive z `waterLitres`.

## Liquid-container transfer

`src/items/liquidContainer.ts` jest authority dla container capacity/content. Aktualne operacje są pure i caller stosuje wynik przez `Inventory.updateInstance()`.

Nie mutować `LiquidContainerItemInstance` in-place. Dla trough transferu najbezpieczniejszy wzorzec to najpierw wyliczyć cały transfer z live container + live trough, a dopiero potem w jednym synchronicznym action-completion commit zmienić trough i podmienić ten sam inventory instance. Jeżeli action jest timed, obie strony trzeba ponownie odczytać/revalidate na completion, tak jak garden watering nie zmienia stanu przy przerwaniu.

Po opróżnieniu container musi dostać canonical state `{ liquid: null, amountLitres: 0 }`; najlepiej wydzielić/reużyć helper oparty na istniejącym liquid-container contract zamiast ręcznie duplikować tę normalizację w action code.

Akceptować tylko `liquid === 'water'`. Nie sprawdzać konkretnego rodzaju bucket/waterskin poza `isLiquidContainerInstance()` i content/capacity contractem.

## Fauna integration

Obecne źródła wody są obsługiwane w `src/fauna/animalForaging.ts`:

- `ForagingContext` jest tworzony tylko podczas needs resolution;
- `findWaterTarget()` najpierw preferuje household trough, potem natural shoreline;
- `isSourceTargetValid()` robi completion-time validation;
- `applySourceRelief()` daje `drinkWater()` dopiero po skutecznym resource mutation dla household trough.

Rozszerzyć właśnie ten pipeline. Nie tworzyć nowego animal behaviour/FSM.

Istotna zmiana typu: obecne `SourceTarget` ma tylko boolean `trough?: true`, który oznacza konkretnie household reserve przy `ctx.home`. Nie rozszerzać tego kolejnymi booleanami typu `playerTrough`. Lepiej zmienić water target na mały discriminated source reference (np. natural / household / player-built + stable id dla ostatniego). Cached target ma przechowywać tylko identity/pozycję; availability ma być sprawdzana live.

Do `ForagingContext` wstrzyknąć opcjonalny narrow provider player-built troughs. Provider powinien zwracać lokalne completed/non-empty candidates i oferować atomic consume by id. Dzięki temu `animalForaging.ts` pozostaje właścicielem decyzji, a items/world owner pozostaje właścicielem stanu trough.

Nie wykonywać scan wszystkich troughs co frame. Query następuje tylko w `findWaterTarget()` po przekroczeniu thirst threshold. Przy małej liczbie troughs liniowy scan wewnątrz `queryAvailableNear()` jest wystarczający V1; spatial index ma sens dopiero po realnym profilu/liczbie obiektów.

Natural shoreline nadal nie konsumuje zapasu; player-built trough musi najpierw wygrać `consumeWater`, dopiero potem `drinkWater(ctx.life)`.

## Eligibility / fauna-020

`fauna-020` jest obecnie nadal planem, nie zaimplementowanym current-state ownership contractem. Nie uzależniać tego planu od jego typów.

Current livestock ma `household`; wild fauna nie. Player-built trough provider powinien być neutralny względem ownership, a eligibility pozostać po stronie fauna. V1 nie powinno przypadkiem robić z każdego trough globalnego attractora dla dowolnego dzikiego zwierzęcia bez świadomej reguły.

Jeżeli `fauna-020` wyląduje przed implementacją, użyć jego authoritative `AnimalOwner`/player-owned seam do preferencji/eligibility. Nie dodawać tymczasowego `isPlayerHorse` ani `ownerHouseId === null` jako proxy dla player ownership.

## Mesh / presentation

`src/settlement/settlementStructures.ts::createTrough()` zwraca dziś `Group`, gdzie water inset jest anonimowym drugim childem. Nie opierać runtime logiki na `children[1]`.

Najmniejsza poprawka: nadać water mesh stabilną nazwę/userData marker albo wydzielić mały visual wrapper zwracający `{ object, setHasWater(...) }`. Publiczne settlement rendering nie powinno zacząć przechowywać realnej wody — obecne settlement trough nadal reprezentuje `Household.water`.

Visibility aktualizować tylko po spawn/restore i po zmianie `waterLitres`, nie per-frame.

## WorldBundle / persistence / interaction

Nowy owner trzeba przeprowadzić tą samą ścieżką co standing torches/palisades:

- `src/app/worldBundle.ts` — field + initial records + create/dispose/rebuild;
- `src/app/saveState.ts` — `bundle.playerTroughs.nodes()`;
- `src/persistence/saveData.ts` — save type, validator/migration/default;
- test fixtures tworzące pełne `SaveData` także trzeba zaktualizować.

Current save schema jest v6; nowy required top-level array najpewniej wymaga kolejnej migracji z defaultem `[]`. Nie hardcodować założenia o numerze, jeśli `main` zmieni się przed implementacją.

Interaction używa union `src/interaction/Interactable.ts`, buildera w `src/app/interactables.ts` i dispatchu w `src/app/gameLoop.ts`/actions. Dodać trough do istniejącej gaze interaction ścieżki. Unfinished: work action. Completed: fill action/feedback. Nie dodawać management screen.

Plan nie definiuje demolition trough; nie inventować removal UX tylko po to, aby obsłużyć hipotetyczne `target removed`. Provider/consume powinien jednak poprawnie zwrócić failure dla missing id, dzięki czemu przyszłe removal będzie bezpieczne.

## Testy o najwyższej wartości

Poza testami z planu szczególnie zabezpieczyć:

- `nodes()` zachowuje jednocześnie partial `completedWork` i `waterLitres` przez save/load oraz WorldBundle rebuild;
- old save migration tworzy `playerTroughs: []` bez zmiany istniejących buildables;
- container + trough transfer revaliduje oba live states przed commit i nie zostawia jednej strony zmienionej przy failure;
- dwa animals konkurujące o ostatnią porcję: tylko pierwszy successful `consumeWater` dostaje `drinkWater()`;
- cached player-trough target po opróżnieniu znika przez istniejący invalidation/replan path;
- settlement household trough nadal konsumuje `Household.water` i nie zostaje przypadkiem przepięty na nowy player-trough store;
- water mesh visibility jest derived z live `waterLitres`, nie persisted osobno.

## Suggested implementation order

1. Dodać plain trough record/helpers + runtime owner i construction lifecycle.
2. Wpiąć placement/interactable/work oraz WorldBundle rebuild.
3. Dodać persistence/migration.
4. Dodać container → trough transfer z completion-time revalidation.
5. Dodać narrow fauna query/consume provider i zmienić water target discriminator.
6. Na końcu derived water visibility i focused tests cross-domain.

Agent AI nie wykonuje browser verification; robi je użytkownik zgodnie z planem.
