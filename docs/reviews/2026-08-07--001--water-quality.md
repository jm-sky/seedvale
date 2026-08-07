# Review: jakość wody (stylized) — wyniki

**Status:** `done` (analiza) — implementacja poza scope tego review
**Created:** 2026-08-07
**Updated:** 2026-08-07
**Zlecenie:** [to-do--water-quality.md](./to-do--water-quality.md) (przeniesione tutaj)

## Kontekst

Seedvale ma stylized wodę w `src/world/createWater.ts`: pełna płaszczyzna (`PlaneGeometry`, 96×96 segmentów) + maska z `DataTexture` (heightmap → dyskretny `discard` na lądzie), fale w vertex shaderze, fresnel w fragment shaderze. Zgłoszony problem: po fixie migania mniej, ale brzeg jeziora nadal nie wygląda „perfekcyjnie".

## Metoda

Przegląd kodu (bez uruchamiania w przeglądarce — czysto statyczna analiza):
`createWater.ts`, `generateHeightmap.ts`, `createTerrainMesh.ts`, `biomeColors.ts`, `dayNight.ts`, `createApp.ts` (`applyDayNight`), `createRenderer.ts`, `createCamera.ts`, `createScene.ts`, `createSky.ts`, `worldConfig.ts`, `fbm.ts`.

## Findings

### 1. [High] Brzeg „w schodkach" — przyczyna leży w `biomeColors.ts`, nie w shaderze wody

`src/terrain/biomeColors.ts:38-47` klasyfikuje kolor terenu twardymi progami:

```ts
if (height <= waterLevel + 0.05) { out.copy(SEABED); return }
if (height < waterLevel + 1.0) { out.copy(SAND); return }
```

Kolor jest zapisany **per-wierzchołek** w `createTerrainMesh.ts:23-28` (atrybut `color`, Gouraud) — nie per-fragment. Przy domyślnym configu (`size=128`, `resolution=193` → krok siatki ≈ 0.667 jednostki) pas „sand" (1.0 jednostki szerokości) obejmuje **~1.5 wiersza wierzchołków**. Twardy próg + tak gruba siatka względem szerokości pasa = widoczne schodki wzdłuż konturu `waterLevel`, niezależnie od tego, co robi shader wody. To jest właśnie „schody heightmapy" z opisu problemu — artefakt terenu, nie wody.

Maska wody (`createWater.ts:73`, `smoothstep(uWaterLevel-0.05, uWaterLevel+0.35, terrainH)`) jest per-fragment i z bilinearnym samplem tekstury — dużo gładsza niż kolor terenu pod spodem. Efekt: gładko zanikająca woda nad ostro postrzępionym pasem piasku → wizualny konflikt dwóch niezależnie liczonych „brzegów".

### 2. [High] Dno jest idealnie płaskie — brak batymetrii

`generateHeightmap.ts:111`: `if (h < waterLevel) h = waterLevel`. Każdy punkt pod poziomem wody jest przycięty do dokładnie tej samej wysokości. Skutek:
- SEABED to płaska tafla bez żadnego kształtu dna jeziora,
- nie da się zrobić gradientu deep→shallow po realnej głębokości (obecny fresnel w `createWater.ts:98` to substytut kąta patrzenia, nie głębokości — deep/shallow nie reagują na to, jak głęboko naprawdę jest jezioro w danym miejscu).

### 3. [Medium] Rozdzielczość siatki wody odklejona od rozdzielczości terenu

Woda: stałe 96×96 segmentów (`createWater.ts:41`). Teren: `resolution` z configu, domyślnie 193, z presetami do 769 (`worldConfig.ts`). Przy wyższych presetach kontur maski wody (liczony na 97×97 wierzchołkach, potem interpolowany liniowo) będzie zauważalnie grubszy/mniej dokładny niż kontur koloru terenu pod nim — możliwe rozjazdy przy `?res=513`/`769`.

### 4. [Medium] Woda nie reaguje na dzień/noc

`dayNight.ts` + `applyDayNight()` w `createApp.ts` napędzają `sky`, `fog`, `lights.sun/ambient/hemi` co klatkę (`skyParamsFromTime`). `createWater.ts` ma własne, statyczne `uDeep` / `uShallow` / `uFoam` / `uOpacity` — nigdzie nie czyta `dayNight` ani `fog.color`. W nocy (fogColor `0x1a2233`, `sunIntensity` ~0.15) woda pozostanie równie jasna/nasycona jak w południe — rozjazd z resztą sceny, która wyraźnie przyciemnia się i zmienia barwę.

### 5. [Low] Foam nie jest przywiązany do faktycznego brzegu

`col = mix(col, uFoam, foam * 0.4)` gdzie `foam = smoothstep(0.12, 0.22, abs(vWave))` (`createWater.ts:100`) — to amplituda fal, nie odległość od brzegu. Piana może się pojawić na środku jeziora tam, gdzie akurat nałożą się fale, a nie tylko przy linii brzegowej.

### 6. [Info] Brak dowodów na z-fighting w obecnej geometrii

Woda leży płasko na `waterLevel + 0.04` (`createWater.ts:109`), a podwodny teren jest przycięty płasko do dokładnie `waterLevel` (Finding 2) — te dwie płaszczyzny nigdy się nie przecinają, więc realnego z-fightingu być nie powinno. **Uwaga na przyszłość:** jeśli Finding 2 zostanie naprawiony (prawdziwa batymetria), margines 0.04 jednostki może już nie wystarczyć przy stromszych zboczach dna — trzeba będzie pilnować tego marginesu albo dać wodzie własny, lekko podniesiony `renderOrder`/`polygonOffset`.

## Opcje techniczne

**A. Ulepszony shader + fix koloru terenu (quick win)**
Naprawić Finding 1 (miękkie, spójne progi kolorów terenu — najlepiej przenieść na sampling z tekstury/fragment zamiast per-vertex, analogicznie do już istniejącej `uHeightmap` tekstury wody), podbić rozdzielczość siatki wody, spiąć `uDeep`/`uShallow`/`uOpacity` z `dayNight`, foam liczony z gradientu maski (`fwidth(vCover)`) zamiast amplitudy fali. Nie zmienia architektury — jedna globalna płaszczyzna zostaje.

**B. `three/addons/objects/Water.js`**
Symulacja odbić (render-to-texture „mirror" + normal-map ripples) — celowana w fotoreal ocean/staw. **Nie polecam:** (1) estetyka lustrzanych odbić + normal mapy kłóci się z low-poly stylem reszty gry, (2) dodatkowy render pass (koszt na słabszym sprzęcie), (3) nadal wymagałaby własnej maski/kształtu jeziora — nie rozwiązuje Finding 1–3 sama z siebie.

**C. Osobne mesh-e jezior (flood-fill basenów)**
Po wygenerowaniu heightmapy: znaleźć spójne obszary `h <= waterLevel` (flood-fill / marching squares po gridzie), wygenerować geometrię per jezioro zamiast jednej globalnej płaszczyzny + discard. Plusy: prawdziwy, gładki kontur brzegu (niezależny od rozdzielczości siatki terenu), zero marnowanego fill-rate na dyskretowany obszar lądu, naturalny punkt do dołożenia realnej batymetrii (Finding 2) tylko wewnątrz basenów. Koszt: dodatkowy krok generacji (jednorazowy, przy tworzeniu mapy — nie per-frame), więcej kodu (ekstrakcja konturu + triangulacja/stitching do terenu na granicy). To jest architektura docelowa, do której naturalnie prowadzi rozwiązanie Finding 1–3.

**D. Refrakcja / screen-space**
Odrzucam na tym etapie: brak istniejącego pipeline post-processingu, brak WebGPU, koszt nieproporcjonalny do stylized art directionu. Rewizja tylko jeśli kierunek artystyczny przesunie się w stronę semi-realizmu.

## Integracja z dniem/nocą — rekomendowane podejście

Analogicznie do `applyDayNight()` w `createApp.ts` (które już liczy `fog.color`/`near`/`far` z `skyParamsFromTime`): dodać do `createWater` metodę `setDayNight(p: ReturnType<typeof skyParamsFromTime>)` (albo przekazać `sunIntensity`/`fogColor` jako uniformy `uDayFactor`/`uNightTint`) i wołać ją z tego samego miejsca co `fog`/`lights`, żeby `uDeep`/`uShallow`/`uOpacity` przyciemniały się i przesuwały barwę spójnie z resztą sceny.

## Rekomendacja

**Ścieżka 1 — quick win (~0.5–1 dzień, niskie ryzyko):**
1. Finding 1: miękkie/spójne progi koloru terenu przy brzegu (największy realny wpływ na „jak wygląda brzeg" — większy niż cokolwiek w samym shaderze wody)
2. Finding 4: uniformy wody zasilane z `dayNight`
3. Finding 3: podbić segmenty siatki wody (np. do rozdzielczości terenu albo stałe 192)
4. Finding 5: foam z gradientu maski zamiast amplitudy fali

**Ścieżka 2 — docelowa (~2–4 dni, średnie ryzyko):**
5. Finding 2 + Opcja C: flood-fill basenów → mesh per jezioro, prawdziwa batymetria (usunięcie twardego `h = waterLevel` clampa wewnątrz basenu), pilnowanie marginesu z Finding 6 przy stromych brzegach

Ścieżka 1 nie blokuje Ścieżki 2 — naprawia to, co jest teraz widoczne, a flood-fill i tak wymaga osobnego planu (nowy krok generacji, potencjalnie osobny plik jak `docs/plans/2026-08-07-world-streaming-persistence.md` sugeruje dla wody per-chunk).

**Poza scope (zgodnie z to-do):** chunk streaming wody — patrz `docs/plans/2026-08-07-world-streaming-persistence.md` (już notuje „woda per-chunk lub jedna tafla w AABB załadowanych").

## Next steps

- [ ] Issue: fix twardych progów koloru brzegu (`biomeColors.ts` + `createTerrainMesh.ts`) → [issues/README.md](../issues/README.md)
- [ ] Issue: spięcie uniformów wody z `dayNight` (`createWater.ts` + `createApp.ts`)
- [ ] Rozważyć osobny plan `docs/plans/*-water-lake-mesh.md` dla Ścieżki 2 (flood-fill + batymetria), gdy Ścieżka 1 będzie done
