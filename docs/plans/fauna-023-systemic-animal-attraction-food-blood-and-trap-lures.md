# Plan: Systemic animal attraction — food, blood and trap lures

**Created:** 2026-09-12
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-014, ~~world-009~~, items-player-025
**Domain:** `fauna`
**Subdomains:** `predation` `prey` `habitat`
**Tags:** `attraction` `food` `blood` `traps`
**Roadmap:** -

## Cel

Uogólnić istniejące trap-bait attraction do wspólnego, lekkiego mechanizmu atrakcji fauny przez realne źródła świata, tak aby zwierzę mogło reagować nie tylko na przynętę zamkniętą w pułapce, ale również na kompatybilne jedzenie leżące na ziemi oraz świeże ślady krwi.

Docelowy efekt gameplay:

```text
mięso na ziemi
→ wilk wykrywa atrakcyjny bodziec
→ podchodzi
→ zjada mięso
→ szuka kolejnego bodźca
→ może zostać poprowadzony do pułapki
```

oraz:

```text
świeża krew
→ drapieżnik / scavenger może ją wyczuć
→ podchodzi i bada miejsce
→ po krótkim investigation cooldown przestaje traktować ten sam ślad jako cel
→ może wykryć kolejny ślad / mięso / pułapkę
```

Mechanizm ma wzmacniać emergent gameplay i istniejące systemy świata. Nie tworzyć osobnego AI dla wabienia, osobnego modelu diety ani osobnej symulacji zapachu zależnej od kamery/playera.

## Stan obecny

### Trap lure

`fauna-014` dodał realne przyciąganie przez przynętę w pułapce:

- `PlacedTraps.activeLures()` wystawia `TrapLureDescriptor`,
- `gameLoop.ts` pobiera snapshot raz na fauna pass,
- `AnimalAgent.resolveLureTarget()` filtruje po kompatybilności pułapki i `dietAcceptsItem()`,
- `TRAP_DEFS.lureRadius` wynosi obecnie 6 m dla `simple` i 8 m dla `good`,
- ruch nadal należy do `AnimalAgent`; wejście w `triggerRadius` uruchamia istniejące detection/capture.

To jest mechanizm do rozszerzenia, nie wzorzec do skopiowania obok.

### Dropped world items

`src/items/createDroppedItems.ts` jest authoritative runtime dla przedmiotów wyrzuconych przez gracza:

- rekord ma stabilne runtime `id`, `kind`, `x/z`, opcjonalny `FoodBatch`,
- dropped items są persistowane,
- żywność zachowuje provenance/freshness,
- `reconcilePerishableLifecycle(nowDays)` usuwa rozłożoną żywność,
- `collect(id)` oznacza pickup i może uruchamiać `onCollected`.

Zwierzę nie powinno konsumować dropped food przez semantykę player pickup.

### Blood traces

`src/world/bloodTraces.ts` posiada już authoritative environmental state:

- pozycję i rozmiar śladu,
- `createdAtDays` i lifetime,
- pogodowe zanikanie,
- `bloodTraceRemainingFraction()` jako naturalny 0..1 freshness/strength signal,
- lokalne/globalne limity liczby śladów.

Nie tworzyć drugiego blood-scent lifetime.

### Diet / foraging

`AnimalDef.diet` jest istniejącą authority dla tego, jakie itemy gatunek może jeść. `MEAT_DIET` obejmuje m.in. `raw_meat`, `deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`, `beef`; wilk i lis już używają tej informacji przy trap bait attraction.

`animalForaging.ts` posiada istniejący needs-driven pipeline rzeczywistego jedzenia, w tym carcass selection/claim/consumption. Nie duplikować corpse consumption ani obecnego source-target lifecycle.

## 1. Wspólny kontrakt attraction source

Zastąpić trapping-only `TrapLureDescriptor` bardziej ogólnym plain-data kontraktem, np.:

```ts
export type AnimalAttractionSource = {
  id: string
  kind: 'food' | 'blood' | 'trapBait'
  x: number
  z: number
  strength: number
  radius: number
  itemKind?: ItemKind
  trapKind?: TrapKind
}
```

Dokładna nazwa/pola mogą zostać skorygowane podczas implementacji, ale kontrakt musi pozostać:

- bez `THREE.Object3D`, agent references i mutable world ownership,
- możliwy do zbudowania jako tani snapshot raz na fauna pass,
- źródło prawdy pozostaje w systemie, który faktycznie posiada obiekt (`DroppedItems`, `BloodTraceWorldState`, `PlacedTraps`),
- attraction DTO nie jest persistowane.

Preferowane ownership:

- neutralny DTO/source semantics w małym module world/shared, który nie importuje `AnimalAgent`,
- animal-specific compatibility/scoring w `src/fauna/`,
- producenci tylko wystawiają stan; nie decydują, jaki gatunek ma reagować.

Nie tworzyć globalnego mutable `AttractionManager` posiadającego kopię world state.

## 2. Źródła attraction w V1

### Trap bait

Migrować obecny `TrapLureDescriptor` do wspólnego kontraktu bez zmiany capture semantics.

Pułapka nadal:

- wymaga `active + baitKind`,
- respektuje `isSpeciesTrappable(trapKind, species)`,
- używa istniejącego `TRAP_DEFS[kind].lureRadius`,
- po wejściu zwierzęcia w trigger radius rozstrzyga detection/capture istniejącym systemem.

### Dropped food

Dropped item staje się attraction source tylko wtedy, gdy:

- jest żywnością/itemem, który może być oceniony przez wspólną dietę,
- nadal istnieje w `DroppedItems`,
- nie przeszedł world decomposition lifecycle.

Kompatybilność gatunku z itemem rozstrzyga `dietAcceptsItem()` / istniejący diet contract, nie nowa tabela.

Freshness może wpływać na strength wyłącznie na podstawie istniejącego `FoodBatch`/freshness API. Nie tworzyć osobnego freshness clock dla zapachu.

V1 powinien zachować prostą, czytelną regułę stage-based zamiast pozornie precyzyjnej symulacji, np.:

```text
fresh   → pełna attraction strength
medium  → słabsza
spoiled → nadal potencjalnie atrakcyjna dla mięsożercy/scavengera albo wyłączona zgodnie z decyzją implementacyjną niżej
```

Patrz „Decyzje do potwierdzenia”.

### Blood traces

Blood source strength ma wynikać z istniejącego stanu, np. funkcją monotoniczną względem:

```text
trace.size × bloodTraceRemainingFraction(...)
```

Nie musi to być dokładnie iloczyn, jeśli testowalna normalizacja daje lepszy tuning, ale:

- świeży/duży ślad ma być silniejszy niż stary/mały,
- deszcz ma automatycznie osłabiać attraction przez istniejący blood lifetime,
- całkowicie wygasły ślad nie może być kandydatem.

Blood nie jest jedzeniem i nie jest konsumowany.

## 3. Species compatibility

Nie wprowadzać tabeli `bloodAttractedSpecies` obok `AnimalDef` bez potrzeby.

Preferowana reguła V1:

- `diet.items` decyduje o dropped food/trap bait,
- blood attraction jest capability gatunku wynikającym z istniejących cech żywieniowych/predator-scavenger semantics,
- herbivores nie idą za krwią,
- wilk/lis mogą reagować,
- gatunek bez odpowiedniej capability ignoruje źródło.

Jeżeli istniejące `role`, `diet` i `scavenging` nie dają wystarczająco czystej odpowiedzi, dodać **jedno małe deklaratywne capability do `AnimalDef`** (np. scent/blood attraction), zamiast runtime `kind === 'wolf'`/`kind === 'fox'` branches.

Nie rozszerzać przy tej okazji diety niedźwiedzia ani dzika tylko po to, aby wymusić attraction; to osobna decyzja species design.

## 4. Attraction scoring i wybór celu

Rozszerzyć obecny czysty/allocation-free `resolveLureTarget()` do ogólnego resolwera attraction.

Minimalne kryteria:

```text
compatibility
× source strength
× distance falloff / bounded radius
→ deterministic best candidate
```

Wymagania:

- deterministyczny tie-break po stable source id,
- brak `Math.random()` w wyborze celu,
- brak alokowania tablicy per animal per tick,
- source-specific rules (np. trap species coverage) pozostają jawne, ale nie w movement code,
- żadnego bezpośredniego przesuwania zwierzęcia przez world source.

Nie budować w V1 diffusion map, scent grid, nav field ani wind propagation.

## 5. Priority względem istniejących zachowań

Attraction pozostaje subordinate wobec istniejących hard/high-priority zachowań:

- dead/mounted/rabid gates,
- flee / immediate threat,
- combat/chase,
- fire avoidance,
- dog guard.

Attraction może działać w normalnym predator/prey/livestock branch w miejscu obecnego trap lure behaviour.

Nie przebudowywać w tym planie całego fauna decision pipeline w unified pressure scorer. `docs/state/fauna.md` jawnie opisuje obecną dwupoziomową asymetrię; ten plan ma się w nią wpasować.

Needs pozostają istotne:

- rzeczywiste jedzenie dropped food daje hunger relief tylko przez udaną konsumpcję,
- attraction może skłonić do investigation również zanim hunger stanie się krytyczny, ale nie może stale wygrywać z ważniejszymi potrzebami,
- obecny carcass needs-driven foraging pozostaje authoritative dla corpse claim/consumption.

## 6. Loose food consumption

Dodać do `DroppedItems` osobną atomic operation dla konsumpcji przez system świata/faunę zamiast wywoływać player-oriented `collect(id)`.

Preferowany kontrakt:

```ts
consume(id: string): DroppedItem | null
```

lub równie mała operacja o jawnej semantyce remove reason.

Wymagania:

- usuwa dokładnie istniejący dropped record + mesh,
- nie odpala pickup-only `onCollected`,
- nie zwraca itemu do inventory,
- zachowuje identity/freshness danych potrzebnych do obliczenia relief przed/na commit,
- failed/revalidated-away consumption nie daje hunger relief.

Animal consumption ma użyć istniejącego `dietItemReliefScale()` / `consumeFood()` zamiast nowego modelu satiety.

## 7. Atomic approach → validate → consume

Dropped food może zniknąć między wyborem celu a dojściem zwierzęcia (player pickup, inne zwierzę, decomposition).

Dlatego flow musi być:

```text
select source
→ move using existing AnimalAgent steering/navigation
→ reach interaction distance
→ revalidate exact source id + diet compatibility
→ atomically consume/remove
→ only then apply hunger relief
```

Dwa zwierzęta nie mogą dostać relief za jeden kawałek mięsa.

Nie dodawać ciężkiego claim systemu dla luźnych itemów, jeśli atomic consume wystarcza do rozstrzygnięcia wyścigu.

## 8. Blood investigation i anti-stuck memory

Blood jest niekonsumowalnym source. Bez dodatkowej reguły zwierzę po dojściu do najbliższej plamy wybierałoby ją ponownie i nie podążało dalej po trailu.

Dodać bounded transient per-animal memory typu:

```text
source id → ignore until / investigated until
```

Po dojściu do blood source:

1. zwierzę krótko investigate/linger,
2. source id trafia na cooldown,
3. resolver ignoruje go przez ograniczony czas,
4. kolejny source może wygrać wybór.

Wymagania:

- runtime-only; nie persistować,
- bounded cleanup — żadnej rosnącej bez końca mapy,
- stable id śladu krwi wystarcza w obrębie sesji,
- reload może legalnie wyzerować investigation memory, tak jak same krótkotrwałe blood traces nie są SaveData-persisted.

Trap evasion nadal używa istniejącego trap detection cooldown; nie tworzyć konkurencyjnego drugiego cooldownu dla tego samego zdarzenia, jeśli istniejący można wykorzystać w attraction eligibility.

## 9. Trail behaviour

Mechanizm powinien umożliwić emergent trail bez specjalnej struktury „trail”.

Przykład:

```text
blood A → investigated
blood B → investigated
raw_meat → consumed
trap bait → approached
trap trigger → detection/capture
```

Nie zapisujemy relacji A→B→meat→trap. Każdy element jest niezależnym world source, a kolejne wybory wynikają z aktualnego scoringu i investigated cooldown.

To pozwala graczowi układać mięso/wykorzystywać krew bez player-only quest scripting.

## 10. Carcasses

Nie duplikować istniejącego `animalForaging.ts` carcass selection, claim ani consumption.

W tym planie carcass może pozostać w obecnym needs-driven pipeline. Jeżeli podczas implementacji wspólny attraction resolver da się rozszerzyć o read-only carcass scent candidate bez tworzenia drugiej authority, można zrobić to tylko wtedy, gdy:

- final claim/consume nadal należy wyłącznie do obecnego carcass lifecycle,
- nie powstają dwa niezależne targety dla tego samego zwłokowego źródła,
- zakres nie wymaga większego refaktoru `animalForaging.ts`.

W przeciwnym razie carcass scent pozostaje follow-upem.

## 11. Snapshot / integration path

Zachować obecny performance pattern z `fauna-014`:

```text
world-owned states
→ build/read attraction snapshot once per fauna pass
→ forward same readonly candidate set into fauna update
→ each AnimalAgent runs cheap bounded resolver
```

Nie wykonywać per-animal queries do `DroppedItems`, `BloodTraceSystem` i `PlacedTraps` osobno.

Jeżeli liczba candidate sources może realnie wzrosnąć ponad mały bounded set, dodać prostą active-area/spatial prefilter przy budowaniu snapshotu, nie worker i nie globalną spatial database.

Blood ma już global cap 200; dropped items i traps mają istniejące world ownership/persistence. Wykorzystać te granice przed dodaniem nowej infrastruktury.

## 12. Persistence

Nie persistować attraction snapshot, current attraction target ani investigated cooldown.

Persistowane authorities pozostają bez zmian:

- trap record + `baitKind`,
- dropped item record + `FoodBatch`,
- blood traces nadal nie są SaveData-persisted zgodnie z `world-009`.

Po reloadzie/rebuildzie attraction ma zostać ponownie wyprowadzona z aktualnego authoritative world state.

## 13. Debugging

Rozszerzyć fauna debug info tak, aby dla obserwowanego zwierzęcia dało się odczytać co najmniej:

- attraction source kind/id,
- x/z,
- effective strength/radius,
- item kind dla food/trap bait,
- dlaczego source jest compatible/incompatible,
- czy blood source jest chwilowo ignored jako already investigated,
- czy zwierzę aktualnie `approach`, `investigate`, `consume` albo nie ma attraction targetu.

Nie dodawać zwykłego HUD dla scent strength.

## 14. Testy

Dodać testy domenowe i lifecycle tests obejmujące co najmniej:

### Resolver

- diet-compatible dropped meat jest kandydatem dla wilka/lisa,
- incompatible item nie jest kandydatem,
- herbivore nie reaguje na blood,
- blood-compatible predator może wybrać świeży blood source,
- source poza radius jest ignorowany,
- wyższa strength / korzystniejsza odległość wpływa na wybór zgodnie z jednym jawnym scorerem,
- tie-break jest deterministyczny,
- trap species compatibility nadal obowiązuje,
- trap bez bait nie tworzy source.

### Dropped food

- zwierzę może atomically consume istniejący compatible drop,
- consume usuwa record/mesh dokładnie raz,
- consume nie odpala pickup `onCollected`,
- drugi consumer nie dostaje tego samego itemu,
- item zabrany przez gracza przed dojściem invaliduje target bez relief,
- decomposition przed dojściem invaliduje target bez relief,
- udana konsumpcja daje relief przez istniejący diet/life contract.

### Blood

- strength maleje z `bloodTraceRemainingFraction`,
- expired trace nie jest kandydatem,
- investigation zapisuje transient ignore/cooldown,
- ignored trace nie blokuje przejścia do kolejnego source,
- cooldown cleanup jest bounded.

### Regression

- trap attraction/capture z `fauna-014` nadal działa,
- trap detection cooldown nie jest omijany przez nowy resolver,
- combat/flee/fire/guard nadal wygrywają nad attraction,
- carcass claim/consumption pozostaje bez podwójnej authority.

## Manual verification

User w przeglądarce sprawdza co najmniej:

1. Położenie `raw_meat` na ziemi w pobliżu wilka może spowodować podejście i faktyczne zjedzenie itemu.
2. Wilk nie „zjada” mięsa natychmiast z dystansu — używa normalnego movement/pathing.
3. Lis reaguje na zgodne mięso; roślinożerca nie reaguje na meat/blood.
4. Po zabraniu mięsa przez gracza zanim zwierzę dojdzie, zwierzę nie dostaje hunger relief.
5. Kilka kawałków mięsa może naturalnie poprowadzić zwierzę dalej.
6. Świeży ślad krwi może zwabić kompatybilnego drapieżnika; stary/deszczem zmyty działa słabiej lub znika.
7. Po zbadaniu jednej plamy krwi zwierzę nie stoi na niej w nieskończoność i może przejść do kolejnej.
8. Trail zakończony zanęconą pułapką może doprowadzić wilka do `good` trap, ale nadal obowiązuje detection/capture roll.
9. `simple` nadal nie łapie wilka zgodnie z `fauna-014`.
10. Ucieczka, walka i inne wysokopriorytetowe zachowania przerywają attraction.
11. Save/load zachowuje dropped meat i trap bait zgodnie z ich obecnym persistence; blood może zniknąć zgodnie z obecnym kontraktem.

## Decyzje do potwierdzenia

Poniższe kwestie nie blokują przygotowania architektury, ale przed implementacją warto zatwierdzić tuning/gameplay:

1. **Spoiled meat:** czy zepsute mięso ma nadal przyciągać wilka/lisa/scavengera (realistycznie: tak, prawdopodobnie nawet mocno), czy V1 ograniczamy attraction do fresh/medium? Rekomendacja: **przyciąga**, ale relief/food-safety pozostaje oddzielnym problemem.
2. **Blood radius:** czy blood ma mieć większy bazowy sensing radius niż pojedynczy kawałek mięsa? Rekomendacja: **tak**, strength zależna od size/freshness, ale bez kilometrowego scent simulation.
3. **Bear:** obecnie bear nie ma `diet`/`scavenging`; nie dodawać go automatycznie do blood/meat attraction w tym planie bez osobnej decyzji species design.

## Non-goals

Poza zakresem:

- kierunek/siła wiatru wpływająca na zapach,
- scent diffusion/grid/heatmap,
- kilometrowe tropienie po zapachu,
- persistence transient scent targets/cooldowns,
- przebudowa całego fauna decision systemu,
- nowe species diets dla bear/boar tylko dla tego feature,
- NPC używający mięsa do zastawiania pułapek,
- pełna off-screen aggregated scent simulation,
- disease/poison/food-safety dla zwierząt,
- carcass pipeline rewrite.

## Implementation notes

Utworzyć i utrzymywać:

`docs/plans/implementation-notes/fauna-023-systemic-animal-attraction-food-blood-and-trap-lures-implementation-notes.md`

Ważne nowe publiczne/architektoniczne funkcje i typy opisać JSDoc, z `@domain fauna` lub właściwym istniejącym domain tagiem tam, gdzie pomaga to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
