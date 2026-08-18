---
domain: fauna
---

# Plan: GLB pozostałości po oprawieniu

**Created:** 2026-08-17  
**Status:** `done` ✅  
**Priority:** medium · **Effort:** S/M  
**Depends on:** ~~137~~

## Cel

Po nożowym harvestcie na ziemi ma być czytelna kupa kości ze skórą i czerwonymi skrawkami mięsa, a nie proceduralne cylindry. Stan harvestu i TTL z planu 137 zostają bez zmian.

### Efekt gameplay

Po wycięciu mięsa widać stos kości + dużą kość + skórę + 2–4 czerwone skrawki; znikają po ~90 s.

## Modele

Źródło: `_temp/Models/Dead animals/` (tylko te trzy pliki). Kopiowane do `public/models/fx/`, potem `gltfpack -cc` in-place.

| Plik w grze | Licencja | Rola |
|---|---|---|
| `bones_pile.glb` | CC-BY 3.0 (Zsky) | główna kupa kości |
| `large_bone.glb` | CC0 (Quaternius) | 1–2 duże kości obok stosu |
| `animal_hide.glb` | CC-BY 3.0 (Zsky) | skóra płasko obok, nie na stosie |

Mięso: 2–4 proceduralne czerwone skrawki (`createItemMesh` gatunku), nie nowy GLB. Pickup `hide` (M36) nadal proceduralny.

## Wizualna kompozycja

`src/fauna/harvestedRemains.ts` wzorem `bloodSplat.ts`: cache `loadGltf` + `preparePropFitMax` per URL, `clone()` przy harvestcie.

Jedna `Group` `harvested-remains`:

1. `bones_pile` na środku (fit ~0.9 m, potem skala od `modelHeight`).
2. 1× `large_bone` (małe zwierzęta) albo 2× (deer/stag/boar/livestock) z lekkim offsetem/yaw.
3. `animal_hide` płasko obok stosu.
4. 2 skrawki mięsa zawsze; +1–2 gdy `modelHeight > 0.55` (max 4).

Gdy GLB nie wstanie: obecny fallback cylindrów + hide box (testy zostają na sync fallback).

## Attach

`harvestMeat()` zostaje synchroniczny dla stanu (`meatHarvested`, TTL 90 s, `hideLivingVisual`, `rotation.z = 0`). Attach meshu jak blood splat: `void spawnHarvestedRemains()` + token, żeby dispose w trakcie loada nie dodał stale clone. Nie zmieniać `canHarvestMeat` / scavenger / bury.

## Poza zakresem

- Pickup hide/mięsa z ziemi
- Per-species carcass GLB
- Zmiana lingeru planu 137
- Habitat destroy

## Kryteria akceptacji

1. Po harvestcie widać stos kości + dużą kość + skórę + czerwone skrawki.
2. Pozostałości znikają po ~90 s; zakopanie i scavenger bez zmian semantyki.
3. Brak GLB → proceduralny fallback.
4. `tsc`, lint, test, build.
5. CREDITS (Zsky CC-BY) + MODELS M39 `wired`.
6. Wymagana weryfikacja w przeglądarce.

## Weryfikacja

Techniczna:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Browser/play:

- zabić zwierzę, wyciąć mięso, potwierdzić GLB pile + kości + skórę + skrawki, zniknięcie po ~90 s.

## Implementation summary (2026-08-17)

- `public/models/fx/{bones_pile,large_bone,animal_hide}.glb` skopiowane z `_temp` i spakowane `gltfpack -cc`.
- `harvestedRemains.ts`: cached templates, `createHarvestedRemainsAsync` składa pile + 1–2 large bone + hide + 2–4 meat scraps; `createHarvestedRemains` zostaje sync fallbackiem.
- `AnimalAgent.harvestMeat()`: stan/TTL synchronicznie; `spawnHarvestedRemains()` + `harvestedRemainsToken` jak blood splat.
- Docs: CREDITS, MODELS M39 `wired`.

### Verification

- **Implemented** — all of the above.
- **Technically verified** — `npx tsc --noEmit` clean; `npm run test` 903/903; `npm run build` clean. Changed-file lint clean (`harvestedRemains.ts` / `AnimalAgent.ts`). Full `npm run lint` still has 1 pre-existing `prefer-const` in `settlement/props.ts`, unrelated.
- **Browser/manual verified** — accepted 2026-08-18 (playtest).
