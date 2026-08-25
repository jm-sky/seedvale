# Implementation Notes: NPC Candidate Strategies

**Plan:** `docs/plans/ai-003-npc-candidate-strategies.md`
**Reviewed:** 2026-08-25
**Status:** `verification needed` 🔍

## Review verdict

Plan fits the current architecture, but its description of the `food` alternatives is already slightly stale. `NpcAgent` now has the real-food source path from plan 174 and the hunter profession can attempt a real hunting expedition before falling back to food-source gathering. Do not implement ai-003 from the plan text alone.

The correct boundary is still:

```text
NeedId → candidate strategies → selected strategy → existing begin/action path
```

Do not introduce `StrategySystem`, planner, new FSM, or a second action model.

## Existing systems to reuse

- `src/ai/NpcAgent.ts` — authoritative `choose()`, need selection, `beginNeed()` and `PlannedAction` execution. Keep execution ownership here.
- `src/ai/Needs.ts` — `NeedId`, `NpcPressure`, `generateNeedPressures()` and deterministic pressure selection. Do not move strategy logic into `Needs.ts`.
- `src/ai/decisionModifiers.ts` — ai-002 already produces `ScoredNeedCandidate`; strategy selection must happen **after** need arbitration, not replace it.
- `src/simulation/` — reuse existing `PlannedAction`/`DecisionContext`/deterministic selection helpers. Keep these domain-agnostic.
- `src/world/foodSources.ts` — `SettlementFoodSourceHooks.queryNearest()` is already the bounded, loaded-chunk food discovery seam. `FoodSourceTarget` is temporary world identity, not copied state.
- `src/settlement/household.ts` — household `stock` is the authoritative family food reserve. Do not create strategy-specific inventory/state.
- `src/debug/npcTrace.ts` and `NpcInspectionSnapshot`/`NpcWhy` — extend existing diagnostics rather than adding another trace system.

`NpcTraceEvent` already records the exact pressure/candidate list used by ai-001/002, so strategy diagnostics should follow the same authoritative-data rule. fileciteturn16file0L2-L2

## Important current-code corrections

### 1. Food does not have exactly the three plan-described routes

`foodSources.ts` treats natural edible items and mature crops as one `FoodSourceTarget` query. It deliberately does **not** distinguish "settlement garden" from player garden at the NPC decision layer: both are ordinary `CropPlacement`s. fileciteturn10file0L2-L2

Therefore do not create a `settlementGarden` strategy merely because the plan names one. The concrete existing source strategy is better represented as `nearbyFoodSource` (with target `item | crop`). The garden origin remains world/resource ownership, not an AI strategy.

### 2. Hunter is an existing food route

Current `NpcAgent` already has hunter-specific food behaviour and household item storage for hunted meat/hide. The plan's food strategy list predates that implementation. Do not accidentally bypass or regress hunting when extracting the hidden alternatives from `beginNeed()`.

If ai-003 makes all existing food routes explicit, `hunt` should be a candidate only when the existing hunter conditions make it genuinely available. It must reuse the current hunting/combat/harvest pipeline; no new hunting implementation belongs here.

### 3. `water` and `waterDuty` are different needs

`NeedId.water` is personal thirst. `NeedId.waterDuty` is household water provisioning. Keep their existing action paths separate. Do not treat a household water reserve as a candidate for personal thirst merely because both concern water. `Needs.ts` is explicit about this distinction. fileciteturn17file0L2-L2

## Recommended strategy shape

Use a small domain-local representation, e.g. a discriminated `NpcStrategyId` plus minimal candidate metadata. It is acceptable to place the pure types/generation in a small `src/ai/` module, but it must remain a lightweight helper, not a manager/service.

Candidate generation should answer only:

```text
Which existing ways can this selected NeedId currently be satisfied?
```

It should not mutate resources, create `PlannedAction`, or perform movement.

For food, conceptually:

```text
householdFood
nearbyFoodSource
hunt (when current hunter path is available)
```

For water / duties, use the actual alternatives currently present in `beginNeed()` rather than copying the stale plan list. `wood` currently has a single concrete chop/deposit route and should not gain artificial alternatives just to exercise the abstraction.

## Availability / constraints

Do not build a parallel availability system.

Use the existing authoritative checks:

- household stock / reserve from `Household`;
- `SettlementFoodSourceHooks.queryNearest()` for nearby edible world targets;
- existing well lookup for personal thirst;
- existing tree/forest/workplace/economy hooks for wood and duties;
- existing hunter eligibility and hunt-target lookup for hunting.

Availability should be determined at decision time and the chosen target must still be revalidated by the existing action/resource owner when executed. A candidate becoming invalid while the NPC travels is normal world behaviour, not a reason to duplicate world state inside the strategy layer.

`foodSources.ts` already gives deterministic nearest selection with loaded-chunk bounds and stable id tie-breaking. Reuse it; do not rescan chunks from the new strategy code. fileciteturn10file0L2-L2

## Selection semantics

Do **not** introduce a second utility/scoring engine for strategies in ai-003.

For v1, selection should be deterministic and minimal:

```text
candidate strategies
→ availability filter
→ existing ordering / explicit small preference if justified
→ selected strategy
```

The first strategy version does not need personality modifiers. ai-002 scores the **need**, while ai-003 chooses a concrete way to satisfy that need. Keep those two decisions separate.

If two available strategies are intentionally ordered, document the order and keep it deterministic. Do not use `Math.random()`.

## Integration boundary

The safest extraction is around the existing `NpcAgent.beginNeed()` alternatives:

```text
choose()
  → generate pressures
  → score/pick NeedId (ai-001/002)
  → getCandidateStrategies(NeedId, current world context)
  → selectStrategy(...)
  → existing strategy execution branch
  → existing PlannedAction / world mutation
```

Do not refactor all of `beginNeed()` at once. Extract the decision seam first, then route each selected strategy back into the existing branch/action code. This reduces regression risk in movement, queues, arrival validation and resource mutation.

Do not modify `PlannedAction` merely to carry a strategy id. If diagnostics need the selected strategy, keep it as NPC decision metadata alongside the existing action state.

## Diagnostics

Extend the existing inspection/trace path with plain data:

```text
lastStrategyCandidates
selectedStrategy
```

Prefer candidate entries containing only stable identifiers and availability/reason information, e.g. `householdFood: unavailable`, `nearbyFoodSource: available`.

The trace should show the causal chain:

```text
need.selected
→ strategy selected
→ action.planned
```

Do not recompute strategy candidates in `NpcWhy` or UI. The recorded values must be the exact values used by selection, following the ai-001/002 diagnostic pattern. `NpcTraceBuffer` is already bounded and semantic-event based, so it is appropriate for this addition. fileciteturn16file0L2-L2

## Tests

Prefer pure tests for candidate generation/selection and a small number of `NpcAgent` integration tests.

Cover at least:

- one available strategy is selected unchanged;
- unavailable household food is excluded;
- nearby food source is available only when `queryNearest()` returns a target;
- hunter strategy cannot appear for a non-hunter;
- hunter strategy preserves the existing hunt path;
- strategy selection is deterministic on identical inputs;
- an invalidated source does not grant food/water and falls back through the existing action/re-evaluation path;
- existing need pressure values and ai-002 ranking remain unchanged;
- critical-need interrupts do not acquire new strategy semantics accidentally.

Do not add Three.js to the pure candidate/selection tests.

## Performance / lifecycle pitfalls

- Strategy generation runs only during an NPC decision, never every frame.
- Do not create a global strategy/source registry.
- Do not scan all world resources or unloaded chunks.
- Do not persist strategy candidates or selected strategy as authoritative simulation state; current NPC AI state itself is not a full save snapshot. fileciteturn1file0L2-L2
- Keep `WorldBundle` ownership/wiring intact when passing existing resource hooks into `NpcAgent`.
- Avoid allocations larger than a small candidate array per decision.
- Do not move this work to a Worker.

## Dependencies / related implementation

Before coding, inspect the current `NpcAgent.beginNeed()` branches together with:

- `src/world/foodSources.ts` — plan 174 food source implementation;
- `src/settlement/household.ts` — household stock/water ownership;
- player-well lookup already injected into `NpcAgent`;
- hunter implementation (`SettlementHuntingHooks`, `HuntTarget`, ranged combat + harvest);
- `src/ai/Needs.ts` and `src/ai/decisionModifiers.ts` — ai-001/002 decision boundary;
- `src/debug/npcTrace.ts` — existing decision trace.

The repository state explicitly says household food/wood/water, bounded food discovery and hunter behaviour are already implemented. fileciteturn1file0L2-L2

## Main architectural decision

The useful abstraction is **candidate strategies as temporary decision data**, not a persistent strategy object or planner:

```text
NeedId
  ↓
small candidate list
  ↓
select one
  ↓
existing action pipeline
```

This gives ai-003 the intended `Pressure → Strategy → Action` seam while preserving the current ownership model and leaving a future `Strategy → Plan → Actions` step possible without prematurely designing it.

## What was actually built (2026-08-25)

Implemented, technically verified (`tsc`/`lint`/`build`/`test` all green),
browser/gameplay verification still pending:

- New `src/ai/npcStrategies.ts` — pure, Three.js-free candidate generation:
  `NpcStrategyId`, `NpcStrategyCandidate`, `getFoodStrategyCandidates()`
  (`householdFood` → `hunt`, hunter-only → `nearbyFoodSource` →
  `gardenGather`, the last always available), `getWaterStrategyCandidates()`
  (`householdWater` → `well`), `getWaterDutyStrategyCandidates()` (single
  `fetchDeposit`), `getWoodStrategyCandidates()` (single `chopDeposit`, its
  availability computed by the caller), and `selectStrategy()`
  (first-available-wins, no scoring engine).
- `NpcAgent.beginNeed()` calls a new `selectAndTraceStrategy(need, candidates)`
  at the top of each of the four branches — builds the candidate list from
  read-only queries mirroring the branch's own existing conditions
  (`household.has/water.has`, `foodSources.queryNearest`,
  `hunting.queryTarget`, `landmarks.trees.length`), records
  `lastStrategyCandidates`/`selectedStrategy` and a `strategy.selected` trace
  event, then falls into the **unchanged** original execution code. Execution
  was deliberately left byte-identical rather than branching on the selected
  id, so a candidate that reads "available" at decision time but declines by
  execution time (concurrent world mutation) still falls through exactly the
  way it always has — no second execution path, no regression risk in the
  existing household/hunt/food-source/garden or well/wood cascades.
- `NpcAgent.computeFoodStrategyCandidates()` is the one branch with real
  wiring: it re-queries `hunting.queryTarget`/`foodSources.queryNearest`
  read-only (no arrow resupply, no harvest) purely to preview availability;
  the actual `beginHuntExpedition`/`beginRealFoodGathering` calls re-query
  and re-validate independently, same double-query pattern the plan notes
  call out as expected ("must still be revalidated... A candidate becoming
  invalid... is normal").
- `NpcTraceEvent` gained `'strategy.selected'` (`need`, `candidates`,
  `selected`); `NpcInspectionSnapshot` gained `strategyCandidates`/
  `selectedStrategy`, populated by `createInspectionSnapshot()` from the same
  fields `beginNeed()` set — no recomputation. `src/ui/createNpcInspector.ts`
  renders a new "Strategy" section (candidate list + `← selected` marker) and
  formats the new trace event.
- New `src/ai/npcStrategies.test.ts` covers candidate generation/selection
  per the plan's test list (hunter-only `hunt`, unavailable-before-selection,
  deterministic output, always-available fallbacks). `NpcInspectionSnapshot`
  test fixtures (`npcWhy.test.ts`, `npcInspector.test.ts`, `npcDebugApi.test.ts`)
  updated for the two new required fields.
- Left untouched per the notes: `Needs.ts`, `decisionModifiers.ts`,
  `PlannedAction`, `DecisionContext` — no strategy-scoring engine, no new
  FSM, no second action model.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
