# Plan: Woda — jedna rodzina shadera, brzeg, lustro z wyłącznikiem

**Status:** `done` ✅ — fazy 1–3 (browser 2026-08-13)  
**Created:** 2026-08-13  
**Priority:** 🟡 medium  
**Effort:** XL (faza 1 = S; fazy 2–3 = L–XL)  
**Depends on:** ~~022~~ (depthWrite / foliage), ~~001~~ (kolor brzegu terenu)  
**Źródło:** [WATER.md](../WATER.md) W1–W12; issue [028](../issues/2026-08-13--028--inland-water-dual-material.md); issue [003](../issues/2026-08-07--003--ocean-shoreline-artifacts.md)

SoT decyzji i stanu kodu: **[WATER.md](../WATER.md)**. Ten plik jest planem implementacji, nie drugim źródłem prawdy. Gdy kod i plan się rozjadą — zaufaj kodowi, zaktualizuj plan.

**Assety:** bez nowych modeli ani dźwięków.

---

## Cel

Pół-realistyczna, lekko przezroczysta woda bez ciężkiego GPU:

- śródlądzie i ocean = **jedna rodzina shadera**, dwa strojenia;
- ocean **tylko** morze/wybrzeże (W8) — koniec dwóch materiałów na jednym stawie;
- przy brzegu widać piasek, w głębi gęstsza; fade + piana + mokry piasek;
- jezioro: drobne zmarszczki; ocean: wolniejszy swell; fale w `world.xz`;
- lustro sceny: **jeden** pass 256², wyłącznik w Vue; off = niebo + specular i zero extra renderu.

## Done when

- [x] Faza 1 kod: inland nie discarduje do oceanu (`waterBodies.ts`, testy). Browser: issue 028.
- [x] Faza 2 kod: `waterMaterial.ts`, ocean bez Water.js, `floorHeights`, piana, mokry piasek. Browser: checklist faza 2.
- [x] Inland staw ze screenu 2026-08-13: jeden materiał, bez Water.js na środku.
- [x] Wybrzeże: miękki brzeg (issue 003 w załadowanych chunkach), ocean ciemniejszy / większa fala.
- [x] Faza 3: jeden pass 256², `waterReflections`, Vue/lil-gui, persist. Browser: checklist faza 3 (2026-08-13).
- [x] `tsc` / lint / test / build czyste (faza 3 kod). Browser check osobno (W7).

---

## Stan kodu (skrót)

Pełna tabela: [WATER.md — Stan obecny](../WATER.md#stan-obecny).

| Fakt | Plik |
|------|------|
| Jezioro / ocean: `waterMaterial.ts`; chunk `vCover` + `floorHeights`; ocean singleton radial fade | `src/world/waterMaterial.ts` |
| `bodyScale` 0 ląd / jezioro < 0.9 / 1 ocean (kontynentalność, nie pole stawu) | `src/terrain/waterBodies.ts` |
| Ocean: ten sam shader, `uOcean = 1`, bez Water.js, lustro 256² (`waterMirror.ts`) | `src/world/createOcean.ts` |
| `floorHeights` → depth fade w shaderze chunk water | `chunkHeightmap.ts` / `createWater.ts` |
| Fale w `world.xz` (jezioro ripple / ocean swell) | `waterMaterial.ts` vertex |
| Foam z `1 - vCover` + `fwidth(vCover)` | `waterMaterial.ts` fragment |
| Mokry piasek: terrain `uWaterLevel` pas ~0.4 | `buildChunkGeometry.ts` |
| Kontynentalność już na tile (`oceanThreshold` 0.32, `coastThreshold` 0.45) | `RegionParams`, `chunkHeightmap.ts` |
| Grafika Vue: Pauza → Świat → Grafika → „Odbicia wody”; persist `seedvale:graphics:v1` | `WorldConfigScreen.vue` |

`bodyScale` zostaje jako skala fal jeziora (0–1). **Nie** może już oznaczać „oddaj piksel Water.js”.

---

## Świadomie poza (P2 / nie ten plan)

- Nurt rzek (W12).
- Mesh per basen / wanna w meshu terenu (review 001 C).
- SSR, refrakcja, caustics, mirror > 256².
- Drugi ocean per chunk.
- Plan 094 (fauna pije) — symulacja, nie render.

---

## Faza 1 — W8: ocean tylko tam, gdzie to morze (issue 028)

**Effort:** S. Naprawia screen. Water.js **zostaje** na prawdziwym oceanie.

### Klasyfikacja

Zmiana w `computeBodyScale` (+ sygnatura: tablica `continentalness` + `coastThreshold`):

- ląd → `0`;
- woda i `continentalness < coastThreshold` (smoothstep w paśmie `oceanThreshold`…`coastThreshold`) → `1.0` (komórka oceanu — jezioro nadal `discard`, widać singleton);
- woda śródlądowa → `lakeScaleFor(area)` **zawsze < 1** (nigdy nie z pola ≥ 35% chunka).

`isLarge` / `LARGE_BODY_AREA_FRACTION` przestają sterować rendererem. Albo usunąć, albo zostawić jako martwe pole z komentarzem „nie używać do discard” — preferowane: usunąć, żeby nie wróciło.

`detectWaterBodies` nadal liczy area dla `lakeScaleFor` (amplituda fal stawu). BFS per chunk jest OK: pomyłka 35% znika, bo inland nigdy nie dostaje `1.0`.

`chunkHeightmap.ts` już ma `continentalness` w tym samym gridzie co `heights` — podać do `computeBodyScale` w workerze (ten sam transfer co dziś `bodyScale`).

### Shader jeziora

Warunek `if (vBodyScale > 0.9) discard` zostaje w fazie 1, ale `> 0.9` znaczy **komórka oceanu z kontynentalności**, nie „duży staw”. Komentarz w GLSL bez backticków.

### Testy

Nowy `src/terrain/waterBodies.test.ts`:

- staw wypełniający > 35% chunka przy wysokiej kontynentalności → `bodyScale < 1`;
- komórki pod `oceanThreshold` → `1`;
- ląd → `0`;
- `lakeScaleFor` bez zmian zachowania.

### Docs po fazie 1

Issue 028 → `verification needed` (albo `done` po browserze). WATER.md historia. G6: discard tylko komórki oceanu.

**Nie** w tej fazie: nowy shader, lustro, brzeg oceanu, Vue.

---

## Faza 2 — jedna rodzina shadera + brzeg (W1, W10–W12, issue 003)

**Effort:** L. Water.js znika jako materiał oceanu. Lustro sceny jeszcze nie — ocean chwilowo bez planar reflections (sky + specular jak jezioro). Faza 3 przywraca lustro taniej i na obu.

### Materiał

Nowy `src/world/waterMaterial.ts` (albo rozbudowa `createWater.ts`):

- jeden `ShaderMaterial` / fabryka uniformów;
- `transparent`, `depthWrite: false` (W3);
- wariant przez uniform `uOcean` (0 jezioro … 1 ocean), nie drugi program jeśli się da;
- palety: jezioro jaśniejszy cyan/zieleń; ocean ciemniejszy teal; `setDayNight` jak dziś;
- fale z **`world.xz`** (nie `position.xz`); jezioro mała amplituda, ocean swell (`mix` z `uOcean`);
- głębokość: druga R-float tekstura z **`floorHeights`** (dziś idzie tylko `heights` przycięte do `waterLevel`). `createChunkWater` dostaje `floorHeights` analogicznie do `heights`. `depth = uWaterLevel - floorH`. Płytko → `uShallow` + niższe alpha; głęboko → `uDeep` + gęstsze (W10). Nie akwarium;
- piana: `fwidth(vCover)` / `1 - vCover` przy brzegu, **nie** `abs(vWave)` (W11);
- `vCover` bez zmian na jeziorach.

Mesh jeziora: `chunkSize` (nie `* 1.02`) albo overlap z identyczną fazą world-space — po world-space overlap 1.02 jest mniej szkodliwy; i tak zejść z rozjechanej fazy.

### Ocean singleton (W2)

`createOcean` przestaje importować `Water.js`. Zostaje jeden `PlaneGeometry` + `follow(player)` + materiał z `uOcean = 1`.

**Brzeg oceanu w załadowanych chunkach:** chunk water **rysuje** komórki oceanu (ten sam shader, `uOcean` z `bodyScale`/kontynentalności) zamiast discardu. Maska `vCover` daje fade na plaży → to jest fix issue 003 tam, gdzie są chunki. Singleton pod spodem wypełnia otwarte morze / pierścień za chunkami (fog ~ zasięg unloada).

Żeby nie dostać podwójnej, ciemniejszej tafli: na komórkach oceanu w chunku albo (a) singleton `renderOrder` niższy i chunk ocean prawie nieprzezroczysty w głębi, albo (b) singleton fade-out tam, gdzie chunk water pokrywa — (a) wystarczy, jeśli alpha głębi oceanu jest wysoka.

Otwarte morze bez heightmapy na singletonie: twardy clip vs teren zostaje daleko od brzegu (tam nie widać plaży). Nie budować clipmapy 256² z `sampleHeight` co `follow()` — `follow` jest co klatkę.

### Mokry piasek (W11)

Nie nowy mesh. Shared terrain material (`createTerrainMaterial` / `applyTerrainSurfaceShader` w `buildChunkGeometry.ts`): uniform `uWaterLevel`, w fragmentcie przyciemnić albedo gdy interpolowane `worldY` jest w paśmie tuż nad wodą (`sandBand` ~0.4 albo stała). Per-fragment, nie nowy hard `if` w `colorForTerrain` (issue 001).

### Pliki

```text
src/world/waterMaterial.ts     nowy
src/world/createWater.ts       floorHeights + uOcean; bez discard oceanu
src/world/createOcean.ts       bez Water.js; ten sam materiał
src/terrain/chunkManager.ts    przekazać floorHeights do createChunkWater
src/terrain/buildChunkGeometry.ts  mokry piasek
src/app/gameLoop.ts            setDayNight / update bez Water.js uniforms
```

Usunąć patch fragmentu Water.js i `createProceduralWaterNormals` jeśli ripple idzie z sine w shaderze (dziś jezioro tak robi). Normal-mapa oceanu jest opcjonalnym plusem — nie blokuje fazy.

**Notes (faza 2, 2026-08-13):** mesh jeziora = `chunkSize` (bez overlap 1.02). Singleton nie używa opcji (a) samego `renderOrder` — przezroczysty brzeg odsłoniłby twardy clip. Zamiast clipmapy height: radial fade `loadRadius` → `loadRadius+1` chunków (`worldBundle.buildOcean`). Sky + sun specular; lustro = faza 3.

**Notes (faza 3, 2026-08-13):** lustro to `waterMirror.ts` (nie Water.js / nie Reflector per jezioro). Meshe wody na warstwie 1; kamera lustra tylko warstwa 0. Hook: `gameLoop` przed `postProcessing.render()`. Off ustawia `uReflections = 0` i nie woła `renderer.render` na RT. Vue handler = ten sam `updatePostProcessingFromGui` co lil-gui.

---

## Faza 3 — wspólne lustro + Vue (W9)

**Effort:** M–L.

### Pass

Jeden `WebGLRenderTarget` 256² + kamera lustrzana względem `y = waterLevel`. Render sceny **bez** meshy wody (uniknąć rekursji). Wynik = `uMirror` na wszystkich materiałach wody.

Nie `Water.js` i nie Reflector per jezioro. Hook: `gameLoop` przed `postProcessing.render()`, albo `onBeforeRender` na jednym ownerze (ocean mesh).

- **On (default):** pass leci; shader `mix(albedo, mirror, reflectance)` z capem jak dzisiejszy patch (~0.4) + tint w stronę `waterColor`.
- **Off:** pass **nie startuje**; shader: kolor nieba/fog + `sunDirection` specular. Mierzalny spadek GPU.

RT dispose razem z oceanem w `WorldBundle`.

### Config

`WorldConfig.postProcessing.waterReflections: boolean` default `true`.

- Merge w `createWorldConfig` już jest `{ ...defaults, ...stored }` — stare save’y bez pola zostają na default.
- `saveGraphics` / `seedvale:graphics:v1`.
- lil-gui: folder post-process, obok bloom/AO; `onPostProcessingChange` (nie rebuild świata).
- Vue: Pauza → Świat, sekcja **Grafika**, checkbox np. „Odbicia wody”. Dziś `configureWorldConfigScreen` nie ma `onPostProcessingChange` — dodać handler (ten sam co `updatePostProcessingFromGui` + `ocean.setReflections(enabled)` / `chunkManager.setWaterReflections`).

Test: `persistConfig.test.ts` — zapis/odczyt flagi; brak flagi w starym JSON → `true`.

### Po fazie 3

Issue 009 (blotches lustra): nowy pass nadal 256²; nie zagęszczać detail normals terenu. Jeśli blotches wrócą — wyłączyć terrain `normalMap` na czas mirror camera (wspomniane w issue 009, poza minimum).

---

## Kolejność i ryzyko

```text
Faza 1  →  screen naprawiony, dwa silniki zostają (ocean = Water.js)
Faza 2  →  jeden shader; ocean chwilowo bez planar mirror
Faza 3  →  lustro wraca, tańsze, z wyłącznikiem; Water.js usunięty
```

Nie scalać fazy 2 i 3 w jednym PR jeśli mirror się przeciąga — faza 2 sama jest już spójnym wyglądem (sky+spec).

Ryzyko fazy 2: podwójna tafla chunk-ocean + singleton. Najpierw sprawdzić wybrzeże i środek jeziora (alpha). Ryzyko fazy 3: woda w lustrze / rekurencja — hide water meshes w mirror camera.

---

## Weryfikacja

### Techniczna (po każdej fazie)

```text
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Faza 1: testy `waterBodies`. Faza 3: persist flagi.

### Browser (użytkownik; nie headless)

Dev server już na `5577`.

**Faza 1**

1. To samo miejsce co [screen](../refs/water-2026-08-13-inland-dual-material.png) — jeden materiał jeziora, bez ciemnej falującej plamy Water.js.
2. Wybrzeże / otwarte morze — nadal reflective Water.js, bez jeziora na środku oceanu.

**Faza 2** — zaakceptowane 2026-08-13 (użytkownik).

1. Staw: widać piasek przy brzegu, środek ciemniejszy; piana na linii brzegu, nie na środku fal.
2. Sąsiednie chunki jeziora: brak szwu fazy fal.
3. Ocean vs jezioro: ten sam „język”, ocean ciemniejszy / większa fala.
4. Plaża: brak twardego wielokąta clippigu (issue 003 w załadowanym chunku).
5. Mokry piasek na brzegu.
6. Dzień/noc: woda ciemnieje razem ze sceną.
7. Drzewa nad wodą: woda nie maluje się na koronach (regresja 022).

**Faza 3** — zaakceptowane 2026-08-13 (użytkownik).

1. Odbicia włączone: widać niebo/brzeg w tafli; jeden pass (nie zanik FPS vs dzisiejszy ocean).
2. Pauza → Świat → off: odbicia znikają, sky+błysk zostaje; FPS nie gorszy (lepiej na słabszym GPU).
3. Reload: flaga wraca z localStorage.
4. Telefon: off jako ucieczka od artefaktów (notatka w plans/README).

Nie oznaczać fazy `done` na samym `tsc`.

---

## Docs po implementacji

| Plik | Co |
|------|----|
| [WATER.md](../WATER.md) | Historia; architektura = kod; W1/W5 „target” → implemented |
| [GRAPHICS.md](../GRAPHICS.md) | G5/G6 zgodne z kodem; wpis logu |
| [STATE.md](../STATE.md) | Ocean bez Water.js; `waterReflections` |
| Issue 028, 003 | status |
| Ten plan | checklist + notes jeśli coś odbiegło |

---

## Powiązane

- [WATER.md](../WATER.md)
- [GRAPHICS.md](../GRAPHICS.md) G2–G6
- [reviews/2026-08-07--001--water-quality.md](../reviews/2026-08-07--001--water-quality.md)
- [architecture/performance-and-workers.md](../architecture/performance-and-workers.md)
- `src/world/createOcean.ts`, `createWater.ts`, `src/terrain/waterBodies.ts`, `chunkHeightmap.ts`, `chunkManager.ts`, `buildChunkGeometry.ts`, `src/app/worldBundle.ts`, `gameLoop.ts`, `src/config/worldConfig.ts`, `persistConfig.ts`, `src/ui-vue/screens/WorldConfigScreen.vue`, `src/ui/createDebugGui.ts`
