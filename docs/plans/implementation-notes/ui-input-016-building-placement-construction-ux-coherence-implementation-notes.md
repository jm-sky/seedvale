# Implementation notes: ui-input-016 — Building placement and construction UX coherence

Recon baseline: `main` @ `27376fe6856d2e879415cb570b1de5aacf208ea3` plus plan commit. `items-player-024` is `verification needed`, but its implementation is already present on `main` and must be treated as the current code contract.

These notes record only relationships that are expensive to rediscover. The plan owns product decisions.

## 1. Shared placement ownership

### `src/app/actions/placementActions.ts`

Key existing types/helpers:

- `PlacementPreviewResult`
- `GroundPlacementSite`
- `GroundPlacementDefinition<Reason>`
- `evaluatePlacementSite()`
- `previewGroundPlacement()`
- object-specific `preview*Placement()` + matching `place*AtAim()` methods

Important boundary: `GroundPlacementDefinition.evaluate` owns site suitability only. `previewGroundPlacement()` is read-only and commit methods re-resolve/revalidate. Preserve that split.

Do **not** put inventory mutation or domain costs into `placementPreviewActions.ts` just to render requirements. If preview needs requirements, obtain them through a read-only object/app-layer query that uses the same domain requirement constants and the current site coordinates.

`PlacementPreviewResult.valid` is currently binary. The plan's three-state presentation should be represented explicitly; avoid deriving `preparation` from Polish `reasonLabel` strings.

### `src/app/actions/placementPreviewActions.ts`

Current `PlacementPreviewKind`:

- chest
- tent
- fireSimple / firePit / firePile
- standingTorch
- playerTrough
- palisade
- bedroll / platform
- workContract
- well
- smallHouse / mediumHouse

Missing: garden and traps.

Current `PlacementPreviewUiView` is only `{ label, valid, reasonLabel, supportsRotation }`.

`resolvePreview()` maps all three fire variants to the same `previewFire()`; this is where fire-specific preview dispatch must become explicit.

`confirm()` currently returns unless `lastResult.valid`; this is the gate that makes house auto terrain-preparation unreachable.

`tick()` currently hardcodes:

```ts
ghost.setEntranceMarker(active === 'smallHouse' || active === 'mediumHouse')
```

Keep per-kind behavior declarative beside `SUPPORTS_ROTATION`; do not infer front-marker capability from rotation alone.

`PlacementPreviewLifecycle` is used by intent-driven placement (tent/bedroll/platform/full-camp style flows). Repeat placement must not keep such intent placements open accidentally.

## 2. `items-player-024` material contract is already implemented

### `src/items/constructionMaterials.ts`

Current canonical resolver includes:

- `hasMaterial()`
- `consumeMaterial()`
- `computeMaterialRecovery()`
- `canReceiveRecovery()`
- `applyRecovery()`
- `materialAvailabilityBreakdown()`
- `CONSTRUCTION_MATERIAL_RADIUS`

`materialAvailabilityBreakdown()` already returns the useful shape:

```text
kind
required
inInventory
nearbyWorld
available
missing
```

It reuses the same nearby-world rule as material consumption. **Reuse it.** Do not add a second nearby-pile scan in UI/preview code.

Already wired examples worth copying:

- `src/app/actions/restActions.ts` camp repair quote formatting
- `src/app/actions/placementActions.ts` well construction description
- `src/items/constructionMaterials.test.ts`

The important placement-specific difference is that x/z comes from the current ghost/site, so availability may change every frame as the player moves aim.

## 3. Domain requirement sources — never copy strings into Vue

`placementActions.ts` already imports authoritative requirements from domain files, including:

- `PALISADE_MATERIAL_REQUIREMENTS` — `src/world/palisade.ts`
- `STANDING_TORCH_MATERIAL_REQUIREMENTS` — `src/world/standingTorch.ts`
- `PLAYER_TROUGH_MATERIAL_REQUIREMENTS` — `src/world/playerTrough.ts`
- `BEDROLL_MATERIAL_REQUIREMENTS`, `PLATFORM_MATERIAL_REQUIREMENTS` — `src/world/sleepingUtilities.ts`
- `wellStageRequirements()` / `wellStageCapabilities()` — `src/world/playerWell.ts`
- `residentialBuildingDefinition()` / `residentialStageRequirements()` — `src/world/residentialBuilding.ts`
- `GARDEN_COST` / `GARDEN_CAPABILITY` — `src/world/playerGarden.ts`
- trap placement/item definitions — `TRAP_DEFS` in `src/world/animalTraps.ts`

Quick Actions has historically duplicated several costs as literal strings. Route touched rows through domain requirement formatting. Houses are staged; derive total cost by folding `residentialBuildingDefinition(kind).stages`, while current-stage UI continues to use stage requirements.

## 4. Garden + traps already have domain placement rules

### Garden

`PlacementActions.placeGardenAtAim()` already performs capability/block checks and uses the same ground-placement concepts. Constants are in `src/world/playerGarden.ts`:

- `GARDEN_FOOTPRINT_RADIUS`
- `GARDEN_PLACE_REACH`
- `GARDEN_PLACEMENT_MESSAGE`
- `GARDEN_SEPARATION`
- `GARDEN_COST`
- `GARDEN_CAPABILITY`

Extract/reuse a `GroundPlacementDefinition`-style read-only preview rather than rebuilding those checks inside `placementPreviewActions.ts`.

### Traps

`PlacementActions.placeTrapAtAim(kind)` already reads `TRAP_DEFS[kind]` and trap constants from `src/world/animalTraps.ts`:

- `TRAP_FOOTPRINT_RADIUS`
- `TRAP_PLACE_REACH`
- `TRAP_PLACEMENT_MESSAGE`
- `TRAP_SEPARATION`
- `TRAP_SETUP_DURATION_SEC`

Trap placement also selects a concrete inventory-backed instance (`selectInstanceToPlace` / trap instance helpers). Preview must not reserve or mutate that instance; commit selects/revalidates live.

Prefer typed preview kinds carrying the concrete `TrapKind` over duplicating every trap rule manually. If `PlacementPreviewKind` remains a string union, ensure exhaustive records (`KIND_LABEL`, rotation/front-marker config, dispatch) stay compile-time checked.

## 5. House terrain-preparation branch

`placementActions.ts` imports and uses:

- `coveringPreparationSize()`
- residential placement reason/types
- terrain-preparation helpers

The review found existing `tryStartHouseTerrainPrep` mutation logic but the preview's binary valid gate prevents reaching it for slope-invalid placement.

Implementation direction:

1. domain/site evaluation still reports the actual residential placement reason,
2. app-layer preview interpretation maps the specific slope/preparable condition to `preparation`, not generic `invalid`,
3. include required digging capability/availability in the presentation,
4. confirm for `preparation` calls the existing auto-prep path,
5. geometry blockers that cannot be fixed by terrain prep remain `invalid`.

Do not broaden every placement error into “preparation”. Only reasons the existing domain flow can actually resolve qualify.

## 6. Inspection ownership

### `src/app/inspection/inspectionTarget.ts`

`inspectionTargetRef()` currently maps only:

- `palisade`
- `playerWell`
- `residentialBuilding`
- `standingTorch`
- `terrainPreparation`

Extending `[V]` requires updating the `InspectionTargetRef` union in `src/app/inspection/worldInspectionView.ts` (or its actual current owner), this mapper, `contractTargetFor()` only where work contracts genuinely apply, and all exhaustive switches/tests.

Do not fabricate `ContractTarget` mappings for camp/trough solely to satisfy exhaustiveness. `contractTargetFor` may need to become partial/guarded if the target union broadens beyond contract-capable structures.

### `src/app/inspection/buildWorldInspection.ts`

This is the canonical presentation builder. Vue should only render its view.

Reuse camp data instead of rebuilding calculations:

- `src/app/campRestSnapshot.ts`
- camp inspection formatting/snapshot logic currently reached from `src/app/actions/restActions.ts`
- `describeCampRepair` / camp repair quote work in `src/items/campRepair.ts` + `restActions.ts`

For trough, reuse live `PlayerTroughRecord` + existing work/fill helpers from `placementActions.ts` / `src/world/playerTrough.ts`.

`src/app/inspection/buildWorldInspection.test.ts` is the main read-model test location.

### `src/app/actions/inspectionActions.ts`

`runAction` already dispatches work/supply/repair-style actions. Starting an action that arms `BusyAction` should close inspection immediately instead of refresh/leave it covering the busy progress UI.

Keep inspection actions as commands into existing app-layer handlers; do not move mutations into the builder/Vue.

## 7. `InteractionView` migration

### `src/interaction/interactionView.ts`

`InteractionView` is already the canonical structured presentation. `parseLegacyPrompt()` remains an incremental fallback.

Construction kinds still identified by the review as legacy-fallback consumers:

- palisade
- residentialBuilding
- playerTrough
- terrainPreparation

Add explicit cases/read-only descriptors for these rather than expanding `STATUS_ONLY_RE` or parsing more Polish strings.

Important coupling: the same live `describe*`/requirement queries that feed `WorldInspection.enabled/reasonLabel` should feed `InteractionView`. Do not create separate “prompt availability” logic.

Execution remains in `gameLoop.ts`/action handlers and revalidates live.

## 8. BusyAction is intentionally generic and currently fixed-duration

### `src/app/busyAction.ts`

Current `BusyAction.start(durationSec, label, onComplete, options)` stores a fixed `durationSec` / `remainingSec` and drains configured stamina/vigor per real second. It knows nothing about construction stages, represented world hours, needs thresholds or target validity.

This is an important boundary: **do not turn `BusyAction` into a construction simulation manager.**

Construction currently uses compressed/represented work sessions with constants such as `*_WORK_SESSION_HOURS` and `*_WORK_SESSION_SEC`; `placementActions.ts` applies represented work and vigor/partial-credit around the generic busy channel.

Recommended implementation shape:

- introduce a small app-layer construction work-session helper (file/name at implementer's discretion) that computes the next safe represented-work boundary from live player state + target/stage state,
- arm `BusyAction` for the corresponding real-time channel,
- on completion/cancel translate actual elapsed fraction back to accepted represented work through the existing owner API,
- after a completed chunk, continue internally only if all live stop conditions still allow it; the player must not press `[E]` again,
- stop at meaningful boundaries (stage complete/material delivery, target complete, needs/stamina/vigor threshold, invalid target, interruption), not arbitrary one-hour UX chunks.

A loop of many invisible 1h busy actions is acceptable internally only if it is a single uninterrupted player session and does not reset/cancel semantics, spam UI/toasts, or allow needs to overshoot. Prefer computing the nearest stop boundary directly where existing math makes that reliable.

Review `src/player/PlayerNeeds.ts` before implementing this part. Reuse:

- `physicalEffortBusyOptions`
- `physicalEffortStaminaCostPerSec`
- `applyRepresentedPhysicalEffortVigor`

Do not invent a second stamina/vigor model. Hunger/thirst/other needs must use existing thresholds/updates rather than new construction-specific magic numbers.

Keep well special: its stage machine can consume requirements between stages. `PlayerWells.addWork()` naming differs, but semantics are compatible enough to orchestrate without renaming the world API.

## 9. Busy cancel UI

`src/ui-vue/screens/BusyOverlay.vue` currently has `pointer-events-none` on the full overlay and only renders label + progress.

`abortBusy` already exists at app/store wiring level (the review confirmed `configureAbortBusy` path). Add only a small interactive cancel control; do not make the entire overlay capture pointer input.

Desktop Esc remains the keyboard source of truth. Touch button should call the same abort action.

No separate mobile cancellation state.

## 10. Removal/recovery

Current generic primitives are in `constructionMaterials.ts`; current removers show the intended pattern.

Before adding removal for a type, verify:

1. world collection exposes `remove(id)` or equivalent,
2. whether object is portable and should return the actual instance (`tent` → `packTent`) rather than salvage materials,
3. whether unfinished progress/stage affects recoverable requirements,
4. inventory capacity via `canReceiveRecovery`,
5. confirmation text is built from the same pure recovery computation used at commit.

Completed house/well are explicitly deferred. Unfinished ones should be cancellable. Small completed player-built utilities can use recovery/removal when domain ownership supports it.

Do not silently delete when recovery cannot fit; preserve current capacity guard semantics.

## 11. Repeat placement

Implement inside the shared placement-preview lifecycle rather than re-opening Quick Actions.

Critical edge cases:

- intent lifecycle (`PlacementPreviewLifecycle`) must still terminate exactly once,
- repeat only remains active after a successful commit,
- failure/cancel does not accidentally place another object,
- per-kind yaw state should remain intuitive (normally preserve current rotation),
- current aim/site/requirements are re-resolved next frame,
- inventory/material depletion naturally updates the preview state.

Palisade is the primary acceptance case; do not force repeat behavior on all placeables by default.

## 12. Fire preview footprint

Current `placementPreviewActions.resolvePreview()` sends `fireSimple`, `firePit`, `firePile` to one `previewFire()` callback. Keep the shared lifecycle but provide per-kind read-only footprint/validation where actual dimensions differ.

This is presentation-only. Do not fork the fire placement mutation system.

## 13. Quick Actions P0 capability issue

The review found well/garden rows could appear actionable while `placementActions.ts` silently returned for missing digging capability.

When touching these rows:

- cheap global availability should include required capability,
- missing specialist capability follows the product visibility policy,
- actual site/material authority remains the placement preview,
- mutation should produce an explicit existing capability-needed feedback where an obvious/basic action remains visible and is attempted.

Do not combine `!hasCapability || isActionBlocked` into one silent return where the player needs a reason.

## 14. Suggested implementation order

1. Extend read-only placement state/requirements contract and tests.
2. Wire authoritative material requirements + house preparation state.
3. Add garden/trap preview and fire/front-marker polish.
4. Finish `InteractionView` construction cases.
5. Extend `WorldInspection` to camp/trough and correct action availability.
6. Add safe removal/confirmation/recovery.
7. Implement continuous construction-work orchestration + Busy cancel UX + inspection-close transition.
8. Add repeat placement mode.
9. Update state docs and run automated verification.

This order keeps early changes read-only and makes the continuous-work slice consume already-correct availability/action presentation rather than solving both at once.

## 15. Tests / files likely to move

High-confidence test surfaces:

- `src/items/constructionMaterials.test.ts`
- `src/app/inspection/buildWorldInspection.test.ts`
- existing placement/placement-preview action tests adjacent to `src/app/actions/`
- `src/interaction/interactionView` tests
- `busyAction` tests only if its generic contract is actually extended

Likely production files:

- `src/app/actions/placementActions.ts`
- `src/app/actions/placementPreviewActions.ts`
- `src/world/placementPreview.ts`
- `src/interaction/interactionView.ts`
- `src/app/inspection/inspectionTarget.ts`
- `src/app/inspection/worldInspectionView.ts`
- `src/app/inspection/buildWorldInspection.ts`
- `src/app/actions/inspectionActions.ts`
- `src/ui-vue/screens/BusyOverlay.vue`
- placement preview overlay component/store wiring
- Quick Actions presentation/wiring touched only to remove duplicated cost/availability strings and route garden/trap through preview
- relevant world collections only for missing removal seams

Do not treat this list as permission for broad refactors; verify each call-site before editing.

## 16. Documentation discrepancy to fix after implementation

`docs/state/player-systems.md` currently states that `PlacementPreviewActions` covers chest/tent/fires/torch/palisade/bedroll/platform/well/work-contract/houses and describes house-only front marker. After this plan it must mention garden/traps, three-state requirements/preparation behavior and continuous/cancellable construction work if implemented.

The same state doc currently describes Busy channels as short fixed real-time channels; preserve that generic statement but document the construction orchestration exception accurately rather than pretending BusyAction itself became world-time aware.

## 17. Browser verification

Agent does not browser-verify. Leave a manual checklist for the user. Automated tests/build are agent responsibility.
