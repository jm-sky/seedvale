# Plan: Flora GLB, studnia, stos drewna i parked ogniska

**Created:** 2026-08-13  
**Status:** `verification needed`  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~024~~ ~~079~~ ~~082~~

## Cel

Wpiąć kaktusy, cattail (jako `reed_a`), studnię i stos drewna. Zaparkować mushroom/fern/rock path oraz trzy warianty ogniska (składanie firepit+płomień później).

## Decyzje (2026-08-13)

- **Ognisko:** wszystkie 3 warianty parked. Kandydat na ciało: `campfire_unlit.glb` (kamienie+drewno) + istniejący `createCampfireFlame`. Palące się meshe nie nadają się do `VillageFire` (płomień w geometrii).
- **Studnia i stos:** wired teraz.

## Zrobione

- GLB → `public/models/` + `gltfpack -cc`. Parked flora z teksturami 1024 PNG: resize 512 + WebP (jak `tree_c`).
- Drop-in: `cactus_a` / `cactus_b` / `reed_a` w istniejących `CACTUS_SPECS` / `REED_SPECS`.
- [`propSpecs.ts`](../../src/settlement/propSpecs.ts): `WELL_URL`/`WELL_HEIGHT` (2.0), `WOOD_PILE_URL`/`WOOD_PILE_HEIGHT` (0.9).
- [`props.ts`](../../src/settlement/props.ts): `loadPropOrFallback` studni i składu (×2 w większych wsiach). `logs.glb` parked.
- Asset browser: `settlement:well`, `settlement:wood_pile`. Kotwica kolejki bez zmiany (`[0, 0.72, 0.85]` — południowy róg GLB po `prepareProp` ≈ 0.80 m).

## Świadomie poza zakresem

- Spawn grzybów/paproci, mesh ścieżek
- Składanie ogniska; `PlacedFires` / world `createCampfire()` zostają proceduralne
- `Crops` (już plan 099/100)

## Weryfikacja techniczna

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`

## Manual (browser)

1. Pustynia — kaktusy GLB; bagno — cattail.
2. Home village — studnia GLB; kolejka / `[E]` picia bez stania w meshu.
3. Skład — stos belek (`wood_pile`); drugi skład w większej wsi.
4. Ognisko wioski bez zmian (proceduralne ciało + płomień).
5. Asset browser: cactus/reed/well.
