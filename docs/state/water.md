# Seedvale — Woda

**Purpose:** źródło prawdy dla wody (ocean + jeziora / cieki śródlądowe): stan techniczny i wizualny, decyzje, historia poprawek.

**Nie jest:** planem implementacji ([plans/](./plans/README.md)), logiem całej grafiki ([GRAPHICS.md](./architecture/GRAPHICS.md) — tam zostają kontrakty G4–G6), ani katalogiem assetów.

**Last verified:** 2026-08-21 (rzeki: plany 181/189 zaimplementowane, browser check jeszcze nie zrobiony — reszta sekcji verified 2026-08-13, plan 098 fazy 1–3 + wanna mesha, browser ✅)

Gdy ten plik rozjeżdża się z kodem — **wygrywa kod**, potem aktualizujemy ten dokument.

---

## Jak używać

1. Przed zmianą oceanu, jezior, brzegu, `waterLevel` albo `bodyScale` — przeczytaj **Standing decisions** i **Stan obecny**.
2. Kontrakty renderu (depthWrite, mirror RT, foliage) zostają w [GRAPHICS.md](./architecture/GRAPHICS.md) G4–G6; szczegóły domeny wody są tutaj.
3. Po decyzji użytkownika albo zweryfikowanym fixie — dopisz wpis w **Historii** (najnowszy na górze) i zaktualizuj stan / decyzje.
4. Issue/plan mogą szczegółować pracę; trwała reguła ląduje tutaj.

Status wiedzy: `✅` potwierdzone w przeglądarce · `🔧` zaimplementowane, bez browser check · `📝` decyzja / kierunek · `❓` otwarte.

---

## Standing decisions

Trwałe reguły. Zmiana = nowy wpis w historii + aktualizacja tej tabeli.

| ID | Decyzja | Skutek |
|----|---------|--------|
| W1 | **Jedna rodzina shadera, dwa strojenia** (jezioro / ocean). Bez `Water.js`, bez SSR / refrakcji / trzeciego mesha. | faza 2–3 planu 098 ✅ |
| W2 | Ocean = **jeden** plane, follow gracza, **nie** per-chunk. | G5 (geometria). Shader = `waterMaterial.ts` |
| W3 | Woda: `transparent: true`, **`depthWrite: false`**. Nie łączyć transparent + depthWrite + wysokiego `renderOrder`. | G4, issue [022](./issues/2026-08-12--022--ocean-through-tree-foliage.md) |
| W4 | Liście GLTF `BLEND` → opaque `alphaTest` cutout. Korony piszą depth, woda nie. | G3 |
| W5 | Chunk water maskuje się heightmapą (`vCover`). `bodyScale` 1 = strojenie oceanu (nie discard). | W8 + faza 2 ✅ |
| W6 | **Performance jest constraint.** Lustro sceny = **jeden** wspólny pass (nie per-chunk). Wyłącznik w Vue. Mirror RT mały (**128²**), max **30 Hz**, bez NPC/fauny. | G2; G5; plan 113 |
| W7 | Weryfikacja wizualna = **przeglądarka**, nie sam `tsc`/lint/build. | G8 |
| W8 | **Ocean tylko morze / wybrzeże.** Śródlądowe jeziora, stawy i cieki nigdy nie używają materiału oceanu, niezależnie od powierzchni w chunku. | issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) ✅ |
| W9 | **Lustro sceny** (planar, jedna RT) na jeziorach **i** oceanie, z opcją wyłączenia w Vue (Pauza → Świat / Grafika) + `seedvale:graphics:v1`. Off → niebo + specular, **zero** extra passu. Default: włączone. | `waterMirror.ts`; faza 3 ✅ |
| W10 | Przezroczystość **z głębokości** (`floorHeights`): przy brzegu widać piasek, w głębi gęstsza/ciemniejsza. Nie akwarium, nie prawie-opaque. | faza 2 ✅ |
| W11 | Brzeg: miękki fade + linia piany z maski + mokry piasek na terenie. | faza 2 ✅ |
| W12 | Ruch: jezioro = drobne zmarszczki world-space; ocean = wolniejsza, większa fala. Rzeki (od planu 181) mają **własny**, osobny lekki materiał (`riverWaterMaterial.ts`) — nie tę samą rodzinę shadera co jezioro/ocean, choć reużywa jego dzień/noc uniform-setterów bez zmian. | faza 2 ✅; rzeki: plan 181 |
| W13 | Rzeki są **geometrią osobną od jezior/oceanu**: każdy world point należy do dokładnie jednego 256 m "river tile" (deterministyczne, seed-independent), nie do klasyfikacji `bodyScale`/`vCover`. Rzeki **nie** karmią z powrotem `sampleFloorAt`/gameplay terrain poza samym channel carving (plan 189, tylko obniża wysokość, nigdy nie podnosi). Waterfalls i pełna parytetowość shadera/renderu z jeziorem/oceanem są świadomie odłożone. | plany 181/189, [terrain-and-world-generation.md](./state/terrain-and-world-generation.md) |

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
| Gameplay | NPC/fauna/drogi/namiot/kopanie **odrzucają** wodę; gracz pływa (cap głębokości). Picie zwierząt = plan [094](./plans/archive/2026-08-13--094--fauna-food-water-for-satiety-hydration.md), nie render |

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

`src/terrain/riverTileCache.ts` liczy tile raz (synchronicznie, main thread, ~18ms zmierzone) i reference-countuje go po załadowanych chunkach pokrywających go (ta sama idea co chunk-membership counting w `vegetationRegionBatcher.ts`); `ChunkManager` attach/dispose per-chunk river ribbon (`src/world/riverGeometry.ts`'s `clipChainToRect`/`buildRiverRibbonGeometry`) razem z `WorldWater`. Szerokość wstążki pochodzi z eased `flowFactor()` (0..1) z `widthFromAccumulation()`, więc małe strumienie są wizualnie subtelniejsze niż główne rzeki; per-vertex `aFlow` attribute pozwala fragment shaderowi (`riverWaterMaterial.ts`) zmiękczać alpha brzegu/foam/streak dla nisko-przepływowych wstążek.

River channel carving (plan 189) dodaje trzeci `computeChunkTile` terrain-modifier stage (`chunkHeightmap.ts`'s `applyRiverChannel`, po roads/clearings) — `riverNetwork.ts`'s `riverChannelSegmentsNear` zamienia ten sam kanoniczny, już-zmeandrowany łańcuch (który renderuje wstążka wody) na `RiverChannelSegment[]` (half-width z `widthFromAccumulation`, depth z nowego bounded `depthFromAccumulation` na tej samej `flowFactor` krzywej). Channel bed height jest ściśle malejące w dół rzeki z konstrukcji (D8 elevation ściśle maleje, accumulation nigdy nie maleje — udowodnione w testach), więc nie potrzeba osobnego passu korekcji monotoniczności. Carving tylko obniża teren (`Math.min(bedH, floorH)`), nigdy nie podnosi; istniejąca wstążka już sampluje realny renderowany teren Y, więc automatycznie podąża za wyrzeźbionym kanałem — bez zmian po stronie wody.

Rzeki **nie** karmią z powrotem `sampleFloorAt`/gameplay terrain poza samym carvingiem powyżej. Waterfalls, pełny shader/rendering parity z jeziorem/oceanem i worker offload są świadomie odłożone (patrz [plans/LOOSE-ENDS.md](./plans/LOOSE-ENDS.md)). Browser verification jeszcze nie zrobiony.

Wejścia kodu:

```text
src/terrain/hydrology.ts
src/terrain/riverNetwork.ts
src/terrain/riverTileCache.ts
src/world/riverGeometry.ts
src/world/riverWaterMaterial.ts
src/world/createRiverWater.ts
src/terrain/chunkHeightmap.ts      applyRiverChannel (carving stage)
```

### Wizualny (2026-08-13)

Screen (przed fazą 1): [refs/water-2026-08-13-inland-dual-material.png](./refs/water-2026-08-13-inland-dual-material.png)

To było śródlądowe jezioro rysowane dwoma systemami. **Plan 098 (browser ✅ 2026-08-13):** inland nigdy nie jest oceanem; jeden shader; depth fade / piana / mokry piasek; wspólne lustro 256² z toggle Vue. Issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) / [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md) `done`.

Przyczyna screenu (stan sprzed fazy 1):

| Co widać | Przyczyna w kodzie |
|----------|-------------------|
| Jasnoniebieska, prawie płaska tafla wije się z terenem | Shader jeziora (`DAY_SHALLOW` 0x4fa3c8), maska `vCover` |
| Ciemniejsza, falująca plama o twardych prostych krawędziach na środku | Ocean Water.js przebija tam, gdzie `vBodyScale > 0.9` (chunk sklasyfikował basen jako „duży”). Ocean **nie ma** maski brzegu — krawędź to przecięcie globalnego plane z terenem / granicą klasyfikacji |
| Dwa materiały bez blendu | Palety rozjechane: ocean `0x0f3a52` vs jezioro `0x1a4d6b` / `0x4fa3c8`. Inny model fal i odbić |
| Ostre, kanciaste styki woda–piasek | Jezioro: wąski `vCover` + płaski mesh. Ocean: sam depth-test vs teren (issue [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md)) |
| Brak fade głębokości przy brzegu | Alpha jeziora = `uOpacity * vCover` (baza 0.78); brak samplowania `floorHeights`. Ocean nie fade'uje brzegu wcale |
| Ciemne, „brudne” odbicia na falującej części | Mirror 256² + mix 55% w stronę ciemnego `waterColor`; aliasing terenu w lustrze (issue [009](./issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md)) |
| Brak piany / mokrego piasku na styku | Foam z `abs(vWave)`, nie z brzegu. Terrain shader nie ciemnieje przy `waterLevel` |
| Brak kierunku nurtu | Sine time, zero flow field |
| Możliwe szwy między płatami | Per-chunk mesh × 1.02 + fale w przestrzeni lokalnej |

Pas piasku terenu (issue 001, `sandBandAt` 0.6–3) jest w kodzie wygładzony; na tym ujęciu problemem nie są schodki koloru lądu, tylko **dwa shadery wody** i twardy clip plane'u.

---

## Kolejność implementacji (po decyzjach)

Plan: [098](./plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) — `done` (fazy 1–3, browser ✅ 2026-08-13).

### P0 — jeden materiał na jednym zbiorniku (issue 028)

1. W8: śródlądzie nigdy nie discarduje do oceanu. Ocean tylko tam, gdzie to naprawdę morze. **✅ faza 1**
2. Geometria: jeziora per-chunk + ocean singleton (W2). Materiał oceanu = rodzina jezior (W1). **✅ faza 2** — bez Water.js; lustro w fazie 3.

### P1 — wygląd z decyzji

3. Depth fade z `floorHeights` (W10). **✅ faza 2**
4. Brzeg: fade + piana z maski + mokry piasek (W11). Issue 003. **✅ faza 2**
5. Fale world-space; jezioro drobne, ocean swell (W12). **✅ faza 2**
6. Wspólne lustro 256² + fallback sky/spec + toggle Vue/lil-gui (W9). Default on. **✅ faza 3**

### P2 — później

7. Nurt rzek — geometria/materiał rzeki zaimplementowane (plany 181/189, zob. §Rzeki wyżej); waterfalls i pełna shader/rendering parity z jeziorem/oceanem zostają odłożone.
8. Mesh per basen (review 001 C) — osobna geometria jeziora. **Wanna w meshu terenu** (finding 2) jest zrobiona: `buildChunkGeometry` czyta `floorHeights`.
9. SSR, refrakcja, caustics, mirror > 256² — **nie**.

---

## Historia poprawek

### 2026-08-21 — Rzeki: hydrologia, geometria, channel carving (plany 181/189) 🔧

D8 flow/accumulation → deterministyczne 256 m river tiles → per-chunk wstążka wody (osobny lekki materiał, dzień/noc reużyty z `waterMaterial.ts` bez zmian) → world-space meandrowanie + `aFlow`-driven brzeg/foam. Plan 189 dodaje channel carving (osobny terrain-modifier stage, tylko obniża teren, nigdy nie podnosi). Pełny opis: §Rzeki (Stan obecny) wyżej. Waterfalls i pełna parytetowość z jeziorem/oceanem świadomie odłożone; browser/perf verification jeszcze nie zrobiony.

Najnowsze na górze.

### 2026-08-15 — Budżet lustra (plan 113) 🔧

- RT pozostaje 128². Pass max 30 Hz. NPC/fauna na `AGENT_RENDER_LAYER`, lustro ich nie rysuje.
- Browser: otwarte (porównanie z review 012 `?benchmark=water`).

### 2026-08-13 — Wanna: mesh terenu z `floorHeights` ✅

- Zielone kanciaste plamy na wodzie = płaski mesh przycięty do `waterLevel` (`SEABED` 0x2f5244), przez który gracz pływał (`sampleFloor`).
- `buildChunkGeometry` bierze Y / normalne / kolor z `floorHeights`. Clamp `heights` zostaje dla `vCover`, trawy i `sampleHeight`.
- Finding 2 review 001: shader głębokości był w 098; **wizualne dno mesha** dopiero tu.
- Browser: użytkownik 2026-08-13.

### 2026-08-13 — Faza 3 planu 098: wspólne lustro + Vue ✅

- `waterMirror.ts`: jeden RT 256², kamera względem `y = waterLevel`, oblique clip, warstwa 1 na meshach wody (brak rekursji).
- Shader: `mix` lustra z capem reflectance 0.4 i tint 0.55 w stronę koloru wody (jak patch Water.js). Off: `uReflections = 0`, pass nie startuje.
- Vue: Pauza → Świat → Grafika → „Odbicia wody”; lil-gui Post-processing; persist `seedvale:graphics:v1`.
- Browser: użytkownik 2026-08-13. Plan [098](./plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) → `done`.

### 2026-08-13 — Faza 2 planu 098: jedna rodzina shadera + brzeg ✅

- `waterMaterial.ts`: jezioro/ocean, fale `world.xz`, głębokość z `floorHeights`, piana z `vCover`.
- `createOcean` bez Water.js; singleton radial-fade poza `loadRadius` (chunk water rysuje plażę).
- Terrain: mokry piasek (`uWaterLevel`, pas ~0.4).
- Fog uniforms (`UniformsLib.fog`) — bez nich `refreshFogUniforms` crashował.
- Lustro sceny **nie** wraca — faza 3.
- Browser: użytkownik 2026-08-13. Issue [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md) / [028](./issues/2026-08-13--028--inland-water-dual-material.md) → `done`.

### 2026-08-13 — Faza 1 planu 098: W8 inland ≠ ocean ✅

- `computeBodyScale` bierze `continentalness`; `isLarge` / 35% chunka usunięte.
- Jeziora cap 0.85; discard 0.9 zostaje, ale znaczy komórkę oceanu.
- Testy: `src/terrain/waterBodies.test.ts`.
- Issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) → `done` (browser z fazą 2).

### 2026-08-13 — Plan 098 (P0–P1) 📝

- Plan: [098](./plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) — faza 1 W8, faza 2 shader+brzeg, faza 3 lustro+Vue.
- Kod **bez zmian**.

### 2026-08-13 — Kierunek: jedna rodzina, W8, lustro z wyłącznikiem 📝

- Użytkownik: pół-realistyczna, lekko przezroczysta, bez ciężkiego GPU; potem lustro sceny **tak**, z opcją off w Vue.
- W8 zaakceptowane. W1 zmienione (docelowo bez Water.js). W9–W12 nowe.
- Kod **bez zmian** — to decyzja, nie implementacja.

### 2026-08-13 — SoT wody + diagnoza dual-material 📝

- Screen śródlądzia: dwa materiały na jednym stawie (jezioro + ocean).
- Diagnoza: `isLarge` per chunk (35% siatki) + `vBodyScale > 0.9` → discard jeziora → globalny Water.js bez maski.
- Ten plik; issue [028](./issues/2026-08-13--028--inland-water-dual-material.md).
- Kod wody **bez zmian**.

### 2026-08-12 — Ocean przez drzewa + prawdziwa przezroczystość ✅

- Liście: `hardenFoliageAlpha` (BLEND → `alphaTest`).
- Ocean: `transparent`, `depthWrite: false`, alpha fresnel; mirror **512 → 256**.
- Jeziora: `depthWrite: false`, niższe `uOpacity`.
- Issue [022](./issues/2026-08-12--022--ocean-through-tree-foliage.md). Nie zamyka brzegu oceanu ([003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md)).

### 2026-08-10 — Blotches w lustrze oceanu 🔧

- Cofnięto zagęszczenie detail normals terenu (alias w 512/256 RT). Amplituda zostawiona niższa.
- Issue [009](./issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md) — `verification needed`.

### 2026-08-07 — Architektura ocean vs jeziora 📝

- Duże zbiorniki → singleton Water.js; małe → chunk water.
- Review [001](./reviews/2026-08-07--001--water-quality.md) **odradzał** Water.js dla stawów (styl + koszt + i tak trzeba maski). Ocean i tak wszedł jako morze; wyciek na śródlądzie = dług z tej decyzji.

### 2026-08-07 — Dzień/noc na jeziorach ✅

- `dayFactor` → lerp palet `uDeep` / `uShallow` / `uFoam`.
- Issue [002](./issues/2026-08-07--002--water-daynight-integration.md). Ocean dostał analogiczny lerp później (`setDayNight` + `sunDirection`).

### 2026-08-07 — Schodki koloru brzegu terenu ✅

- `biomeColors.ts`: hard `if` → `smoothstep` seabed↔sand↔ląd; potem `sandBandAt` 0.6–3.
- Issue [001](./issues/2026-08-07--001--water-shore-color-banding.md). To kolor **lądu**, nie tafli wody.

### Review 2026-08-07 — jakość wody (analiza)

Nierozwiązane z [review 001](./reviews/2026-08-07--001--water-quality.md):

| Finding | Status 2026-08-13 |
|---------|-------------------|
| 1 schodki koloru terenu | `done` (issue 001) |
| 2 płaskie dno mesha (brak batymetrii wizualnej) | `done` (browser 2026-08-13) — mesh z `floorHeights` (shader depth był w 098) |
| 3 rozdzielczość siatki wody vs teren | częściowo: `min(resolution-1, 256)` zamiast stałych 96 |
| 4 dzień/noc | `done` (issue 002) |
| 5 foam nie z brzegu | `done` faza 2 — piana z maski |
| 6 z-fight | nie potwierdzony; marginesy 0.02 / 0.07 |

---

## Otwarte

| Temat | Status | Link |
|-------|--------|------|
| Blotches w lustrze oceanu | `verification needed` | issue [009](./issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md) — pass 256² wrócił w fazie 3; nie zagęszczać detail normals |
| Artefakty oceanu na telefonie | notatka | [plans/README.md](./plans/README.md) Quick notes; wyłączenie odbić (W9) |
| Fauna pije wodę (symulacja) | `todo` | plan [094](./plans/archive/2026-08-13--094--fauna-food-water-for-satiety-hydration.md) |
| Rzeki: browser/perf verification | `verification needed` | plany [181](./plans/2026-08-21--181--natural-mountains-and-rivers.md) / [189](./plans/2026-08-21--189--river-channel-carving.md) |
| Rzeki: waterfalls, pełna parytetowość z jeziorem/oceanem, worker offload | `todo`, świadomie odłożone | [plans/LOOSE-ENDS.md](./plans/LOOSE-ENDS.md) |

---

## Powiązane

- [GRAPHICS.md](./architecture/GRAPHICS.md) — G3–G6, log 2026-08-12
- [state/terrain-and-world-generation.md](./state/terrain-and-world-generation.md) — teren/chunki/mountains (rzeki żyją tutaj, nie tam)
- [STATE.md](./STATE.md) — WorldBundle.ocean, skrót ocean/jeziora
- [reviews/2026-08-07--001--water-quality.md](./reviews/2026-08-07--001--water-quality.md)
- [architecture/performance-and-workers.md](./architecture/performance-and-workers.md)
