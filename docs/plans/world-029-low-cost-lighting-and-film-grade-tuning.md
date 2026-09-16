# Plan: Low-cost lighting and film-grade tuning

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** M
**Model:** Composer, Grok
**Depends on:** none
**Domain:** `world`
**Subdomains:** `time` `weather`
**Tags:** `lighting` `sky` `film-grade` `post-processing` `performance`
**Roadmap:** -

## Cel

Poprawić ogólny odbiór sceny przez tuning istniejącego pipeline'u dnia/nocy, koloru światła i film grade — bez nowych świateł, shader passów, render targetów ani kosztownego per-frame work.

Zakres obejmuje:

1. balans `sun` / `ambient` / `hemi` w ciągu dnia,
2. konserwatywny tuning koloru słońca względem wysokości nad horyzontem,
3. końcowy tuning istniejącego grade w `gradedOutputPass.ts`.

Zmiana ma wzmacniać separację ciepłego direct light i chłodniejszego indirect light, bez ponownego wprowadzania whiteoutu, przepaleń bloom ani zbyt ciemnej nocy.

## Stan obecny

- `src/world/dayNight.ts::skyParamsFromTime()` jest czystym źródłem `sunIntensity`, `ambientIntensity`, `hemiIntensity`, fog distance/color i parametrów Sky.js.
- `src/world/createSky.ts::setParams()` już aktualizuje pozycję, intensywność i kolor `DirectionalLight` zależnie od położenia słońca; plan nie dodaje nowego mechanizmu dynamicznego koloru.
- `src/app/gameLoop.ts::applyDayNight()` składa day/night → weather overlay → lightning overlay, a następnie aktualizuje istniejące światła/fog/water/grass. Aktualizacja jest throttlowana przez `DAY_NIGHT_APPLY_THRESHOLD`.
- `src/world/weatherVisuals.ts` skaluje światło istniejącym `lightScale`; weather ownership ma pozostać osobny od bazowej krzywej day/night.
- `src/render/gradedOutputPass.ts` składa film grade i dither w istniejącym `OutputPass`; nie ma osobnego film-grade `ShaderPass`.
- `docs/architecture/GRAPHICS.md` G2/G7 zabrania dokładania kosztownych passów bez świadomego budżetu; ten plan ma pozostać wewnątrz istniejącego pipeline'u.

## Scope

### 1. Lighting balance

Dostroić istniejące krzywe intensywności w `skyParamsFromTime()` tak, aby:

- direct sunlight pozostawał głównym źródłem modelowania bryły w dzień,
- ambient/hemi nie spłaszczały kontrastu,
- świt/zmierzch pozostawały czytelne bez gwałtownego skoku jasności,
- noc nadal korzystała z obecnych minimalnych poziomów, bez globalnego rozjaśniania sceny.

Zmieniać wyłącznie istniejące scalars/krzywe; nie dodawać kolejnych Light objects.

### 2. Sun color curve

Dostroić istniejący kolor `DirectionalLight` w `createSky.ts`:

- niski sun elevation → wyraźniej ciepły direct light,
- wysoki sun elevation → neutralniejsze ciepłe światło,
- przejście płynne i bounded,
- bez osobnego timera/state; wykorzystać istniejący `sunPosition` / elevation.

Nie przenosić weather tint ownership do `createSky.ts` i nie uzależniać koloru od player/camera.

### 3. Indirect-light color balance

Jeżeli browser tuning wykaże potrzebę, skorygować statyczne kolory istniejących `AmbientLight` / `HemisphereLight` w `createLights.ts`, pozostawiając ich intensywności pod kontrolą `skyParamsFromTime()`.

Nie dodawać nowych świateł, cubemap/IBL ani environment map w tym planie.

### 4. Film grade

Po ustaleniu lighting dostroić tylko istniejące operacje w `GRADED_OUTPUT_FRAGMENT_SHADER`:

- saturation,
- contrast,
- highlight shoulder,
- bardzo mały warm/cool bias,
- zachować obecny ordered dither.

Film grade ma być finishing step, nie mechanizmem maskującym błędne światło.

## Non-goals

- nowe post-process passy,
- SSR, DOF, volumetric fog, LUT pipeline lub color-grading texture,
- nowe Point/Spot/Directional lights,
- większe shadow maps albo shadow-frustum changes,
- zmiany N8AO/SMAA/bloom/god-rays architecture,
- materiałowe zmiany skał/drewna (osobny `world-terrain-036`),
- weather-aware wet materials,
- nowe tekstury/environment maps.

## Guardrails performance

- Zero nowych render passów i render targetów.
- Zero nowych scene lights.
- Zero nowych texture samples.
- Nie zwiększać częstotliwości `applyDayNight()`; zachować `DAY_NIGHT_APPLY_THRESHOLD`.
- Nie dodawać per-frame allocations; istniejące temp colors/vectors lub stałe profile wystarczą.
- Nie zwiększać shadow-map size ani zakresu shadow camera.
- Film grade pozostaje w istniejącym `OutputPass`.

## Implementation guidance

Relevant code:

- `src/world/dayNight.ts` — `skyParamsFromTime()`, fog/day-factor ownership,
- `src/world/createSky.ts` — `setParams()` / sun color + direction,
- `src/world/createLights.ts` — bazowe kolory ambient/hemi/sun i shadow contract,
- `src/app/gameLoop.ts` — `applyDayNight()` composition order; nie przenosić ownership tutaj,
- `src/world/weatherVisuals.ts` — weather `lightScale`, fog/sky overlays,
- `src/render/gradedOutputPass.ts` — existing grade+dither inside `OutputPass`,
- `src/render/createPostProcessing.ts` — potwierdzenie, że nie tworzymy kolejnego passa,
- `src/tools/assetBrowser/viewer/createViewerScene.ts` — Game-like preview reuses `skyParamsFromTime`; tuning powinien automatycznie być widoczny także tam.

Jeżeli wydzielona zostanie czysta funkcja do krzywej koloru/intensywności, dodać krótki JSDoc z `@domain world`.

## Verification

Automated:

- testy czystych krzywych dla reprezentatywnych godzin/elevation: noc, świt, południe, zmierzch,
- wartości pozostają bounded i ciągłe w kluczowych progach,
- weather `lightScale` nadal mnoży wynik zamiast zostać zastąpiony,
- film-grade shader nadal jest częścią jednego `OutputPass`,
- typecheck/lint/build.

Browser — wykonuje User:

- porównanie stałych punktów widoku o 06:00 / 12:00 / 18:00 / noc,
- powtórzyć dla clear i rain/storm,
- sprawdzić skały, drzewa, NPC i budynki w direct + shade,
- zwrócić uwagę na whiteout nieba/horyzontu, przepalenie bloom, zbyt niebieskie cienie i zbyt ciemną noc,
- po lighting dopiero ocenić film grade A/B.

## Kryteria akceptacji

- Scena ma czytelniejszą separację direct/indirect light i bardziej naturalny rytm dnia.
- Świt/zmierzch są cieplejsze bez przepaleń i bez regresji weather overlay.
- Film grade poprawia spójność końcowego obrazu bez dominowania nad materiałami i lightingiem.
- Brak nowych passów, świateł, tekstur, render targetów i zwiększonej częstotliwości update.
- Koszt steady-state powinien pozostać praktycznie niezmieniony.

> **Zrób git commit i push do main, rebase jeżeli trzeba**