# Plan: Seed Planting — Trees & Crops

**Created:** 2026-08-16
**Status:** `verification needed` 🔍 — implemented 2026-08-21. Technical verification green (`tsc`/lint/build/test, 1514 tests); no browser/gameplay verification yet. See "Implementation summary" (§7) and the [implementation notes](./2026-08-16--126--seed-planting-implementation-notes.md)/[updated review](./reviews/2026-08-16--126--seed-planting--updated-review.md) for the scope adaptations made against the real codebase.
**Priority:** 🟡 medium · **Effort:** L
**Depends on:** ~~106~~ ~~122~~
**domain:** `world-terrain`
**Tags:** [items-player]

## Cel

Dodać możliwość sadzenia nasion przez gracza:

- drzew,
- warzyw.

Sadzenie ma tworzyć rzeczywisty stan świata i korzystać z istniejących lifecycle'ów oraz systemów czasu, środowiska, inventory i zbierania.

Nie tworzyć osobnego, równoległego systemu wzrostu dla drzew.

## 1. Trees

### 1.1 Sadzenie

Gracz używa nasiona drzewa na odpowiednim terenie.

```text
tree seed
    ↓
planted tree
    ↓
sapling
    ↓
young
    ↓
mature
    ↓
old
```

Wykorzystać istniejący `TreeLifecycle`.

Nie tworzyć drugiego mechanizmu `PlantGrowth`.

### 1.2 Seed item

Dodać odpowiednie itemy nasion drzew do istniejącego katalogu itemów. Seed jest zwykłym itemem inventory.

Nie dodawać od razu rozbudowanego systemu drop-rate / seed economy.

### 1.3 Placement

Sprawdzić:

- pozycję,
- wysokość/teren,
- wodę,
- ewentualne kolizje,
- podstawowe warunki biome/environment.

Preferować istniejące funkcje próbkowania terenu.

### 1.4 Tree identity

Posadzone drzewo musi otrzymać stabilne ID i być zarejestrowane w istniejącym lifecycle. Nie tworzyć osobnej listy `playerTrees`, jeżeli istniejący mechanizm może zostać rozszerzony.

### 1.5 Persistence

Zapisać tylko stan potrzebny do odtworzenia posadzonego drzewa. Preferować istniejący model sparse overrides zamiast zapisywania proceduralnych właściwości drzewa.

## 2. Crops

### 2.1 Crop lifecycle

Dodać prosty, deterministyczny lifecycle:

```text
seed
 ↓
sprout
 ↓
growing
 ↓
mature
 ↓
harvested
```

Wzrost korzysta z istniejącego czasu świata. Preferować lazy resolution analogiczny do `TreeLifecycle`.

### 2.2 Crop definition

Wprowadzić data-only definicję cropów:

- `id`,
- seed item,
- harvested item,
- growth durations,
- wymagania środowiskowe,
- opcjonalny yield.

Nie tworzyć osobnego systemu dla każdego warzywa.

Pierwsze cropy powinny wykorzystywać istniejące itemy, np. tomato, jeśli jest to zgodne z katalogiem.

### 2.3 Planting

Gracz:

1. posiada seed,
2. wybiera odpowiednie miejsce,
3. wykonuje akcję sadzenia,
4. seed zostaje zużyty,
5. crop zostaje utworzony w świecie.

Nie dodawać od razu podlewania, nawożenia, chorób, chwastów ani pełnego systemu farm plots.

### 2.4 Garden integration

Wykorzystać istniejące mechanizmy garden/resource gathering. Nie tworzyć osobnego `FarmSystem`, jeżeli istniejący model garden może zostać rozszerzony.

Dojrzały crop powinien korzystać z istniejącego gather/harvest flow.

### 2.5 Visuals

Minimalna wizualizacja etapów:

- seed/sprout — mała roślina,
- growing — większa roślina,
- mature — pełna roślina,
- harvested — usunięta lub resetowana do odpowiedniego stanu.

Nie wymagać ciężkiego modelu GLB dla każdego stadium, jeśli prostsze warianty wystarczą.

### 2.6 Interaction

Wykorzystać istniejący system `Interactable`. Nie tworzyć osobnego input systemu.

Przykładowe prompty:

```text
[E] Posadź
[E] Zbierz
```

## 3. Shared lifecycle

Nie tworzyć jednego wielkiego `PlantSystem`.

```text
TreeLifecycle
    └── planted trees

CropLifecycle
    └── planted crops
```

Wspólne powinny być tylko mechanizmy infrastrukturalne: world time, persistence, placement, inventory, interaction i rendering/update lifecycle.

## 4. Persistence

Posadzone rośliny muszą przetrwać chunk unload/load, rebuild świata oraz zapis/odczyt gry.

Dla drzewa preferować:

```text
stable id
+
state override
+
stageStartedAt
```

Dla cropów podobny minimalny model:

```text
id
+
crop type
+
position
+
stage / stageStartedAt
```

## 5. Performance

- brak per-frame update każdego cropa,
- lazy growth,
- brak ciężkich obliczeń co klatkę,
- wykorzystanie istniejącego chunk lifecycle,
- preferowanie instancingu/batchingu dla dużych grup identycznych cropów.

Nie projektować teraz osobnego systemu workerów.

## 6. Verification

### Technical

- `tsc`
- lint
- tests
- build

### Browser

Sprawdzić:

- posadzenie drzewa,
- wzrost drzewa przez upływ czasu,
- harvest posadzonego drzewa,
- posadzenie cropa,
- wzrost cropa,
- harvest cropa,
- brak możliwości sadzenia w niedozwolonym miejscu,
- save/load,
- chunk unload/load,
- brak widocznych leaków lub lawinowego wzrostu liczby obiektów.

## Out of scope

Nie implementować:

- NPC farmer AI,
- automatycznego podlewania,
- nawożenia,
- chorób,
- genetyki roślin,
- zaawansowanych farm,
- player-built farmland,
- rozbudowanej ekonomii nasion.

## 7. Implementation summary (2026-08-21)

Implemented end-to-end following the implementation notes and updated review's corrections against the real codebase (both are the authoritative account of scope adaptation — this is a compact index, not a restatement).

- **Trees**: new `world/plantedTrees.ts` (`PlantedTreeRecord`, `makePlantedTreeId` — distinct `planted:` namespace so a planted tree can never collide with a procedural `makeTreeId`, `pickPlantedTreeSpecies` — reuses `envGrowthFactor`/`TREE_SPECIES_PREFS`, the same habitat-suitability signal procedural placement uses, without the clump-noise bias that only matters for generating a whole stand). One generic `tree_seed` item (not one seed per species) — the plan says "sadzić nasiona drzew", not "wybrać gatunek"; species is resolved from the planting location the same way the world already resolves it for procedural trees. `TreeLifecycle` gained one new primitive, `setOverride(id, override)`, so a planted tree's growth clock can be anchored at the moment of planting instead of pretending it existed at world day 0 — every other tree-growth mechanic (canopy competition, chop/harvest/regrowth, species prefs) is reused completely unchanged.
- **Crops**: no new lifecycle — planted crops are literal `CropPlacement` records (plan 172's own type) fed into the existing `resolveCropStage`/`resolveCropHarvest`. New `world/plantedCrops.ts` (`makePlantedCropId`, `CROP_SEED_ITEM` seed↔crop map, `isNearAnyGarden` — placement is restricted to a radius around a settlement's `landmarks.gardens`, using `gardenClearingRadius('L')` as one conservative "near enough" circle since `Settlement` doesn't expose each garden's individual `GardenScale`, a deliberate v1 simplification). A harvested planted crop is removed from its own persistent array outright — unlike a wild crop, there is no deterministic generator that would ever recreate it, so `removedCropIds` doesn't apply.
- **Chunk integration**: `ChunkManagerConfig` gained `plantedTrees`/`plantedCrops` (mutable arrays passed by reference, same convention as `collectedItemIds`/`removedCropIds`). `attachChunkContent`'s tree loop now merges `plantedTreesForChunk(coord)` into the same placement list `tile.vegetation`'s trees feed, so a planted tree goes through the identical `registerPresence`/`resolve`/region-batcher-`tree-living`-or-`vegetationExtras` path as a procedural one (updated review §1/§2) — no `if (tree.owner === 'player')` branch anywhere. Same merge for crops via `plantedCropsForChunk(coord)` into `tile.crops`. New `ChunkManager.plantTree(x, z, rotationY)`/`plantCrop(x, z, cropId)` mutate the registry, register/anchor the tree (or push the crop record) and render immediately into the already-loaded chunk — a tree lands in `vegetationExtras` (the same fallback `refreshTreeVisual` already uses for any runtime-changed tree, simpler than re-inserting into a built region-batcher instance buffer) and migrates into the normal batched path automatically the next time that chunk reloads; a crop is simply appended to `rec.crops` (never instanced — same precedent as wild crops).
- **Placement**: `app/actions/placementActions.ts`'s `plantTreeAtAim`/`plantCropAtAim`, same validate → short busy channel → consume-seed-only-on-success shape as `placeTentAtAim`/`placeTrapAtAim`/`placeWellAtAim`, reusing `evaluateGroundPlacement` with `chunkManager.getNearbyTrees`/`getNearbyCrops` as peers (covers procedural *and* already-planted, since both register into the same lifecycle/registry) and `tentBlockers` for settlement structures. Exposed as two new Quick Actions buttons ("Zasadź drzewo" / "Zasadź: marchew·ziemniak·kapustę"), gated on holding the matching seed — full stack: `ui/createQuickActions.ts` → `ui-vue/store.ts` → `QuickActionsScreen.vue`, mirroring the existing trap/tent/well wiring exactly.
- **Items**: `tree_seed`/`seed_carrot`/`seed_potato`/`seed_cabbage` — ordinary count-based `ItemKind`s (never item instances), Kupiec stock (`items/tradeCatalog.ts`), procedural pickup mesh (small tinted seed-pouch shape, no GLB — `docs/assets/MODELS.md` M56).
- **Persistence**: `SaveData` v25 adds `plantedTrees: SavePlantedTree[]` / `plantedCrops: SavePlantedCrop[]` (identity/placement only — a planted tree's current stage is already covered by the existing `treeOverrides`, never duplicated). A pre-v25 save migrates to both empty (no plants existed before this plan).
- **Verification**: `npx tsc --noEmit`, `pnpm lint:fix`, `pnpm run build`, `pnpm run test` (1514 tests, incl. new `world/plantedTrees.test.ts`, `world/plantedCrops.test.ts`, `treeLifecycle.test.ts`'s `setOverride` coverage, and `saveData.test.ts`'s v25 migration/round-trip/rejection tests) are all green. No browser/gameplay verification — see plan §6 for the manual checklist still open (plant/grow/harvest a tree and a crop, invalid-placement rejection, save/load, chunk unload/load).

> **Zrób git commit i push do main, rebase jeżeli trzeba**
