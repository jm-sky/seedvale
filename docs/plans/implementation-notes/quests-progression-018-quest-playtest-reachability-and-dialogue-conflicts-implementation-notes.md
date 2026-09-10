# Implementation Notes: Quest playtest reachability and dialogue conflicts

Plan: `quests-progression-018-quest-playtest-reachability-and-dialogue-conflicts.md`

## Current-code findings

### Merchant fallback is a catalog-only change

`src/items/tradeCatalog.ts` owns both merchant availability and buy price:

- `MERCHANT_PRICES` determines whether `merchantPrice()` / `isMerchantStock()` consider an item stocked.
- `MERCHANT_STOCK` is the presentation order used by the trade screen.
- `RESOURCE_TRADE_VALUE.herb` is currently `3`, but that is only the fallback barter/sell value for an item that is not stocked.

For this plan, add `herb: 5` to `MERCHANT_PRICES` and add `herb` once to `MERCHANT_STOCK`. Do not add quest-aware stock logic. Once stocked, `tradeValue('herb')` will intentionally become the merchant list price (`5`) because `tradeValue()` prefers `MERCHANT_PRICES` over `RESOURCE_TRADE_VALUE`; check existing sell-price tests for any expectation that assumed `3`.

The quest's `gather_item` path already reads the player's normal `Inventory`, so herbs bought from the merchant need no quest integration. `QuestManager.handleGiverInteract()` checks `inventory.has(kind, count)` and `selectGatherTurnIn()` removes through the same inventory instance.

### Stage dialogue belongs on `QuestStage`, not a new objective

Current runtime shape in `src/quests/quests.ts`:

- `QuestStage` owns stage presentation (`description`, `reminderLine`, `progressLine`, `playerLine`, `failLine`).
- `QuestObjective` owns the condition that normally clears the stage.
- `QuestDialogOverride.actions` is already the UI-neutral seam for conscious player speech.
- `QuestManager.advanceStage()` is the canonical non-terminal stage transition.
- terminal consequences currently live on `QuestOutcome` and are applied by `applyOutcome()`.

For the stag escape hatch, keep `{ type: 'spot_animal', kind: 'stag', range: 16 }` as the objective. Model the two return-to-giver alternatives as authored actions attached to that active stage. This preserves the important distinction: the world objective is still "spot the stag"; dialogue is an alternate way to leave that stage.

A suitable minimal runtime contract is conceptually:

```ts
stage.dialogueActions?: readonly {
  npc: QuestNpcRef
  playerLine: string
  npcLine?: string
  consequences?: QuestConsequences
}[]
```

The exact field/type name may be adapted to existing naming, but keep these properties:

- target is stable `QuestNpcRef`, never display name;
- selection advances exactly the current stage through `advanceStage()`;
- optional consequences are applied on selection, not on opening dialogue;
- callback revalidates quest `state`, `stageIndex`, target NPC and action before mutating anything.

Do **not** make this a new `QuestObjective`: otherwise the same stage would need two competing objectives or the real `spot_animal` condition would be lost.

### Authored/runtime NPC identity requires materialization support

Authored quest definitions deliberately use names only before composition-root binding. `src/quests/materializeAuthoredQuests.ts` is the sole name → stable `NpcId` boundary:

- `AuthoredQuestObjective.talk_to_npc` and `talk_to_npc_choice` are converted there;
- runtime `QuestManager` is id-only;
- missing/ambiguous authored names fail through `resolveAuthoredNpcId()`.

If stage dialogue actions use `npcName` in `AuthoredQuestStage`, extend `materializeAuthoredQuestDefs()` to convert each action target to `QuestNpcRef` using the same local `resolve()` function. Add coverage to `materializeAuthoredQuests.test.ts`. Do not resolve names inside `QuestManager`.

For `zwiadowca`, target the giver Piotr explicitly in authored data even though he is also `def.giver`; this keeps the generic mechanism usable for non-giver NPCs later and avoids an implicit "giver only" contract.

### Non-terminal social consequences need a shared application helper

`QuestManager.applyOutcome()` currently applies two different consequence classes inline:

- `consequences.relations` via `bumpRelation()`;
- `consequences.social` via injected `applySocialConsequence()`, only when `def.settlementId` exists.

A stage dialogue action that penalizes `integrity` must reuse exactly those seams, but must not call `applyOutcome()` because that is terminal and sets `resolvedOutcomeId`/reward/state.

Extract or add a small private helper that applies `QuestConsequences` for a `QuestDef`, then call it from both `applyOutcome()` and the stage-action selection path. Preserve current semantics: relation deltas apply by stable NPC id; social consequence is a no-op without `settlementId`; no reward or completion sound for a stage action.

This also ensures the lie consequence is applied exactly once: after selection the stage index changes, so a stale callback must fail revalidation and cannot apply the consequence again.

### `onInteract()` needs collection/arbitration, not another early-return exception

The current bug is structural. `QuestManager.onInteract()` loops `defs` and returns early in this order per definition:

1. `resolveTalkToNpcChoice()`;
2. giver `handleGiverInteract()`;
3. non-giver `talk_to_npc`.

Because giver handling returns an active-stage reminder, a Piotr giver quest earlier in `defs` prevents a later `talk_to_npc Piotr` action from being reached. Note also the explicit `npcId !== def.giver.npcId` guard on `talk_to_npc`; that assumption should not survive a generic multi-quest action collector.

Refactor only this dispatch boundary. First collect actionable dialogue contributions for the requested `npcId`, then use informational giver text only as fallback. The collector should cover:

- active `talk_to_npc_choice` actions;
- active `talk_to_npc` actions;
- active stage `dialogueActions`;
- giver gather hand-in actions;
- giver `ready_to_report` report action;
- offer is still an `offer`, not a normal action and should preserve existing accept/decline UX.

Do not execute or advance anything while collecting. Every returned `onSelect` callback must retain the current pattern of re-reading live state before mutation.

For multiple actionable contributions, return one `QuestDialogOverride` with a stable `actions` array. A practical deterministic order is existing `defs` order and authored action order; do not sort by display text or NPC name. The `line` can come from the first actionable contribution in that same stable order. Avoid inventing dialogue aggregation prose in the manager.

Offers require care because `QuestDialogOverride` exposes only one `offer`. Preserve existing offer behavior when no active explicit action/report/hand-in targets the NPC. Do not broaden this plan into multi-offer UI unless tests prove the current authored set requires it.

Completed giver `reportLine` remains the lowest-priority fallback, as today.

### `handleGiverInteract()` currently has one side-effecting special case

Most giver handling is presentation-only until a callback is selected, but `resolve_storage_rat_infestation` can call `advanceStage()` inside `handleStorageRatInfestationGiver()` when live state is already resolved.

When restructuring `onInteract()`, do not blindly call every giver handler during an exploratory collection pass if doing so could mutate quest state. Either preserve this special path deliberately or separate actionable/presentation inspection from this polling behavior. The goal is to fix dialogue arbitration without changing rat-infestation semantics.

### Marker priority must be evaluated globally across defs

`labelMarker()` currently has the same order-dependence as `onInteract()`: within the loop, giver `active` returns `QUEST_MARKER_IN_PROGRESS` before a later quest can identify the NPC as a `talk_to_npc` target.

Do not fix this by reordering `QUESTS`. Compute whether the NPC is an active required dialogue target across all defs before falling back to giver states. Required dialogue target includes:

- `talk_to_npc` target;
- `talk_to_npc_choice` target;
- new stage dialogue-action target.

Then preserve existing giver priority among its own states (`READY`, active/in-progress, offered/available) for NPCs that are not required dialogue targets elsewhere.

### Existing UI contract should need no new dialogue component

`QuestDialogOverride` deliberately exposes `line`, optional `offer`, and optional `actions`; UI is not supposed to interpret quest ids/stages/outcomes. The new stage action and multi-quest arbitration should therefore be representable by a larger `actions` array. Trace the current consumer before implementation only to verify it renders multiple actions; do not add quest-specific UI state unless that contract is actually insufficient.

## Files to change / inspect

Primary implementation:

- `src/items/tradeCatalog.ts` — `MERCHANT_PRICES`, `MERCHANT_STOCK`.
- `src/quests/quests.ts` — stage dialogue-action authored/runtime types, validation, `zwiadowca` authored actions.
- `src/quests/materializeAuthoredQuests.ts` — authored action `npcName` → runtime `QuestNpcRef`.
- `src/quests/QuestManager.ts` — action selection/revalidation, shared consequence application, `onInteract()` arbitration, `labelMarker()` priority.

Tests:

- `src/quests/QuestManager.test.ts` — arbitration, stage actions, stale callback/idempotence, marker priority, unchanged offer/report paths.
- `src/quests/quests.test.ts` — authored definition/validation coverage.
- `src/quests/materializeAuthoredQuests.test.ts` — stable-id binding for stage dialogue actions.
- Locate the existing trade-catalog test file before editing; update expectations affected by `herb` changing from fallback trade value `3` to stocked price `5`.

Only inspect merchant/dialogue UI call-sites if a failing type/test indicates the existing `actions[]` contract is insufficient.

## Suggested implementation order

1. Add `herb` to the existing merchant catalog and adjust focused tests.
2. Add authored/runtime stage dialogue-action types plus validation.
3. Extend authored quest materialization for action NPC refs.
4. Add the two Piotr actions to `zwiadowca`; keep the existing `spot_animal stag` objective unchanged.
5. Add a revalidating stage-action selector in `QuestManager` and shared non-terminal consequence application.
6. Refactor `onInteract()` to aggregate explicit actions before informational reminders.
7. Fix `labelMarker()` using global target priority.
8. Add regression tests for the exact Piotr overlap (`zwiadowca` + `dzik-przy-szlaku`) and stale callbacks.

## Test details worth preserving

- A real `onInteractObjective({ type: 'spot_animal', kind: 'stag' })` still advances the stage directly; Piotr alternatives should no longer appear afterward.
- Both "Tak, widziałem jelenia." and "Nie widziałem jelenia." advance only from the exact unresolved stag stage to the stone stage.
- Lie applies the authored `integrity` delta once. Honest response has no integrity penalty.
- Selecting one action from a merged Piotr dialogue must not advance any other quest.
- Calling a previously captured callback after its quest/stage changed must not mutate state or apply consequences.
- `talk_to_npc` must work even when its target is also giver of another quest; do not retain the current cross-quest behavior implied by `npcId !== def.giver.npcId`.
- Keep `talk_to_npc_choice` terminal semantics unchanged; only the new stage action is non-terminal.
- Keep `gather_item` inventory removal atomic through existing `inventory.has` + `inventory.remove` path.

## Guardrails / non-goals

- No wolf-den/debug work in this implementation.
- No spawn guarantees or quest-specific worldgen for herbs/stags.
- No persisted `didSeeStag`; stage position already distinguishes the unresolved case.
- No new morality/lie state. The lie is an authored social consequence.
- No name matching in runtime quest code.
- No second dialogue manager/tree.
- No change to save schema: the new authored action definition is static; persisted progress remains `{ state, stageIndex, resolvedOutcomeId? }`.
- No repository-wide `QuestManager` refactor beyond the interaction/arbitration seam needed here.
- Do not run `pnpm docs:sync`; repository workflow handles derived docs.

Add JSDoc with `@domain quests-progression` to any new reusable public/architectural stage-action type/helper where it improves preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
