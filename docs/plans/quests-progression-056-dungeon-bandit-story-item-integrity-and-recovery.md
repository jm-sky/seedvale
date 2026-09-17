# Plan: Dungeon bandit story-item integrity and recovery

**Created:** 2026-09-17
**Status:** `verification needed` 🔍
**Type:** bug
**Priority:** high · **Effort:** M
**Depends on:** ~~quests-progression-026~~, ~~quests-progression-035~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards`
**Tags:** `bandit-treasure` `story-items` `inventory` `soft-lock`
**Roadmap:** -
**Model:** Sonnet, Composer

## Problem

`Skrytka bandytów` can reach its terminal `await_quest_outcome` stage while the Player does not currently own the exact `bandit_ledger` and `marked_valuable` instances. The final stage then has no selectable dialogue action and falls back to the vague reminder:

> Oznaczony łup i rejestr wciąż wymagają decyzji.

This is a quest soft-lock / invalid-state presentation bug. The observed save has neither story item in Player Inventory although the quest already reached the decision stage.

The current code also contains a generic instance-transfer integrity hole: container withdrawal removes an instance from the source before `inventory.addInstance(withdrawn)`, and a failed destination add has no rollback. `canAddInstance()` makes failure unlikely but does not make the mutation atomic.

## Goals

1. Prevent `Skrytka bandytów` from advancing past deep-stash recovery until the Player owns both exact story-item instances.
2. Require both exact instances for every terminal decision whose authored text assumes possession of the ledger and marked property.
3. Replace the vague no-action terminal reminder with explicit guidance that both story items must be carried.
4. Make world/player-container instance withdrawal rollback-safe so an instance cannot disappear between source removal and destination insertion.
5. Repair already-invalid active saves conservatively, without duplicating an instance that still exists in known storage.
6. Preserve existing ownership boundaries: Inventory owns item instances; `WorldGeneratedContainers` owns the stash; `QuestManager` owns quest progress only.

## Recon / existing mechanisms to reuse

### Exact inventory ownership already exists

`QuestObjective` already supports:

```ts
{ type: 'own_item_instance', instanceId: string }
```

`QuestManager` evaluates it against `inventory.getInstance(instanceId)` and already reacts to inventory changes. Reuse it; do not create another quest-item possession objective.

### Dungeon bandit binding already owns stable identity

`DungeonBanditTreasureBinding` already exposes:

- `deepContainerId`;
- `ledgerInstanceId`;
- `markedValuableInstanceId`.

Use these stable ids. Do not replace exact-instance semantics with kind/count checks.

### Story items already use normal Inventory persistence

Player inventory instances serialize through `inventory.instancesToJSON()` and load through `Inventory.instancesFromJSON(...)`. No new persistence field is required for healthy saves.

### Story category does not mean “must stay on Player”

`story` is presentation-only. The generic container UI can move exact instances into other storage. Therefore “missing from Player Inventory” means “not carried”, not automatically “destroyed”. Recovery must locate the exact id across legal storage before recreating it.

### World-generated container snapshots are authoritative

`WorldGeneratedContainers` persists its concrete `instances`. A saved snapshot overrides `initialInstances`, so recovery code must inspect current ownership before recreating anything. Never blindly reseed initial story items into a saved empty container.

## Scope

### 1. Make deep-stash acquisition require both exact instances

Update `buildDungeonBanditTreasureQuest()` in `src/quests/dungeonBanditTreasure.ts`.

Replace the current single-condition progression semantics with an `all` stage that preserves the existing deep-container condition and additionally requires:

- `own_item_instance(binding.ledgerInstanceId)`;
- `own_item_instance(binding.markedValuableInstanceId)`.

The stage must not advance merely because the marked valuable disappeared from the stash. It advances only when the authored deep stash is looted as expected **and** both exact story items are currently in Player Inventory.

Keep ordinary/side-cache loot optional.

### 2. Require both story items at the decision stage

The authored outcomes all describe a decision about both the identifiable property and its evidence. Align runtime requirements with that narrative.

In `src/app/createApp.ts` dungeon-bandit `physicalOutcomeResolver.canResolve(...)`:

- first resolve both exact instances from Player Inventory;
- return `false` for every dungeon-bandit terminal outcome if either exact instance is absent;
- retain outcome-specific checks such as target NPC alive and destination inventory capacity;
- `give_evidence_to_guard` transfers both instances;
- `return_marked_property` transfers the marked valuable as today and handles the ledger according to the authored outcome contract; do not silently duplicate or discard it;
- `keep_marked_property` leaves both instances with the Player unless the existing authored consequence explicitly says otherwise.

Keep the exact instance ids and current outcome ids.

### 3. Improve the no-action reminder

Change the final stage reminder to actionable wording, e.g.:

> Do rozstrzygnięcia sprawy musisz mieć przy sobie oznaczony klejnot i bandycki rejestr.

The message must remain correct when one or both items are absent. Do not claim that an item was destroyed, sold or remains in the dungeon unless authoritative state proves it.

If implementation can cheaply distinguish one missing item using existing inventory reads without adding a parallel dialogue-state mechanism, use specific variants. Otherwise prefer the single truthful two-item requirement above over new generic disabled-action infrastructure.

### 4. Make instance withdrawal rollback-safe

Fix the generic container instance transfer in `src/app/actions/containerActions.ts`.

For both single `onWithdrawInstance` and `onTakeAll` instance paths:

```text
check destination capacity
→ withdraw exact instance from source
→ add exact instance to Player Inventory
→ if destination add fails, restore the same instance to the source
→ only then emit onWorldContainerWithdraw / inventory-changed side effects
```

Use the existing `depositInstance` / `withdrawInstance` store contract. Do not invent a second storage transaction system unless a small shared helper clearly reduces duplication.

A failed transfer must leave the exact same instance id in exactly one authoritative inventory.

### 5. Conservative recovery for already-invalid saves

Add a narrow dungeon-bandit reconciliation during world/quest composition after Player Inventory and storage containers are available and before the quest is presented as terminally actionable.

Recovery applies only when all are true:

- the dungeon-bandit quest is accepted and still non-terminal;
- progress is at or beyond the deep-stash acquisition / decision boundary;
- an expected story instance is absent from Player Inventory;
- the implementation has checked every existing storage domain that can legally hold these story instances and confirmed the exact id is not already present.

Before recreating an exact id, inspect at least:

- Player Inventory;
- **all** `WorldGeneratedContainers`, not only the original dungeon stash — the generic transfer UI allows depositing instances into another world-generated container;
- all Player placed containers;
- the currently carried Player container, which is not part of the placed-container `list()` while carried.

If another current ownership domain accepts arbitrary story instances (for example a generic NPC-personal-inventory transfer path), include it as well. If exhaustive ownership cannot be established safely, skip automatic recreation and keep the improved diagnostic rather than risk duplication.

Only after the exact id is proven absent everywhere should recovery recreate that canonical instance and place it back into the original bound deep stash. The Player must physically recover it again. Do not grant it directly to inventory and do not reset unrelated loot.

Recovery is legacy/state repair, not a second source of truth. Healthy saves must be a no-op and repeated reconciliation must be idempotent.

## Tests

### `src/quests/dungeonBanditTreasure.test.ts`

Add/adjust coverage for:

- acquisition stage does not advance when only the marked valuable is owned;
- does not advance when only the ledger is owned;
- advances only when both exact ids are owned and the deep stash condition is satisfied;
- final authored reminder explicitly says both items must be carried;
- final action definitions/outcome contract remain exact-instance based.

### `src/quests/QuestManager.test.ts`

Only add shared coverage if needed for the existing `own_item_instance` + multi-objective behavior. Do not duplicate tests already proving that contract.

### Container transfer tests

Add the nearest focused test around `containerActions` / extracted transfer helper proving:

- successful exact-instance withdrawal moves one instance, preserving id;
- failed destination insertion restores the exact instance to source;
- `onWorldContainerWithdraw` is not emitted for a rolled-back transfer;
- `Take all` has the same invariant.

### Recovery tests

Cover:

- healthy inventory-owned item → no recreation;
- item still in original deep stash → no recreation;
- item in another world-generated container → no recreation;
- item in Player placed storage → no recreation;
- item in carried Player container → no recreation;
- genuinely absent item in qualifying active quest → recreated once in the bound deep stash;
- repeat/reload is idempotent;
- terminal quest → no recreation.

## Non-goals

- No global indestructible/non-droppable quest-item system.
- No new quest-only inventory state.
- No automatic teleport of story items into Player Inventory.
- No broad rewrite of container transfer architecture.
- No UI-specific interpretation of quest ids or item ids.
- No reset of ordinary dungeon loot or side caches.
- No browser verification by AI.

## Relevant files

- `src/quests/dungeonBanditTreasure.ts`
- `src/quests/dungeonBanditTreasure.test.ts`
- `src/quests/QuestManager.ts`
- `src/quests/QuestManager.test.ts`
- `src/quests/quests.ts`
- `src/app/createApp.ts`
- `src/app/actions/containerActions.ts`
- `src/world/worldGeneratedContainers.ts`
- `src/world/createPlacedContainers.ts`
- `src/items/Inventory.ts`
- `src/app/saveState.ts`

Add JSDoc with `@domain` for any new reusable reconciliation or transactional helper whose ownership is not obvious from the local file.

## Verification

Automated:

- targeted dungeon-bandit quest tests;
- targeted container-transfer tests;
- targeted recovery tests;
- relevant `QuestManager` tests if shared contracts change;
- typecheck / normal project test gate required by repository instructions.

Manual browser verification by User:

1. Fresh quest: loot only one story item — quest must not move to final decision.
2. Loot both — quest advances; Marek exposes the expected choices.
3. Put one story item in a Player chest — Marek gives a clear carry-both-items reminder, not a dead-end sentence.
4. Retrieve it — choices return.
5. Move a story item to another storage container — recovery must not duplicate it.
6. Load an affected old save with a genuinely missing story item — the item is recoverable from the original deep stash only after reconciliation proves it absent everywhere else.
7. Save/load after recovery — no duplicate ledger or marked valuable.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
