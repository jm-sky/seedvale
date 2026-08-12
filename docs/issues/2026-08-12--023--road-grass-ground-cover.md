# Droga i trawa — ziarno, miękki brzeg, filler blisko kamery

**Status:** `done`
**Created:** 2026-08-12
**Updated:** 2026-08-12
**Źródło:** screen użytkownika — trakt jak farba, łąka jak golf między kępkami; GRAPHICS rozmowa (#1/#2/#3)
**Potwierdzenie:** browser OK 2026-08-12.

## Problem

1. Droga = vertex `roadTint` → `DIRT` bez ziarna; twarda krawędź vs trawa.
2. Grunt łąki między instanced kępkami zbyt jednolity.
3. Podnoszenie globalnej gęstości trawy zabija FPS (~34 na screenie).

## Naprawa

| # | Zmiana | Pliki |
|---|--------|-------|
| 1 | Szerszy soft edge korytarza (`CORRIDOR_INNER_FRACTION` 0.6→0.32), soft onset `applyRoadTint`, micro-contrast dirt + fragment bare-ground grain; trawa soft-fade zamiast hard reject | `chunkHeightmap.ts`, `biomeColors.ts`, `buildChunkGeometry.ts`, `grass.ts` |
| 2 | Bogatsza wariacja zieleni łąki w macro color shaderze | `buildChunkGeometry.ts` |
| 3 | Osobny bucket krótkich filler blades (~28% kandydatów), LOD tylko w chunku gracza + pierścień (`dist ≤ 1`) | `grass.ts`, `chunkManager.ts` |

## Weryfikacja w przeglądarce

1. Trakt: widać ziarno/plamki dirtu; krawędź miększa, nie bald cut.
2. Łąka: grunt między kępkami mniej „golfowy”.
3. Blisko gracza gęstszy ground cover; 2+ chunki dalej fillers znikają; FPS nie powinien spaść znacząco vs przed zmianą.

## SoT

[GRAPHICS.md](../GRAPHICS.md) — standing G9 + log 2026-08-12.
