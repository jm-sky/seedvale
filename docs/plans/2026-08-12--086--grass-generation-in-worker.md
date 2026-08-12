# Plan: Generacja trawy w workerze (review 005, pozycja 14 / A4a)

**Status:** `planned`
**Created:** 2026-08-12
**Priority:** 🟡 medium
**Effort:** L
**Depends on:** ~~006~~ (worker pool), ~~008~~ (grass rendering — fazy 1–4), ~~review 005 poz. 0~~ (instrumentacja `renderer.info` + simulate/render split — jest w `createDebugGui.ts:578-607`)
**Źródło:** [reviews/2026-08-12--005--performance-architecture-and-assets.md](../reviews/2026-08-12--005--performance-architecture-and-assets.md) — finding **A4(a)**, pozycja **14** w tabeli kolejności. Domyka też fazę 5 planu [008](./2026-08-07--008--grass-rendering.md), odłożoną wtedy jako **Should** bez zmierzonego bottlenecku.

**Twarde ograniczenie (z zlecenia review):** zero regresji wizualnej. Layout trawy ma zostać **bit w bit** taki sam — plan opiera się na tym, że da się to zweryfikować mechanicznie (patrz Faza 0).

---

## 1. Stan faktyczny (zweryfikowany w kodzie, nie z planu 008)

### Co się dziś dzieje i gdzie

- `grass.ts:572` `createChunkGrass()` — cała generacja pozycji jest **synchroniczna na main threadzie**, wywoływana z `chunkManager.ts:432` `ensureGrass()`, czyli wewnątrz `.then()` po odebraniu tile'a z workera (`chunkManager.ts:543`) albo z `syncGrassForRecord()` (`chunkManager.ts:461`) przy przekroczeniu progu ruchu.
- Praca na chunk przy domyślnym `density: 120000` (`worldConfig.ts`):
  - pętla główna `grass.ts:604` — 120 000 kandydatów,
  - pętla filler `grass.ts:723` — `120000 × FILLER_CANDIDATE_RATIO (0.28)` = 33 600,
  - każdy kandydat: 1–9 wywołań `sampleApronGrid` (wysokość, sandBand, roadTint, ridge, 4× slope, moisture, moistureRegion) + `fbm01` (2 oktawy) dla tych, które przeszły testy.
- Efektywny promień trawy to `min(config.grass.radius, loadRadius)` = 2 → 5×5 = **25 chunków** z trawą; przy przekroczeniu granicy chunka odświeża się ich kilka naraz.

### Alokacje — mierzalny, osobny problem

`createBucket(capacity)` (`grass.ts:467`) alokuje `Float32Array(capacity * 16)` **z góry, na pełną liczbę kandydatów**, po jednym buckecie na `tri`/`grain`/`herb` plus filler:

```text
3 × 120 000 × 16 × 4 B  = 23,04 MB
1 ×  33 600 × 16 × 4 B  =  2,15 MB
                        ≈ 25,2 MB tranzytowo na KAŻDY zbudowany chunk trawy
```

Do tego `phases`/`baseColors`/`tipColors`/`windFactors` to zwykłe `number[]` (`grass.ts:471-474`), rosnące `push`-ami — kolejne setki KB pod GC na chunk. To nie jest część findingu A4a, ale siedzi w tej samej funkcji i znika przy okazji przepisania (Faza 2).

### Dlaczego to jest kandydat do workera, a nie do „poprawienia w miejscu"

Zgodnie z [performance-and-workers.md](../architecture/performance-and-workers.md): praca jest CPU-heavy, czysto danowa (`Float32Array` in → `Float32Array` out), batchowalna i **nie musi być dostępna natychmiast** (trawa może pojawić się kilka klatek później — histereza `radius`/`radius+1` już istnieje właśnie po to, żeby granica nie migotała). Worker pool już istnieje i już zwraca `vegetation`/`items`/`environment` jako czyste dane.

### Co jest już bezpieczne (i dlaczego to warunek konieczny)

- **Determinizm.** `createSeededRandom` (`world/parseSeed.ts:2`) to mulberry32 — czysta arytmetyka 32-bit, identyczna w workerze. Ziarno: `seed ^ hashChunk(cx, cz) ^ 0x9f2c3b` (`grass.ts:589`).
- **Testy nie konsumują RNG** — świadomie, z komentarzem (`grass.ts:624-632`). To jest warunek, żeby kolejność sampli i przeniesienie wątku niczego nie przesunęły.
- **Zależności są już worker-safe:** `biomeWeightsAt` (`biomeRegions.ts`) i `sampleApronGrid` (`chunkHeightmap.ts`) są już importowane przez `chunkHeightmap.worker.ts` przez `chunkVegetation.ts`. `sandBandAt` (`biomeColors.ts:47`) i `fbm01` (`fbm.ts`) są czystymi funkcjami bez DOM.
- **`three` jest już w bundlu workera** — `chunkHeightmap.ts:2` i `biomeRegions.ts:1` importują `MathUtils`, `biomeColors.ts:2` importuje `Color`. Zbudowany worker to dziś `dist/assets/chunkHeightmap.worker-*.js` = **21 KB**, czyli tree-shaking działa. Dołożenie `Matrix4`/`Quaternion`/`Vector3` to rząd kilkunastu–kilkudziesięciu KB, jednorazowo, poza głównym bundlem.
- **`THREE.Color.getHSL/setHSL`** (`grass.ts:553-564`) zachowa się w workerze identycznie: nic w `src/` nie dotyka `ColorManagement` (sprawdzone grepem — jedyne ustawienia kolorystyczne to `renderer.toneMapping` w `createRenderer.ts:22`, po stronie renderera).
- **`speciesNoiseFor`** (`grass.ts:893`) — `createNoise2D(createSeededRandom(seed ^ 0x6a09e667))`; ta sama funkcja losowa daje tę samą tablicę permutacji, więc handle odtworzony w workerze jest identyczny. Cache per seed, dokładnie jak `noiseFieldsFor` w `chunkVegetation.ts:72`.

**Jedyna realna przeszkoda architektoniczna:** worker **oddaje** siatki tile'a jako transferable (`chunkHeightmap.worker.ts:49-58`), więc po odesłaniu wyniku nie ma ich już u siebie. Trawa liczona w osobnym zleceniu musi dostać siatki z powrotem — patrz §3.

---

## 2. Dlaczego nie „doklejone do zlecenia tile'a"

Naturalny odruch to policzyć trawę przy okazji tile'a i uniknąć drugiego round-tripu. To **nie działa** dla realnego wzorca ruchu:

- Chunki wchodzą do `loadQueue` na **zewnętrznym pierścieniu** (`chebyshevDistance == loadRadius == 3`), a trawa jest potrzebna dopiero przy `dist <= 2`. W momencie zlecenia tile'a chunk prawie nigdy nie kwalifikuje się do trawy.
- Gdyby liczyć trawę dla wszystkich chunków „na zapas": 49 chunków zamiast 25 (≈ +96% pracy i pamięci), z czego prawie połowa nigdy nie zostanie użyta.
- Zmiana `config.grass.density` z GUI musiałaby przeliczać wszystko przez pełny rebuild świata zamiast przez samą trawę.

Dlatego: **osobne zlecenie `grass`, na tym samym poolu.**

---

## 3. Projekt

### 3.1 Nowy moduł: `src/terrain/grassPlacement.ts` (czysty, worker-safe)

Wycięte **bez zmian logiki** z `grass.ts:572-790` (obie pętle + `pushInstance`), z podmienionym tylko sposobem zapisu wyników.

```ts
export type GrassSpeciesId = 'tri' | 'grain' | 'herb' | 'filler'

/** Wejściowe siatki apronowe — podzbiór `ChunkTileData` faktycznie czytany
 *  przez generację trawy (5 z 8 siatek tile'a). */
export type GrassTileGrids = {
  heights: Float32Array
  biomes: Float32Array
  roadTint: Float32Array
  mountainRidge: Float32Array
  moistureRegion: Float32Array
}

export type GrassBucketData = {
  count: number
  matrices: Float32Array    // count * 16
  phases: Float32Array      // count
  baseColors: Float32Array  // count * 3
  tipColors: Float32Array   // count * 3
  windFactors: Float32Array // count
}

export type GrassChunkData = Partial<Record<GrassSpeciesId, GrassBucketData>>

export function computeChunkGrass(
  params: GrassComputeParams,   // cx, cz, chunkSize, resolution, waterLevel,
  grids: GrassTileGrids,        // heightScale, seed, candidatesPerChunk, region
): GrassChunkData
```

`grass.ts` zostaje właścicielem prezentacji: szablonów `buildFinCluster`, współdzielonego `ShaderMaterial`, `update`/`setDayNight`/`dispose` oraz nowej funkcji `buildGrassChunkMeshes(data, chunkOriginX, chunkOriginZ): WorldGrassChunk | null` — czyli obecnego bloku `grass.ts:792-870` czytającego `GrassChunkData` zamiast lokalnych bucketów. `WorldGrassChunk` (z `setLodFraction`/`fullCount`/`dispose`) **nie zmienia kształtu** — `chunkManager` widzi ten sam typ.

Bufory: zamiast alokacji na `candidatesPerChunk` — start od realistycznej pojemności (`ceil(candidatesPerChunk * 0.15)`, min. 1024) i wzrost ×1,7 przy przepełnieniu, na koniec `subarray`/`slice` do `count`. Kolory/fazy idą prosto do `Float32Array`, nie do `number[]`. Efekt: ~25 MB tranzytowych alokacji per chunk → rząd rzeczywistego rozmiaru wyniku.

### 3.2 Protokół workera

`chunkHeightmapProtocol.ts` dostaje unię zamiast pojedynczego kształtu:

```ts
export type ChunkWorkerRequest =
  | { kind: 'tile';  id: number; params: ChunkTileParams }
  | { kind: 'grass'; id: number; params: GrassRequestParams }

export type GrassRequestParams = {
  cx, cz, chunkSize, resolution, waterLevel, heightScale, seed: number
  candidatesPerChunk: number
  region: RegionParams
  grids: GrassTileGrids   // KOPIE siatek (structured clone), nie transfer
}

export type ChunkWorkerResponse =
  | ({ kind: 'tile';  id: number; ok: true } & ChunkTileResult)
  | { kind: 'grass'; id: number; ok: true; buckets: GrassChunkData }
  | { kind: 'tile' | 'grass'; id: number; ok: false; error: string }
```

**Siatki idą jako kopie, nie transferable** — main thread musi zachować `tile.heights` (`readField`, `sampleHeight`, `applyModificationToTile`), więc transfer by je odpiął. Koszt structured clone przy domyślnym `resolution: 65` (apron 67²):

```text
5 siatek × 67² × 4 B ≈ 90 KB na zlecenie
(resolution 193 → apron 195² → ≈ 760 KB; resolution 769 → ≈ 11,8 MB — patrz Ryzyka R3)
```

Odpowiedź wraca jako transferable (`matrices`/`phases`/`baseColors`/`tipColors`/`windFactors` każdego bucketu) — zero kopii, dokładnie wzorzec z `chunkHeightmap.worker.ts:49`.

Bufory wyjściowe: 24 float per instancja (16 macierz + 1 faza + 3+3 kolory + 1 wind) = **96 B/instancję**. Rzeczywista liczba ocalałych instancji na chunk jest dziś **nieznana** (nikt jej nie mierzył) — Faza 0 dokłada jej odczyt, bo od niej zależy realny rozmiar transferu.

### 3.3 Pool: priorytety zamiast jednej kolejki FIFO

`chunkWorkerPool.ts` dostaje:

- `request(kind, key, params)` zamiast `requestChunk` (publiczne opakowania: `requestChunkTile`, nowe `requestChunkGrass`, `cancelChunkGrass`),
- klucze **z przestrzenią nazw** (`tile:${chunkKey}` / `grass:${chunkKey}`), żeby `cancel()` jednego rodzaju nie zabijał drugiego — dziś `keyToId` (`chunkWorkerPool.ts:52`) jest jedną mapą po surowym kluczu chunka,
- **dwie kolejki z priorytetem**: `pump()` (`chunkWorkerPool.ts:56`) bierze najpierw zlecenie `tile`, potem `grass`. Teren to grunt pod nogami gracza; trawa jest ozdobą i nie może go zagłodzić,
- limit `MAX_INFLIGHT_GRASS = max(1, size - 1)` — przy poolu 2–6 workerów (`defaultChunkWorkerCount()`) zawsze zostaje wolny wątek na tile.

`ChunkWorkerPool.pendingCount`/`busyCount` (używane przez HUD/GUI) rozbite na `tile`/`grass` albo sumowane — do ustalenia przy implementacji, zależnie od tego, co czyta `createDebugGui`.

### 3.4 `chunkManager` — asynchroniczna trawa

`ChunkRecord.grass` ma dziś trzy stany (`chunkManager.ts:188-191`): `undefined` = niezdecydowane, `null` = nieuprawnione, obiekt = zbudowane. Dochodzi czwarty — „w locie":

```ts
grassPending?: boolean   // zlecenie u workera, jeszcze bez wyniku
```

- `ensureGrass(record)` → jeśli `grass !== undefined || grassPending || !record.tile` — nic. Inaczej: `grassPending = true`, `requestChunkGrass(key, params)`; po wyniku sprawdź, czy (a) chunk nadal jest w `chunks`, (b) `chebyshevDistance(coord, lastPlayerChunk) <= grassUnloadRadius` — jeśli nie, wynik jest odrzucany (`grassPending = false`, `grass` zostaje `undefined`, więc powrót gracza zleci ponownie). Jeśli tak: `buildGrassChunkMeshes(...)` + `scene.add` + `setLodFraction` dla **bieżącej** odległości (nie tej z chwili zlecenia).
- `removeGrass(record)` → dodatkowo `cancelChunkGrass(record.key)` gdy `grassPending`.
- `unload(record)` → to samo (`removeGrass` już jest wołane, `chunkManager.ts:709`).
- `syncGrassForRecord` → `setLodFraction` tylko gdy `record.grass` jest obiektem (dziś `record.grass?.` już to załatwia).
- `dispose()` → anuluje wszystkie zlecenia trawy (przez `unload` w pętli, `chunkManager.ts:1006`).

**Zmiana obserwowalna dla gracza:** trawa pojawia się z opóźnieniem round-tripu zamiast w tej samej klatce co teren. Ponieważ chunki wchodzą w promień trawy przy `dist == 2`, a znikają dopiero przy `dist > 3`, jest cały pierścień zapasu — ale przy szybkim ruchu (bieg, teleport po `waitForChunks`) trawa może „doganiać". Do sprawdzenia wizualnie (§6).

### 3.5 Czego plan NIE robi

- Nie zmienia wyglądu, gęstości, LOD-u, shaderów ani parametrów trawy.
- Nie rusza `castShadow = false` na trawie (`grass.ts:838`) ani mgły/dnia-nocy.
- Nie przebudowuje trawy po `modifyTerrain`/`levelTerrain` — dziś też tego nie robi (kopiowane siatki niosą aktualny, zmodyfikowany stan `heights`, więc chunk zbudowany po kopaniu jest co najwyżej bardziej poprawny niż dziś, nigdy mniej).
- Nie dotyka roślinności/propsów — to [087](./2026-08-12--087--vegetation-and-prop-instancing.md).
- **Nie wymaga nowych modeli ani dźwięków** — [MODELS.md](../assets/MODELS.md) / [SOUNDS.md](../assets/SOUNDS.md) bez zmian.

---

## 4. Fazy

| # | Zakres | Priorytet |
|---|---|---|
| 0 | **Pomiar bazowy + siatka bezpieczeństwa.** Zmierzyć w GUI („Performance") koszt `simulate` przy przekraczaniu granicy chunka w gęstej trawie, przy stałym seedzie i pozycji. Dołożyć tymczasowy odczyt sumy `fullCount` trawy (ile realnie jest instancji/chunk) — bez tej liczby nie da się ocenić rozmiaru transferu. | **Must** |
| 1 | **Ekstrakcja `grassPlacement.ts` — zero zmian zachowania.** Przeniesienie obu pętli i `pushInstance`, `grass.ts` czyta `GrassChunkData`. Nadal main thread, nadal synchronicznie. Dokładany `grassPlacement.test.ts`: golden dla 3 chunków (w tym jeden przy wodzie i jeden górski) — liczności bucketów + checksuma pierwszych N floatów `matrices`/`baseColors`, **wygenerowana z tej wersji**, czyli kodująca dzisiejsze wyjście. | **Must** |
| 2 | **Bufory rosnące zamiast pre-alokacji na `candidatesPerChunk`.** Golden z fazy 1 musi zostać zielony — to jedyny dowód, że zmiana układu buforów nie ruszyła wyniku. | **Must** |
| 3 | **Protokół + worker.** Unia `ChunkWorkerRequest`/`Response`, obsługa `kind: 'grass'` w `chunkHeightmap.worker.ts`, `requestChunkGrass`/`cancelChunkGrass`, priorytet + limit in-flight w `pump()`. | **Must** |
| 4 | **`chunkManager` na asynchroniczną ścieżkę.** `grassPending`, walidacja odległości po powrocie, anulowanie przy unload/wyjściu z promienia. | **Must** |
| 5 | **Pomiar końcowy** tą samą metodą co faza 0 + wpis wyniku do notatek implementacyjnych. | **Must** |
| 6 | Test integracyjny „ta sama trawa": `computeChunkGrass` wywołane bezpośrednio vs. przez ścieżkę workerową (w Vitest bez realnego `Worker` — porównanie wyniku funkcji na tych samych, sklonowanych siatkach). | **Should** |
| 7 | Odzyskanie budżetu: skoro trawa nie blokuje już main threadu, rozważyć podniesienie `grass.radius` z 2 na 3 jako **osobną, świadomą decyzję wizualną** — nie część tego planu. | **Nice to have** |

---

## 5. Ryzyka

| # | Ryzyko | Reakcja |
|---|---|---|
| R1 | Rozbieżność bit-w-bit po przeniesieniu (inna kolejność operacji, inny `Math`) | Golden test z fazy 1 jest wykonywany na **tym samym kodzie**, który trafia do workera — worker nie ma własnej kopii logiki. Jedyne, co się różni, to wątek. |
| R2 | Trawa „dogania" gracza przy szybkim ruchu | Pierścień histerezy (`radius` 2 vs `grassUnloadRadius` 3) daje 64 j. zapasu. Weryfikacja wizualna w przeglądarce (§6). Gdyby to było widoczne — podnieść priorytet zleceń trawy dla chunka gracza (`dist == 0`) ponad tile'e sąsiadów. |
| R3 | Koszt kopiowania siatek rośnie kwadratowo z `resolution` (GUI dopuszcza 193 i 769) | Przy 65 to 90 KB — nieistotne. Przy 769 to 11,8 MB na zlecenie i wtedy kopiowanie kosztuje więcej niż sama generacja. Mitygacja: przy `resolution > 193` zostawić ścieżkę synchroniczną (`computeChunkGrass` prosto na main), bo to i tak tryb „zobacz jak wygląda", nie tryb gry. Decyzja do potwierdzenia pomiarem w fazie 5. |
| R4 | Zagłodzenie zleceń terenu przez ciężkie zlecenia trawy | Priorytet w `pump()` + `MAX_INFLIGHT_GRASS = size - 1` (§3.3). |
| R5 | Wyciek: chunk odładowany, wynik trawy wraca później i dodaje mesh do sceny | Walidacja `chunks.has(key)` **po** rozwiązaniu promise'a — dokładnie ten sam wzorzec, co już istnieje dla szablonów GLB (`chunkManager.ts:594`, `:666`). |
| R6 | `cancel()` po surowym kluczu chunka zabija cudze zlecenie | Klucze z prefiksem `tile:`/`grass:` (§3.3). |

---

## 6. Weryfikacja

**Techniczna:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` (golden trawy musi być zielony po każdej fazie).

**Pomiarowa (przeglądarka, dev server — prowadzi użytkownik):** ten sam seed, ten sam start, przejście w las na tej samej trasie; odczyt z folderu „Performance" w debug GUI (`?debug=1`): `Simulate (ms)` — porównanie piku przy przekraczaniu granicy chunka przed i po. Oczekiwane: pik znika z `simulate`, `Draw calls`/`Triangles` **bez zmian** (to nie jest plan o draw callach).

**Wizualna (przeglądarka — prowadzi użytkownik):** ten sam seed przed i po; trawa ma wyglądać identycznie (rozkład kęp, kolory, gęstość, LOD przy oddalaniu). Osobno: bieg przez granicę chunków i sprawdzenie, czy trawa nie „dogania" w sposób widoczny.

Zgodnie z CLAUDE.md: przejście `tsc`/`lint`/`build`/`test` **nie** jest dowodem poprawności wizualnej.
