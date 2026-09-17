# Implementation notes: quests-progression-056

**Reviewed:** 2026-09-17  
**Plan:** `docs/plans/quests-progression-056-dungeon-bandit-story-item-integrity-and-recovery.md`  
**Baseline:** `main` after `c9d67c0d0d03b158a864d06194e2e614ed0b6d5f`

## Confirmed failure shape

`src/quests/dungeonBanditTreasure.ts` currently advances from the deep-stash stage via `loot_world_container`. The composition-root implementation of `QuestWorldProgressLookup.isWorldContainerLooted()` treats the dungeon-bandit stash as looted when the exact marked valuable is no longer present in the bound world-generated container. That proves only source absence, not destination ownership.

The final stage is `await_quest_outcome`. Its three `dialogueActions` all declare `requireItemInstanceId: binding.markedValuableInstanceId`. `QuestManager.availableStageDialogueActions()` removes an action when that exact instance is absent from Player Inventory, then also calls `physicalOutcome.canResolve(...)`. If every action is filtered out, dialogue falls back to the stage `reminderLine`. This is the observed no-choice state.

`createApp.ts` additionally checks `bandit_ledger` only for `give_evidence_to_guard`; return/keep paths currently do not require it even though the authored text and original plan describe a decision over marked property plus evidence.

## Reuse `own_item_instance`; do not add another possession objective

Current `QuestObjective` already has:

```ts
{ type: 'own_item_instance', instanceId: string }
```

`QuestManager` evaluates it using `inventory.getInstance(instanceId)`. Inventory changes already mark relevant stages dirty / pollable. Use a multi-objective `mode: 'all'` acquisition stage containing the existing deep-container objective plus both exact ownership objectives.

This keeps identity exact and avoids kind/count ambiguity.

## Storage ownership that recovery must inspect

Story items are ordinary `ItemInstance`s. They can be deposited through the generic container UI; category `story` is presentation only.

Current legal player-controlled storage domains visible from the composition root include:

1. Player `Inventory`.
2. Every `bundle.worldGeneratedContainers.list()[].contents` inventory — not only the original dungeon stash, because the generic container screen permits depositing instances into world-generated containers.
3. Every `bundle.placedContainers.list()[].contents` inventory.
4. The currently carried Player container via `bundle.placedContainers.carriedNode()`; `list()` does not include it while carried.

Do not recreate a missing exact id until all four are checked.

NPC corpse storage cannot receive deposits (`containerActions.ts` rejects them). Generic merchant stock is positive-allowlist based and story/identity items are intentionally excluded. If implementation finds another current arbitrary-instance transfer into live NPC personal inventory, include it in the ownership scan before enabling recreation.

Prefer a small helper near the dungeon-bandit runtime/composition seam that answers whether an exact instance id exists in any legal storage. It should read existing owners, not create a new registry.

## Recovery placement

`WorldGeneratedContainerSpec.initialInstances` is ignored whenever a saved snapshot exists for the container id. Therefore changing the spec alone cannot repair an already-empty saved stash.

For a proven-orphaned expected instance, recreate the canonical item with the existing factories:

- `createDungeonBanditLedgerInstance(binding.caveId)`;
- `createDungeonBanditMarkedValuableInstance(binding.caveId)`.

Insert it into `binding.deepContainerId` through `bundle.worldGeneratedContainers.depositInstance(...)` after confirming the container exists. This produces normal world-container persistence on the next save and makes the Player physically recover the item.

Run reconciliation only for accepted, non-terminal progress at/after the relevant dungeon-bandit acquisition boundary. Do not run for `not_offered`, `offered`, `complete`, `failed`, `abandoned` or `invalidated`.

The exact stage boundary should be derived from the materialized quest definition/binding rather than hardcoding a display string. If the implementation keeps stable stage ids while editing the quest, prefer those.

## Container transfer integrity hole

`src/app/actions/containerActions.ts` currently performs the instance path as:

```text
canAddInstance(sourceInstance)
withdrawInstance(source)
inventory.addInstance(withdrawn)
```

Both the single-withdraw and `onTakeAll` loops have no rollback if the final `addInstance()` returns false. Side effects (`onWorldContainerWithdraw`) happen only after success, so quest progress is not falsely notified, but the source instance has already been removed.

Use the existing store interface (`withdrawInstance` + `depositInstance`) for rollback. A small helper local to `containerActions.ts` is preferable if it keeps the two paths identical. Requirements:

- preserve the same object/id on rollback;
- do not emit world-withdraw callback on rollback;
- do not mark inventory changed on rollback-only failure;
- do not convert the instance to a count;
- rollback failure should be treated as an invariant violation and surfaced loudly in development rather than silently losing the item.

There is no existing focused `containerActions.test.ts` on current main. If full `createContainerActions` setup is too heavy, extract the minimal transfer primitive into a testable module under `src/app/actions/` rather than constructing a broad integration harness solely for this bug.

## Final-stage requirements

Keep existing outcome ids:

- `return_marked_property`;
- `give_evidence_to_guard`;
- `keep_marked_property`.

All three should be unavailable unless both exact story instances are in Player Inventory. The simplest low-risk implementation is to make the dungeon-bandit branch of `physicalOutcomeResolver.canResolve()` resolve both instances before outcome-specific checks.

Do not add generic disabled dialogue options for this plan unless implementation discovers an existing reusable contract. The final `reminderLine` can truthfully state the carry requirement for both items and solves the observed UX without widening UI contracts.

For `return_marked_property`, check the original authored contract before changing ledger ownership. The plan says “give the physical marked valuable to its claimant and report the ledger”; that does not necessarily mean the claimant must receive the ledger instance. Preserve the intended physical outcome and ensure no item silently disappears.

For `give_evidence_to_guard`, current `onResolve` already transfers both exact instances to the giver.

For `keep_marked_property`, `onResolve` intentionally transfers nothing; requiring both items means the Player keeps both after choosing this outcome.

## Tests nearest to the behavior

`src/quests/dungeonBanditTreasure.test.ts` already covers:

- exact story-item ids in the deep spec;
- fresh vs saved-empty `WorldGeneratedContainers` state;
- inventory restoration of the story instances.

Extend this module first for quest-definition assertions and any extracted reconciliation helper.

`src/quests/QuestManager.test.ts` already covers generic `own_item_instance`; only add tests there if the multi-objective combination reveals missing shared behavior.

For recovery, test all ownership domains that can contain arbitrary story instances:

- Player inventory;
- another world-generated container;
- placed Player container;
- carried Player container;
- original deep stash;
- nowhere (repair exactly once).

## Persistence

Healthy Player item persistence is already correct:

- save: `src/app/saveState.ts` writes `inventory.instancesToJSON()`;
- load: `src/app/createApp.ts` constructs Player Inventory from `Inventory.instancesFromJSON(initialSave.inventoryInstances ?? [])`.

Do not add a save field for this plan. Reconciliation should mutate the existing authoritative container inventory and rely on normal save serialization.

## Implementation order

1. Add regression tests for the dungeon-bandit acquisition/final requirement.
2. Update the quest stage to reuse `own_item_instance` for both exact ids.
3. Align all dungeon-bandit physical outcome availability with both exact items.
4. Improve the final reminder.
5. Extract/fix rollback-safe instance transfer and tests.
6. Add conservative orphan reconciliation with ownership scan + idempotence tests.
7. Run targeted tests, then repository type/test gates.

Do not run browser verification; the User does it manually.
