# Plan: Trawa (instanced ground cover)

**Status:** `done`
**Created:** 2026-08-07
**Priority:** niski — pomysł na boku, nie blokuje ani nie jest blokowany przez [terrain-worker-pool](./2026-08-07--006--terrain-worker-pool.md) / [world-visual-overhaul](../2026-08-07--024--world-visual-overhaul.md); zero styku plików z tym, co dziś w toku (nowy plik + wpięcie w `chunkManager.ts` dopiero przy implementacji)

## Stan implementacji (2026-08-07)

Fazy 1-4 (**Must**) zrobione — [src/terrain/grass.ts](../../src/terrain/grass.ts):

- Faza 1: `InstancedMesh` krzyżowych quadów per chunk, pozycje z PRNG `(seed,cx,cz)` (własna sól, zdekorelowana od `chunkVegetation.ts`), odrzucanie po `waterLevel+SAND_BAND`/`ROCK_SLOPE_FULL`/treeline altitude/`mountainRidge` (reużycie `biomeColors.ts` — `SAND_BAND` odkryte jako `export`).
- Faza 2: jeden współdzielony `ShaderMaterial` (nie per-chunk) — `sin/cos`-wiatr z per-instance fazą (kwadratowy falloff od podstawy do czubka), gradient kolor podstawa→czubek, jitter jasności per-instancja. Bez tekstury/alphaTest — projekt i tak nie używa tekstur na terenie (vertex colors), więc lite jednolite quady zamiast alpha-cut liści to zamierzone odejście od research doc, nie przeoczenie.
- Faza 3: gęstość z `tile.biomes` (moisture) + fade wysokościowy przy treeline; zero na plaży/wodzie/skale/grzbietach górskich.
- Faza 4: własny promień (`config.terrain.grass.radius`, domyślnie 2) mniejszy niż `loadRadius`, z histerezą `radius+1` do show/hide w `chunkManager.ts` (`syncGrassForRecord`), osobno od load/unload całego chunka.

Dodatkowo: dzień/noc (`setGrassDayNight`/`uDayFactor` przygasza trawę nocą, spięte z `applyDayNight` w `createApp.ts`), GUI toggle+radius w lil-gui (`Grass` folder), `InstancedMesh.dispose()` + `computeBoundingSphere()` wywołane poprawnie (łatwo przeoczyć — `geometry.dispose()` sam nie zwalnia `instanceMatrix`).

Nie zrobione (odłożone jak w planie): faza 5 (worker offload pozycji), faza 6-7 (noise wiatr/curl, billboard LOD, ugięcie pod graczem, `InstancedBufferGeometry`/WebGPU) — **Should**/**Nice to have**, bez zmierzonego bottlenecku.

`npx tsc --noEmit`, `npm run lint`, `npm run build` — czyste. Wizualnie nie zweryfikowane w przeglądarce (patrz `CLAUDE.md` — nie testuję headless sam).

## Kontekst

Wejście: [research/2026-08-07--grass-generation.md](../research/2026-08-07--004--grass-generation.md) — ogólny prompt o architekturze trawy AAA-style (Ghost of Tsushima-inspired), pisany bez znajomości obecnego kodu. Ten plan odpowiada na jego pytania **skonfrontowane z tym, co już istnieje w Seedvale**, nie od zera.

**Baseline (sprawdzone grepem):** `InstancedMesh`/`InstancedBufferGeometry` nie występuje nigdzie w `src/` — trawa byłaby pierwszym instancingiem w projekcie. Dziś nie ma żadnej trawy — grunt to sam pomalowany mesh terenu (`buildChunkGeometry.ts`, vertex colors z `biomeColors.ts`).

**Kluczowe odkrycie:** system kafelków, o który pyta research doc (pkt 1, pytanie 5), **już istnieje** — to `src/terrain/chunkManager.ts` + `chunkWorkerPool.ts` + `chunkHeightmap.worker.ts`. Chunki są deterministyczne z `(seed, cx, cz)`, generowane w worker poolu, streamowane wokół gracza z hysteresis (`loadRadius`/`unloadRadius`, Chebyshev distance), z pinned home chunks. Trawa nie potrzebuje własnego systemu tile'i — powinna dosiąść się do istniejącego cyklu życia chunka (`ensureLoaded`/`unload` w `chunkManager.ts:114-185`), nie duplikować go.

## Odpowiedzi na pytania z research doc

| # | Pytanie | Odpowiedź w kontekście Seedvale |
|---|---------|----------------------------------|
| 1 | Czy jest `InstancedMesh`? | Nie — zero instancingu w repo dziś. Net-new. |
| 2 | Jeden draw call? | Cel: jeden `InstancedMesh` (lub kilka, po materiale/gatunku) **per chunk**, nie per świat — spójne z tym, że geometria terenu też jest per-chunk. |
| 3 | `InstancedBufferGeometry`? | Nie na start — `THREE.InstancedMesh` + custom `ShaderMaterial` (przez `onBeforeCompile` albo pełny `ShaderMaterial`) wystarcza i jest dużo mniej kodu do utrzymania. `InstancedBufferGeometry`/`RawShaderMaterial` tylko jeśli MVP pokaże realny limit. |
| 4 | Seed zamiast pełnej listy źdźbeł? | Tak, i to już wzorzec w projekcie — `chunkHeightmap.ts`/`fbm.ts` generują deterministycznie z `(seed, cx, cz)`. Pozycje źdźbeł: ten sam PRNG, żadnego zapisu do dysku/pamięci per-blade poza bieżącym instance bufferem chunka. |
| 5 | Podział na tile poprawi wydajność? | Już jest — chunki. Reużyć, nie duplikować. |
| 6 | LOD zależny od odległości? | Tak, ale **prościej niż w chunkach terenu**: grass render distance << terrain render distance (np. 2-3 pierścienie chunków zamiast `loadRadius` terenu). Osobny, mniejszy promień liczony z tej samej pozycji gracza — nie osobny system. |
| 7 | Noise zamiast `sin()` dla wiatru? | MVP: `sin()` + per-instance losowa faza/amplituda (z seeda) wystarczy wizualnie i jest tani. Noise-driven wiatr (tekstura/curl) — `Should`, nie `Must`. |
| 8 | Losowe zróżnicowanie koloru/wysokości? | Tak — tanie (per-instance random z tego samego seeda co pozycja), duży zysk wizualny. `Must`. |
| 9 | WebGPU? | Projekt renderuje przez `WebGLRenderer` (potwierdzone w `createApp.ts`), brak planów migracji. Nie projektować pod compute shadery teraz — nota na przyszłość, jak Mixamo→Blender pipeline w `world-visual-overhaul.md`. |
| 10 | Bottlenecki przy 100k/500k/1M instancji? | Przy chunk-based podejściu i realnym `loadRadius` Seedvale (kilka-kilkanaście chunków naraz, nie cała mapa) realistyczny budżet to raczej dziesiątki tysięcy źdźbeł na raz, nie miliony — patrz Wydajność niżej. |

## Kierunek (fazowany, Must/Should/Nice)

| Faza | Zakres | Zysk | Koszt/ryzyko | Priorytet |
|------|--------|------|---------------|-----------|
| 1 | `InstancedMesh` krzyżowych quadów (2× plane per "kępka") per chunk, pozycje z PRNG seedowanego `(seed,cx,cz)` + odrzucanie punktów po `waterLevel`/`steepness`/`biome` (reużycie sygnałów z `colorForTerrain`/`applySlopeRock`, `biomeColors.ts:58-116`) | Trawa w ogóle istnieje, jeden draw call/chunk | Nowy plik `src/settlement/grass.ts` lub `src/terrain/grass.ts`, wpięcie w `chunkManager.ts` obok `buildChunkGeometry`/`createChunkWater` | **Must** |
| 2 | Custom `ShaderMaterial`: `sin()`-wiatr z per-instance fazą, fake AO (ciemniejsza podstawa → jaśniejszy czubek, gradient w vertex shaderze), color variation | Wygląda żywo, nie jak plastikowe kępki | Mały — jeden mały shader, wzorcowany na istniejącym stylu (`flatShading`, vertex colors już używane w `buildChunkGeometry.ts`) | **Must** |
| 3 | Density/eligibility z faktycznej biome mapy (gęściej w humid/łąka, rzadziej/brak na arid, zero na rock/sand/underwater) zamiast jednostajnej gęstości | Trawa respektuje biomy, nie rośnie na plaży/skałach | Mały — dane (`tile.biomes`, `tile.heights`) już dostępne w `ChunkTileData` po `requestChunkTile` | **Must** |
| 4 | Osobny (mniejszy) promień renderowania trawy niż `loadRadius` terenu; unload/generate powiązany z tym samym cyklem co chunk, ale z dodatkowym distance cutoff | Kontrola kosztu — trawa nie próbuje pokryć całego załadowanego terenu | Średni — dodatkowa logika w `chunkManager.ts` albo osobny lekki manager czytający te same współrzędne chunków | **Must** |
| 5 | Przeniesienie generacji pozycji/instance-bufferów do `chunkHeightmap.worker.ts` (obok heights/biomes/bodyScale) zamiast liczenia na main thread po odebraniu tile'a | Zero jank przy streamingu, spójne z tym, że heightmap już jest w workerze | Średni — rozszerzenie protokołu workera (`chunkHeightmapProtocol.ts`), więcej danych do transferu (`Float32Array` per chunk, transferable — wzorzec już jest) | **Should** |
| 6 | Wiatr z noise/curl zamiast czystego `sin()`; billboard LOD na duży dystans; proste uginanie pod graczem (displacement texture pod postacią, sampling w shaderze) | Wyższa jakość wizualna, "AAA" wrażenie z research doc | Wyższy — nowy render-to-texture pass dla ugięcia, dodatkowa złożoność shaderów | **Nice to have** |
| 7 | `InstancedBufferGeometry`/`RawShaderMaterial`, WebGPU compute dla generacji/cullingu | Tylko jeśli faza 1-5 pokaże realny limit `InstancedMesh` | Wysoki — przedwczesna optymalizacja bez zmierzonego problemu | **Nice to have**, odłożone do zmierzonego bottlenecku |

## Wydajność — orientacyjne oczekiwania

Nie ma dziś w projekcie żadnego pomiaru FPS z instancingiem, więc liczby niżej to **założenia (🟡), nie zmierzone fakty** — do zweryfikowania w przeglądarce przy fazie 1:

- `InstancedMesh` z kilkoma tysiącami instancji na chunk × kilka-kilkanaście widocznych chunków (grass radius mniejszy niż terrain `loadRadius`) → realistyczny total rzędu 10k-50k instancji naraz na desktopowym GPU, nie 1M+ z research doc (to liczby dla otwartego pola AAA, nie dla dzisiejszej skali mapy Seedvale — `worldConfig.terrain.size=128`, `halfExtent`≈64).
- Główny koszt CPU: generacja pozycji przy `ensureLoaded` chunka — stąd faza 5 (offload do workera) jako naturalny następny krok, nie faza 1 (nie przedwcześnie optymalizować, zanim zmierzone).
- Główny koszt GPU: overdraw z krzyżowych quadów przy dużej gęstości + fill rate przy alpha-tested liściach — mitygacja: `alphaTest` zamiast blend (jak zwykle dla trawy), żeby uniknąć sortowania przezroczystości.

## Świadomie poza teraz

- Wszystko z fazy "Nice to have" wyżej (noise wiatr, billboard LOD, interakcja gracza, `InstancedBufferGeometry`, WebGPU)
- Density maps jako osobne tekstury malowane ręcznie — na start wystarczy istniejący biome/height/slope sygnał
- Integracja z post-processingiem/AO ([post-processing-pipeline.md](./2026-08-07--009--post-processing-pipeline.md)) — fake AO w shaderze trawy (faza 2) to tymczasowy substytut, nie zależność

## Powiązane

- [research/2026-08-07--grass-generation.md](../research/2026-08-07--004--grass-generation.md) — oryginalny prompt/research
- `src/terrain/chunkManager.ts`, `src/terrain/chunkWorkerPool.ts`, `src/terrain/chunkHeightmap.worker.ts`, `src/terrain/chunkHeightmapProtocol.ts` — istniejący chunk/worker system do reużycia
- `src/terrain/biomeColors.ts` — height/moisture/slope sygnały do density/eligibility
- `src/terrain/buildChunkGeometry.ts` — wzorzec integracji per-chunk (gdzie w cyklu życia chunka wpiąć budowę instancji)
- [plans/2026-08-07--024--world-visual-overhaul.md](../2026-08-07--024--world-visual-overhaul.md) — sąsiednia inicjatywa roślinności (drzewa/krzewy jako dyskretne propsy, nie ground cover — różny mechanizm, nie mylić)
- [plans/2026-08-07--006--terrain-worker-pool.md](./2026-08-07--006--terrain-worker-pool.md) — `done`, status odświeżony 2026-08-07 (worker pool per chunk realnie istnieje w kodzie)
