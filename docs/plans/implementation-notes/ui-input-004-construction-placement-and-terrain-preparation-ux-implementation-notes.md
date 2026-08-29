# Implementation Notes: Construction Placement & Terrain Preparation UX

**Reviewed:** 2026-08-29  
**Plan:** `ui-input-004-construction-placement-and-terrain-preparation-ux.md`  
**Codebase baseline:** `main`

## Review summary

The plan is compatible with the current architecture, but several details differ from the plan's wording:

- Placement already has a shared domain seam: `evaluateGroundPlacement()` in `items/tentPlacement.ts`, while `placementActions.ts` supplies common blockers. Containers already use the same seam in `containerActions.ts`. There is no generic placement-preview controller yet.
- The game uses a pointer-locked FPS camera. There is no free cursor/world pointer for placement; "cursor movement" must therefore mean the existing look/yaw aim point, as already done by terrain preparation.
- Quick Actions is already Vue-rendered. `createQuickActions.ts` is only a compatibility facade; hierarchy belongs in `ui-vue/screens/QuickActionsScreen.vue` and its existing reactive `ui.quickActions` state.
- Terrain preparation is already implemented as a persistent `TerrainPreparationRecord` with immutable `originalHeights` and one authoritative active-work path. Extend this path; do not introduce another preparation state.

## 1. Well work session

Current code in `src/app/actions/placementActions.ts` converts `WELL_WORK_SESSION_SEC` into game hours and caps the session to remaining stage work. `WELL_WORK_SESSION_SEC` is currently 8 seconds and shared tests constrain timed busy channels to <=8s.

Therefore do **not** simply increase `WELL_WORK_SESSION_SEC` to represent 2h: that would conflict with the existing busy-channel contract.

The intended change is the game-hours credited by an 8s session. Keep:
- `WELL_STAGE_WORK_HOURS`: pit 2, well 1, roof 1;
- measured elapsed game-time credit on completion/cancel;
- `busy.start(..., { onCancel: commitProgress })`;
- stamina cost and existing time-skip mechanism.

Inspect the current time-skip conversion carefully before changing it. The plan's "2h per session" means the full pit should complete in one 8s bout without allowing progress beyond the stage requirement.

## 2. Shared placement preview

Use a small, reusable presentation/controller layer around the existing placement rules rather than moving gameplay rules into UI.

Recommended responsibility boundary:

`PlacementPreview`
- selected placement kind/action;
- current aimed position/yaw;
- preview visual state;
- last validation result;
- confirm/cancel lifecycle.

Existing action modules remain authoritative for:
- exact placement rules;
- item/material consumption;
- busy duration;
- world mutation;
- gameplay consequences.

The preview may call `evaluateGroundPlacement()` every update, but confirmation should call the real placement action again. Never trust a cached preview result for the final mutation: blockers, inventory and world state can change between preview and confirmation.

Reuse `placementActions.ts`'s `tentBlockers()` for the shared static blocker query. The current function name is legacy; do not duplicate it under another blocker system.

The preview should use each object's real footprint/separation and peers:
- chest: `CONTAINER_DEFS.chest`, `bundle.placedContainers.nodes()`;
- tent: existing tent constants/nodes;
- fire: existing fire placement/build rules once located in `createApp.ts`/user actions.

Do not make preview validity a second gameplay rule set.

Because input is pointer-locked, derive the placement point from the same player position + look yaw convention used by the existing action. Do not add raycasting/free-cursor placement unless the implementation discovers an existing mechanism that already supports it.

## 3. Placement visual

The current terrain preview is a useful pattern but is only global green/red. A generic placement preview can be a Three.js-owned object with simple footprint geometry.

Use three states from the shared validation result:
- green = `ok`;
- red = blocked/invalid;
- yellow = only if the existing domain validation can expose a meaningful warning state.

Do not invent a yellow gameplay condition merely to satisfy the visual specification. Current `GroundPlacementReason` is essentially valid/invalid, so yellow requires an explicit domain-level distinction or should remain unused.

Preview geometry should be cheap and reusable; avoid per-frame allocations/material creation.

## 4. Chest placement

`src/app/actions/containerActions.ts` already contains the complete authoritative chest placement path. It validates ground placement, uses shared blockers, checks existing placed containers, then spends the chest only when the busy channel completes.

The new preview should wrap this path, not replace it. Keep `placeContainerAtAim()` as the final mutation seam or refactor only enough to expose the shared aim/validation data without duplicating it.

Be especially careful with the carried-container put-down path: it is a different operation (`putDownContainerAtAim()`) and should not accidentally enter the new "new chest" placement flow.

## 5. Tent and fire placement

Tent placement is already in `placementActions.ts` and uses `evaluateTentPlacement()`, which is more specific than generic ground placement. Preserve that rule set.

For fire, first locate the current build-fire callbacks in `createApp.ts`/user actions and reuse their authoritative placement/build checks. Do not create a second fire-placement validator just because the preview needs a footprint.

If the three objects cannot share exactly the same validation function because tents have additional rules, the common layer should accept a validator callback rather than flattening the domain rules into one giant validator.

## 6. Quick Actions hierarchy

Current `QuickActionsScreen.vue` already renders logical groups (Ogień, Łopata, Pułapki, Sadzenie, etc.). Therefore this plan should be implemented as a **presentation hierarchy**, not a new action registry.

Avoid adding a parallel catalog. Keep handlers in `QuickActionsHandlers` and state in `ui.quickActions`.

A practical implementation is:
- root view: category buttons;
- category view: existing actions for that category;
- back button returns to root;
- selecting a placement action closes Quick Actions and enters placement mode.

Do not make the category itself responsible for availability logic. Existing computed actions/flags and callbacks remain authoritative.

The existing document-click close behaviour and mobile scroll handling must continue to work. Reset the selected category when Quick Actions closes so reopening does not expose stale navigation state.

## 7. Terrain preparation size

Current `PreparationSize` is exactly `2 | 3 | 4`, with `SIZES = [2, 3, 4]` in `terrainPreparationActions.ts`.

Both must be extended to include 9. The rest of the implementation already correctly derives sample count from the terrain grid step:

`Math.round(sizeMeters / step) + 1`.

Do not replace this with fixed sample counts. At 9m the number of samples can become materially larger, so keep the existing bounded/local nature of the operation and avoid adding an independent terrain scan.

## 8. Per-cell height visualization

Current `TerrainPreparationPreview` only has one fill material and one line material, with `setValid(valid)` applying one color to the whole preview.

The domain already computes exactly the data needed:
- `resolvePreparationSamples()`;
- `sampleHeight()`;
- `targetHeight`;
- `lastPreviewState.originalHeights`.

Extend the preview API to accept per-cell/per-region visual state. Prefer passing already-computed states from `terrainPreparationActions.ts` rather than making the renderer call terrain sampling itself.

Important: the current samples are **vertices**, while the preview grid renders **cells/lines**. Define explicitly how a sample maps to a rendered cell, especially for even sample counts. Do not silently change the footprint semantics.

The preview's target plane remains at one global `targetHeight`. Never derive a different target height per cell.

For a useful visualization, compare each sampled original height with `targetHeight` using the same deformation semantics as the domain. Do not introduce another tolerance constant in the renderer.

## 9. Preparation validation and tolerance

`MAX_PREPARATION_DELTA = 3` is currently exported from `terrainPreparation.ts` and used by `exceedsMaxDeformation()`. Changing this one constant is sufficient for the domain rule.

The plan does not specify the replacement value. Treat this as a balance decision, not an architectural change. A reasonable first candidate is **6m**, but keep it as the single exported constant so it can be tuned without changing validation code.

Do not change:
- `targetHeight` semantics;
- immutable `originalHeights`;
- progressive deformation;
- water validation;
- pickaxe requirement.

The height visualization should still show the actual difference even when the difference is within the newly increased tolerance.

## 10. Mobile terrain panel

Current panel is `src/ui-vue/screens/TerrainPreparationOverlay.vue` and uses `bg-panel` on the inner container. Do not lower opacity on the whole panel/component: text and controls must remain opaque/readable.

Prefer a mobile-specific background such as a semi-transparent panel color while retaining normal text/control opacity. Keep the existing pointer/touch behaviour and controls unchanged.

The panel already has explicit +/-/height/confirm/cancel controls wired through the store, so this task should only change presentation unless implementation reveals a concrete missing interaction.

## 11. Performance / lifecycle pitfalls

- Do not raycast or rebuild preview geometry every frame if the aimed grid position has not changed.
- Reuse Three.js materials/geometries where possible.
- Terrain preparation already throttles progressive terrain writes via `PROGRESS_UPDATE_STEP`; preserve that.
- Do not add a second terrain sampling pass solely for rendering. Compute validation/visual state once in `tickPreview()` and feed the result to the preview.
- Placement preview validation can be relatively frequent because it is local, but avoid allocating blocker/peer arrays unnecessarily if the implementation can reuse the existing bounded queries.
- Preview mode must clean up listeners and scene objects on cancel, completion, or action blocking, matching the existing terrain preparation `exitPreview()` lifecycle.

## 12. Dependencies / likely files

Primary:
- `src/app/actions/placementActions.ts`
- `src/app/actions/containerActions.ts`
- `src/app/actions/terrainPreparationActions.ts`
- `src/terrain/terrainPreparation.ts`
- `src/world/terrainPreparationPreview.ts`
- `src/ui-vue/screens/QuickActionsScreen.vue`
- `src/ui-vue/screens/TerrainPreparationOverlay.vue`
- `src/ui-vue/store.ts`
- `src/ui/createQuickActions.ts`

Also inspect the actual fire action implementation and its placement constants before changing it. The current codebase makes `createApp.ts`/user-action wiring part of that path, so do not assume a standalone fire-placement module exists.

## 13. Architectural decisions

1. **One placement UX, many domain actions.** Preview/navigation is shared; object-specific validation and mutation stay in existing actions.
2. **One source of truth for placement validity.** Reuse `evaluateGroundPlacement()`, `evaluateTentPlacement()`, and existing fire rules; do not duplicate conditions in Vue.
3. **One terrain preparation state.** `TerrainPreparationRecord` remains authoritative.
4. **Global target height.** Per-cell colors are diagnostic UX only; they do not alter terrain targets.
5. **Quick Actions hierarchy is UI state, not gameplay state.**
6. **8-second well work channel remains bounded.** Adjust credited game hours, not the busy-channel contract.
7. **No free cursor/rotation/snap system.** Placement follows the existing pointer-lock aim model.

## 14. Verification focus

Beyond the plan's checks, explicitly test:

- preview invalidation followed by world-state change before confirm;
- confirmation revalidation (no stale preview can place an invalid object);
- chest/tent/fire each retain their existing placement rules;
- cancelling placement leaves inventory/materials untouched;
- opening/closing Quick Actions resets category navigation;
- mobile category navigation does not interfere with touch scrolling;
- 9m preparation works at the current terrain resolution and across chunk boundaries;
- per-cell colors correspond to sampled original heights, not progressive/current heights;
- increased preparation tolerance does not allow water or bypass pickaxe requirements;
- well pit completes in one normal work session while well/roof retain their 1h requirements.

**Zrób git commit i push do main, rebase jeżeli trzeba**


## Current-code review delta (2026-08-29)

The repository was rechecked against `main`; these points are important for implementation and supersede any older assumptions in this note:

- `src/app/userActions.ts` still places both simple fires and fire pits directly at `player.mesh.position` and consumes their materials immediately. There is no fire-specific ground validator. For this plan, do not implement fire preview rules in Vue; refactor the existing fire action just enough to expose an authoritative aimed placement/validation seam, then reuse it from the shared placement mode. Keep the existing costs, capability rules and `PlacedFires` ownership.
- `src/app/actions/containerActions.ts::placeContainerAtAim()` is already a complete authoritative chest placement path. Keep it as the final mutation seam; the preview must not replace its revalidation/busy-channel semantics.
- `src/app/actions/placementActions.ts::tentBlockers()` is already the shared nearby blocker query despite its legacy name. Reuse it rather than creating a second blocker service.
- `src/app/actions/terrainPreparationActions.ts::tickPreview()` currently calls `previewMesh.setFootprint()` every frame. `src/world/terrainPreparationPreview.ts::setFootprint()` disposes and recreates the line geometry. This is an existing allocation/rebuild hotspot that should be fixed while adding per-cell visualisation: rebuild footprint geometry only after size/resolution changes.
- The current terrain preview is driven by pointer-locked `mouseLook.state.yaw`; there is no free world cursor. Placement UX should follow the same aim model unless implementation discovers an existing input mechanism that genuinely supports something else.
- `QuickActionsScreen.vue` already groups actions, while `createQuickActions.ts` is only a compatibility facade. The requested construction category should therefore be implemented as nested presentation state in the Vue screen/store, not as a second action registry. Reset category state on close.
- `PreparationSize` is still `2 | 3 | 4` and `SIZES` is `[2, 3, 4]`; both must change for 9m. `resolvePreparationSamples()` already derives sample count from terrain step and should remain the source of truth.
- `MAX_PREPARATION_DELTA` is still `3`. Increase that constant only; retain immutable `originalHeights`, water checks, pickaxe checks and the shared ground-suitability validation.
- `TerrainPreparationPreview` currently exposes only global `setValid(valid)`. Per-cell colour data should be computed in `terrainPreparationActions.ts` from the already sampled `originalHeights` and passed into the renderer. Do not make the renderer perform another terrain sampling pass.

## Implementation boundary

The safest implementation sequence is: first fix terrain size/tolerance and preview rendering; then introduce the shared aimed placement lifecycle; adapt chest/tent/fire to it without moving their domain ownership; finally add the Quick Actions hierarchy. Keep the well change independent and limited to the game-hours credited by the existing 8-second work channel.

**Zrób git commit i push do main, rebase jeżeli trzeba**
