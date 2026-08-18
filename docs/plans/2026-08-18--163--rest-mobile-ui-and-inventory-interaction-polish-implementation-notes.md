# Plan 163 — Implementation Notes

**Plan:** `2026-08-18--163--rest-mobile-ui-and-inventory-interaction-polish.md`
**Reviewed:** 2026-08-18
**Status:** `planned` 📋

## Review summary

Plan is directionally correct and fits the current architecture. It should remain a small S task, but four implementation details need to be explicit before Claude Code starts:

1. Rest already has a dedicated `RestCampSequence` and separate camp-rest calculation; do not add another sleep/cancel state machine.
2. `Tab` cycling was already implemented by plan 153. Plan 163 should add only the mobile trigger/UI path and reuse the existing cycle action, not reimplement candidate selection.
3. Merchant Screen is already Vue and already has touch scrolling, large touch targets and a responsive one-column layout. The mobile fix should be a focused layout correction based on the actual narrow viewport failure, not a second mobile screen.
4. Inventory currently has a single `ItemCategory`; changing this to multi-category is the largest part of the plan. Use one authoritative `categories` field and a shared membership helper rather than keeping both `category` and `categories` in sync.

The plan's wording around `~100%` should be interpreted as completion of the existing rest time-skip, not as a new arbitrary timer threshold.

## Relevant existing code

### Rest / camping

- `src/app/restCampSequence.ts` owns the visual rest ritual: `setupCrouch → placeBlanket → lie → sleeping → teardownCrouch → removeBlanket → stand`.
- `RestCampSequence.start()` receives `onSleepStart` and `onComplete` callbacks.
- `notifySleepFinished()` is the existing hand-off from the 8h time skip into teardown.
- `cancel()` already stands the player up and resets the sequence.
- `src/app/campRest.ts` only derives the rest-quality value from blanket/tent/fire context; it should not gain UI/input responsibilities.
- The actual orchestration is wired through `createApp.ts` / `gameLoop.ts`. Inspect that path first to find the current sleep progress and existing Escape handling before editing.

**Important:** do not put cancellation logic into `restCampSequence.ts` merely because the UI needs an Esc button. The button should invoke the same cancellation/escape action currently used by physical Escape.

### Merchant

`src/ui-vue/screens/MerchantScreen.vue` already contains:

- responsive `grid-cols-1 ... md:grid-cols-2`,
- `useTouchScroll()` on both item lists,
- `overflow-y-auto`,
- `min-h-11` purchase/sell buttons,
- a mobile-friendly close button,
- existing `Esc — zamknij` hint.

Therefore the likely fix is CSS/layout only unless browser inspection proves an interaction wiring problem. On narrow screens pay particular attention to the fixed panel height, the one-column grid's available height, filter rows consuming vertical space, and whether seller/buyer scroll containers actually receive a constrained height. Avoid introducing a separate `MerchantScreenMobile.vue`.

### Target cycling

Plan 153 already added the full desktop cycle mechanism:

- `src/input/Keyboard.ts`: `cycleTarget` edge-triggered state + `consumeCycleTarget()` bound to `Tab`.
- `src/app/gameLoop.ts`: candidate collection and cycling through interaction candidates.
- The cycle is deliberately generic: it can reach NPCs, animals, objects and the well, not just combat targets.
- Existing prompt text includes the `[Tab] Dalej (i/n)` hint when multiple candidates exist.

Plan 163 should expose the same action to touch input. Do not add another target-selection algorithm and do not narrow it to NPC/animal targets.

Preferred shape:

```text
mobile button
    → existing cycle-target action/callback
    → existing gameLoop cycle state
    → existing candidate selection
```

If the current Vue/DOM UI has no reusable input-action seam, add the smallest explicit callback/action bridge needed. Do not synthesize a keyboard `Tab` DOM event just to reach the game loop.

The button should only be visible when cycling is meaningful (normally when the existing cycle candidate set contains more than one candidate). Follow the same semantic condition as the existing `[Tab] Dalej` hint if that state is already exposed.

### Inventory categories

Current model in `src/items/items.ts` is:

```text
type ItemCategory = 'resource' | 'tool' | 'utility' | 'food'
ItemDef.category: ItemCategory
```

`InventoryScreenItemList.vue` currently filters/sorts directly through `item.def.category`. `MerchantScreen.vue` does the same for stock and sellable items. This means a model change must update both screens and any other `.category` consumers.

Recommended model:

```text
type ItemCategory = 'resource' | 'tool' | 'utility' | 'food' | 'weapon'
ItemDef.categories: readonly ItemCategory[]
```

Then add one small shared helper near the item definitions, for example:

```text
hasItemCategory(item, category)
```

or equivalent `itemHasCategory(kind, category)`.

Do **not** keep both `category` and `categories`; that creates duplicated authoritative state.

For the existing item set:

- normal tools: `['tool']`
- normal resources: `['resource']`
- utility/food items: unchanged semantic category
- weapons should include `weapon`
- `axe` must be `['tool', 'weapon']`

Prefer deriving the weapon classification from the existing item gameplay definition where possible (for example the existing melee flag in `ITEM_CATALOG`) rather than creating a second hard-coded weapon registry. If that creates an undesirable dependency direction, use an explicit `categories` entry in `ITEM_DEFS` and keep the list local to the item definition.

Do not create a generic taxonomy system. This is only a small multi-category extension.

## Suggested implementation order

### 1. Inventory model first

1. Extend `ItemCategory` with `weapon`.
2. Change `ItemDef.category` → `ItemDef.categories`.
3. Convert all item definitions to arrays.
4. Mark weapons appropriately; explicitly verify `axe = Tool + Weapon`.
5. Add/reuse a single category-membership helper.
6. Update `InventoryScreenItemList.vue`:
   - available categories use membership, not equality;
   - filtering uses membership;
   - sorting uses a primary category order that remains deterministic;
   - item detail/category label should not assume a single category.
7. Update `MerchantScreen.vue` filtering similarly.
8. Search for remaining `.category` accesses and convert every relevant consumer.
9. Update `docs/items/CATALOG.md` only if its category information is currently documented there and becomes stale.

Potential UI detail: an item with multiple categories should not show a misleading single category label. If the existing label position is useful, render the applicable labels (or otherwise make `Weapon` visible) without redesigning the inventory card.

### 2. Target-cycle mobile action

1. Locate the existing `consumeCycleTarget()` / cycle logic from plan 153.
2. Find the existing mobile/touch action bridge used by other screen buttons.
3. Add a `Cycle target` action to that bridge.
4. Reuse the existing cycle function/state.
5. Show the button only when there is more than one cycle candidate, matching the desktop hint semantics.
6. Keep desktop `Tab` untouched.

Suggested visible label: `Cel` / `Dalej` with a target/cycle icon if an existing icon convention is already used. Prefer the existing UI vocabulary over inventing a new term.

### 3. Rest Esc button

1. Find the current physical Escape handler and the exact rest/camping cancellation branch.
2. Identify the existing progress value used by the rest UI.
3. Add a derived `canCancelRest` condition: progress strictly above 85%.
4. Expose an on-screen `Esc` button while `canCancelRest` is true.
5. Wire it to the exact same cancellation function used by physical Escape.
6. Do not expose cancellation at 85% or below.
7. Leave automatic completion owned by the existing time-skip completion path. When that path reaches completion, `notifySleepFinished()` / existing completion flow should win; do not add a second `>= 100%` timer.
8. Ensure the button disappears as soon as rest ends/cancels.

The user-facing button should be present on desktop too. Do not gate it behind a mobile media query.

### 4. Merchant mobile layout

1. Reproduce the narrow layout using the existing screen rather than assuming the problem.
2. Keep one `MerchantScreen.vue`.
3. Preserve the existing two-column desktop layout.
4. On narrow screens, ensure the currently relevant item list has a real constrained scroll area and remains reachable after header/filter controls.
5. Keep touch scrolling (`touch-action: pan-y`) and existing touch-sized buttons.
6. Avoid increasing the overall panel beyond the viewport (`100dvh` should remain the reference).
7. Do not change merchant business logic, prices, stock or barter semantics.

A simple responsive CSS change is preferable to introducing tabs/accordions unless the existing layout proves impossible to use on the target viewport.

## Tests to add/update

### Inventory

Add pure unit coverage around category membership:

- `axe` matches `tool`;
- `axe` matches `weapon`;
- `axe` does not match unrelated categories;
- a normal tool matches `tool` but not `weapon`;
- an item with multiple categories appears in both corresponding filters.

If current tests cover item definitions/catalog integrity, extend those rather than creating a large new test suite.

### Rest

If the existing rest progress/cancellation logic is unit-testable, cover the boundary:

- `85%` → cannot cancel;
- `85% + epsilon` → can cancel;
- completion path still auto-finishes;
- UI cancellation and Escape call the same underlying action.

Do not create DOM integration tests solely for a button if the project has no established Vue integration test infrastructure.

### Target cycling

Prefer a small test of the action bridge only if there is already a pure seam. The existing cycle candidate/selection tests from plan 153 should remain the source of truth for actual cycling semantics.

## Verification checklist

Technical:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run test`

Browser/manual:

- Rest below 85%: no `Esc` button.
- Rest just above 85%: `Esc` appears and cancels correctly.
- Rest near completion: it still completes automatically without requiring the button.
- The same `Esc` action works on desktop and touch viewport.
- Merchant on a narrow phone viewport: seller stock is reachable, scrollable and purchasable; barter/sell still work.
- Merchant desktop layout remains usable.
- Mobile target button cycles through the same targets as desktop `Tab`.
- Inventory `Weapon` filter shows weapons.
- Axe appears under both `Tool` and `Weapon`.
- Existing `Resource`, `Tool`, `Utility`, `Food` filters continue to work.

Per `CLAUDE.md`, do not claim browser verification from build/test results alone; manual browser verification remains separate.

## Scope guardrails

Do not:

- create a second rest/sleep state machine;
- create a mobile-only merchant screen;
- create a second target-selection system;
- create a separate weapon taxonomy/registry if existing item metadata can own the classification;
- add new weapon gameplay;
- redesign inventory or merchant UX beyond the concrete mobile usability issue;
- refactor unrelated UI.

## Documentation follow-up

If implementation discovers that the plan's description differs materially from the code (especially the rest progress/cancel path), update the plan/notes with the actual implementation seam rather than forcing the code to match the original wording.

> Zrób git commit i push do main, rebase jeżeli trzeba
