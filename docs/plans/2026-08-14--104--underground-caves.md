# Plan: Underground Caves

**Created:** 2026-08-14  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** XL  
**Depends on:** ~~097~~ ~~125~~

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

### Migracja

Do usunięcia lub redukcji po udanej migracji:

- `largeCaves.ts`
- `createLargeCaves.ts`
- `largeCaveVisual.ts`

Nie usuwać starych plików przed pełnym zastąpieniem ich użycia.

---

## 15. Instrukcja implementacji

Przed implementacją ponownie zweryfikować aktualne sygnatury i kontrakty w repozytorium. `updated-review.md` jest materiałem pomocniczym; jeśli różni się od kodu, kod jest źródłem prawdy.

Implementować inkrementalnie od generatora i danych, przez lifecycle/streaming, następnie movement/collision i dopiero fauna/loot/persistence.

Nie implementować równoległych systemów tylko dlatego, że obecny mechanizm ma ograniczenia. Najpierw rozszerzyć istniejący mechanizm, jeśli jego ownership nadal pasuje.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
