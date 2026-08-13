# Ostre krawędzie / artefakty na styku oceanu z lądem

**Status:** `done`
**Created:** 2026-08-07
**Updated:** 2026-08-13
**Plan:** [098](../plans/2026-08-13--098--water-unified-shader-shore-reflections.md) faza 2 (chunk water rysuje komórki oceanu z `vCover`; singleton radial-fade poza loadRadius)
**Źródło:** rozmowa z użytkownikiem, po dodaniu reflective ocean (`src/world/createOcean.ts`)

## Problem

Reflective ocean (`three/addons/objects/Water.js`, `createOcean.ts`) to płaski `Mesh` bez własnej maski per-fragment — w przeciwieństwie do stylized wody jezior (`createWater.ts`, `vCover` liczone z `uHeightmap` + smoothstep), ocean polega wyłącznie na:

1. standardowym depth-teście względem nieprzezroczystego terenu (ukrywa ocean pod suchym lądem),
2. stylized wodzie jezior renderowanej nad nim (`waterLevel + 0.07` vs ocean `waterLevel + 0.02`), która przesłania ocean nad jeziorami.

Na granicy ocean/ląd (i prawdopodobnie ocean/jezioro) brak miękkiego przejścia daje widoczne ostre krawędzie/artefakty — zgłoszone przez użytkownika po wizualnej weryfikacji w przeglądarce (`docs/issues/README.md` — wcześniej odnotowany podobny problem z brzegiem koloru terenu, patrz [001](./2026-08-07--001--water-shore-color-banding.md), ale to inny mechanizm: tam chodziło o kolor terenu, tu o krawędź samej siatki/reflection oceanu).

## Implementacja (2026-08-13, plan 098 faza 2)

Water.js usunięty. Chunk water rysuje komórki oceanu z `vCover` (fade na plaży). Singleton oceanu jest radial-fade poza `loadRadius`, więc twardy clip vs teren zostaje tylko daleko od gracza (otwarte morze / pierścień unloada), nie na plaży w załadowanych chunkach.

### Browser

Zaakceptowane 2026-08-13 (użytkownik): brak twardego clippigu na plaży w załadowanym chunku; inland i ocean ten sam język shadera.

## Effort

Zrealizowane w fazie 2 planu 098.
