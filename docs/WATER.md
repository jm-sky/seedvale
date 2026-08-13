# Seedvale — Woda

**Purpose:** źródło prawdy dla wody (ocean + jeziora / cieki śródlądowe): stan techniczny i wizualny, decyzje, historia poprawek.

**Nie jest:** planem implementacji ([plans/](./plans/README.md)), logiem całej grafiki ([GRAPHICS.md](./GRAPHICS.md) — tam zostają kontrakty G4–G6), ani katalogiem assetów.

**Last verified:** 2026-08-13 (kod fazy 2 planu 098; browser check osobno)

Gdy ten plik rozjeżdża się z kodem — **wygrywa kod**, potem aktualizujemy ten dokument.

---

## Jak używać

1. Przed zmianą oceanu, jezior, brzegu, `waterLevel` albo `bodyScale` — przeczytaj **Standing decisions** i **Stan obecny**.
2. Kontrakty renderu (depthWrite, mirror RT, foliage) zostają w [GRAPHICS.md](./GRAPHICS.md) G4–G6; szczegóły domeny wody są tutaj.
3. Po decyzji użytkownika albo zweryfikowanym fixie — dopisz wpis w **Historii** (najnowszy na górze) i zaktualizuj stan / decyzje.
4. Issue/plan mogą szczegółować pracę; trwała reguła ląduje tutaj.

Status wiedzy: `✅` potwierdzone w przeglądarce · `🔧` zaimplementowane, bez browser check · `📝` decyzja / kierunek · `❓` otwarte.

---

## Standing decisions

Trwałe reguły. Zmiana = nowy wpis w historii + aktualizacja tej tabeli.

| ID | Decyzja | Skutek |
|----|---------|--------|
| W1 | **Jedna rodzina shadera, dwa strojenia** (jezioro / ocean). Bez `Water.js`, bez SSR / refrakcji / trzeciego mesha. | faza 2 planu 098 🔧; lustro = faza 3 |
| W2 | Ocean = **jeden** plane, follow gracza, **nie** per-chunk. | G5 (geometria). Shader = `waterMaterial.ts` |
| W3 | Woda: `transparent: true`, **`depthWrite: false`**. Nie łączyć transparent + depthWrite + wysokiego `renderOrder`. | G4, issue [022](./issues/2026-08-12--022--ocean-through-tree-foliage.md) |
| W4 | Liście GLTF `BLEND` → opaque `alphaTest` cutout. Korony piszą depth, woda nie. | G3 |
| W5 | Chunk water maskuje się heightmapą (`vCover`). `bodyScale` 1 = strojenie oceanu (nie discard). | W8 + faza 2 |
| W6 | **Performance jest constraint.** Lustro sceny = **jeden** wspólny pass (nie per-chunk). Wyłącznik w Vue. Mirror RT mały (256²). | G2; faza 3 |
| W7 | Weryfikacja wizualna = **przeglądarka**, nie sam `tsc`/lint/build. | G8 |
| W8 | **Ocean tylko morze / wybrzeże.** Śródlądowe jeziora, stawy i cieki nigdy nie używają materiału oceanu, niezależnie od powierzchni w chunku. | zaakceptowane 2026-08-13; issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) |
| W9 | **Lustro sceny** (planar, jedna RT) na jeziorach **i** oceanie, z opcją wyłączenia w Vue (Pauza → Świat / Grafika) + `seedvale:graphics:v1`. Off → niebo + specular, **zero** extra passu. Default: włączone. | nie per-jezioro Water.js; faza 3 |
| W10 | Przezroczystość **z głębokości** (`floorHeights`): przy brzegu widać piasek, w głębi gęstsza/ciemniejsza. Nie akwarium, nie prawie-opaque. | faza 2 🔧 |
| W11 | Brzeg: miękki fade + linia piany z maski + mokry piasek na terenie. | faza 2 🔧 |
| W12 | Ruch: jezioro = drobne zmarszczki world-space; ocean = wolniejsza, większa fala. **Bez** nurtu rzek na start. | faza 2 🔧 |

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
| Odbicia | wspólne lustro 256², albo sky+spec gdy off | to samo lustro / ten sam fallback |
| Nurt | nie teraz | n/d |

**Koszt lustra:** jeden extra render sceny na klatkę, jak dzisiejszy ocean — nie N jezior × Water.js. Wyłączenie w menu ma być realnym spadkiem GPU (pass w ogóle nie startuje). Miejsce UI: Pauza → **Świat**, sekcja grafiki (obok flat shading); persist jak AO/bloom (`seedvale:graphics:v1`). lil-gui zostaje debugowym odpowiednikiem.

**Świadomie nie:** SSR, refrakcja, caustics, flow rzek, mesh per basen, powiększanie mirror > 256².

---

## Architektura

```text
heightmap (worker)
  heights[]      — teren przycięty do waterLevel (płaskie „dno” mesha)
  floorHeights[] — prawdziwa wysokość pod wodą (shader głębokości + pływanie)
        ↓
detectWaterBodies()  — BFS 4-sąsiedztwo w obrębie JEDNEGO chunka (+ apron)
        ↓
computeBodyScale()   — 0 ląd · jezioro < 0.9 · 1.0 ocean (kontynentalność)
        ↓
src/world/waterMaterial.ts     jedna rodzina ShaderMaterial (uOcean 0..1)
        ↓
┌───────────────────────────────────┬─────────────────────────────────────┐
│ createChunkWater (per chunk)      │ createOcean (singleton, WorldBundle)│
│ USE_CHUNK_MASK: vCover + depth    │ uOcean = 1, bez heightmapy          │
│ uOcean z bodyScale (jezioro/morze)│ radial fade poza loadRadius         │
│ fale world.xz; piana z vCover     │ fale world.xz (swell)               │
│ y = waterLevel + 0.07, order 1    │ y = waterLevel + 0.02, order 0      │
│ PlaneGeometry chunkSize, ≤256 seg.│ Plane + 64 seg., follow(player)     │
└───────────────────────────────────┴─────────────────────────────────────┘
```

Klasyfikacja oceanu: `continentalness` vs `oceanThreshold` / `coastThreshold` (`oceanMixAt`). Pole stawu w chunku **nie** promuje go na ocean. `lakeScaleFor` jest capowane do `LAKE_SCALE_MAX` 0.85.

Ocean powstaje w `rebuildWorldBundle()`; rozmiar plane = `(unloadRadius * 2 + 4) * chunkSize`. Singleton jest schowany wewnątrz `loadRadius * chunkSize` (chunk water rysuje brzeg). `gameLoop` woła `ocean.follow(player.xz)` i `ocean.update(dt)`. Jeziora: `ChunkManager` tworzy/niszczy mesh przy streamie chunka; `update(dt)` + `setDayNight` idą przez `chunkManager`.

---

## Stan obecny

### Techniczny

| Element | Jak jest |
|---------|----------|
| `waterLevel` | `WorldConfig.terrain.waterLevel`, default **0.45**; GUI live (rebuild) |
| `bodyScale` | 0 ląd; inland `min(lakeScaleFor(area), 0.85)`; 1 = ocean (`oceanMixAt` > 0.9) |
| Mesh terenu pod wodą | `heights = max(floorH, waterLevel)` — tafla, nie wanna |
| Batymetria | `floorHeights` → shader (`depth = waterLevel - floorH`) + pływak / ambient |
| Maska chunk water | `vCover` z heightmapy; `discard` gdy `< 0.02`. Komórki oceanu **rysowane** (nie discard) |
| Fale | 3–4 sine w **world.xz**; jezioro drobne zmarszczki, ocean wolniejszy swell (`mix` z `vOcean`) |
| Foam | z `1 - vCover` + `fwidth(vCover)` przy brzegu, nie z amplitudy fali |
| Kolor | `mix(shallow, deep, depthT)` + fresnel; palety jezioro vs ocean |
| Paleta dzień/noc | `setWaterDayNight(dayFactor, sunDirection)` lerp 6 kolorów + sun specular |
| Shader | `src/world/waterMaterial.ts` — jeden program-ród, `USE_CHUNK_MASK` na jeziorach |
| Ocean singleton | ten sam shader, `uOcean = 1`; radial fade poza `loadRadius`; **bez** lustra (faza 3) |
| Mokry piasek | terrain fragment: przyciemnienie albedo w paśmie `waterLevel` .. `+0.4` |
| Szwy chunków | mesh wody = `chunkSize` (bez overlap 1.02); faza fal wspólna (world-space) |
| Gameplay | NPC/fauna/drogi/namiot/kopanie **odrzucają** wodę; gracz pływa (cap głębokości). Picie zwierząt = plan [094](./plans/2026-08-13--094--fauna-food-water-for-satiety-hydration.md), nie render |

Wejścia kodu:

```text
src/world/waterMaterial.ts
src/world/createOcean.ts
src/world/createWater.ts
src/terrain/waterBodies.ts
src/terrain/chunkHeightmap.ts      detect + bodyScale + clamp heights
src/terrain/chunkManager.ts        createChunkWater / update / setDayNight
src/terrain/buildChunkGeometry.ts  mokry piasek (uWaterLevel)
src/app/worldBundle.ts             createOcean
src/app/gameLoop.ts                follow + setDayNight
src/terrain/biomeColors.ts         pas piasku / dna (smoothstep, issue 001)
src/player/PlayerController.ts     pływanie po floorHeights
```

### Wizualny (2026-08-13)

Screen (przed fazą 1): [refs/water-2026-08-13-inland-dual-material.png](./refs/water-2026-08-13-inland-dual-material.png)

To było śródlądowe jezioro rysowane dwoma systemami. **Faza 1** odcina inland od `bodyScale = 1`. **Faza 2** usuwa Water.js — jeden shader, depth fade, piana, mokry piasek. Browser check: issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) / [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md).

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

Plan: [098](./plans/2026-08-13--098--water-unified-shader-shore-reflections.md). **Stan obecny powyżej jest nadal kodem** — target to W1–W12.

### P0 — jeden materiał na jednym zbiorniku (issue 028)

1. W8: śródlądzie nigdy nie discarduje do oceanu. Ocean tylko tam, gdzie to naprawdę morze. **🔧 faza 1 planu 098** — browser check.
2. Geometria: jeziora per-chunk + ocean singleton (W2). Materiał oceanu = rodzina jezior (W1). **🔧 faza 2** — bez Water.js; lustro w fazie 3.

### P1 — wygląd z decyzji

3. Depth fade z `floorHeights` (W10). **🔧 faza 2**
4. Brzeg: fade + piana z maski + mokry piasek (W11). Issue 003 na oceanie w załadowanych chunkach. **🔧 faza 2**
5. Fale world-space; jezioro drobne, ocean swell (W12). **🔧 faza 2**
6. Wspólne lustro 256² + fallback sky/spec + toggle Vue/lil-gui (W9). Default on. **faza 3**

### P2 — później

7. Nurt rzek.
8. Mesh per basen / wanna w terenie (review 001 C).
9. SSR, refrakcja, caustics, mirror > 256² — **nie**.

---

## Historia poprawek

Najnowsze na górze.

### 2026-08-13 — Faza 2 planu 098: jedna rodzina shadera + brzeg 🔧

- `waterMaterial.ts`: jezioro/ocean, fale `world.xz`, głębokość z `floorHeights`, piana z `vCover`.
- `createOcean` bez Water.js; singleton radial-fade poza `loadRadius` (chunk water rysuje plażę).
- Terrain: mokry piasek (`uWaterLevel`, pas ~0.4).
- Lustro sceny **nie** wraca — faza 3.
- Issue [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md) → `verification needed`.

### 2026-08-13 — Faza 1 planu 098: W8 inland ≠ ocean 🔧

- `computeBodyScale` bierze `continentalness`; `isLarge` / 35% chunka usunięte.
- Jeziora cap 0.85; discard 0.9 zostaje, ale znaczy komórkę oceanu.
- Testy: `src/terrain/waterBodies.test.ts`.
- Issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) → `verification needed`.

### 2026-08-13 — Plan 098 (P0–P1) 📝

- Plan: [098](./plans/2026-08-13--098--water-unified-shader-shore-reflections.md) — faza 1 W8, faza 2 shader+brzeg, faza 3 lustro+Vue.
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
| 2 płaskie dno mesha (brak batymetrii wizualnej) | `done` faza 2 — shader sampluje `floorHeights` (browser) |
| 3 rozdzielczość siatki wody vs teren | częściowo: `min(resolution-1, 256)` zamiast stałych 96 |
| 4 dzień/noc | `done` (issue 002) |
| 5 foam nie z brzegu | `done` faza 2 — piana z maski (browser) |
| 6 z-fight | nie potwierdzony; marginesy 0.02 / 0.07 |

---

## Otwarte

| Temat | Status | Link |
|-------|--------|------|
| Śródlądzie renderowane jako ocean (dwa materiały) | `verification needed` | issue [028](./issues/2026-08-13--028--inland-water-dual-material.md); faza 2 usuwa Water.js |
| Soft shore fade ocean ↔ ląd | `verification needed` | issue [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md), plan [098](./plans/2026-08-13--098--water-unified-shader-shore-reflections.md) faza 2 |
| Blotches w lustrze oceanu | `deferred` do fazy 3 | issue [009](./issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md) — brak mirror pass do fazy 3 |
| Depth fade / brzeg / world-space waves | `verification needed` | W10–W12, faza 2 |
| Wspólne lustro + toggle Vue | `todo` | W9, faza 3 |
| Artefakty oceanu na telefonie | notatka | [plans/README.md](./plans/README.md) Quick notes |
| Fauna pije wodę (symulacja) | `todo` | plan [094](./plans/2026-08-13--094--fauna-food-water-for-satiety-hydration.md) |

---

## Powiązane

- [GRAPHICS.md](./GRAPHICS.md) — G3–G6, log 2026-08-12
- [STATE.md](./STATE.md) — WorldBundle.ocean, skrót ocean/jeziora
- [reviews/2026-08-07--001--water-quality.md](./reviews/2026-08-07--001--water-quality.md)
- [architecture/performance-and-workers.md](./architecture/performance-and-workers.md)
