# Plan: Underground Caves V2

**Created:** 2026-09-04  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** XL  
**Depends on:** none  
**Domain:** `world-terrain`  
**Subdomains:** `terrain` `rendering` `landmarks`  
**Tags:** `caves` `procedural-generation` `collision` `camera`

## 1. Cel

Zastąpić gameplayowo nieudaną reprezentację Underground Caves V1 nowym systemem Cave V2, który tworzy wiarygodne walk-in przestrzenie podziemne o jakości wystarczającej dla third-person gameplay.

Pierwszy produkcyjny milestone pozostaje mały: jedna deterministyczna cave około 20–30 m długości, która dobrze wygląda, dobrze się eksploruje i nie zamyka architektury na przyszłe bardziej złożone caves.

V2 ma rozwiązać przede wszystkim:

- efekt połączonych rur;
- regularne przekroje i sztuczne tunnel/chamber transitions;
- seams/cracks;
- zbyt gładkie i jednoskalowe surfaces;
- niewystarczającą kontrolę nad floor/walls/ceiling;
- problemy camera clearance i camera escape do surface;
- ograniczenie obecnego `CaveVolume` do efektywnie 2.5D modelu.

Nie implementować jeszcze pełnego proceduralnego dungeon generatora.

---

## 2. Relacja do V1

Ten plan zastępuje dalszy rozwój `world-terrain-007-underground-caves.md` jako kierunek produkcyjny caves.

V1 pozostaje źródłem sprawdzonych elementów infrastrukturalnych i lekcji integracyjnych. Nie rozwijać dalej jego geometrii ani nie dodawać do V1 fauna/loot/persistence przed ustabilizowaniem Cave V2.

Zachować tam, gdzie aktualny recon potwierdzi sens reuse:

- cave placement i deterministic identity;
- `WorldBundle` lifecycle;
- streaming activation;
- existing collision registry ownership;
- vertical collider filtering;
- surface/cave ground selection;
- terrain integration;
- entrance placement constraints;
- overburden validation.

Zastąpić lub przebudować tam, gdzie wymagane:

- V1 geometry representation;
- tunnel/chamber mesh generation;
- 2.5D assumptions w `CaveVolume`;
- geometry-derived topology assumptions;
- camera integration, jeśli obecny mechanizm nie gwarantuje poprawnego zachowania.

Po migracji nie utrzymywać dwóch produkcyjnych cave systems.

---

## 3. Research baseline

Plan opiera się na:

- `docs/design/caves/01-problem-and-requirements.md`;
- `docs/design/caves/02-generation-techniques-research.md`;
- `docs/design/caves/03-advanced-sweep-vs-sdf-spike-research.md`.

Research wskazuje dwie realne rodziny reprezentacji do praktycznego porównania:

1. generalized / advanced sweep;
2. graph + local SDF / continuous volume.

Research nie rozstrzyga jeszcze wyboru produkcyjnej technologii.

---

## 4. Cave V2 invariants

Niezależnie od wybranej reprezentacji:

- cave jest częścią tego samego świata, nie osobną sceną/interior world;
- surface pozostaje heightmap-based;
- lokalna volumetric representation nie zastępuje globalnego terrain;
- topology jest deterministyczne i niezależne od presentation;
- player/camera nie są właścicielami lifecycle cave;
- streaming nie zmienia identity ani layoutu cave;
- unload/reload nie zmienia cave dla tego samego seeda i generator version;
- nie powstaje drugi collision registry;
- nie powstaje cave-specific world manager zastępujący `WorldBundle` ownership;
- render mesh jest derived presentation;
- collision representation jest derived gameplay proxy/acceleration structure;
- neither render mesh nor collider registry is authoritative cave geometry.

---

## 5. Architektura odpowiedzialności

V2 rozdziela trzy poziomy:

```text
seed + world context
        ↓
CaveTopology
        ↓
CaveSpatialRepresentation
        ↓
CavePresentation
```

### CaveTopology

Opisuje semantyczny/gameplayowy layout:

- entrance;
- passages;
- chambers/widenings;
- connections;
- branches;
- spatial placement;
- elevation intent;
- desired width/height;
- przyszłe loops/multiple entrances/ramps/shelves/platforms.

Nie zależy od Three.js ani konkretnej reprezentacji geometrii.

Topology nie może zawierać representation-specific parametrów typu SDF resolution, marching-cubes cell size czy sweep profile index.

### CaveSpatialRepresentation

Opisuje rzeczywistą przestrzeń cave niezależnie od presentation:

- empty/walkable space;
- solid walls;
- floor;
- ceiling;
- local shape/deformation;
- spatial queries.

Implementacja wynika z architecture decision gate.

### CavePresentation

Jest pochodną spatial representation i odpowiada za:

- `BufferGeometry`;
- normals;
- materials;
- streamed scene objects;
- presentation-only detail.

Źródło prawdy pozostaje powyżej presentation.

---

## 6. Determinism i identity

Rozdzielić stabilność topology od stabilności konkretnego mesha:

```text
seed + cave identity
        ↓
CaveTopology
        ↓
spatial representation
        ↓
derived geometry
```

Persistent identity nie może zależeć od vertex/triangle topology wygenerowanego mesha.

Przed dodaniem cave-specific persistent state rozstrzygnąć, czy generator wymaga jawnego `generatorVersion`, tak aby przyszłe zmiany noise/primitives/meshing nie zmieniały po cichu znaczenia zapisanego `caveId`.

Nie trzeba w tym planie tworzyć pełnego migration framework dla cave geometry.

---

# Milestone A — Representation Decision

Celem Milestone A jest porównanie reprezentacji, a nie rozpoczęcie produkcyjnego refactoru.

Po zakończeniu Milestone A wymagany jest stop point i manualna decyzja gracza przed rozpoczęciem Milestone B.

---

## 7. Shared CaveTopology

Wprowadzić minimalną reprezentację topology wystarczającą dla wspólnego eksperymentu.

Topology powinno opisywać gameplay intent, nie triangles.

Minimalnie:

- entrance;
- irregular passage;
- chamber/widening;
- local elevation change;
- connections;
- jeden genuine 3D feature: shelf **albo** overhang.

Short side branch jest opcjonalny dla podstawowego L1, ale może być użyty jako kontrolowany stress test junctionu.

JSDoc dodać dla ważnych publicznych typów i funkcji architektonicznych; użyć `@domain world-terrain` tam, gdzie pomaga preflight discovery.

---

## 8. Common test cave

Oba warianty korzystają z tej samej deterministycznej cave około 20–30 m długości.

Minimalny shape:

```text
Entrance
   ↓
wide transition
   ↓
irregular descending passage
   ↓
local widening / bend
   ↓
main chamber
   └── shelf OR overhang
```

Test musi zawierać wystarczającą zmienność, aby ujawnić:

- pipe look;
- powtarzalny cross-section;
- artificial tunnel → chamber transition;
- floor/ceiling coupling;
- asymmetry quality;
- genuine 3D geometry support.

Dodatkowe stress-test features nie powinny niepotrzebnie rozszerzać produkcyjnego L1.

---

## 9. Variant A — Generalized Sweep

Nie implementować prostego `radius + noise`.

Spike powinien sprawdzić co najmniej:

- asymmetric profiles;
- profile keyframes;
- variable width;
- variable height;
- independent floor/ceiling shaping;
- independent wall shaping;
- centerline perturbation;
- local widening;
- chamber transition;
- multi-scale deformation;
- controlled roughness.

Jeśli używany jest branch stress test, zweryfikować junction bez:

- overlapping meshes;
- seams;
- pinching;
- broken floor continuity.

Celem jest sprawdzenie, czy generalized sweep rzeczywiście przestaje być systemem rur, a nie tylko rurą pokrytą noise.

---

## 10. Variant B — Graph + Local SDF / Volume

Przygotować lokalną reprezentację tylko dla testowej cave, bez globalnego voxel terrain engine.

Spike powinien sprawdzić:

- passage primitives;
- chamber primitives;
- union / smooth union tam, gdzie uzasadnione;
- non-uniform deformation;
- controlled multi-scale noise;
- local subtraction/deformation;
- shelf albo overhang;
- continuous passage → chamber transition.

Mesh extraction dobrać do lokalnego eksperymentu na podstawie aktualnego stacku i researchu.

### Accidental-union stress test

Umieścić dwie przestrzennie bliskie, ale topologicznie niepołączone sekcje i sprawdzić, czy influence fields / smooth unions nie tworzą przypadkowego przejścia.

SDF nie wygrywa tylko dlatego, że primitives łatwo się blendują. Capsules + smooth union nadal mogą tworzyć miękkie rury.

---

## 11. Structural geometry vs surface detail

W obu wariantach oddzielić:

```text
STRUCTURAL
chamber / widening
wall
floor
ceiling
shelf / overhang
constriction

        +

SURFACE DETAIL
noise
bumps
small protrusions
roughness
rocks
```

Najpierw cave musi być czytelna jako naturalna przestrzeń na poziomie structural geometry.

Obowiązkowy test:

> Structural geometry must remain readable and cave-like with small-scale surface deformation disabled.

Nie maskować słabej reprezentacji dużą ilością procedural noise.

---

## 12. Same conditions

Oba warianty muszą używać:

- tej samej `CaveTopology`;
- tego samego seeda;
- tego samego entrance;
- podobnych dimensions;
- tego samego material;
- tego samego lighting;
- tej samej player camera;
- tych samych gameplay expectations;
- tego samego benchmark harness/scenario.

Nie porównywać dwóch różnych caves.

---

## 13. Metrics i observability

Dla obu wariantów raportować co najmniej:

- topology generation time, jeśli wspólny etap jest mierzony;
- representation generation time;
- mesh extraction/build time;
- peak temporary allocations / memory estimate tam, gdzie możliwe;
- final geometry memory estimate;
- vertices;
- triangles;
- collision/proxy complexity, jeśli spike jej dotyka;
- bounds/resolution/profile parameters istotne dla interpretacji wyniku.

Benchmarki wykonywać na tym samym harness/scenario. Preferować medianę z wielu generacji zamiast pojedynczego pomiaru.

Nie ustalać arbitralnych twardych limitów ms przed pomiarem baseline.

Jeżeli repo ma istniejący debug/performance mechanism, reuse go zamiast tworzyć `CaveDebugManager`.

---

## 14. Visual/gameplay rubric

Oba warianty ocenić w tej samej skali, np. 1–5, dla:

- naturalness;
- resistance to pipe look;
- passage → chamber transition;
- seam resistance;
- wall asymmetry;
- floor quality;
- ceiling quality;
- shelf/overhang quality;
- junction quality, jeśli testowany;
- gameplay controllability;
- camera clearance;
- future 3D topology potential;
- implementation complexity.

Rubric nie zastępuje manualnego gameplay review.

---

## 15. Architecture decision gate

Po implementacji obu wariantów **nie przechodzić automatycznie do Milestone B**.

Gate składa się z:

```text
automated metrics
       +
technical inspection
       +
manual browser comparison by player
       ↓
architecture decision
```

Możliwy status po pracy agenta:

```text
Architecture spike implemented
Technical comparison complete
Manual comparison required
Decision pending
```

### Sweep wins, jeśli

- osiąga zaakceptowaną naturalność;
- pipe look został rzeczywiście usunięty;
- transitions są dobre;
- przyszła spatial flexibility pozostaje osiągalna;
- koszt/złożoność są znacząco niższe niż SDF.

### SDF/Volume wins, jeśli

- daje wyraźnie lepszą jakość przestrzeni;
- continuous representation rzeczywiście poprawia transitions/seams;
- genuine 3D features są znacznie prostsze i bardziej naturalne;
- performance/memory pozostają akceptowalne dla lokalnie streamowanych caves.

### Neither wins

Jeśli oba warianty mają fundamentalne problemy, nie wybierać rozwiązania na siłę. Udokumentować wynik i zaprojektować kolejny wariant/hybrydę.

SDF nie wygrywa automatycznie przez najwyższy visual score. Sweep może wygrać, jeśli osiąga wystarczającą jakość gameplayową przy wyraźnie mniejszej złożoności. Celem jest najlepszy trade-off dla Seedvale, nie maksymalna fidelity.

### Artifact

Wyniki zapisać do:

`docs/design/caves/04-sweep-vs-sdf-spike-results.md`

Dokument powinien zawierać:

- technical results;
- benchmark results;
- manual gameplay observations;
- wybraną reprezentację po decyzji gracza;
- odrzucony wariant i powody;
- otwarte ryzyka.

Po architecture decision **zaktualizować ten plan**, wpisując konkretną wybraną reprezentację i usuwając niepotrzebną warunkowość z Milestone B.

> **Do not continue into Milestone B until the player has manually compared both representations in the browser and the selected representation has been recorded in this plan.**

Eksperymentalne implementacje nie stają się produkcyjne tylko dlatego, że działają. Przegrany wariant usunąć. Wygrany spike może zostać przebudowany przed produkcją, jeśli jego eksperymentalna struktura nie odpowiada docelowej architekturze.

---

# Milestone B — Production Cave V2

Milestone B rozpoczyna się dopiero po przejściu architecture decision gate i aktualizacji planu.

---

## 16. Production spatial representation

Wdrożyć jeden produkcyjny sposób reprezentowania cave space zgodnie z decyzją Milestone A.

Wymagania:

- determinism;
- brak zależności od Three.js scene state;
- local cave bounds;
- continuous cave space;
- floor/walls/ceiling;
- spatial queries;
- możliwość regeneration po unload;
- separation simulation/world data from presentation;
- future compatibility z multi-level topology.

Nie używać render mesh/BVH jako jedynego źródła gameplayowych danych przestrzeni.

---

## 17. CaveVolume decision

Nie zakładać z góry zachowania ani usunięcia obecnego `CaveVolume`.

Po wyborze spatial representation ocenić, czy `CaveVolume`:

- pozostaje adapterem dla prostych L1 queries;
- zostaje uogólniony;
- czy zostaje zastąpiony.

Obecny model `x/z → one floor + one ceiling` może wystarczyć jako przejściowy adapter L1, ale nie może stać się trwałym kontraktem architektury.

Future caves mogą zawierać:

- upper/lower routes w tym samym X/Z;
- ledges;
- overhangs;
- stacked passages;
- kilka poprawnych wysokości w jednym chamber.

Pełne multi-interval queries mogą pozostać poza L1, jeśli nie są potrzebne, ale architektura nie może ich blokować.

---

## 18. Production geometry

Z wybranej spatial representation generować presentation mesh.

Wymagania:

- brak oczywistych tube cross-sections;
- brak powtarzalnej symetrii;
- brak seams/cracks;
- wyraźna różnica passage/chamber;
- natural widening/narrowing;
- ceiling variation;
- wall asymmetry;
- grywalny floor;
- multi-scale deformation;
- poprawne normals;
- poprawne disposal;
- rozsądny vertex/triangle budget;
- brak zbędnych draw calls.

Jako punkt startowy dla surface detail, nie jako stałą amplitudę noise:

- micro detail około `0.3–0.6 m`;
- medium irregularity około `1–2 m`;
- większe lokalne formations około `2 m+`.

Naturalność ma wynikać z structural shape + kilku skal detail, nie jednego random noise pass.

---

## 19. Entrance i surface integration

Entrance traktować jako osobny problem jakościowy, nie efekt uboczny interior meshing.

Połączenie:

```text
surface terrain
      ↓
mouth
      ↓
transition space
      ↓
interior cave
```

Wymagania:

- entrance na odpowiednim cliff/slope;
- szerokość i wysokość odpowiednia dla third-person gameplay;
- brak małego okrągłego hole;
- brak widocznej dziury przez surface;
- terrain nad cave pozostaje surface;
- vegetation nad tunnel pozostaje poprawna;
- mouth transition maskuje połączenie terrain ↔ cave interior;
- reuse istniejących rock assets tam, gdzie pomaga;
- płynne połączenie entrance z pierwszą sekcją topology.

Entrance transition oceniać niezależnie od interior quality.

### Near-surface / overburden case

Zachować lokalną kontrolę roof thickness względem surface na całej wymaganej długości cave.

Początkowe połączenie z mouth może mieć specjalne warunki, ale dalej ceiling musi zachować bezpieczny dodatni overburden.

Nie stracić poprawki V1 dotyczącej initial tunnel descent i local roof-thickness validation.

---

## 20. Gameplay spatial queries

Player musi otrzymywać właściwe dane cave space bez przełączania surface/cave wyłącznie na podstawie X/Z.

Gameplay representation ma pozwalać określić co najmniej:

- cave containment;
- floor;
- ceiling clearance;
- wall/collision proximity lub odpowiedni proxy;
- bounds;
- entrance transition.

API powinno zachować drogę do przyszłych multi-level queries bez wymagania ich pełnej implementacji w L1.

---

## 21. Collision

Reuse istniejącego `ColliderRegistry`.

Nie tworzyć CaveCollisionManager ani równoległego physics world.

Collision ma:

- blokować cave walls;
- respektować vertical extent;
- nie blokować surface nad cave;
- obsługiwać entrance;
- być stabilne przy rebuild;
- mieć stable owner keys;
- nie zależeć wyłącznie od render geometry.

Najmniejszy wystarczający model collision dobrać po architecture gate. Może to być analytical/sampled/proxy/SDF/hybrid representation zależnie od wybranej technologii.

---

## 22. Third-person camera

Camera quality jest warunkiem ukończenia V2, nie późniejszym polish.

Rozdzielić dwie odpowiedzialności:

```text
cave geometry
→ zapewnia rozsądny third-person gameplay clearance

camera obstruction
→ obsługuje rzeczywiście ograniczone przestrzenie
```

Nie powiększać wszystkich caves tylko po to, aby uniknąć camera obstruction.

W cave:

- kamera nie przechodzi przez walls;
- kamera nie przechodzi przez ceiling;
- kamera nie wychodzi ponad terrain;
- nie pokazuje surface grass/terrain z wnętrza;
- normalny szeroki corridor pozwala zachować typowy boom distance;
- w realnych zwężeniach obstruction może poprawnie skrócić dystans.

Poza cave zachowanie surface camera pozostaje bez zmian, chyba że recon wykaże konieczną wspólną poprawkę.

---

## 23. Streaming i lifecycle

Reuse istniejącego world lifecycle:

```text
createWorldBundle()
rebuildWorldBundle()
disposeWorldBundle()
```

Cave presentation aktywować/dezaktywować przez istniejący world/chunk lifecycle.

Nie generować wszystkich cave meshes na start i nie skanować wszystkich caves per frame.

Po rebuild/unload:

- meshes są disposed;
- colliders usunięte;
- runtime references nie pozostają aktywne;
- ponowne wygenerowanie zachowuje identity/topology dla tego samego seeda/version.

---

## 24. Performance

Performance jest częścią definition of done.

Dla L1 zebrać:

- representation generation CPU time;
- mesh extraction/build time;
- peak temporary memory/allocations tam, gdzie mierzalne;
- final geometry memory estimate;
- vertex count;
- triangle count;
- collision structure size/count;
- streaming activation cost.

Następnie sprawdzić rozsądny scenariusz kilku caves w świecie bez jednoczesnego renderowania wszystkich.

Web Worker rozważyć tylko wtedy, gdy profiling pokaże istotny main-thread blocking i koszt komunikacji/transferu jest uzasadniony.

---

## 25. V1 migration and cleanup

Po browser verification V2:

- usunąć nieużywaną V1 geometry path;
- usunąć zbędne V1 helpers;
- zachować reuse'owane integration mechanisms;
- usunąć przegrany spike;
- nie pozostawiać produkcyjnego runtime toggle V1/V2 bez konkretnej potrzeby debugowej;
- zaktualizować code map/docs tam, gdzie wymagane.

Nie usuwać wspólnej infrastruktury tylko dlatego, że powstała podczas V1.

---

## 26. Future capability — poza L1, ale wspierane architektonicznie

Architektura ma pozostawić drogę do caves posiadających:

- several entrances;
- interconnected tunnels;
- loops;
- several chambers;
- branches/dead ends;
- multiple routes między tymi samymi przestrzeniami;
- different elevations;
- ramps;
- shelves/platforms;
- overhangs;
- upper/lower paths.

Przykład:

```text
                  upper route
                     ╭──────────── shelf
Entrance ────────────┤
                     │
                     ↓
                 large chamber
                     ↑
                     │
                 lower route
```

Nie implementować tego pełnego topology w L1.

---

## 27. Scope out

Plan nie obejmuje:

- full procedural dungeon generator;
- global voxel/SDF terrain;
- procedural navmesh dla całego świata;
- cave fauna;
- cave loot;
- cave quests;
- cave-specific persistence state;
- multiple production cave archetypes;
- multiplayer cave synchronization;
- replacement całego collision systemu;
- replacement player movement system;
- extensive cave decoration system.

Fauna/loot/progression planować dopiero po ustabilizowaniu Cave V2 spatial model.

---

## 28. Visual acceptance criteria

Cave V2 jest nieakceptowalna, jeśli:

- wygląda jak tube;
- ma oczywiste regularne przekroje;
- passage i chamber wyglądają jak sklejone bryły;
- widać seams/cracks;
- walls są prawie gładkie;
- noise wygląda jak proceduralny displacement na rurze;
- entrance wygląda jak mały otwór;
- player/camera regularnie widzi surface przez cave geometry.

Cave V2 powinna:

- być asymetryczna;
- mieć zmienną szerokość i wysokość;
- zawierać local constrictions i bulges;
- mieć nieregularny floor i ceiling;
- mieć naturalne chamber expansion;
- zawierać co najmniej jeden genuine 3D feature: shelf albo overhang;
- zachować świadomą kontrolę gameplayową.

Naturalność nie oznacza losowości.

---

## 29. Manual browser verification

Player wykonuje manual verification w przeglądarce.

Sprawdzić co najmniej:

1. L1 cave ma około 20–30 m długości.
2. Entrance znajduje się w wiarygodnym miejscu terrain.
3. Entrance jest odpowiednio szerokie i wysokie.
4. Entrance transition wygląda poprawnie niezależnie od interior quality.
5. Surface nad cave pozostaje poprawny.
6. Grass/vegetation nie jest widoczna z interior przez błędy geometrii/kamery.
7. Player płynnie przechodzi surface → cave.
8. Początkowy passage stopniowo schodzi w dół.
9. Floor nie ma przypadkowych ostrych skoków utrudniających ruch.
10. Roof zachowuje wymagany overburden poza kontrolowanym mouth transition.
11. Corridor nie wygląda jak tube.
12. Cross-section nie powtarza się w oczywisty sposób.
13. Walls są asymetryczne.
14. Ceiling ma lokalną zmienność.
15. Floor ma kontrolowaną nieregularność.
16. Passage → chamber transition wygląda jak jedna przestrzeń.
17. Chamber jest wyraźnie większy od passage.
18. Nie ma widocznych seams.
19. Shelf/overhang wygląda jak część przestrzeni, nie doklejony mesh.
20. Structural geometry pozostaje cave-like przy wyłączonym small-scale detail.
21. Player collision działa.
22. Player nie przechodzi przez walls ani ceiling.
23. Surface collision nad cave pozostaje poprawne.
24. Kamera nie przechodzi przez walls ani ceiling.
25. Kamera nie wychodzi ponad surface.
26. Kamera nie pokazuje surface terrain z wnętrza.
27. Normalny szeroki tunnel daje rozsądny camera distance.
28. Geometry/topology jest deterministyczna dla tego samego seeda/version.
29. Rebuild world nie pozostawia starych meshes/colliders.
30. Streaming activation/deactivation nie powoduje lifecycle errors.
31. Frame pacing pozostaje akceptowalny podczas wejścia do cave.

Statusy raportować osobno:

- implemented;
- technically verified;
- browser verified.

---

## 30. Technical verification

Po większych fazach wykonywać krótki, adekwatny verification loop.

Przed zamknięciem planu:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Dodać targeted tests dla nowych kontraktów, szczególnie:

- deterministic topology;
- stable cave identity;
- topology → spatial representation determinism;
- entrance transition invariants;
- overburden;
- cave containment;
- floor/ceiling queries odpowiednie dla wybranego modelu;
- vertical separation od surface;
- rebuild/disposal;
- geometry generation invariants tam, gdzie mają wartość.

---

## 31. Relevant code areas

Przed implementacją aktualny recon musi potwierdzić dokładne ownership i symbole.

Spodziewane główne obszary:

- `src/world/caveGenerator.ts`;
- `src/world/caveVolume.ts`;
- `src/world/caveMesh.ts`;
- `src/world/createCaves.ts`;
- `src/world/collision.ts`;
- `src/app/worldBundle.ts`;
- `src/player/PlayerController.ts`;
- cave-related tests.

Nie tworzyć nowych abstrakcji tylko po to, aby odpowiadały nazwom z planu. Podział modułów ma wynikać z aktualnego kodu i wybranej reprezentacji.

---

## 32. Implementation notes

Przed kodowaniem utworzyć:

`docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-implementation-notes.md`

Implementation notes mają oszczędzić agentowi ponownego recon i zawierać tylko implementation-relevant findings:

- aktualne cave lifecycle;
- aktualne `CaveDefinition` / `CaveVolume` ownership;
- exact collision integration points;
- exact `PlayerController` cave-aware flow;
- terrain height / cave ground query relationships;
- current camera obstruction ownership;
- V1 files/symbols do reuse;
- V1 files/symbols do replacement;
- current streaming activation;
- disposal/rebuild mechanics;
- existing debug/performance mechanisms do reuse;
- test entry points;
- rozbieżności między research/plan a aktualnym kodem.

Nie kopiować całego planu ani researchu.

---

## 33. Completion

Plan jest zakończony dopiero gdy:

- oba representation spikes zostały zaimplementowane i technicznie porównane;
- player ręcznie porównał oba warianty w browserze;
- architecture decision została zapisana w `04-sweep-vs-sdf-spike-results.md` i w tym planie;
- jeden wariant został wdrożony produkcyjnie;
- przegrany spike został usunięty;
- V1 geometry path została zastąpiona;
- L1 cave spełnia visual/gameplay acceptance;
- entrance/surface integration działa;
- collision i camera działają;
- determinism/lifecycle są zweryfikowane;
- performance jest zmierzone;
- automated verification przechodzi;
- manual browser verification została wykonana przez gracza.

Dopiero potem planować fauna/loot/quests oraz większe multi-route cave topology.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
