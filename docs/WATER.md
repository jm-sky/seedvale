# Seedvale — Woda

**Purpose:** źródło prawdy dla wody (ocean + jeziora / cieki śródlądowe): stan techniczny i wizualny, decyzje, historia poprawek.

**Nie jest:** planem implementacji ([plans/](./plans/README.md)), logiem całej grafiki ([GRAPHICS.md](./GRAPHICS.md) — tam zostają kontrakty G4–G6), ani katalogiem assetów.

**Last verified:** 2026-08-13 (kod + screen użytkownika)

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
| W1 | **Dwa systemy renderu, nie trzy.** Ocean = singleton `Water.js`. Śródlądzie = per-chunk stylized shader. Nie dokładać SSR / refrakcji / trzeciego mesha wody. | `createOcean.ts`, `createWater.ts`; review [001](./reviews/2026-08-07--001--water-quality.md) odrzucił screen-space |
| W2 | Ocean = **jeden** plane, follow gracza, **nie** per-chunk. Mirror RT trzymać **mały** (256²). | [GRAPHICS.md](./GRAPHICS.md) G5 |
| W3 | Oba systemy: `transparent: true`, **`depthWrite: false`**. Nie łączyć transparent + depthWrite + wysokiego `renderOrder` — woda maluje się przez korony. | G4, issue [022](./issues/2026-08-12--022--ocean-through-tree-foliage.md) |
| W4 | Liście GLTF `BLEND` → opaque `alphaTest` cutout. Korony piszą depth, woda nie. | G3 |
| W5 | Jeziora maskują się heightmapą (`vCover`); nad komórkami `vBodyScale > 0.9` **discard** → widać ocean. | G6, `waterBodies.ts` |
| W6 | **Performance jest constraint.** Nowy pass / większy mirror / per-frame CPU „dla ładniejszej wody” wymaga świadomej ceny. | G2 |
| W7 | Weryfikacja wizualna = **przeglądarka**, nie sam `tsc`/lint/build. | G8 |

### Proponowane (jeszcze nie decyzja)

| ID | Propozycja | Po co |
|----|------------|-------|
| W8 📝 | **Ocean tylko dla prawdziwego morza / wybrzeża.** Śródlądowe jeziora i cieki zostają na shaderze jezior niezależnie od powierzchni w chunku. | Screen 2026-08-13: jeden staw = dwa materiały. Issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) |

---

## Architektura

```text
heightmap (worker)
  heights[]     — teren przycięty do waterLevel (płaskie „dno” mesha)
  floorHeights[] — prawdziwa wysokość pod wodą (gameplay: pływanie, ambient)
        ↓
detectWaterBodies()  — BFS 4-sąsiedztwo w obrębie JEDNEGO chunka (+ apron)
        ↓
computeBodyScale()   — 0 ląd · 0–1 jezioro · 1.0 „duży” (= ocean)
        ↓
┌───────────────────────────────────┬─────────────────────────────────────┐
│ createChunkWater (per chunk)      │ createOcean (singleton, WorldBundle)│
│ stylized ShaderMaterial           │ three/addons Water.js + patch       │
│ maska uHeightmap → vCover         │ brak maski brzegu                   │
│ discard gdy vBodyScale > 0.9      │ widać tam, gdzie teren nie zasłania │
│ y = waterLevel + 0.07             │ y = waterLevel + 0.02               │
│ PlaneGeometry * 1.02, ≤256 seg.   │ jeden Plane, follow(player)         │
└───────────────────────────────────┴─────────────────────────────────────┘
```

Klasyfikacja „duży zbiornik” (`isLarge`): powierzchnia ≥ **35% pola siatki chunka** (`LARGE_BODY_AREA_FRACTION`). To jest względne wobec `chunkSize`, ale **lokalne wobec chunka** — BFS nie widzi, że ciek ciągnie się dalej. Komentarz w `waterBodies.ts` to przyznaje.

Ocean powstaje w `rebuildWorldBundle()`; rozmiar plane = `(unloadRadius * 2 + 4) * chunkSize`. `gameLoop` woła `ocean.follow(player.xz)` i `ocean.update(dt)`. Jeziora: `ChunkManager` tworzy/niszczy mesh przy streamie chunka; `update(dt)` + `setDayNight` idą przez `chunkManager`.

---

## Stan obecny

### Techniczny

| Element | Jak jest |
|---------|----------|
| `waterLevel` | `WorldConfig.terrain.waterLevel`, default **0.45**; GUI live |
| Mesh terenu pod wodą | `heights = max(floorH, waterLevel)` — tafla, nie wanna |
| Batymetria | `floorHeights` istnieje; pływak (`PlayerController.snapToGround`) i ambient z niej korzystają. **Shader jeziora jej nie sampluje.** |
| Maska jeziora | `vCover = 1 - smoothstep(waterLevel - 0.05, waterLevel + 0.35, terrainH)`; `discard` gdy `< 0.02` |
| Fale jeziora | 3 sine w **lokalnym** `position.xz` chunka (szwy między chunkami) |
| Foam jeziora | z amplitudy fali, **nie** z brzegu |
| Kolor jeziora | `mix(uDeep, uShallow, fresnel)` — fresnel = kąt kamery, nie głębokość |
| Paleta dzień/noc | jeziora: `setDayNight(dayFactor)` lerp palet; ocean: lerp `waterColor` / `sunColor` + `sunDirection` |
| Ocean shader | patch Water.js: cap reflectance 0.4, mix odbicia z `waterColor` 0.55, alpha fresnel; `alpha` bazowe 0.78 |
| Ocean normals | proceduralna 256² tileable DataTexture (sine ripples), nie asset |
| Mirror | 256², re-render sceny co klatkę — jedyny ciężki koszt oceanu |
| Szwy chunków | mesh wody `chunkSize * 1.02` (nakładka); niezależne materiały |
| Gameplay | NPC/fauna/drogi/namiot/kopanie **odrzucają** wodę; gracz pływa (cap głębokości). Picie zwierząt = plan [094](./plans/2026-08-13--094--fauna-food-water-for-satiety-hydration.md), nie render |

Wejścia kodu:

```text
src/world/createOcean.ts
src/world/createWater.ts
src/terrain/waterBodies.ts
src/terrain/chunkHeightmap.ts      detect + bodyScale + clamp heights
src/terrain/chunkManager.ts        createChunkWater / update / setDayNight
src/app/worldBundle.ts             createOcean
src/app/gameLoop.ts                follow + ocean.setDayNight
src/terrain/biomeColors.ts         pas piasku / dna (smoothstep, issue 001)
src/player/PlayerController.ts     pływanie po floorHeights
```

### Wizualny (2026-08-13)

Screen: [refs/water-2026-08-13-inland-dual-material.png](./refs/water-2026-08-13-inland-dual-material.png) ✅

Śródlądowy zbiornik przy piaszczystym brzegu (postać „Ja”). To **nie** jest krawędź oceanu — to jezioro / ciek, na którym widać oba systemy naraz.

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

## Rekomendowana kolejność poprawek

Nie implementować z tej listy bez planu / zgody. Kolejność = to, co naprawia screen, przy W1–W6.

### P0 — jeden materiał na jednym zbiorniku

To jest 90% tego, co widać na obrazku.

1. **Ocean nie dla śródlądzia (W8).** `isLarge` tylko gdy zbiornik łączy się z prawdziwym oceanem / wybrzeżem (sygnał: niska kontynentalność, ciało dotyka krawędzi świata wodnego, nie „≥35% tego chunka”). Duże jezioro w lesie zostaje na `createChunkWater`.
2. **Klasyfikacja spójna między chunkami.** Dziś BFS per chunk sprawia, że ten sam ciek jest oceanem w jednym chunku i jeziorem w sąsiednim. Apron już jest w heightmapie — albo klasyfikacja z sąsiadów, albo reguła W8 sprawia, że pomyłka 35% przestaje być widoczna.
3. **Nie dokładać trzeciego shadera.** Najpierw przestać pokazywać Water.js na stawie.

### P1 — brzeg i spójność tafli

4. **Fade brzegu jeziora z głębokości.** `floorHeights` już jest — sample w shaderze: płycej → jaśniej / bardziej przezroczysto, pianka z `fwidth(vCover)` albo `1 - vCover`, nie z amplitudy fali (review 001 Finding 5).
5. **Issue 003 — shore fade oceanu** tylko tam, gdzie ocean ma prawo być (po P0). Patch Water.js analogiczny do `vCover`, albo maska z tej samej heightmapy. Bez tego morze dalej tnie ląd wielokątem.
6. **Fale w world-space** (`world.xz`, nie `position.xz`) i mesh wody = `chunkSize` (bez `* 1.02`), ewentualnie lekki overlap z identyczną fazą. Usuwa szwy płatów.
7. **Zbliżyć palety**, jeśli oba systemy zostają na jednym ekranie (wybrzeże): ocean `waterColor` bliżej `DAY_DEEP` / `DAY_SHALLOW`, niższy kontrast lustra.

### P2 — później, nie na ten screen

8. Mokry piasek w shaderze terenu (przyciemnienie w paśmie `sandBandAt`).
9. Inland: bez mirror RT — sky/fresnel + tani specular. Water.js zostaje na morzu (G5).
10. Flow / rzeki jako osobny system — dopiero gdy P0–P1 dadzą jedną taflę.
11. Mesh per basen (review 001 opcja C) / prawdziwa wanna w meshu terenu — duży plan, nie quick win.
12. SSR, refrakcja, caustics — **nie** (W1, W6).

### Świadomie nie robić

- Drugiego oceanu per chunk (zabije FPS — G5).
- Zwiększania mirror powyżej 256² „żeby odbicia były ostrzejsze”.
- Traktowania issue 003 jako fixu na **ten** screen — tamten issue to ocean↔ląd; tu problemem jest ocean **wewnątrz** jeziora.

---

## Historia poprawek

Najnowsze na górze.

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
| 2 płaskie dno mesha (brak batymetrii wizualnej) | `open` — `floorHeights` jest, shader nie używa |
| 3 rozdzielczość siatki wody vs teren | częściowo: `min(resolution-1, 256)` zamiast stałych 96 |
| 4 dzień/noc | `done` (issue 002) |
| 5 foam nie z brzegu | `open` |
| 6 z-fight | nie potwierdzony; marginesy 0.02 / 0.07 |

---

## Otwarte

| Temat | Status | Link |
|-------|--------|------|
| Śródlądzie renderowane jako ocean (dwa materiały) | `todo` | issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) |
| Soft shore fade ocean ↔ ląd | `todo` | issue [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md) |
| Blotches w lustrze oceanu | `verification needed` | issue [009](./issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md) |
| Foam / depth fade / world-space waves | `todo` | ten plik, P1 |
| Artefakty oceanu na telefonie | notatka | [plans/README.md](./plans/README.md) Quick notes |
| Fauna pije wodę (symulacja) | `todo` | plan [094](./plans/2026-08-13--094--fauna-food-water-for-satiety-hydration.md) |

---

## Powiązane

- [GRAPHICS.md](./GRAPHICS.md) — G3–G6, log 2026-08-12
- [STATE.md](./STATE.md) — WorldBundle.ocean, skrót ocean/jeziora
- [reviews/2026-08-07--001--water-quality.md](./reviews/2026-08-07--001--water-quality.md)
- [architecture/performance-and-workers.md](./architecture/performance-and-workers.md)
