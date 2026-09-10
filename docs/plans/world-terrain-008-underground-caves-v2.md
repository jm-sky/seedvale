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

# B1 — Production topology + SDF spatial representation + geometry ✅

**B1 status (2026-09-08): implemented.** `createCaves.ts` now runs
`pickLargeCaveSites → buildProductionCaveTopology → buildCaveSdfRepresentation
→ buildSdfCaveMesh`, with per-cave deterministic RNG, local terrain-adaptive
descent (full-footprint overburden, reject-on-unworkable-terrain), a
`MIN_DISCONNECTED_CLEARANCE` generation-time separation constraint against
accidental branch unions, and generic `topology.segments` consumption (no
`MAIN_CHAIN`). `?caveSpike=sweep`/`resolveCaveRenderVariants` were removed
from the production path (Milestone-A gate already passed). Details,
deviations and what's intentionally deferred: see the "Milestone B1 —
Implementation Summary" section in
`docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-implementation-notes.md`.
Browser/manual verification (§13's checklist) is still open — technical
checks (`tsc`, `lint`, `build`, `test`) pass.

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

**B2 status (2026-09-08): implemented.** Gameplay ground/containment now
goes through a derived SDF column index (`caveSdfQuery.ts`) retained at
world-build, not `CaveVolume`. Mouth portal = entrance carve ∪ clipped SDF
interior. Underground-miss hysteresis prevents a single query miss from
snapping the player to the surface. Collision still uses
`topologyToCaveDefinition` until B3. Details, deviations and the B3 collider
mismatch: see the "Milestone B2 — Implementation Summary" section in
`docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-implementation-notes.md`.
Browser/manual verification (recon checklist, seed `1136726869`) is still
open — technical checks (`tsc`, `lint`, `build`, `test`) pass.

## 14. Cel B2

Po B1 rendering jest produkcyjnym SDF, ale gameplay ground/containment nadal idzie przez lossy compatibility proxy:

```text
CaveTopology
    → topologyToCaveDefinition
    → CaveVolume
    → Caves.contains / sampleFloor(x,z) / sampleCeiling(x,z)
    → CaveGroundQuery
    → PlayerController.groundAt()
    → miss ⇒ surface sampleHeight ⇒ unlimited upward snap
```

B2 zastępuje tę ścieżkę produkcyjnymi query opartymi o Cave V2 spatial representation:

```text
CaveTopology
    → CaveSdfSpatialRepresentation          (już jest, pure field)
    → CaveSdfColumnIndex                    (nowy derived occupancy)
    → Caves.queryGround(x, y, z)
    → CaveGroundQuery
```

`CaveGroundQuery` w `PlayerController` już jest `(x,y,z)` — nie zmieniać movement systemu. Źródłem prawdy jaskini pozostaje lokalne SDF; mesh i (do B3) collidery są derived.

Nie rozwiązywać problemu przez `PROXY_MARGIN`.

## 14a. Aktualny runtime (potwierdzony w kodzie)

- `createCaves.ts` trzyma `{ topology, definition }` per cave. SDF representation jest budowane wewnątrz `buildSdfCaveMesh()` przy `activate()` i **nie jest retencjonowane**.
- `caves.contains` / `sampleFloor` / `sampleCeiling` foldują **wszystkie** `CaveVolume`, nie tylko active.
- `sampleFloor` / `sampleCeiling` są Y-independent (`Math.min` najniższego floora). `contains` jest Y-aware, ale na **spanie proxy**, nie na SDF.
- `createApp.ts` `caveGroundQuery` woła te trzy osobno. Miss → `null` → `groundAt` bierze `sampleHeight`.
- `integrateVerticalMotion`: grounded + `groundY >= y - STEP_DOWN_MAX` (0.45) ustawia `y = groundY` **w górę bez limitu**. To ostatni krok obu repro.

Collision (`buildCaveWallColliders(definition)`) i camera boom są **poza B2**.

## 14b. Root cause obu repro (seed `1136726869`)

Hipoteza „proxy nie pokrywa SDF void w XZ” jest **zła jako główna dziura**. Skan kolumn o clearance ≥ 1.8 m: prawie cały standing-height SDF void leży *wewnątrz* proxy. Rozjazd jest pionowy i semantyczny.

**Repro 1 — `Grota Mroczna` (`cave:cave:7fd14c30`, x=316.008, z=109.778).** Wejście. Carve podejścia (r=3.2 m, środek 2.2 m na zewnątrz) jest większy niż entrance disc proxy (r=`1.5+0.9=2.4` m). `contains` na Y podłogi ust ginie przy d=2.4 m; surface jest >1 m wyżej → snap w górę. Sufit proxy przy ustach jest tylko 0.20 m nad surową powierzchnią (`2.6 − 2.4`). SDF mouth to zamknięta elipsoida, clip jest tylko na meshu.

**Repro 2 — `Grota Czarnego Kamienia` (`cave:cave:0e3cce97`, x=135.843, z=-17.814).** Komora. Gracz stoi na **płaskiej** podłodze proxy. Na tej wysokości ściana SDF jest ~2.0 m od środka komory; containment i collider ring siedzą na ~5.7 m. ~3.7 m clip-through przez widoczny rock, potem wyjście z disc → snap. `sampleFloor` nie śledzi miski SDF (podłoga rośnie ku ścianie).

Oba kończą się tym samym: `caveGroundQuery` zwraca `null` pod ziemią.

## 14c. Kontrakt query

`CaveSdfSpatialRepresentation` ma dziś tylko `{ bounds, sample(x,y,z) }`. To za mało na gameplay i za drogie na hot path (pętla po wszystkich primitives + `smin` + noise, razy ~20 wywołań `groundAt` na klatkę).

B2 dodaje derived **column index** (lokalny, deterministyczny, snap origin do stałego kroku świata, step 0.25–0.5 m, start 0.4 m):

- per kolumna: posortowane rozłączne `{ floorY, ceilingY }[]` — multi-level-safe, bez `Math.min`;
- clip do analytic surface (`sampleBaseHeight`, ten sam sampler co `clipBelowSurface.ts`);
- **mouth portal**: footprint carve’u (approach + mouth) ∪ clipped SDF, dopóki `y` jest między podłogą wnęki a powierzchnią;
- jedna funkcja `queryGround(x,y,z) → { floorY, ceilingY, intervals } | null`;
- hysteresis: nie wracać na surface, gdy `sampleHeight - playerY` jest ewidentnie podziemnym missem (wyjście ustami nadal działa, bo tam wysokości się schodzą).

Nie raymarchować SDF per frame. Nie robić z mesha/BVH autorytetu. Nie budować globalnego voxel terenu.

## 14d. Fate `CaveVolume` / adaptera

Po B2:

- **usunąć z gameplay ground path** (`Caves.contains` / player `caveGroundQuery`);
- **zostawić** `topologyToCaveDefinition` + `createCaveVolume` + `buildCaveWallColliders` jako collision adapter do B3;
- `Caves.definitions()` może zostać dla katalogu lokacji (czyta `entrance`) — nie trzeba przepinać w B2;
- nie kasować `caveVolume.ts` / `topologyAdapter.ts` w tym slice.

## 14e. Weryfikacja B2

Targeted tests (wzór `caveSurfaceIntegration.test.ts`, bez browsera):

- invert `caveGameplayQuery.b2-recon.test.ts` dla obu cave ID powyżej;
- stacked intervals pick-by-Y;
- hillside above cave nie jest contained;
- column index determinism.

```text
npx tsc --noEmit
pnpm run lint
pnpm run test
```

Browser: Player, checklist w reconie B2 (te dwa ID / współrzędne). Agent nie odpala przeglądarki.

## 14f. Poza zakresem B2

B3 collision + camera, B4 streaming/perf/workers, B5 usunięcie Sweep/V1/`CaveVolume`, Dual Contouring, podnoszenie `PROXY_MARGIN`, rzeźbiony hillside doorway, fauna/loot/navmesh, zmiana `makeCaveId` / siting / production topology.

---

# B3 — Collision + third-person camera ✅

**B3 status (2026-09-08): implemented.** Collision and camera occupancy
now share strict occupancy on the retained SDF column index
(`occupancyContains` / `occupancyIntervalAt` — no `FLOOR_GRACE`).
Y-banded circle beads (`caveSdfColliders.ts`) register in the existing
`ColliderRegistry` on activate. `NpcAgent` / `AnimalAgent` filter with
`colliderActiveAtY`. The third-person boom marches `occupancyAt` (sample
Y) for walls/ceiling/overburden and no longer uses
`withCaveFloorFallback` as the cave camera strategy. Details, deviations
and B4/B5 leftovers: see the "Milestone B3 — Implementation Summary"
section in
`docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-implementation-notes.md`.
Browser/manual verification (recon checklist, seed `1136726869`) is still
open — technical checks are the implementation agent's job.

B3 starts **after** B2: gameplay floor/containment already comes from the SDF
column index. Do not put `CaveVolume` back on the player ground path.

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

**B4 status (2026-09-10): implemented.** Presentation extraction runs on a
dedicated worker (`caveExtraction.worker.ts`) with max-one in flight,
nearest-first queue, generation tokens and no geometry cache. Collider
registration is relevance-scoped and independent of mesh completion.
Gameplay/spatial queries stay on the retained SDF column index. Details
and deviations: see the "Milestone B4 — Implementation Summary" section in
`docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-b4-implementation-notes.md`.
Browser/manual verification is still open — technical checks (`tsc`,
`lint`, `build`, cave-targeted tests) pass.

B4 preserves persistent gameplay/world spatial truth and changes only how expensive cave presentation is scheduled, measured and disposed.

Current production baseline:

```text
createCaves()
  → eager persistent CaveTopology
  → eager CaveSdfSpatialRepresentation
  → eager CaveSdfColumnIndex
  → eager SDF-derived collider data

Caves.update()
  → <= 55 m: synchronous presentation extraction + activation
  → >= 80 m: presentation dispose + collider unregister
```

`queryGround`, occupancy and `queryInterior` already remain available independently of render activation. Do not regress this separation.

B4 is implemented in three ordered slices:

```text
B4.1 lifecycle seam + production instrumentation
B4.2 asynchronous SDF extraction
B4.3 disposal / memory / cache closure
```

Do not expand one slice into the next without completing its acceptance boundary.

## 17. B4.1 — lifecycle seam + production instrumentation

### Goal

Prepare the existing cave runtime for asynchronous presentation extraction without changing Cave V2 generation or B2/B3 gameplay behaviour.

Reuse existing `WorldBundle` ownership and grid-based cave relevance. Do not introduce a `CaveManager`.

Introduce explicit presentation lifecycle semantics capable of representing at least:

```text
inactive
queued/requested
building
active
```

A cave may have persistent gameplay/spatial truth while its presentation is absent or building.

Add per-cave request/generation identity so a future asynchronous result can be rejected after deactivation, reactivation, rebuild or dispose.

### Relevance and collider ownership

Keep current streaming hysteresis initially:

```text
distance <= 55 m
  → cave wanted
  → register already-built colliders immediately
  → request/build presentation if absent

55 m < distance < 80 m
  → retain current relevance/presentation state

distance >= 80 m
  → cave not wanted
  → clear registered colliders
  → detach/dispose presentation
  → invalidate pending presentation generation
```

Collider **data** remains persistent and derived from SDF spatial truth. Collider registration is relevance-scoped but must not structurally wait for render mesh completion.

### Measurements

Instrument production costs separately:

```text
BOOT
cave.topology
cave.sdfRepresentation
cave.columnIndex
cave.colliders

STREAMING / PRESENTATION
cave.sdfSampling
cave.surfaceNets
cave.clipping
cave.bufferGeometry
cave.normalsBounds
cave.framing
cave.activationTotal
```

Also record where practical:

- vertices / triangles;
- collider count / proxy size;
- final geometry bytes;
- estimated temporary bytes;
- activation hitch using existing Seedvale streaming/performance conventions.

Current coarse `createCaves` boot mark and historical `CaveSpikeMetrics` are not sufficient to close B4 because they do not isolate eager column/collider costs or all main-thread presentation finalisation.

### B4.1 acceptance

B4.1 is complete when:

- gameplay/spatial truth still works without active render presentation;
- collider registration is independent of presentation completion;
- presentation has an explicit pending/building lifecycle;
- stale-generation/request identity exists;
- production timings identify boot and presentation costs;
- current 55/80 m hysteresis is preserved;
- material/disposal ownership is checked without unrelated refactor;
- targeted automated verification passes;
- no topology/SDF/B2/B3 behaviour was intentionally changed.

Browser verification belongs to Player.

## 18. B4.2 — asynchronous SDF extraction

Historical Milestone-A extraction (`~112.6 ms` at `cellSize=0.4`) plus current-code recon justify moving the CPU-heavy render extraction off the main thread once B4.1 instrumentation/lifecycle is present.

Use a dedicated cave extraction worker/client, reusing terrain worker protocol semantics but not mechanically sharing the terrain worker pool.

Worker boundary:

```text
MAIN
CaveTopology
+ serializable SDF/extraction config
+ caveId/requestId
      ↓
CAVE EXTRACTION WORKER
rebuild deterministic SDF representation
sample SDF grid
Surface Nets extraction
      ↓
transferable typed arrays + metrics
      ↓
MAIN
world-dependent clipping/finalisation where required
BufferGeometry
normals/bounds
THREE.Mesh / group
scene registration
```

Do not transfer Three.js objects. Do not attempt to transfer the executable `CaveSdfSpatialRepresentation`; rebuild it deterministically from serializable topology/configuration.

Current production clipping depends on analytic surface height. Inspect the exact current seam and keep world-owned surface truth on main unless a clean serializable input already exists. Do not duplicate terrain truth inside the worker.

Initial scheduling policy:

- max **1** cave extraction in flight;
- queue additional wanted caves;
- nearest/currently most relevant cave first;
- duplicate requests coalesce;
- queued stale work is removed/reprioritised;
- running stale work may finish but its result is discarded;
- world dispose terminates worker/client and invalidates pending generations;
- no synchronous heavy extraction fallback on the hot streaming update path after B4.2.

## 18a. B4.3 — disposal, memory and cache closure

Validate repeated visit/unload behaviour:

- render geometry is disposed;
- transferred raw arrays are released;
- pending/in-flight worker state is released on rebuild/dispose;
- shared cave material lifecycle is explicit and correct;
- active/queued/in-flight counters return to expected baseline;
- visiting many caves does not cause unbounded render-memory growth.

Initial cache policy: **no persistent geometry cache**.

If production measurements later show repeated revisit extraction is materially harmful, consider only a bounded byte-budget/LRU cache. Do not introduce an unlimited geometry cache.

### B4 automated coverage

At minimum cover:

1. duplicate cave request → one presentation job;
2. deactivate before completion → stale result cannot mutate scene;
3. deactivate → reactivate → older generation cannot override newer one;
4. dispose during in-flight work → completion ignored;
5. nearby caves obey concurrency/relevance ordering;
6. 55/80 m hysteresis does not thrash;
7. inactive cave still answers gameplay spatial queries;
8. collider relevance does not depend on mesh readiness;
9. extraction is deterministic for identical topology/config;
10. repeated activate/deactivate returns retained render memory/state to baseline.

### B4 guardrails

Do not:

- change production topology/generation quality;
- change SDF shape/representation semantics;
- change B2 ground/query ownership;
- change B3 collision/camera behaviour;
- change swimming/water ownership, entrance correctness or player movement;
- restore `CaveVolume` as gameplay truth;
- make gameplay/world truth depend on presentation activation;
- introduce global voxel terrain;
- create a monolithic `CaveManager`;
- workerize unrelated eager cave work without measurement;
- perform unrelated refactors.

World/simulation truth must remain independent from player/camera presentation relevance so this architecture remains compatible with future server/multiplayer simulation.

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
