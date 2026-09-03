# Plan: Player Gathering and Fire Cooking Polish

**Created:** 2026-09-01
**Status:** `verification needed` 🔍 — existing fish/Quick Actions work is implemented; browser/gameplay verification pending. Tree branch gathering changes described below are pending.
**Priority:** medium · **Effort:** M
**Depends on:** ~~106~~ ~~122~~ ~~159~~
**Domain:** `items-player`
**Tags:** `cooking` `gathering` `quick-actions` `tree` `branches`
**Roadmap:** `player-systems.md`

## Goal

Resolve three gameplay issues found during playtesting:

1. freshly caught fish cannot be cooked,
2. `Zbuduj ognisko` is available only under **Budowa** in Quick Actions,
3. branches can currently be harvested from the same tree without a meaningful limit.

Extend the existing cooking, Quick Actions and tree lifecycle mechanisms. Do not create parallel systems.

## Scope

### 1. Fish cooking

Inspect the existing fishing reward path, item definitions and cooking pipeline.

A caught fish must be a distinct food type from terrestrial meat:

`raw fish → cooked fish`

Do **not** convert fish into `roasted_meat` or otherwise represent fish as deer/other animal meat.

Reuse the existing cooking station/fire interaction, food classification and inventory mechanisms wherever possible. If the current item model requires a cooked-fish item, add it through the existing item catalog rather than creating a fish-specific cooking system.

Preserve fish species identity where the existing item model supports it.

### 2. Quick Actions — fire category

Make `Zbuduj ognisko` available in both:

- **Budowa**
- **Ogień**

Reuse the existing multi-category mechanism if one already exists. If the action model currently supports only one category, extend that model generically rather than adding a campfire-specific exception.

The same action must remain a single action definition/instance; it must not execute twice or behave differently depending on which category exposed it.

**Important:** the separate inconsistency involving the `fire_starting` capability check is **out of scope for this plan**. Do not refactor campfire requirements, capability validation or action result contracts here. That cleanup will be handled separately.

### 3. Tree branches — interaction vs axe gathering

Use the existing `TreeLifecycle` / tree resource lifecycle as the owner of branch availability.

The existing tree-size-dependent branch pool is correct and must be preserved:

| Tree size | Branch pool per regeneration cycle |
|---|---:|
| small | 1–3 |
| medium | 2–4 |
| large | 3–6 |

The pool must be rolled once for a tree's regeneration cycle using the existing deterministic/randomness conventions.

#### `[E]` tree interaction

The existing tree interaction currently harvests the whole branch yield. Change it so that a successful `[E]` interaction provides **exactly 1× branch**, provided at least one branch remains available in the current cycle.

`[E]` must not:
- grant the complete tree yield,
- roll a new yield,
- start regeneration while branches remain,
- grant branches after the tree's current branch pool has been exhausted.

The interaction remains an immediate loot interaction. Do **not** turn it into a separate inspect-only interaction in this plan.

#### Axe gathering

The existing axe-based gathering/chopping mechanism should collect the **remaining available branch quantity** from the tree.

Example:

`large tree → rolled pool 5`

`[E] → 1 branch`

`axe gathering → remaining 4 branches`

Total collected from that regeneration cycle must never exceed 5.

Reuse the existing axe/gathering action and item/inventory mechanisms. Do not create a parallel branch-gathering system.

If the existing axe action has a different semantic name or entry point, adapt the implementation to the actual current code rather than introducing a duplicate action solely for branches.

#### Branch lifecycle

Branch availability must be represented as state belonging to the existing tree lifecycle.

The implementation must distinguish at least conceptually between:
- total branch pool rolled for the current cycle,
- branches already collected,
- branches remaining,
- regeneration/depleted state.

Do not re-roll the full 1–3 / 2–4 / 3–6 yield after `[E]`.

When the remaining branch quantity reaches zero, use the existing regeneration/cooldown mechanism. Further branch collection before regeneration must produce no branches and must not reset, extend or otherwise manipulate the regeneration time.

Do not introduce a generic resource-regeneration framework.

### Persistence and lifecycle

Inspect the existing sparse tree depletion/lifecycle persistence model.

The implementation must not introduce an obvious save/reload exploit that resets branch regeneration for free. If the existing tree lifecycle can derive the branch regeneration state from persisted timestamps/state, extend it rather than creating a new save collection.

Also verify that an in-session WorldBundle rebuild does not accidentally reset the branch regeneration state.

Do not broaden persistence into a general simulation snapshot.

## Non-goals

- New fish species.
- A separate fish-cooking system.
- Reworking the entire cooking system.
- Reworking Quick Actions UI.
- Separate inspect-only tree interaction.
- New tree size/type taxonomy.
- Changing the existing small/medium/large branch pool ranges.
- Campfire capability/requirements refactor.
- Campfire action result/validation architecture cleanup.
- A generic regeneration framework for every natural resource.
- Changes to tree chopping/cutting lifecycle beyond what is required for branches.
- NPC branch gathering.
- New animations or VFX.
- Broad food/economy balancing.

## Implementation order

1. Recon the current fishing reward, food/item catalog, cooking, Quick Actions and tree lifecycle/resource persistence paths.
2. Implement fish cooking through the existing cooking pipeline.
3. Add the second Quick Actions category to the existing campfire action.
4. Extend the existing tree lifecycle with per-tree branch regeneration and size-based yield.
5. Add focused automated tests for the new rules and relevant persistence/lifecycle behaviour.
6. Run technical checks.
7. Provide concrete browser/gameplay verification steps for manual verification.

## Verification

### Fish

- Catch a fish.
- Confirm it appears as the raw fish item.
- Cook it at an available fire/cooking station.
- Confirm the raw fish is consumed and a cooked-fish item is produced.
- Confirm it is not converted into `roasted_meat`.

### Quick Actions

- Open Quick Actions and inspect **Budowa**.
- Confirm `Zbuduj ognisko` is present.
- Inspect **Ogień**.
- Confirm the same action is present there.
- Confirm selecting it from either category performs exactly one build action.

### Branches

- Harvest branches from small, medium and large trees.
- Confirm yields stay within 1–3, 2–4 and 3–6 respectively.
- Immediately attempt another harvest from the same tree.
- Confirm no additional branches are produced.
- Advance world time past the regeneration period.
- Confirm the tree can provide branches again.
- Save/load around the regeneration period and confirm the lifecycle is not incorrectly reset.

## Architectural constraints

- Extend existing systems before adding abstractions.
- Keep tree regeneration state owned by the tree lifecycle.
- Keep fish as a distinct food identity.
- Keep Quick Actions category membership data-driven.
- Preserve deterministic simulation conventions.
- Avoid unrelated refactors.

When adding or substantially changing public/architectural functions or classes, add concise JSDoc with `@domain` where useful for implementation preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
