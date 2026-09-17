# Plan: Interruptible Carcass Feeding

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** high · **Effort:** S
**Depends on:** ~~fauna-005~~, ~~fauna-017~~
**Domain:** `fauna`
**Type:** `fix`
**Roadmap:** -
**Subdomains:** `predation` `lifecycle`
**Tags:** `carcass` `feeding` `predator` `interaction`
**Model:** Sonnet, Composer

## Goal

Make animal-to-animal carcass feeding a visible, interruptible action instead of an effectively instant corpse consumption.

A predator/scavenger that reaches a carcass must spend more than 5 real seconds feeding before the existing atomic corpse-consumption commit occurs. While feeding, normal higher-priority threats — especially a nearby player that the predator decides to flee from — must be able to interrupt the action and preserve the carcass for later use.

Extend the existing `AnimalAgent` + `animalForaging` pipeline. Do not create a second feeding state machine or a player-specific carcass reservation system.

## Current behaviour verified in code

- `animalForaging.ts` defines one shared `EAT_DURATION_SEC = 3` for every non-water source action.
- `AnimalAgent.performSourceAction()` increments the existing `actionTimer` and calls `applySourceRelief()` only when the duration is reached.
- A carcass is already claimed while targeted and the claim is released by `cancelSourceTarget()` / completion.
- `isSourceTargetValid()` is checked while pursuing the source, and `applySourceRelief()` revalidates/mutates atomically at completion.
- Top-level fauna behaviour already has higher-priority threat/human branches; threat branches call `cancelSourceTarget()` before fleeing.
- Predator-vs-human behaviour already decides `attack` / `flee` / `ignore` from species, distance, hunger, provocation, fire and nearby humans. The feeding fix must reuse that decision rather than inventing a special "player scares feeding predator" rule.

## 1. Separate carcass feeding duration

Do not lengthen all animal eating merely to fix carcass feeding.

Introduce a carcass-specific duration in the existing foraging action timing contract, e.g.:

```text
water       → existing drink duration
carcass     → CARCASS_EAT_DURATION_SEC (> 5 s; initial tuning: 8 s)
other food  → existing EAT_DURATION_SEC
```

The duration is real simulation seconds, consumed by the existing `actionTimer`.

Prefer a small pure helper such as `sourceActionDuration(target.kind)` if that keeps `AnimalAgent.performSourceAction()` free of another growing conditional. Keep the tuning constant with `animalForaging.ts`, which already owns food-source interaction ranges and durations.

## 2. Feeding remains an in-progress source action

Re-use the existing state:

- `sourceTarget` identifies the carcass,
- `actionTimer` is progress,
- carcass `foodClaimedBy` prevents competing consumers from committing the same corpse.

Do not add `isEatingCarcass`, a parallel timer, a new manager, or corpse-owned progress state.

The corpse must remain unconsumed until the timer completes. No hunger relief or `markFoodConsumed()` before completion.

## 3. Interrupt feeding through normal behaviour arbitration

While the predator is feeding, normal full-rate decision/sensing must continue.

Any existing higher-priority branch that replaces the needs/foraging behaviour and calls `cancelSourceTarget()` must abort the feed immediately. This includes at minimum a player encounter that resolves to `flee`, fire avoidance and other existing threat/flee overrides.

Cancellation must:

1. reset the current source action progress through the existing target-cancel path,
2. release the carcass food claim,
3. leave the corpse unconsumed,
4. allow another animal or the same predator to claim it later.

Do not give the player absolute priority over the carcass. A predator may still decide to attack or ignore the player according to `predatorHumanDecision.ts`; only an actual behaviour change that cancels the source action interrupts feeding.

## 4. Restart semantics

After interruption, a later return to the carcass starts a new feeding action from zero.

Do not persist partial eating progress on the carcass in this fix. The existing consumption operation is atomic and this plan preserves that ownership model.

This deliberately avoids a larger "meat quantity per corpse / partial scavenging" redesign.

## 5. Completion-time safety

Keep the current completion-time validation contract:

- target must still be valid,
- corpse must still be edible,
- the eater must still own/hold the relevant claim,
- only then may `applySourceRelief()` mark the corpse consumed and relieve hunger.

If the player harvests, the corpse changes phase/state, or another existing lifecycle event invalidates the source before completion, feeding must not grant hunger relief.

## 6. Presentation and feedback

No new bespoke UI is required.

If an existing animal intent/debug label can represent the active source action, expose enough information to distinguish `carcass` feeding and its elapsed/remaining action time. Do not create a dedicated HUD or progress bar as part of this fix.

A future feeding animation can hook into the same active source action, but animation work is out of scope unless an appropriate existing clip/state already exists and can be wired trivially.

## Ownership

```text
animalForaging.ts
  → source-kind action duration tuning
  → carcass validity and atomic consumption

AnimalAgent
  → sourceTarget + actionTimer lifecycle
  → behaviour arbitration and cancellation

animalCorpse.ts / AnimalAgent corpse delegates
  → claim / release / consumed corpse state

predatorHumanDecision.ts
  → existing decision whether the player causes flee/attack/ignore
```

## Out of scope

- partial corpse meat quantities,
- predator-size vs carcass-size consumption amount,
- new feeding/scavenging manager,
- player ownership or reservation of kills,
- new predator fear model,
- new interaction key for "scare animal",
- new feeding animation set,
- corpse lifecycle redesign,
- off-screen simulation redesign.

## Verification

### Duration

1. Kill a deer and allow a fox/wolf to reach the corpse.
2. The carcass must remain available for the full feeding window.
3. Animal-to-carcass consumption must take more than 5 real seconds; initial target is 8 seconds.
4. Ordinary non-carcass food and drinking keep their existing timings.

### Player interruption

1. Start a predator feeding on a carcass.
2. Approach during the feeding window so existing predator-human logic resolves to `flee`.
3. The predator stops feeding and flees.
4. The carcass remains unconsumed and harvestable/claimable.
5. The food claim is released.
6. If the predator later returns, feeding starts again from zero.

### Non-flee outcomes

1. If predator-human logic resolves to `ignore`, feeding is not cancelled merely because the player exists nearby.
2. If it resolves to `attack`, the normal attack behaviour takes precedence and the feed is cancelled through the existing behaviour transition.
3. No special fox-only or player-only branch is introduced.

### Atomicity/regression

1. Two predators cannot both complete the same carcass consumption.
2. Invalidating/harvesting the corpse before timer completion grants no hunger relief.
3. Existing corpse phase/scavenging eligibility remains unchanged.
4. Existing threat/fire/scare behaviour continues to cancel source targets correctly.
5. Run relevant fauna/foraging tests and build.

Player performs browser verification; AI should not run browser verification.

Important architectural/public helpers added for this plan should receive concise JSDoc where useful for preflight discovery, using `@domain fauna` where appropriate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
