# Plan: Visual Atmosphere & Lighting Polish

**Status:** `verification needed` (zaimplementowane 2026-08-10, wymaga weryfikacji wizualnej w przeglądarce)
**Created:** 2026-08-09
**Scope:** Three.js / WebGL2

## Cel

Duży wzrost atrakcyjności wizualnej przy małym koszcie implementacji, bez przebudowy renderera.

Seedvale ma już post-processing, dzień/noc, dynamiczne światło, mgłę, wodę i wiatr. Plan rozszerza istniejący pipeline.

## 1. Atmospheric Distance Fog ⭐⭐⭐⭐⭐

### Cel

Uzyskać większe poczucie przestrzeni i naturalne przejście świata w atmosferę.

```text
near → normal colors
       ↓
medium distance → lekko desaturated
       ↓
far distance → kolor atmosfery / nieba
```

### Sugestia implementacji

- wykorzystać istniejące `scene.fog` / `FogExp2`,
- dopasować `fogColor` do aktualnego koloru nieba,
- dynamicznie zmieniać `fogDensity` zależnie od `timeOfDay`,
- opcjonalnie dodać shaderowy komponent zależny od wysokości.

Najprostsza wersja:

```ts
scene.fog = new THREE.FogExp2(skyColor, density);
```

Kolor i gęstość aktualizować wraz z porą dnia.

**Efekt:** większa głębia, naturalne zanikanie gór i obiektów w oddali, mniej widoczne granice proceduralnego świata/chunków.

**Priorytet: bardzo wysoki.**

## 2. Dynamiczne niebo + światło zależne od pory dnia ⭐⭐⭐⭐⭐

### Cel

Nadać dzień/nocy bardziej filmowy charakter.

Zależności:

```text
timeOfDay
    ↓
sky color
sun color
sun intensity
ambient light
fog color
```

### Sugestia implementacji

Wykorzystać istniejący system `timeOfDay` i zdefiniować punkty przejściowe:

```text
night → dawn → day → sunset → night
```

Dla każdego punktu:

```ts
{
  skyColor,
  fogColor,
  sunColor,
  sunIntensity,
  ambientIntensity
}
```

Interpolować płynnie pomiędzy punktami. Zachód powinien mieć cieplejsze światło i kolor horyzontu, noc chłodniejsze światło i ciemniejsze niebo.

**Priorytet: bardzo wysoki.**

## 3. Subtelny Bloom + glow ⭐⭐⭐⭐

### Cel

Dodać miękką poświatę do najjaśniejszych elementów świata:

- słońce,
- księżyc,
- ogniska,
- pochodnie,
- przyszłe źródła światła.

### Sugestia implementacji

Wykorzystać istniejący `EffectComposer` i dodać bloom do obecnego pipeline'u.

Bloom powinien być bardzo subtelny — tylko jasne elementy powinny tworzyć miękkie halo.

Dla ogniska/pochodni można powiązać faktyczne `PointLight` z czasem palenia.

**Priorytet: wysoki.**

## 4. God Rays / Light Shafts ⭐⭐⭐⭐

### Cel

Dodać efekt promieni światła przy nisko położonym słońcu, szczególnie rano i wieczorem oraz w pobliżu drzew i lekkiej mgły.

### Sugestia implementacji

Na początek użyć **screen-space light shafts**, bez pełnego volumetric lighting.

```text
scene
  ↓
occlusion / depth
  ↓
light shaft shader
  ↓
composite
```

Pozycję słońca przeliczyć na ekran przez `camera.project()`, a shader wykorzystać do rozpraszania jasności od pozycji słońca.

Efekt aktywować głównie przy niskiej wysokości słońca i odpowiednio osłabiać poza warunkami sprzyjającymi efektowi.

Nie zaczynać od prawdziwego volumetric lighting — screen-space shafts powinny dać większość efektu przy znacznie mniejszym koszcie.

**Priorytet: średni/wysoki.**

## Kolejność implementacji

```text
1. Atmospheric fog
       ↓
2. Dynamic sky + lighting
       ↓
3. Bloom / glow
       ↓
4. God rays
```

Każdy etap powinien być niezależnie weryfikowalny.

## Zasada projektowa

Nie tworzyć czterech niezależnych efektów. Wszystkie powinny korzystać z istniejącego `timeOfDay`:

```text
timeOfDay
     ↓
┌────┴───────────────┐
↓                    ↓
Sky              Lighting
↓                    ↓
Fog              Post FX
                    ↓
              Bloom / Rays
```

Zmiana pory dnia powinna automatycznie zmieniać cały klimat świata.

## Oczekiwany efekt

Bez zwiększania szczegółowości geometrii:

```text
proceduralny teren
      +
atmospheric depth
      +
dynamiczne światło
      +
subtelny glow
      +
sun rays
      ↓
bardziej filmowy, żywy i przestrzenny świat
```

Priorytetem jest **wizualny efekt / koszt implementacji**, a nie techniczna złożoność efektów.

## Stan implementacji (2026-08-10)

1. **Atmospheric fog** — było już częściowo zaimplementowane (`scene.fog` liniowy `THREE.Fog`, aktualizowany w `applyDayNight()` wg `skyParamsFromTime`). Doprecyzowane: `fogColor` liczony był dawniej z 3-bucketowego przełącznika (`elev < 0` / `< 0.25` / else), co dawało widoczny "pop" koloru przy przejściu progu — zastąpione płynnym `Color.lerp` noc→zmierzch/świt→dzień w `src/world/dayNight.ts` (`fogColorFromElev`).
2. **Dynamiczne niebo + światło** — też już było zaimplementowane (Preetham `Sky` + `sunIntensity`/`ambientIntensity`/`hemiIntensity`/`fogColor` liczone ciągle z `elev`/`dayFactor` w `skyParamsFromTime`, aplikowane w `applyDayNight()`). Bez większych zmian poza p.1 — uznane za już spełniające zamysł planu (ciągła interpolacja, cieplejsze światło przy niskim słońcu).
3. **Bloom** — nowy `UnrealBloomPass` w `src/render/createPostProcessing.ts`, między `SMAAPass` a `OutputPass` (działa na liniowym, jeszcze nie tonemapowanym kolorze — właściwe miejsce dla blooma). Domyślnie subtelny (`strength 0.4`, `radius 0.4`, `threshold 0.85`). Podpięty pod ognisko/pochodnię/światła domów przez ich istniejące emissive materiały + `PointLight` (`props.ts`) — nie wymagał zmian w tych plikach.
4. **God rays** — brak gotowego modułu kompatybilnego z istniejącym `EffectComposer` (pakiet `postprocessing`/pmndrs ma `GodRaysEffect`, ale inny, niekompatybilny system composerów; `three/examples/jsm/postprocessing` ma tylko `UnrealBloomPass`/`BloomPass`). Napisany własny screen-space shader (`src/render/godRaysShader.ts`, `ShaderPass`) — promienisty blur w stronę rzutowanej na ekran pozycji słońca, wagowany bright-passem (bez osobnego bufora okluzji — zasłonięty teren jest już ciemny w `tDiffuse`, więc naturalnie nie promieniuje). Intensywność liczona w `createPostProcessing.ts::updateGodRays()` (wołane co klatkę z `createApp.ts`, bo zależy od kamery, nie tylko `timeOfDay`): fade in/out wokół niskiego słońca (elew. ~0-0.5) × fade wg tego, czy słońce jest w polu widzenia (`camera.getWorldDirection` · kierunek słońca).
5. Wszystkie 4 punkty sterowane z jednego `WorldConfig['postProcessing']` (+ istniejący `sky`/`dayNight`) — nowe pola: `bloomEnabled/Strength/Radius/Threshold`, `godRaysEnabled/Exposure`, z suwakami w GUI (`Post-processing` folder) i zapisem do `localStorage` (istniejący spread-merge w `persistConfig.ts`/`worldConfig.ts` obsłużył to bez zmian).

`npx tsc --noEmit`, `npx vue-tsc --noEmit`, `npm run lint`, `npm run build` — czyste.

## Weryfikacja

**Do zrobienia przez użytkownika (`localhost:5577`):**

- Podbij `timeMultiplier` w GUI (`Day/Night`) i obejrzyj pełny cykl — sprawdź że kolor mgły/nieba/światła przechodzi płynnie noc→świt→dzień→zmierzch→noc, bez "popnięcia" koloru w żadnym momencie.
- W dzień, przy słońcu nisko nad horyzontem (świt/zmierzch), rozejrzyj się w stronę słońca — powinny być widoczne delikatne promienie (god rays), silniejsze gdy słońce jest częściowo zasłonięte drzewami/terenem. W południe i w nocy promienie powinny zanikać.
- Podejdź w nocy do zapalonego ogniska/pochodni/domu ze światłem w oknie — sprawdź subtelną poświatę (bloom) wokół płomienia/światła, bez rozmycia całej sceny.
- W GUI, folder `Post-processing` — sprawdź suwaki `Bloom`/`God rays` (włącz/wyłącz, przesuń `strength`/`exposure`) i że zmiany widać natychmiast oraz przetrwają odświeżenie (localStorage).
- Sprawdź perf na słabszym sprzęcie/mobile — god rays ma pętlę 32 próbek na piksel, ale tylko gdy `intensity > 0` (blisko horyzontu); reszta czasu shader wychodzi wcześnie.
