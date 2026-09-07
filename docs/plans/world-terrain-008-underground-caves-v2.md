# Plan: Underground Caves V2

**Created:** 2026-09-04  
**Status:** `in progress` 🔄  
**Type:** feature  
**Priority:** medium · **Effort:** XL  
**Depends on:** none  
**Domain:** `world-terrain`  
**Subdomains:** `terrain` `rendering` `landmarks`  
**Tags:** `caves` `procedural-generation` `collision` `camera`

## 1. Cel

Zastąpić gameplayowo nieudaną reprezentację Underground Caves V1 produkcyjnym Cave V2: deterministycznymi, walk-in przestrzeniami podziemnymi działającymi w tym samym świecie co surface terrain i nadającymi się do third-person gameplay.

Pierwsza produkcyjna cave ma pozostać mała topologicznie, ale nie ciasna przestrzennie: wejście, passage, widening/bend, większy chamber i co najmniej jeden genuine 3D feature (`shelf` albo `overhang`). Nie implementować jeszcze pełnego proceduralnego dungeon generatora.

V2 ma przede wszystkim usunąć:

- pipe look i regularne przekroje;
- sztuczne passage → chamber transitions;
- seams/cracks;
- zbyt gładkie, jednoskalowe surfaces;
- brak kontroli floor/walls/ceiling;
- surface pop-out / camera escape;
- trwałe uzależnienie gameplay queries od efektywnie 2.5D `CaveVolume`.

---

## 2. Relacja do V1

Ten plan zastępuje dalszy rozwój `world-terrain-007-underground-caves.md` jako kierunek produkcyjny caves.

Z V1 zachować tylko sprawdzone mechanizmy infrastrukturalne tam, gdzie nadal pasują:

- world-scale cave siting;
- deterministic cave identity;
- `WorldBundle` ownership;
- streaming activation/deactivation;
- existing `ColliderRegistry` ownership;
- surface/cave ground selection seam;
- terrain mouth integration;
- settlement/road/coast placement constraints.

Nie rozwijać V1 geometry. Po pełnej migracji nie utrzymywać dwóch produkcyjnych cave systems.

---

## 3. Architektura docelowa

Źródło prawdy:

```text
seed + world context + cave identity
        ↓
CaveTopology
        ↓
CaveSpatialRepresentation   ← production local SDF/volume
        ↓
├─ CavePresentation         ← BufferGeometry / Mesh
├─ gameplay spatial queries
└─ collision proxy
```

### CaveTopology

Semantyczny/gameplayowy layout, bez Three.js i bez parametrów konkretnego meshera:

- entrance;
- passages;
- chambers/widenings/constrictions;
- connections;
- centerlines / spatial placement;
- elevation intent;
- desired width/height;
- shelf/overhang;
- przyszłościowo loops, multiple entrances i upper/lower routes.

### CaveSpatialRepresentation

Produkcyjna reprezentacja Cave V2 to **lokalny SDF/continuous volume** ograniczony do bounds jednej cave. Ma być niezależny od scene state i być źródłem rzeczywistego cave space.

Render mesh oraz collision proxy są derived. Render mesh/BVH ani collider registry nie mogą stać się autorytatywną cave geometry.

### Invariants

- cave jest częścią ciągłego świata, nie osobną sceną;
- surface pozostaje heightmap-based;
- nie powstaje global voxel terrain;
- determinism nie zależy od streaming order;
- cave identity nie zależy od vertex/triangle topology;
- meshes powstają lazy przy activation i są disposable;
- nie powstaje drugi collision registry ani CaveManager obok `WorldBundle`;
- architektura nie może blokować przyszłych multi-level caves.

---

# Milestone A — Representation Decision ✅

## 4. Wynik

Milestone A jest zakończony.

Zaimplementowano i porównano na wspólnym `CaveTopology`:

- Generalized Sweep;
- Graph + Local SDF / Volume z Naive Surface Nets.

Player wykonał manual comparison w browserze i wskazał **SDF jako wyraźnie lepszą reprezentację wizualną**. Decyzja architektoniczna:

> **Selected representation: Graph + Local SDF / continuous volume.**

Sweep pozostaje przegranym wariantem porównawczym i ma zostać usunięty po przeprowadzeniu produkcyjnej migracji B1. Nie jest produkcyjną alternatywą.

### Dlaczego SDF

- wyraźnie lepsza naturalność;
- lepsza odporność na pipe look;
- continuous passage → chamber transitions;
- naturalniejsze junctions;
- genuine 3D features bez doklejania niezależnych sweep meshes;
- lepsza droga do przyszłych shelves, overhangs, loops i multi-level routes.

### Koszt zaakceptowany jako ryzyko

Spike SDF jest znacznie droższy od Sweep: około `112.6 ms` mesh extraction vs `1.25 ms` na baseline cave, ~`4.8×` więcej vertices. To nie unieważnia wyboru reprezentacji, ale oznacza, że performance/meshing będzie wymagane przed ukończeniem V2.

### Znane poprawki zachowane z Milestone A

Nie cofać:

- poprawnego Surface Nets winding;
- clipping geometry do deterministic analytic surface;
- terrain-aware overburden protection;
- pop-out containment fixes;
- cave camera floor fallback;
- cave torch boost;
- SDF wet-rock material tuning.

Szczegóły i benchmark: `docs/design/caves/04-sweep-vs-sdf-spike-results.md`.

---

# Milestone B — Production Cave V2

Milestone B jest podzielony na małe produkcyjne slice'y. Nie rozszerzać scope jednego slice'a na kolejne.

```text
B1  production topology + SDF spatial representation + geometry
B2  entrance + gameplay spatial queries
B3  collision + third-person camera
B4  streaming + lifecycle + performance
B5  V1/Sweep removal + cleanup
```

---

# B1 — Production topology + SDF spatial representation + geometry

## 5. Cel B1

Zastąpić eksperymentalny runtime oparty na `buildSpikeTestTopology()` / spike-specific SDF builderze właściwą produkcyjną ścieżką:

```text
LargeCaveSite
    ↓
production CaveTopology
    ↓
production local SDF spatial representation
    ↓
derived presentation mesh
```

Po B1 cave nadal może używać istniejącego `CaveVolume` / collider proxy jako **tymczasowego compatibility adaptera** do B2/B3, ale te adaptery nie są źródłem prawdy Cave V2.

## 6. B1 — topology ownership

### Reuse

Reuse `pickLargeCaveSites()` i jego placement filtering.

Cave identity musi pozostać stabilne względem dotychczasowych `caveId`. Jeśli `makeCaveId()` trzeba przenieść z V1 `caveGenerator.ts`, przenieść logikę bez zmiany wyniku.

### Replace

Nie używać docelowo:

```text
generateCaveDefinitions()
        ↓
zaakceptowany V1 layout
        ↓
wyrzucenie layoutu i użycie tylko entrance
```

To jest obecnie transitional Milestone-A wiring, nie production ownership.

Production builder ma generować i walidować `CaveTopology` bez pośrednictwa V1 tunnel/chamber geometry.

### Determinism per cave

Aktualny `buildSpikeTestTopology(seed, entrance)` używa RNG zależnego od **world seed**, więc wszystkie caves w jednym świecie dostają te same losowe decyzje/wobble w lokalnym układzie.

B1 musi derivować structural RNG z:

```text
world seed + stable cave identity / site coordinates + purpose-specific salt
```

Tak, aby caves były deterministyczne, ale nie były klonami.

Nie używać jednego RNG streamu zależnego od call order.

## 7. B1 — production L1 topology

Bazowy archetype pozostaje mały:

```text
entrance
  ↓
transition
  ↓
irregular passage
  ↓
widening / bend
  ↓
main chamber
  └─ shelf OR overhang
```

Opcjonalny krótki branch może pozostać stress/test capability, ale nie jest wymagany dla pierwszego production L1.

### Skala przestrzeni

Caves mają być wyraźnie większe w **cross-section**, nie przede wszystkim dłuższe.

Punkt startowy do tuningu:

| Section | Width | Height |
|---|---:|---:|
| normal passage | ~3.5–4.5 m | ~4.5–5.5 m |
| widening / bend | ~5–6 m | ~5.5–6.5 m |
| main chamber | ~9–10 m | ~9–11 m |

Wysokość może rosnąć bardziej niż szerokość. Dodatkowej wysokości nie dodawać symetrycznie w górę kosztem overburden — preferować floor descent / downward expansion tam, gdzie terrain tego wymaga.

Route length około 20–30 m nadal wystarcza dla L1. Długość nie jest głównym celem tego slice'a.

## 8. B1 — terrain adaptation i overburden

Usunąć spike-only model, w którym `sinkUnderTerrain()` obniża całe wnętrze jednym uniform dropem i przez to potrafi wrzucić cały dodatkowy spadek w pierwszy ~4 m segment.

Production topology ma:

- znać deterministic analytic surface (`sampleBaseHeight`-equivalent);
- walidować pełny walkable/ceiling footprint, nie tylko centerline;
- zachować specjalny mouth transition;
- adaptować descent/topology lokalnie i płynnie;
- odrzucić site, jeśli rozsądna topology nie mieści się pod terrain;
- nigdy nie wypychać cave ponad surface tylko dlatego, że site był zaakceptowany przez V1 shape.

Nie robić terrain carvingu wnętrza cave.

## 9. B1 — production SDF spatial representation

Obecny `sdfCaveMesh.ts` miesza trzy odpowiedzialności:

```text
topology interpretation
+ SDF field construction
+ grid sampling / mesh extraction
```

Rozdzielić co najmniej logicznie:

```text
CaveTopology
   ↓
CaveSdfSpatialRepresentation
   - bounds
   - deterministic field evaluation
   - structural primitives/features
   - representation parameters
   ↓
mesh extraction
```

Ważne:

- spatial representation nie importuje Three.js;
- representation parameters (`smoothK`, primitive spacing, field detail) nie trafiają do `CaveTopology`;
- current Naive Surface Nets może pozostać pierwszym production mesherem, jeśli rozdzielenie nie wymaga jego zmiany;
- nie robić jeszcze Dual Contouring / Marching Cubes rewrite bez profilingowego powodu;
- structural shape i surface detail pozostają rozdzielone.

### Generic topology consumption

Obecny SDF builder używa hardcoded:

```text
MAIN_CHAIN = entrance → wide-transition → descending-passage → widening-bend → main-chamber
```

B1 musi przestać zależeć od konkretnych spike node IDs. Spatial representation ma konsumować `topology.segments` / graph semantics, aby późniejszy branch/loop nie wymagał przepisywania meshera.

### Accidental unions

SDF smooth union jest spatial-only. B1 ma zachować/testować constraint, że topologicznie niepołączone passages nie mogą zbliżyć się na tyle, aby field stworzył przypadkowy bridge.

Na L1 można realizować to jako topology-generation separation constraint; nie trzeba tworzyć graph-aware SDF boolean engine.

## 10. B1 — presentation geometry

Mesh jest derived z production SDF representation.

Wymagania:

- brak pipe look;
- brak seams/cracks;
- wyraźny passage/chamber contrast;
- asymetryczne walls;
- grywalny floor;
- ceiling variation;
- shelf/overhang jako część continuous space;
- poprawne winding/normals;
- surface clip przy mouth zachowany;
- one cave interior nie mnoży niepotrzebnie draw calls.

Naturalność ma wynikać z structural geometry + kilku skal detail, nie z dużego noise na prostych primitives.

## 11. B1 — runtime integration

Zachować obecny lifecycle:

```text
createCaves(): precompute cheap deterministic world data
activate(): build presentation geometry
 deactivate(): dispose geometry
```

Nie generować wszystkich SDF meshes podczas world boot.

`createCaves.ts` powinno po B1 przechowywać production topologies / spatial definitions, a nie parę `V1 CaveDefinition + spike topology`.

Do czasu B2/B3 można zachować compatibility adapter do `CaveDefinition` dla obecnego `CaveVolume` i colliderów, ale powinien być jawnie transitional i derived z production topology.

## 12. B1 — debug/cleanup boundary

Po technicznym potwierdzeniu production SDF path:

- `?caveSpike=sweep` nie jest już potrzebne jako runtime architecture;
- usunąć Sweep implementation i comparison selection policy, jeśli nie są potrzebne do jednego ostatniego regression testu;
- nazwy `spikeTestCave`, `caveSpike*`, `cave-interior-spike` nie powinny pozostać w production API;
- nie usuwać jeszcze V1 `CaveVolume` / colliders / camera integration — to B2/B3/B5.

Rename/refactor wykonywać tylko tam, gdzie usuwa faktyczną spike semantics; bez unrelated cleanup.

## 13. B1 — technical verification

Dodać targeted tests dla:

- deterministic topology dla tej samej cave identity;
- różnic structural RNG między dwiema caves tego samego world seed;
- topology graph → SDF representation bez hardcoded node ids;
- production overburden over full footprint;
- near-surface rejection/adaptation;
- disconnected-passage separation / accidental-union constraint;
- deterministic SDF field/bounds;
- geometry winding/bounds/no-NaN invariants;
- lazy activation/disposal regression, jeśli zmieniony runtime flow tego wymaga.

Uruchomić adekwatnie:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Browser verification wykonuje Player.

### B1 manual browser checklist

Sprawdzić kilka caves / kilka seeds, nie tylko `definitions[0]`:

- caves nie są geometrycznymi klonami;
- normal passage jest wyraźnie większy od obecnego spike;
- chamber jest duży również wysokościowo;
- entrance → first passage nie dostaje absurdalnie stromego uniform sink ramp;
- cave nie przebija surface;
- passage/chamber nadal zachowują przewagę SDF nad Sweep;
- brak nowych seams / black faces;
- wejście do aktywującej się cave nie powoduje nieakceptowalnego hitcha.

---

# B2 — Entrance + gameplay spatial queries

## 14. Scope

Po stabilnym production SDF:

- dopracować `surface → mouth → transition → interior`;
- zdecydować fate `CaveVolume`;
- wprowadzić Y-aware spatial queries odpowiednie dla przyszłych multi-level routes;
- usunąć `Math.min`-style one-floor assumptions jako trwały kontrakt;
- zachować surface/cave selection na podstawie rzeczywistego 3D containment.

API ma co najmniej obsługiwać containment, floor, ceiling, bounds i entrance transition, bez render-mesh authority.

---

# B3 — Collision + third-person camera

## 15. Collision

Reuse `ColliderRegistry` i stable owner keys.

Collision ma:

- blokować cave walls;
- respektować vertical extent;
- nie blokować surface nad cave;
- być derived z spatial representation / odpowiedniego proxy;
- nie wymagać osobnego cave physics world.

Rozwiązać też pre-existing cave collider Y-filter gap dla innych entity queries, jeśli aktualny recon potwierdzi, że nadal występuje.

## 16. Camera

Camera quality jest warunkiem ukończenia V2.

W cave kamera:

- nie przechodzi przez walls/ceiling;
- nie wychodzi ponad terrain;
- nie pokazuje surface z wnętrza;
- utrzymuje normalny boom distance w szerokim passage;
- skraca boom tylko przy realnym obstruction.

Nie powiększać cave tylko po to, aby maskować camera bug.

---

# B4 — Streaming + lifecycle + performance

## 17. Streaming/lifecycle

Reuse istniejący `WorldBundle` lifecycle i grid-based cave activation.

Po unload/rebuild:

- meshes disposed;
- colliders cleared;
- runtime refs released;
- ta sama cave identity/topology wraca dla tego samego seed/version.

Nie skanować wszystkich caves per frame i nie generować wszystkich meshes upfront.

## 18. Performance

Zmierzyć:

- topology generation;
- SDF representation build;
- mesh extraction;
- peak temporary memory;
- geometry memory;
- vertices/triangles;
- activation hitch;
- collision proxy size.

Milestone-A baseline (`~112.6 ms` SDF extraction przy `cellSize=0.4`) jest punktem odniesienia, nie akceptowanym automatycznie production budgetem.

Najpierw profilować i optymalizować data/layout/grid resolution/caching. Web Worker tylko wtedy, gdy main-thread blocking pozostaje istotny i transfer overhead ma sens.

---

# B5 — Migration + cleanup

## 19. Cleanup

Po browser verification produkcyjnego Cave V2:

- usunąć nieużywany V1 geometry path `caveMesh.ts`;
- usunąć V1 layout helpers, które przestały być load-bearing;
- usunąć Sweep/comparison harness;
- zachować współdzielone siting/lifecycle/collision infrastructure;
- zaktualizować code map/docs;
- nie zostawiać runtime toggle V1/V2.

---

## 20. Future capability — poza L1

Architektura ma pozostawić drogę do:

- several entrances;
- branches/dead ends;
- interconnected tunnels;
- loops;
- several chambers;
- different elevations;
- ramps;
- shelves/platforms;
- overhangs;
- upper/lower paths w tym samym X/Z.

Nie implementować pełnego topology generatora tych układów w tym planie.

---

## 21. Scope out

Plan nie obejmuje jeszcze:

- cave fauna;
- cave loot;
- cave quests;
- cave-specific persistence state;
- multiple production cave archetypes;
- global voxel/SDF terrain;
- procedural navmesh całego świata;
- multiplayer cave synchronization;
- replacement całego player movement / collision systemu;
- extensive cave decoration system.

Fauna/loot/progression dopiero po ustabilizowaniu spatial modelu.

---

## 22. Completion

Plan jest zakończony dopiero gdy:

- Milestone A decision SDF jest wdrożona jako production architecture;
- spike terminology/harness nie jest produkcyjnym runtime;
- V1 geometry path została usunięta;
- L1 cave spełnia visual/gameplay acceptance;
- entrance i surface integration działają;
- spatial queries nie blokują przyszłego multi-level modelu;
- collision i camera działają;
- lifecycle/determinism są zweryfikowane;
- performance jest zmierzone i akceptowalne;
- automated verification przechodzi;
- manual browser verification została wykonana przez Playera.

Dopiero potem planować fauna/loot/quests i większe multi-route cave topology.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
