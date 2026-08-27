# UI/UX Interaction and Action System Polish — Implementation Notes

**Reviewed:** 2026-08-24

## Current-state findings

- The plan is partly stale. Quick Actions are already Vue (`QuickActionsScreen.vue`) with `src/ui/createQuickActions.ts` as a compatibility facade.
- Fire actions already have a shared catalog in `src/ui-vue/playerQuickActions.ts`, consumed by both Quick Actions and Pause → Akcje. Do **not** recreate the plan's proposed `playerActions` catalog for these actions; extend this mechanism or extract a genuinely broader shared contract only if the audit proves it necessary.
- Fire availability is already centralized in `userActions.ts` and mirrored into `ui.quickActions.fireAvailability` by `createApp.ts`. Availability is presentation state; actual action functions revalidate at execution time. Preserve this stale-UI protection.
- Toasts already use the shared Vue store and `ToastStack.vue`; `ToastStack` is currently `z-20`, above the normal HUD/modals (`z-10/11`). Do not introduce another notification layer. Verify stacking against `TimeSkipOverlay`/`BusyOverlay` before changing z-indexes.
- Escape is centralized in `ui-vue/App.vue` and `useOverlayScreen`/`openStack`. New panels should join this stack rather than implement their own global Escape handler.
- Generic interaction already has a strong domain seam: `src/interaction/Interactable.ts`, `findInteractionTarget.ts`, `resolveInteraction.ts`, and `gameLoop.ts`. `Interactable` is a per-frame adapter and owns no lifecycle. Keep simulation/action resolution outside Vue.
- The current generic interaction UI is `FlavorDialog.vue`: prompt while aiming, then a small modal containing `name + line`. A new context panel should replace/extend this presentation, not create a second interaction-resolution path.
- Several interaction kinds intentionally bypass `resolveInteraction()` because they need inventory/player/busy access (`corpse`, `dig`, `deposit`, `tent`, `landPlot`, `dryingRack`, `hive`, `crop`, `container`, `playerWell`, etc.). The new panel must consume the already-resolved action data; it must not infer these rules from object type in Vue.
- Player placement/construction already has reusable semantics in `src/app/actions/placementActions.ts` and `src/items/constructionMaterials.ts`. Player-built wells use `activeWellStage`, `WELL_STAGE_COST`, `hasMaterial`/`consumeMaterial`, busy-channel progress and shared toast feedback. Reuse these contracts for construction UI.
- There is no obvious standalone generic `ConstructionPanel` in the current Vue inventory. Do not invent one around the MegaKit/house-builder systems. First identify the actual player-facing construction flow; the existing player-well staged construction is the clearest current construction UI/domain seam.

## Interaction/context panel

Implement one reusable presentation component/contract for contextual interaction data. Prefer a small view model containing:

- target label/type,
- optional description/flavor text,
- available actions with labels and optional costs/reasons,
- close/back behaviour.

The view model should be produced by the gameplay/application layer from the real `Interactable` target and existing action handlers. Vue should render it only. Avoid a `switch` over every `Interactable.kind` inside a component.

Keep `[E]`/`[R]` and touch interaction semantics in the existing input/game-loop layer. The panel is not a replacement for `pickInGaze`, `buildInteractables`, or `resolveInteraction`.

## Construction

- Reuse `constructionMaterials.ts` as the single material-source abstraction, including nearby dropped material support.
- Reuse existing world-domain costs and stage state (`playerWell.ts`, `activeWellStage`, `WELL_STAGE_COST`, etc.). Never duplicate costs in Vue.
- Reuse `busy` for timed construction work and the shared toast for failures/successes.
- If a generic construction panel is introduced, its data contract should describe requirements and current availability, while execution remains an application/domain callback.
- Do not conflate MegaKit settlement house generation (`constructionCatalog.ts`/`houseBuilder.ts`) with player construction unless the actual audited flow requires it.

## Quick Actions

The current UI is already grouped (`Ogień`, `Łopata`, `Pułapki`, `Sadzenie`, `Czekaj`, `Skrzynia`, `Odpoczynek`). Therefore the plan's "choose grouping/drill-down" work is mostly an **audit/polish**, not a greenfield scalability feature.

Recommended direction:

- keep groups;
- move toward data-driven groups where duplication becomes real;
- keep action availability in application/domain code;
- keep `run()` handlers as the final validation point;
- use toast for transient failure instead of local button-status state;
- avoid adding a second action registry just to make the component generic.

`PauseMenuEntriesActions.vue` already consumes `visibleFireActions()` and therefore no longer has the C8 duplication described in Review 007. Treat C8 as already addressed.

For mobile, the old Review 007 problem remains relevant: `QuickActionsScreen.vue` uses independent fixed offsets and can collide with other touch chrome on short landscape viewports. Prefer a bottom-sheet/sheet-like layout for low `dvh` rather than adding more fixed pixel offsets.

## Toast / overlay stacking

Current architecture already has a central toast stack. Verify the actual stacking context before modifying classes:

- `App.vue` mounts ToastStack before modal components, but ToastStack itself uses `z-20`.
- Modal screens commonly use `z-10`; Pause uses a higher layer; time-skip/busy overlays are explicitly intended to sit above normal UI.
- Keep toasts non-modal and non-blocking.
- Do not make toast participate in `openStack` or Escape handling.
- Replace transient inline action-result text with `showToast()` only where the message is genuinely transient. Persistent validation/help can remain inline.

## Equipment shortcuts — important architectural caveat

The current equipment model is **not** a full equipment-slot system. `HeldTool.ts` explicitly owns one in-hand slot; `Inventory` owns item counts/instances. There is currently no evident `primaryWeapon` / `primaryRangedWeapon` state.

Therefore do not fake these as UI-only refs. If shortcuts require remembered primary melee/ranged choices, introduce the smallest reusable equipment selection state at the player/inventory boundary and make the shortcut resolve through `HeldTool.equip()` (including instance IDs for instance-backed weapons). Keep the selected item derived from `Inventory` and clear/re-resolve it when inventory changes. Do not create a second inventory/equipment model in Vue.

## Merchant UX

`MerchantScreen.vue` already has substantial functionality:

- merchant stock + player inventory columns,
- coin buying/selling,
- barter offer selection,
- quantity controls,
- category/price/sort filters,
- instance-aware sell pricing,
- shared toast feedback,
- responsive/mobile filter collapse and touch scrolling.

Improve this screen incrementally. Do not replace its trade model.

For item preview/stat presentation, derive data from existing item definitions/catalog and instance data (`ITEM_DEFS`, item catalog, `InventoryGroupView`, instance state). Do not add merchant-specific item stats. Keep transaction execution in the existing `ui.merchant.onBuy*` / `onSell*` callbacks.

The requested buy/sell distinction should be a UX clarification of the existing two-column model, not a new economy mode. Keep barter as an existing supported path.

## Likely implementation order

1. Audit current interaction targets + action execution paths and define the shared interaction view model.
2. Extend/replace `FlavorDialog` presentation with the reusable contextual interaction panel while preserving existing domain callbacks.
3. Audit the real player construction flow; connect it to the same panel pattern without moving construction semantics into UI.
4. Polish Quick Actions/mobile sheet and remove only confirmed transient inline feedback duplication.
5. Verify toast stacking; change z-index only if browser evidence shows a real conflict.
6. Add primary weapon/ranged shortcuts only after resolving the missing persistent equipment-slot state at the correct ownership boundary.
7. Incrementally polish `MerchantScreen.vue` using existing trade/item data.

## Pitfalls / dependencies

- Do not assume Review 007 findings are still unresolved. C8 and much of C4/C3 are already partially implemented.
- `QuickActionsFireAvailability.buildGrate` is position-dependent and intentionally re-resolved when the popup opens; retain this convention for other spatial actions.
- Action closures can outlive `WorldBundle` rebuilds; follow the existing pattern of resolving mutable bundle-owned systems at call time rather than capturing replaced instances.
- `Interactable` snapshots are intentionally per-frame and may become stale before button execution. Domain handlers must revalidate target existence/range/materials at execution time.
- Preserve `useOverlayScreen` and the global `openStack` semantics for close/Escape behaviour.
- Preserve `isTouchDevice()` and safe-area handling; do not rely only on width breakpoints for mobile landscape.
- Avoid introducing a global design-system migration. Existing game tokens (`bg-panel`, `bg-panel-backdrop`, `text-ink`, etc.) are the current UI vocabulary.
- Do not duplicate item prices, construction costs, capabilities, availability predicates, or simulation state in Vue.

## Verification focus

Technical checks from the plan remain appropriate. Browser verification should concentrate on the places where current code has real architectural risk: short landscape Quick Actions, interaction target/action freshness, Escape stack ordering, toast vs modal stacking, player-well construction with missing/nearby materials, weapon shortcut state persistence/resolution, and merchant buy/sell/barter flows on small screens.

## Implementation summary (2026-08-27)

**Root causes found by audit (not assumed from the plan text):**

- The reported "Quick Actions covers Merchant" stacking bug was not a simple z-index typo: `QuickActionsScreen.vue` wrapped its open panel in `<Teleport to="body">`, the only `Teleport` anywhere in `src/ui-vue/`. That moved the panel out of `App.vue`'s single `z-10` wrapper and made it a sibling of the whole App tree, painting on top of everything (Merchant, Pause, …) regardless of z-index. No ancestor clipping/transform required the Teleport.
- The reported "uncomfortable horizontal scroll" on mobile Quick Actions was `flex-col flex-wrap` (active below the `lg` breakpoint) wrapping overflow into extra *columns* once vertical space ran out, with only `overflow-y-auto` set (so `overflow-x` computed to `auto` per spec) — an accidental side effect, not an intentional horizontal list; `useTouchScroll` only ever supported vertical drag.
- `TimeSkipOverlay.vue` had no `z-index` class at all despite `App.vue`'s comment claiming it "matches vanilla z-index 12, above pause menu's 11" — a stale/incorrect comment, not enforced in code.
- `ToastStack` (`z-20`) and `MerchantScreen`'s compact mobile transaction drawer (also `z-20`) tied on stacking order — DOM order happened to put the drawer on top, so a toast firing while that drawer is open would have rendered underneath it.

**Implemented:**

- **Stacking fixes**: removed the `Teleport` from `QuickActionsScreen.vue` and lowered its panel to `z-9` (below the shared `z-10` modal tier, above `z-8` HUD chrome) so any real modal screen always wins visually/interactively; added `z-[12]` to `TimeSkipOverlay.vue`; bumped `ToastStack` to `z-30`, a dedicated topmost tier above every other layer including Merchant's drawer.
- **Quick Actions mobile scroll**: panel is now always `flex-nowrap` (single column, matching what already worked on desktop) with explicit `overflow-x-hidden` and `overscroll-contain`, eliminating the accidental horizontal surface instead of trying to add gesture support to it.
- **Prepare Terrain controls**: `terrainPreparationActions.ts` now exposes `growSize`/`shrinkSize`/`raiseHeight`/`lowerHeight`/`confirmPreview` (the same logic the `[+/-]`/`[,/.]`/`[E]` keyboard path already ran, refactored so both paths call the same functions — a cached `lastPreviewState` lets a button-triggered confirm reuse the frame's already-computed validity instead of recomputing it). Wired through `store.ts`'s `configureTerrainPreparationControls` (mirrors `configureAbortTerrainPreparation`) and `mount.ts`'s `FORWARDED_FNS`. `TerrainPreparationOverlay.vue` now renders explicit `−`/`+`, `,`/`.`, "Zatwierdź [E]" and "Anuluj [Esc]" buttons on both desktop and mobile (same component, no device gating) — previously 100% keyboard/wheel-only with zero buttons anywhere, confirmed by audit.
- **Interaction/construction panel**: `FlavorDialogState` gained an `actions: readonly InteractionPanelAction[]` field (`{label, enabled, reasonLabel, run}`) and `openFlavorDialog(name, line, actions?)` takes an optional actions array; `FlavorDialog.vue` renders a button per action (disabled + reason shown when `!enabled`) when present, unchanged for the many existing flavor-only callers that pass none. Wired to one flagship case: `placementActions.ts` gained a read-only `describeWellWork(id)` (mirrors every check `workOnWell` itself runs — capability, stage transition, `hasMaterial` — without mutating anything). `[E]` on a player well keeps firing/continuing work exactly as before (deliberately unchanged, to not add a click of friction to the repeated-press build loop); the new `[R]` opens the panel showing requirements/current availability with a "Buduj" action that calls the same `workOnWell(id)`. `wellPromptLabel()` now hints `· [R] wymagania` (test expectations in `playerWell.test.ts` updated to match).
- **Equipment shortcuts**: new `src/items/primaryWeapons.ts` (`createPrimaryWeaponSelection`) remembers the last-equipped melee/ranged weapon (session-local, not persisted — see Loose Ends) at the player/inventory boundary, resolving through the existing `HeldTool.equip(kind, instanceId)` and re-validating via `syncWithInventory` alongside `heldTool.syncWithInventory()` inside `createApp.ts`'s `syncHeldHud`. `inventoryWiring.ts`'s `equipTool` now calls `primaryWeapons.noteEquipped()` on every successful equip; new `equipPrimaryMeleeWeapon`/`equipPrimaryRangedWeapon` re-equip whichever was last remembered. New `isMeleeToolKind` added to `itemCatalog.ts` (mirrors the existing `isRangedTool`, avoids an items→fauna dependency for a plain capability check). HUD buttons (`Sword`/`BowArrow` from `lucide-vue-next`) added to both `QuickActionsScreen.vue`'s desktop floating cluster and `TouchChrome.vue`'s touch cluster, visible only once a primary of that kind exists (`ui.hud.primaryMeleeLabel`/`primaryRangedLabel`).
- **Toast/inline-feedback duplication**: `PauseMenuEntriesSaves.vue`'s `saveAs()`/`startNewGame()` save-limit and save-failure branches set a local `error` ref *and* called `showToast()` with the same message — the inline `<p v-if="error">` block is shared with genuine persistent name-validation feedback (which stays inline, unchanged). Removed the redundant local-state write for the two transient-failure branches; toast is now the only surface for those, matching the plan's "transient feedback → toast, persistent validation stays inline" rule. Audited every other `showToast` call site (`InventoryScreenItemDetails.vue`, `PauseMenuEntriesActions.vue`, `MerchantScreen.vue`, `QuickActionsScreen.vue`) — no other duplication found.
- **Merchant integration**: audit-only, per plan (`ui-input-003` owns the redesign and is already `verification needed`). Confirmed no vanilla facade/dead path exists for Merchant (unlike Quick Actions' `createQuickActions.ts`) and the callback surface is already collapsed to `onSettleTransaction`/`onSellInstances` — nothing to remove. The stacking fix above (Quick Actions now `z-9`, strictly below Merchant's `z-10`/`z-20`) is what actually resolves the plan's specific Quick-Actions-over-Merchant playtest finding.
- Deliberately **not** changed: the corpse interaction (`bury`/`harvest`) turned out to already be a single contextual action per `target.action`, not a real two-choice case — not converted to the panel contract, since there was nothing to gain. Every other bypass `Interactable.kind` (dig/trap/campfire/dryingRack/hive/crop/gardenPlot/container/deposit/landPlot/waterEdge/item/terrainPreparation) keeps firing directly on `[E]`/`[R]` + toast, unchanged — see Loose Ends for the scoping rationale.

**Technically verified:** `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build` (vue-tsc + vite), `pnpm run test` (205 files / 1938 tests) all pass.

**Not yet browser/manual verified** — this session could not launch a browser. Needs a pass on the running dev server per the plan's own Verification section, especially: Quick Actions no longer covering Merchant/other modals when both are open, Quick Actions vertical-only scroll feel on an actual short landscape/touch viewport, the new Prepare Terrain buttons on both desktop and mobile, the well `[R]` panel's enabled/disabled states against real inventory/nearby-material states, and the primary-weapon HUD buttons appearing/equipping correctly after picking up and equipping melee/ranged weapons.
