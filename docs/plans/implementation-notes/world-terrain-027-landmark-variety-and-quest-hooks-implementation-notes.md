# Implementation Notes: world-terrain-027-landmark-variety-and-quest-hooks

**Prepared:** 2026-09-13  
**Plan:** `world-terrain-027-landmark-variety-and-quest-hooks.md`

## 1. Aktualny stan i główna decyzja

Plan powinien rozszerzyć istniejący pipeline proceduralnych landmarków, nie tworzyć nowego systemu.

Aktualny ownership:

```text
chunkHeightmap.worker.ts
  computeChunkTile()
  → computeChunkVegetation()
  → computeChunkItems()
  → computeChunkEnvironment()
        ↓
EnvironmentPlacement[]
        ↓
chunkManager.ts
        ↓
individual Object3D dla landmarków
```

`src/terrain/chunkEnvironment.ts` jest właściwym miejscem dla deterministycznego placementu i stable identity. `deriveLandmarkId(seed, cx, cz, kind, ordinal)` już koduje `kind + chunk + ordinal + seed`; nowe landmark kinds powinny korzystać dokładnie z tego samego mechanizmu.

Rozszerzyć `EnvironmentKind`, `LandmarkKind` i `LANDMARK_LABELS` o nowe rodzaje. Nie dodawać osobnego registry ani persisted landmark state.

## 2. Pliki i symbole wymagające uwagi

### `src/terrain/chunkEnvironment.ts`

Główne miejsce implementacji:

- `EnvironmentKind`
- `EnvironmentPlacement`
- `LandmarkKind`
- `LANDMARK_LABELS`
- `deriveLandmarkId()`
- `computeChunkEnvironment()`
- istniejące `slopeAt()` / sampling `tile.heights`, `tile.continentalness`, `tile.mountainRidge`, `tile.roadTint`
- `distanceToSegment()` + `RoadCorridorSegment[]` już używane do footprint-aware road rejection dla cmentarzy.

Nie zmieniać formatu `landmarkId`. `rpgQuestMaterialization.ts` rozpoznaje `LandmarkKind` z prefixu `landmarkId`, więc nowy kind musi być równocześnie obecny w `LANDMARK_LABELS`.

### `src/terrain/chunkHeightmap.worker.ts`

Worker już liczy vegetation przed environment. To istotne dla `oldTree`: `computeChunkEnvironment()` może sprawdzić istniejące drzewa, ale nie powinien mutować wejściowego `readonly vegetation`.

Jeżeli stare drzewo ma tworzyć realną polanę, najczystszy wariant to po wyliczeniu `environment` odfiltrować vegetation kolidujące z placementem starego drzewa przed `postMessage`, albo wydzielić mały pure helper przy pipeline tile-generation. Nie próbować ukrywać kolidujących zwykłych drzew dopiero w rendererze — tile data ma pozostać spójne dla renderingu i innych konsumentów.

`computeChunkItems()` jest obecnie wykonywane przed environment. Jeżeli polana starego drzewa ma również wykluczać losowe item pickups, kolejność lub mały post-filter trzeba rozstrzygnąć świadomie; nie jest to wymagane do V1, jeśli chodzi tylko o drzewa.

### `src/terrain/chunkManager.ts`

`createProceduralEnvironmentProp()` ma exhaustive switch po `EnvironmentKind`. Każdy nowy kind wymaga obsługi tutaj.

Landmarki są indywidualnymi `Object3D`, nie częścią vegetation region batching. To właściwe także dla nowych dużych landmarków.

Dla dedykowanych GLB nie wykonywać `await` podczas chunk finalization. Wzorzec już istnieje dla campfire/standing torch: preload once + synchroniczny clone z cache + procedural fallback tam, gdzie fallback ma sens.

### `src/settlement/decorProps.ts` / `src/settlement/props.ts`

Obecne proceduralne landmark visuals (`createMonolith`, `createStoneCircle`, `createSmallRuins`, `createCemetery`) są eksportowane przez `props.ts` i wywoływane z `chunkManager.ts`.

Nowe visual factories powinny trzymać tę samą granicę: generator terrain zwraca data-only placement, main thread tworzy Three.js visual.

Dla dużych footprintów wzorować terrain grounding na aktualnych multi-part landmarkach: root-only `placeOnGround()` nie wystarcza, jeśli model/ruina rozciąga się na kilka metrów nierównego terenu.

## 3. Placement — konkretne zalecenia

Każdy rodzaj powinien dostać własny RNG stream (`seed ^ hashChunk(...) ^ salt`) tak jak obecne landmarki. Dodanie nowych typów nie może perturbować istniejących rolli monolith/stoneCircle/smallRuins/cemetery.

### Boat

Do rozpoznania brzegu reuse istniejące sygnały z tile:

- `continentalness` względem `region.oceanThreshold` / `region.coastThreshold`,
- lokalna wysokość względem `waterLevel`,
- slope.

`chunkItems.ts` ma już poprawny wzorzec shoreline eligibility dla muszli: coastal continentalness + ograniczenie wysokości nad `waterLevel`. Nie kopiować literalnie jego tuning constants, ale użyć tej samej semantyki.

Łódź powinna być surface landmarkiem z własnym stable id. Placement powinien orientować łódź w przybliżeniu względem brzegu, nie całkowicie losowym yaw, jeśli można to uzyskać tanio z lokalnych próbek wysokości/continentalness. Nie wprowadzać globalnej shoreline graph tylko dla rotacji.

### Ship / shipwreck

To duży footprint. Sam center-point eligibility jest niewystarczający.

Przed akceptacją próbkować kilka punktów wokół planowanego footprintu i sprawdzić:

- część footprintu przy/powyżej brzegu,
- opcjonalnie część na shallow-water side,
- brak stromego uskoku,
- brak przecięcia z drogą/osadą/innym chronionym miejscem, jeżeli aktualne dane pozwalają to sprawdzić lokalnie.

Zachować single-chunk ownership placementu, o ile model mieści się sensownie w chunku. Użyć odpowiedniego margin analogicznie do `STONE_CIRCLE_MARGIN`/cemetery footprint. Nie wprowadzać cross-chunk ownera dla jednego wraku bez realnej potrzeby.

### Tower

Dwie preferencje placementu, ale jeden `LandmarkKind` (`tower`) wystarcza, dopóki subtype nie jest potrzebny przez gameplay:

- coastal: coastal band + odpowiednia wysokość nad wodą,
- mountain: wysoki `mountainRidge` / altitude + akceptowalny slope.

Wariant wizualny można wyprowadzić deterministycznie z placement context / `variant`; nie tworzyć dwóch niezależnych landmark systems.

Duży footprint wymaga multi-sample slope/road checks, nie tylko center-point.

### Old tree

Musi być dedykowanym assetem/model family, nie `createTree(...).scale *= N`.

To nadal `LandmarkKind`, a nie zwykłe `VegetationPlacement`, ponieważ potrzebuje stable `landmarkId`, interaction/quest compatibility i wyjątkowego visual lifecycle.

Polana: environment powstaje po vegetation, więc generator może znaleźć accepted old-tree placement, a potem pipeline tile-generation powinien odfiltrować zwykłe drzewa w ustalonym clearance radius. Nie modyfikować globalnego forest density ani tree lifecycle. To lokalny efekt placementu jednego landmarku.

Nie próbować włączać starego drzewa do `TreeLifecycle` w tym planie. Ścinanie/harvest/regrowth takiego landmarku nie jest wymagane i tworzyłoby dodatkową semantykę persistence.

### Abandoned wagon

`chunkEnvironment.ts` ma dostęp do `params.roadCorridorSegments`, a `distanceToSegment()` jest już używany przez cemetery footprint road checks.

Dla wagonu odwrócić semantykę istniejącego road rejection:

1. znaleźć najbliższy road segment,
2. wymagać bounded distance od jego corridor edge,
3. ustawić placement poza samym `halfWidth` drogi + mały shoulder offset,
4. yaw z kierunku segmentu z niewielkim deterministicznym odchyleniem.

Nie polegać wyłącznie na `roadTint`: tint mówi, że punkt jest na drodze/clearing, ale nie daje naturalnego położenia i orientacji obok drogi.

## 4. Visual assets i preload

Nie znaleziono obecnie dedicated boat/ship/tower/old-tree/wagon landmark factories ani asset contractu dla tych pięciu typów. Nie wymyślać nazw plików assetów w implementacji notes.

Preferowany pattern po dodaniu assetów:

```text
asset URL/spec
→ preload once przy ChunkManager init
→ cached template
→ synchronous clone during environment finalization
→ procedural fallback tylko jeśli dany landmark ma sensowny fallback
```

Old tree ma wymaganie produktowe na dedykowany model, więc zwykłe powiększone procedural tree nie może być jego fallbackiem produkcyjnym. W razie braku assetu lepiej jawnie pominąć placement / użyć wyraźnego dev fallbacku niż naruszyć to wymaganie.

Duży statek i wieża również nie powinny być budowane przez skalowanie odpowiednio łodzi/małej ruiny, jeśli prowadzi to do wizualnie tego samego obiektu.

## 5. Interaction i quest hooks

Nie dodawać nowych objective types.

Istniejący przepływ jest już kompletny:

```text
chunkManager.getNearbyLandmarks()
→ app/interactables.ts
→ Interactable kind='landmark'
→ resolveInteraction.ts
→ QuestManager.onInteractObjective({ type: 'interact_landmark', landmarkId })
```

Wystarczy, że nowe kinds:

- mają `EnvironmentPlacement.id`,
- należą do `LandmarkKind`,
- mają wpis w `LANDMARK_LABELS`.

`src/quests/opportunities/rpgQuestMaterialization.ts` parsuje kind z prefixu `landmarkId` i sprawdza go przeciw `LANDMARK_LABELS`; brak wpisu spowoduje, że nowy landmark nie będzie poprawnie rozpoznawany w RPG materialization.

Nie rozszerzać `QuestManager` o `visit_ship`, `visit_tower` itd.

Quest selection poza loaded chunks nie może używać `ChunkManager.getNearbyLandmarks()`, bo ta metoda widzi tylko runtime-loaded chunks. Dla world-driven questów zachować istniejący bounded deterministic world lookup/materialization pattern używany przez landmark quests.

## 6. Loot — korekta względem ogólnego tekstu planu

### Hidden Finds

`src/world/hiddenFinds.ts` nie jest generic visible-loot systemem. Aktualnie Hidden Find jest sprawdzany po ukończeniu zwykłego shovel dig i reprezentuje zakopane znalezisko powiązane ze stable landmark id.

Dlatego:

- nie używać Hidden Finds do skrzynki/paczki widocznej przy łodzi lub wagonie,
- można użyć go wyłącznie wtedy, gdy konkretny wariant ma faktycznie zakopany loot.

### Mały loot — boat / wagon

Najpierw rozważyć istniejące mechanizmy bez nowego managera:

- chunk-scoped deterministic item pickups, jeśli loot ma leżeć luzem,
- `WorldGeneratedContainerSpec`, jeśli ma być widoczna skrzynia/pojemnik.

`WorldGeneratedContainers` już posiada stable id, persisted contents i wspólny container interaction/transfer UI.

Uwaga performance/ownership: `WorldGeneratedContainers` są materializowane z listy specs przy budowie WorldBundle, a nie chunk-streamowane. Nie generować globalnie skrzynki dla każdego potencjalnego proceduralnego boat/wagon przez nieograniczony world scan. Jeżeli chest ma być tylko przy rzadkiej, bounded liczbie landmarków, specs mogą zostać rozwiązane bounded/deterministycznie. W przeciwnym razie lepszy jest chunk-owned pickup lub rozszerzenie istniejącego chunk lifecycle, ale tylko jeśli realnie potrzebne.

### Shipwreck / większy skarb

`TreasureSiteDefinition` z `world-024` oznacza systemowy keyed/locked treasure site (`site → chest → exact key`). Nie używać go automatycznie dla każdego shipwreck.

Dla zwykłego większego, ale odblokowanego lootu wystarczy istniejący `WorldGeneratedContainerSpec` + deterministyczny loot.

`TreasureSiteDefinition` jest właściwe tylko dla wybranych wraków, które mają być pełnymi treasure sites z kluczem/lockiem.

Nie tworzyć osobnego `LandmarkLootManager`.

## 7. Persistence i identity

Sam landmark nie potrzebuje nowego save state: regeneruje się deterministycznie ze stable id.

Persistować wyłącznie rzeczywiste mutacje istniejącymi mechanizmami:

- collected chunk item IDs,
- world-generated container contents,
- unlocked treasure container IDs / treasure mutations,
- quest state.

Nie dodawać `visitedLandmarks` tylko dlatego, że nowy landmark istnieje. Jeśli przyszły quest potrzebuje „odwiedzono”, istniejący quest state jest właścicielem tego progressu.

## 8. Testy techniczne

### `chunkEnvironment.test.ts`

Dodać focused tests na:

- stable ids dla wszystkich nowych kinds,
- determinism dla identycznego seed/chunk,
- nowe RNG streams nie zmieniają existing landmark placements,
- boat/ship nie pojawiają się poza coastal eligibility,
- tower coastal/mountain eligibility,
- wagon jest przy road segment, ale poza corridor footprint,
- duże footprinty respektują slope/road rejection,
- oldTree placement daje wymagany clearance contract.

### Worker/pipeline

Jeżeli old-tree clearing filtruje vegetation po wyliczeniu environment, dodać test pure helpera / worker-facing composition zamiast próbować testować Web Worker przez browser.

### Interaction

Rozszerzyć istniejące tests `getNearbyLandmarks` / `interactables` / `QuestManager interact_landmark` tylko tam, gdzie union exhaustiveness tego wymaga. Nie duplikować generic objective tests per każdy nowy kind.

### Loot

Jeżeli nowe landmarki dostają containers/items:

- loot deterministyczny względem stable identity,
- po zebraniu/wyjęciu nie respawnuje po save/load,
- pusty wariant pozostaje pusty,
- zwykły shipwreck nie wymaga klucza,
- keyed shipwreck, jeśli w ogóle dodany w V1, używa istniejącego treasure contractu.

## 9. Performance guardrails

- Placement pozostaje worker-safe i data-only.
- Nie skanować świata w poszukiwaniu nowych landmarków podczas render loop.
- Nie dodawać globalnej Map wszystkich landmarków.
- Duże modele: preload poza chunk finalization; nie parsować GLB przy każdym stream-in.
- Landmarks pozostają sparse individual Object3D; nie wrzucać ich sztucznie do vegetation instancing.
- Quest lookup poza streamingiem ma być bounded deterministic lookup, nie chunk instantiation.
- Old-tree clearing nie może powodować drugiego pełnego przebiegu world vegetation; tylko lokalny chunk/post-filter.

## 10. Sugerowana kolejność implementacji

1. Rozszerzyć types/labels/stable identity oraz testy determinism.
2. Dodać placement resolvers kolejno: wagon → boat → tower → oldTree → shipwreck (rosnąca złożoność footprintu).
3. Dodać visual factories/assets + preload/cache.
4. Domknąć old-tree local vegetation clearing.
5. Zweryfikować generic interaction i quest materialization dla nowych prefixes.
6. Dodać opcjonalny loot bez rozszerzania treasure systemu ponad potrzebę.
7. Dodać tylko te konkretne quest definitions/opportunities, które można związać z istniejącym world/NPC state bez quest-only problemów.

## 11. Najważniejsze pułapki

- `EnvironmentPlacement` doc comments nadal mówią o „four proper landmark kinds” — zaktualizować komentarze i wszelkie exhaustive unions po rozszerzeniu.
- `rpgQuestMaterialization.ts` zależy od prefixu `landmarkId` + `LANDMARK_LABELS`.
- `getNearbyLandmarks()` jest runtime-loaded lookup, nie world-independent quest search.
- Hidden Finds = dig semantics, nie generic loot.
- `TreasureSiteDefinition` = keyed systemic treasure, nie każdy większy loot.
- `WorldGeneratedContainers` nie są chunk-streamowane; nie tworzyć nieograniczonej liczby globalnych specs.
- stary dąb/drzewo jako landmark nie powinien wejść przypadkiem do zwykłego `TreeLifecycle`.
- duże propsy nie mogą polegać tylko na center-point slope/grounding.

## 12. Model

**Rekomendacja:** `Sonnet, Composer`.

Powód: implementacja jest średnio złożona, ale przecina worker placement, chunk finalization, asset lifecycle, interaction/quest lookup i opcjonalny loot. Najwięcej ryzyka jest w zachowaniu determinism, footprint correctness i uniknięciu niepotrzebnego globalnego state; nie wymaga jednak szerokiego redesignu uzasadniającego Opus.

> **Zrób git commit i push do main, rebase jeżeli trzeba**