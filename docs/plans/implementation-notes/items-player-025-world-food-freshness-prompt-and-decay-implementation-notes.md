# Implementation notes: items-player-025 world food freshness prompt and decay

**Plan:** `items-player-025-world-food-freshness-prompt-and-decay.md`
**Reviewed against:** `main` 2026-09-11

## Recon

- `foodFreshness.ts` already derives Fresh/Medium/Spoiled from effective age. Helpers: `foodBatchEffectiveAge`, `foodTotalShelfLifeDays`, `getFoodBatchFreshnessStage`. No remaining-days / despawn helper yet.
- `DroppedItem.foodBatch` already round-trips through `drop`/`collect`/save. `tick(dt)` only iterates `falling`.
- World chunk + spawner collect return `{ kind, x, z }` only — freshness starts at pickup. Do not invent ground age.
- `groupDroppedItemCandidates` already skips records with `foodBatch`, so Fresh vs Spoiled never merge.
- `itemPromptLabel` / `worldItemAllowsAltInteract` are kind+quantity only. `[R]` execution in `gameLoop.ts` uses the same `worldItemAllowsAltInteract` gate.
- Crop prompts use `(przejrzałe)` — spoiled world food should use `(zepsute)`.
- `standingTorches.resolveExpiry(nowDays)` is the existing world-time cleanup seam in `gameLoop.ts`, next to `droppedItems.tick(dt)`.

## Implementation

Add `WORLD_SPOILED_FOOD_DECAY_DAYS = 0.5` and `foodBatchDecomposeAtDays(kind, batch)` in `foodFreshness.ts`:

```text
lastCheckpointDays + (shelfLife + DECAY - accumulatedEffectiveAge) / decayModifier
```

`DroppedItems.reconcilePerishableLifecycle(nowDays)`: skip when `nowDays < nextDecomposeAt`; otherwise remove expired perishable `foodBatch` records with the same mesh dispose as `collect()`, without `onCollected`. Recompute `nextDecomposeAt`. Call from `createDroppedItems(..., nowDays)` on hydrate and from `gameLoop.ts` beside `droppedItems.tick(dt)` (outside the fauna freeze, same as torch expiry — `elapsedDays` still advances during time-skip).

Export `itemPromptLabel` (or `worldItemPromptLabel`) with optional `FreshnessStage`. Pass stage from the dropped node's `foodBatch` + `nowDays` already available in `buildInteractables`. Extend `worldItemAllowsAltInteract(kind, quantity, freshness?)` — `spoiled` → false.

At `[R]` in `gameLoop.ts`, re-read the dropped node's live `foodBatch` and `getFoodBatchFreshnessStage` before treating alt as consume.

`WorldItemRef` does not need a new spoilage field if execution looks up the dropped node.
