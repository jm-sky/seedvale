# Plan: World location discovery hitch and progress

**Created:** 2026-09-10
**Status:** `verification needed` 🔍
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** ~~world-013~~ ~~world-014~~ ~~world-terrain-016~~
**Domain:** `world`
**Subdomains:** `places`
**Tags:** `locations` `performance` `cemetery` `discovery`
**Roadmap:** -

## Problem

`world-013` uczynił cheap lake/peak scan współdzielonym i range-aware. `world-014` usunął pełne `computeChunkTile()` z settlement-cemetery lookup. `world-terrain-016` dodał rzadkie abandoned graveyards i bounded chunk probe w `WorldLocationCatalog.cemeteryCandidates()`.

Pozostały cold hitch przy odkrywaniu lokacji (Near Map, Far Map, „Opowiedz mi coś o okolicy”) pochodzi z abandoned-cemetery scan:

```text
cemeteryCandidates()
→ bounding square do maxKm
→ probeAbandonedCemeteryAtChunk() dla każdego chunka
    → paramsFor()
    → createLocalTerrainSampler()
    → resolveAbandonedCemeteryForChunk()
        → abandonedRoll()   // dopiero tutaj ~98.8% reject
```

Far Map `60–200 km` płaci więc `paramsFor` + terrain sampler dla wewnętrznych chunków `0–60 km` i dla narożników bounding square poza `maxKm`. Deterministic roll (`ABANDONED_CEMETERY_CHANCE = 0.012`) odrzuca prawie wszystkie chunki, ale dopiero po drogim setupie.

Merchant i NPC nadal muszą korzystać z tego samego `WorldLocationCatalog` / `LocationKnowledge`.

## Goal

Usunąć main-thread hitch przy cold location discovery bez zmiany gameplay semantics i bez równoległego generatora lokacji.

Kolejność:

```text
algorithmic pruning
→ shared deterministic helper
→ existing LocationScanDiagnostics
→ cooperative batching + BusyOverlay tylko jeśli pozostała praca nadal może być długa
```

## 1. Cheap abandoned-cemetery precheck

Udostępnić minimalny deterministic predicate używający dokładnie tego samego:

```text
abandonedRoll
ABANDONED_CEMETERY_CHANCE
```

co streamed chunk generation. Nie duplikować RNG ani formuły hasha.

`resolveAbandonedCemeteryForChunk()` ma korzystać z tego helpera.

Na ścieżce catalog/probe:

```text
cheap deterministic reject
→ dopiero jeśli przeszedł:
   paramsFor()
   createLocalTerrainSampler()
   pełna physical validation
```

Dla ~98.8% chunków nie powstaje terrain sampler.

## 2. Range-aware abandoned chunk iteration

`cemeteryCandidates()` nie może iterować bounding square do `maxKm` i sprawdzać `(minKm, maxKm]` dopiero po probe.

Odrzucić chunk przed expensive probe, jeśli jego możliwy obszar cemetery (chunk size + maksymalny offset placementu wewnątrz chunka) nie przecina annulus `(minKm, maxKm]`.

Far Map nie wykonuje expensive probes dla wewnętrznych chunków `0–60 km`. Narożniki square poza `maxKm` też odpadają.

Zachować boundary cases: cemetery tuż powyżej `minKm` i tuż przy `maxKm` nie może zginąć.

## 3. Determinism / one source of truth

Dla tego samego `seed` / chunk / config:

```text
WorldLocationCatalog lookup
i
normal streamed chunk generation
```

muszą zgadzać się co do presence/absence, id, position oraz cemetery size/variant tam gdzie dotyczy.

Nie tworzyć drugiego generatora abandoned cemeteries. Nie zmieniać `ABANDONED_CEMETERY_CHANCE`, placement rules, gameplay ranges, reveal counts ani discovery semantics.

## 4. Diagnostics

Rozszerzyć istniejące `LocationScanDiagnostics` o liczniki cemetery scan:

- candidate chunks considered
- rejected by distance/range
- rejected by cheap abandoned roll
- expensive abandoned probes
- resolved abandoned cemeteries
- istniejący `cemeteryMs`

Bez console spam. Diagnostyka nie może sama tworzyć zauważalnego kosztu.

## 5. Cooperative batching and progress UI

Po cheap-gate + range pruning ocenić pozostałą pracę.

Reuse istniejącego:

```text
showBusy(label, blurred, progress)
hideBusy()
BusyOverlay.vue
```

Nie tworzyć drugiego overlay. Nie używać `BusyAction` (timer-based `durationSec`).

Nie robić `showBusy()` → jedna ogromna synchroniczna pętla → `hideBusy()`.

Jeżeli pozostała cold operacja (głównie Far Map) nadal może być zauważalnie długa:

```text
process batch
→ report actual progress
→ yield do event/render loop
→ next batch
```

Progress: monotoniczny, oparty o rzeczywistą pracę, kończy się na `1`, bez sztucznego delay. Overlay można opóźnić krótkim progiem, żeby szybkie Near/NPC nie flickerowały.

Nie przenosić `WorldLocationCatalog` do Workera bez nowych dowodów profilingowych.

## 6. Async integration

Najmniejsza spójna zmiana istniejącego location-query mechanism. Merchant i NPC nadal używają tego samego catalog/discovery pipeline.

Reveal / toast dopiero po zakończeniu discovery. Yield nie może powodować częściowego ani podwójnego reveal.

Transaction (wymiana itemów u handlarza) może nastąpić przed discovery; reveal i toast czekają na pełny wynik query.

## Non-goals

- drugi cemetery generator
- drugi location cache
- merchant-only / NPC-only discovery
- nowy overlay system
- Worker
- zmiana Near/Far/Guard ranges, pool sizes, `ABANDONED_CEMETERY_CHANCE`
- przebudowa architecture World Locations

## Tests

Kontraktowe, nie wall-clock:

1. cheap precheck ≡ gate normalnego resolvera
2. chunk odrzucony przez cheap gate nie woła `createLocalTerrainSampler` / expensive physical resolution
3. chunk który przejdzie gate idzie do canonical placement resolvera
4. streamed generation i catalog lookup: parity absence/presence/id/position
5. range-aware iteration: nie pomija cemetery przy `minKm`/`maxKm`; odrzuca inner-band Far i corner square
6. Near / Guard / Far zachowują wyniki i determinism
7. kolejność query nie zmienia wyników
8. async path: identyczny wynik vs sync; progress monotoniczny i kończy się na `1`; yield nie powoduje częściowego/podwójnego reveal

## Verification

Automated: `pnpm test`, `pnpm type-check`, `pnpm lint`, `pnpm build`.

Manual — użytkownik, cold/new world:

```text
Near Map → Guard/NPC area dialogue → Far Map
```

plus Performance trace. Agent nie wykonuje browser verification.

## Success criteria

- cheap roll reject przed `paramsFor` / terrain sampler
- Far Map nie probe'uje inner `0–60 km` ani cornerów poza outer radius
- brak drugiego generatora; parity ze streamed generation
- diagnostyka cemetery scan w istniejącym seam
- Near/NPC bez flicker overlay, jeśli są praktycznie natychmiastowe
- Far Map bez wielosekundowego freeze; progress tylko gdy praca nadal długa

## Implementation status

Implemented 2026-09-10 on current `main`. No Worker, no second cemetery generator, no new overlay.

- `src/terrain/cemeteryPlacement.ts`: shared `chunkPassesAbandonedCemeteryRoll` / `abandonedCemeteryMaxOffsetFromCenter`; `resolveAbandonedCemeteryForChunk` uses the helper; catalog/probe entry `resolveAbandonedCemeteryAfterRoll` materializes `paramsFor` + `createLocalTerrainSampler` only after the roll passes.
- `src/terrain/chunkManager.ts`: `probeAbandonedCemeteryAtChunk` and abandoned `resolveCemeteryById` go through `resolveAbandonedCemeteryAfterRoll`.
- `src/world/locations/worldLocationCatalog.ts`: abandoned scan range-prunes AABB vs `(minKm, maxKm]` then cheap-rolls; `LocationScanDiagnostics` cemetery counters; `landmarksInRangeAsync` batches expensive probes when count > `COOPERATIVE_ABANDONED_PROBE_THRESHOLD` (24).
- Merchant/NPC reuse the same catalog via `landmarksInBandAsync` / `landmarksInRangeAsync`. `showBusy` progress overlay is delayed 80ms so Near/Guard typically never show it. Reveal/toast run only after the query resolves.

### Expensive abandoned probes (seed 42, origin 0,0, chunkSize 64, fake probe)

| Query | Before (bounding square) | After expensive probes |
| --- | --- | --- |
| Near 0–20 km | 196 | 2 |
| Guard 0–60 km | 1444 | 19 |
| Far 60–200 km | 15876 | 124 |

Cooperative async/progress **is used for Far** (124 > 24). Near (2) and Guard (19) finish in one sync stretch; overlay delay should prevent flicker.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

