# Plan: Naturalne elementy świata i proste interakcje (głazy, pnie, zbieralna flora, ogniska)

**Status:** `done` — zaimplementowane i zweryfikowane.
**Created:** 2026-08-07
**Priority:** niski/średni — kosmetyczne wypełnienie świata, nie blokuje ani nie jest blokowany przez inne kolejkowane plany. Naturalna kontynuacja [world-visual-overhaul](../2026-08-07--024--world-visual-overhaul.md) i [biome-regions](./2026-08-07--028--biome-regions.md) (reużywa te same makro-osie do doboru preferencji środowiskowych) oraz [quests-v2-world-interactions](./2026-08-07--018--quests-v2-world-interactions.md) (reużywa mechanizm zbieralnych przedmiotów).

## Skąd to się wzięło

Szkic od ChatGPT (poniżej, zachowany w całości jako źródło wymagań) opisujący dekoracyjne i zbieralne elementy świata. Ta sekcja planu tłumaczy go na konkretną architekturę zgodną z istniejącym pipeline'em (`src/terrain/chunkVegetation.ts` / `chunkItems.ts` / `chunkManager.ts`), bez wprowadzania równoległych systemów.

## Cel

Świat ma dziś teren + wodę + roślinność (drzewa/krzewy/kaktusy/trzciny) + dwa zbieralne przedmioty (muszla, kamień). Brakuje "śmieci" i śladów obecności — głazów, powalonych pni, drobnej zbieralnej flory (grzyby, kwiaty, gałęzie, szyszki) i pojedynczych punktów "ktoś tu był" (stare ognisko). Cel: dodać je **małym kosztem**, rozszerzając dwa istniejące systemy zamiast budować nowe:

1. **Dekoracje** (głazy, kamienne klastry, powalone pnie, ogniska) → nowy moduł-bliźniak `chunkVegetation.ts`, bo mają identyczny kształt problemu (deterministyczna placement per chunk, worker-safe, main-thread instancja meshy) ale różną logikę preferencji i nie są kolekcjonowalne.
2. **Zbieralna flora** (gałęzie, grzyby, kwiaty, szyszki/żołędzie) → rozszerzenie istniejącego `chunkItems.ts` / `ItemKind` (`src/items/items.ts`) o nowe warianty, bez zmiany architektury zbierania — `Inventory`, HUD, drop `[G]`, save/load i quest `gather_item` już operują generycznie na `ItemKind`/`ITEM_DEFS`, więc nowe rodzaje przedmiotów **nie wymagają zmian** w tamtych plikach.

Krzaki (`bush`) z draftu ChatGPT **już istnieją** jako `VegetationPlacement.kind === 'bush'` (`chunkVegetation.ts`) — nic nowego do zrobienia poza ew. dostrojeniem gęstości, nie w zakresie tego planu.

## Architektura

```
Chunk (worker: chunkHeightmap.worker.ts)
├── Terrain (heightmap)           — computeChunkTile
├── Vegetation (drzewa/krzewy/…)  — computeChunkVegetation   [istniejące]
├── Items (zbieralne)             — computeChunkItems        [rozszerzone]
│   └── + branch / mushroom / flower / cone
└── Environment (dekoracje)       — computeChunkEnvironment  [nowe]
    ├── largeRock
    ├── rockCluster (małe kamienie, grupowo)
    ├── fallenLog
    └── campfire
```

Wszystkie cztery funkcje są czyste, worker-safe (żadna nie dotyka `THREE`/GLTF), wywoływane w `chunkHeightmap.worker.ts`, zwracają płaskie dane pozycji. Main thread (`chunkManager.ts`) zamienia je na obiekty — dokładnie ten sam podział jak dziś dla roślinności/przedmiotów.

**Determinizm:** każda z trzech funkcji (`computeChunkVegetation`/`computeChunkItems`/`computeChunkEnvironment`) używa własnego `createSeededRandom(params.seed ^ hashChunk(cx, cz) ^ <sól>)` — różne sole, żeby strumienie losowości się nie pokrywały. Ponowne załadowanie chunka (streaming in/out) daje identyczne wyniki, bo wejście to wyłącznie `(seed, cx, cz, tile grids)`.

**Przekazanie `vegetation` do `computeChunkItems`/`computeChunkEnvironment`:** gałęzie/szyszki (blisko drzew) i powalone pnie (tereny leśne) potrzebują wiedzieć "czy w pobliżu jest drzewo". `chunkHeightmap.worker.ts` już liczy `vegetation` przed `items` — wystarczy przekazać tę samą tablicę dalej jako parametr (tylko przybliżenie w obrębie własnego chunka, nie sąsiadów — wystarczające, tak samo jak dziś `chunkItems.ts` nie widzi sąsiednich chunków).

## Nowy moduł: `src/terrain/chunkEnvironment.ts`

Wzorzec 1:1 z `chunkVegetation.ts`/`chunkItems.ts`:

```ts
export type EnvironmentKind = 'largeRock' | 'rockCluster' | 'fallenLog' | 'campfire'
export type EnvironmentPlacement = {
  x: number; z: number; kind: EnvironmentKind
  scale: number; rotationY: number
  /** Znaczenie zależy od `kind`: nieregularność bryły (rock), długość pnia
   *  (fallenLog), nieużywane (campfire) — patrz `props.ts`. */
  variant: number
}
export function computeChunkEnvironment(
  coord: ChunkCoord, tile: ChunkTileData, params: ChunkTileParams,
  vegetation: readonly VegetationPlacement[],
): EnvironmentPlacement[]
```

Preferencje (prawdopodobieństwo, nie twardy gate — zgodnie z zasadą z draftu):

- **`largeRock` / `rockCluster`** — `chance = 0.08 + ridge * 0.55 + (coastal ? 0.2 : 0)` (reużywa `tile.mountainRidge` i pasmo `oceanThreshold..coastThreshold` z `chunkItems.ts`'s shell logic), odrzucone na stromiźnie tolerancyjniej niż roślinność (`SLOPE_REJECT` wyższy — kamienie *lubią* nierówny teren). Duży głaz vs. mały klaster kamieni — waga `isLarge` rośnie z `ridge` (duże głazy głównie w górach, drobne kamienie wszędzie tam gdzie jakiekolwiek kamienie).
- **`fallenLog`** — tylko tam gdzie `biomeWeightsAt(...).forest` jest wysoki (reużycie z [biome-regions](./2026-08-07--028--biome-regions.md)), płaski teren (`SLOPE_REJECT` niski, jak roślinność), wyższa szansa gdy `nearTree(vegetation, ...)` == true.
- **`campfire`** — bardzo rzadkie (pojedynczy kandydat na chunk, próg ~3.5%), płaski teren, nie na drodze (`tile.roadTint`). Czysto dekoracyjne w tej iteracji (patrz "Poza zakresem").

Skip na `params.isHomeChunk` (jak roślinność/przedmioty — osada ma własny bespoke layout).

## Nowe propsy: `src/settlement/props.ts`

Proceduralne, bez GLB (te kształty nie potrzebują wysokiej jakości modeli, zgodnie z draftem "bez tworzenia nowych, wysokiej jakości modeli 3D"):

- `createLargeRock(scale, variant)` — `IcosahedronGeometry` z nierównomiernym skalowaniem per-oś wyliczonym z `variant` (deterministyczne, nie `Math.random()` — w przeciwieństwie do `createReed()`, które dziś używa `Math.random()` i jest jedynym wizualnie niedeterministycznym propsem w kodzie; nowe propsy tego nie powtarzają).
- `createRockCluster(scale, variant)` — 3–5 małych `DodecahedronGeometry` (ten sam kształt co zbieralny `stone` z `items.ts`, większy o rozmiar, po prostu reużycie wizualne) rozrzuconych trygonometrycznie wokół origin z `variant`.
- `createFallenLog(scale, length)` — leżący `CylinderGeometry`, materiał koloru pnia (reużycie palety z `createTree`).
- `createCampfire(scale)` — grupa: krąg 8 małych kamieni (`DodecahedronGeometry`) + płaski dysk popiołu (`CircleGeometry`, ciemny) + 2–3 gałęzie (`CylinderGeometry`) na wierzchu.

## Rozszerzenie zbieralnych: `src/items/items.ts` + `src/terrain/chunkItems.ts`

**`items.ts`:** `ItemKind` += `'branch' | 'mushroom' | 'flower' | 'cone'`, wpisy w `ITEM_DEFS` (etykieta + kolor), nowe gałęzie w `createItemMesh` (proste kształty w stylu istniejącego `shell`/`stone`: gałąź = cylinder, grzyb = łodyga+czapka, kwiat = łodyga+bryła, szyszka/żołądź = stożek).

**`chunkItems.ts`:** druga, niezależna pętla kandydatów (własny seedowany RNG, osobna sól, id-prefiks `f<i>` żeby nie kolidować z istniejącymi id `shell`/`stone` — save'y trzymają tylko zbiór zebranych id, więc nowy prefiks nie inwaliduje starych zapisów). Dla każdego kandydata liczone są wagi per rodzaj (nie hard-switch):

```
mushroomWeight = (swamp*0.7 + forest*0.35 + moistureRegion*0.15) * (nearTree ? 1.3 : 0.8)
flowerWeight   = (1-desert) * (1-swamp) * (1-ridge) * (altitude < 0.45 ? 1 : 0.3)
branchWeight   = nearTree ? 0.9 : forest*0.25
coneWeight     = nearTree ? forest*0.85 : 0
```

(`desert`/`swamp`/`forest` z `biomeWeightsAt` — [biome-regions](./2026-08-07--028--biome-regions.md); `nearTree` = najbliższe `VegetationPlacement.kind === 'tree'` w promieniu ~7 jednostek w tym samym chunku.) Ważona ruletka wybiera rodzaj spośród niezerowych wag, całościowa suma wag dodatkowo bramkuje szansę wystąpienia (rzadkość, nie zaśmiecenie — analogicznie do dzisiejszego `KEEP_CHANCE` dla `shell`/`stone`). Slope/water reject identyczne jak dla `shell`/`stone`.

Sygnatura `computeChunkItems` zyskuje 4. parametr `vegetation: readonly VegetationPlacement[]` (worker.ts przekazuje wynik `computeChunkVegetation`, już policzony wcześniej w tej samej funkcji).

## Worker + chunkManager

- **`chunkHeightmapProtocol.ts`:** `ChunkTileResult` += `environment: EnvironmentPlacement[]`.
- **`chunkHeightmap.worker.ts`:** `computeChunkEnvironment(coord, tile, params, vegetation)` obok istniejących wywołań, `vegetation` przekazane też do `computeChunkItems`.
- **`chunkManager.ts`:** nowy blok (obok istniejącego `tile.items.length > 0` bloku) budujący `THREE.Group` z propsów przez switch po `EnvironmentKind` → `createLargeRock`/`createRockCluster`/`createFallenLog`/`createCampfire`, `placeOnGround` jak roślinność/przedmioty. **Synchroniczne** (bez `await` — propsy proceduralne, nie GLB, więc żadnego odpowiednika `getTreeTemplates()` do czekania). `ChunkRecord.environment?: THREE.Group`, dispose w `unload()` tak jak `record.vegetation`/`record.items`.

## Interakcja

Zbieralna flora korzysta z **istniejącego** mechanizmu `Interactable` (`kind: 'item'`) bez żadnych zmian w `src/interaction/` czy `app/createApp.ts` — `buildInteractables` już iteruje `chunkManager.getNearbyItems(...)` generycznie po `ItemKind`, prompt `Podnieś: ${ITEM_DEFS[item.kind].label}` już czyta etykietę z `ITEM_DEFS`. Drop `[G]` (`Object.keys(ITEM_DEFS) as ItemKind[]`) też automatycznie obejmie nowe rodzaje — jedyna drobna korekta: kąt rozstawienia upuszczanych przedmiotów (`(Math.PI*2)/3`, zakładający 3 rodzaje) przeliczony na `Object.keys(ITEM_DEFS).length`, żeby przy 6 rodzajach nie nakładały się wizualnie.

Dekoracje (głazy, pnie, ogniska) **nie są** `Interactable` w tej iteracji — czysto wizualne, jak roślinność.

## Poza zakresem (zgodnie z draftem)

- Nowe wysokoJakościowe modele 3D (GLB) dla głazów/pni/ognisk — proceduralne prymitywy wystarczą, tak jak `createTree`/`createBush` jako fallback.
- Pełne inventory/crafting/ekonomia — zbieranie tylko dokłada do istniejącego `Inventory`/HUD.
- Narzędzia do zbierania, niszczenie głazów/pni.
- Interakcja z ogniskiem (nawet prosta linia dialogowa) — celowo czysto dekoracyjne teraz, żeby nie dotykać `QuestManager`/`Interactable` union bez potrzeby. Naturalny follow-up później (np. `interact_campfire` obok `interact_well`/`interact_tree`).
- GUI/config knobs (gęstość dekoracji/flory) — gęstości jako stałe modułowe (`*_CANDIDATES_PER_CHUNK`), tak jak dziś w `chunkVegetation.ts`/`chunkItems.ts`. Jeśli po weryfikacji wizualnej okaże się za gęsto/rzadko, korekta stałych, nie nowy GUI panel.
- Rozbudowany system biomów — reużycie istniejącego `biomeWeightsAt`, żadnych nowych osi.

## Weryfikacja (po implementacji)

- `npx tsc --noEmit`, `npm run lint`, `npm run build` — brak błędów.
- `npm run dev` → wizualna inspekcja na kilku seedach (użytkownik w przeglądarce, zgodnie z zasadą projektu — brak headless testów):
  - głazy/kamienne klastry częstsze w górach i na wybrzeżu, rzadsze na równinach
  - powalone pnie głównie w lesie, blisko drzew
  - grzyby/kwiaty/gałęzie/szyszki zbieralne przez `[E]`, trafiają do ekwipunku (HUD), da się je upuścić `[G]`
  - stare ogniska rzadkie, sensowna kompozycja (krąg kamieni + popiół + gałęzie)
  - brak nakładania się na osadę/wodę/strome zbocza
  - save/load: zebrane przedmioty flory zostają zebrane po `Continue`

## Powiązane

- [biome-regions](./2026-08-07--028--biome-regions.md) — źródło `biomeWeightsAt`/`moistureRegion` reużywane do preferencji środowiskowych
- [quests-v2-world-interactions](./2026-08-07--018--quests-v2-world-interactions.md) — źródło mechanizmu zbieralnych przedmiotów (`ItemKind`/`chunkItems.ts`/`Inventory`) rozszerzanego tu
- [world-visual-overhaul](../2026-08-07--024--world-visual-overhaul.md) — kierunek "mniej pusty świat", ten plan to jego kontynuacja
- `src/terrain/chunkVegetation.ts`, `src/terrain/chunkItems.ts`, `src/terrain/chunkEnvironment.ts` (nowy), `src/settlement/props.ts`, `src/terrain/chunkManager.ts`, `src/items/items.ts`

---

## Załącznik: oryginalny szkic (ChatGPT)

> Szkic od ChatGPT

# Plan: Naturalne elementy świata i proste interakcje

**Status:** `planned`
**Scope:** rozszerzenie proceduralnego świata o proste elementy środowiska, część z nich interaktywna/zbieralna.

## Cel

Sprawić, żeby proceduralny świat Seedvale był mniej pusty i bardziej naturalny — bez potrzeby tworzenia nowych, specjalistycznych modeli 3D.

Elementy powinny być generowane deterministycznie per chunk i zależeć od seed'a, terenu oraz lokalnego środowiska.

## Elementy świata

### Dekoracyjne

- **Duże głazy** — nieregularne bryły z istniejącej/prostej geometrii, różne rozmiary/rotacje/proporcje, pojedynczo lub w małych grupach.
- **Małe kamienie** — istniejący typ zbieralnego kamienia może zostać wykorzystany również jako dekoracja, pojedynczo i w małych skupiskach.
- **Powalone pnie** — prosta geometria cylindra/bryły, różne długości i orientacje, mogą wykorzystywać istniejące materiały drzew.
- **Krzaki / kępki roślinności** — wykorzystanie istniejących elementów roślinności, różne rozmiary i zagęszczenie.

### Interaktywne / zbieralne

Rozszerzyć istniejący mechanizm zbierania muszli i kamieni o: gałęzie, grzyby, dzikie kwiaty, szyszki/żołędzie. Na tym etapie nie tworzyć pełnego systemu inventory/craftingu — obsłużyć istniejącym mechanizmem collection/interactions.

## Preferencje środowiskowe

Elementy nie powinny być rozmieszczane całkowicie losowo. Każdy typ obiektu może mieć preferencje względem terenu i środowiska (nie twarde ograniczenia — zwiększenie naturalności):

- **Kamienie/głazy** — większa szansa w górach, na terenach skalistych, blisko morza/wybrzeża; mniejsza na równinach.
- **Grzyby** — większa szansa na bagnach, w wilgotnych miejscach, w lesie; mniejsza na suchych, otwartych terenach.
- **Kwiaty** — większa szansa na łąkach, na otwartych/nasłonecznionych terenach; mniejsza na skalistym terenie.
- **Gałęzie** — większa szansa w lesie, blisko drzew, blisko powalonych pni.
- **Szyszki/żołędzie** — większa szansa blisko odpowiednich drzew.
- **Powalone pnie** — przede wszystkim tereny leśne, blisko skupisk drzew.
- **Krzaki** — większa szansa na terenach z odpowiednią roślinnością.

### Zasada

Preferencje wpływają na prawdopodobieństwo wystąpienia, niekoniecznie całkowicie blokują obiekt. Pojedynczy kamień może pojawić się na łące, ale duże skupiska głównie w górach/na wybrzeżu.

## Element specjalny: stare ogniska

Proceduralne pozostałości po ogniskach: niewielki krąg kamieni, popiół/ciemna plama, opcjonalnie kilka gałęzi w pobliżu. Nie musi być aktywną mechaniką — ma tworzyć wrażenie, że ktoś wcześniej był w tym miejscu. W przyszłości może stać się punktem interakcji/questów.

## Generowanie

```text
Chunk
├── Terrain
├── Water
├── Vegetation
└── Environment
    ├── Large rocks
    ├── Small rocks
    ├── Fallen logs
    ├── Bushes
    ├── Collectibles
    │   ├── Branches
    │   ├── Mushrooms
    │   ├── Flowers
    │   └── Acorns / cones
    └── Old campfires
```

Generowanie zależy od: world seed, współrzędnych chunka, lokalnej pozycji, warunków terenu. Ponowne załadowanie chunka generuje dokładnie te same elementy.

## Rozmieszczenie

Unikać całkowicie losowego "sprinklowania" obiektów. Proste reguły: głazy pojedynczo/małe grupy, kamienie częściej lokalnie, pnie głównie w lesie, grzyby w wilgotnych miejscach, kwiaty na łąkach/otwartych terenach, gałęzie w okolicy drzew/pni, szyszki/żołędzie blisko odpowiednich drzew, ogniska rzadkie i celowo rozmieszczone. Respektować wodę, strome zbocza, zabudowę osady, istniejącą roślinność, inne obiekty.

## Interakcja

```text
[E] Zbierz grzyba
[E] Zbierz gałąź
[E] Zbierz kwiat
[E] Zbierz szyszkę
```

Po zebraniu: obiekt usunięty ze świata, istniejący mechanizm collection dostaje informację o zebranym elemencie, późniejsze inventory może wykorzystać te same typy przedmiotów. Bez craftingu/rozbudowanego inventory.

## Architektura

Rozszerzać istniejące systemy zamiast tworzyć osobne mechanizmy per element:

```text
EnvironmentObject
├── decorative
└── collectible
```

Zbieralny element ma wspólną definicję typu/interakcji/zachowania po zebraniu. Preferencje środowiskowe jako dane typu obiektu, nie osobna logika per przypadek:

```text
Mushroom
├── collectible: true
├── preferredTerrain: swamp
├── preferredEnvironment: wet
└── spawnWeight: ...
```

Bez rozbudowanego systemu biome'ów na tym etapie — wykorzystać istniejące informacje o terenie/środowisku.

## MVP

1. duże głazy
2. małe kamienie
3. powalone pnie
4. gałęzie
5. grzyby
6. dzikie kwiaty
7. szyszki/żołędzie
8. stare ogniska
9. preferencje środowiskowe dla poszczególnych elementów
10. integracja z istniejącym zbieraniem muszli i kamieni
11. deterministyczne generowanie per chunk
12. respektowanie istniejących obiektów i terenu

### Poza zakresem

- nowe wysokiej jakości modele 3D
- pełne inventory
- crafting
- ekonomia przedmiotów
- narzędzia potrzebne do zbierania
- niszczenie głazów/pni
- skomplikowane interakcje z ogniskami
- rozbudowany system biome'ów

## Główna zasada

Małym kosztem zwiększyć wrażenie naturalnego, żyjącego świata. Elementy powinny nie tylko pojawiać się losowo, ale mieć naturalne tendencje zależne od miejsca. Nowe mechanizmy rozszerzają istniejące systemy zamiast tworzyć niezależne wyspy funkcjonalności. W przyszłości ten sam fundament może obsłużyć: grzyby różnych typów, kwiaty, zioła, jagody, ślady zwierząt, kości, ruiny, stare narzędzia, skrzynki, pozostałości po mieszkańcach.
