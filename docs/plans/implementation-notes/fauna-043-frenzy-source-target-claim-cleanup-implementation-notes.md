# Implementation notes: fauna-043 — Frenzy source-target claim cleanup

**Recon date:** 2026-09-19  
**Target:** `main`  
**Source plan:** `docs/plans/fauna-043-frenzy-source-target-claim-cleanup.md`

## Current code state

The defect is present exactly at the two behaviour execution branches named by the plan.

`src/fauna/AnimalAgent.ts` owns the runtime `frenzied` flag and `strategicVillage`. `setFrenzied(village)` sets `frenzied = true` and copies the strategic village. Frenzy is runtime-only and has no persistence field.

The top-level behaviour switch already uses `cancelSourceTarget()` whenever a branch abandons a food/water source for an incompatible action, including:

- `fire-avoid`;
- normal `npc-attack`;
- `npc-flee`;
- `player-attack`;
- player/prey flee;
- `scare-flee`.

Two branches deliberately retain an older asymmetry and contain comments documenting the omission:

- `frenzy-beeline`;
- `npc-attack-frenzied`.

Those comments now describe the bug this plan removes.

## Ownership and lifecycle

### Frenzy state

Owner: `src/fauna/AnimalAgent.ts::AnimalAgent`.

Relevant symbols:

- private `frenzied`;
- private `strategicVillage`;
- `setFrenzied(village)`;
- `isFrenzied()`;
- `arrivedAtStrategicVillage()`;
- `moveTowardStrategicVillage()`;
- the `FaunaDecisionInput.frenzied` value passed into `decideFaunaBehaviour()`.

There is currently **no live frenzy → non-frenzy transition**. `setFrenzied()` only sets the flag true; no production call clears it. After arriving at the strategic village, `faunaDecision.ts` can choose ordinary predator behavior because `frenzy-beeline` is no longer valid, but the `frenzied` flag itself remains true. Death/dispose end the runtime instance rather than clearing frenzy.

Therefore this fix must not invent a frenzy reset. “Source target may be reacquired after frenzy no longer overrides needs” means when decision priority returns to a branch that executes `updatePredator()` / `pursueNeeds()`, not that `frenzied` becomes false.

### Source-target state

Owner: `AnimalAgent`.

Relevant fields/flow:

- private `sourceTarget: SourceTarget | null`;
- source search/selection through `pursueNeeds()` and `src/fauna/animalForaging.ts`;
- carcass selection `findCarcassTarget(...)`;
- claim acquired at selection by `CarcassCandidate.claimAsFood(eater)`;
- target revalidation through `isSourceTargetValid(...)`;
- movement/action through `pursueSourceTarget()`;
- completion through `performSourceAction()` / `applySourceRelief()`;
- cancellation through `AnimalAgent.cancelSourceTarget()`.

`cancelSourceTarget()` is already the single runtime cleanup seam: when the target is a carcass it calls `sourceTarget.corpse.releaseFoodClaim(this)`, then clears the cached target/action state.

Do not duplicate this logic in the decision switch.

### Corpse claim state

Owner: `src/fauna/animalCorpse.ts::AnimalCorpseState`.

`claimedBy` is transient runtime state, not persisted.

Existing contract:

- `claimCorpseAsFood(state, by)`: claims only if available; same claimant is idempotent;
- `releaseCorpseClaim(state, by)`: clears only when the same claimant releases;
- `markCorpseFoodConsumed(...)`: marks the current corpse phase consumed and clears the claim;
- `AnimalAgent.claimAsFood()/releaseFoodClaim()/markFoodConsumed()`: thin cross-agent delegates used by `animalForaging.ts`.

The decision layer must continue to use these delegates indirectly through `cancelSourceTarget()`.

## Transition points and stale-reference windows

### Normal source pursuit → frenzy beeline

A hungry predator can own a carcass claim in `sourceTarget`. If it then takes `frenzy-beeline`, current code resets human threat state and moves toward the strategic village without touching `sourceTarget`.

Result: the predator no longer executes source pursuit, but the corpse still has `claimedBy === predator`.

Fix: call `cancelSourceTarget()` at the branch execution boundary before beeline movement.

### Normal source pursuit → frenzied NPC attack

The same stale claim can survive when `npc-attack-frenzied` takes over. Current code sets `threateningHuman`, intent and chase without source cancellation.

Fix: call `cancelSourceTarget()` before attack intent/chase, matching normal `npc-attack`.

### Invalid NPC target during frenzy

NPC target commitment is independently resolved from the caller-bounded nearby-NPC list. If a committed target disappears, NPC targeting can be dropped/reselected and decision can fall back to `frenzy-beeline` or another valid branch.

With this plan, both frenzy branches that abandon feeding cancel the source, so target invalidation does not need a second carcass-cleanup mechanism.

Do not couple NPC-target cleanup to carcass claims.

### Source invalidation

When normal needs execution is active, the existing source lifecycle revalidates `sourceTarget`; invalid/expired/unavailable sources are cancelled through the existing cleanup path. Preserve this.

The bug exists specifically because frenzy branches bypass the normal source-pursuit code that performs those checks.

### Death

`AnimalAgent.collapse()` already calls `cancelSourceTarget()` before the dead-agent update early return can strand a claim. Existing `AnimalAgent.test.ts` has a regression test proving a second predator can claim the corpse after the claiming predator dies.

Do not change this path.

### Dispose / despawn

`AnimalAgent.dispose()` also calls `cancelSourceTarget()` idempotently before corpse disposal. This covers teardown/despawn after `collapse()` as well as direct disposal.

No extra manager-level cleanup is needed.

## Exact files / symbols to change

Primary implementation:

- `src/fauna/AnimalAgent.ts`
  - behaviour execution switch;
  - `case 'frenzy-beeline'`;
  - `case 'npc-attack-frenzied'`;
  - existing `cancelSourceTarget()`.

Tests:

- `src/fauna/AnimalAgent.test.ts` — preferred location for stateful claim/branch regression coverage;
- `src/fauna/faunaDecision.test.ts` only if necessary to pin branch selection inputs; the pure decision priority itself does not need to change;
- existing `src/fauna/foodWaterTargeting.test.ts` remains the lower-level source/carcass eligibility coverage.

Reference-only; no behavior change expected:

- `src/fauna/animalForaging.ts` — `SourceTarget`, `CarcassCandidate`, `findCarcassTarget`, `isSourceTargetValid`, `applySourceRelief`;
- `src/fauna/animalCorpse.ts` — claim/release/consumption primitives;
- `src/fauna/faunaDecision.ts` — branch priority/validity.

## Required implementation

Keep the change deliberately small.

1. In `npc-attack-frenzied`, call the existing `cancelSourceTarget()` before starting/continuing the incompatible attack branch.
2. In `frenzy-beeline`, call the same cleanup before moving toward the strategic village.
3. Remove/update the comments that say the omission is deliberate.
4. Do not change `resetHumanThreatState()`; source cleanup is not part of that helper because several branches intentionally keep source execution semantics separate.
5. Do not add a frenzy-specific corpse helper unless tests expose another identical transition that truly needs it. Two direct calls are consistent with the existing switch and avoid a refactor.

`cancelSourceTarget()` is idempotent when no source exists, so repeated ticks in either frenzy branch are safe.

## Contracts to preserve

- Frenzy remains runtime-only.
- `setFrenzied()` and strategic-village ownership are unchanged.
- NPC target commitment and aggression/fear scoring are unchanged.
- `faunaDecision.ts` priority ordering is unchanged.
- `npc-ignore` continues through `updatePredator()` and must **not** cancel a source merely because an NPC was noticed.
- `player-ignore` likewise continues normal predator execution and keeps the existing feeding behavior.
- Normal uninterrupted feeding retains its carcass claim until completion, invalidation, explicit interrupt, death or dispose.
- Only `animalCorpse.ts` mutates the claim state; decision code does not touch `claimedBy`.
- No persistence/schema change.

## Test shape

Add two branch-level regressions in `AnimalAgent.test.ts` using the existing capsule-fallback construction style.

### Frenzy beeline

1. Create a dead edible prey corpse.
2. Create hungry predator A close enough to select/claim it during a normal predator update.
3. Assert another claimant cannot claim the corpse.
4. Call `predatorA.setFrenzied(village)` with a strategic village not yet reached and with no higher-priority player/NPC branch.
5. Tick A so `frenzy-beeline` executes.
6. Assert a second claimant/predator can now claim the corpse.

### Frenzied NPC attack

1. Establish the same pre-existing carcass claim under normal behavior.
2. Set frenzy and provide a nearby NPC candidate that makes `npc-attack-frenzied` the selected branch.
3. Tick once.
4. Assert the corpse claim is released and a second eligible claimant can acquire it.

Use the existing decision inputs/candidate types rather than private-field access. If intent scoring makes the NPC branch non-deterministic, use the narrowest already-supported test setup/control; do not expose a new production debug API solely for the test.

### Regression assertions

Keep or add assertions that:

- ordinary normal feeding still holds the claim while in progress;
- `npc-ignore`/normal continuation does not spuriously release it;
- death still releases exactly once (existing test);
- direct `dispose()` after a held claim remains safe/idempotent if not already covered.

No test needs to alter `animalCorpse.ts` claim semantics.

## Risks

- **Over-broad cleanup helper:** putting `cancelSourceTarget()` inside `resetHumanThreatState()` would change branches that use that helper for reasons unrelated to feeding and would blur ownership.
- **Changing decision priority:** unnecessary; the defect is execution cleanup after a branch has already been chosen.
- **Clearing frenzy/NPC commitment accidentally:** `cancelSourceTarget()` must remain source-only; do not reset `frenzied`, `strategicVillage` or NPC commitment.
- **Testing the wrong transition:** calling `setFrenzied()` alone does not currently cancel the source. The contract in this plan is cleanup when the incompatible behavior branch executes.
- **Assuming a frenzy-off path exists:** none exists on current `main`.

## Out of scope

- frenzy rebalance or lifecycle redesign;
- adding `clearFrenzied()`;
- changing NPC target commitment;
- changing source-selection scoring or carcass food values;
- persistence of frenzy or claims;
- corpse reservation redesign;
- broad `AnimalAgent` decision refactor.

## Plan/code discrepancies

No architectural correction is required to the plan's core fix: both named branches still omit `cancelSourceTarget()`, and death-side cleanup still exists.

One clarification from current code should guide implementation: frenzy does not transition back to `false`. The source can be reacquired when ordinary predator needs execution becomes reachable again (for example after the strategic beeline no longer applies), while the `frenzied` flag may remain true.

## Manual verification — user

After implementation, user can verify in browser/debug gameplay:

1. arrange or observe a hungry predator feeding/approaching a carcass;
2. trigger the existing frenzy wolf debug flow while the claim is active;
3. confirm the wolf abandons the corpse and continues toward the settlement/NPC;
4. confirm another scavenger can use that corpse instead of being blocked by the departed wolf;
5. confirm normal feeding still works when frenzy does not interrupt it.

The implementing agent should run focused automated/technical checks only and must not perform browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
