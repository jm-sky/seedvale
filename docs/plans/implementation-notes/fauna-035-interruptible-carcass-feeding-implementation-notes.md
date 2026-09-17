# Implementation notes: fauna-035 — Interruptible carcass feeding

**Plan:** [fauna-035](../fauna-035-interruptible-carcass-feeding.md)

## Verified current-code facts

- `src/fauna/animalForaging.ts`
  - owns `EAT_DURATION_SEC = 3`, `DRINK_DURATION_SEC = 2`, `FOOD_INTERACTION_RANGE`, source-target typing, carcass selection/validation and `applySourceRelief()`;
  - `SourceTarget.kind` already distinguishes `carcass` from `forage`, `feed`, `grassPatch`, `environmentalFood`, `paddockHay` and `water`;
  - `CarcassCandidate` exposes the existing `claimAsFood()`, `releaseFoodClaim()` and `markFoodConsumed()` contract;
  - carcass eligibility is centralized in `isCarcassEdible()` and corpse phase/value rules stay in `carcassFoodValue()`.

- `src/fauna/AnimalAgent.ts`
  - owns `sourceTarget`, `actionTimer`, `sourceTargetElapsed` and the cancellation lifecycle;
  - `performSourceAction(dt, target)` currently chooses only between water duration and shared eat duration:
    `target.kind === 'water' ? DRINK_DURATION_SEC : EAT_DURATION_SEC`;
  - it increments `actionTimer`, returns until the duration is reached, then calls `applySourceRelief()` and `cancelSourceTarget()`;
  - `pursueSourceTarget()` rechecks `isSourceTargetValid(...)`; invalid targets are cancelled;
  - higher-priority threat behaviour already invokes `cancelSourceTarget()` before `fleeFrom(...)`, so interruption should use that path rather than add a feeding-only escape path;
  - death while holding a carcass target also releases the source target/claim through existing cleanup logic.

- `src/fauna/predatorHumanDecision.ts`
  - already owns predator response to a noticed player/NPC as `attack | flee | ignore`;
  - the decision uses hunger, proximity, species bias, fire, crowd size, HP/provocation and encounter-stable aggression roll;
  - wolf/fox already participate in this mechanism, so player interruption should depend on the resulting normal behaviour transition, not on a special `playerNearCarcass` check.

- `src/fauna/animalForaging.test.ts`
  - already contains plain-object carcass candidates with claim/release/consume state and is the natural home for pure duration/atomicity coverage added around the foraging contract.

- `docs/state/fauna.md`
  - confirms that decision/sensing is always full-rate even under adaptive fauna cadence, while lower-priority behaviour execution can be throttled;
  - confirms predator-human intent is above the predator/prey needs branch and that source-target cancellation is part of higher-priority override behaviour;
  - confirms corpse food claims are transient locks on the existing corpse state, not a second lifecycle.

## Implementation decision

Keep the action timer in `AnimalAgent`; keep duration policy with `animalForaging.ts`.

Preferred smallest change:

1. Add `CARCASS_EAT_DURATION_SEC = 8` beside the existing eat/drink tuning.
2. Add/export a pure duration resolver in `animalForaging.ts`, for example:
   `sourceActionDuration(kind: SourceTargetKind): number`.
3. Resolve:
   - `water` → `DRINK_DURATION_SEC`,
   - `carcass` → `CARCASS_EAT_DURATION_SEC`,
   - everything else → `EAT_DURATION_SEC`.
4. Make `AnimalAgent.performSourceAction()` call that resolver instead of owning the source-kind conditional.

This preserves ownership: `AnimalAgent` executes action timing, `animalForaging` defines source interaction semantics.

## Interruption semantics

Do not add a separate interruption condition inside `performSourceAction()`.

The current top-level behaviour pipeline must stay authoritative. If a higher-priority player/threat/fire/scare branch wins, its existing `cancelSourceTarget()` call resets progress and releases the carcass claim. The corpse remains untouched because `markFoodConsumed()` is only reached after the duration completes through `applySourceRelief()`.

Verify specifically that all predator-human transitions which leave normal foraging (`flee` and `attack`) cancel `sourceTarget`. If one existing branch changes intent without cancelling the source target, fix that transition at the shared behaviour boundary rather than special-casing carcass feeding.

`ignore` must not cancel feeding merely due to player proximity.

## Timer/cadence pitfall

`docs/state/fauna.md` says behaviour execution may receive accumulated elapsed time under adaptive cadence. Nearby/important animals are `immediate`, but tests should not assume a specific frame rate. Duration logic must remain based on accumulated simulation seconds, not frame count.

Do not clamp `dt` locally in carcass feeding; the cadence system already owns accumulation/capping semantics.

## Corpse-state pitfall

Do not move feeding progress onto `animalCorpse.ts`.

The current corpse contract is atomic:

```text
claim corpse
→ approach
→ actionTimer
→ completion-time validity check / atomic mutation
→ markFoodConsumed
→ hunger relief
→ release/cancel source target
```

An interruption before the atomic mutation should leave no corpse-side partial state except the transient claim, which cancellation releases.

## Tests to add/extend

Prefer focused unit tests rather than constructing a broad gameplay fixture.

- `animalForaging.test.ts`
  - duration resolver returns `8` (or exported carcass constant) for `carcass`;
  - ordinary food keeps `EAT_DURATION_SEC`;
  - water keeps `DRINK_DURATION_SEC`;
  - existing carcass claim/consume tests remain unchanged.

- AnimalAgent/behaviour tests, where the existing harness already exercises source-target cancellation:
  - in-progress carcass feed below duration does not consume;
  - crossing duration commits exactly once;
  - cancellation before completion releases claim and does not consume;
  - returning/reclaiming starts from zero;
  - human response `flee` or `attack` interrupts through normal arbitration;
  - human response `ignore` does not introduce a forced cancellation.

Do not create a browser automation test. Player does manual browser verification.

## Non-goals confirmed by recon

- no partial meat quantity model;
- no corpse-size/eater-size scaling;
- no new player scare action;
- no new persistence field;
- no global carcass manager;
- no new off-screen feeding pipeline;
- no changes to corpse phase/scavenging eligibility.

## Suggested implementation order

1. Add carcass duration constant + pure resolver in `animalForaging.ts`.
2. Switch `AnimalAgent.performSourceAction()` to the resolver.
3. Trace existing predator-human `attack`/`flee` branches and ensure they cancel source targets consistently.
4. Add focused tests for duration and interruption/reset semantics.
5. Run fauna tests/typecheck/build required by repository conventions.
6. Leave browser/gameplay verification to the user.
