# Plan: World food freshness prompt and spoiled decay

**Created:** 2026-09-11
**Status:** `verification needed` 🔍
**Type:** bug
**Priority:** medium · **Effort:** S
**Depends on:** ~~items-player-002~~ ~~items-player-022~~
**Domain:** `items-player`
**Subdomains:** `items` `interaction`
**Tags:** `freshness` `dropped-items` `prompt`
**Roadmap:** -

## Goal

Dropped perishable food must show its Spoiled state before pickup, must not offer `[R]` consume while Spoiled, and must disappear after a short world-time decompose period — without a second freshness clock or per-frame scan of landed drops.

This is a follow-up to `items-player-002` (freshness/provenance) and `items-player-022` (dropped grouping). Those plans did not include world spoiled prompts or despawn. Do not rewrite them as if they did.

## Current behaviour

Freshness is derived from `FoodBatch` + world time (`getFoodBatchFreshnessStage`). Inventory drops already persist `DroppedItem.foodBatch` at 1.0× decay. `DroppedItems.tick()` is gravity-only; landed items never despawn from spoilage.

World chunk and spawner pickups (including renewable apples) have no `FoodBatch` until pickup, when they become Fresh. Do not invent an age for those.

`itemPromptLabel` / `worldItemAllowsAltInteract` ignore freshness, so `[R] Zjedz` is offered for spoiled dropped food. Grouping already keeps `foodBatch` records individual, so Fresh and Spoiled apples do not merge — keep that and lock it with a test.

`[R]` remains pickup-then-consume for a valid consumable. That is not a bug. Only Spoiled must hide `[R]`. `[E]` pickup of spoiled food stays allowed.

## Change

Prompt: when a dropped perishable's current stage is `spoiled`, show `Podnieś: Jabłko (zepsute)` (crop-style parenthetical) and omit `[R]`. Resolve via `getFoodBatchFreshnessStage`. Fresh/Medium prompts stay as they are.

Execution: re-validate freshness at `[R]` time from the dropped record's `FoodBatch`, not from the prompt string.

Decompose: central rule in `foodFreshness.ts`:

```text
remove when effectiveAge >= shelfLife + WORLD_SPOILED_FOOD_DECAY_DAYS
WORLD_SPOILED_FOOD_DECAY_DAYS = 0.5
```

Use `foodBatchEffectiveAge` (accumulated age, checkpoint, decay modifier). Do not persist `removeAtDays`.

Owner: `DroppedItems.reconcilePerishableLifecycle(nowDays)`. Gravity `tick(dt)` stays landed-item-free. Use a min-next-expiry cache so most frames are O(1). Hydrate: skip records already past decompose. Do not fire `onCollected` on decompose.

Non-perishable items and drops without `foodBatch` are never removed by this path.

## Tests

- spoiled prompt / no `[R]`; fresh consumable still has `[R]`
- Fresh vs Spoiled same kind are not one stacked prompt
- item remains after entering Spoiled; removed after the decompose window
- lifecycle uses world time, not `tick(dt)` count
- save/load hydrate does not restore an already-decomposed drop
- stone / honey / no-batch drops survive cleanup

## Non-goals

- `WorldFoodDecayManager`
- new `spoiled_apple` ItemKind
- inventing freshness for world/spawner pickups
- Medium prompt labelling
- changing `[R] = pickup + consume` for valid food
- per-frame full scan of landed drops
- `setTimeout` / `Math.random()`

## Implementation notes

`docs/plans/implementation-notes/items-player-025-world-food-freshness-prompt-and-decay-implementation-notes.md`
