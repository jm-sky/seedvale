# Plan: NPC need action result revalidation and atomic relief

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** S
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `needs` `decision-making` `lifecycle`
**Tags:** `revalidation` `resources` `actions`
**Roadmap:** -

## Goal

Make detailed NPC need satisfaction commit only after the authoritative resource operation actually succeeds.

Decision-time strategy availability remains a preview. Another actor may consume or invalidate a selected source while the NPC is travelling; that race must cause normal re-planning, not free hunger/thirst/duty relief.

Do not redesign the pressure, strategy or action FSM.

## Confirmed current defects

### Household food

`NpcAgent.beginNeed('food')` selects `householdFood` from live stock, but completion ignores the `ItemKind | null` result of `Household.takeFood()` and always calls `relieveNeed(..., 'food')`.

If another consumer takes the final food unit after selection but before completion, the NPC receives hunger relief without consumption.

### Household water

`householdWater` selection checks `WaterReserve.has()`, but completion later calls the clamping `remove()` and always relieves thirst.

The reserve can be consumed by another NPC/animal during travel, so selection-time eligibility is stale by completion.

### Wood duty

The chop action correctly allows `harvestWorldTreeFully()` to fail when the tree was already harvested by another actor. In that case `harvestedYields` remains empty, but the chained deposit still calls `relieveNeed(..., 'wood')`.

The resource is not duplicated, but cognition records successful duty completion without any harvest.

## Scope

### 1. Treat strategy availability as advisory

Preserve the existing candidate/selection architecture:

```text
pressure wins
→ strategy availability preview
→ action starts
→ authoritative source revalidation at effect time
→ mutation succeeds
   → relief / plan progress
→ mutation fails
   → no relief / no false progress
   → ordinary next choose() re-plans
```

Do not reserve household food/water at decision time and do not add a resource-lock manager.

### 2. Food completion must use the real transaction result

For `householdFood`:

- call the existing `Household.takeFood()` at completion;
- only relieve hunger when it returns a consumed `ItemKind`;
- when it returns `null`, leave hunger unchanged and return to normal arbitration.

Audit other direct food-consumption completion handlers in `NpcAgent` while implementing and apply the same rule where an existing removal API already exposes failure.

Do not change abstract production/gather semantics unless their own authoritative operation can fail.

### 3. Water removal must expose success through the existing owner

Keep `Household.water` as the only household water owner.

Prefer extending the existing `WaterReserve.remove(amount)` contract to report whether the requested amount was actually removed (or the amount removed), with existing callers free to ignore that return where appropriate. Do not add a second `tryRemoveWater` state path beside the reserve.

`householdWater` need relief is allowed only after a full requested drink was removed.

Review current animal/NPC water consumers when changing the return type so the shared owner remains coherent.

### 4. Wood duty relief must require real harvest output

When `harvestWorldTreeFully()` fails or produces no harvested units:

- do not relieve the wood duty;
- do not progress the `obtainWood` plan;
- let the next decision choose/re-query another source.

A no-op deposit leg is not itself a correctness issue, but the implementation may skip it if that can be done without introducing a second action-chain mechanism. Do not broaden `NpcPlannedAction` solely to optimize away one empty walk unless current code provides a small reusable seam.

On successful harvest, preserve the existing household/economy deposit and overflow ownership.

### 5. Execution result and Plan semantics

A failed resource commit must not be translated into semantic success:

- no `relieveNeed`,
- no positive `progressActivePlan`,
- no source-independent fallback mutation.

The concrete action may still finish its physical lifecycle; the next `choose()` is the retry mechanism. Do not persist a “retry action” or stale target.

If existing trace infrastructure can record the failed domain result without new state, add a focused trace reason; diagnostics must not become a second lifecycle owner.

## Relevant files / symbols

- `src/ai/NpcAgent.ts::beginNeed`
- `NpcAgent` execute/chained-action completion path
- `src/settlement/household.ts::Household.takeFood`
- `src/settlement/household.ts::WaterReserve.remove`
- `src/ai/Needs.ts::relieveNeed`
- `src/ai/npcStrategies.ts`
- `src/ai/npcPlan.ts`
- tree harvest/deposit helpers already called from the wood branch
- focused NPC/household tests around stale completion state.

## Tests

Add focused tests proving:

1. two consumers can select the last household food unit, but only the one whose `takeFood()` succeeds gets hunger relief;
2. household food disappearing between selection and completion leaves hunger unchanged;
3. household water disappearing between selection and completion leaves thirst unchanged;
4. successful household water removal still grants exactly the current relief;
5. a tree becoming unavailable before chop completion yields no wood-duty relief and no Plan progress;
6. a successful harvest retains current deposit/overflow and Plan progress semantics;
7. retry is ordinary re-arbitration — no stale target/action survives solely to force the old strategy.

Prefer pure or focused unit tests; do not require browser/asset loading.

## Guardrails

- no second Needs implementation;
- no reservation manager for pantry/water;
- no duplicate household resource state;
- no new action FSM;
- no broad strategy reprioritization;
- no time-skip changes here — `npc-058` owns that path;
- no unrelated profession/logistics refactor;
- preserve caller-bounded decision/threat behavior.

## Verification

Automated tests own stale-source and atomic-relief invariants.

Browser verification is performed by the user: create household contention for scarce food/water and, separately, invalidate a selected tree before the NPC completes the action; verify the losing NPC remains needy and re-plans instead of receiving free relief.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
