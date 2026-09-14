# Implementation Notes: quests-progression-029 — Generic resolution effects

## Do not invent a second outcome pipeline

`QuestManager.applyOutcome` remains the single exact-once terminal path. Stage `dialogueActions` may still apply non-terminal `consequences`, but terminal rewards/consequences/world effects must converge on the existing outcome path.

Do **not** add a second quest-resolution coordinator or a generic transaction framework. A helper function/file for dispatching a small effect union is acceptable only if it keeps `QuestManager` readable; ownership and sequencing still belong to the existing lifecycle.

## Critical ordering rule

The current physical path conceptually separates:

1. `canResolve` — live-world predicate,
2. physical mutation,
3. terminal quest resolution.

The refactor must remove the dangerous possibility of mutating the world first and only then discovering that terminal resolution cannot be applied.

Required target semantics:

1. re-read quest state and authored outcome,
2. validate all physical/world preconditions through injected read-only predicates,
3. enter the single exact-once terminal outcome path,
4. execute the outcome's world effects through injected seams with explicit success/failure contracts,
5. apply reward/consequences/presentation according to the existing semantics,
6. persist terminal quest state once.

Do not implement a general rollback engine. Instead, any effect that spans multiple operations inside one owned system must be atomic inside its seam. Effects that can fail must return a result and be handled before committing a successful terminal state.

## Horse reward is lifecycle metadata, not just an effect

`QuestDef.horseRewardAnimalId` must **remain** in this plan.

It is currently used for more than the final ownership mutation:

- availability via `canReserveHorseReward`,
- active reservation via `isHorseRewardReserving`,
- target-death failure via `onHorseRewardTargetDied`,
- stable association between the quest and the specific horse.

Do not replace these behaviours with a generic effect and do not remove the field.

Only the final successful ownership mutation should go through the common effect dispatch / existing `QuestAnimalOwnershipTransfer` seam. Preserve the existing fallback/failure semantics if transfer cannot be completed.

## createApp special cases to delete

`src/app/createApp.ts` `physicalOutcomeResolver` currently contains quest-specific behaviour:

- lost hunter: `canResolve` checks `inventory.getInstance(bowId)?.kind === 'hunting_bow'`; `onResolve` removes the exact instance and adds it to `giverState.personalInventory`.
- bear cave: checks `worldFlags.treasureMapBearCaveCasketConsumed` / `Opened`, compares carried id against `bearCaveBinding.casketId`, then discards carried container and grants payout.

`questLifecycleHooks.onStageAdvanced` also reveals the bear-cave location through an index-specific branch. Lost hunter already demonstrates the preferred shape with authored `effects: [{ type: 'reveal_location', ... }]`.

After this plan, `createApp.ts` must not select a mutation path by:

- `questId === lostHunterBinding.questId`,
- `TREASURE_MAP_BEAR_CAVE_QUEST_ID`,
- quest-id prefix parsing.

Bindings (`LostHunterNaturalCaveBinding`, `TreasureMapBearCaveQuestBinding`) stay. They materialize stable runtime values such as `instanceId`, `containerId`, `locationId` and payout into the final `QuestDef`. That is data binding, not quest-specific dispatch.

## Effect union: keep it deliberately small

Extend the existing `QuestStageEffect` concept or rename/generalize it only as far as needed to serve both stage and terminal outcome effects.

Required variants for this migration only:

- `reveal_location`
- transfer one exact item instance to an NPC/giver
- transfer animal ownership
- discard one exact carried container
- grant item(s)/coins through existing grant seam

Do not add speculative variants for work contracts, skill XP, generic flags, arbitrary callbacks, scripting, nested effects or future quest systems.

`outcome.reward` and `outcome.consequences` remain authored sugar. Internally they may share helper functions/dispatch with the new effect path, but do not force a repository-wide quest definition migration.

## New item-instance transfer seam

Add a narrow injected seam, e.g.:

```ts
export type QuestItemInstanceTransfer = (
  instanceId: string,
  targetNpcId: NpcId,
) => boolean
```

Exact signature may differ after implementation recon, but preserve these properties:

- input uses stable ids, not runtime object references,
- `QuestManager` does not import or mutate NPC settlement state directly,
- implementation lives where both player `Inventory` and target NPC `personalInventory` are legitimately accessible,
- the operation is atomic from `QuestManager`'s perspective: either the exact instance ends up with the NPC or nothing changes,
- failure returns `false`/typed failure; do not silently drop the item.

For lost hunter, validate expected kind/ownership before mutation. The transferred object must be the same `ItemInstance`, not a newly granted replacement bow.

## Existing injected seams

Reuse:

- `QuestItemGrant grantItem`
- `QuestAnimalOwnershipTransfer`
- `QuestLocationReveal` via existing location lifecycle seam
- `QuestPhysicalOutcomeResolver` for read-only physical predicates

Potentially add one narrow carried-container mutation seam if no suitable container-owned API is already available. Prefer calling the existing `placedContainers` ownership API from the composition layer over teaching `QuestManager` container internals.

Do not inject broad manager objects when a narrow operation callback is enough.

## Physical resolver target shape

`canResolve` remains a predicate layer. It may check:

- `requireItemInstanceId` against live player inventory,
- `requireCarriedContainerId` against `placedContainers.carriedId()`,
- unopened/opened state through container/world-owned state.

It must not remove items, discard containers, grant rewards, transfer ownership or mutate quest/world flags.

If the current `QuestPhysicalOutcomeResolver` interface has a mutation-bearing `onResolve`, either remove/retire that responsibility or reduce it to generic effect dispatch without quest-id branching. Prefer moving actual mutation responsibility into the outcome/effect path rather than keeping two competing mutation locations.

## Lost hunter migration

Return bow outcome:

- physical predicate: exact `bowInstanceId` exists in player inventory and is the expected hunting bow,
- terminal effect: `transfer_item_instance` to giver NPC,
- transfer seam performs remove+add atomically,
- failure to transfer means no successful terminal outcome.

Keep bow outcome:

- no transfer effect,
- bow remains in player inventory,
- no special branch in `createApp.ts`.

Tests should assert identity of the transferred instance, not just `kind`/count.

## Bear cave migration

Return unopened:

- physical predicate requires the exact bound casket to be carried and unopened,
- terminal effects discard that exact carried container and grant the precomputed payout,
- each mutation happens exactly once.

Keep opened:

- physical predicate requires the authored/opened state expected by the quest,
- no return-payout effect,
- no accidental discard from the return branch.

Payout calculation stays outside `QuestManager`. Materialize a ready value from authored/binding data.

If open/consumed state is still represented by bear-cave-specific `worldFlags`, do **not** invent a generic quest flag registry in this plan. Prefer existing container-owned state/API. If migration of those flags is too large, keep the narrow read predicate behind the injected resolver while removing quest-id-based mutation branching.

Move bear-cave location reveal to authored stage `effects`; delete the `stageIndex === 1` lifecycle special case.

## Exact-once and failure semantics

`resolvedOutcomeId` + terminal state remain the persistence guard. Do not add `effectsApplied`.

Important implementation invariant:

- a terminal effect is not replayed after restore,
- repeated interaction after terminal state is a no-op,
- a failed precondition performs zero mutation,
- a failed ownership/transfer effect must not leave a successful terminal quest state,
- existing horse transfer fallback semantics remain intact,
- do not partially grant reward/consequences if a required world-transfer effect fails.

Order required effects before non-critical additive effects where failure matters. For example, transfer/discard should succeed before granting payout/reward that assumes the transfer succeeded.

## Ownership boundaries

`QuestManager` owns:

- quest progress/lifecycle,
- selecting authored effects,
- sequencing/dispatching them,
- exact-once guard.

It does **not** own:

- player inventory implementation,
- NPC inventories,
- fauna ownership state,
- carried-container internals,
- location-knowledge state.

Those systems expose narrow injected operations. Do not pass entire managers into `QuestManager` merely to make the effect implementation convenient.

## Validation

Extend quest-definition validation only where malformed effect payloads can be detected statically, e.g. empty ids or impossible authored references already available in the final materialized definitions.

Do not perform expensive live-world validation during `validateQuestDefinitions`; live existence/state checks belong to the runtime predicates/seams.

## Persistence

No `CURRENT_SAVE_VERSION` bump is expected if effects remain definition data and no persisted shape changes.

Restore must never call terminal effect dispatch for an already completed/failed quest. Existing dynamic binding reconstruction rules remain authoritative for instance/container/horse ids.

## Tests

Prefer focused `QuestManager` unit tests with injected fakes plus existing integration tests around materialized flagship quests. Avoid booting full `createApp` unless needed to verify composition wiring.

Minimum regression coverage:

- legacy `reward.items` still grants exactly once,
- legacy `consequences` still apply exactly once,
- stage `reveal_location` still works,
- terminal reveal effect works if introduced,
- lost hunter return transfers the exact instance once,
- lost hunter keep leaves it untouched,
- failed lost-hunter precondition performs zero mutation,
- bear-cave return discards exact container + grants exact payout once,
- wrong/open-state predicate performs zero mutation,
- bear-cave keep does not run return effects,
- reload of terminal lost-hunter/bear-cave quests does not replay effects,
- horse availability/reservation remains unchanged,
- horse death still resolves through existing failure behaviour,
- successful horse reward transfers once,
- failed horse transfer cannot produce partially applied success,
- no quest-specific resolver branch remains for the two migrated quests.

Run relevant unit/integration tests, typecheck/build per repo conventions. Do not perform browser verification; User does that manually.

## Scope guardrails for implementation agent

Before editing, re-read current `QuestManager.applyOutcome`, `tryResolvePhysicalOutcome`, stage effect dispatch, the two quest builders/bindings and current `createApp.ts` resolver. Implement against current code, not these notes' illustrative signatures.

Do not:

- refactor unrelated quest objectives,
- redesign persistence,
- migrate all rewards/consequences definitions,
- generalize world flags,
- change horse purchase mechanics,
- change inventory architecture,
- introduce an event bus or generic scripting DSL,
- add speculative effect types.

The goal is narrow: remove quest-id-based physical mutation branches while preserving every existing gameplay invariant.

## Model

M / Sonnet or Composer; fallback Grok. Touches composition root + two flagship quests + horse lifecycle semantics; guard carefully against widening into a generic quest scripting system.
