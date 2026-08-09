# Plan: Visual Atmosphere & Lighting Polish

**Status:** `planned`
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
