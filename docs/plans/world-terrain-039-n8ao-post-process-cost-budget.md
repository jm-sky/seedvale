# Plan: N8AO / post-process cost budget

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** -
**Domain:** `world-terrain`
**Subdomains:** `rendering`
**Tags:** `post-processing` `ao` `n8ao` `performance`
**Model:** Sonnet, Composer

## Cel

Obniżyć koszt N8AO/post-process na profilu High bez łamania obowiązującego kontraktu G7 i bez adaptive on/off zależnego od frame time.

## Evidence / punkt startowy

Benchmarki 2026-09-17:

- `settlement-heavy`: `full` ~46.5 ms, `no-ao` ~27.1 ms,
- `stream`: `full` ~10.8 ms, `no-ao` ~7.3 ms.

Isolation delta sugeruje wysoki potencjał, ale nie dowodzi, że cały delta pochodzi wyłącznie z samego AO GPU work. Potrzebny jest bounded recon aktualnej konfiguracji N8AO i kontrolowany compare.

Aktualny kontrakt grafiki:

- `src/render/createPostProcessing.ts` buduje EffectComposer + N8AO + SMAA + bloom/god rays/output/film grade,
- G7 w `docs/architecture/GRAPHICS.md`: N8AO on/off tylko preset/GUI; nie wolno wprowadzać oscylującego frame-time based disable.

## Zakres

### 1. Recon aktualnej konfiguracji

Sprawdzić dokładne parametry `N8AOPass`, resolution scale, quality mode, sample/radius/denoise ustawienia oraz sposób resize/pixel ratio.

Zmierzyć małą macierz wariantów na stałym `settlement-heavy`:

- current High,
- AO off jako kontrola,
- 1–2 tańsze konfiguracje, które zachowują AO,
- opcjonalnie aktualny Medium, jeśli różni się AO config.

Nie budować nowego profilera, jeśli istniejące isolation probes wystarczą.

### Gate A

Wybrać konfigurację tylko wtedy, gdy daje mierzalny render win i wizualnie zachowuje czytelne contact shadows/depth. Jeśli AO nie jest potwierdzonym kosztem po kontrolowanym compare, zakończyć plan bez zmiany.

### 2. Quality budget

Preferować w kolejności:

1. niższy internal resolution / istniejący resolution control,
2. tańsze istniejące N8AO quality/sample/denoise settings,
3. profile-specific parametry High/Medium/Low,
4. depth reuse tylko jeśli obecny stack i biblioteka pozwalają zrobić to małą zmianą bez własnego równoległego depth pipeline.

High ma nadal wyglądać jak High. Nie zamieniać go w faktyczne AO-off.

### 3. Integracja presetów

Jeśli tuning staje się częścią quality profile, rozszerzyć istniejące `qualityProfiles.ts` / live knobs. Nie tworzyć drugiego systemu presetów tylko dla AO.

## Architektoniczne decyzje

- Brak dynamicznego per-frame włączania/wyłączania N8AO.
- Brak temporalnego quality oscillation.
- Nie zmieniać kolejności całego composera bez pomiaru uzasadniającego taką zmianę.
- Nie dokładać kolejnego AO passa.
- Każda zmiana musi przejść wizualną weryfikację w browserze.
- Dla nowych publicznych helperów dodać JSDoc i `@domain world-terrain` jeśli pomaga preflightowi.

## Non-goals

- nowy post-processing framework,
- WebGPU,
- TAA/temporal reconstruction,
- dynamic resolution całej gry,
- zmiany bloom/SMAA/god rays niezwiązane bezpośrednio z AO budget.

## Verification

AI agent:

- testy config/preset logic jeśli powstaje,
- type-check/lint/test/build,
- bez browser verification.

Użytkownik:

- `?benchmark=settlement-heavy`,
- `?benchmark=stream`,
- porównać `RENDER`, FPS, p95,
- wizualnie porównać AO przy domach, płotach, trawie, NPC i kontakcie obiektów z ziemią.

## Success gate

Preferować zmianę dającą co najmniej wyraźny, powtarzalny spadek `RENDER` przy małej lub niewidocznej utracie jakości. Jeśli tańszy wariant daje tylko kosmetyczny win, nie komplikować konfiguracji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
