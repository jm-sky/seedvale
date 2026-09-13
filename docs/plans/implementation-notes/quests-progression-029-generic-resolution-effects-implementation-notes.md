# Implementation Notes: quests-progression-029 — Generic resolution effects

## Do not invent a second outcome pipeline

`QuestManager.applyOutcome` is the only exact-once terminal. Stage `dialogueActions` already apply `consequences` without resolving; `physicalOutcomeId` calls `tryResolvePhysicalOutcome` → `physicalOutcome.onResolve` then `resolveQuest`. Fold **world mutations** into that existing fork, not a new `QuestEffectRunner` class unless the file split is forced by size.

## createApp special cases to delete

`src/app/createApp.ts` `physicalOutcomeResolver`:

- lost hunter: `canResolve` checks `inventory.getInstance(bowId)?.kind === 'hunting_bow'`; `onResolve` for return removes instance and `giverState.personalInventory.addInstance(bow)`.
- bear cave: flags `worldFlags.treasureMapBearCaveCasketConsumed` / `Opened`; carried id vs `bearCaveBinding.casketId`; return discards carried and `grantItem('coin', payout)`.

`questLifecycleHooks.onStageAdvanced`: bear cave stage index `1` reveals location. Lost hunter already uses stage `effects: [{ type: 'reveal_location', ...}]` on the witness talk stage — **prefer that data** over index `=== 1`.

Bindings (`LostHunterNaturalCaveBinding`, `TreasureMapBearCaveQuestBinding`) stay. They supply instance/container/location ids **into the QuestDef at materialization**. QuestManager should not parse quest id prefixes.

## Injected seams already present

- `QuestItemGrant grantItem`
- `QuestAnimalOwnershipTransfer` + `horseRewardAnimalId` on def — implement ownership as an effect triggered from complete outcome; the def field can remain as binding sugar that `applyOutcome` already reads.
- `QuestLocationReveal` via `lifecycleHooks.revealLocation`
- `QuestPhysicalOutcomeResolver` — keep **predicates** here (can the player physically do this), move **mutations** to named effects applied inside `onResolve`/`applyOutcome` so createApp does not switch on quest id.

Target: createApp resolver becomes generic:

- `requireItemInstanceId` → `inventory.getInstance(id)`
- `requireCarriedContainerId` / unopened → `placedContainers.carriedId()` + worldFlags/open state owned by containers, not quest ids
- `onResolve` interprets effect list on the outcome, not quest id

If container open/consumed flags are still bear-cave-specific `worldFlags`, **do not** invent a generic flag map in this plan. Either keep flags as container-owned state (`placedContainers`) or pass a callback `discardCarried(containerId)` injected like `grantItem`. Prefer container API if it already exists.

## Sugar

Keep `outcome.reward` and `outcome.consequences`. Internally call the same helpers as new effect variants so tests of `woda-dla-marka` etc. stay green without rewriting `QUESTS`.

## Persistence

`applyOutcome` already no-ops if state is terminal. Restore path never calls it. Do not add `effectsApplied` to `QuestProgressEntry`.

## Tests

Prefer unit tests on `QuestManager` with injected grant/transfer/reveal fakes over booting `createApp`. Port the physical assertions from `lostHunterNaturalCave.test.ts` / bear-cave tests if they currently go through questId branches.

## Model

M / Sonnet or Composer; fallback Grok. Touches composition root + two flagship quests; easy to leak scope into a generic DSL — notes forbid that.
