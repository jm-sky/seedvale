# Plan: Post-processing pipeline (+ N8AO)

**Status:** `planned`
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
- Implementacja — to na razie plan/kolejka, nie zaczynamy teraz

## Powiązane

- `src/app/createApp.ts` — miejsce wpięcia composera
- `src/ui/createDebugGui.ts`, `src/config/worldConfig.ts` — miejsce na GUI/config AO
- [plans/2026-08-07--terrain-worker-pool.md](./2026-08-07--terrain-worker-pool.md) — obecny priorytet, ten plan czeka w kolejce
