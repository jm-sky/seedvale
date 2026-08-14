# Plan 111: House Construction / House Builder

**Status:** `planned` 📋  
**Created:** 2026-08-14  
**Priority:** 🔴 high  
**Effort:** `XL`  
**Depends on:** ~~109~~ MegaKit Construction Catalog  
**Related:** [review 009](../reviews/2026-08-14--009--megakit-construction-audit.md), [review 011](../reviews/2026-08-14--011--megakit-construction-browser-verification.md), [review 012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md), [plan 109](./2026-08-14--109--megakit-construction-catalog.md)

## Cel

Zastąpić obecne pojedyncze modele domów z `houseCatalog.ts` składanym z MegaKit domu, używając istniejącego `ConstructionCatalog` i kształtu `HouseDefinition` z `src/assets/houseDefinitionExample.ts`.

House Builder ma być **warstwą assembly**, nie nowym systemem budynków. Settlement nadal decyduje gdzie znajduje się dom, do której rodziny należy i jak jest używany przez NPC. Builder odpowiada tylko za złożenie wizualnego domu z assetów Construction Catalog, jego lifecycle oraz elementy wymagające osobnej transformacji/interakcji.

Performance jest częścią projektu od początku. Review 012 wykazał **567–780 nieinstancowanych meshów settlementu** i potwierdził, że osada jest jednym z głównych kosztów renderingu. Nowy builder nie może powtórzyć modelu „jeden GLB element = jeden Mesh”.

## 1. House Definition

### 1.1 Rozszerzyć istniejący format

Nie tworzyć drugiego formatu definicji domu. Rozszerzyć `src/assets/houseDefinitionExample.ts` i zachować jego `HouseDefinition` jako kontrakt wejściowy buildera.

Definicja powinna pozostać **data-only** i opisywać:

- `id` — stabilny identyfikator wariantu domu;
- `footprint.width/depth` — rozmiar w metrach, zgodny z modułem 2 m;
- `transform` — opcjonalna rotacja/offset całego domu, jeśli potrzebne;
- `floor` — asset + liczba/moduły płytek;
- `walls[]` — asset, strona, `moduleIndex` oraz ewentualny jawny lokalny transform;
- `corners[]` — cztery posty narożne z pozycją wynikającą z footprintu;
- `openings[]` — door/window, wall asset, frame/fill asset i ewentualne transformacje;
- `roof` — **rozszerzyć obecne `{ assetId, segmentCount }`**, tak aby obsługiwało co najmniej dwa slope/ridge runs i jawne per-part transforms; nie próbować wywnioskować pozycji z AABB dla `gridReliable: false`;
- `decorations[]` — opcjonalne elementy statyczne, z jawnym assetem i transformem;
- `materials` — tylko jeśli konkretny wariant wymaga jawnego override; domyślnie używać materiałów assetu;
- `interactionPoints` — opcjonalne punkty typu `door`, `entrance`, `work`, `storage` jako dane lokalne domu, bez tworzenia nowego systemu interakcji.

Nie dodawać do `HouseDefinition` logiki Three.js, loaderów ani runtime state.

### 1.2 Pierwszy wspierany wariant

Pierwszym rzeczywistym przypadkiem ma być `TEST_HOUSE_01` / jego następca oparty na tym samym przykładzie:

- 4 × 2 m;
- `floor_wooddark`;
- plaster walls;
- `corner_exterior_wood`;
- `wall_plaster_door_flat` + `doorframe_flat_wooddark` + `door_1_flat`;
- opcjonalnie `window_wide_flat1` jako drugi wariant opening;
- `wooden_2x1` jako modularny dach.

Nie używać w pierwszej wersji automatycznego snapowania dla dużych `roof_*` caps, `_l/_r` jako specjalnej geometrii narożnej ani innych `gridReliable: false` części bez jawnych transformów.

## 2. House Builder API

Dodać `src/settlement/houseBuilder.ts`.

Minimalny kontrakt:

- wejście: `HouseDefinition` + `ConstructionCatalog`/asset access + build options;
- wynik: `HouseAssembly` zawierający root `THREE.Group`, statyczne elementy oraz osobne elementy interaktywne;
- builder nie zna `SettlementsManager`, NPC, Household ani ekonomii;
- builder nie wybiera miejsca domu — dostaje transform świata od settlementu.

`HouseAssembly` powinien jawnie rozdzielać:

- `root` — cały dom;
- `static` — elementy, które mogą zostać zbatchowane/połączone;
- `interactive` — np. drzwi;
- opcjonalne `interactionPoints` przeliczone do lokalnego/world transformu;
- `dispose()` — zwalniające wyłącznie zasoby będące własnością assembly, bez niszczenia współdzielonych assetów z cache.

## 3. Construction / Assembly

### 3.1 Asset resolution

Builder ma korzystać z istniejących:

- `ConstructionCatalog` z `src/assets/constructionCatalog.ts`;
- `AssetIndex` / `mergeParkedManifest`;
- istniejącego `loadGltf` cache;
- istniejących `disposeObject3D` / lifecycle helpers.

Nie tworzyć drugiego asset registry.

### 3.2 Transformy

Dla `gridReliable: true` używać modułu i stron definicji:

- wall/floor: 2 m grid;
- corners: pozycje z footprintu;
- wall rotations: jawna mapa `front/back/left/right`;
- nie wyprowadzać pozycji specjalnych części z samego AABB.

Dla części `gridReliable: false` transform ma być jawnie zapisany w `HouseDefinition` lub w małej, stałej tabeli reguł dla konkretnego assetu.

Obowiązkowe znane offsety z review 011:

- `doorframe_flat_wooddark`: identity względem matching wall opening;
- `window_wide_flat1`: identity względem matching wall opening;
- `door_1_flat`: **X ≈ -0.51 m** względem środka openingu; opcjonalne Y/Z tylko jeśli weryfikacja wizualna pokaże potrzebę;
- `roof_wooden_2x1_middle`, `_corner`, `_center`, `_center_mirror`: pozycje zgodne z ich własnymi originami, bez generic face-midpoint snapping.

### 3.3 Materials

Domyślnie zachować materiały z GLB.

Material override ma być wyjątkiem i być współdzielony tam, gdzie to bezpieczne. Nie klonować materiału per element bez potrzeby.

Jeżeli builder musi modyfikować materiał konkretnego domu, klonować tylko ten materiał i oznaczyć go jako własność assembly zgodnie z istniejącym wzorcem `tintPropMaterials`.

## 4. Performance-aware assembly

### 4.1 Najważniejsza zasada

**Nie tworzyć osobnego renderowanego `Mesh` dla każdego elementu domu, jeśli element nie potrzebuje niezależnego runtime state.**

Review 012 wykazał:

- settlement: **567–780 meshes/draw buckets**;
- settlement jest jednym z głównych kosztów renderingu;
- `hide-settlement` zmniejszało liczbę draw calls mniej więcej o połowę w scenie settlementu;
- problem dotyczy przede wszystkim liczby submissions, nie liczby trójkątów.

### 4.2 Statyczne elementy

Preferowana kolejność optymalizacji:

1. **`InstancedMesh`** dla powtarzalnych elementów o tej samej geometrii i materiale, szczególnie gdy ten sam asset występuje w wielu domach;
2. merge geometrii dla bezpiecznych statycznych elementów o kompatybilnym materiale/układzie atrybutów;
3. grupowanie elementów w mniejszą liczbę renderowanych obiektów;
4. zwykły osobny `Mesh` tylko gdy potrzebna jest niezależna transformacja, materiał, shadow/interakcja albo brak bezpiecznej możliwości batchowania.

Pierwszy kandydat do instancingu to powtarzalne `floor_wooddark` / identyczne części ścian i inne dokładnie te same geometry+material pairs występujące w wielu domach.

Nie próbować instancjonować elementów o różnych geometriach/materialach tylko po to, aby zmniejszyć liczbę obiektów.

### 4.3 Drzwi i elementy gameplayowe

Drzwi pozostają osobnym obiektem, ponieważ potrzebują:

- pivotu zawiasu;
- animacji;
- niezależnej transformacji;
- przyszłej interakcji.

Nie merge'ować drzwi z resztą domu.

Podobnie pozostawić osobno elementy, które już teraz lub bezpośrednio po tym planie mają dostać interakcję albo runtime state.

### 4.4 Nie projektować teraz

Nie dodawać:

- nowego `RenderManager`;
- globalnego LOD systemu;
- dynamicznego streamingowego systemu instancji;
- shader-batching framework;
- ogólnej optymalizacji całego settlementu.

Optymalizacja ma być lokalną właściwością House Buildera i jego assembly/batchingu.

## 5. Doors

### 5.1 Struktura

Drzwi powinny być zbudowane jako osobny `Group`:

```text
house
└── door
    └── hingePivot
        └── doorLeaf
```

`hingePivot` jest ustawiany w miejscu zawiasu wynikającym z `door_1_flat`.

Nie obracać całego domu ani wall segmentu przy otwieraniu drzwi.

### 5.2 Animacja

Dodać minimalną funkcję sterującą stanem drzwi, np. `setOpen/open/close` albo mały lokalny kontroler, który:

- zmienia tylko rotację `hingePivot`;
- interpoluje rotację;
- nie przebudowuje domu;
- nie tworzy/usuwa meshów podczas animacji.

Jeżeli istnieje już wspólny mechanizm interakcji/inputu, użyć go. Nie tworzyć pełnego nowego systemu interakcji wyłącznie dla drzwi.

### 5.3 Interaction point

Door/entrance point powinien być zapisany w `HouseDefinition` lub wynikającym z niego `HouseAssembly`, aby później NPC mogły używać tej samej pozycji. W tym planie nie implementować jeszcze inteligentnego pathfindingu do drzwi.

## 6. Settlement integration

### 6.1 Obecny stan

`src/settlement/props.ts` w `buildSettlementProps()` obecnie:

- wybiera `HouseCatalogEntry` przez `pickHomeHouse()`;
- ładuje jeden z `hut_*.glb` / fallback;
- skaluje go przez `resolveHouseHeight()`;
- ustawia go na `clearings.houses[i]`;
- zapisuje `houseId`, `houseModelUrl`, `hasWalls` i lamp mount do `SettlementHouseLandmark`;
- tworzy lampę jako child domu;
- zwraca `landmarks.homes` używane dalej przez `createSettlement.ts` jako `Place`/household/livestock foundation.

Builder ma wejść dokładnie w ten istniejący punkt, zamiast tworzyć drugi system `SettlementHouse`.

### 6.2 Docelowa zmiana

W `buildSettlementProps()` zastąpić:

`pickHomeHouse → loadPropOrFallback(entry.url) → prepareProp → placeOnGround`

przez:

`pickHouseDefinition → buildHouse(definition, buildContext) → placeOnGround`

Pozostała odpowiedzialność settlementu zostaje bez zmian:

- pozycja i yaw domu;
- `clearings.houses`;
- `landmarks.homes`;
- `landmarks.houses`;
- collidery w `createSettlement.ts`;
- `Place` dla NPC;
- household/livestock ownership;
- day/night house lights.

`SettlementHouseLandmark` należy rozszerzyć/migrować tak, aby przechowywał `definitionId` i dane potrzebne obecnym callerom. Nie utrzymywać równolegle dwóch identyfikatorów opisujących ten sam dom bez wyraźnej potrzeby migracyjnej.

### 6.3 `houseCatalog.ts`

Nie usuwać bezpośrednio całego `houseCatalog.ts` tylko dlatego, że builder powstaje.

Najpierw przenieść odpowiedzialność za **wizualny model domu** do `HouseDefinition`/`HouseBuilder`. Pozostałe metadata potrzebne przez istniejący settlement system można zachować tymczasowo.

Po migracji sprawdzić wszystkie referencje do `HouseCatalogEntry`, `pickHomeHouse` i `resolveHouseHeight`. Jeżeli nie są już potrzebne, usunąć je zamiast utrzymywać martwy równoległy pipeline.

## 7. Lifecycle

House Builder musi respektować obecny lifecycle settlementu:

- build → `group.add()`;
- stream-out/dispose → istniejące `disposeSettlementGroup()` / `disposeObject3D()`;
- rebuild `WorldBundle` nie może zostawić geometry/material/texture leaków;
- asset cache pozostaje współdzielony;
- builder nie może dispose'ować cache'owanych GLB resources należących do innych domów.

Jeśli pojawi się InstancedMesh pool/batch, jego lifecycle musi być własnością aktualnego settlementu i być niszczony przy jego dispose.

## 8. Tests

Dodać `src/settlement/houseBuilder.test.ts` oraz rozszerzyć testy definicji, jeśli potrzebne.

Minimum:

1. `TEST_HOUSE_01` przechodzi przez builder bez brakujących asset IDs;
2. footprint 4×2 generuje oczekiwane moduły ścian/podłogi/narożników;
3. wall side → transform jest deterministyczny;
4. doorframe/window są w expected opening transform;
5. `door_1_flat` dostaje X ≈ -0.51 m;
6. door leaf jest childem hinge pivotu, a animacja zmienia tylko pivot;
7. roof parts używają jawnych transformów i nie korzystają z błędnego generic snap;
8. builder nie tworzy dodatkowego asset registry;
9. `dispose()` nie niszczy współdzielonych asset resources;
10. powtarzalne statyczne elementy są batchowane/instancjonowane zgodnie z regułami buildera.

Jeżeli testowanie render-time `drawCalls` w unit testach jest niepraktyczne, dodać mały deterministyczny assembly census (liczba renderowanych Mesh/InstancedMesh oraz interactive meshes) zamiast testu GPU.

## 9. Browser / visual verification

Po implementacji Cursor powinien zweryfikować przynajmniej:

- `TEST_HOUSE_01` jako rzeczywiście złożony dom;
- poprawne połączenie ścian/podłogi/narożników;
- doorframe i window w openingach;
- drzwi w zawiasie i otwieranie bez przesuwania całego domu;
- roof slope/ridge alignment;
- kilka domów w jednym settlement;
- brak widocznych floating/intersection errors;
- brak regresji istniejących NPC `Place` / colliders.

Należy również uruchomić `?perf=1` / benchmark settlement i porównać census przed/po.

Nie wymagać w tym planie konkretnego FPS, ponieważ review 012 nie rozdziela uczciwie CPU submit od GPU stall. Guardrail dotyczy przede wszystkim liczby settlement draw submissions / renderable meshes.

## 10. Performance guardrails

House Builder jest uznany za gotowy tylko jeśli:

- nie zwiększa liczby draw calls liniowo przez każdy nowy statyczny element domu;
- identyczne static geometry/material pairs są instancjonowane lub bezpiecznie łączone;
- drzwi i inne elementy interaktywne pozostają osobne tylko tam, gdzie to uzasadnione;
- materiały nie są klonowane per mesh bez potrzeby;
- `dispose()` nie powoduje double-dispose współdzielonych assetów;
- assembly census pokazuje wyraźnie mniej renderable objects na dom niż obecny model „GLB jako jeden niezależny obiekt z całym poddrzewem”; 
- benchmark settlement nie wykazuje nowego sustained/hitch kosztu podczas normalnego renderingu.

**Cel praktyczny:** po dodaniu kilku domów liczba render submissions settlementu ma rosnąć znacznie wolniej niż liczba elementów konstrukcyjnych. Jeśli każda ściana/płytka/element dekoracyjny kończy jako osobny Mesh, implementacja nie spełnia planu.

## 11. Scope

### Implementujemy teraz

- podstawowy `HouseBuilder`;
- rozszerzenie istniejącego `HouseDefinition`;
- assembly z Construction Catalog;
- 4×2 m test house;
- walls/floor/corners/openings/roof;
- performance-aware batching/instancing dla statycznych powtarzalnych elementów;
- osobny door pivot + podstawowe open/close;
- lifecycle/dispose;
- integrację z obecnym `buildSettlementProps()` / `createSettlement()` bez drugiego systemu budynków;
- tests + browser/performance verification.

### Nie implementujemy teraz

- pełnego player building/edit mode;
- snap UI;
- interior furnishing;
- zaawansowanego destruction/damage;
- pełnego systemu LOD;
- nowej architektury settlement;
- ekonomii budowy / kosztów materiałów;
- proceduralnego edytora domów;
- zaawansowanej logiki NPC używającej drzwi;
- automatycznego supportu całego 176-asset MegaKit.

## 12. Implementation order

1. **Contract** — rozszerzyć `HouseDefinition` w `houseDefinitionExample.ts` bez tworzenia równoległego formatu.
2. **Builder core** — asset resolution, deterministic transforms, static/interactive split, lifecycle.
3. **Basic assembly** — floor → walls → corners → openings → roof.
4. **Doors** — hinge pivot + open/close.
5. **Performance layer** — instancing/merge dla static repeats; assembly census.
6. **Settlement migration** — podmiana istniejącego house creation w `buildSettlementProps()`.
7. **Landmarks/colliders compatibility** — zachować obecne `homes`, `houses`, `Place`, household/livestock i collider ownership.
8. **Tests** — builder + definition + lifecycle + assembly census.
9. **Browser verification** — test house + settlement z wieloma domami.
10. **Performance verification** — `?perf=1` + settlement benchmark; porównać renderables/draw calls do review 012 baseline.
11. **Cleanup** — usunąć nieużywany legacy house-model path dopiero po potwierdzeniu braku referencji.

## Definition of Done

- [ ] `HouseDefinition` jest jednym kontraktem używanym przez builder i przykład.
- [ ] `HouseBuilder` składa pierwszy dom z Construction Catalog.
- [ ] Dom używa modularnego subsetu potwierdzonego w review 011.
- [ ] Drzwi mają poprawny hinge pivot i animację bez przebudowy domu.
- [ ] Static repeated parts są instancjonowane/łączone zamiast generować niepotrzebne meshe.
- [ ] Settlement używa buildera zamiast starego pojedynczego GLB domu.
- [ ] `landmarks.homes`, `landmarks.houses`, colliders, `Place`, households i livestock nadal działają.
- [ ] Lifecycle/dispose jest poprawny dla stream-out/rebuild.
- [ ] Tests przechodzą.
- [ ] Browser verification potwierdza wizualny assembly.
- [ ] Performance verification nie pokazuje regresji i potwierdza sensowny spadek liczby renderable objects per house.
- [ ] Brak drugiego asset registry, drugiego settlement building systemu i nowego globalnego render managera.
