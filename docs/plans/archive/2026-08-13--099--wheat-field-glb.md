# Plan: Pole pszenicy GLB

**Created:** 2026-08-13  
**Status:** `done`  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~032~~

## Cel

Zastąpić proceduralne `createWheatField` parked modelem `farm.glb` (Quaternius `Farm_FirstAge_Level1_Wheat`) przy osadach z `foodSourceType === 'field'`. Fallback bez zmian.

## Implementacja

- [`src/settlement/props.ts`](../../src/settlement/props.ts): `loadPropOrFallback(FARM_URL, FARM_HEIGHT, createWheatField)`; yaw z `coreRandom`.
- [`src/settlement/propSpecs.ts`](../../src/settlement/propSpecs.ts): `FARM_URL`, `FARM_HEIGHT = 1.6` (wyżej niż ogród S = 1.2).
- Landmark `field` / plot `FOOD_PLOT_RADIUS = 6` bez zmian.
- Ogrody: zawsze `crops.glb` (grządki); M/L kładzie 2–3 łóżka. `garden.glb` (duplikat pszenicy) nie jest już stawiany jako ogród.

`farm.glb` i `garden.glb` są **identycznymi bajtami** (ten sam hash). Pole jest tylko wyższe, żeby czytać się jako większy płat; CREDITS to odnotowuje.

Audyt ręcznych propsów: brak drugiej czystej podmiany 1:1 w repo (well/campfire/signpost bez GLB; `market.glb` / windmill / … to budynki ekonomii, plan 071).

## Weryfikacja techniczna

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`

## Manual (browser)

1. Osada z `foodSourceType === 'field'` (znaczący `fertile_soil`) — pole to GLB, nie złote stożki.
2. Ogród to grządki `crops.glb` (nie małe pole pszenicy / `garden.glb`).
3. Fallback: gdyby `farm.glb` nie wstał, stożki `createWheatField`.
