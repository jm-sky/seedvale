# Plan: Ciało ogniska GLB + płomień FX

**Created:** 2026-08-16  
**Status:** `verification needed` 🔍 — zaimplementowane, weryfikacja techniczna zielona (tsc/lint-on-changed/build/test, 892 testy); brak testu w przeglądarce  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~101~~ ~~130~~ ~~085~~

domain: items-player

tags: [settlements-npcs]

## Cel

Ognisko w świecie, osadzie i `PlacedFires` ma wyglądać jak asset, nie jak kółko z cylindrami. Płomień ma dać się gasić/rozpalać (dlatego **nie** bierzemy `campfire_burning_*.glb` — płomień jest w geometrii, decyzja z planu 101).

## Decyzje

- **Jedno GLB, trzy warstwy** — nie trzy pliki. `simple` = tylko drewno (kamienie `visible = false`); `pit` / osada = kamienie + drewno; dekoracyjne remains = pełne ciało, **bez** `VillageFire` / płomienia.
- **Płomień GLB tylko w `createCampfireFlame` gdy podany template** — cone zostaje fallbackiem (`PlayerTorch` / pochodnie wioski bez zmian API).
- **Iskry / żar / burst** — semantyka planu 130 bez zmian; `igniteBurst()` nadal z `VillageFire.light('player')`.
- **Preload jak skały/kłody**, nie `await` w `place()`. Osada (już async) może `await preloadCampfireTemplates()`.
- **Nie instancować** ognisk w chunkach.
- **Skala:** `CAMPFIRE_FIT_MAX` ≈ 1.2 m. `CAMPFIRE_FLAME_FIT_MAX` ≈ 0.179. Offset Y ~0.04 m; zapłon skaluje tylko Y od podstawy (bez piku XZ).
- Gameplay (`kind`, koszty, fuel, despawn, `[E]`/`[R]`) **bez zmian**.
- `campfire_burning_*` zostają parked.

## Implementacja

1. `CAMPFIRE_UNLIT_URL` / `CAMPFIRE_FIT_MAX` w `propSpecs.ts`; wpis `settlement:campfire_unlit` w `assetIndex.ts`.
2. `createCampfireBody` — klon szablonu, `userData.campfireLayer`, hide stone dla `simple`; procedural fallback.
3. `createCampfireFlame(scale, flameMesh?)` — GLB zamiast cone gdy podany; sparks/embers/burst bez zmian.
4. Preload w `preloadPropTemplates`; `PlacedFires` / osada / chunk remains klonują.
5. Docs: MODELS M29, CREDITS, STATE, GRAPHICS.

## Świadomie poza zakresem

- Shader płomienia (plan 130 §5).
- Zmiana `PlayerTorch` / village torch.
- Kotwice `SV_flame`.
- Hide drewna po wypaleniu, ash-only, nowe SFX.

## Weryfikacja

Techniczna: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

Browser:

1. Quick Action palenisko — kamienny krąg + stos, zimne; `[E]` → burst + narastający `fire.glb` + iskry.
2. Prosta ognisko — bez kamieni, drewno + od razu płomień.
3. Osada MD+ — ciało+płomień na placu; autolight zmroku bez białego burstu.
4. World remains — GLB unlit, bez światła/płomienia.
5. Asset Browser: `settlement:campfire_unlit`, `fx:fire`.

## Implementation summary

- `propSpecs.ts`: `CAMPFIRE_UNLIT_URL`, `CAMPFIRE_FIT_MAX` (1.2), `CAMPFIRE_FLAME_FIT_MAX` (0.179), `CAMPFIRE_FLAME_Y` (0.04).
- `props.ts`: `preloadCampfireTemplates` / `createCampfireBody` (warstwy `stone`/`wood` po nazwie materiału), `createCampfireFlame(scale, flameMesh?)`, `createLitCampfireVisual`.
- `PlacedFires` i osada MD+ składają ciało+płomień z cache; chunk remains klonują unlit body (preload w `ChunkManager.preloadPropTemplates`).
- `PlayerTorch` bez zmian (cone + własny mały tip).
- Asset Browser: `settlement:campfire_unlit`.

