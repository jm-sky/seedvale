# Construction Status, Inspection and Context Actions — Implementation Notes

**Reviewed:** 2026-09-09
**Implemented:** 2026-09-09

## Input

- Desktop: `KeyState.inspect`, `KEY_MAP.KeyV -> inspect`, `EDGE_TRIGGERED`, `consumeInspect()`. Peer of `interact`/`altInteract`; `T`/`E`/`R`/`F` unchanged.
- Modal drain: `gameLoop.ts` always consumes inspect while `activeModal() !== null`, same as interact/altInteract, so a `V` press cannot fire after the overlay closes.
- Mobile: `createTouchControls.ts` writes `keys.inspect = true` from `onInspect`, identical to `onAltInteract`. `TouchChrome.vue` cluster is `[Inspect] [R] [E]`; Inspect uses Lucide `Search`, `aria-label="Sprawdź"`, `v-if="ui.touch.inspectAvailable"`.
- Availability owner: `gameLoop.ts` calls `vueUi.setInspectAvailable(inspectionTargetRef(target) !== null)` for the current gaze target, and forces `false` in the modal branch (including mounted/`target === null` via the world-interaction `else` never running). Not derived from the nearby-interactables list.

## Inspection ownership

- `inspectionTargetRef(target)` (`src/app/inspection/inspectionTarget.ts`) is the availability + stable `{ kind, id }` identity. No `inspectable` flag on `Interactable`.
- `buildWorldInspection(ref, lookup)` (`src/app/inspection/buildWorldInspection.ts`) is the read-model builder. Vue never searches the world; it renders `WorldInspectionView`.
- `createInspectionActions` (`src/app/actions/inspectionActions.ts`) holds the current `InspectionTargetRef`, rebuilds from `ctx.bundle` at open/action/refresh, and routes action ids. Callbacks must not capture `bundle.playerWells` etc. across a rebuild.
- Overlay: `WorldInspectionScreen.vue` + `useOverlayScreen('world-inspection')`. `ActiveModal` includes `'inspection'` (`modalState.ts`). Pointer lock uses the same restore path as FlavorDialog (`createApp.ts`).
- Stale snapshot: actions re-resolve the live record by `kind + id` before mutating. `syncOpenView()` rebuilds while the screen stays open (also after FlavorDialog close, so hire-help creation refreshes the contract section). Missing record → close.

## Per-target domain helpers

- Well: `playerWell.ts` (`WELL_STAGE_ORDER` locally in the builder, `wellStageWorkHours`, `wellRemainingWork`, `isWellWaterAvailable`, `wellWaterSource`, `resolveWellRoofCondition`). Eligibility from `describeWellWork` / `describeWellRoofRepair`. Water source for drink/fill is rebuilt from the live well, not `Interactable.waterSource`.
- Terrain preparation: `terrainPreparationRemainingWork`. Completion removes the marker → inspection closes.
- Palisade: `PALISADE_REQUIRED_WORK`, `palisadeRemainingWork`, `isPalisadeConstructionComplete`. Remove stays `removePalisadeSegment` (material recovery unchanged).
- Standing torch: `STANDING_TORCH_REQUIRED_WORK`, `standingTorchRemainingWork`, `isStandingTorchConstructionComplete`. Ignite still `igniteStandingTorch` with live revalidation.
- Residential: `residentialBuildingRemainingWork` unchanged (Work Contract useful-work). Inspection overall uses `residentialBuildingCompletedWork` / `residentialBuildingTotalRequiredWork` / `residentialBuildingTotalRemainingWork`. Materials are `materialsSupplied` plus current-stage requirements — no partial ledger.

## Water / liquid containers

- Auto-select `[R]` remains `fillWaterskin()`.
- Inspection lists carried `LIQUID_CONTAINER_KIND_LIST` instances and calls `fillWaterContainer(source, instanceId)` (`survivalActions.ts`). Execute-time checks: `isActionBlocked`, undrinkable, rope, instance still carried, `isLiquidContainerInstance`, `canFillLiquidContainer(..., 'water')`, then `Inventory.updateInstance` + `fillLiquidContainer`.

## Work Contracts

- Shared entry: `WorkContractActions.beginHireHelpForTarget(target)` re-resolves live record / position / `residentialBuildingRemainingWork` (not overall remaining) / `hasActiveContract` inside, then `beginContractCreation`. Quick Actions `openHireHelp` now calls that entry per candidate instead of passing snapshot remaining work into create.
- Summary: `WorkContracts.findByTarget` — state, advertisement, requestedWorkerCount, active assignment count (`isAssignmentWorkActive`), reward, committedWork, npcWorkCompleted. No new persistence fields.
- Material-blocked residential: useful remaining is 0 → hire help disabled, same as Quick Actions eligibility.

## Preserved `[E]` / `[R]`

Unchanged, including: unfinished well work / requirements panel; completed well drink / fill / roof-repair FlavorDialog; palisade remove; residential cancel; torch ignite; terrain-prep resume; Quick Actions hire-help, contract list, notice-board posting.

## Tests

- `src/input/Keyboard.test.ts` — V edge, consume, repeat, T/E/R.
- `src/app/inspection/buildWorldInspection.test.ts` — unsupported/missing, well unfinished/completed/repair, liquid containers, contract summary, other construction targets, material-blocked residential.
- `src/world/residentialBuilding.test.ts` — overall vs useful remaining.
- `src/app/actions/survivalActions.test.ts` — selected instance fill, stale id, ocean, full container.
