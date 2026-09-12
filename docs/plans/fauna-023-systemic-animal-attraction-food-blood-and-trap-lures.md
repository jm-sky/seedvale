# Plan: Systemic animal attraction — food, blood and trap lures

**Created:** 2026-09-12
**Status:** `verification needed` 🔍
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
→ wilk / lis / niedźwiedź zgodnie ze swoim diet contract wykrywa atrakcyjny bodziec
→ podchodzi
→ zjada mięso
→ szuka kolejnego bodźca
→ może zostać poprowadzony dalej
```

oraz:

```text
świeża krew
→ kompatybilny drapieżnik może ją wyczuć
→ podchodzi i bada miejsce
→ po krótkim investigation cooldown przestaje traktować ten sam ślad jako cel
→ może wykryć kolejny ślad / jedzenie / pułapkę
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

Aktualny `bear` jest `role: 'predator'`, ale nie ma `diet` ani `scavenging`. W praktyce oznacza to:

- poluje przez istniejący predator behaviour,
- może autonomicznie znaleźć i zjeść `fresh` corpse, bo świeża padlina ma wartość bazową dla każdego predatora,
- nie może wybrać `rotting`/`bones`, bo te fazy wymagają `scavenging`,
- `dietAcceptsItem()` odrzuca dla niego każdy dropped item i trap bait, bo `diet` jest nieobecne.

Ten plan świadomie rozszerza species contract niedźwiedzia, zamiast dodawać wyjątki w attraction resolverze.

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

**Bear pozostaje niekompatybilny z obecnymi `simple`/`good` traps.** To oznacza, że identyczne mięso leżące luzem może go przyciągać, ale bait zamknięty w aktualnej pułapce nie staje się dla niego attraction source, bo trap-specific `isSpeciesTrappable()` pozostaje dodatkowym gate'em. Nie rozszerzać trap species coverage przy tej okazji.

### Dropped food

Dropped item staje się attraction source tylko wtedy, gdy:

- jest żywnością/itemem, który może być oceniony przez wspólną dietę,
- nadal istnieje w `DroppedItems`,
- nie przeszedł world decomposition lifecycle.

Kompatybilność gatunku z itemem rozstrzyga `dietAcceptsItem()` / istniejący diet contract, nie nowa tabela.

Freshness może wpływać na strength wyłącznie na podstawie istniejącego `FoodBatch`/freshness API. Nie tworzyć osobnego freshness clock dla zapachu.

V1 używa prostej stage-based reguły:

```text
fresh   → pełna attraction strength
medium  → słabsza attraction strength
spoiled meat → kandydat tylko dla species z odpowiednim scavenging capability
spoiled plant food → nie jest attraction source w V1
decomposed → brak world record, więc brak source
```

Do rozpoznania mięsa używać istniejącego item metadata (`ITEM_CATALOG[kind].food.bait === 'meat'`) zamiast nowej listy meat items.

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

Reguła V1:

- `diet.items` decyduje o dropped food i itemowej kompatybilności bait,
- trap bait ma dodatkowo istniejący `isSpeciesTrappable()` gate,
- `role === 'predator'` decyduje o blood attraction dla aktualnego zestawu gatunków,
- herbivores/livestock nie idą za krwią tylko dlatego, że mogą jeść mięso (`dog` pozostaje kontrprzykładem: ma meat diet, ale nie jest predatorem),
- `scavenging` decyduje o fallbacku na późniejsze corpse phases i o dopuszczeniu spoiled meat jako attraction source.

Nie dodawać runtime branches `kind === 'wolf'`, `kind === 'fox'` ani `kind === 'bear'` do resolvera.

Jeżeli przyszły gatunek ujawni, że `role === 'predator'` jest zbyt szerokie dla blood attraction, wtedy dodać jedno małe deklaratywne capability do `AnimalDef`; nie robić tego prewencyjnie w V1.

## 3a. Bear — świadoma species design decision

Niedźwiedź ma wejść do wspólnego systemu przez istniejące kontrakty, nie przez osobny model wszystkożerności.

### Diet

Dodać `BEAR_DIET: AnimalDietConfig` i przypisać go do `ANIMAL_DEFS.bear.diet`.

`BEAR_DIET.items` ma obejmować:

- wszystkie istniejące surowe mięsa z `MEAT_DIET`,
- `fish`,
- naturalne/roślinne food items istniejące już w świecie: `berries`, `apple`, `nuts`, `honey`.

Nie dodawać `grass`: niedźwiedź nie ma korzystać z `GrassForagePatch` jak deer/cow. Nie tworzyć `OmnivoreDiet` ani osobnego `omnivore` enumu — mieszany zestaw `diet.items` już wyraża wszystkożerność.

Dla meat entries preferować współdzielenie/kompozycję istniejącego `MEAT_DIET.items`, nie kopiowanie drugiej niezależnej listy mięsa.

### Scavenging

Obecny `ScavengingConfig` wymaga jednocześnie `rottingValue` i `bonesValue`, co odpowiada wolfowi, ale nie pozwala wyrazić bear = rotting carrion bez jedzenia kości.

Rozszerzyć istniejący contract minimalnie tak, aby fazy były niezależnie opcjonalne, np.:

```ts
export type ScavengingConfig = {
  rottingValue?: number
  bonesValue?: number
}
```

`carcassFoodValue()` ma traktować brak konkretnego pola jako brak capability dla tej fazy.

Docelowe różnice:

```text
wolf → fresh + rotting + bones
fox  → fresh only
bear → fresh + rotting, no bones
```

Bear dostaje `scavenging` z `rottingValue`, bez `bonesValue`. Dokładny relief/score tuning ma pozostać niższy od fresh corpse (`1`) i może zostać dobrany w istniejącej konwencji wartości względnych.

### Attraction matrix

Docelowo bear reaguje na:

| Source | Bear V1 |
|---|---|
| fresh/medium raw meat dropped | tak |
| spoiled meat dropped | tak, przez `scavenging` + meat metadata |
| fresh corpse | tak, już przez predator carcass baseline |
| rotting corpse | tak, przez `scavenging.rottingValue` |
| bones | nie |
| fresh blood trace | tak, przez predator blood compatibility |
| berries/apple/nuts/honey dropped | tak, przez `BEAR_DIET.items` |
| grass forage patch | nie |
| bait w obecnej pułapce | nie, przez `isSpeciesTrappable()` |

To rozdzielenie zachowuje istniejące różnice między wolf/fox/bear bez drugiego modelu diety.

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

Dodanie `BEAR_DIET` nie ma przepinać predator hunger search na `findDietTarget()`: bear nadal używa istniejącego carcass branch dla needs-driven corpse seeking. Diet itemów jest authority dla dropped-food attraction/consumption, nie nowym równoległym predator-foraging pipeline.

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

Dla bear trail może składać się z blood + loose food, ale nie kończy się obecnie aktywną pułapką jako celem, ponieważ bear pozostaje poza `TRAP_SPECIES_COMPAT`.

## 10. Carcasses

Nie duplikować istniejącego `animalForaging.ts` carcass selection, claim ani consumption.

W tym planie carcass pozostaje w obecnym needs-driven pipeline:

- każdy predator, w tym bear, może użyć `fresh` corpse,
- `rotting`/`bones` nadal rozstrzyga `carcassFoodValue()` na podstawie `scavenging`,
- po rozszerzeniu configu bear uzyskuje `rotting`, ale nie `bones`,
- fox pozostaje fresh-only, wolf zachowuje obecne rotting+bones.

Jeżeli podczas implementacji wspólny attraction resolver da się rozszerzyć o read-only carcass scent candidate bez tworzenia drugiej authority, można zrobić to tylko wtedy, gdy:

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

Zmiana `ANIMAL_DEFS.bear` jest species definition, nie per-animal state; nie dodaje nowego SaveData pola.

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

### Species contracts

- bear `dietAcceptsItem()` akceptuje raw meat oraz wybrane istniejące itemy wszystkożerne (`fish`, `berries`, `apple`, `nuts`, `honey`),
- bear nie ma `grass` diet capability,
- bear `scavenging` akceptuje `rotting`, ale nie `bones`,
- wolf nadal akceptuje `rotting` + `bones`, fox pozostaje fresh-only,
- zmiana optional `ScavengingConfig` nie zmienia obecnego wolf tuning.

### Resolver

- diet-compatible dropped meat jest kandydatem dla wilka/lisa/niedźwiedzia,
- diet-compatible dropped plant food jest kandydatem dla niedźwiedzia, ale nie dla wolf/fox,
- incompatible item nie jest kandydatem,
- herbivore nie reaguje na blood,
- wolf/fox/bear mogą wybrać świeży blood source,
- dog z meat diet nie reaguje na blood, bo nie jest predatorem,
- spoiled meat jest kandydatem dla scavenging-capable wolf/bear, ale nie fox,
- source poza radius jest ignorowany,
- wyższa strength / korzystniejsza odległość wpływa na wybór zgodnie z jednym jawnym scorerem,
- tie-break jest deterministyczny,
- trap species compatibility nadal obowiązuje,
- bear odrzuca baited `simple`/`good` trap mimo diet-compatible bait,
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
- carcass claim/consumption pozostaje bez podwójnej authority,
- bear nadal używa predator carcass path zamiast nowego równoległego diet-foraging branch.

## Manual verification

User w przeglądarce sprawdza co najmniej:

1. Położenie `raw_meat` na ziemi w pobliżu wilka może spowodować podejście i faktyczne zjedzenie itemu.
2. Wilk nie „zjada” mięsa natychmiast z dystansu — używa normalnego movement/pathing.
3. Lis reaguje na zgodne świeże mięso; roślinożerca nie reaguje na meat/blood.
4. Niedźwiedź reaguje na dropped raw meat oraz wybrane dropped plant foods (`berries`/`apple`/`nuts`/`honey`) i faktycznie je konsumuje.
5. Niedźwiedź reaguje na świeży blood trace.
6. Niedźwiedź nadal może jeść fresh carcass; hungry bear może użyć rotting carcass, ale nie bones.
7. Niedźwiedź ignoruje bait w `simple`/`good` trap, ponieważ obecne pułapki go nie obsługują.
8. Po zabraniu mięsa przez gracza zanim zwierzę dojdzie, zwierzę nie dostaje hunger relief.
9. Kilka kawałków jedzenia może naturalnie poprowadzić kompatybilne zwierzę dalej.
10. Świeży ślad krwi może zwabić kompatybilnego drapieżnika; stary/deszczem zmyty działa słabiej lub znika.
11. Po zbadaniu jednej plamy krwi zwierzę nie stoi na niej w nieskończoność i może przejść do kolejnej.
12. Trail zakończony zanęconą pułapką może doprowadzić wilka do `good` trap, ale nadal obowiązuje detection/capture roll.
13. `simple` nadal nie łapie wilka zgodnie z `fauna-014`.
14. Ucieczka, walka i inne wysokopriorytetowe zachowania przerywają attraction.
15. Save/load zachowuje dropped food i trap bait zgodnie z ich obecnym persistence; blood może zniknąć zgodnie z obecnym kontraktem.

## Tuning do ustalenia podczas implementacji

Architektura/species semantics są rozstrzygnięte. Do dobrania pozostają wyłącznie wartości tuningowe:

1. **Attraction strength/radius:** blood powinien mieć większy bazowy sensing radius niż pojedynczy kawałek jedzenia; konkretne liczby dobrać w jednym jawnym scorerze.
2. **Bear relief values:** meat zachowuje istniejącą konwencję `MEAT_DIET`; dla `fish`/`berries`/`apple`/`nuts`/`honey` dobrać wartości względne bez tworzenia drugiego satiety modelu.
3. **Bear rotting value:** ma być wyraźnie niższe niż fresh corpse `1`, bez nadawania bearowi bones capability.
4. **Freshness multipliers:** `fresh > medium`; spoiled meat pozostaje atrakcyjne dla scavenging-capable species, ale dokładny multiplier jest tuningiem.

## Non-goals

Poza zakresem:

- kierunek/siła wiatru wpływająca na zapach,
- scent diffusion/grid/heatmap,
- kilometrowe tropienie po zapachu,
- persistence transient scent targets/cooldowns,
- przebudowa całego fauna decision systemu,
- rozszerzanie diety dzika przy tej okazji,
- nowy osobny omnivore/diet model,
- rozszerzenie trap species coverage o bear,
- NPC używający mięsa do zastawiania pułapek,
- pełna off-screen aggregated scent simulation,
- disease/poison/food-safety dla zwierząt,
- carcass pipeline rewrite.

## Implementation notes

Utworzyć i utrzymywać:

`docs/plans/implementation-notes/fauna-023-systemic-animal-attraction-food-blood-and-trap-lures-implementation-notes.md`

Ważne nowe publiczne/architektoniczne funkcje i typy opisać JSDoc, z `@domain fauna` lub właściwym istniejącym domain tagiem tam, gdzie pomaga to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
