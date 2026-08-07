# Plan: Drogi i ścieżki między lokalizacjami

**Status:** `planned`
**Created:** 2026-08-07
**Priority:** średni — rozszerzenie [multi-settlements](./2026-08-07--025--multi-settlements.md) (grafuje istniejącą siatkę wiosek) i [biome-regions](./2026-08-07--028--biome-regions.md) (kolejna warstwa na tym samym `sampleRawTexel`). Nie blokuje ani nie jest blokowany przez inne kolejkowane plany.
**Zakres (zdecydowane z userem 2026-08-07):** drogi **też międzyosadowe** (nie tylko osada↔port), oraz wygładzenie terenu **+ blend koloru** (nie samo wygładzenie).

## Potrzeba

Dziś świat ma miejsca (osady, docelowo ich mniejsze lokalizacje) rozrzucone po proceduralnym terenie bez żadnego połączenia — gracz i NPC-e chodzą po prostu w linii prostej. Chcemy szlaki: **drogi** między osadami (szeroko, mocno wyrównany teren — główne trakty) i **ścieżki** wewnątrz jednej osady do jej mniejszych lokalizacji (wąsko, teren prawie nieruszony). Trasa ma wybierać przebieg o małej zmianie wysokości (nie prostą linię przez wzgórze), a sama droga ma **delikatnie wygładzać** teren pod sobą — nie tworzyć płaskiego pasa, tylko zredukować lokalne nierówności.

## Węzły sieci: osady + mniejsze lokalizacje

**Osada** = podstawowy węzeł, już istnieje (`SettlementDef` w `settlementGenerator.ts` — deterministyczna, per-grid-cell, niezależna od chunk streamingu: `generateSettlementDef(cell, seed, sampleHeight, waterLevel, radius)` da tę samą pozycję zawsze, bez potrzeby "załadowania" niczego).

**Mniejsze lokalizacje** — nowy, mały moduł `src/settlement/minorLocations.ts` (main-thread, analityczny jak `findSettlementSite.ts`, żadnych zależności od THREE poza typami):

- v1: jeden rodzaj — **port/przystań** (`kind: 'dock'`). Po ustaleniu `SettlementSite`, ray-march w kilkunastu kierunkach (np. 16 × co 22.5°) do `maxDockSearchRadius` (np. 140 jedn.), próbkując `sampleContinentalnessAt`/`sampleHeightAt` co ~4 jedn., szukając pierwszego przejścia ląd→woda (`continentalness` przecina `coastThreshold`). Najbliższe trafienie (jeśli w ogóle jest w promieniu) → `MinorLocation { kind: 'dock', x, z, y, angle }` (kąt = orientacja pomostu, prostopadle do brzegu). Brak trafienia (osada śródlądowa) → brak mniejszej lokalizacji, nic się nie dzieje.
- Architektura celowo otwarta na kolejne rodzaje (kamieniołom przy górach, wieża widokowa na wzgórzu) — jeden dopisany warunek + jeden wpis w tabeli propsów, nie przeprojektowanie. **Nie robimy tego teraz** — sam port jako dowód konceptu.
- Cache per `SettlementDef.id` (jak reszta stanu osady), liczone raz przy pierwszym dostępie.

**Propsy:** `src/settlement/props.ts` += `DOCK_SPECS` (`{ url, height }`, wzorem `HUT_URLS`) + fallback `createDock()` (kilka desek/pali — `BoxGeometry` na palach `CylinderGeometry`, flat-shaded, styl `createWell`/`createStockpile`), ewentualnie prosta łódka jako drugi mały prop przy pomoście (fallback: spłaszczony `BoxGeometry` kadłub). `loadPropOrFallback` — nieblokujące, jak wszystko inne w tym pliku.

## Graf dróg między osadami

Sieć nie może wymagać globalnej, z góry policzonej listy wszystkich osad — świat jest praktycznie bezkrawędziowy. Zamiast tego: **czysto lokalna, deterministyczna reguła sąsiedztwa**, ta sama niezależnie od tego, która osada pyta pierwsza (symetryczna).

**Nowy moduł `src/settlement/roadNetwork.ts`** (main-thread, jak `roadNetwork` obok `settlementGenerator.ts`):

- `neighborsFor(cell, seed, sampleHeight, waterLevel): SettlementCell[]` — bierze kandydatów z `cellsWithinRadius(cell, 1)` (8 sąsiadujących komórek siatki `SETTLEMENT_GRID_STEP=280`), rozwiązuje ich `SettlementDef` (tanie, deterministyczne — **nie** wymaga ładowania budynków/NPC sąsiada), wybiera **1–2 najbliższe** po realnym dystansie site↔site (nie po dystansie siatki, bo `findSettlementSite` ma własny jitter). Reguła symetryczna z definicji (odległość jest symetryczna) → obie osady "zgadzają się" co do tej samej krawędzi bez koordynacji.
- `findRoute(a, b, sampleHeight, sampleContinentalness, opts): RoutePoint[]` — trasowanie po rzadkiej siatce roboczej (np. co 8–10 jedn., ograniczonej do bounding-boxa `a`↔`b` + margines) metodą najmniejszego kosztu (A*/Dijkstra), koszt węzła = dystans + waga × |Δwysokość| + duża kara za `h ≤ waterLevel` (woda) i za silny `mountainRidge` (grań) — te same kryteria "niechodliwe", jakich już używa `chunkVegetation.ts`/`grass.ts` (spójne z tym, co dziś odrzuca sadzenie roślin). Jednorazowe, cache'owane per para osad (klucz: posortowana para `SettlementDef.id`) — koszt policzenia trasy ponoszony raz, nie per-chunk.
- Wynik trasy: `RoutePoint = { x, z, h }` (surowa wysokość). Druga faza: **wygładzenie profilu wysokości wzdłuż trasy** — ruchoma średnia po `h` w oknie ~10 jednostek długości łuku (punkt wyjścia: zgadywana przez usera "10% na 10 metrów" — potraktowane jako startowa siła/okno wygładzania, do wizualnej kalibracji, nie literalna specyfikacja) → `hs` per punkt. Wynik: `RoutePoint = { x, z, h, hs }`, pocięty na segmenty `{ a: RoutePoint, b: RoutePoint, kind: 'road' | 'path' }`.
- `kind` wynika z tego, co łączy: osada↔osada = `'road'` (szeroki, mocno wyrównuje), osada↔`MinorLocation` = `'path'` (wąski, prawie bez zmian) — naturalne 1:1 mapowanie na rozróżnienie droga/ścieżka z prośby, bez dodatkowej konfiguracji "który to typ".
- `segmentsNear(worldX, worldZ, chunkSize): RoadCorridorSegment[]` — funkcja, którą woła `chunkManager.paramsFor()` (main thread, tak jak dziś woła `isHomeChunk`): rozwiązuje (z cache lub liczy) sąsiedztwo + trasy dla siatkowych komórek w promieniu 1 od chunku, filtruje do segmentów, których bounding box (+ pół-szerokość korytarza) przecina ten chunk. Zwraca płaskie, czysto liczbowe dane (`{ ax, az, ah, bx, bz, bh, halfWidth, heightStrength, tintStrength }`) — bezpieczne do wysłania do workera.

**Ograniczenie do zaakceptowania, nie do rozwiązania teraz:** trasa/most segment stają się "znane" dopiero gdy przynajmniej jedna z osad zostanie rozwiązana przez `SettlementsManager` (wejdzie w promień ładowania). Chunk wygenerowany *wcześniej* w tym samym miejscu (np. gracz szedł na przełaj zanim dotarł w pobliże którejkolwiek osady) nie dostanie retroaktywnie wygładzenia — nie ma re-generacji już zbudowanych chunków. To ten sam rodzaj "eventual consistency", co reszta streamingu (trawa, load/unload histereza) — zaakceptowane, nie blokujące.

## Modyfikator terenu: wygładzanie + kolor

**`src/terrain/chunkHeightmap.ts`:**

- `RawSampleParams`/`ChunkTileParams` += `roads: RoadCorridorSegment[]` (mała tablica, zwykle 0–6 elementów blisko danego chunku).
- `sampleRawTexel`: po policzeniu `floorH`/`h` jak dziś, dla każdego segmentu — rzut punktu na odcinek (perpendicular distance + `t` ∈ [0,1]), `falloff = smoothstep` od 1 w osi do 0 na `halfWidth` (+ miękki margines, jak `SEABED_BLEND`/`LAND_BLEND` gdzie indziej), `targetH = lerp(ah, bh, t)`. `floorH = lerp(floorH, targetH, falloff * heightStrength)`, potem `h = max(floorH, waterLevel)` jak dziś. Najbliższy/najsilniejszy segment wygrywa tam, gdzie korytarze mogłyby się nakładać (skrzyżowania — rzadkie, ale możliwe).
- `ChunkTileData` += `roadTint: Float32Array` (apron-inclusive, jak `mountainRidge`) — `falloff * tintStrength` dla najbliższego segmentu, do koloru.

**`src/terrain/biomeColors.ts`:** nowy `applyRoadTint(color, roadTint)` (ten sam wzorzec co `applyMountainRock`) — blend w stronę koloru ubitej ziemi/żwiru (nowa stała, np. `DIRT = new Color(0x9c8563)`), wołany w `buildChunkGeometry.ts` obok `applyMountainRock`/`applyOceanDepthTint` (linia ~110–112 dziś).

**Progi domyślne** (do kalibracji wizualnej przy implementacji, nie zgadywane na sztywno tutaj): `road.halfWidth` ≈ 5, `road.heightStrength` ≈ 0.85, `road.tintStrength` ≈ 0.8; `path.halfWidth` ≈ 1.5, `path.heightStrength` ≈ 0.2, `path.tintStrength` ≈ 0.4 (droga wyraźnie ubita ziemia, ścieżka ledwie przedeptana — bliżej dzisiejszej trawy niż drogi).

## Roślinność i trawa

`chunkVegetation.ts`/`grass.ts` już dziś odrzucają kandydatów po stromiźnie/grani (ten sam wzorzec `SLOPE_REJECT`/`MOUNTAIN_RIDGE_REJECT`) — dopisać analogiczny odrzut: `roadTint > próg` → brak drzewa/krzewu/trawy w tym miejscu. Mały dodatek, reużywa już przeciąganą przez tile siatkę, nie nowa ścieżka danych.

## NPC: reużycie `wander`, nie nowy system

Zgodnie z prośbą — **żadnego nowego mechanizmu ruchu**. `NpcAgent.ts` dziś ma `target: THREE.Vector3` + `steerTo(target, dt)` + proste fazy (`wander`, `goWell`, `goGarden`, `goTree`) sterowane przez `beginNeed()`. Rozszerzenie:

- **v1 (w zakresie):** tylko **ścieżka lokalna** (osada → własna `MinorLocation`, np. port). W `beginNeed()`/wyborze wander-celu dopisać niski-prawdopodobieństwa branch: czasem (np. 5–10% szansy zamiast zwykłego losowego punktu ~4 jedn. od `home`) NPC idzie do portu swojej osady zamiast błąkać się lokalnie. Ponieważ trasa ma realne waypointy (nie prostą linię), potrzebna jedna nowa faza `followPath` z kursorem indeksu po `RoutePoint[]`, przechodząca do kolejnego punktu przez ten sam `steerTo` (`if (this.steerTo(waypoint, dt)) index++`) — identyczny idiom, jaki już jest w kodzie (`case 'wander': if (this.steerTo(...)) this.phase = 'choose'`), tylko z kilkoma punktami zamiast jednego. Po dotarciu: chwila przy porcie (reużycie istniejącego "postój"/`REST_PHASES` wzorca), potem powrót tą samą trasą lub `wander` do domu.
- **Poza zakresem v1:** NPC podróżujący **między osadami** po drogach (`kind: 'road'`) — to wymaga przekroczenia granicy własności NPC (dziś NPC należy do jednej `SettlementDef`, `SettlementsManager` streamuje osady niezależnie) i wiąże się z tym samym nierozstrzygniętym obszarem co "questy między wioskami" w [multi-settlements](./2026-08-07--025--multi-settlements.md) oraz odłożonym systemem workplace/schedule w [npc-2-daily-routine-and-place](./2026-08-07--020--npc-2-daily-routine-and-place.md). Droga i tak jest widoczna/użyteczna dla **gracza** bez tego — NPC-migracja między wioskami to naturalny follow-up, nie blokuje pierwszej iteracji.

## Konfiguracja / GUI

Nowa sekcja `region.roads` w `worldConfig.ts` (`roadHalfWidth`, `roadHeightStrength`, `roadTintStrength`, `pathHalfWidth`, `pathHeightStrength`, `pathTintStrength`, `smoothingWindow`, `maxNeighborRoads` (1–2), `dockSearchRadius`) + wiersze w `createDebugGui.ts`, nowy pod-folder **Roads** obok **Regions** (tego samego typu suwaki co dziś, panel domyślnie zwinięty — patrz commit "Collapse debug settings GUI by default").

## Poza zakresem teraz

- Więcej rodzajów mniejszych lokalizacji niż port (kamieniołom, wieża, młyn) — architektura na to pozwala, nie implementujemy dziś
- NPC podróżujący między osadami po drogach `'road'` (patrz sekcja NPC wyżej)
- Skrzyżowania/rozjazdy jako pierwszoklasowy koncept (dziś: najbliższy segment wygrywa przy nakładaniu się korytarzy — wystarczające, nie modelujemy węzłów grafu jawnie w geometrii)
- Mosty/kładki nad wodą (droga dziś unika wody w koszcie trasowania, nie przechodzi nad nią)
- Wozy/handel/ekonomia wzdłuż dróg — czysto kosmetyczno-nawigacyjna warstwa na razie

## Otwarte pytania (do obserwacji przy implementacji, nie blokujące)

- Gęstość grafu międzyosadowego (1 czy 2 najbliżsi sąsiedzi) — do oceny wizualnej na kilku seedach, żeby sieć nie wyglądała ani zbyt rzadko, ani jak siatka dróg wszędzie
- Zachowanie na skrzyżowaniu dwóch korytarzy (dziś: najbliższy wygrywa) — może dać widoczny "uskok" na styku, do sprawdzenia wizualnie
- Koszt liczenia tras przy pierwszym wejściu w promień wielu jednocześnie odkrywanych osad (multi-settlement) — jednorazowy, cache'owany, ale do zmierzenia czy nie powoduje zauważalnego zacinania przy streamingu

## Weryfikacja (po implementacji)

- `npm run dev` → wizualnie widoczna droga/ścieżka (kolor + spłaszczenie) między osadą a jej portem (jeśli blisko oceanu) i między sąsiednimi osadami (multi-settlement, kilka seedów)
- Droga nie przechodzi przez wodę/urwiska; teren pod nią wyraźnie płynniejszy niż otoczenie, ale nie idealnie płaski
- NPC czasem widoczny idący ścieżką do portu (nie tylko lokalny wander), wraca, brak zacinania/teleportacji między waypointami
- Brak regresji: las/trawa/kolory terenu bez zmian tam, gdzie `roadTint ≈ 0`
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`

## Powiązane

- [multi-settlements](./2026-08-07--025--multi-settlements.md) — siatka osad, `settlementGenerator.ts` (`generateSettlementDef`, `SETTLEMENT_GRID_STEP`, `cellsWithinRadius`) reużyte 1:1
- [biome-regions](./2026-08-07--028--biome-regions.md) — ta sama warstwa `sampleRawTexel`/`ChunkTileData`, ten sam wzorzec (nowa makro-cecha → blend koloru + wpływ na roślinność)
- [npc-2-daily-routine-and-place](./2026-08-07--020--npc-2-daily-routine-and-place.md) — naturalny punkt zaczepienia dla przyszłego NPC-ruchu międzyosadowego
- [world-visual-overhaul](./2026-08-07--024--world-visual-overhaul.md) — `props.ts` wzorzec fallbacków, ten sam mechanizm dla `DOCK_SPECS`
- `src/settlement/settlementGenerator.ts`, `src/settlement/findSettlementSite.ts`, `src/terrain/chunkHeightmap.ts`, `src/terrain/biomeColors.ts`, `src/terrain/chunkManager.ts`, `src/terrain/buildChunkGeometry.ts`, `src/ai/NpcAgent.ts`, `src/settlement/props.ts`
