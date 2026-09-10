# Implementation Notes: items-player-023 — Systemic item utility and food safety

## Current codebase findings

### Item catalog is the correct semantic authority

- `src/items/itemCatalog.ts::ItemCatalogEntry` already owns gameplay-facing declarative semantics (`capabilities`, combat stats, `consumable`, `food`, treatments, containers, etc.). `ITEM_CATALOG[kind].capabilities` is already the canonical pattern for replacing scattered `ItemKind` gates.
- Put fuel metadata on `ItemCatalogEntry`; do not add a separate fuel registry, tag collection, `FuelManager`, or settlement-owned fuel table.
- `cone`, `branch`, and `beam` are ordinary `ItemKind`s already present in the catalog/world. `cone` currently has no gameplay utility; `branch` and `beam` are already consumed by campfire paths.
- Keep construction semantics unchanged. `beam` remains a concrete structural item and its new fuel metadata is additive; do not touch `constructionMaterials.ts` or material recovery in this plan.

### Fuel authority and units

- `src/settlement/VillageFire.ts` owns the authoritative runtime fire state: `lit`, `fuelRemaining`, ignition ramp, visual size, extinguish and grate state.
- `FUEL_PER_BRANCH = 75` is seconds per **branch-equivalent** for the default fire. `createVillageFire(..., fuelPerBranch)` can receive a different base duration for simple player fires, so fuel utility must be expressed as a multiplier of this per-fire base rather than as absolute seconds in `ITEM_CATALOG`.
- `VillageFire.getFuelRatio()` already exposes `fuelRemaining / fuelPerBranch`; preserve this as branch-equivalent fuel. Existing scalable-fire presentation depends on this normalized quantity.
- Current `light()` resets fuel to exactly one `fuelPerBranch`; current `addFuel()` adds exactly one. Change these APIs to accept a positive branch-equivalent contribution, while keeping fire state ownership inside `VillageFire`.
- Settlement/night/NPC autolight calls may not correspond to an inventory item. Do not force every `light()` caller through item consumption. Keep a default contribution of `1` if that preserves existing non-player semantics cleanly, or make the player path explicit while retaining an equivalent internal/default path for non-item ignition.

### Fuel selection call-sites

`FIRE_FUEL_KINDS` is currently referenced outside `VillageFire` and must disappear as gameplay authority:

- `src/app/actions/survivalActions.ts::startIgniteFire()` checks availability before starting the busy action, then **re-resolves fuel at completion** before removing one unit and calling `fire.light()`. Preserve this completion-time revalidation; do not capture a fuel kind at action start and blindly remove it later.
- `src/app/gameLoop.ts` handles refuelling an already-lit campfire inline. It currently does `FIRE_FUEL_KINDS.find(...)`, removes one unit, then calls `target.fire.addFuel()`. Replace both selection and contribution with the shared catalog-driven helper.
- The habitat/spawner destruction path in `survivalActions.ts` currently consumes four branches and represents their burn contribution as `light('player')` + three `addFuel()` calls. Preserve the effective **4 branch-equivalents** directly; this path is not an inventory-driven fuel-choice event and should not manufacture four generic fuel selections.
- `src/app/interactables.ts` still contains static campfire wording equivalent to `Dołóż gałąź`; update vocabulary to generic fuel/opał, but do not make the interaction layer inspect inventory. The existing convention is static prompt + action-time validation.
- `docs/items/CATALOG.md` describes `FIRE_FUEL_KINDS` as the current fuel authority. Update that documentation after implementation; generated code-map files should be updated through their normal generator/workflow rather than edited manually.

### Recommended fuel helper boundary

Keep the helper in the items domain, next to catalog semantics. It should be pure except for reading the supplied inventory interface when selecting a kind.

Useful contracts are conceptually:

```ts
fuelValue(kind: ItemKind): number | null
isFuel(kind: ItemKind): boolean
selectFuelKind(inventory: Inventory): ItemKind | null
```

Do not derive selection order by iterating object keys. The V1 policy is explicit and deterministic: `cone → branch → beam`. Keep that policy in one place beside the helper, e.g. a `FUEL_ITEM_PRIORITY` constant, not duplicated between ignition and refuel.

Fuel values should remain balancing data in `ITEM_CATALOG`. Preserve `branch = 1`. Pick simple fixed V1 values for `cone < 1` and `beam > 1`; tests should assert the chosen contract and relative burn contributions. Do not introduce heat, ignition difficulty, moisture, fuel mass, or fuel quality.

## Food provenance and safety

### Existing provenance must remain authoritative

- `src/items/foodFreshness.ts::FoodSourceSpecies` is already the item-domain species vocabulary for meat provenance: `deer | wolf | boar | rabbit | cow`.
- `SOURCE_SPECIES_BY_MEAT_KIND` / `sourceSpeciesForMeatKind()` map species-specific raw meat kinds to that provenance.
- `FoodBatch.sourceSpecies` survives transfers and processing. `inheritProcessedFoodBatch()` deliberately preserves it for `roasted_meat` / `dried_meat`.
- `getFoodBatchFreshnessStage()` is the canonical `fresh | medium | spoiled` resolver. Do not add a second food-age calculation.
- `foodHungerRelief()` already scales processed meat nutrition from the source species. Food safety must not modify or duplicate that nutrition logic.

### Recommended food-safety boundary

Keep species risk data and the pure raw-meat safety resolver in the items domain, preferably in a focused file such as `src/items/foodSafety.ts` rather than expanding `survivalActions.ts` with tables and formulas.

The resolver should consume existing semantics rather than own new state. A useful shape is conceptually:

```ts
type RawMeatSafetyRisk = {
  chance: number
  severity: number
}

resolveRawMeatSafetyRisk(
  kind: ItemKind,
  batch: FoodBatch | undefined,
  nowDays: number,
): RawMeatSafetyRisk | null
```

Important rules:

- Species-specific raw kinds obtain species from `batch.sourceSpecies` when present, otherwise `sourceSpeciesForMeatKind(kind)`.
- Generic `raw_meat` with no provenance must use an explicit generic fallback profile.
- Only raw meat kinds participate. `roasted_meat` and `dried_meat` return no raw-meat risk even though their batches retain `sourceSpecies`.
- `fresh` uses species base chance; `medium` applies one shared multiplier/adjustment. `spoiled` remains blocked by the existing consumption preflight and should not become a safety-roll case.
- Keep chance clamped to `[0, 1]` and severity compatible with `applyPoisoningExposure`'s existing severity scale.
- Do not encode `if (kind === 'boar_meat')` policy in `consumeItem()`.

Species risk numbers are new balancing data. Keep them centralized and deliberately simple. The implementation agent may choose the exact values, but preserve a meaningful species gradient and add tests that demonstrate at least low/high species differences plus the medium-freshness increase.

### Poisoning lifecycle already exists

- `src/shared/temporaryConditions.ts::applyPoisoningExposure()` owns poisoning severity/repeated exposure/recovery. Reuse it directly; no food-specific condition state.
- After a successful exposure, call `player.syncDerivedPhysicalCapabilities(nowDays, ...)` exactly as the unsafe-water path does so SPEA/carry-capacity effects become visible immediately.
- `conditionTreatment` continues to treat the same `poisoning` condition regardless of whether exposure came from water or food.

## Deterministic food-risk rolls

### Existing water pattern

`src/shared/waterPoisoningExposure.ts` is the concrete precedent:

```text
worldSeed + actorId + monotonic event index + source identity + salt
→ hash
→ createSeededRandom(...)
→ stable [0,1) roll
```

`PlayerController.waterDrinkEventCount` is persisted separately so save/load cannot reroll an event and unrelated random calls cannot perturb it.

Do not reuse `waterDrinkEventCount` for food. Do not use `Math.random()`.

### Recommended food roll helper

A small `foodPoisoningExposureEventRoll()` may live with `foodSafety.ts` if it only concerns food semantics, or in a narrowly named shared file if imports require it. Avoid extracting a generic risk/event framework solely for these two consumers.

Include enough identity in the deterministic key to prevent accidental collisions between different raw-food events, e.g.:

```text
worldSeed : actorId : foodEventIndex : kind : sourceSpecies/generic : food-poisoning salt
```

The monotonic counter should increment **only after a raw-meat risk has been resolved and an exposure roll is actually going to occur**. Safe processed/non-meat food must not advance it. This keeps its name/meaning aligned with the event sequence and avoids unrelated diet changes perturbing future unsafe-food rolls.

Prefer `unsafeFoodEventCount` if following that narrow increment policy. If implementation instead intentionally counts every food consumption, use `foodConsumptionEventCount`; do not call it one thing and implement the other semantics.

## `consumeItem()` integration order

`src/app/actions/survivalActions.ts::consumeItem()` currently performs spoiled preflight before `removeWithFreshness()`, then removes the FIFO unit and derives `sourceSpecies` from the consumed batch/fallback.

Preserve atomicity and consequence order:

1. existing consumable/ownership checks;
2. existing FIFO spoiled rejection — no item removed, no counter increment, no roll;
3. `removeWithFreshness(kind, 1, nowDays)`;
4. retain the actual consumed batch and derive source species as today;
5. resolve raw-meat safety risk from the **consumed batch** / its freshness semantics;
6. if risk exists, take and increment the food-risk event index and compute deterministic roll;
7. apply normal hunger/thirst/heal effect and existing treatments;
8. if the risk roll succeeds, apply existing poisoning exposure and sync derived capabilities;
9. refresh inventory/HUD once and give poisoning-specific feedback when exposure occurred.

The player has eaten the item even when poisoned. Do not roll before successful removal and then cancel consumption on exposure.

Be careful that freshness needed for the risk must refer to the consumed FIFO batch at `nowDays`. `removeWithFreshness()` returns batch fragments carrying the metadata, so do not re-query inventory after removal for the batch that was just eaten.

## Persistence integration

### Current schema contract

- `src/persistence/saveData.ts` currently has `CURRENT_SAVE_VERSION = 28`.
- `SaveData.playerConditions?` and `waterDrinkEventCount?` are already adjacent player-condition/risk fields.
- `SAVE_MIGRATIONS` currently ends at `27: migrateSaveV27ToV28`.
- The schema contract explicitly requires a version bump + migration whenever persisted representation/semantics change.

Add the food-risk counter as a current-schema field near `waterDrinkEventCount`, validate it as a finite/non-negative number (prefer integer semantics for a monotonic event index), and bump the save version through the existing migration registry.

The V28 → V29 migration should add/default the new counter to `0` (or omit it if current sparse-save convention deliberately writes zero as `undefined`, provided restore consistently defaults missing to zero). Do not normalize it ad hoc only in `createApp.ts`.

### Runtime/save/restore path

Touch the same boundaries as the existing water counter:

- `src/player/PlayerController.ts` — runtime counter ownership and restore API;
- `src/app/saveState.ts` — snapshot current counter;
- `src/persistence/saveData.ts` — field, validator, version/migration;
- `src/app/createApp.ts` — restore current field into player runtime state.

Avoid widening `restoreTemporaryConditionsState()` into an ever-growing unrelated-arguments API if adding another counter makes that method semantically awkward. It is acceptable to keep counters as explicit player fields restored alongside conditions; follow the smallest clear shape supported by current code.

Update `src/persistence/saveData.test.ts` migration/current-schema fixtures and any `PlayerController`/save-state tests affected by the new required current version.

## Tests worth adding/updating

- `itemCatalog` / fuel helper tests: non-fuel returns null/false; `cone`, `branch`, `beam` are fuels; branch is exactly 1; priority is deterministic `cone → branch → beam` and falls through when earlier kinds are absent.
- `VillageFire` tests: branch-equivalent 1 preserves current duration; sub-1 contribution burns sooner; >1 burns longer; refuel is additive; `getFuelRatio()` reports normalized equivalents; custom `fuelPerBranch` still scales all item values correctly.
- `survivalActions` ignition tests: availability uses catalog helper; fuel is re-resolved at busy completion; removed kind's value is passed to fire; generic error wording; habitat destruction remains four branch-equivalents.
- `gameLoop` refuel tests: selected fuel is removed once and its exact value reaches `addFuel`; no fuel leaves inventory/fire unchanged.
- `foodSafety` pure tests: species-specific profiles differ; generic `raw_meat` fallback exists; medium risk > fresh; spoiled is not a normal risk result; roasted/dried meat returns no raw risk despite provenance.
- deterministic roll tests: same seed/actor/index/food identity gives same roll; changing index or source identity changes the deterministic sequence; no `Math.random` dependency.
- `survivalActions.consumeItem` tests: safe/non-meat food does not advance counter; raw meat advances exactly once; failed/spoiled consumption does not; successful exposure applies `poisoning` after food is consumed; failed exposure still grants nutrition; processed meat with `sourceSpecies` does not trigger raw risk.
- persistence tests: V28 migrates to V29 with counter zero/default; save/load round-trips non-zero counter; missing legacy field restores as zero; current validator rejects malformed counter.

## Implementation order

1. Add catalog fuel metadata + pure fuel helper/priority and tests.
2. Adapt `VillageFire` to branch-equivalent contributions and migrate ignition/refuel/habitat call-sites.
3. Add pure species/freshness raw-meat safety resolver + deterministic food roll tests.
4. Integrate raw-meat exposure into `consumeItem()` using existing poisoning lifecycle.
5. Add runtime food-risk counter + save schema V29 migration/restore and persistence tests.
6. Update authoritative hand-written docs (`docs/items/CATALOG.md`, relevant state doc if behavior description changes). Let generated docs/indexes follow the repository's normal workflow.

## Guardrails

- No `FuelManager`, `FoodDiseaseSystem`, `MaterialManager`, generic risk engine or parallel item tag registry.
- `ITEM_CATALOG` remains item-property authority; `VillageFire` remains fire-state authority; `TemporaryConditionsState` remains poisoning authority; `FoodBatch` remains freshness/provenance authority.
- No construction-material substitution, structural-wood units or recovery changes.
- No new cooked-meat ItemKinds per species.
- No new disease kinds; food and unsafe water both feed existing `poisoning`.
- No NPC/household fuel decision strategy in V1.
- Do not change portable `PlayerTorch` fuel semantics.
- Do not make campfire interaction discovery inventory-dependent.
- Preserve deterministic event rolls across save/load.
- Add JSDoc with `@domain items-player` to important new public helpers/contracts that should be discoverable by preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
