# Review: wydajność, architektura i asety

**Status:** `done` (analiza) — implementacja poza scope tego review
**Created:** 2026-08-12
**Updated:** 2026-08-12
**Zlecenie:** analiza wydajności całej aplikacji — wąskie gardła, architektura, baza danych, rozmiary modeli/dźwięków, brakujące oczywiste optymalizacje. Twarde ograniczenie: **żadnych regresji wizualnych**; celem jest budżet na *lepsze* efekty.
**Poprzednik:** [2026-08-08--002--app-performance-and-code-health.md](./2026-08-08--002--app-performance-and-code-health.md)

## Metoda i status bazowy

Statyczna analiza kodu + pomiar artefaktów build/asset (bez uruchamiania w przeglądarce, zgodnie z CLAUDE.md).
Przeczytane w całości: `app/gameLoop.ts`, `app/interactables.ts`, `terrain/chunkManager.ts`, `terrain/grass.ts`,
`terrain/buildChunkGeometry.ts`, `terrain/chunkWorkerPool.ts`, `terrain/chunkVegetation.ts`, `assets/loadGltf.ts`,
`render/createRenderer.ts`, `render/createPostProcessing.ts`, `world/createLights.ts`, `audio/createWorldAudio.ts`,
`audio/createAmbientAudio.ts`, `settlement/SettlementsManager.ts`, `persistence/saveDb.ts`, `config/worldConfig.ts`,
`vite.config.ts`; fragmenty `ai/NpcAgent.ts`, `fauna/AnimalAgent.ts`, `fauna/createFauna.ts`, `settlement/props.ts`.

Zmierzone:

```text
npm run build   → dist/assets/index-*.js  1 237,74 kB │ gzip: 412,71 kB
public/         → 53 MB  (models 31 MB / 87 GLB, sounds 22 MB / 23 WAV)
npm run test    → 42 plików, 319 testów ✅
```

⚠️ **Baseline nie jest czysty** — drzewo robocze ma niezacommitowane zmiany.
`npx tsc --noEmit` zgłasza 5× `TS6133` (nieużywane `CAVE_*` / `terrainCarving` w `src/fauna/createFauna.ts`),
`npm run lint` — 1 błąd `perfectionist/sort-imports` w `src/settlement/SettlementsManager.ts`.
Oba pliki są na liście zmodyfikowanych, więc to artefakty pracy w toku, nie stan repo. Do posprzątania przed commitem.

## Co z poprzedniego review zostało naprawione

Weryfikacja w kodzie, nie w dokumentacji — istotne, bo zmienia listę pozostałych problemów:

| Poprzednie | Stan |
|---|---|
| F1 `disposeObject3D` zwalnia zasoby z cache'a GLTF | ✅ flaga `userData.sharedGpu` na geometrii/materiale w `loadCached` |
| F2 cache `roadNetwork` nie czyszczone przy rebuildzie | ✅ `clearRoadNetworkCaches()` w `worldBundle.ts:291` |
| F3 „New Game" nie resetuje inventory/questów | ✅ `rebuildWorld` gałąź `resetCollectedItems` (`createApp.ts:278-289`) |
| F4 `worker.onerror` nie odrzuca zadania | ✅ mapa `workerJob` + `settleJob` w `onerror` |
| F5 współdzielony atrybut geometrii trawy | ✅ `templates[id].position.clone()` per chunk |
| P1.0 default `density` poza zakresem suwaka | ✅ `120000` w `worldConfig.ts:212`, suwak `40000–250000` |
| P1.3b brak mgły w shaderze trawy | ✅ `fog: true` + `UniformsLib.fog` + `fogFactor` we fragmencie |
| P1.3a LOD trawy | ✅ `setLodFraction` przez `InstancedMesh.count` |
| P1.3d `matrix.clone()` per źdźbło | ✅ prealokowany `Float32Array matrixData` |
| P1.4 `radius: 10` przy `loadRadius: 3` | ✅ `effectiveGrassRadius = min(radius, loadRadius)` |
| P2 (część) alokacja `Vector3` + 6× bilinear | ✅ `apronGridWeights` liczone raz, zapis do `normalAttr` |
| P3 zapisy DOM co klatkę | 🟡 częściowo — patrz **P3'** |
| P7 `antialias: true` | ✅ `antialias: false` z komentarzem |
| P8 `applyDayNight` co klatkę | ✅ throttle `DAY_NIGHT_APPLY_THRESHOLD` |
| R1/R4/R8/R9 duplikaty | ✅ usunięte (`math/segment.ts`, `fauna/faunaCombat.ts`) |
| P1.3e trawa do workera | ❌ nadal main thread |
| P4 `buildInteractables` co klatkę | ❌ nadal, i szerszy (doszły `houses`) |
| P5 śmieciowanie w pętli | ❌ nadal |
| P6 markery questowe co klatkę | ❌ nadal |
| P9 setki draw calli | ❌ nadal, patrz **A1** |
| R2/R3 duplikaty animacji/steeru | ❌ nadal |

Poprzednie review zostało wdrożone w ~70%. To, co zostało, to głównie pozycje „duże" — i one są teraz głównym tematem.

---

## Podsumowanie — gdzie realnie leży koszt

Trzy niezależne budżety, w kolejności potencjalnego zysku:

1. **Draw calls / scene graph (GPU + CPU).** W całym repo jest **dokładnie jeden** `InstancedMesh` — trawa.
   Każde drzewo, krzak, skała, prop osady i item to osobny `Object3D` z osobnym draw callem, ×2 przez pass cieni.
   To jest sufit dla „więcej roślinności / więcej efektów".
2. **Asety (transfer + pamięć).** 53 MB nieskompresowanych asetów, z czego ~11 MB WAV-ów ściąga się
   **zanim gracz cokolwiek zrobi**. Loader ma już podpięty `MeshoptDecoder`, więc kompresja modeli to
   zmiana pipeline'u, nie kodu.
3. **Hitch przy streamingu (main thread).** Trawa (~154 tys. kandydatów/chunk) i `buildChunkGeometry`
   liczą się synchronicznie w `.then()` po odebraniu tile'a. To jedyne miejsce, gdzie gracz *czuje* spadek,
   bo jest skorelowane z chodzeniem.

Odpowiedzi na pytania wprost:

- **Czy warto przejść na „realną" bazę danych?** Nie. IndexedDB *jest* realną bazą w przeglądarce; problemem
  nie jest technologia tylko kształt zapisu (jeden blob, pełny rewrite co 60 s). Szczegóły: **D1**.
- **Czy modele/dźwięki są za duże?** Dźwięki — tak, drastycznie (**AS1**). Modele — nie w trójkątach,
  tylko w formacie zapisu (**AS2**).
- **Czy brakuje oczywistych optymalizacji?** Tak: instancing (**A1**), pass cieni (**A2**),
  cache `buildInteractables` (**P4'**), łańcuch post-processingu (**A3**).

---

## Findings — architektura (największy zysk)

### A1. [High] Brak instancingu dla roślinności i propsów — jedyny `InstancedMesh` to trawa

Skala, wyliczona z kodu:

- `chunkVegetation.ts:42-43` — `BASE_CANDIDATES_PER_CHUNK = 16` + `FOREST_EXTRA_CANDIDATES = 90 × centerForest`
  → do **106 kandydatów/chunk**, akceptacja w lesie wysoka (`OPEN_TREE_BASELINE = 0.10`, w gęstym lesie
  `density` dochodzi do ~1).
- `loadRadius: 3` → 7×7 = **49 chunków**. Rząd wielkości: **2–4 tys. instancji roślinności** w scenie.
- Modele drzew mają po **2 primitives** (`tree_c.glb`: 6 678 tri / 2 prims; `birch_1.glb`: 4 596 / 2) →
  **2 draw calle na drzewo**.
- `buildSettlementProps` (`props.ts`) sadzi kilkaset propsów per osada, każdy przez `cloneProp` → osobny obiekt.

Do tego `loadGltf.ts:36-38` ustawia `castShadow = true` **i** `receiveShadow = true` na każdym meshu każdego
GLB, więc każdy z tych obiektów wchodzi drugi raz w pass cienia.

Szacunek: rzędu **5–10 tys. draw calli/klatkę** w lesie (przed frustum cullingiem; culling ratuje część,
ale `WebGLRenderer.projectObject` i tak przechodzi cały graf sceny co klatkę).

**Kierunek (bez zmiany wyglądu):** `InstancedMesh` per (gatunek, primitive, chunk) — dokładnie ten sam wzorzec,
który już działa dla trawy w `grass.ts`, łącznie z LOD-em przez `count`. Geometria i materiał są już
współdzielone przez cache GLTF (`sharedGpu`), więc brakuje wyłącznie warstwy agregującej transformy.
Realistyczna redukcja: z ~2 draw calle × N drzew do **~2 draw calle × liczba gatunków × chunk**.

Zastrzeżenia do zaplanowania: drzewa mają runtime stage changes (`refreshTreeVisual` po wyrębie) — instancja
musi umieć zniknąć/zmienić macierz bez przebudowy całego bufora (wzorzec: „ostatnia instancja w slot zwolniony",
albo osobny bucket dla drzew niestandardowych). To jest powód, dla którego to zasługuje na **własny plan**,
a nie na wpis w issues.

### A2. [High] Wszystko rzuca cień — pass cienia podwaja koszt sceny

`createLights.ts` daje jedno światło kierunkowe z mapą 1024² i frustum 160×160 (`far: 200`).
Do tej mapy renderuje się:

- każdy chunk terenu (`buildChunkGeometry.ts:357` — `mesh.castShadow = true`),
- każdy mesh każdego GLB (`loadGltf.ts:36`),
- każdy props proceduralny.

Teren rzucający cień na sam siebie przy tej rozdzielczości mapy daje głównie shadow acne i koszt, nie czytelny
cień — sylwetki terenu i tak modeluje oświetlenie kierunkowe + N8AO. Analogicznie drobne propsy (kamyki,
trzcina, filler) na 1024² mapie przy 160-jednostkowym frustum zajmują ułamek texela.

**Kierunek:** `castShadow = false` dla terenu i dla drobnych propsów poniżej progu rozmiaru (próg jako stała
w `loadGltf`/`props`, nie ad hoc), `castShadow` zostawić dla drzew, domów i postaci. To jest zysk **bez zmiany
wyglądu** i, w przeciwieństwie do A1, mieści się w kilku linijkach. Trawa już to robi poprawnie
(`grass.ts:831` — z komentarzem *dlaczego*).

Uwaga: to trzeba zweryfikować wizualnie w przeglądarce — usunięcie cienia terenu jest widoczne na stromych
zboczach o zachodzie słońca. Sugerowana kolejność: najpierw propsy, potem osobno teren.

### A3. [Medium] Łańcuch post-processingu ma 6 pełnoekranowych passów przy `pixelRatio` do 2

`createPostProcessing.ts`: `RenderPass?` → `N8AOPass` → `SMAAPass` → `UnrealBloomPass` → `GodRaysShader`
→ `OutputPass` → `FilmGradeShader`.

- `UnrealBloomPass` to wewnętrznie ~10 passów (5 poziomów mip w dół i w górę). Jest **zawsze włączony**
  (`bloomEnabled` domyślnie on, strength 0.28).
- `FilmGradeShader` jest osobnym `ShaderPass` **po** `OutputPass` — czyli dodatkowy pełny odczyt+zapis
  framebuffera tylko po to, żeby zrobić grade + dither. To się składa w shader `OutputPass`a albo
  w `GodRaysShader` bez żadnej zmiany wyniku.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — na ekranie 1440p z DPR 2 cały ten łańcuch
  liczy się na ~14,7 mln fragmentów per pass. Brak jakiegokolwiek dynamicznego skalowania rozdzielczości.

**Kierunki, w kolejności zysk/ryzyko:**
1. Scalić `FilmGradeShader` do `OutputPass`/`GodRaysShader` — zero zmian wizualnych, −1 pełny pass.
2. Wyeksponować `pixelRatio` jako suwak jakości (dziś jest zaszyty). Zejście z 2 na 1,5 to −44% fragmentów
   przy praktycznie nierozpoznawalnej różnicy po SMAA.
3. `N8AOPass` ma już `halfRes: true` — dobrze. `UnrealBloomPass` można analogicznie liczyć na połowie
   rozdzielczości (bloom jest z definicji niskoczęstotliwościowy).

To jest budżet, z którego finansuje się „lepsze efekty" — nie odwrotnie.

### A4. [Medium] Generacja trawy blokuje main thread przy każdym wczytaniu chunka

`chunkManager.ts:409-427` (`ensureGrass`) → `grass.ts:604` — synchronicznie, w `.then()` po odebraniu tile'a.

Praca na chunk przy `density: 120000`:

- pętla główna: 120 000 kandydatów,
- pętla filler: `120000 × 0.28` = 33 600 kandydatów,
- **łącznie ~153 600 kandydatów × do 9 wywołań `sampleApronGrid`** (wysokość, sandBand, ridge, roadTint,
  4× slope, moisture, moistureRegion),
- plus `fbm01` (2 oktawy) na każdym kandydacie, który przeszedł testy.

Grass radius 2 → 5×5 = 25 chunków z trawą; przy przejściu granicy chunka odświeża się ich kilka naraz,
każdy jako jeden nieprzerwany blok na main threadzie.

Dwa niezależne kierunki (można oba):

**(a) Do workera** (faza 5 planu trawy — nadal niezrobiona). Kandydatów da się policzyć czysto arytmetycznie:
worker już dostaje `tile.heights/biomes/roadTint/mountainRidge/moistureRegion` i już zwraca `vegetation`/`items`/
`environment` jako czyste dane. Trawa pasuje do **istniejącego** protokołu — worker zwracałby gotowe
`matrixData`/`phases`/`baseColors`/`tipColors`/`windFactors` jako transferable `Float32Array`.
To jest dokładnie ten przypadek, który `docs/architecture/performance-and-workers.md` opisuje jako
„CPU-heavy, data-oriented". Jedyna przeszkoda: `speciesNoiseFor` trzyma `createNoise2D` po stronie main —
w workerze trzeba by odtworzyć ten sam handle z seeda (deterministyczne, więc bezpieczne).

**(b) Budżetowanie klatki.** Nawet bez workera: `recheck` wywołuje `ensureLoaded` dla wszystkich brakujących
chunków naraz (`chunkManager.ts:797-799`). Kolejka z limitem „N chunków wykończonych na klatkę"
rozłożyłaby hitch bez zmiany czegokolwiek innego.

**(c) Zbędne próbkowanie.** `grass.ts:617` pobiera `ridge` **przed** testem `roadTint` (`:619-622`),
choć `ridge` jest używany dopiero w `:647`. Kandydat odrzucony przez korytarz drogi płaci za sampel,
którego nigdy nie użyje. Przeniesienie o 5 linii niżej — testy oparte na samplach nie konsumują RNG,
więc layout trawy zostaje bit w bit ten sam (dokładnie ta sama argumentacja co w komentarzu `:624-628`).

### A5. [Medium] `buildChunkGeometry` — własny materiał na chunk + geometria pomocnicza wyrzucana

`buildChunkGeometry.ts:339-352`: każdy chunk dostaje **własny** `MeshStandardMaterial` o identycznych parametrach,
z własnym `onBeforeCompile`. `customProgramCacheKey` ratuje przed rekompilacją shadera (dobrze, i jest komentarz
*dlaczego*), ale nadal jest 49 obiektów materiału, 49 zestawów uniformów i 49 przełączeń stanu zamiast jednego.
Materiał jest bezstanowy per chunk — wszystkie różnice siedzą w atrybutach wierzchołków (`color`, `aBareGround`).

Do tego `:254-270` buduje pełną `PlaneGeometry` w rozmiarze aprona (`(res+2)²` wierzchołków) wyłącznie po to,
żeby wywołać na niej `computeVertexNormals()`, po czym ją wyrzuca (`:332`). Przy `resolution: 65` to 4 489
wierzchołków — do przełknięcia; przy 193 (opcja w GUI) to 38 025, przy 769 — 594 441 wierzchołków alokowanych
i zwalnianych **na każdy chunk**.

**Fix:** jeden współdzielony materiał terenu na cały `ChunkManager` (dysponowany w `dispose()`), oraz normalne
liczone bezpośrednio z siatki wysokości (różnice centralne na `tile.heights`) zamiast przez pomocniczą
`PlaneGeometry` — matematycznie ten sam wynik dla regularnej siatki, bez alokacji. Alternatywnie: cała funkcja
jest w 100% arytmetyką na `Float32Array` i nadaje się do workera z transferable buffers, dokładnie jak A4(a).

---

## Findings — asety

### AS1. [High] 22 MB nieskompresowanego WAV, z czego ~10,7 MB ładuje się przy starcie

`public/sounds/` — 23 pliki WAV, 21,4 MB. Żadnej kompresji stratnej (2 × mp3, 1 × m4a to wyjątki).

`createAmbientAudio.ts:34-36` tworzy trzy pętle **bezwarunkowo przy starcie świata**:

| Plik | Rozmiar | Format |
|---|---|---|
| `ambient-night-crickets-loop-01.wav` | 5,63 MB | **96 kHz / 24-bit / stereo** |
| `ambient-forest-loop-01.wav` | 4,57 MB | 44,1 kHz / 16-bit / stereo |
| `ambient-coast-seagulls-waves-01.wav` | 1,02 MB | 44,1 kHz / 16-bit / stereo |
| **razem** | **10,70 MB** | pobierane zanim gracz zrobi cokolwiek |

96 kHz / 24-bit dla tła świerszczy to ~6× więcej danych, niż da się usłyszeć. Do tego one-shoty:
`animal-chicken-01.wav` — **5,05 MB**, `animal-cow-01.wav` — 1,91 MB, `animal-wolf-01.wav` — 1,38 MB.
To są krótkie odgłosy zwierząt.

**Fix (zerowe ryzyko wizualne, największy zysk/koszt w całym review):** przekonwertować na **OGG Vorbis lub
Opus**, 48 kHz, mono dla one-shotów, ~96–128 kbps dla pętli ambientu. Realny efekt: **22 MB → ~1,5–2 MB**,
start gry z 10,7 MB → ~0,8 MB. `AudioLoader` (three.js) używa `decodeAudioData`, które obsługuje oba formaty
we wszystkich docelowych przeglądarkach — **żadnej zmiany w kodzie poza rozszerzeniami w stałych URL**.

Dodatkowo: pętle ambientu warto ładować leniwie (nocna dopiero gdy `dayFactor` spada, przybrzeżna gdy
`ambientWeightsAt().ocean > 0`) — dziś wszystkie trzy startują od razu, mimo że `setTargetGain(0)`.

### AS2. [High] 31 MB GLB bez Draco/meshopt/KTX2 — mimo że dekoder meshopt jest już podpięty

Sprawdzone bezpośrednio w plikach: **żaden** GLB nie deklaruje `KHR_draco_mesh_compression`,
`EXT_meshopt_compression` ani `KHR_texture_basisu`.

Tymczasem `assets/loadGltf.ts:16` robi już:

```ts
loader.setMeshoptDecoder(MeshoptDecoder)
```

Czyli **skompresowane meshoptem GLB załadowałyby się bez jednej linii zmiany w kodzie**. To jest zadanie
czysto pipeline'owe (`gltfpack -cc` / `gltf-transform`).

Gdzie siedzą megabajty — i to nie w trójkątach:

| Plik | Rozmiar | Trójkąty | Tekstury |
|---|---|---|---|
| `fauna/stag.glb` | 1,99 MB | 3 670 | **0** |
| `fauna/wolf.glb` | 1,86 MB | 1 962 | **0** |
| `characters/Adventurer.glb` | 1,84 MB | 10 198 | **0** |
| `settlement/farm_poly.glb` | 1,91 MB | 28 896 | 120 KB |
| `nature/grass_clump.glb` | 768 KB | 574 | 718 KB (1 PNG) |

Zero tekstur i 2 MB pliku oznacza jedno: **dominują nieskwantyzowane ścieżki animacji** (float32, gęste klatki
kluczowe). To dokładnie ten przypadek, w którym `gltfpack` daje 5–10×, bo kwantyzuje i resampluje tracki.

Rozkład katalogów: `characters/` 13,50 MB (9 plików), `fauna/` 8,55 MB (7), `settlement/` 5,61 MB (41),
`nature/` 2,20 MB (19).

`NPC_MODEL_URLS` (`NpcAgent.ts:94-107`) ma pulę 4 modeli na płeć — przy zaludnionej wiosce ściągnie się
praktycznie cały katalog `characters/`, czyli ~13,5 MB.

**Fix:**
1. `gltfpack -cc` na wszystkich GLB (mesh + animacje). Oczekiwane: 31 MB → ~6–9 MB, **bez utraty jakości
   wizualnej** (kwantyzacja pozycji do 16-bit na modelu o rozmiarze 2 m to błąd rzędu 0,03 mm).
2. `grass_clump.glb` — 718 KB PNG na 574 trójkąty. Albo KTX2/Basis (wymaga `setKTX2Loader` — to *jest*
   zmiana w kodzie), albo po prostu przeskalowana tekstura.
3. Rozważyć redukcję puli postaci ładowanych naraz albo progresywne ładowanie (pierwszy model natychmiast,
   reszta w tle) — dziś wszystkie 8 wchodzi w to samo okno startowe.

### AS3. [Low] Bundle 1,24 MB (413 kB gzip) w jednym chunku

Vite ostrzega wprost. To praktycznie w całości three.js + addony (N8AO, SMAA, Bloom, Water, Sky, GLTFLoader).
Przy 53 MB asetów to nie jest priorytet, ale jeśli AS1+AS2 zejdą do ~10 MB, ten chunk staje się zauważalną
częścią czasu do pierwszej klatki.

Do tego build zgłasza realny problem strukturalny: `src/ui-vue/store.ts` jest **jednocześnie** dynamicznie
importowany przez `mount.ts` i statycznie przez 21 innych modułów — dynamiczny import nie robi więc nic
poza dodaniem ostrzeżenia. Albo store idzie do statycznego importu w `mount.ts`, albo pozostałe 21 miejsc
przestaje go importować statycznie. Dziś jest to martwa intencja code-splittingu.

---

## Findings — pętla klatki (pozostałe z poprzedniego review + nowe)

### P4'. [Medium] `buildInteractables()` — nadal pełna lista co klatkę, teraz szersza

`gameLoop.ts:293-302` → `interactables.ts:47`. Co klatkę powstaje świeża tablica z nowym obiektem opisu na:

- każdego NPC każdej załadowanej osady,
- **każdy dom każdej osady** (`landmarks.houses` — nowe od poprzedniego review, `interactables.ts:110-122`),
- każdą studnię, każde ognisko, każdą sztukę żywego inwentarza,
- każde drzewo z `chunkManager.getNearbyTrees` (to akurat jest już przefiltrowane po `GAZE_RANGE` — dobrze),
- każde zwierzę, każdy spawner, każdy item ze spawner-poola i każdy dropiony item.

Do tego `chunkManager.getNearbyItems` (`chunkManager.ts:883-900`) skanuje `children` grupy itemów
**wszystkich 49 załadowanych chunków**, a `gameLoop.ts:346-352` buduje z tego drugą tablicę `gazeCandidates`.

Wszystko potem odfiltrowane do 2,5 / 5 jednostek. Docstring nadal mówi „Cheap: a few dozen objects total"
— przy multi-settlement streamingu i pełnej liście domów to już nieprawda.

**Fix:** przebudowa tylko przy przekroczeniu progu ruchu gracza (ten sam wzorzec `recheckDistance`, który
`chunkManager.update` i `SettlementsManager.update` już stosują) **albo** filtr odległości przed alokacją
obiektu opisu. Drugie jest prostsze i wystarczające.

### P5'. [Low] Alokacje w pętli głównej — `getLoaded()` 5× na klatkę

W `gameLoop.ts` w jednej klatce:

- `bundle.settlementsManager.getLoaded()` wołane w liniach **491, 531, 538, 546, 581** — pięć razy,
  za każdym razem nowa tablica (`SettlementsManager.ts:322-328`),
- `skyParamsFromTime(dayNight.timeOfDay)` wołane w liniach **515, 529, 587** — trzy razy, każde zwraca
  świeży obiekt 11-polowy,
- `litFires` — spread + `flatMap` + `filter` + `map` (4 tablice tymczasowe, `:530-533`),
- `villages` — kolejny `map` (`:538-542`),
- `nearbyHumanCount` — `flatMap` + `filter` + `map` (`:546-551`),
- `minimap.update` — jeszcze jeden `map` na `MinimapSettlement` (`:581-584`).

To jest ~10 tablic tymczasowych na klatkę, czyli ~600/s pod GC. Fix to kilka linii:
`const loaded = ...getLoaded()` i `const sky = skyParamsFromTime(...)` raz na górze bloku i przekazanie dalej.

### P6'. [Low] Markery questowe przeliczane dla wszystkich NPC co klatkę

`gameLoop.ts:491-498` — `questManager.labelMarker(npc.name)` dla każdego NPC każdej osady + `spawnerMarker`
dla każdego spawnera, a `labelMarker` iteruje po wszystkich definicjach questów. Stan questów zmienia się
wyłącznie w ścieżkach interakcji. Wystarczy flaga `dirty` w `QuestManager` albo odświeżanie w `onInteract`.

### P3'. [Low] Cache zapisów DOM nie działa w ruchu

`NpcAgent.ts:844-851` i `AnimalAgent.ts:685-692` mają teraz poprawny wzorzec „pisz tylko przy zmianie" — ale
strzeżona wartość to `labelOpacityForDistance(dist) * gaze`, czyli **liczba zmiennoprzecinkowa zależna od
pozycji gracza**. W ruchu zmienia się co klatkę, więc guard nigdy nie łapie. To samo dotyczy pasków HP/staminy
podczas regeneracji.

**Fix:** kwantyzować przed porównaniem (`Math.round(opacity * 32) / 32`, paski do pełnych procentów —
i tak są zapisywane jako `${Math.round(ratio*100)}%`, więc porównanie powinno iść po tej samej zaokrąglonej
wartości, nie po surowym ratio). Wtedy guard zaczyna działać także w ruchu.

Osobno: `SettlementsManager.ts:317-320` pisze `inst.labelEl.style.opacity` dla każdego signpostu
**bezwarunkowo co klatkę** — ten sam wzorzec, który reszta kodu już naprawiła. Regresja do wyrównania.

### P10. [Low] `labelRenderer.render(scene, camera)` przechodzi cały graf sceny co klatkę

`gameLoop.ts:589`. `CSS2DRenderer.render` robi `scene.updateMatrixWorld()` i rekurencyjnie przechodzi
**wszystkie** dzieci sceny, żeby znaleźć garstkę `CSS2DObject` (NPC, zwierzęta, spawnery, depozyty,
signposty, gracz — rzędu kilkudziesięciu). Przy 2–4 tys. obiektów roślinności to kilka tysięcy zbędnych
odwiedzin węzła na klatkę.

Zysk pojawia się dopiero po A1 (instancing zbije liczbę węzłów), więc to jest raczej argument *za* A1
niż osobne zadanie.

---

## Findings — persystencja

### D1. [Info] Nie potrzeba innej bazy; potrzeba innego kształtu zapisu

`persistence/saveDb.ts` — jeden object store `saves`, jeden klucz `current`, cały `SaveData` jako jeden
rekord. `createApp.ts` autosave co 60 s.

Co jest dobre: fail-safe (`catch → null/no-op` z komentarzem *dlaczego*), wersjonowanie schematu (v8),
migracje w `saveData.ts`.

Co się nie skaluje — ale dopiero przy rzeczach, które są w `docs/STATE.md` jako „not implemented":

1. **Pełny rewrite przy każdym autosave.** `structuredClone` całego grafu obiektów idzie po main threadzie.
   Dziś save jest mały (pozycja, ekwipunek, questy, sparse tree overrides, dropy) — nieodczuwalne.
   Przy „full NPC simulation persistence" albo persystencji modyfikacji terenu (dziś jawnie poza scope,
   `chunkManager.ts:228`) to zaczyna być zauważalny stutter co 60 s.
2. **Otwieranie i zamykanie `IDBDatabase` przy każdej operacji** (`openDb()` w `readSave`/`writeSave`/`clearSave`).
   Jedno trzymane połączenie usuwa kilkanaście ms latencji na zapis.
3. **Brak podziału na store'y.** Naturalne granice już istnieją w domenie: chunk deltas kluczowane
   `chunkKey`, tree overrides kluczowane `TreeId`, stan NPC per settlement id.

**Rekomendacja:** zostać przy IndexedDB. Kiedy pojawi się pierwsza z powyższych funkcji — podzielić na
object stores i zapisywać przyrostowo (dirty set), zamiast rozważać SQLite/WASM czy cokolwiek innego.
Zmiana technologii nie rozwiązałaby żadnego z trzech punktów; zmiana kształtu rozwiązuje wszystkie trzy.

---

## Findings — brakujące narzędzia pomiaru

### M1. [High] Nie da się zmierzyć tego, co ten dokument opisuje

HUD pokazuje **wyłącznie FPS** (`gameLoop.ts:211-218` → `hud.setFps`). `createDebugGui.ts` pokazuje
„Triangles / chunk" liczone analitycznie z `resolution`, nie z rzeczywistego rendera. Nigdzie w `src/`
nie ma odwołania do `renderer.info`.

Wszystkie liczby w tym review są **wyliczone z kodu, nie zmierzone**. Bez instrumentacji nie da się:

- potwierdzić, że A1 jest faktycznie największym problemem (a nie fill rate z A3),
- zmierzyć efektu jakiejkolwiek zmiany,
- zauważyć regresji.

**Fix (kilkanaście linii, powinien być zrobiony *pierwszy*):** dodać do panelu debug odczyt
`renderer.info.render.calls / .triangles` oraz `renderer.info.memory.geometries / .textures`,
plus licznik czasu klatki z rozbiciem na `simulate` / `render` (dwa `performance.now()` w `tick`).
`renderer.info` jest darmowe — three.js już te liczniki prowadzi.

---

## Sugerowana kolejność (zysk/koszt)

| # | Zadanie | Typ | Koszt | Ryzyko wizualne |
|---|---|---|---|---|
| 0 | Instrumentacja: `renderer.info` + podział czasu klatki w debug GUI (**M1**) | narzędzie | trywialny | brak |
| 1 | Konwersja dźwięków na OGG/Opus (**AS1**) — 22 MB → ~2 MB | asety | mały | brak |
| 2 | `gltfpack -cc` na wszystkich GLB (**AS2**) — dekoder już podpięty | asety | mały | brak |
| 3 | Leniwe ładowanie pętli ambientu (**AS1**) | asety | trywialny | brak |
| 4 | Scalić `FilmGradeShader` do `OutputPass` (**A3.1**) | perf | mały | brak |
| 5 | `castShadow = false` dla drobnych propsów (**A2**, bez terenu) | perf | mały | niskie |
| 6 | Filtr odległości w `buildInteractables` (**P4'**) | perf | mały | brak |
| 7 | `getLoaded()`/`skyParamsFromTime` raz na klatkę (**P5'**) | perf | trywialny | brak |
| 8 | Kwantyzacja opacity przed guardem DOM + signposty (**P3'**) | perf | trywialny | brak |
| 9 | Kolejność sampli w `grass.ts` (**A4c**), markery questowe (**P6'**) | perf | trywialny | brak |
| 10 | Współdzielony materiał terenu + normalne bez `PlaneGeometry` (**A5**) | perf | średni | brak |
| 11 | `pixelRatio` jako suwak jakości + bloom half-res (**A3.2/3.3**) | perf | średni | niskie |
| 12 | Budżetowanie chunków na klatkę (**A4b**) | perf | średni | brak |
| 13 | `castShadow = false` dla terenu (**A2**) — osobno, z weryfikacją w przeglądarce | perf | mały | **średnie** |
| 14 | **Trawa do workera** (**A4a**) — własny plan | perf | duży | brak |
| 15 | **Instancing roślinności i propsów** (**A1**) — własny plan | architektura | duży | brak |
| 16 | R2/R3: wspólny `AnimationSet`, wspólny `steerWithShoreSlide` | refactor | mały | brak |

Pozycje 0–9 to jedna sesja i kandydaci na wpisy w [issues/README.md](../issues/README.md).
Pozycje **14** i **15** zasługują na własne plany w [plans/](../plans/README.md) — 15 jest zależne od 0
(bez pomiaru nie ma jak potwierdzić hipotezy ani efektu).

### Implementacja — pozycje 0–9 (2026-08-12)

Zaimplementowane w jednej sesji, bez osobnego planu. `npx tsc --noEmit`, `npm run lint`,
`npm run build`, `npm run test` (322/322) — czyste po każdej zmianie.

- **0 (M1)** — `renderer.info` (draw calls/triangles/geometries/textures, `.listen()`)
  + symulate/render split przez `performance.now()` w `gameLoop.tick()`, folder „Performance”
  w `createDebugGui.ts`.
- **1 (AS1)** — wszystkie 23 WAV → OGG Vorbis (mono one-shoty, stereo pętle ambientu, 48 kHz)
  przez `ffmpeg`/`libvorbis`: 22 MB → ~1,1 MB (lepiej niż szacunek). Referencje URL w kodzie
  i `public/sounds/README.md` zaktualizowane; `.m4a`/`.mp3` (już stratne) bez zmian.
- **2 (AS2)** — wszystkie 87 GLB → `gltfpack -cc` w miejscu (te same ścieżki/nazwy): 31 MB → ~9,1 MB.
  Zweryfikowane parserem `GLTFLoader`+`MeshoptDecoder` w Node dla modeli bez tekstur (54/87 — reszta
  trafia na `self is not defined` w Node przy dekodowaniu obrazu WebP, potwierdzone jako ograniczenie
  środowiska Node, nie regresja: ten sam błąd na oryginalnym `tree_c.glb` sprzed kompresji).
- **Proces (poza review, ustalenia autora zlecenia):** oryginały WAV/GLB nie trzymane w drzewie —
  odzyskiwalne z gita (tag `audio-glb-originals-2026-08-12` na commicie sprzed konwersji).
  `docs/assets/CREDITS.md` / `public/sounds/README.md` zaktualizowane pod nowe rozszerzenia/proces.
- **3 (AS1 lazy loop)** — pętla nocna tworzona dopiero gdy `dayFactor < 0.95`, przybrzeżna gdy
  `ambientWeightsAt().ocean > 0`; leśna zostaje eager (`createAmbientAudio.ts`).
- **4 (A3.1)** — `filmGradeShader.ts` usunięty; grade+dither scalony w `OutputPass`'a własny fragment
  shader (`render/gradedOutputPass.ts`, `#include`-i skopiowane z `OutputShader` bez zmian) — jeden
  pass mniej, ten sam wynik.
- **5 (A2, bez terenu)** — próg `SMALL_MESH_SHADOW_THRESHOLD` (0.5 m bbox diagonal) w `loadGltf.ts`
  dla GLB; `createReed`/`createRockCluster` (`props.ts`) bez `castShadow` jawnie. Teren nietknięty
  (pozycja 13, osobno).
- **6 (P4')** — `buildInteractables` filtruje NPC/zwierzęta/ognie/domy/studnie/spawnery po `GAZE_RANGE`
  przed alokacją opisu (`interactables.ts`); drzewa/itemy już były filtrowane przez `chunkManager`.
- **7 (P5')** — `getLoaded()` i `skyParamsFromTime()` liczone raz na klatkę (`gameLoop.ts`); drugie też
  scalone z `resyncDayNight` (`applyDayNight` teraz zwraca `p` zamiast go gubić).
- **8 (P3')** — opacity kwantyzowane (`Math.round(x*32)/32`) przed guardem w `NpcAgent`/`AnimalAgent`;
  HP/stamina/satiety/hydration porównywane na już-zaokrąglonym procencie. Signposty
  (`SettlementsManager.ts`) dostały ten sam guard (wcześniej pisały bezwarunkowo co klatkę).
- **9 (A4c/P6')** — `ridge` w `grass.ts` (obie pętle) sampled po teście `roadFade`, nie przed.
  `QuestManager` dostał flagę `dirty`/`clearDirty()`; `gameLoop.ts` przelicza markery questowe tylko
  gdy `isDirty()`.

**Nie zweryfikowane wizualnie w przeglądarce** (CLAUDE.md: TS/lint/build nie potwierdzają wizualnej
poprawności) — pozycje 4 i 5 zmieniają renderowany wygląd (post-processing chain, cienie drobnych
propsów) i wymagają ręcznej kontroli na żywym dev serverze.

## Co jest zrobione dobrze (żeby nie zepsuć)

- **Poprzednie review zostało realnie wdrożone**, nie odhaczone. Naprawy mają komentarze wyjaśniające
  *dlaczego* (`sharedGpu` w `loadGltf.ts:41-47`, klonowanie szablonu w `grass.ts:798-802`,
  `antialias: false` w `createRenderer.ts:5-8`) — to chroni przed cofnięciem przy kolejnym refaktorze.
- **LOD trawy przez `InstancedMesh.count`** z uzasadnieniem, dlaczego prefiks instancji jest nieobciążoną
  podpróbką przestrzenną — to jest dokładnie ten wzorzec, który trzeba powtórzyć w A1.
- **Determinizm** — konsekwentne `seed ^ hashChunk(cx, cz) ^ salt` z osobną solą per system, plus jawne
  komentarze o tym, które testy konsumują RNG, a które nie (`grass.ts:624-628`). To jest warunek, żeby
  A4a (worker) i A4c (kolejność testów) były w ogóle bezpieczne.
- **Histerezy load/unload** spójnie na trzech poziomach (chunki, trawa, osady).
- **`customProgramCacheKey`** na materiale terenu — świadome uniknięcie rekompilacji shadera per chunk.
- **`WorldBundle`** jako jawna granica cyklu życia z udokumentowanym kontacktem mutacji w miejscu.

## Follow-up

- Uporządkować `tsc`/`lint` w drzewie roboczym przed commitem (5× `TS6133` w `createFauna.ts`,
  sort-imports w `SettlementsManager.ts`).
- Zaktualizować docstring `buildInteractables` — „Cheap: a few dozen objects total" nie odpowiada
  już stanowi kodu.
- Rozstrzygnąć martwy dynamiczny import `ui-vue/store.ts` (**AS3**).
