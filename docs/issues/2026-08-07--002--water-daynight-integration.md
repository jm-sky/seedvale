# Woda nie reaguje na dzień/noc

**Status:** `verification needed`
**Created:** 2026-08-07
**Updated:** 2026-08-07
**Źródło:** [reviews/2026-08-07-water-quality.md](../reviews/2026-08-07-water-quality.md) (Finding 4)

## Problem

`applyDayNight()` w `src/app/createApp.ts` napędza `sky`, `fog`, `lights.sun/ambient/hemi` co klatkę z `skyParamsFromTime()`. `src/world/createWater.ts` ma własne, statyczne uniformy (`uDeep`, `uShallow`, `uFoam`, `uOpacity`) — woda nie ciemnieje ani nie zmienia barwy w nocy, mimo że reszta sceny wyraźnie reaguje.

## Fix (kierunek)

Dodać do `createWater` metodę analogiczną do aktualizacji `fog` w `applyDayNight()` — np. `setDayNight(p: ReturnType<typeof skyParamsFromTime>)` zasilającą nowy uniform (`uDayFactor` / `uNightTint`) używany do przyciemniania `uDeep`/`uShallow`/`uOpacity`. Wołać z tego samego miejsca co update `fog`/`lights` w `createApp.ts`.

## Effort

Quick win, ~pół dnia. Część „Ścieżki 1" w powiązanym review.

## Implementacja (2026-08-07)

- `dayNight.ts`: `skyParamsFromTime()` teraz zwraca też `dayFactor` (0 noc … 1 dzień) — ten sam współczynnik, który już napędzał `sunIntensity`.
- `createWater.ts`: nowa metoda `setDayNight(dayFactor)` — lerpuje `uDeep`/`uShallow`/`uFoam` między stałą paletą dzienną (bez zmian, poprzednie kolory) a nową paletą nocną (`0x060f18` / `0x14283a` / `0x4a6a78`) tymi samymi uniformami co dotąd (bez zmian w shaderze).
- `createApp.ts`: `applyDayNight()` przyjmuje teraz `water: WorldWater` i woła `water.setDayNight(p.dayFactor)` w tym samym miejscu co update `fog`/`lights`; zaktualizowane wszystkie 3 call site'y (init, `onDayNightChange`, `tick`).
- `tsc --noEmit` i `npm run lint` czyste.
- **Nie testowane wizualnie w przeglądarce** — stąd status `verification needed`, nie `done`.
