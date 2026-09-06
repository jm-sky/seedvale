# Seedvale — Woda

**Purpose:** źródło prawdy dla wody (ocean + jeziora / cieki śródlądowe): stan techniczny i wizualny, standing decisions, hydrologia rzek.

**Nie jest:** planem implementacji ([plans/](../plans/README.md)), logiem całej grafiki ([GRAPHICS.md](../architecture/GRAPHICS.md) — tam zostają kontrakty G4–G6), ani katalogiem assetów.

**Last verified:** 2026-09-06 (rzeki: technicznie zweryfikowane, browser check rzek/wodospadów jeszcze nie zrobiony — zob. Otwarte)

Gdy ten plik rozjeżdża się z kodem — **wygrywa kod**, potem aktualizujemy ten dokument.

---

## Jak używać

1. Przed zmianą oceanu, jezior, brzegu, `waterLevel` albo `bodyScale` — przeczytaj **Standing decisions** i **Stan obecny**.
2. Kontrakty renderu (depthWrite, mirror RT, foliage) zostają w [GRAPHICS.md](../architecture/GRAPHICS.md) G4–G6; szczegóły domeny wody są tutaj.
3. Po decyzji użytkownika albo zweryfikowanym fixie — zaktualizuj stan / decyzje tutaj; szczegóły implementacji/historia zostają w planie/issue, nie tutaj.
4. Issue/plan mogą szczegółować pracę; trwała reguła ląduje tutaj.

Status wiedzy: `✅` potwierdzone w przeglądarce · `🔧` zaimplementowane, bez browser check · `📝` decyzja / kierunek · `❓` otwarte.

---

## Standing decisions

Trwałe reguły. Zmiana = aktualizacja tej tabeli (historia decyzji zostaje w planie/issue, nie tutaj).

| ID | Decyzja | Skutek |
|----|---------|--------|
| W1 | **Jedna rodzina shadera, dwa strojenia** (jezioro / ocean). Bez `Water.js`, bez SSR / refrakcji / trzeciego mesha. | faza 2–3 planu 098 ✅ |
| W2 | Ocean = **jeden** plane, follow gracza, **nie** per-chunk. | G5 (geometria). Shader = `waterMaterial.ts` |
| W3 | Woda: `transparent: true`, **`depthWrite: false`**. Nie łączyć transparent + depthWrite + wysokiego `renderOrder`. | G4, issue [022](../issues/2026-08-12--022--ocean-through-tree-foliage.md) |
| W4 | Liście GLTF `BLEND` → opaque `alphaTest` cutout. Korony piszą depth, woda nie. | G3 |
| W5 | Chunk water maskuje się heightmapą (`vCover`). `bodyScale` 1 = strojenie oceanu (nie discard). | W8 + faza 2 ✅ |
| W6 | **Performance jest constraint.** Lustro sceny = **jeden** wspólny pass (nie per-chunk). Wyłącznik w Vue. Mirror RT mały (**128²**), max **30 Hz**, bez NPC/fauny. | G2; G5; plan 113 |
| W7 | Weryfikacja wizualna = **przeglądarka**, nie sam `tsc`/lint/build. | G8 |
| W8 | **Ocean tylko morze / wybrzeże.** Śródlądowe jeziora, stawy i cieki nigdy nie używają materiału oceanu, niezależnie od powierzchni w chunku. | issue [028](../issues/2026-08-13--028--inland-water-dual-material.md) ✅ |
| W9 | **Lustro sceny** (planar, jedna RT) na jeziorach **i** oceanie, z opcją wyłączenia w Vue (Pauza → Świat / Grafika) + `seedvale:graphics:v1`. Off → niebo + specular, **zero** extra passu. Default: włączone. | `waterMirror.ts`; faza 3 ✅ |
| W10 | Przezroczystość **z głębokości** (`floorHeights`): przy brzegu widać piasek, w głębi gęstsza/ciemniejsza. Nie akwarium, nie prawie-opaque. | faza 2 ✅ |
| W11 | Brzeg: miękki fade + linia piany z maski + mokry piasek na terenie. | faza 2 ✅ |
| W12 | Ruch: jezioro = drobne zmarszczki world-space; ocean = wolniejsza, większa fala. Rzeki (od planu 181) mają **własny**, osobny lekki materiał (`riverWaterMaterial.ts`) — nie tę samą rodzinę shadera co jezioro/ocean, choć reużywa jego dzień/noc uniform-setterów bez zmian. | faza 2 ✅; rzeki: plan 181 |
| W13 | Rzeki są **geometrią osobną od jezior/oceanu**: każdy world point należy do dokładnie jednego 256 m "river tile" (deterministyczne, seed-independent), nie do klasyfikacji `bodyScale`/`vCover`. Rzeki **nie** karmią z powrotem `sampleFloorAt`/gameplay terrain poza samym channel carving (plan 189, tylko obniża wysokość, nigdy nie podnosi). Waterfalls i pełna parytetowość shadera/renderu z jeziorem/oceanem są świadomie odłożone. | plany 181/189, [terrain-and-world-generation.md](../state/terrain-and-world-generation.md) |

---

## Kierunek wizualny (zaakceptowany 2026-08-13)

Rozmowa: pół-realistyczna, trochę przezroczysta, bez ciężkiego CPU/GPU. Potem doprecyzowanie: lustro sceny **tak**, ale z wyłącznikiem.

| | Śródlądzie (jezioro / staw / ciek) | Ocean (tylko wybrzeże / morze) |
|--|-------------------------------------|--------------------------------|
| Shader | ta sama rodzina | ta sama rodzina, inne uniformy |
| Kolor | jaśniejszy, płytszy cyan/zieleń | ciemniejszy teal, większa „masa” |
| Fale | drobne zmarszczki, `world.xz` | wolniejszy, większy swell |
| Maskowanie | heightmap `vCover` (jak dziś) | shore fade na singleton plane (issue 003) |
| Głębokość | `floorHeights` → alpha + kolor | to samo na styku z lądem; otwarte morze gęstsze |
| Brzeg | fade + piana + mokry piasek | fade + piana + mokry piasek |
| Odbicia | wspólne lustro 128² @ 30 Hz, albo sky+spec gdy off | to samo lustro / ten sam fallback |
| Nurt | nie teraz | n/d |

**Koszt lustra:** jeden extra render sceny, throttled to 30 Hz, without NPC/fauna. Wyłączenie w menu ma być realnym spadkiem GPU (pass w ogóle nie startuje). Miejsce UI: Pauza → **Świat**, sekcja grafiki (obok flat shading); persist jak AO/bloom (`seedvale:graphics:v1`). lil-gui zostaje debugowym odpowiednikiem.

**Świadomie nie:** SSR, refrakcja, caustics, flow rzek, mesh per basen, powiększanie mirror > 256².

---

## Architektura

```text
heightmap (worker)
  heights[]      — ląd + pokrywa walk/mask (clamp do waterLevel)
  floorHeights[] — prawdziwa wysokość (mesh terenu + shader głębokości + pływanie)
        ↓
detectWaterBodies()  — BFS 4-sąsiedztwo w obrębie JEDNEGO chunka (+ apron)
        ↓
computeBodyScale()   — 0 ląd · jezioro < 0.9 · 1.0 ocean (kontynentalność)
        ↓
src/world/waterMaterial.ts     jedna rodzina ShaderMaterial (uOcean 0..1)
        ↓
src/world/waterMirror.ts       jeden RT 128² @ 30 Hz; y = waterLevel; hide water (layer 1) + agents (layer 2)
        ↓
┌───────────────────────────────────┬─────────────────────────────────────┐
│ createChunkWater (per chunk)      │ createOcean (singleton, WorldBundle)│
│ USE_CHUNK_MASK: vCover + depth    │ uOcean = 1, bez heightmapy          │
│ uOcean z bodyScale (jezioro/morze)│ radial fade poza loadRadius         │
│ fale world.xz; piana z vCover     │ fale world.xz (swell)               │
│ y = waterLevel + 0.07, order 1    │ y = waterLevel + 0.02, order 0      │
│ PlaneGeometry chunkSize, ≤256 seg.│ Plane + 64 seg., follow(player)     │
│ bindWaterMirror (wspólne uMirror) │ owns RT; renderMirror w gameLoop    │
└───────────────────────────────────┴─────────────────────────────────────┘
```

Klasyfikacja oceanu: `continentalness` vs `oceanThreshold` / `coastThreshold` (`oceanMixAt`). Pole stawu w chunku **nie** promuje go na ocean. `lakeScaleFor` jest capowane do `LAKE_SCALE_MAX` 0.85.

Ocean powstaje w `rebuildWorldBundle()`; rozmiar plane = `(unloadRadius * 2 + 4) * chunkSize`. Singleton jest schowany wewnątrz `loadRadius * chunkSize` (chunk water rysuje brzeg). `gameLoop` woła `ocean.follow(player.xz)`, `ocean.update(dt)` i `ocean.renderMirror()` przed composerem. Jeziora: `ChunkManager` tworzy/niszczy mesh przy streamie chunka; `update(dt)` + `setDayNight` idą przez `chunkManager`. Lustro: `postProcessing.waterReflections` (default on); off = `uReflections = 0` i brak passu.

---

## Stan obecny

### Techniczny

| Element | Jak jest |
|---------|----------|
| `waterLevel` | `WorldConfig.terrain.waterLevel`, default **0.45**; GUI live (rebuild) |
| `bodyScale` | 0 ląd; inland `min(lakeScaleFor(area), 0.85)`; 1 = ocean (`oceanMixAt` > 0.9) |
| Mesh terenu pod wodą | `floorHeights` — wanna pod taflą; `heights` zostaje clampem dla maski / trawy / `sampleHeight` |
| Batymetria | `floorHeights` → mesh + shader (`depth = waterLevel - floorH`) + pływak / ambient |
| Maska chunk water | `vCover` z heightmapy; `discard` gdy `< 0.02`. Komórki oceanu **rysowane** (nie discard) |
| Fale | 3–4 sine w **world.xz**; jezioro drobne zmarszczki, ocean wolniejszy swell (`mix` z `vOcean`) |
| Foam | z `1 - vCover` + `fwidth(vCover)` przy brzegu, nie z amplitudy fali |
| Kolor | `mix(shallow, deep, depthT)` + fresnel; palety jezioro vs ocean |
| Paleta dzień/noc | `setWaterDayNight(dayFactor, sunDirection)` lerp 6 kolorów + sun specular |
| Shader | `src/world/waterMaterial.ts` — jeden program-ród, `USE_CHUNK_MASK` na jeziorach |
| Ocean singleton | ten sam shader, `uOcean = 1`; radial fade poza `loadRadius`; lustro 256² (`waterMirror.ts`) |
| Toggle odbić | `WorldConfig.postProcessing.waterReflections`; Vue Pauza → Świat → Grafika; lil-gui Post-processing; `seedvale:graphics:v1` |
| Mokry piasek | terrain fragment: przyciemnienie albedo w paśmie `waterLevel` .. `+0.4` |
| Szwy chunków | mesh wody = `chunkSize` (bez overlap 1.02); faza fal wspólna (world-space) |
| Gameplay | NPC/drogi/namiot/kopanie **odrzucają** wodę; gracz pływa (cap głębokości). Fauna (plan [fauna-015](../plans/fauna-015-animal-water-traversal-wading-swimming-and-drowning.md)) już nie traktuje wody jako twardej ściany — `terrain/waterSample.ts`'s `sampleLocalWater()` (jezioro/ocean z `floorHeights`, rzeka z kanonicznych `waterH`/`bedH`) + `fauna/waterTraversal.ts`'s czysty klasyfikator dry/wading/swimming/blocked (głębokość skalowana z `AnimalDef.scale`, minimalna deklaratywna `AnimalDef.water` capability — kaczka pływa tanio, gatunek bez `canSwim` nie wchodzi w głęboką wodę) zasilają `AnimalAgent.isWalkable()`, dzielone 1:1 przez autonomiczny i dosiadany ruch. Pływanie zużywa istniejącą staminę (`tickAnimalLife`'s `swimExertion`); wyczerpanie podczas `swimming` (nie `wading`/`dry`) odbiera HP przez istniejący `damageHealth`/death lifecycle. Picie zwierząt = plan [094](../plans/archive/2026-08-13--094--fauna-food-water-for-satiety-hydration.md), nie render |

Wejścia kodu:

```text
src/world/waterMaterial.ts
src/world/waterMirror.ts
src/world/createOcean.ts
src/world/createWater.ts
src/terrain/waterBodies.ts
src/terrain/chunkHeightmap.ts      detect + bodyScale + clamp heights
src/terrain/chunkManager.ts        createChunkWater / update / setDayNight
src/terrain/buildChunkGeometry.ts  mesh z floorHeights (wanna); mokry piasek (uWaterLevel)
src/app/worldBundle.ts             createOcean
src/app/gameLoop.ts                follow + setDayNight
src/terrain/biomeColors.ts         pas piasku / dna (smoothstep, issue 001)
src/player/PlayerController.ts     pływanie po floorHeights
```

### Rzeki (cieki śródlądowe, plany 181/189)

Pure `src/terrain/hydrology.ts` (D8 flow direction + iterative accumulation nad ograniczoną siatką analizy, sampled z `sampleFloorAt`) karmi `src/terrain/riverNetwork.ts`: świat jest podzielony na stałe, seed-independent 256 m "river tiles" (każdy analizowany z 256 m halo wyłącznie dla dokładności akumulacji przy własnych krawędziach — nigdy po to, by rozciągnąć renderowaną geometrię na sąsiedni tile), więc dane rzeki w każdym punkcie świata należą do dokładnie jednego tile'a niezależnie od tego, który chunk go wyzwala. Sklasyfikowane komórki (po flow accumulation) tworzą połączone łańcuchy przez D8, wygładzone (Chaikin corner-cutting ×2, endpoints fixed — nie meandrowanie w sensie erozji) plus deterministyczne world-space meandrowanie (seeded `simplex-noise`, tapered do 0 w promieniu 32 jednostek od krawędzi tile'a, więc punkty nigdy nie wychodzą poza swój tile).

**Dry-sink repair (plan world-terrain-011).** Plan world-terrain-006 zaczął odrzucać cały łańcuch rzeki, gdy trafiał na suchy zamknięty D8 sink (`reachedInvalidReceiver` w `buildChains()`) — poprawne dla widocznego "rzeka kończy się w powietrzu", ale zbyt agresywne: jeden suchy dołek potrafił skasować całą sensowną górną zlewnię. `computeHydrologyRegion()` liczy teraz w dwóch przejściach: surowe D8 + accumulation, potem `resolveMeaningfulDrySinks()` próbuje ograniczonej, deterministycznej naprawy tylko dla suchych `SINK` (nie `OCEAN_OUTLET`) z accumulation >= progu (`DepressionRepairOptions.minAccumulationForRepair`, w `computeRiverTile()` ustawiony na `thresholds.stream` tej samej klasyfikacji, nie osobny system gęstości) — słabe/szumowe dołki zostają sinkiem bez próby. Dla kwalifikujących się sinków `findBreachPath()` robi ograniczone (priority-queue, minimax po elevation, deterministyczny tie-break po flat index) poszukiwanie najtańszej drogi do komórki o niższej surowej elevation niż sam sink, w obrębie już-spróbkowanego okna (nigdy nie sampluje dalej); znaleziona ścieżka dostaje ściśle malejący profil "working elevation" (tylko obniżanie, nigdy podnoszenie — `BREACH_MIN_STEP` gwarantuje ścisły spadek), odrzucany gdy przekracza budżet (`maxSearchCells`/`maxPathCells`) lub wymagane cięcie (`maxCutDepth`/`maxTotalCut`) — głębokie/duże baseny zostają nierozwiązane zamiast sztucznego kanionu. Jeśli którykolwiek breach zostanie zaakceptowany, D8 + accumulation liczone są **raz** na skorygowanej elevation (nie iteracyjnie do punktu stałego); zwrócone `HydrologyRegion.elevation` to wersja po naprawie, bo to ona napędza `RiverPoint.elevation` (kanoniczna `waterH`/`bedH` i channel carving) — naprawiony sink fizycznie obniża wyrzeźbiony teren przez ten sam `applyRiverChannel()`, bez osobnej reprezentacji jeziora. `buildChains()`'s `reachedInvalidReceiver` zostaje jako ostatni defensywny guard tylko dla tego, co naprawa zostawiła nierozwiązane. Żadnego globalnego stanu, workera ani jeziora — to nadal follow-up, nie część tego fixa.

**Ciągłość ujścia + adaptacja terenu (plan world-terrain-013).** Widoczna sucha przerwa ~50–100 m przed morzem okazała się defektem *ekstrakcji*, nie hydrologii: `buildChains()` stosował próg `MIN_CHAIN_POINTS = 8` do każdego tile-lokalnego fragmentu, a rzeka wchodząca do sąsiedniego core'a jest celowo traktowana jak nowa lokalna głowa (`hasClassifiedUpstream` patrzy tylko na sklasyfikowane komórki **core**) — więc poprawna kontynuacja krótsza niż 8 komórek D8 (~64 m) do własnego odbiornika była wyrzucana w całości. `buildChains()` liczy teraz dodatkowo `hasClassifiedInflow` nad całym oknem (core **i** halo): głowa zasilana sklasyfikowanym dopływem spoza core'a to kontynuacja, nie szum progowy, i obowiązuje ją `MIN_CONTINUATION_CHAIN_POINTS = 2` zamiast pełnego cutoffu; izolowane lokalne źródła zachowują stary próg, więc krótkie blipy nadal są filtrowane. Bez drugiej reprezentacji rzeki, bez snapowania do brzegu, bez stanu cross-tile — własność tile'i, halo i `reachedInvalidReceiver` bez zmian.

Diagnostyka terminali (`RiverChainTerminal`/`RiverChainRejection`/`RiverChainDiagnostic` + `computeRiverTileDiagnostics()`) jest **tylko** narzędziem testowym/diagnostycznym: produkcyjne `computeRiverTile()` i `riverTileCache` nadal cache'ują wyłącznie kompaktowe `RiverChain[]`, bez metadanych terminala. `probeDownstreamTerminal()` (`hydrology.ts`, `DEFAULT_DOWNSTREAM_PROBE_STEPS = 48` ≈ 384 m halo przy 8 m kroku) odpowiada na ograniczone pytania "co jest poniżej tej komórki" idąc istniejącą topologią D8 (`water-receiver` / `dry-sink` / `dry-boundary-exit` / `rerouted` / `budget-exceeded`) — nigdy nie sampluje terenu, nie szuka geometrycznie najbliższej wody i nie generuje sąsiedniego tile'a/chunku.

Sama naprawa sinków została **rozwinięta w miejscu**, nie zduplikowana: `findBreachPath()` porządkuje frontier prawdziwym kosztem minimax (najwyższa elevation, którą musi przekroczyć najtańsza znana trasa, z relaksacją poprzednika), zbiera do `maxEscapeCandidates` ucieczek zamiast zatrzymywać się na pierwszej i wycenia każdą jawną, monotoniczną funkcją kosztu (max cięcie ≫ suma cięcia ≫ długość ścieżki ≫ jakość odbiornika) — dłuższa, płytsza trasa wygrywa z krótką i głęboką, a kandydat, którego własny bieg w dół rozwiązuje się w kolejnym *nierozwiązanym suchym sinku*, jest odrzucany (ucieczka do drugiej zamkniętej niecki to nie ujście). Odrzucony kandydat nie przerywa już całego wyszukiwania, więc sink za zbyt drogą grzędą może zostać rozwiązany tańszą bramą. Nowe jawne budżety (`maxEscapeCandidates`, `receiverProbeSteps`) dołączają do istniejących w `DepressionRepairOptions`, a `maxPathCells` liczy teraz jednoznacznie komórki wnętrza, które breach faktycznie obniża. Semantyka `OCEAN_OUTLET`, pojedynczy końcowy recompute D8 + accumulation i kanoniczna ścieżka łańcuch → carving/render pozostają bez zmian; realnie zamknięte niecki i duże bariery nadal zostają nierozwiązane (kandydaci na przyszłe semantyki jeziora/spill level).

`src/terrain/riverTileCache.ts` liczy tile raz (synchronicznie, main thread, ~18ms zmierzone) i reference-countuje go po załadowanych chunkach pokrywających go (ta sama idea co chunk-membership counting w `vegetationRegionBatcher.ts`); `ChunkManager` attach/dispose per-chunk river ribbon (`src/world/riverGeometry.ts`'s `clipChainToRect`/`buildRiverRibbonGeometry`) razem z `WorldWater`. Szerokość wstążki pochodzi z eased `flowFactor()` (0..1) z `widthFromAccumulation()`, więc małe strumienie są wizualnie subtelniejsze niż główne rzeki; per-vertex `aFlow` attribute pozwala fragment shaderowi (`riverWaterMaterial.ts`) zmiękczać alpha brzegu/foam/streak dla nisko-przepływowych wstążek.

River channel carving (plan 189, kanoniczny przekrój — plan world-terrain-010) dodaje trzeci `computeChunkTile` terrain-modifier stage (`chunkHeightmap.ts`'s `applyRiverChannel`, po roads/clearings) — `riverNetwork.ts`'s `riverChannelSegmentsNear` zamienia ten sam kanoniczny, już-zmeandrowany łańcuch (który renderuje wstążka wody) na `RiverChannelSegment[]`. Zamiast jednego `halfWidth`/`depth`, segment niesie osobno: `waterHalfWidth` (wąska szerokość wody — ta sama co `widthFromAccumulation`, i to ona napędza `nearestRiverBankDistance`/gameplay "water edge") i szerszy `channelHalfWidth` (krawędź brzegu, `waterHalfWidth` + flow-scaled margines — celowa przestrzeń na czytelny brzeg + roślinność nadwodną), plus `bedH`/`waterH` per endpoint. `waterH = elevation - exposedBankFromFlow(flow)` i `bedH = waterH - submergedDepthFromFlow(flow)` — oba budżety (`EXPOSED_BANK_MIN/MAX` 0.15–0.8 m, `SUBMERGED_DEPTH_MIN/MAX` 0.12–1.6 m) są niezależne i zawsze dodatnie, więc inwariant `bedY < waterY < bankTopY` i `waterWidth < channelWidth` trzyma się z konstrukcji, nawet dla ledwo-sklasyfikowanego strumienia. `applyRiverChannel`'s `riverChannelCandidate` liczy teraz kawałkowy przekrój po `dist` (płaskie dno → podwodne zbocze do `waterH` → wynurzony brzeg do `floorH` tego samego teksela), nie jeden stały `bedH` + zewnętrzny falloff. Channel bed height jest ściśle malejące w dół rzeki z konstrukcji (D8 elevation ściśle maleje, accumulation nigdy nie maleje — udowodnione w testach), więc nie potrzeba osobnego passu korekcji monotoniczności. Carving tylko obniża teren (`Math.min(...)`), nigdy nie podnosi.

Wstążka wody (`riverGeometry.ts`) **nie** sampluje już renderowanego terenu — Y liczy `canonicalWaterHeight(point)` (`= elevation - exposedBankFromFlow(flow)`), czysta funkcja hydrologii punktu, deterministyczna i ciągła między chunkami tak samo jak `elevation`/`accumulation`. `RIVER_SURFACE_OFFSET` to teraz tylko epsilon anty-z-fighting (0.02, nie 0.2) — przed plan world-terrain-010 ten sam stały offset *był* efektywną głębokością małych strumieni (`MIN_CHANNEL_DEPTH` 0.15 < offset 0.2), co dawało wodę na/ponad otaczającym terenem ("blue ribbon"); teraz `exposedBankFromFlow` gwarantuje minimalny recessed dystans niezależnie od offsetu.

Rzeki **nie** karmią z powrotem `sampleFloorAt`/gameplay terrain poza samym carvingiem powyżej. Wodospady (plan 181, Etap 7 dokończenie 2026-08-25) są renderowane bez osobnej geometrii/systemu: `riverGeometry.ts`'s `waterfallFactor()` liczy per-vertex rise-over-run między kolejnymi punktami tej samej już-wyciętej per-chunk `run` (z ich własnej cached `elevation`, bez dodatkowego samplowania), zapisywane jako nowy `aFall` attribute obok `aFlow`; `riverWaterMaterial.ts` miesza wstążkę w stronę prawie-opaque piany + szybszy, wielokierunkowy wzór "mgły" przy stromym spadku. Pełny shader/rendering parity z jeziorem/oceanem (reflection binding, depth-based foam), asymetryczne (lewy≠prawy) profile brzegów i worker offload dla hydrologii pozostają świadomie odłożone bez pomiarowego uzasadnienia (patrz [plans/LOOSE-ENDS.md](../plans/LOOSE-ENDS.md)). Browser verification kanonicznego przekroju jeszcze nie zrobiony (plan world-terrain-010).

**Integracja rzek z resztą worldgenu (2026-09-06).** Rzeki są teraz respektowane przez placement osad, fauny i przez drogi — wszędzie przez tę samą kanoniczną geometrię (`RiverChannelSegment[]`), nigdy przez drugą reprezentację:

- **Osady.** `terrain/riverQuery.ts` (`createRiverQuery(sampleParams)`) to analityczny seam "jaka geometria rzeki jest w tym pudełku" dla placementu, który działa niezależnie od streamingu chunków (dlatego świadomie osobny od reference-counted `riverTileCache.ts`; oba liczą przez to samo czyste `computeRiverTile`, więc nie mogą się rozjechać). Query jest rejestrowane world-scoped w `settlementPlanCache.ts` (`setSettlementRiverQuery`) — cache defów jest world-scoped i "pierwszy pytający wygrywa", więc pole w kontekście dałoby layout zależny od tego, kto zapytał pierwszy. `settlementGenerator.ts` rozwiązuje segmenty **raz na osadę** (pudełko = najszersze site-search + footprint) i podaje je do `findSettlementSite` (twardy reject placu o `SITE_RIVER_CLEARANCE` = 8 m) i `planVillageLayout` (każdy plot odrzucany przez `footprintOverlapsRiver(segments, x, z, radius + 1)` — **footprint, nie punkt środkowy**). Ostatnia deska ratunku w `pickPlot` (bezwarunkowa z definicji) dostała `pushOutOfRiver` — krokowe wypchnięcie promieniowo od centrum wioski. Wioska nadal może stać **przy** rzece i wokół niej; zabroniony jest tylko aktywny kanał.
- **Ford (droga × rzeka).** `terrain/riverFord.ts` — dwie czyste funkcje (`fordStrength(roadFalloff, waterWidth)`, `fordBedHeight(bedH, waterH, ford)`). `computeChunkTexel` przekazuje falloff korytarza drogi ze stage'u 2 do `applyRiverChannel` w stage'u 3: tam, gdzie droga przecina wystarczająco mały kanał (pełny ford do szerokości wody 6 m, zanik do 0 przy 9 m — duża rzeka wymaga mostu, nie podniesionej ławicy), dno jest podnoszone do `waterH - 0.12`, więc przejazd zostaje płytki i przejezdny zamiast wpadać w pełnej głębokości koryto. Świadomie **bez** osobnego mesha/segmentów fordu: przecięcie jest własnością emergentną dwóch zestawów segmentów, które pipeline już niesie, więc jest bez szwu z tego samego argumentu co drogi i rzeki (każdy teksel w chunku widzi każdy segment sięgający tego chunku). Kanoniczna `waterH` i wstążka wody są nietknięte. Routing (`findRoute`) nadal nie modeluje rzek — drogi po prostu je przecinają.
- **Fauna.** `createFauna` przyjmuje `ChunkManager.riverShoreDistance`; `clearsRiverChannel(distance, clearance)` (czysta, eksportowana) gatuje **każdy** dziki spawn (`SPAWN_RIVER_CLEARANCE` 1.5 m) i osobno każdy habitat spawn point przez `spawnerSiteOk` (`SPAWNER_RIVER_CLEARANCE` 6 m) — generycznie dla wszystkich `SPAWNER_SPECS`, nigdy wyjątek per-gatunek. Bez `riverShoreDistance` (testy) zachowanie jest jak wcześniej.
- **Shader.** `riverWaterMaterial.ts` zamienił regularne `fract(vUv.y * 0.18 - uTime * 0.9)` streaki (czytane jako równomiernie rozstawione białe poprzeczki = szwy segmentów) na dwie oktawy taniego value noise, samplowane znacznie rzadziej wzdłuż nurtu niż w poprzek, więc refleks jest wyciągnięty wzdłuż prądu i nieregularny. `aFlow` i wodospadowa ścieżka `vFall` nietknięte.

Nadwodna/przybrzeżna roślinność (plan world-terrain-010, Fazy 4/6): `chunkVegetation.ts`'s `riparianPatches()` to osobny, ograniczony budżetowo pass (nie tylko podbite prawdopodobieństwo `reed` w zwykłej pętli) — patche trzcin/paproci-krzewów/drzew wzdłuż pasma `nearestRiverBankDistance`/istniejącego pasma linii brzegowej jeziora. `lilyPatches()` dokłada nowy `VegetationKind: 'lily'` (`LILY_SPECS`, `parked/Lilypad-01.glb` — fit `preparePropFitMax`, nie zwykły height-fit) tylko na płytkiej wodzie śródlądowej (`bodyScale` 0 < x < 0.9, nigdy ocean, nigdy wewnątrz kanału rzeki). Gęste klastry trzcin (osobne merged-mesh assety) i seaweed przybrzeżny (Fazy 5/7) **nie** zostały dodane — brak gotowych assetów, nikt ich w tej turze nie autorował.

Wejścia kodu:

```text
src/terrain/hydrology.ts
src/terrain/riverNetwork.ts
src/terrain/riverTileCache.ts
src/world/riverGeometry.ts
src/world/riverWaterMaterial.ts
src/world/createRiverWater.ts
src/terrain/chunkHeightmap.ts      applyRiverChannel (carving stage) + ford blend
src/terrain/riverFord.ts           fordStrength / fordBedHeight (road x river)
src/terrain/riverQuery.ts          analityczny river lookup dla placementu
src/terrain/chunkVegetation.ts     riparianPatches / lilyPatches (plan world-terrain-010)
```

Implementacja P0–P1 (unifikacja materiału jezioro/ocean, depth fade, brzeg, fale, wspólne lustro) jest zakończona. Pełna implementation history (issue-by-issue fixes, phase completions, screenshot diagnoses) jest przeniesiona z tego dokumentu — zob. plan [098](../plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) oraz issues [001](../issues/2026-08-07--001--water-shore-color-banding.md)/[002](../issues/2026-08-07--002--water-daynight-integration.md)/[003](../issues/2026-08-07--003--ocean-shoreline-artifacts.md)/[009](../issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md)/[022](../issues/2026-08-12--022--ocean-through-tree-foliage.md)/[028](../issues/2026-08-13--028--inland-water-dual-material.md). Jedyna wciąż aktualna, forward-looking pozycja: SSR/refrakcja/caustics/mirror > 256² — świadomie **nie**.

---

## Physical water query & WaterSource

`terrain/waterSample.ts`'s `sampleLocalWater()` jest jedyną, współdzieloną odpowiedzią "czy i jaka woda jest fizycznie w tym punkcie" (jezioro/ocean z `floorHeights`, rzeka z kanonicznych `waterH`/`bedH` — rzeka zawsze wygrywa gdy oba nakładają się). Główny konsument: `fauna/waterTraversal.ts`'s czysty klasyfikator dry/wading/swimming/blocked, dzielony 1:1 przez autonomiczny i dosiadany ruch fauny (zob. [fauna.md](./fauna.md#behaviour)).

`world/WaterSource.ts` to osobna, współdzielona abstrakcja drink/fill nad `well`/`lake`/`river`/`ocean` — nie ta sama warstwa co `sampleLocalWater()` (fizyczna obecność wody), tylko kontrakt "czy i jak można z tego pić/napełnić". Każde źródło niesie stały `WaterQuality` (`safe`/`unsafe`/`undrinkable`) i opcjonalny `consumptionRisk`: dziś rzeka jest **bezwarunkowo** `safe`, ocean **bezwarunkowo** `undrinkable` — kontekstowa jakość rzeki (zależna np. od pobliskiego skażenia) jest tylko planowana (`world-017`, nie rozpoczęty), nie zaimplementowana. Jedyny obecny `consumptionRisk` to nieprzykryta studnia gracza (zob. [player-systems.md](./player-systems.md#player-built-wells-plan-127-groundwaterprotection-by-plan-world-004)). Konsumenci: akcje gracza (`app/actions/survivalActions.ts`), `app/interactables.ts`, gospodarstwa (`Household.water` dla ludzi i zwierząt domowych, zob. [settlements.md](./settlements.md#gospodarstwa-plan-069)), `items/itemCatalog.ts`, oraz `persistence/saveData.ts` (tylko rekord studni gracza — sam `WaterSource` jest zawsze rekonstruowany, nigdy zapisywany wprost).

## Persistence

Teren/hydrologia/geometria wody są deterministyczną rekonstrukcją `(seed, region params)` — nigdy nie persystowane. Persystowany jest tylko stan zbudowany przez gracza (rekord studni, `SaveData.playerWells`, z `waterDepth`/`waterKind` zamrożonym raz przy postawieniu). Cache'e wewnątrzsesyjne (`riverTileCache`, brak analogicznego cache'u dla jezior/oceanu) są zwykłymi, nietrwałymi cache'ami nad czystymi funkcjami — nigdy źródłem prawdy. Zob. [persistence.md](./persistence.md) po pełną klasyfikację.

---

## Otwarte

| Temat | Status | Link |
|-------|--------|------|
| Blotches w lustrze oceanu | `verification needed` | issue [009](../issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md) — pass 256² wrócił w fazie 3; nie zagęszczać detail normals |
| Artefakty oceanu na telefonie | notatka | [plans/README.md](../plans/README.md) Quick notes; wyłączenie odbić (W9) |
| Rzeki: browser/perf verification | `verification needed` | plany [181](../plans/archive/2026-08-21--181--natural-mountains-and-rivers.md) / [189](../plans/archive/2026-08-21--189--river-channel-carving.md) |
| Rzeki: pełna parytetowość z jeziorem/oceanem, worker offload dla hydrologii | `todo`, świadomie odłożone bez pomiarowego uzasadnienia | [plans/LOOSE-ENDS.md](../plans/LOOSE-ENDS.md) |

---

## Powiązane

- [GRAPHICS.md](../architecture/GRAPHICS.md) — G3–G6, log 2026-08-12
- [state/terrain-and-world-generation.md](../state/terrain-and-world-generation.md) — teren/chunki/mountains (rzeki żyją tutaj, nie tam); terrain-side ownership seamów rzeki↔osada/droga/fauna
- [fauna.md](./fauna.md) — konsumpcja `sampleLocalWater()` przez `waterTraversal.ts` (dry/wading/swimming/blocked)
- [settlements.md](./settlements.md) — river placement rejection przy siting/plot; `household.water` jako konsument `WaterSource`
- [player-systems.md](./player-systems.md) — studnie gracza, drink/fill akcje
- [persistence.md](./persistence.md) — pełna klasyfikacja persystencji
- [STATE.md](../STATE.md) — WorldBundle.ocean, skrót ocean/jeziora
- [reviews/2026-08-07--001--water-quality.md](../reviews/2026-08-07--001--water-quality.md)
- [architecture/performance-and-workers.md](../architecture/performance-and-workers.md)
