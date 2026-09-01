# Implementation Notes: Player Gathering and Fire Cooking Polish

## Review result

The plan is compatible with the current architecture, but two parts need to follow the code rather than the plan's implied shape:

- Fish is currently a single concrete item kind, `fish`; there is no fish species identity to preserve.
- Branch gathering is **not** currently owned by `TreeLifecycle`: the player path is in `gameLoop.ts`, using `treeInspectionCanYieldBranch()`, `TREE_BRANCH_CHANCE`, `KNIFE_BRANCH_BONUS` and `Math.random()`. This is the main architectural correction required by the plan.

## Fish cooking

- The authoritative cooking pipeline is `src/items/campfireCooking.ts`:
  - recipes are `COOKING_RECIPES`;
  - station capacity comes from `resolveCookingCapacity()`;
  - batch selection comes from `findCookingBatch()`.
- `src/app/actions/survivalActions.ts::startCookAt()` is the existing player-facing fire action. Do not add a fish-specific action.
- Current catalog state: `ItemKind` contains `fish` and `dried_fish`, but no cooked-fish kind. `fish` is already a food/consumable in `src/items/itemCatalog.ts`.
- Add the cooked fish as a normal `ItemKind` + `ITEM_DEFS` + `ITEM_CATALOG` entry, then add one row to `COOKING_RECIPES`. Do not add branching logic such as `if fish` to `startCookAt()`.
- Preserve the existing `fish` identity at the raw-item level. Since there is no species data today, do not invent species metadata.
- Update the generic cooking failure/success text only if needed; current text says “surowe mięso”, which will become misleading once fish is a valid input.
- Reuse normal `Inventory.add/remove/canAdd` and acquired-at-days handling. No new processing/inventory path.
- Existing focused test: `src/items/campfireCooking.test.ts`. Extend it with fish recipe selection/batch behaviour; keep station-capacity tests intact.

## Quick Actions — same action in two categories

The current Quick Actions implementation is already data-driven:

- `src/ui-vue/playerQuickActions.ts` owns the shared `FIRE_QUICK_ACTIONS` definitions and `visibleFireActions()`.
- `src/ui-vue/screens/QuickActionsScreen.vue` owns category presentation.
- `src/app/userActions.ts` owns the actual build callbacks.
- `src/ui-vue/store.ts` owns the reactive availability/category state.

Current discrepancy: `QuickActionsScreen.vue` explicitly removes `buildSimpleFire` and `buildFirePit` from `fireActions`, because those actions were moved into **Budowa**. The plan only requires `Zbuduj ognisko` to appear in both categories.

Preferred implementation:
- Keep one `FireActionId = 'buildSimpleFire'` and one `FIRE_QUICK_ACTIONS` definition/callback.
- Make the **Ogień** presentation include `buildSimpleFire` as well; do not create a second action definition or second handler.
- Keep **Budowa** unchanged.
- Do not change execution semantics: `onStartPlacementPreview('fireSimple')` is the current build path in Budowa, while `FIRE_QUICK_ACTIONS.run()` currently calls the direct `onBuildSimpleFire` callback. This is an important existing distinction. If the requirement is literally “the same action”, avoid silently creating two different placement flows. Prefer exposing the existing shared action definition but preserve the currently intended placement-preview UX if the codebase's action contract requires it.
- Before changing this, trace how `onBuildSimpleFire` and `onStartPlacementPreview('fireSimple')` are wired in `createApp.ts`. Do not introduce a second fire-building implementation just to satisfy the category.
- The availability source is `syncQuickActionAvailability()`; keep it as the single source for visibility.

## Tree branch regeneration

Current ownership and lifecycle:

- `src/world/treeLifecycle.ts` already owns:
  - `TreeSizeClass = 'small' | 'medium' | 'large'`;
  - deterministic/stable tree identity;
  - sparse `TreeStateOverride` state;
  - world-day anchored lifecycle transitions;
  - `serializeOverrides()/replaceOverrides()`;
  - the player/NPC tree-harvest state machine.
- `src/world/treeHarvest.ts` is the thin player/NPC harvest adapter.
- `src/app/gameLoop.ts` currently handles branch inspection/gathering separately. This is the code that must stop owning branch availability/yield rules.

Recommended shape:
- Extend `TreeLifecycle` with branch availability/regeneration state, rather than adding a manager/timer.
- Prefer a timestamp/anchor such as `branchRegeneratesAt` in the existing sparse per-tree override. Availability is then `worldDays >= branchRegeneratesAt`.
- A successful branch harvest must set that timestamp once. A blocked harvest must not change it.
- Do not change the existing tree chop stages (`mature → limbed → felled → harvested`) just to model branch picking.
- Be careful with `resolvePresence()`: it currently prunes an override when the resolved tree becomes canopy-equivalent to its procedural state. That pruning must not discard a still-active branch-regeneration timestamp.
- Reuse the existing persisted `treeOverrides` field. `SaveData.treeOverrides` is already validated, `createApp.ts` restores it through `parseTreeOverrides()`, and `saveState.ts` serializes `getTreeLifecycle().serializeOverrides()`. Do **not** add a second branch-regeneration save collection.
- The same `TreeLifecycle` instance is retained through an in-session world rebuild; verify the rebuild path before adding any special persistence. A genuinely new world clears overrides.

Yield:
- Reuse `TreePresence.sizeClass`; do not introduce another size classification.
- Put the ranges in named constants, e.g. `BRANCH_YIELD_BY_SIZE`, so tuning is centralized.
- The current branch path gives exactly one branch on a successful random roll. Replace that path with a lifecycle-owned result containing the rolled count.
- The plan does not specify the regeneration duration. Do not bury an unexplained magic number in the interaction code. Add a named `BRANCH_REGENERATION_DAYS` constant and settle/document its initial value during implementation.
- Roll yield only after the lifecycle confirms the tree is currently harvestable. A rejected/cooldown attempt must consume neither randomness nor inventory.
- Use the project's deterministic conventions rather than `Math.random()`. `src/world/parseSeed.ts::createSeededRandom()` is the existing primitive, but avoid making the result depend on render-frame timing. A stable tree id + a harvest/regeneration anchor is a suitable deterministic input.
- Preserve inventory-capacity semantics: check capacity before mutating the authoritative tree state, so a full inventory cannot consume the tree's branch availability.

Integration:
- The player interaction in `gameLoop.ts` should call a tree-lifecycle/tree-harvest seam and use its result. It should no longer calculate `TREE_BRANCH_CHANCE`, knife bonus, or yield locally.
- Keep `treeInspectionFlavor()` / `treeInspectionCanYieldBranch()` for presentation/inspection only; do not make them authoritative resource state.
- Existing `TreeLifecycle.findHarvestableNear()` is for chopping and should not be overloaded with a different “branch harvestable” meaning unless the resulting API remains clear. A small explicit branch-harvest method is preferable.

## Tests

Extend the existing `src/world/treeLifecycle.test.ts` rather than creating a parallel tree test suite.

Cover at minimum:
- small/medium/large yield bounds;
- successful harvest starts cooldown;
- repeated harvest during cooldown yields nothing and does not move/extend the regeneration timestamp;
- harvest becomes available after the configured world-day duration;
- deterministic yield for the same stable inputs;
- sparse override serialization/restoration preserves active regeneration;
- canopy override pruning does not erase branch cooldown state.

For cooking, extend `src/items/campfireCooking.test.ts`.

For Quick Actions, prefer a small test around the shared fire-action catalog or existing UI/store seam if a suitable test target already exists; do not build a UI-specific duplicate action model just to test the category.

## Important pitfalls

- Do not implement branch regeneration as a render-time countdown or frame timer.
- Do not add a generic “resource regeneration framework”.
- Do not put fish cooking into `startFishing()`; fishing should continue to produce the existing raw `fish` item.
- Do not create a second fire-building callback/action solely for the Ogień category.
- Do not reset branch state when chunks stream out/in; tree lifecycle state is sparse and world-time based.
- Do not broaden SaveData beyond the existing tree override mechanism.
- Keep NPC branch gathering out of this plan.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
