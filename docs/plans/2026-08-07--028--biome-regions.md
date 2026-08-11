# Plan: Obszary biomów (pustynia, bagno, las) jako uzupełnienie gór/oceanów

**Status:** `done` — zaimplementowane i zweryfikowane.
**Created:** 2026-08-07
**Priority:** średni — rozszerza istniejący system dużych regionów ([world-streaming-persistence](./2026-08-07--007--world-streaming-persistence.md)), naturalne uzupełnienie [world-visual-overhaul](./2026-08-07--024--world-visual-overhaul.md) (roślinność). Nie blokuje ani nie jest blokowany przez inne kolejkowane plany — czysto terenowo/wizualny dodatek.

## Potrzeba

Dziś teren ma dwie niezależne makro-osie (`continentalness`, `mountainRidge` — `src/terrain/chunkHeightmap.ts`) dające oceany/wybrzeża/niziny/wyżyny/pasma górskie, plus jedną **lokalną** oś `moisture` (`biome.noiseScale=96`, rząd wielkości `chunkSize=64`) używaną wyłącznie do ciągłego blendu kolorów arid↔humid (`biomeColors.ts`) i lokalnego doboru drzewo/krzew (`chunkVegetation.ts`). Nie ma pojęcia **obszaru** o rozpoznawalnym charakterze — wilgotność miesza się na skalę pojedynczego kawałka lasu, więc świat nigdy nie czyta się jako "wchodzę w pustynię" czy "to jest bagno", tylko jako ciągła zieleń z cieplejszym/chłodniejszym tintem.

Cel: dodać **makro-skalowe** biomy — pustynię, bagno, las (i opcjonalnie sawannę, patrz niżej) — analogicznie do tego, jak `mountainScale`/`continentScale` już dziś tworzą wielkoskalowe pasma gór i kontynenty niezależne od lokalnego szumu wysokości. Charakterystyczna roślinność (kaktus na pustyni, trzcina/martwe drzewa na bagnie) to część tego samego zadania, nie osobny temat — bez niej obszar to tylko przefarbowana ziemia.

## Projekt: nowa makro-oś `moistureRegion` + klasyfikacja biomu

Wzorzec 1:1 z tym, jak `RegionParams`/`sampleRawTexel` już rozdzielają `continentalness` (bardzo niska częstotliwość) od szczegółowego FBM wysokości (`noiseScale=72`) — tu robimy to samo dla wilgotności zamiast przeciążać istniejące `biome.noiseScale`.

**`src/terrain/chunkHeightmap.ts`:**

- `RegionParams` +: `moistureRegionScale` (world units, rząd `continentScale`≈2200 — np. 2000), `moistureRegionFbm: FbmParams`, `desertThreshold`/`desertThresholdWidth`, `swampThreshold`/`swampThresholdWidth` (smoothstep bandy, ten sam wzorzec co `mountainThreshold`/`mountainThresholdWidth`).
- Nowy noise handle `moistureRegion` w `noiseHandlesFor` (kolejny XOR seeda, jak `continent`/`mountain`).
- `sampleRawTexel` liczy `mr = fbm01(noise.moistureRegion, wx/moistureRegionScale, wz/moistureRegionScale, region.moistureRegionFbm)` — jedna liczba [0,1], nisko = sucho (pustynia), wysoko = mokro (bagno), środek = las/łąka. **Niezależna** od `continentalness`/`mountainRidge` (inna seed-XOR, inny szum) — pustynia i bagno mogą leżeć w dowolnym miejscu na dowolnej wysokości ponad poziomem morza, tak jak dziś góry nie zawsze pokrywają się z najwyższym pasem `continentalness`.
- `ChunkTileData` += `moistureRegion: Float32Array` (ta sama apron-inclusive siatka co `continentalness`/`mountainRidge`).
- Istniejące `biomes`/`moisture` (`noise.biome`, `96`) **zostaje bez zmian** — dalej lokalny detal/dithering na granicach regionu i wewnątrz lasu (unika twardej krawędzi między biomami, tak jak dziś unika płaskiego wypełnienia w obrębie jednego regionu).

**Klasyfikacja (miękka, wagowa — nie `switch` na sztywnych progach):** w nowym `src/terrain/biomeRegions.ts` (mały, czysty moduł jak `worleyNoise.ts`/`fbm.ts` — bezpieczny w workerze):

```ts
export type BiomeWeights = { desert: number; swamp: number; forest: number }
export function biomeWeightsAt(moistureRegion: number, altitude01: number, region: RegionParams): BiomeWeights
```

- `desert`: `smoothstep(moistureRegion, desertThreshold + width, desertThreshold)` (odwrócony — niżej = bardziej pustynnie) × `1 - treelineFade` (pustynia nie sięga wysoko w góry — tam i tak przejmuje `applyMountainRock`/śnieg).
- `swamp`: `smoothstep(moistureRegion, swampThreshold - width, swampThreshold)` × `flatLowlandFactor` (bagno tylko nisko i płasko — reużyć tego samego `altitude01` co treeline, próg dużo niższy, np. `< 0.15` zamiast `0.6`, żeby bagna leżały blisko `waterLevel`, nie na wzgórzach).
- `forest`: reszta (`1 - desert - swamp`, przycięte do [0,1]) — dzisiejszy domyślny "humid/plains" wygląd, bez zmian w tym, jak wygląda dziś.
- Wagi sumują się ~do 1, blendowane jak wszystko inne w tym pipeline (`lerpHSL`/`smoothstep`), żeby granice były miękkie, nie postrzępione.

## Kolory (`src/terrain/biomeColors.ts`)

- Dwie nowe height-splajny obok `createAridSpline`/`createHumidSpline`: `createDesertSpline` (piasek/wydmy → rdzawa skała → bez śniegu nisko, przechodzi w istniejący `SNOW` dopiero bardzo wysoko — pustynne szczyty to nadal rzadkość), `createSwampSpline` (ciemna, oliwkowo-brązowa muddy ziemia, wąski zakres wysokości blisko `waterLevel` — bagno z definicji nie ma "wysokiej" wersji).
- `colorForTerrain` dostaje `biomeWeights: BiomeWeights` obok istniejącego `moisture` — blenduje **cztery** kolory zamiast dwóch (`arid × (1-desert-swamp niejawnie już w moisture) `, plus `desert`/`swamp` jako dodatkowe wagi na wierzchu, tą samą `lerpHSL` maszynerią co dziś). Konkretnie: policz `landTmp` jak dziś (arid↔humid po `moisture`), potem `landTmp.lerpHSL(desertColor, desertWeight)`, `landTmp.lerpHSL(swampColor, swampWeight)` — desert/swamp nadpisują tylko tam, gdzie ich waga > 0, gdzie indziej zero zmian względem dzisiejszego wyglądu.
- Bagno dodatkowo: `SAND_BAND`/`applySlopeRock` nie zmieniają się, ale seabed→sand blend w obrębie bagna powinien dawać błotnistą, nie piaszczystą plażę — **otwarte pytanie na etap implementacji**, może wystarczy że `swampWeight` też przyciemnia `SAND` w `colorForTerrain`, zamiast osobnej ścieżki.

## Roślinność (`src/terrain/chunkVegetation.ts`, `src/settlement/props.ts`, `src/terrain/chunkManager.ts`)

- `VegetationPlacement.kind` rozszerzone z `'tree' | 'bush'` na `'tree' | 'bush' | 'cactus' | 'reed'`. `computeChunkVegetation` liczy `biomeWeightsAt(...)` per kandydat (już ma `tile.continentalness`/wysokość pod ręką, dodaje `tile.moistureRegion`) i wybiera pulę gatunków ważoną biomem zamiast dzisiejszego czystego `moisture`-based tree/bush:
  - `desertWeight` wysoki → `cactus` (i rzadziej `bush` jako "suchy krzak" — reużycie istniejącego `BUSH_SPECS`, nie nowa geometria) zamiast `tree`. Gęstość ogólna niższa (pustynia ma być rzadka, nie zalesiona pustym kaktusem co metr).
  - `swampWeight` wysoki → `reed` (trzcina, gęsty niski klaster przy wodzie) + rzadkie `tree` jako "martwe/powyginane drzewo bagienne" (nowy wpis w `TREE_SPECS`-podobnej tabeli, nie osobny system). **Ważne:** dzisiejszy hard-reject `h <= waterLevel + 0.5` (underwater/shoreline) musi mieć wyjątek dla `reed` — bagno z definicji rośnie tuż przy/nad wodą, gdzie dziś nic nie może się zasadzić.
  - `forestWeight` (default) → bez zmian względem dzisiejszego tree/bush mix.
- `props.ts`: `CACTUS_SPECS`/`REED_SPECS` (te same `{ url, height }` tablice co `TREE_SPECS`/`BUSH_SPECS`), fallbacki `createCactus()` (kilka zielonych `CylinderGeometry`/`BoxGeometry` segmentów, flat-shaded, w stylu `createTree`) i `createReed()` (pęk cienkich stożków/cylindrów). **Nieblokujące assety** — ten sam wzorzec co drzewa/krzewy: `loadPropOrFallback` łapie błąd i renderuje fallback, więc GLB może fizycznie nie istnieć w `public/models/nature/` na start.
- `chunkManager.ts`: analogicznie do `treeTemplatesPromise`/`bushTemplatesPromise`, dodać `cactusTemplatesPromise`/`reedTemplatesPromise`, rozszerzyć `placement.kind === 'tree' ? treeTemplates : bushTemplates` na 4-wariantowy wybór.
- `grass.ts` (mniejszy dodatek, ta sama siatka danych): gęstość trawy → ~0 w `desertWeight`, tint → ciemniejszy/bardziej oliwkowy w `swampWeight`, reużywając już przeciąganą przez `chunkVegetation`-podobny worker payload `tile.moistureRegion` (grass już dziś czyta `tile.biomes`/`tile.mountainRidge` z tego samego tile — jeden dodatkowy sample, nie nowa ścieżka danych).

## Konfiguracja / GUI

Nowe pola w `region` (`worldConfig.ts` `baseConfig().terrain.region`) + wiersze w istniejącym folderze **Regions** w `createDebugGui.ts` (nie nowy top-level folder — to ta sama rodzina co `oceanThreshold`/`mountainThreshold`): `Moisture region scale`, `Desert threshold`, `Swamp threshold`. Domyślne progi tak dobrane, żeby na starcie (seed domyślny) było widać przynajmniej fragment każdego biomu bez ręcznego strojenia — do zweryfikowania wizualnie przy implementacji, nie da się tego dobrze zgadnąć bez podglądu.

## Sawanna / inne biomy — świadomie odłożone

Klasyfikacja wagowa (`BiomeWeights`) jest zaprojektowana tak, by dodanie czwartego/piątego biomu (sawanna: `moistureRegion` nisko-średnie + `continentalness` blisko wybrzeża, kolor spline zbliżony do `arid` ale z rzadkimi drzewami zamiast kaktusów; ewentualnie tundra/tajga: chłodne wysokie `altitude` + wysoka `moistureRegion`, sosny zamiast liściastych) było dopisaniem jednej wagi + jednego spline'a + jednej pozycji w tabeli gatunków, nie przeprojektowaniem. Nie robimy tego teraz — trzy biomy (+ istniejące domyślne "las/łąka") to już nowa oś do przetestowania wizualnie; więcej naraz utrudnia ocenę, czy progi/kolory w ogóle się sprawdzają.

## Otwarte pytanie: osada w pustyni/bagnie

`findSettlementSite.ts` dziś nie zna `moistureRegion` — wybiera miejsce po płaskości/wysokości/dystansie, nie po biomie. Po tym planie osada **może** wylądować na pustyni lub bagnie czystym trafem generacji. To może być ciekawe (zgodne z ideą "świat, który nie jest budowany wokół gracza" — [VISION.md](../VISION.md) §2) albo nie wyglądać dobrze (chaty na piasku bez drewna w zasięgu). **Nie rozstrzygać teraz** — zaobserwować przy weryfikacji na kilku seedach, ew. osobny follow-up (np. lekka preferencja `forestWeight` w scoringu `findSettlementSite`) jeśli okaże się problemem w praktyce, nie z góry.

## Poza zakresem teraz

- Sawanna/tundra i inne dodatkowe biomy (patrz wyżej — architektura na to pozwala, nie implementujemy dziś)
- Ambient audio zależne od biomu (świerszcze pustyni, żaby bagna) — naturalny follow-up do [ambient-world-audio](./2026-08-07--016--ambient-world-audio.md), osobny plan
- Unikalna fauna per biom (skorpiony pustyni, żaby bagna) — [predator-prey-system](./2026-08-07--010--predator-prey-system.md) już ma role/spawnery; przypisanie spawnerów do biomu to osobny, większy temat
- Zmiana `findSettlementSite` pod kątem biomu — patrz "Otwarte pytanie" wyżej
- Wpływ na `waterBodies.ts`/kolor wody w obrębie bagna (dziś jedna globalna woda) — kosmetyczne dopracowanie bagna, nie blokuje pierwszej iteracji

## Weryfikacja (po implementacji)

- `npm run dev` → wizualna inspekcja na kilku seedach: widoczne, rozpoznawalne płaty pustyni (piasek/kaktusy) i bagna (ciemna ziemia/trzciny) osobno od zwykłego lasu/łąki, miękkie przejścia bez postrzępionych krawędzi
- Kaktusy/trzciny renderują się (GLB lub proceduralny fallback) bez błędów w konsoli
- Brak regresji: istniejący las/łąka (domyślny `forestWeight`) wygląda jak dziś tam, gdzie `desertWeight`/`swampWeight` ≈ 0; NPC/fauna nadal chodzą poprawnie (propsy bez kolizji, jak dziś)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — brak błędów

## Powiązane

- [roads-and-paths](./2026-08-07--026--roads-and-paths.md) — kolejna warstwa na tym samym `sampleRawTexel`/`ChunkTileData` (droga/ścieżka jako jeszcze jeden blend koloru + wpływ na roślinność, ten sam wzorzec)
- [world-streaming-persistence](./2026-08-07--007--world-streaming-persistence.md) — makro regiony (oceany/góry), ten plan to ta sama oś rozszerzona o wilgotność
- [world-visual-overhaul](./2026-08-07--024--world-visual-overhaul.md) — kierunek "więcej roślinności", kaktus/trzcina to jego naturalna kontynuacja
- [ambient-world-audio](./2026-08-07--016--ambient-world-audio.md) — przyszły follow-up (dźwięki per biom)
- [research/2026-08-07--3d-asset-sources.md](../research/2026-08-07--002--3d-asset-sources.md) — Quaternius jako źródło assetów; brak jeszcze zidentyfikowanego pack'u z kaktusem/trzciną, do sprawdzenia przy implementacji (nieblokujące — fallback proceduralny)
- `src/terrain/chunkHeightmap.ts`, `src/terrain/biomeColors.ts`, `src/terrain/chunkVegetation.ts`, `src/terrain/grass.ts`, `src/settlement/props.ts`, `src/terrain/chunkManager.ts`, `src/config/worldConfig.ts`, `src/ui/createDebugGui.ts`
