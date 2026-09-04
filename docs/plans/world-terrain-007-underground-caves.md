# Plan: Underground Caves

**Created:** 2026-08-14  
**Status:** `in progress` 🔄  
**Type:** feature  
**Priority:** high · **Effort:** L  
**Depends on:** ~~097~~ ~~125~~
**Domain:** `world-terrain`

> Check: `docs/plans/implementation-notes/world-terrain-007-underground-caves-implementation-notes.md`
> Check: `docs/plans/implementation-notes/world-terrain-007-underground-caves-contract.md`

## Implementation status (2026-09-03)

**Implemented + technically verified** (`npx tsc --noEmit`, `npm run lint`,
`npm run build`, `npm run test` all pass): Faza 0-3 — `CaveDefinition`/
`CaveVolume` domain + generator (§4-5, `caveVolume.ts`/`caveGenerator.ts`),
`WorldBundle` lifecycle (`caves: Caves` replaces `largeCaves`, §3/§6,
`createCaves.ts`), streamed procedural interior presentation + mouth rock
framing reuse (§7, `caveMesh.ts`), player floor/ceiling/collision
integration (§8, `PlayerController.ts`/`verticalMotion.ts`), and cave-wall
collision via the existing `ColliderRegistry` extended with an optional
vertical envelope (`collision.ts`'s `minY`/`maxY`, `caveColliders.ts`).
`largeCaves.ts`/`largeCaveVisual.ts` are kept and reused (site placement,
mouth rock framing); `createLargeCaves.ts` (trench-carve + immediate
visual) is removed, fully superseded.

**Not implemented** — Faza 4 (§9): fauna/loot/persistence integration.
Deliberately deferred rather than rushed — see rationale below. Not a
silent gap: nothing in Faza 0-3 depends on it, and the plan's own
acceptance list (§12) items 1-11 (generator density, entrance placement,
surface continuity, movement, collision, lighting) are all addressed by
this pass; items 12-13 (cave fauna/loot) are not.

**Browser/gameplay-verified:** not yet — pending manual verification
(items §12.1-11) per the task's workflow.

### Regression fix (2026-09-03) — cave interior sat one mouth-depth too high

Reported after the first pass: two overlapping ground surfaces on a slope
(grass + a bare, rock-coloured one), the player able to walk "under" the
terrain with the head still poking above it.

Root cause: `caveGenerator.ts` started the whole graph at the *raw* surface
height at the site (`sampleHeight(site.x, site.z)`), while `createCaves.ts`
carves a `MOUTH_DEPTH` (2.4 m) recess there. The interior therefore sat 2.4 m
too high: the first metres of the tunnel arch (2.6 m tall) stood *above* the
terrain — the second, rock-coloured "surface" — and the cave's vertical
envelope kept overlapping the surface several metres past the mouth, so
`Caves.contains()` classified a player merely walking over the tunnel as being
inside it and switched their ground to the cave floor under the (uncarved)
terrain. The overburden check could not catch this: it deliberately skipped the
leading 35% of the tunnel, which is exactly where the geometry broke through.

Fix (both in `caveGenerator.ts`): the interior starts at the carved recess
floor (`CAVE_MOUTH_DEPTH`, now the single constant `createCaves.ts` carves
with), and the previously exempt leading section is held to a thin but positive
`MOUTH_ROOF_MIN` roof instead of being unchecked. Measured over 40 seeds
(analytic `sampleHeightAt`): no tunnel roof above the surface past the carved
mouth (min roof 0.42 m, was −2.35 m), surface-capture area beyond the mouth
down from ~4 m² per cave to ~0.06 m², and accepted caves up from ~0.1 to ~2 per
world. Regression tests: `caveGenerator.test.ts`.

### Divergences from the implementation notes/contract (code was authoritative)

- The contract's §13/§40 claim that `PlayerController` "already separates
  `sampleHeight`/`sampleFloor`" and that seam could be reused directly for
  cave floor turned out to be wrong: `sampleFloor` is the underwater seabed
  sampler (swim depth), not a general surface/floor split. A new
  `CaveGroundQuery` seam was added instead (disambiguated by the entity's
  own current Y, per contract §14), used only by `PlayerController` for now.
- The shared `ColliderRegistry` (`collision.ts`) is XZ-only with no
  vertical extent. Registering cave-wall colliders unmodified would have
  let them leak onto a surface entity standing above a tunnel. `Collider`
  gained an optional `minY`/`maxY` (default: active at every Y, matching
  every pre-existing collider unchanged) plus `colliderActiveAtY()`;
  `PlayerController` filters by it before `resolvePosition`. `AnimalAgent`/
  `NpcAgent` do not filter yet — harmless today (no cave-bound fauna), and
  the same reason Faza 4 fauna integration is deferred rather than bolted
  on against a wall model that hasn't been used by a second consumer yet.

### Why Faza 4 was deferred instead of implemented under time pressure

- The plan's own fauna/loot/persistence boundary (§9-10, contract §29/§36)
  requires integrating with `PreySpawner`/`AnimalAgent`'s existing
  cave/wolfDen habitat-spawner concept in `fauna/createFauna.ts` — which,
  on inspection, is a *different*, pre-existing, surface-only mechanism
  (decorative mouth prop near a settlement, animals spawn at surface
  `sampleHeight`) unrelated to `largeCaves.ts`'s world-scattered walk-in
  caves this plan targets. Rebinding it to real cave volumes is a
  meaningfully separate change with its own risk (three-thousand-line
  `AnimalAgent.ts`), not a small extension of what Faza 0-3 built.
  Persistence (§14, sparse discovered/cleared/looted state) has no
  consumer yet without Faza 4 fauna/loot, so there's nothing concrete to
  persist yet either.
- Recorded here rather than silently expanding scope or rushing a
  half-verified fauna change into this pass, per the repo's "no
  half-finished implementations" / "smallest correct change" rules.

### Suggested follow-up

A separate plan (or a Faza 4 continuation of this one) should: (1) decide
whether the existing `cave`/`wolfDen` habitat-spawner concept in
`fauna/createFauna.ts` should be repointed at real `CaveDefinition`s from
this plan, or kept as its own (renamed) surface-only concept to avoid the
naming collision; (2) extend `AnimalAgent`'s ground/collision queries with the
same `CaveGroundQuery`/`colliderActiveAtY` seams added here; (3) add the sparse
persistence fields once there's actual state to persist.

## 1. Cel

Wprowadzić deterministyczny system podziemnych jaskiń jako rzeczywistych, walk-in przestrzeni świata, z wejściami w zboczach, własnym floor/ceiling, kolizją, streamingiem i docelową integracją z fauną, lootem, questami i persistence.

Jaskinia nie jest osobnym światem ani drugim systemem terenu. Jest częścią tego samego świata i ma korzystać z istniejących mechanizmów tam, gdzie są odpowiednie.

### Zasady

- świat pozostaje niezależny od gracza;
- layout jaskiń jest deterministyczny z seeda;
- `CaveDefinition` nie zależy od Three.js, ChunkManagera, save ani runtime entities;
- runtime caves mają ten sam lifecycle co `WorldBundle`;
- nie tworzyć równoległego systemu collision, fauna, persistence ani inventory;
- surface nad jaskinią pozostaje surface — samo `x/z` nie przenosi encji pod ziemię;
- cave presentation jest streamowana, a nie bezwarunkowo tworzona dla całego świata;
- geometry, mesh i runtime state są pochodnymi danych świata i nie są zapisywane jako save state.

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
CaveRuntime / cave subsystem
  ├─ streamed visual representation
  ├─ cave collision
  ├─ cave floor queries
  └─ cave integrations
        ↓
existing world systems
  ├─ ChunkManager / terrain
  ├─ collision registry
  ├─ AnimalSpawner / AnimalAgent
  ├─ ItemKind / ItemInstance
  └─ SaveData
```

`CaveDefinition` jest czystą definicją przestrzeni. Nie posiada sceny, meshów, colliderów ani referencji do runtime entities.

`CaveRuntime` zarządza tylko runtime/lifecycle potrzebnym do prezentacji i integracji aktualnie istotnych caves.

---

## 3. Stan istniejącego kodu i migracja

Obecny `createLargeCaves()` jest world-scale mechanizmem tworzonym z `createWorldBundle()`. Wybiera `LargeCaveSite`, modyfikuje terrain przez `ChunkManager.modifyTerrain()` i od razu tworzy wizualizację. To rozwiązanie należy zastąpić nowym subsystemem, a nie utrzymywać równolegle.

`WorldBundle` jest właścicielem lifecycle systemów świata. Cave subsystem musi być tworzony, dispose'owany i odbudowywany razem z bundle:

```text
createWorldBundle()
  → create caves

rebuildWorldBundle()
  → dispose old caves
  → create new caves

disposeWorldBundle()
  → dispose caves
```

Nie wolno przechowywać starego `ChunkManager`, starego `WorldContext` ani starych runtime references po rebuildzie.

Docelowo:

- `largeCaves` zostaje zastąpione przez `caves`;
- `largeCaves.ts`, `createLargeCaves.ts` i `largeCaveVisual.ts` są usuwane lub redukowane do zgodnych helperów tylko wtedy, gdy nadal są potrzebne;
- nie pozostawiać dwóch niezależnych mechanizmów jaskiń.

---

## 4. Cave identity i deterministyczny generator

Każda jaskinia musi mieć stabilne `caveId`, wynikające deterministycznie z seeda i world/grid coordinate. Nie używać indeksu w tablicy jako tożsamości.

Generator powinien działać w większej siatce world-scale, niezależnej od gridu chunków. Kandydaci są odrzucani m.in. na podstawie:

- wody / coast;
- wysokości i nadkładu;
- mountain ridge / nachylenia;
- settlement footprint;
- road corridors;
- innych istniejących world samplers dostępnych przez `ChunkManager`.

V1 generatora:

```text
entrance → tunnel → 1–2 chambers → dead end / small branch
```

Model danych powinien jednak umożliwiać późniejsze junctions, większe branching i różne typy caves bez zmiany podstawowego kontraktu.

### Ważne

Nie projektować pełnego proceduralnego systemu dungeonów. Najpierw stabilna przestrzeń walk-in i deterministyczne placement.

---

## 5. Faza 0 — generator spike

Przed implementacją wizualizacji przygotować tani spike/statystyki generatora.

Sprawdzać co najmniej:

```text
candidate cells
mountain candidates
lowland candidates
accepted after overburden
accepted after water/coast
accepted after settlement exclusion
accepted after road exclusion
mean nearest-cave distance
```

Spike powinien działać na kilku seedach i pozwolić skalibrować gęstość bez tworzenia meshów.

V1 ma preferować wejścia w zboczach. Nie generować wejścia jako zwykłej dziury na płaskiej łące.

---

## 6. Faza 1 — CaveDefinition + WorldBundle lifecycle

Wprowadzić czyste typy definicji jaskini i generator.

Minimalny kontrakt powinien umożliwiać:

```ts
caveId
entrance
bounds
layout
sampleFloor(x, z)
contains(x, y, z)
```

`sampleFloor()` i `contains()` dotyczą przestrzeni jaskini, a nie surface heightmap.

Wpiąć subsystem w `WorldBundle` zgodnie z istniejącym lifecycle.

Nie tworzyć `CaveChunkManager`.

---

## 7. Faza 2 — Cave presentation i streaming

Zastąpić obecne terrain-carving-only podejście rzeczywistą przestrzenią underground.

### Surface

Surface terrain pozostaje ciągły nad tunelem. Poza wejściem jaskinia nie może być wycinana z heightmapy w sposób tworzący widoczną dziurę.

```text
surface heightmap
────────────────────────
       █████████
       █  cave  █
       █████████
```

Wejście jest jedynym normalnym połączeniem surface ↔ cave.

### Streaming

Deterministyczne metadata caves mogą istnieć globalnie, ale ciężka prezentacja powinna być tworzona tylko dla caves wymagających runtime.

Nie wykonywać globalnego skanu wszystkich caves co frame. Wykorzystać world/grid indexing:

```text
player position
  → relevant cave cells
  → candidate caves
  → bounds/distance test
  → activate/deactivate presentation
```

### Wizualizacja

- proceduralny mesh wnętrza;
- mouth może reuse istniejących rock assets;
- brak nowego GLB dla całego interioru;
- surface vegetation przy wejściu musi być kompatybilna z nową geometrią;
- wnętrze powinno mieć własny floor i ceiling.

---

## 8. Faza 3 — Movement, ground i collision

Player movement musi rozróżniać surface i cave.

```text
surface → existing sampleHeight
cave    → CaveVolume.sampleFloor
```

Samo `x/z` nad jaskinią nie wystarcza do zmiany ground provider. Encja znajdująca się na powierzchni nad tunelem nadal korzysta z surface.

### Collision

Rozszerzyć istniejący `world/collision.ts`. Nie tworzyć drugiego collision registry.

Obecny collider jest prostym obiektem indeksowanym spatialnie według pozycji/radius. Długie lub wieloczęściowe cave constraints nie mogą być naiwnie reprezentowane jednym punktem środka, jeśli przez to zapytanie ominie część bounds.

Implementacja musi:

- blokować wyjście przez ściany;
- umożliwiać ruch wewnątrz cave;
- poprawnie obsługiwać cały bounds constraint;
- mieć stabilny `ownerKey`;
- nie wymagać mesh/BVH jako podstawowego movement collision;
- pozostawać zgodna z istniejącym collision query/index.

Dokładny prymityw (`InteriorCapsule`, segmenty, bounds query lub inne rozwiązanie) pozostaje decyzją implementacji, o ile spełnia powyższy kontrakt.

### Acceptance

- wejście w zbocze działa;
- ściany blokują ruch;
- gracz nie przebija ceiling;
- kamera nie może wyjść nad surface;
- surface nad cave pozostaje nieprzechodnim sufitem od strony wnętrza poza wejściem.

---

## 9. Faza 4 — fauna, loot i persistence

### Fauna

Reuse istniejącego `PreySpawner` / `AnimalAgent` i spawn-point lifecycle.

Cave nie dostaje własnego fauna managera ani własnego lifecycle.

Istniejące pojęcia pozostają właścicielem stanu:

```text
PreySpawner
  id
  type = wolfDen
  lifecycle
  saved state

AnimalAgent
  runtime animal

CaveVolume
  physical space / floor query
```

Istniejący stabilny `wolfDen` identity/quest contract pozostaje używany.

Cave-bound animals muszą korzystać z cave floor/nav danych zamiast surface `sampleHeight`.

### Loot

Reuse istniejących `ItemKind`, `ItemInstance` i mechanizmów persistence. Nie tworzyć cave-specific inventory.

Jeżeli loot wymaga kontenera, można zintegrować istniejący/przyszły container mechanism, ale nie robić z niego dependency Planu 104.

### Persistence

Rozszerzać aktualny `SaveData` i jego migracje, a nie tworzyć osobny cave save.

Zapisywać tylko stan, którego nie da się odtworzyć z seeda, np.:

- odkrycie / progres cave;
- cleared/looted state, jeśli gameplay tego wymaga;
- niederywowalne item instances;
- istniejący spawn-point lifecycle.

Nie zapisywać:

- proceduralnego layoutu;
- meshów;
- colliderów;
- stream state;
- runtime animal state.

---

## 10. Integracja z istniejącymi systemami

| Potrzeba | Właściciel |
|---|---|
| terrain / surface | `ChunkManager` |
| terrain samplers | `ChunkManager` |
| cave placement inputs | istniejące world samplers / `ChunkManager` |
| collision | `world/collision.ts` |
| fauna lifecycle | `PreySpawner` / `AnimalAgent` |
| spawn persistence | istniejący `SaveData` spawn-point state |
| item identity/state | `ItemKind` / `ItemInstance` |
| world lifecycle | `WorldBundle` |
| streaming | istniejący world/chunk lifecycle |

**Nie tworzyć równoległego mechanizmu dla żadnej pozycji z tej tabeli.**

---

## 11. Assety

- mesh interioru: proceduralny;
- mouth: reuse istniejących rock assets;
- fauna: istniejące gatunki, bez nowego niedźwiedzia w tym planie;
- loot: istniejące itemy;
- SFX: opcjonalne, nie blocker v1;
- nie dodawać wpisów do MODELS/SOUNDS bez faktycznie nowych assetów.

---

## 12. Weryfikacja

### Techniczna

Po odpowiednich fazach:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

### Browser / manual

1. Generator daje wiarygodną gęstość na kilku seedach.
2. Wejścia znajdują się na zboczach, nie jako dziury na łąkach.
3. Przejście nad cave nie pokazuje dziury ani wnętrza.
4. Surface vegetation nad tunelem pozostaje surface vegetation.
5. Wejście działa jako surface ↔ cave transition.
6. 20–30 m pod dachem potrzebne jest światło/pochodnia.
7. Dzień za wejściem nie oświetla całej sali.
8. Kolizja ścian działa.
9. Gracz nie przebija ceiling ani nie wychodzi nad teren.
10. Save/reload daje identyczną geometrię z seeda.
11. Rebuild world nie pozostawia starego cave runtime.
12. Cave fauna porusza się po cave floor, a fauna surface nad tunelem pozostaje na surface.
13. Loot/progres przetrwa save/reload zgodnie z wymaganym stanem.
14. Duża cave może zawierać branch/chamber bez specjalnego systemu dungeonów.

Rozdzielać statusy:

- implemented;
- technically verified;
- browser-verified.

---

## 13. Zakres poza planem

Nie włączać do tego planu:

- pełnego dungeon generatora;
- multiplayer synchronization;
- nowego systemu inventory/container;
- nowego fauna lifecycle;
- nowego persistence framework;
- nowego collision engine;
- proceduralnego navmesh systemu dla całego świata.

---

## 14. Pliki

### Główne nowe / zmieniane

- `src/world/caveVolume.ts`
- `src/world/caveGenerator.ts`
- `src/world/caveMesh.ts`
- `src/world/createCaves.ts`
- `src/app/worldBundle.ts`
- `src/terrain/chunkManager.ts` — tylko jeśli wymagane do integracji/queries/streamingu
- `src/world/collision.ts` — rozszerzenie istniejącego mechanizmu
- `src/player/PlayerController.ts`
- `src/fauna/AnimalAgent.ts` / `src/fauna/createFauna.ts` — cave floor/nav integration
- `src/persistence/saveData.ts` — tylko wymagane rozszerzenie istniejącego schematu/migracji

### Testy

- `src/world/caveVolume.test.ts`
- `src/world/caveGenerator.test.ts`
- dodatkowe testy istniejących systemów tylko tam, gdzie kontrakt caves je rozszerza.

---

## 15. Gameplay observations — 2026-09-04

Manual gameplay revealed that the current cave implementation is not yet acceptable from a third-person gameplay perspective.

### Observations

- The camera frequently escapes the cave and reveals the surface grass from inside the cave.
- The tunnel looks like a set of connected pipes: seams between sections are visible and the surfaces are too smooth.
- The entrance is too narrow and too small.
- Overall, the current cave experience is poor and needs another geometry/presentation pass before the feature can be considered gameplay-ready.

### Reference / design reflection

A useful reference point is the cave design used in *World of Warcraft*. Its caves are designed around the fact that the player is viewed in third person: corridors and chambers are sufficiently large to accommodate both the character and the camera. Entrances are typically large openings in roughly vertical rock faces, followed by tunnels that gradually rise and fall rather than immediately becoming cramped horizontal pipes.

The important lesson for Seedvale is not to reproduce a specific game's geometry, but to treat **camera clearance and third-person readability as first-class constraints of cave generation**.

---

## 16. Gameplay-driven conclusions and suggested improvements

The current implementation should be improved rather than merely cosmetically patched. The cave generator and presentation need to produce a larger, more open spatial structure suitable for a third-person camera.

### 16.1 Entrance geometry

- Cave entrances must be significantly larger in both width and height.
- Entrances should preferably be placed in approximately vertical terrain faces / cliff-like slopes rather than in shallow terrain depressions.
- Cave placement should explicitly reserve a terrain area where the surface drops into a depression and one side forms a sufficiently steep cliff/rock face.
- The entrance should be carved as a wide, high opening in that face.
- The transition from surface into the cave should feel like entering a real opening in rock, not descending through a small hole.

Conceptually:

```text
          higher terrain
       █████████████
     ███           ███
    ██               ██
   ██   LARGE MOUTH   ███
  ██                   ███
  █                     █
  █        cave →       █
  █_____________________█
        lower ground
```

The exact terrain shaping mechanism should be determined from the existing terrain generation/modification system; do not introduce a parallel terrain system just for caves.

### 16.2 Cave scale and camera clearance

The tunnel dimensions need to be designed around the actual third-person camera, not merely around player-body clearance.

- Corridors and chambers must be substantially wider and higher than the minimum player collision envelope.
- The generator should maintain a deliberate clearance margin around the player and camera view volume.
- Tight passages where the camera can intersect the ceiling/walls should be rejected or widened during generation.
- Chambers should provide enough lateral and vertical space for the camera to frame the player without revealing the surface.

The target should be a cave that feels **walk-in for both the player and the camera**, not merely technically traversable by the player.

### 16.3 Tunnel topology and shape

The current pipe-like construction should be replaced or substantially improved.

- Avoid visually obvious joins between tunnel segments.
- Generate continuous geometry across neighbouring tunnel sections instead of treating each section as an independent tube where possible.
- Allow tunnels to gradually rise and fall.
- Introduce meaningful variation in width, height and cross-section.
- Chambers should be larger than connecting corridors and provide spatial landmarks.
- Avoid long, perfectly smooth cylindrical surfaces.

The generator should remain deterministic and lightweight; this does not require a full voxel/dungeon system.

### 16.4 Surface irregularity

Tunnel walls, ceiling and floor need controlled small-scale irregularity.

Use two levels of deformation:

- **micro bump:** approximately `0.5 × 0.5 × 0.5` m for small rock irregularities;
- **larger bump:** approximately `2 × 2 × 1` m on walls and ceiling, where the third value represents deformation depth.

These values are design targets, not necessarily literal mesh-grid dimensions. The implementation should use the existing procedural geometry approach or a suitable deterministic noise/deformation mechanism to achieve this visual scale without creating excessive geometry.

The floor should remain traversable and avoid random deformation that produces problematic collision, while walls and ceiling can receive stronger variation.

### 16.5 Camera containment

Camera behaviour needs a dedicated correction pass.

The camera must remain visually and physically consistent with the cave space when the player is underground:

- prevent the third-person camera from clipping through cave walls/ceiling into the surface;
- prevent surface grass/terrain from becoming visible through the camera position or camera ray when the player is inside;
- account for cave geometry when resolving camera distance/position;
- preserve the existing surface camera behaviour outside caves;
- avoid a cave-specific camera system if the existing camera collision/obstruction mechanism can be extended.

This should be treated as a camera-obstruction/clearance problem, not solved by simply hiding surface terrain globally.

### 16.6 Generator changes

The cave generation mechanism likely needs a structural improvement rather than only larger constants.

Before implementation, inspect the current `caveGenerator.ts` and `caveMesh.ts` together and determine whether the present tunnel representation inherently produces the visible pipe/seam problem. If necessary, change the representation so that tunnel segments are blended into a continuous volume/mesh.

The generator should explicitly model at least:

```text
entrance
  ↓
wide transition
  ↓
large walk-in corridor
  ↘ gradual elevation changes
  ↓
large chamber
  ↓
branch / continuation / dead end
```

Generation constraints should include minimum width, minimum height, camera clearance, entrance dimensions, slope/vertical-face suitability and sufficient surface overburden.

### 16.7 Acceptance additions

The existing verification list should be extended with gameplay-specific checks:

15. The player can enter the cave without crouching-scale geometry or camera compression.
16. The entrance is visibly large and placed in a steep/approximately vertical rock face.
17. The third-person camera remains inside the cave when following the player through normal movement.
18. Surface grass/terrain is not visible from the cave because of camera escape or insufficient cave geometry.
19. Tunnel walls, ceiling and floor do not look like smooth connected pipes.
20. No obvious seams are visible between tunnel sections from normal gameplay camera positions.
21. Tunnels contain gradual vertical variation rather than remaining flat.
22. Chambers provide substantially more space than corridors.
23. Walls and ceiling have visible multi-scale rock irregularity without excessive visual noise.
24. Camera clearance is preserved throughout generated tunnels and chambers across several seeds.
25. Existing surface camera behaviour remains unchanged outside caves.

These gameplay criteria should be treated as blockers for marking the cave feature browser/gameplay-verified.

---

## 17. Scope / implementation note

The gameplay findings indicate that the current Faza 2-3 result should **not** be considered final merely because the technical contracts and automated tests pass. The next implementation pass should focus first on cave spatial design, procedural geometry and camera containment, then repeat browser verification before proceeding with Faza 4 fauna/loot/persistence.

Do not implement fauna/loot/persistence on top of cave geometry that is still fundamentally unsuitable for third-person gameplay.

**Zrób git commit i push do main, rebase jeżeli trzeba**
