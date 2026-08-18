# Plan 153 — Implementation Notes

**Plan:** `2026-08-18--153--mobile-playtest-fixes.md`
**Implemented:** 2026-08-18
**Status:** `verification needed` 🔍

## Implementation summary

All 11 items implemented, each by extending an existing system (no parallel mechanisms introduced). Combat untouched, as scoped.

1. **NPC / well blocking** — root cause per code inspection: `NpcAgent` had zero NPC-NPC local avoidance (only static-collider avoidance via `isWalkable`/`resolveSteerTarget`); a well queue beyond `maxVisibleSlots` also collapses overflow waiters onto one shared point (`InteractionQueue.waitingSlotPosition`'s intentional clamp — left as-is, it's covered by an existing test and is a deliberate design choice, not the bug). Fix is general, not well-specific: `createSettlement.ts`'s per-frame `update()` now also computes a small pairwise separation push (`NPC_SEPARATION_RADIUS = 0.5`, `NPC_SEPARATION_SPEED = 1.5`) alongside the existing `nearbyNpcCount` pairwise loop, applied via new `NpcAgent.applySeparation(dx, dz)` (falls back to axis-only or no-op rather than ever stepping into water/a collider, mirroring `steerTo`).
2. **Quick item interactions** — `interactables.ts`'s `itemPromptLabel()` now appends `· [R] Zjedz/Wypij/Opatrz` (via new `consumeVerbLabel()` in `itemCatalog.ts`, shared with the inventory screen) when `ITEM_CATALOG[kind].consumable` is set. `gameLoop.ts`'s `item` branch handles `R` as pickup + `consumeItem()` in one step, via a new optional `consumeItem` field on `GameLoopDeps` wired from `createApp.ts`'s existing `consumeItem` function — no separate quick-use system.
3. **Knife + harvest without holding** — `createApp.ts`'s `startHarvestMeat` now auto-equips a knife from inventory (same pattern as `userActions.ts`'s `lightWoodenTorch`) when the hand is free. `interactables.ts`'s `corpseCandidate` prompt gate changed from `knifeHeld` to `knifeAvailable` (held OR in inventory with a free hand) so the prompt appears whenever the action will actually succeed.
4. **Health + healing** — `PlayerNeeds.ts` gets `tickHealthRegen` (passive `HP_REGEN_PER_SEC = 0.3`, suppressed while starving/dehydrated), ticked every frame in `gameLoop.ts` next to `applyStarvationDamage`. Two new items: `herb` (world-chunk flora spawn, `terrain/chunkItems.ts`'s existing weighted flora pool, +8 health, free but scarce) and `bandage` (Kupiec stock, +35 health). `ConsumableNeed` extended to `'hunger' | 'thirst' | 'health'`; `createApp.ts`'s `consumeItem` calls `healHealth(player.health, relief)` for the `health` branch.
5. **Deer quest range** — `quests.ts`'s `spot_animal` objective gained an optional `range`; the `zwiadowca` quest's stage sets it to `16` (just above the stag's `fleeRange: 15`), so the player can trigger "spot" from outside the distance that would make it flee. Threaded via new `QuestManager.activeSpotAnimalRange(kind)` → `buildInteractables`'s new optional resolver param → a new optional `interactRange` field on `Interactable`'s `animal` variant → `pickInGaze` (generic constraint widened to accept a per-candidate range override). Global `INTERACT_RANGE`/`GAZE_RANGE` and the stag's AI are untouched.
6. **Quest labels** — `QuestManager.labelMarker` previously returned `'!'` for both "available" and "in progress" (only "ready to report" `'?'` was distinct). Now returns 3 distinct glyphs: `QUEST_MARKER_AVAILABLE = '!'`, `QUEST_MARKER_IN_PROGRESS = '…'`, `QUEST_MARKER_READY = '✓'` (plus the pre-existing separate `QUEST_MARKER_TALK_TARGET = '?'` for a non-giver NPC named by an active `talk_to_npc` objective). Symbol-based, not color-only, per the plan's requirement — no new rendering path needed since `NpcAgent`'s label was already plain text.
7. **NPC dialog by quest status** — `QuestManager.onInteract` previously fell through to the generic dialogue pool once a quest reached `complete` (turned in). Now tracks a `completedFallback` (the quest's `reportLine`) during the loop and returns it only if no other quest this giver offers (a new quest, a reminder, a report) takes priority — preserves quest-chain behavior for NPCs who give multiple quests (Anna, Piotr) instead of getting stuck repeating an old completion line.
8. **Inventory categories** — `InventoryScreenItemList.vue` gained filter tabs derived from `ITEM_DEFS.category` (no second manual list), showing only categories the player actually holds something in.
9. **Inventory sorting** — same file: sort by category (default — tools/food first, matching "most-used easy to find"), name, or quantity. "Recently added" was dropped from scope — `Inventory`'s `Map<ItemKind, number>` has no per-item timestamp, and adding one would be a data-model change beyond this plan's scope.
10. **Interaction candidate cycling** — new `Tab` binding (`Keyboard.ts`: `cycleTarget`, edge-triggered). `gameLoop.ts` computes `cycleCandidates` as every `interactables` entry within `INTERACT_RANGE` (distance-only, all kinds — not NPC-only, since the plan's own verification requires cycling to reach the well among NPCs), lets `Tab` step through them, and only shows the `· [Tab] Dalej (i/n)` hint when there's more than one candidate. Falls back to normal gaze-pick automatically once the candidate list shrinks back to ≤1. `E`/`R` dispatch logic is untouched — it already handles `target` uniformly regardless of how it was selected.
11. **Active skill badge** — already implemented by plan 105's `SkillsHudButton` (always-visible HUD button, emerald border + dot while sneak is active). Verified present; no change made, per the plan's own reuse note.

## Technical verification

Green: `npx tsc --noEmit`, `npm run lint`, `npm run build` (vue-tsc + vite), `npm run test` (124 files / 1045 tests, all passing).

## Not yet verified

No browser/manual playtest performed (per repo convention, this needs the user testing the running dev server). In particular:

- NPC well-queue separation under real crowd conditions (multiple NPCs converging).
- `[R]` quick-use on a pickupable item, and knife auto-equip on harvest.
- Passive HP regen rate feel, herb/bandage healing, herb's in-world spawn rarity.
- Deer quest completable at the new range without the stag fleeing.
- Quest label glyphs and NPC dialog text across all 3 states, for a multi-quest giver (Anna/Piotr) in particular.
- Inventory category/sort UI on a touch/mobile viewport.
- `Tab` cycling — including the "pick the well among NPCs" case explicitly called out in the plan.
