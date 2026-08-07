# Plan: Post-processing pipeline (+ N8AO)

**Status:** `done`
**Created:** 2026-08-07
**Priority:** normalny — user chce zrobić niedługo, nie pilne teraz (priorytet: [terrain-worker-pool](./2026-08-07--terrain-worker-pool.md))

## Potrzeba

Dziś render jest czysto forward — brak `EffectComposer`/`RenderPass` gdziekolwiek w `src/` (sprawdzone grepem). Chcemy dodać pipeline post-processingu, docelowo z ambient occlusion, żeby poprawić czytelność kształtów terenu i niskopoly propsów osady/natury (zacienienia w zakamarkach, styk obiektów z ziemią).

## Referencja

[N8AO](https://github.com/N8python/n8ao) (N8python, three.js) — GTAO-based ambient occlusion, szybszy i wyraźnie lepszej jakości niż stockowy `SSAOPass` z `three/examples`. Integruje się jako pass w `EffectComposer` (`N8AOPass`).

## Kierunek (szkic)

| Element | Szkic |
|---------|-------|
| Baza | Wprowadzić `EffectComposer` + `RenderPass` w `createApp.ts` jako zamiennik bezpośredniego `renderer.render(scene, camera)` (obecnie `src/app/createApp.ts:185`) |
| AO | Dodać `n8ao` (npm) jako dependency, wpiąć `N8AOPass` po `RenderPass` |
| Konfiguracja | Parametry AO (radius, intensity, quality) pod `lil-gui` — spójnie z resztą configu w `src/ui/createDebugGui.ts` + `src/config/worldConfig.ts`/`persistConfig.ts` |
| Wydajność | Sprawdzić koszt na wyższych resolution presetach terenu (Insane 769×769) — AO liczy się per-pixel niezależnie od geometrii, ale i tak zweryfikować FPS |
| Label renderer | Upewnić się, że `labelRenderer.render(scene, camera)` (CSS2D, `createApp.ts:186`) nadal renderuje się poprawnie nad post-processowaną sceną (osobny DOM overlay, nie powinien kolidować) |

## Świadomie poza teraz

- Inne efekty post-processingu (bloom, tone mapping passes, DOF) — dodać dopiero jeśli będzie konkretna potrzeba wizualna

## Zaimplementowane (2026-08-07)

- `n8ao` + `postprocessing` jako npm deps — `N8AOPass` (three's own `EffectComposer`, nie pmndrs' `postprocessing` composer) wymaga jednak realnej zależności `postprocessing` w `node_modules`, bo bundlowany `dist/N8AO.js` importuje ją statycznie u siebie (nawet gdy używamy tylko `N8AOPass`, nie `N8AOPostPass`)
- `src/render/createPostProcessing.ts` — `EffectComposer` + `N8AOPass` (zamiennik `RenderPass`) + `SMAAPass` (AA — hardware AA na canvasie nie działa przez offscreen render targets composera) + `OutputPass` na końcu (jedno miejsce, które piecze `renderer.toneMapping`/`outputColorSpace`; `aoPass.configuration.gammaCorrection = false` żeby nie korygować dwa razy)
- `WorldConfig.postProcessing` (`aoEnabled`, `aoRadius`, `aoIntensity`, `aoQuality: AoQuality`) — dedykowany union type `AoQuality`, persystowany w `persistConfig.ts` (localStorage), nieobjęty save/load gry (to preferencja renderowania, nie stan świata)
- `createApp.ts` — `postProcessing.render()` zamiast `renderer.render(scene, camera)`; resize i dispose podłączone
- `createDebugGui.ts` — folder „Post-processing”: AO on/off, quality (Performance…Ultra), radius, intensity — `onChange` aplikuje live, bez rebuildu terenu
- Typy dla `n8ao` (brak własnych `.d.ts`): ambient shim `src/types/n8ao.d.ts`
- Zweryfikowane: `tsc --noEmit`, `eslint` (na zmienionych plikach), `vite build` — wszystkie czyste; user potwierdził działanie w przeglądarce

## Powiązane

- `src/app/createApp.ts` — wpięcie composera
- `src/render/createPostProcessing.ts` — pipeline
- `src/ui/createDebugGui.ts`, `src/config/worldConfig.ts`, `src/config/persistConfig.ts` — GUI/config AO
- [plans/2026-08-07--terrain-worker-pool.md](./2026-08-07--terrain-worker-pool.md)
