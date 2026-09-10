# UX Review: Building, Placement, Construction & Repair

**Reviewed:** 2026-09-10  
**Model:** Claude Code — Opus  
**Scope:** focused code recon/review; no implementation; no browser verification; `pnpm docs:sync` not run.  
**Recon:** [building-placement-construction-repair-ux-recon.md](./building-placement-construction-repair-ux-recon.md)  
**Related:** [interactions & targeting UX review](./2026-09-10--interactions-targeting-ux-review.md), [items & inventory UX review](./2026-09-10--items-inventory-equipment-ux-review.md)  
**Verified against:** `main` @ `3efae2d`, including shipped `ui-input-014`, `ui-input-015`, `items-player-017`, `items-player-022`.

## Executive summary

The build lifecycle has a genuinely good spine. `GroundPlacementDefinition` + `previewGroundPlacement` (`src/app/actions/placementActions.ts:234-276`) make preview and commit share one evaluation, `placementPreviewActions.ts` is one aim/ghost/rotate/confirm mode for 15 buildable kinds, `contributeWork(id, amount)` is an identical actor-neutral seam on palisade/torch/trough/house/terrain-prep, and `buildWorldInspection.ts` is a clean read-model that Vue only renders. `items-player-022` landed the composite camp target, the house entrance chevron and touch rotate buttons; `ui-input-015` landed `InteractionView` with slots and reasons.

The problems are almost all at the **edges of that spine**, and they cluster into three themes:

1. **The preview knows about geometry, never about cost.** `PlacementPreviewResult` carries `valid`/`reasonLabel` derived only from terrain/blockers/peers. Materials, tools and stage costs are checked *after* confirm, in the mutation. The player aims a green ghost, presses `[E]`, and finds out then — or, for wells and gardens, finds out nothing at all.
2. **Two parallel inspect/repair front-ends.** `[V]`/`WorldInspection` covers well, palisade, torch, house, terrain-prep. Camp (tent/bedroll/platform) uses `[R]` into `openLodgingPanel`. Trough is a construction with `contributeWork` and no inspection at all. The two front-ends have opposite quality gaps: `WorldInspection` under-reports blocked reasons, the camp panel reports them well but is on the wrong key.
3. **Destruction is cheap and silent, removal is arbitrary.** `[R]` cancels a partly built house or deletes a finished palisade segment in one keypress, with no confirmation and no statement of what comes back — while a misplaced standing torch, trough, well, bedroll or platform can never be removed at all.

**No P0 that makes the game unplayable, but one P0 dead end:** building a well or a garden plot without a shovel is a completely silent no-op.

Counts: **1 P0**, **6 P1**, **7 P2**, **4 P3**, plus 4 implementation/architecture items kept separate below.

## Answers to the recon questions

| Question | From code |
| --- | --- |
| Can the player understand what will be built and where/how oriented before confirming? | Where: yes — footprint ghost is shape-accurate (`{kind:'box',width,depth}` from the real footprint) and follows aim. How oriented: only for houses; the entrance chevron is hard-coded to `smallHouse`/`mediumHouse` (`placementPreviewActions.ts:310`) while tent/bedroll/platform/chest also rotate. What: only a label — no cost, no work estimate, no "you have / you need". |
| Is invalid placement explained clearly enough to correct it? | Yes for geometry (`RESIDENTIAL_PLACEMENT_MESSAGE`, `PALISADE_PLACEMENT_MESSAGE`, … are specific and actionable). No for everything else: a missing material or tool never makes the ghost red — it makes the confirm fail. |
| Is required material/work progress visible at the right time? | Progress: yes, well done — `x/y h` in the prompt, progress bars + "pozostała praca" + total-vs-stage in `[V]`. Materials: no — the Quick Actions cost strings are hard-coded literals, the ghost shows nothing, and `[V]` shows the current stage's requirement without saying whether you have it. |
| Are unfinished and completed structures visually and interactively distinct? | Yes. `palisadeVisualScaleY` / `standingTorchVisualScaleY` / `playerTroughVisualScaleY` scale with progress; houses swap a per-stage mesh; prompts and `[V]` status rows differ. This is the strongest part of the lifecycle. |
| Is `[V]` inspection useful and consistent with E/R actions? | Useful where it exists, and `ui-input-014`'s "no inspection → no prompt" rule is respected. Not consistent: camp inspection is on `[R]`, the trough has no inspection, and `[R]` means "inspect" on a camp but "destroy" on a palisade/house. |
| Does repair expose what is damaged, what is required and what the result will be? | For camp: yes — `describeCampRepair` gives mode/canAct/reasonLabel/description and the panel renders all four. For the well roof: yes. For everything else: there is nothing to repair — palisade, torch, trough and house have no condition at all, and nothing tells the player which structures decay. |
| Do all buildables use shared placement/work/condition/repair mechanisms? | Placement: 15 of 17 do; garden plots and traps bypass the preview entirely. Work: yes, `contributeWork` is uniform (the well's `addWork` is the one naming outlier). Condition/repair: only tent/bedroll/platform (`campRepair.ts`) and the well roof, over the shared `world/repair.ts` + `world/condition.ts`. |

---

## P0 — blocker

### 1. Building a well or a garden plot without a shovel is a silent dead end

**UX problem:** "Budowa → Zbuduj studnię" is always enabled. Clicking it enters the placement preview, the ghost is green on any valid ground, the confirm button is enabled, `[E]` exits the preview — and nothing happens. No toast, no error, no state change. The player has no way to learn that a digging tool is required. "Zbuduj grządkę" is the same, without even a preview (it commits instantly on click).

**Why:** both mutations open with a combined guard that returns silently:

- `src/app/actions/placementActions.ts:588` — `if (!inventory.hasCapability('soil_digging') || isActionBlocked(ctx)) return`
- `src/app/actions/placementActions.ts:826` — `if (!inventory.hasCapability(GARDEN_CAPABILITY) || isActionBlocked(ctx)) return`

The silent-return convention is correct for `isActionBlocked` (a busy channel already owns the screen), but it swallows the capability failure with it. Meanwhile the Quick Actions rows are pushed with no `disabled` flag at all — `src/ui-vue/screens/QuickActionsScreen.vue:225,227` — even though `ui.quickActions.hasDiggingTool` already exists and already gates the whole `Łopata` and `Teren` categories (`QuickActionsScreen.vue:285-286`).

Every other buildable in the same list is gated: `hasChest`, `hasTent`, `hasWoodenTorch`, `hasPalisadeMaterial`, `hasTroughMaterial`, `hasBedrollMaterial`, `hasPlatformMaterial`, `fireAvailability.*`. Wells and gardens are the two that were missed.

**Affected:** `src/ui-vue/screens/QuickActionsScreen.vue:225,227`, `src/app/actions/placementActions.ts:588,826`, `src/app/createApp.ts` (`syncQuickActionAvailability`).

**Recommendation:** two one-line-class fixes on existing seams.
1. Add `disabled: !ui.quickActions.hasDiggingTool` to both rows — the flag is already synced.
2. Split the guards so the capability branch emits the existing `CAPABILITY_NEED_LABEL` toast the well *work* path already uses (`placementActions.ts:636-641` — `Potrzebujesz ${CAPABILITY_NEED_LABEL[...]}`), and keep the bare `return` only for `isActionBlocked`.

Prefer both: the disabled row prevents the dead end, the toast covers a shovel dropped between opening the menu and confirming.

---

## P1 — confusing

### 2. The placement ghost validates the ground but never the cost

**UX problem:** The ghost is green and the confirm button is enabled whenever the *site* is legal. Materials, tools and inventory space are not part of that judgement. The failure arrives as an error toast after the player has already committed to a spot:

- palisade — `Potrzebujesz: 2× belka.` (`placementActions.ts:1297-1302`)
- trough — `Brakuje materiałów na koryto.` (`:1156`)
- standing torch — `:1058`
- bedroll / platform — `:1416-1421`, `:1486-1491`
- house — nothing on placement (materials are charged per stage later)

This is worse than it looks because material availability is **position-dependent**: `hasMaterial()` counts inventory *plus* dropped items within `CONSTRUCTION_MATERIAL_RADIUS = 3` of the site (`src/items/constructionMaterials.ts:11,52-64`). Moving the ghost two metres can flip affordability, and the preview is exactly the screen where that would be legible.

**Affected:** `src/app/actions/placementPreviewActions.ts:35-40` (`PlacementPreviewUiView`), `:299-320` (`tick`), `src/ui-vue/screens/PlacementPreviewOverlay.vue`, `src/app/actions/placementActions.ts:205-214` (`PlacementPreviewResult`).

**Recommendation:** extend the existing preview contract rather than adding a second validator. `PlacementPreviewResult` already flows site → ghost → UI every frame; add an optional `requirements: readonly { label, count, available }[]` filled by each `preview*Placement` from its own requirement constant via `hasMaterial(inventory, droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r)` — the same read-only helper the commit already calls, so the two can't disagree. Render it in `PlacementPreviewOverlay.vue` beside the label, satisfied vs missing.

Keep `valid` meaning "the site is legal" (the commit must still re-validate; `placementPreviewActions.ts:22-25` is explicit about never trusting a cached preview). Whether a missing material should also disable confirm is a design call — showing it is the part that is unambiguously missing.

### 3. Availability flags check the wrong requirement, and the wrong inventory

**UX problem:** Two systematic mismatches between what a Quick Actions row *says* and what it *gates on*:

- **Partial cost.** "Postaw pochodnię" shows `cost: '1× belka, 1× pochodnia'` but is disabled by `hasWoodenTorch` alone — `inventory.has('wooden_torch', 1)` (`src/app/createApp.ts:694`), while `STANDING_TORCH_MATERIAL_REQUIREMENTS` is `beam 1 + wooden_torch 1` (`src/world/standingTorch.ts:77-80`). A player with a torch and no beam gets an enabled row, a green ghost, and a failure toast.
- **Inventory-only check.** Every `hasXMaterial()` flag is `REQUIREMENTS.every((r) => inventory.has(r.kind, r.count))` (`createApp.ts:672-682`), but the build itself accepts nearby dropped items. A player standing on a pile of twenty beams sees "Postaw segment palisady" greyed out even though the build would succeed.

Both directions are wrong in a way the player cannot reason about: sometimes an enabled button fails, sometimes a disabled button would have worked.

**Affected:** `src/app/createApp.ts:668-694`, `src/ui-vue/screens/QuickActionsScreen.vue:213-224`.

**Recommendation:** make each flag read its own requirement list in full (`STANDING_TORCH_MATERIAL_REQUIREMENTS.every(...)` for the torch). For the dropped-item half, the honest fix is finding #2: once the preview shows per-requirement availability at the aimed site, the menu flag can stay a cheap inventory-only hint and the preview becomes the authority the player actually reads. Do not push a positional scan into `syncQuickActionAvailability` — it runs on every inventory mutation and has no site to scan around.

### 4. `[R]` destroys hours of work in one keypress, with no confirmation and no stated recovery

**UX problem:** On an unfinished house `[R]` is `Anuluj budowę` and executes immediately (`src/app/gameLoop.ts:1704` → `placementActions.ts:1680`). On a palisade segment `[R]` is `Usuń` and executes immediately, **whether or not it is finished** (`gameLoop.ts:1694` → `:1348`). The `[V]` panel offers the same two as `variant: 'danger'` buttons that also fire on first click (`src/app/actions/inspectionActions.ts:104-145`; `InspectionActions.vue` has no confirm step).

Three compounding problems:

- **No confirmation.** A medium house is 13 work-hours and 30 materials across three stages. One `[R]` while aiming at it ends that.
- **Silent partial loss.** `cancelResidentialBuilding` recovers only the *current* stage's requirements, and only if `materialsSupplied` (`:1684-1686`). Everything spent on completed stages, plus every hour of work, is gone. The player is told `Anulowano budowę chaty.` and nothing else. Palisade returns `PALISADE_RECOVERY_RATE = 0.5` — also never stated anywhere in the UI.
- **`[R]` is overloaded across the domain.** On a camp `[R]` inspects, on a well `[R]` fills a container or opens the repair dialog, on a trap `[R]` collects, on a house/palisade `[R]` destroys. `ui-input-015` deliberately kept existing `[E]/[R]` bindings, so the labels are honest — but a player who has learned "R is the safe second action" is one keypress from losing a build.

**Affected:** `src/app/gameLoop.ts:1690-1704`, `src/app/actions/placementActions.ts:1348-1366,1680-1698`, `src/app/inspection/buildWorldInspection.ts:351-372,530-537`, `src/ui-vue/components/inspection/InspectionActions.vue`.

**Recommendation:** reuse the confirm pattern that already exists for paid lodging — `openLodgingPanel`'s `LodgingChoiceAction` list is exactly a "here is what happens, confirm or back out" panel, and `restActions.ts` already builds one with enabled/reason per action. Route the destructive path through it, or add a two-step arm to `InspectionAction` (`variant: 'danger'` is already a distinct field, so the confirm can be generic and stay in `InspectionActions.vue` without a per-target dialog).

Independently, and cheaply: put the recovery into the label and the toast. `computeMaterialRecovery` is already pure and already called before any state is touched (`placementActions.ts:1351-1355`) — its result can be rendered as `Usuń (odzyskasz 1× belka)` and as a `materials` row in `[V]` using the existing `materialItems()` formatter.

### 5. Camp inspection and repair live on a different key and a different panel from every other structure

**UX problem:** `ui-input-014` established `V = inspect / details` and `ui-input-015` re-affirmed it, with `inspectionTargetRef()` as the single authority for whether the `[V]` prompt and the mobile inspect button appear. Camp is outside that contract:

- The composite camp target from `items-player-022` prompts `[E] Odpocznij · [R] Zbadaj` (`src/app/interactables.ts:523`). Standalone bedroll/platform prompt `[E] Zbadaj …` (`:536`, `:547`).
- None of `camp`/`tent`/`bedroll`/`platform` is in `inspectionTargetRef()` (`src/app/inspection/inspectionTarget.ts:10-22`), so `[V]` on your own camp does nothing and the touch inspect button never appears for it.
- The panel is `openLodgingPanel`, not `WorldInspection` — a different layout, different action rendering, different close affordance (`restActions.ts:699-732`).

So the player learns `[V]` at a palisade, walks to their tent, and `[V]` is dead. Then they learn `[R]` at the tent, walk to a palisade, and `[R]` deletes it (finding #4).

**Affected:** `src/app/interactables.ts:511-550`, `src/app/inspection/inspectionTarget.ts:10-22`, `src/app/actions/restActions.ts:699-778`, `src/app/gameLoop.ts:1539-1548`.

**Recommendation:** the camp panel's *content* is good and should not be rebuilt — `describeCampRepair` returning mode/canAct/reasonLabel/description is the best repair affordance in the codebase. What needs to move is the channel. Add `camp`/`bedroll`/`platform` cases to `inspectionTargetRef()` and a `buildCampInspection()` alongside the existing five builders in `buildWorldInspection.ts`, feeding it the already-resolved `CampRestSnapshot` + `campInspectionRepairTargets()` and mapping each component to `InspectionSection` rows plus `InspectionAction`s. Keep `[E] Odpocznij` where it is. `ui-input-014` explicitly anticipated this ("mechanizm ma być rozszerzalny później na inne inspectable world objects bez tworzenia równoległych systemów UI") — the parallel system is what exists today.

If the composite-camp panel must stay on `[R]` for now, at minimum add the `[V]` prompt for it so the third channel is never dead on a player-owned structure.

### 6. `WorldInspection` actions claim to be available when they are not

**UX problem:** `InspectionAction` carries `enabled` + `reasonLabel` and `InspectionActions.vue` renders the reason under a disabled button — a good contract. Only the well uses it:

| Target | `work` action | Reason surfaced |
| --- | --- | --- |
| well | `enabled: workView?.canWork ?? false` | yes, from `describeWellWork` |
| palisade | `enabled: true` | no |
| standing torch | `enabled: true` | no |
| house | `enabled: usefulRemaining > 0` | `reasonLabel: ''` |
| terrain prep | `enabled: remaining > 0` | `reasonLabel: ''` |

`Dostarcz materiały` on a house is the sharpest case: `enabled: true, reasonLabel: ''` unconditionally (`buildWorldInspection.ts:506-513`), while the handler behind it computes the exact missing list and reports it as an error toast (`placementActions.ts:1636-1647`). The panel already displays the stage's requirements one row above — it has the inventory in `lookup.inventory` and it still cannot say "you have 4 of 6 beams".

The same panel does this well for `Zleć pomoc` (`'Brak pracy do zlecenia.'`, `'Najpierw dostarcz materiały bieżącego etapu.'`), so the inconsistency is visible within a single screen.

**Affected:** `src/app/inspection/buildWorldInspection.ts:351-372,404-436,490-535`, `src/ui-vue/components/inspection/MaterialsSection.vue`.

**Recommendation:** two changes on the read-model, no new domain rules.
1. Give `InspectionMaterialItem` an `available: number` (or `satisfied: boolean`) and fill it in `materialItems()` from `lookup.inventory` — extend `WorldInspectionLookup` with the site coordinates so it can use the same `hasMaterial(...)` the commit uses, including nearby dropped items. `MaterialsSection.vue` then renders `4 / 6 × belka`.
2. Derive `supplyMaterials.enabled`/`reasonLabel` from that same computation, and give palisade/torch a `describe*Work`-shaped helper next to their domain module (mirroring `describeWellWork`) so `enabled` stops being a literal `true`.

### 7. A house on a slope has a documented escape hatch the player can never reach

**UX problem:** Aiming a house at sloped ground turns the ghost red with `Teren jest zbyt stromy. Najpierw przygotuj teren (Szybkie akcje → Przygotuj teren).` The message is actionable but the flow behind it is rough, and there is a second, better flow in the code that is unreachable:

- `placeHouseAtAim` has a `reason === 'slope'` branch that *auto-creates a covering terrain-preparation site* sized to the house footprint via `coveringPreparationSize()` and toasts `Rozpoczęto przygotowanie terenu — podejdź do znacznika, by pracować.` (`placementActions.ts:1554-1596`).
- That branch is dead. Houses are only ever placed through the shared preview, and `confirm()` returns early unless `lastResult?.valid` (`placementPreviewActions.ts:290`), while `previewGroundPlacement` sets `valid = reason === 'ok'` (`placementActions.ts:270`). A slope is never `ok`, so `placeSmallHouseAtAim`/`placeMediumHouseAtAim` are never called with a slope reason. Confirmed: `placementPreviewActions.ts:231,240` are their only call sites.
- The manual path the message points at requires the player to size the prep themselves. The preview starts at size 2 (`terrainPreparationActions.ts:206`) while a small house needs 4 and a medium 6 (`COTTAGE_4X4_A` / `COTTAGE_6X4_A` through `coveringPreparationSize`). Nothing tells them that, and an undersized prep leaves the site still `slope`.
- The `Teren` category is only visible with a digging tool (`QuickActionsScreen.vue:286`). Without a shovel the message names a menu entry that does not exist for that player.

**Affected:** `src/app/actions/placementActions.ts:1554-1620`, `src/app/actions/placementPreviewActions.ts:289-296`, `src/world/residentialBuilding.ts:149-155`, `src/app/actions/terrainPreparationActions.ts:206`, `src/ui-vue/screens/QuickActionsScreen.vue:286`.

**Recommendation:** pick one of the two designs and delete the other; do not leave both. The auto-prep branch is the better UX and already sizes itself correctly — reaching it needs the preview to distinguish "invalid" from "needs preparation", e.g. a third state on `PlacementPreviewResult` that keeps the ghost amber, relabels confirm (`Przygotuj teren [E]`) and lets `confirm()` through to the existing branch. If instead the manual path is intended, drop `tryStartHouseTerrainPrep` and make the message carry the required size (`Przygotuj teren 4 × 4 m`) and account for the missing-shovel case.

---

## P2 — friction

### 8. Building anything is a long sequence of identical presses with no batching

A small house is 8 work-hours at `RESIDENTIAL_BUILDING_WORK_SESSION_HOURS = 1`, plus 3 material deliveries — **11 separate interactions**. A medium house is 16. A palisade run of ten segments is ten trips through Quick Actions → Budowa → Postaw segment palisady, because `confirm()` calls `exit(false)` and leaves preview mode after a single placement (`placementPreviewActions.ts:289-296`).

Each bout is only 4–8 real seconds, so this is not a time cost — it is a *press* cost, and there is no "work until done", "work until out of stamina", or "place another" affordance anywhere.

**Affected:** `src/app/actions/placementPreviewActions.ts:289-296`, `src/world/residentialBuilding.ts:141-142`, `src/world/palisade.ts:95-103`.

**Recommendation:** the cheapest real improvement is a repeat mode in the shared preview: on confirm, if the player holds a modifier (or a `Postaw kolejny` toggle in `PlacementPreviewOverlay.vue`), re-enter the same kind instead of exiting. The lifecycle hooks (`PlacementPreviewLifecycle`) already distinguish intent-driven placements that must exit, so the change is contained. For work bouts, an auto-repeat that re-arms `busy.start` while the target is unfinished, the player is still in range and stamina allows it, would fold 8 presses into 1 without changing any simulation semantics — but that is a design decision, not a defect.

### 9. Starting work from `[V]` hides the progress bar behind the inspection modal

Pressing `Buduj dalej` inside the inspection panel starts the busy channel and the panel stays open (`inspectionActions.ts:145` refreshes rather than closes). `BusyOverlay` is `z-[12]` (`src/ui-vue/screens/BusyOverlay.vue:8`); `WorldInspectionScreen` is `z-20` with `bg-panel-backdrop backdrop-blur-[2px]` (`WorldInspectionScreen.vue:15`). The progress bar renders *underneath* the blurred backdrop.

Meanwhile `activeModal()` returns `'busy'` before `'inspection'` (`src/app/modalState.ts:55,63`), so input is in busy mode while the screen shows a frozen inspection dialog. Escape cancels the bout (`src/ui-vue/App.vue:38` — `abortBusy()` runs before `closeTopOverlay()`), which is correct but means Escape does something other than what the visible modal implies.

**Recommendation:** close the inspection panel when an action starts a busy channel — `runAction` already knows which ids do (`work`, `repair`, `supplyMaterials`, `ignite`), and `inspectionActions.close()` exists. Re-opening after the bout is optional; the world `[E]` path already handles repeated work fine.

### 10. Cancelling a work bout is undiscoverable, and impossible on touch

Escape cancels a construction bout and credits the elapsed fraction (`abortBusy` → `busy.cancel()` → the `creditPartial` callbacks in `placementActions.ts`). Nothing says so: `BusyOverlay.vue` renders only a label and a bar — no `Anuluj [Esc]` hint, unlike `PlacementPreviewOverlay.vue` and the lodging walk overlay, which both carry one.

On touch it is worse: `touchControls.setInputEnabled(...)` is false while busy (`gameLoop.ts:867-869`) and `TouchChrome.vue` has no abort control at all. A mobile player who starts a 13-hour house build has no way out of any individual bout.

**Recommendation:** add the same `Anuluj [Esc]` affordance `PlacementPreviewOverlay.vue` uses to `BusyOverlay.vue`, as a real button so it works on touch. `abortBusy` is already exposed through the store (`configureAbortBusy`), so this is presentation only.

### 11. Removal is available for two buildables and impossible for six

`PlacementActions` exposes `removePalisadeSegment` and `cancelResidentialBuilding`. There is no equivalent for a **standing torch**, **player trough**, **player well**, **bedroll** or **platform**. `restActions.ts` can pack a tent (`packTent`) but `inspectBedroll`/`inspectPlatform` offer only repair and close (`restActions.ts:737-778`).

So a bedroll placed one metre off (3 hides) or a platform in the wrong spot (6 branches) is permanent world litter, and a well started on the wrong side of a hill can never be undone. This is the same class of surprise as finding #4 from the other direction: the player cannot predict which of their buildings are reversible.

**Recommendation:** the generic seam already exists — `computeMaterialRecovery` / `canReceiveRecovery` / `applyRecovery` in the recovery helpers, used by both current removers, plus each collection's `remove(id)`. Adding removal to the remaining kinds is mostly wiring, and once finding #4's confirm step exists it can carry the recovery statement uniformly. Whether a *completed* well or house should be removable is a design question; unfinished ones clearly should be.

### 12. The "materials can come from the ground nearby" rule is invisible

`hasMaterial`/`consumeMaterial` accept dropped items within `CONSTRUCTION_MATERIAL_RADIUS = 3` of the site (`src/items/constructionMaterials.ts:11`). This is a good rule — it means you can haul beams to a site in trips instead of carrying 30 at once — and nothing in the game mentions it. The failure toast says `Potrzebujesz: 2× belka.` whether the beams are absent or lying four metres away.

**Recommendation:** finding #2's per-requirement availability line is the natural place: showing `2 / 2 × belka` while the ghost sits next to a pile teaches the rule without a tutorial. Splitting the source in the display (carried vs. nearby) would teach it faster still.

### 13. Garden plots and traps bypass the shared placement preview

Every other placeable goes through `startPlacementPreview(kind)`. `Zbuduj grządkę` calls `onBuildGarden` (`QuickActionsScreen.vue:226` → `placeGardenAtAim`) and traps call `onPlaceTrap(kind)` — both commit instantly at a fixed offset ahead of the player with no ghost, no rotation and no validity feedback until the error toast. Gardens have a footprint and a separation rule (`GARDEN_FOOTPRINT_RADIUS`, `GARDEN_SEPARATION`) that the player never sees.

**Recommendation:** `placeGardenAtAim` already builds the same `evaluateGroundPlacement` call the definitions use; extracting a `gardenPlacementDefinition()` and adding a `'garden'` entry to `PlacementPreviewKind` would follow the existing pattern exactly. Traps are a smaller object and arguably fine as instant placement, but they should then be consistent with each other rather than with nothing.

### 14. Which structures decay is unknowable

Condition and repair exist only for tent, bedroll, platform (`items/campRepair.ts`) and the well roof (`world/playerWell.ts`). Palisade, standing torch, trough, house and garden have no `condition` field at all. The inspection panels reflect this honestly — well and camp show `Stan: N / 100`, the others show nothing — but the *absence* of a row is not a message. A player who has learned that their tent rots has no way to know their palisade never will, or whether their house needs maintenance.

`LOOSE-ENDS.md:16` already records that generic settlement-building repair is missing and needs its own plan, so this is known at the domain level. The presentation half is cheap and separable.

**Recommendation:** where a structure genuinely has no condition, say so once — a `Stan: nie niszczeje` info row in `[V]` costs one line in each builder and removes the ambiguity. Do not add condition fields to structures just for symmetry; that is a design decision with save-schema consequences.

---

## P3 — polish

### 15. The entrance marker is hard-coded to houses

`ghost.setEntranceMarker(active === 'smallHouse' || active === 'mediumHouse')` (`placementPreviewActions.ts:310`) sits three lines away from `SUPPORTS_ROTATION`, an explicit per-kind table added by `ui-input-012` precisely so capability is not inferred from footprint kind. Tent, bedroll, platform and chest are all rotatable box footprints with a meaningful front, and none gets the chevron. A tent's door direction is invisible in the preview.

**Recommendation:** promote it to a `SHOWS_ENTRANCE_MARKER: Record<PlacementPreviewKind, boolean>` table beside `SUPPORTS_ROTATION`. `placementEntranceMarkerLocalZ()` and the local `-Z` front convention already generalise.

### 16. Progress is a single bar with no attribution

`buildContractSection` reports `Wykonane przez NPC: N h` when a work contract exists, which is good. The `Postęp pracy` bar above it does not distinguish player hours from NPC hours, and with no contract there is no attribution at all — a player who hired help and then worked themselves cannot see the split. Minor, but the data is already on the record.

### 17. Fire pit and wood pile share the fire's ghost

`resolvePreview` maps `firePile`, `firePit` and `fireSimple` all to `previewFire()` (`placementPreviewActions.ts:210-213`). The label differs, the footprint does not, so a wood pile previews at a campfire's size. Cosmetic, but the shared-preview architecture makes a per-kind footprint nearly free.

### 18. The ghost is a flat footprint, never a volume

For a 6×4 house the outline tells the player where the walls land but nothing about height, roof line or how it will sit against a slope. This is a deliberate and reasonable scope choice (`placementPreview.ts` is explicit about being pure rendering with prebuilt geometry), and a wireframe box at the definition's height would stay inside that constraint if house placement ever proves hard to judge in the browser.

---

## Implementation / architecture problems (not UX)

### A. Quick Actions cost strings are hand-written duplicates of domain constants

`QuickActionsScreen.vue:213-224` hard-codes `'2× belka'`, `'3× skóra'`, `'6× gałąź'`, `'1× belka, 1× pochodnia'`. The authoritative values live in `PALISADE_MATERIAL_REQUIREMENTS`, `BEDROLL_MATERIAL_REQUIREMENTS`, `PLATFORM_MATERIAL_REQUIREMENTS`, `PLAYER_TROUGH_MATERIAL_REQUIREMENTS`, `STANDING_TORCH_MATERIAL_REQUIREMENTS`. They happen to match today; nothing keeps them matching.

Two formatters for the same shape already exist and are both unused here: `formatCostItems()` (`src/ui-vue/playerQuickActions.ts:86`, used by the three fire rows in the same list) and `materialItems()` (`buildWorldInspection.ts:588`). Fold the requirement lists through one of them.

The two houses have `cost: ''` — the only rows in the list with no cost at all, and the most expensive things in the game. Their total is derivable (`residentialBuildingDefinition(kind).stages`), and nowhere in the UI is it shown: `[V]` shows only the current stage's requirement.

### B. `tryStartHouseTerrainPrep` is unreachable (see finding #7)

Dead branch reachable only through a call path that no longer exists. Either wire it or remove it — leaving it makes the next reader believe houses auto-prepare terrain.

### C. `buildInteractionView` still parses prompt strings for most buildables

`ui-input-015` §2 said the prompt string must stop being the authority for available inputs, and the plan explicitly framed the migration as incremental. Today `playerWell`, `standingTorch`, `dig` and `cart` have real cases; `palisade`, `residentialBuilding`, `playerTrough` and `terrainPreparation` fall through to `parseLegacyPrompt()` + the `STATUS_ONLY_RE` Polish-text heuristic (`src/interaction/interactionView.ts:35,49-66,246-283`).

That is the mechanical cause of finding #6's world-side twin: a house blocked on materials still renders an enabled `Dostarcz materiały` prompt, because `isResidentialBuildingMaterialBlocked` is never consulted by the view. Finishing the migration for the four construction kinds is the highest-value remaining slice of `ui-input-015`, and each needs the same `describe*` helper finding #6 asks for — so the two share one fix.

### D. Naming drift on the work seam

`Palisades`, `StandingTorches`, `PlayerTroughs`, `ResidentialBuildings` and `TerrainPreparations` all expose `contributeWork(id, amount) → { acceptedWork, completed }`. `PlayerWells` exposes `addWork(id, hours, days)` instead, and construction is advanced through `advanceWellConstruction()`. The well is genuinely different (stage transitions consume materials mid-sequence), but the divergent name makes it look like a different concept when it is the same seam plus a stage machine. Worth a rename or a doc note the next time that file is touched — not worth its own change.

---

## What already works and should not be rebuilt

- **One evaluation for preview and commit.** `GroundPlacementDefinition` + `evaluatePlacementSite` + `previewGroundPlacement` (`placementActions.ts:234-276`) make it structurally impossible for the ghost and the mutation to disagree about a site, and the commit re-resolves rather than trusting the preview. This is the right shape; every recommendation above extends it rather than replacing it.
- **Construction progress readability.** Continuous `scale.y` for palisade/torch/trough, discrete per-stage meshes for houses, `x/y h` in prompts, and stage-vs-total progress bars in `[V]`. A player can tell at a glance what is finished, and precisely how far along everything else is.
- **`WorldInspection` as a pure read-model.** Vue renders a snapshot and routes action ids back; lookups resolve through `ctx.bundle` at call time so a `WorldBundle` rebuild cannot strand a callback (`inspectionActions.ts:56-73`). The gaps in findings #5 and #6 are missing *cases*, not a wrong design.
- **`describeWellWork` / `describeWellRoofRepair` / `describeCampRepair`.** Three existing read-only describe helpers that already produce exactly the `canAct` + `reasonLabel` + `description` triple the rest of the domain is missing. They are the template, not something to invent.
- **`items-player-022`'s composite camp target** collapses tent+bedroll+platform into one Tab/gaze target with per-part repair — the fix in finding #5 is which key opens it, not what it contains.
- **Touch parity in the placement preview.** `PlacementPreviewOverlay.vue` gives rotate/confirm/cancel real buttons and hides the `[F]/[G]` hints on touch. The busy channel (finding #10) is the one place that regressed relative to this standard.

## Suggested order

1. **#1** — smallest change, removes the only true dead end.
2. **#2 + #3 + #12** — one coherent slice: per-requirement availability in the preview, fed by `hasMaterial` at the aimed site; fixes the torch gate and makes the nearby-materials rule visible as a side effect.
3. **#4 + #11** — confirmation and stated recovery for destructive actions, then extend removal to the buildables that lack it.
4. **#6 + C** — `describe*` helpers for palisade/torch/house/terrain-prep, consumed by both `buildWorldInspection` and `buildInteractionView`; retires the legacy prompt parsing for the construction kinds.
5. **#5** — move camp inspection onto `[V]`/`WorldInspection`.
6. **#7** — decide the slope story and delete the losing branch.
