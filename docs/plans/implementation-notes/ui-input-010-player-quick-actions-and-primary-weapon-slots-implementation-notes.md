# Implementation notes: ui-input-010 player quick actions and primary weapon slots

**Status:** implemented (2026-09-08)

## Implemented seams

- `src/items/primaryWeapons.ts` — explicit `setPrimaryMelee` / `setPrimaryRanged`, first-equip-only `noteEquipped`, `exportState` / `restoreState`, inventory sync unchanged.
- Save schema bumped **v8 → v9** with required `primaryMeleeWeapon` / `primaryRangedWeapon` fields and `migrateSaveV8ToV9()` defaulting missing/invalid entries to `null`.
- `src/items/sensibleFood.ts` — deterministic hunger-food resolver (`resolveSensibleFoodKind`).
- `src/items/cookingFireResolver.ts` — nearby fire resolver (player-placed + loaded settlement fires, `INTERACT_RANGE`, player position).
- `src/app/actions/cookMealIntent.ts` — single-active `Ugotuj posiłek` controller.
- Lifecycle hooks added to `SurvivalActions.startIgniteFire` / `startCookAt` (`SurvivalActionLifecycle`) and `PlacementPreviewActions.start(..., lifecycle?)`; `buildSimpleFire()` now returns `{ ok: true, placedFireId }`.
- UI: inventory primary assignment actions, Quick Actions category `Przetrwanie` with `Zjedz cokolwiek` / `Ugotuj posiłek`.

## Code-driven notes

- Repository save version at implementation time was already **8** (not 6 from the original plan draft); primary slots landed in **v9**.
- `simple` player fire placement still starts lit via existing `buildSimpleFire()` rules, so the create-fire branch normally skips a separate ignite phase.
- Cook-meal intent cancellation is wired into app teardown and `rebuildWorld()` via `cancelActivePlayerIntent`.

## Tests added

- `src/items/primaryWeapons.test.ts`
- `src/items/sensibleFood.test.ts`
- `src/app/actions/cookMealIntent.test.ts`
- Save fixtures updated in `saveData.test.ts`, `saveDb.test.ts`, `saveSlots.test.ts`

## Related implementation

- `ui-input-007` `ActionResult` remains initial validation only; async completion uses the new lifecycle hooks instead.
- `items-player-018` can reuse `createCookMealIntent` pattern for future single-active intents; no workflow engine added.
