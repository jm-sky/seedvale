# Plan: Natural Crop Lifecycle

**Created:** 2026-08-20  
**Status:** `verification needed` 🔍 — implemented 2026-08-20. Technical verification green (`tsc`/lint/build/test, 1314 tests); no browser/gameplay verification yet. See "Implementation summary" (§11) and the [implementation notes](./2026-08-20--172--natural-crop-lifecycle-implementation-notes.md) for scope adaptations made against the real codebase.  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~140~~  
**domain:** `world-terrain`  
**Tags:** [items-player]

## Cel

Zastąpić obecny model proceduralnego pojawiania się roślin jadalnych jako gotowych, statycznych obiektów deterministycznym lifecycle.

Dotyczy przede wszystkim naturalnie występujących roślin, takich jak marchew, ziemniak, kapusta i kolejne przyszłe rośliny jadalne.

Plan nie implementuje sadzenia przez gracza — jest to zakres istniejącego planu `126 Seed Planting — Trees & Crops`.

## 1. Crop lifecycle

Wprowadzić prosty lifecycle oparty o czas świata:

```text
young
  ↓
mature
  ↓
spoiled
```

- `young` — roślina rośnie i nie daje normalnego zbioru,
- `mature` — właściwe okno zbioru,
- `spoiled` — dojrzała roślina, której nie zebrano na czas.

Lifecycle powinien być deterministyczny i korzystać z istniejącego world time.

Nie aktualizować każdej rośliny co klatkę. Preferować lazy resolution, analogicznie do `TreeLifecycle`.

## 2. Data-driven crop definitions

Nie tworzyć osobnej logiki dla każdego gatunku.

Wprowadzić definicję cropa zawierającą co najmniej:

- `id`,
- gatunek/typ,
- czas przejścia `young → mature`,
- czas przejścia `mature → spoiled`,
- item zbierany w `mature`,
- opcjonalny produkt `spoiled`,
- informacje potrzebne do wizualizacji.

Przykładowo:

```text
potato
  young
  mature → potato
  spoiled → spoiled potato / organic matter
```

Marchew, kapusta i kolejne cropy korzystają z tego samego mechanizmu.

## 3. Natural spawn

Zmienić proceduralny spawn naturalnych cropów tak, aby nie tworzył automatycznie gotowego, dojrzałego plonu.

Naturalnie wygenerowana roślina otrzymuje:

```text
crop type
+ initial stage
+ stageStartedAt
```

Początkowe stadium może być deterministycznie wybrane podczas proceduralnego generowania.

Nie wprowadzać osobnego runtime managera dla naturalnych cropów.

## 4. Visual lifecycle

Wizualizacja musi odpowiadać aktualnemu stadium:

```text
young   → mała/młoda roślina
mature  → pełna roślina
spoiled → wizualnie przejrzała/obumarła
```

Wykorzystać istniejący mechanizm instancingu/batchingu roślin tam, gdzie jest to możliwe.

Nie wymagać osobnego ciężkiego GLB dla każdego stadium, jeżeli skalowanie, wariant modelu lub prostsza reprezentacja daje wystarczający efekt.

## 5. Harvest

Istniejący gather/harvest flow powinien respektować lifecycle:

- `young` → brak normalnego zbioru,
- `mature` → normalny zbiór,
- `spoiled` → brak normalnego plonu lub specjalny produkt zgodny z definicją cropa.

Po zbiorze naturalna roślina powinna zostać usunięta albo przejść do odpowiedniego istniejącego mechanizmu odnowienia/spawnu.

Nie tworzyć nowego systemu interakcji.

## 6. Shared lifecycle infrastructure

Wykorzystać wzorce istniejącego `TreeLifecycle`:

- jawne stage,
- `stageStartedAt`,
- world time,
- lazy resolution,
- proceduralny stan bazowy + sparse overrides tam, gdzie potrzebny jest trwały stan.

Nie tworzyć `PlantManager`, `CropManager` ani per-frame `CropSystem`.

Jeżeli wspólna infrastruktura lifecycle z drzew może zostać bezpiecznie wyodrębniona, zrobić to minimalnie. Nie przeprojektowywać `TreeLifecycle` bez potrzeby.

## 7. Persistence / chunks

Naturalne cropy powinny zachowywać ciągłość lifecycle przy:

- chunk unload/load,
- rebuild świata,
- save/load, jeżeli dany crop jest trwałym stanem świata.

Nie zapisywać zbędnych proceduralnych właściwości.

Preferować minimalny stan:

```text
id
+ crop type
+ position
+ stageStartedAt / minimal override
```

## 8. Relationship with plan 126

Plan `126 Seed Planting — Trees & Crops` pozostaje odpowiedzialny za:

- nasiona,
- sadzenie drzew,
- sadzenie cropów,
- placement,
- inventory,
- interakcję gracza.

Ten plan dostarcza lifecycle naturalnych cropów, z którego `126` powinien korzystać również dla nowo posadzonych roślin zamiast tworzyć drugi mechanizm wzrostu.

Nie dublować implementacji w `126`.

## 9. Performance

- brak per-frame tickowania cropów,
- lazy lifecycle resolution,
- wykorzystanie istniejącego chunk lifecycle,
- zachowanie instancingu dla dużych grup roślin,
- brak nowych Workerów tylko dla lifecycle.

## 10. Verification

### Technical

- `pnpm lint:fix`
- `pnpm typecheck`
- testy,
- build.

### Browser

Sprawdzić:

- naturalna młoda roślina rośnie do `mature`,
- `mature` można zebrać,
- niezbierana roślina przechodzi do `spoiled`,
- `young` nie daje dojrzałego plonu,
- różne cropy używają wspólnego mechanizmu,
- lifecycle zachowuje się poprawnie po chunk unload/load,
- naturalny spawn nie tworzy wyłącznie gotowych, dojrzałych roślin,
- brak widocznego wzrostu kosztu CPU wraz z liczbą cropów.

## Out of scope

Nie implementować:

- sadzenia przez gracza — plan `126`,
- NPC farmerów,
- podlewania,
- nawożenia,
- chorób,
- chwastów,
- genetyki,
- farm plots,
- zaawansowanej ekonomii nasion,
- pełnego systemu regeneracji naturalnej roślinności.

## 11. Implementation summary (2026-08-20)

Implemented end-to-end against the real codebase, following the implementation notes' §1 scope clarification (see that file for the full audit). Key points:

- **Scope resolution**: the plan's examples (carrot/potato/cabbage) were, per the notes, already garden-anchored renewable pickups (`items/createItemSpawners.ts`, plan 159) — not natural terrain spawns. This plan adds a **second, independent** wild-terrain source for the same items (`terrain/chunkCrops.ts`), leaving the garden renewable-pickup mechanism untouched, per notes §1/§10.
- **Lifecycle module**: `src/world/cropLifecycle.ts` — `CropGrowthStage` (`young`/`mature`/`spoiled`), a dedicated `CropId` union (`carrot`/`potato`/`cabbage`), data-only `CropDefinition`/`CROP_DEFS`, and a pure `resolveCropStage(def, stageStartedAt, worldDays)`. Deliberately not modeled on `TreeLifecycle`'s class-shaped API (no manager, no registry) — crops don't need canopy competition or chop stages, so the whole module is pure functions + data, per notes §2/§10/§18.
- **Deviation — periodic (not one-shot) natural lifecycle**: `resolveCropStage` treats the young→mature→spoiled sequence as a *repeating* cycle (`cropCycleLengthDays`), a pure function of `(seed, worldDays)` like `world/weather.ts`'s cycling, rather than a one-shot terminal anchored at world day 0. A literal day-0 anchor would mean every wild crop in a chunk generated late into a long-running world is permanently `spoiled` (`elapsed ≫ cycleLength`), contradicting "world that lives independently of the player" (`CLAUDE.md`) and notes §5's explicit warning against exactly this. Harvesting still permanently removes a crop (sparse `removedCropIds`, never resurrected by the cycle) — only *unharvested* wild crops cycle.
- **Natural placement**: `src/terrain/chunkCrops.ts`'s `computeChunkCrops()` mirrors `chunkItems.ts`'s flora-pool pattern (own RNG salt, own `crop<i>` id namespace, worker-safe/deterministic), favoring open/temperate ground (not desert, swamp, deep forest, ridge or high altitude). Wired into the existing worker pipeline (`chunkHeightmap.worker.ts` → `ChunkTileResult.crops` → `chunkWorkerPool.ts`), not a parallel generation path.
- **Rendering**: `src/world/cropVisuals.ts`'s `createCropStageMesh()` reuses each crop's existing pickup mesh (`items.ts`'s `createItemMesh`) scaled/tinted per stage — no new GLBs. Individually meshed (`chunkManager.ts`'s new `chunk-crops` group), not instanced: natural crop density per chunk (`CROP_CANDIDATES_PER_CHUNK = 2`) is the same order of magnitude as the existing individually-meshed flora pickups, so this follows that established precedent rather than the plan's general "use instancing where possible" guidance.
- **Lazy resolution**: stage is resolved when a chunk attaches content (load/reload) and fresh on every `getNearbyCrops`/`harvestCrop` call (from the placement's `stageStartedAt`, not a cached mesh attribute) — no per-frame ticking, no periodic "next transition" scheduler. Matches `TreeLifecycle`'s existing precedent: natural growth doesn't visually refresh a loaded chunk either, only presence-data queries (`getNearbyTrees`) are always fresh.
- **Harvest**: new `Interactable{kind:'crop'}` + `ChunkManager.getNearbyCrops`/`harvestCrop` (mirrors `getNearbyItems`/`collectItem`). `createApp.ts`'s `harvestCropAction` checks inventory capacity *before* calling `harvestCrop` (mirrors the existing `item` branch's mutation order in `gameLoop.ts`) so a full inventory never destroys a crop for nothing. `young` and a `spoiled` crop with no `spoiledItem` yield nothing and are left in place. No `spoiledItem` defined for v1 (carrot/potato/cabbage) per notes §12.
- **Persistence**: `SaveData` v21 (`persistence/saveData.ts`) adds `harvestedCropIds: string[]` — a sparse removal set, same contract as `collectedItemIds`, not a per-crop `stageStartedAt`/override (notes §6/§7/§24: unharvested natural crops need no save entry at all, since their state is fully time-derived).
- **Plan 126 contract**: `resolveCropStage`/`CropDefinition`/`resolveCropHarvest` are already the small, reusable, presence-agnostic API a later planted-crop source can call with its own placement/anchor — no planting/seeds/inventory-consumption work was pulled into this plan.
- **Verification**: `npx tsc --noEmit`, `pnpm lint:fix`, `pnpm run build`, `pnpm run test` (1314 tests, incl. new `world/cropLifecycle.test.ts` coverage for stage boundaries, cycling, and harvest yield rules) are all green. No browser/gameplay verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
