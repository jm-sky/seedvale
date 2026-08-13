# Ostre krawędzie / artefakty na styku oceanu z lądem

**Status:** `planned`
**Created:** 2026-08-07
**Updated:** 2026-08-13
**Plan:** [098](../plans/2026-08-13--098--water-unified-shader-shore-reflections.md) faza 2 (chunk water rysuje komórki oceanu z `vCover` zamiast samego depth-testu singletonu)
**Źródło:** rozmowa z użytkownikiem, po dodaniu reflective ocean (`src/world/createOcean.ts`)

## Problem

Reflective ocean (`three/addons/objects/Water.js`, `createOcean.ts`) to płaski `Mesh` bez własnej maski per-fragment — w przeciwieństwie do stylized wody jezior (`createWater.ts`, `vCover` liczone z `uHeightmap` + smoothstep), ocean polega wyłącznie na:

1. standardowym depth-teście względem nieprzezroczystego terenu (ukrywa ocean pod suchym lądem),
2. stylized wodzie jezior renderowanej nad nim (`waterLevel + 0.07` vs ocean `waterLevel + 0.02`), która przesłania ocean nad jeziorami.

Na granicy ocean/ląd (i prawdopodobnie ocean/jezioro) brak miękkiego przejścia daje widoczne ostre krawędzie/artefakty — zgłoszone przez użytkownika po wizualnej weryfikacji w przeglądarce (`docs/issues/README.md` — wcześniej odnotowany podobny problem z brzegiem koloru terenu, patrz [001](./2026-08-07--001--water-shore-color-banding.md), ale to inny mechanizm: tam chodziło o kolor terenu, tu o krawędź samej siatki/reflection oceanu).

## Możliwe kierunki (nieprzeanalizowane, do rozstrzygnięcia przy realizacji)

- Dodać do `createOcean.ts` per-fragment "shore fade" analogiczny do `vCover` w `createWater.ts` (sampling tej samej `uHeightmap`-style tekstury, smoothstep blend do przezroczystości/koloru lądu przy brzegu) — wymaga kolejnego patcha skompilowanego fragment shadera `Water.js` (już patchujemy go dla reflectance/tint, patrz `createOcean.ts`).
- Sprawdzić, czy problem to raczej z-fighting (ocean `waterLevel+0.02` bardzo blisko płaskiego, przyciętego dna `waterLevel`) niż brak maski — jeśli tak, prostszy fix to zwiększenie marginesu wysokości.
- Zweryfikować, czy artefakt występuje też na granicy ocean/jezioro (gdzie oba systemy wody nakładają się przestrzennie), czy tylko ocean/ląd.

## Effort

Nieoszacowany — do analizy przy podjęciu.
