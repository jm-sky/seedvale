# Plan: Underground Caves

**Created:** 2026-08-14  
**Status:** `in progress` 🔄  
**Type:** feature  
**Priority:** low · **Effort:** L  
**Depends on:** ~~097~~ ~~125~~  
**Domain:** `world-terrain`

> Check: `docs/plans/implementation-notes/world-terrain-007-underground-caves-implementation-notes.md`
> Check: `docs/plans/implementation-notes/world-terrain-007-underground-caves-contract.md`

## Implementation status (2026-09-03)

**Implemented + technically verified:** Faza 0-3 — `CaveDefinition`/`CaveVolume` domain + generator, `WorldBundle` lifecycle, streamed procedural interior presentation, mouth rock framing reuse, player floor/ceiling/collision integration, and cave-wall collision via the existing `ColliderRegistry` with optional vertical envelope (`minY`/`maxY`).

**Not implemented:** Faza 4 — fauna/loot/persistence integration. This remains deferred until the cave spatial model is gameplay-ready.

**Browser/gameplay-verified:** not yet.

### Regression fix (2026-09-03) — cave interior sat one mouth-depth too high

The first implementation started the cave graph at raw surface height while `createCaves.ts` carved a `MOUTH_DEPTH` recess. The leading tunnel therefore intersected the surface. The overburden check also skipped the leading 35% of the tunnel, so it could not catch this failure.

The fix starts the interior at the carved recess floor and keeps a positive `MOUTH_ROOF_MIN` roof in the leading section. Regression coverage was added to `caveGenerator.test.ts`.

### Divergences from implementation notes/contract

- The contract's `sampleHeight`/`sampleFloor` assumption was incorrect: `sampleFloor` is the underwater seabed sampler. A dedicated `CaveGroundQuery` seam was therefore added for `PlayerController`.
- The shared `ColliderRegistry` originally had no vertical extent. Cave colliders gained optional `minY`/`maxY` and `colliderActiveAtY()` so cave walls do not leak onto the surface above a tunnel. `PlayerController` uses this filtering; fauna integration remains deferred.

### Why Faza 4 is deferred

The existing `cave`/`wolfDen` habitat-spawner concept in `fauna/createFauna.ts` is a different, surface-oriented mechanism. Rebinding it to real `CaveDefinition`s is a separate integration task. Persistence likewise has no useful cave-specific state consumer until fauna/loot/progression exists.

---

## 1. Cel

Wprowadzić deterministyczny system podziemnych jaskiń jako rzeczywistych, walk-in przestrzeni świata, z wejściami w zboczach, własnym floor/ceiling, kolizją, streamingiem i docelową integracją z fauną, lootem, questami i persistence.

Jaskinia jest częścią tego samego świata, a nie osobnym światem ani drugim systemem terenu.

### Zasady

- świat pozostaje niezależny od gracza;
- layout jest deterministyczny z seeda;
- `CaveDefinition` nie zależy od Three.js, save ani runtime entities;
- cave runtime ma lifecycle `WorldBundle`;
- nie tworzyć równoległego collision/fauna/persistence/inventory systemu;
- surface nad jaskinią pozostaje surface — samo `x/z` nie przenosi encji pod ziemię;
- presentation jest streamowana;
- geometry, mesh i runtime state są pochodne danych świata.

---

## 2. Architektura docelowa

```text
seed + world/grid coordinate
        ↓
CaveGenerator
        ↓
CaveDefinition
  ├─ caveId
  ├─ entrance
  ├─ tunnels / chambers
  ├─ bounds
  └─ gameplay metadata
        ↓
CaveRuntime
  ├─ streamed presentation
  ├─ cave collision
  ├─ cave floor queries
  └─ integrations
        ↓
existing world systems
  ├─ ChunkManager / terrain
  ├─ collision registry
  ├─ AnimalSpawner / AnimalAgent
  ├─ ItemKind / ItemInstance
  └─ SaveData
```

`CaveDefinition` pozostaje czystą definicją przestrzeni. Nie posiada sceny, meshów, colliderów ani runtime entities.

---

## 3. Stan istniejącego kodu i migracja

Cave subsystem zastępuje dawne `createLargeCaves()` jako mechanizm walk-in underground. `WorldBundle` jest właścicielem lifecycle:

```text
createWorldBundle() → create caves
rebuildWorldBundle() → dispose old caves → create new caves
disposeWorldBundle() → dispose caves
```

Nie pozostawiać dwóch niezależnych mechanizmów jaskiń ani starych runtime references po rebuildzie.

---

## 4. Cave identity i deterministyczny generator

Każda jaskinia ma stabilne `caveId` wynikające z seeda i world/grid coordinate.

Kandydaci są filtrowani m.in. przez wodę/coast, wysokość i nadkład, nachylenie/mountain ridge, settlement footprint, road corridors oraz istniejące world samplers.

V1:

```text
large cliff-side entrance
        ↓
wide transition
        ↓
walk-in tunnel
        ↓
large chamber
        ↓
branch / continuation / dead end
```

Nie projektować pełnego proceduralnego dungeon generatora.

### Krytyczna zasada wysokości tunelu

**Jaskinia powinna po wejściu stopniowo schodzić w dół.** Nie chodzi o gwałtowne zejście ani schody. Floor powinien mieć łagodny, naturalny gradient w dół przez początkowy odcinek tunelu.

To zwiększa nadkład: wraz z oddalaniem się od wejścia floor znajduje się coraz niżej względem surface, więc późniejsze przebicie ceiling przez powierzchnię staje się mniej prawdopodobne.

Generator musi kontrolować relację:

```text
surface height
      ↓
entrance floor
      ↓  gentle descent
lower tunnel floor
      ↓
large chamber floor
```

Nie wystarczy średni `overburden`, endpoint check ani globalna wartość głębokości. Dla całej długości tunelu należy sprawdzać lokalny minimalny nadkład między ceiling a odpowiadającą mu surface height.

Początkowy odcinek jest wyjątkiem tylko w zakresie potrzebnym do połączenia z wycięciem wejścia. Dalej roof musi mieć dodatni, bezpieczny margines.

---

## 5. Faza 0 — generator spike

Przed ciężką prezentacją sprawdzać na kilku seedach:

```text
candidate cells
mountain / cliff candidates
lowland candidates
accepted after overburden
accepted after water/coast
accepted after settlement exclusion
accepted after road exclusion
mean nearest-cave distance
entrance slope / cliff suitability
minimum roof thickness along every tunnel sample
initial tunnel descent
```

Spike ma pozwolić skalibrować gęstość i geometrię bez tworzenia meshów.

---

## 6. Faza 1 — CaveDefinition + WorldBundle lifecycle

Minimalny kontrakt:

```ts
caveId
entrance
bounds
layout
sampleFloor(x, z)
contains(x, y, z)
```

`sampleFloor()` i `contains()` dotyczą przestrzeni jaskini, nie surface heightmap. Nie tworzyć `CaveChunkManager`.

---

## 7. Faza 2 — Cave presentation i streaming

### Surface

Surface pozostaje ciągły nad tunelem. Poza wejściem nie tworzyć widocznej dziury w heightmapie. Wejście jest normalnym połączeniem surface ↔ cave.

### Entrance

Wejście ma być:

- szerokie i wysokie;
- umieszczone w przybliżeniu pionowej ścianie skalnej / cliffie;
- osadzone w lokalnej depresji terenu;
- połączone z szerokim transition zamiast małego otworu w ziemi.

Nie akceptować wejść wyglądających jak dziura w płaskiej łące.

### Streaming

```text
player position
  → relevant cave cells
  → candidate caves
  → bounds/distance test
  → activate/deactivate presentation
```

Nie skanować wszystkich caves co frame.

### Wizualizacja

- proceduralny mesh interioru;
- reuse istniejących rock assets przy mouth;
- własny floor i ceiling;
- brak nowego GLB dla całego interioru;
- surface vegetation kompatybilna z nową geometrią.

---

## 8. Faza 3 — Movement, ground, collision i camera

Player movement rozróżnia surface i cave:

```text
surface → existing sampleHeight
cave    → CaveVolume.sampleFloor
```

Samo `x/z` nie może przełączać encji z surface na cave.

### Collision

Rozszerzać istniejący `world/collision.ts`, bez drugiego collision registry.

Cave collision musi blokować ściany, umożliwiać ruch wewnątrz, respektować cały cave bounds, używać stabilnego `ownerKey` i respektować pionowy envelope (`minY`/`maxY`). Nie wymagać mesh/BVH jako podstawowego movement collision.

### Camera

Obecna cave-aware integracja PlayerController nie gwarantuje poprawnej trzecioosobowej kamery. Geometria musi zapewniać realny clearance dla gracza **i kamery**, a istniejący camera obstruction/boom mechanism należy rozszerzyć tam, gdzie to konieczne.

Kamera nie może przebić ściany/ceiling, wyjść nad surface, pokazać surface grass/terrain z wnętrza ani nienaturalnie skracać dystansu w normalnym szerokim tunelu. Poza cave zachowanie kamery pozostaje bez zmian.

---

## 9. Faza 4 — fauna, loot i persistence

### Fauna

Reuse `PreySpawner` / `AnimalAgent` i istniejącego lifecycle. Cave-bound animals muszą korzystać z cave floor/nav danych, nie surface `sampleHeight`. Nie tworzyć cave-specific fauna managera.

### Loot

Reuse `ItemKind`, `ItemInstance` i istniejące mechanizmy persistence. Nie tworzyć cave-specific inventory.

### Persistence

Rozszerzać `SaveData`, zapisując tylko niederywowalny stan, np. discovery/progress/cleared/looted state i wymagane item instances. Nie zapisywać layoutu, meshów, colliderów ani stream state.

---

## 10. Integracja z istniejącymi systemami

| Potrzeba | Właściciel |
|---|---|
| terrain / surface | `ChunkManager` |
| terrain samplers | `ChunkManager` |
| cave placement inputs | istniejące world samplers / `ChunkManager` |
| collision | `world/collision.ts` |
| fauna lifecycle | `PreySpawner` / `AnimalAgent` |
| spawn persistence | istniejący `SaveData` |
| item identity/state | `ItemKind` / `ItemInstance` |
| world lifecycle | `WorldBundle` |
| streaming | istniejący world/chunk lifecycle |

Nie tworzyć równoległych mechanizmów dla tych odpowiedzialności.

---

## 11. Assety

- interior: proceduralny;
- mouth: istniejące rock assets;
- fauna: istniejące gatunki;
- loot: istniejące itemy;
- SFX: opcjonalne;
- bez nowych asset registry entries bez faktycznie nowych assetów.

---

## 12. Weryfikacja

### Techniczna

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

### Browser / manual

1. Generator daje wiarygodną gęstość na kilku seedach.
2. Wejścia są na stromych zboczach / cliffach, nie na płaskich łąkach.
3. Wejście jest wystarczająco szerokie i wysokie dla third-person gameplay.
4. Przejście nad cave nie pokazuje dziury ani wnętrza.
5. Surface vegetation nad tunelem pozostaje surface vegetation.
6. Wejście działa jako surface ↔ cave transition.
7. Tunnel po wejściu stopniowo schodzi w dół.
8. Floor nie ma gwałtownych spadków utrudniających ruch.
9. Cave ceiling zachowuje bezpieczny nadkład względem surface na całej długości tunelu.
10. 20–30 m pod dachem potrzebne jest światło/pochodnia.
11. Dzień za wejściem nie oświetla całej sali.
12. Kolizja ścian działa.
13. Gracz nie przebija ceiling ani nie wychodzi nad teren.
14. Kamera pozostaje wewnątrz cave podczas normalnego third-person movement.
15. Surface grass/terrain nie jest widoczne z wnętrza przez camera escape.
16. Tunel nie wygląda jak zestaw połączonych rur.
17. Nie są widoczne oczywiste seams między segmentami.
18. Walls/ceiling/floor mają kontrolowaną nieregularność.
19. Micro bumps są rzędu ~`0.5 × 0.5 × 0.5` m.
20. Większe wall/ceiling bumps są rzędu ~`2 × 2 × 1` m, gdzie trzeci wymiar oznacza głębokość protrusion.
21. Chambers są wyraźnie większe od corridorów.
22. Kamera ma wystarczający clearance w całej generowanej przestrzeni.
23. Zachowanie surface camera pozostaje bez zmian poza cave.
24. Save/reload daje identyczną geometrię z seeda.
25. Rebuild world nie pozostawia starego cave runtime.
26. Cave fauna porusza się po cave floor, a fauna surface nad tunelem pozostaje na surface.
27. Loot/progres przetrwa save/reload zgodnie z wymaganym stanem.
28. Duża cave może zawierać branch/chamber bez specjalnego systemu dungeonów.

Statusy rozdzielać na implemented / technically verified / browser-verified.

---

## 13. Zakres poza planem

Nie włączać:

- pełnego dungeon generatora;
- multiplayer synchronization;
- nowego inventory/container system;
- nowego fauna lifecycle;
- nowego persistence framework;
- nowego collision engine;
- proceduralnego navmesh systemu dla całego świata.

---

## 14. Pliki

### Główne

- `src/world/caveVolume.ts`
- `src/world/caveGenerator.ts`
- `src/world/caveMesh.ts`
- `src/world/createCaves.ts`
- `src/app/worldBundle.ts`
- `src/terrain/chunkManager.ts` — tylko jeśli wymagane
- `src/world/collision.ts`
- `src/player/PlayerController.ts`
- `src/fauna/AnimalAgent.ts` / `src/fauna/createFauna.ts` — Faza 4
- `src/persistence/saveData.ts` — Faza 4

### Testy

- `src/world/caveVolume.test.ts`
- `src/world/caveGenerator.test.ts`
- dodatkowe testy tylko tam, gdzie kontrakt caves rozszerza istniejące systemy.

---

## 15. Gameplay observations — 2026-09-04

Manual gameplay revealed that the current implementation is not yet acceptable from a third-person gameplay perspective.

### Observations

- Camera frequently escapes the cave and reveals surface grass.
- Tunnel looks like connected pipes; seams are visible and surfaces are too smooth.
- Entrance is too narrow and too small.
- Overall cave experience is poor despite technical implementation being present.

### Design reference

*World of Warcraft* is a useful reference for the **scale principle**: caves intended for third-person play need corridors/chambers large enough for both character and camera. Entrances are large openings in rock faces, followed by passages that can gently rise/fall.

The goal is not to copy WoW geometry, but to make camera clearance and third-person readability first-class cave-generation constraints.

---

## 16. Gameplay-driven conclusions and required improvements

### 16.1 Entrance geometry

Entrance dimensions must increase substantially. Placement should target a roughly vertical cliff/rock face with a local depression and a gradual transition into the cave.

The cave mouth should be a large opening in the cliff, not a small hole cut into a shallow slope.

### 16.2 Cave scale

The cave must be designed as a playable volume first and natural rock second.

Corridors and chambers need explicit margins beyond the player collision envelope. Tight passages that leave insufficient camera clearance should be rejected or widened during generation.

### 16.3 Tunnel topology

The current straight, constant-radius tube model is too primitive for the desired result.

The next pass should produce:

```text
large mouth
  ↓
wide transition
  ↓
large walk-in corridor
  ↓  gentle descent
large chamber
  ↓
branch / continuation / dead end
```

Tunnel elevation should vary gradually. In particular, the initial tunnel floor should descend rather than remain flat or rise into the terrain.

### 16.4 Surface safety / overburden

A critical generator invariant is:

```text
for every tunnel sample after the mouth transition:
    surfaceY(x,z) - ceilingY(x,z) >= minimumRoofThickness
```

The initial tunnel descent should make this condition increasingly safe as the cave progresses underground. A later rise may be allowed only if the generator re-checks local overburden and never violates the minimum roof thickness.

Do not rely only on average cave depth, endpoint checks or a single global overburden value.

### 16.5 Surface irregularity

Use controlled multi-scale deformation:

- micro: approximately `0.5 × 0.5 × 0.5` m;
- larger: approximately `2 × 2 × 1` m on walls/ceiling, with the third value representing protrusion depth.

These are visual targets, not literal mesh dimensions. Floor deformation must remain traversable and compatible with collision/ground queries.

### 16.6 Camera containment

Extend the existing camera obstruction/boom logic where possible instead of creating a cave-specific camera system.

The camera must respect cave geometry and maintain a useful third-person view without clipping into surface terrain.

### 16.7 Structural change vs parameter tuning

Do not assume this can be fixed by simply increasing radius/height constants.

Before implementation, inspect `caveGenerator.ts`, `caveVolume.ts`, `caveMesh.ts` and the camera/PlayerController integration together. Determine whether the straight constant-radius tunnel representation itself causes the pipe/seam problem. If so, change the representation to a continuous or blended volume/mesh rather than stacking visually independent tubes.

---

## 17. Scope / implementation note

The 2026-09-04 gameplay findings mean that the technically verified Faza 2-3 implementation is **not gameplay-final**. The next cave pass should prioritize spatial scale, entrance geometry, gradual initial descent, local overburden safety, procedural rock irregularity and camera containment.

Faza 4 fauna/loot/persistence should remain deferred until the cave geometry is browser-verified as a robust third-person playable space.

**Zrób git commit i push do main, rebase jeżeli trzeba**
