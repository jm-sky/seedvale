# Implementation Notes: NPC Pressure Layer

**Plan:** `docs/plans/ai-001-npc-pressure-layer.md`
**Reviewed:** 2026-08-24
**Status:** `planned`

## Review summary

The plan fits the current architecture, but the implementation should be narrower than the wording suggests. The current pressure inputs already exist inside `Needs.pickNeed()`; the main job is to make those implicit scores explicit without creating a second AI system.

The most important current-code correction is that **schedule is not currently a peer score source**. `choose()` uses need selection first and schedule as fallback. `woodDuty` and `waterDuty` are already explicit duty meters and should become pressure inputs; do not invent a separate schedule-pressure subsystem in this plan.

## Existing implementation to reuse

- `src/ai/Needs.ts` is the source of truth for need state, thresholds, shortage modifiers, critical thresholds and tie-breaking.
- `src/ai/Needs.test.ts` already covers the exact priority semantics that must remain stable.
- `src/ai/NpcAgent.ts` owns `choose()` / `beginNeed()` and remains the decision/execution boundary. Do not move action construction or world mutations into the pressure layer.
- `src/simulation/scoreActions.ts` provides `ScoredAction`, `pickHighestScore()` and deterministic strict-`>` tie behaviour. Reuse it rather than creating another scoring helper.
- `src/simulation/types.ts` already defines `DecisionContext` as the shared decision boundary. It is intentionally domain-agnostic and Three.js-free.
- `src/debug/npcTrace.ts` / `NpcWhy` are the existing diagnostic direction. Extend them; do not create a parallel pressure-debug system.
- Household/resource shortage state is already supplied to NPC need selection (`woodShortage`, `foodShortage`, `waterShortage`). Preserve those ownership boundaries.

## Recommended pressure model

Prefer a small immutable/plain-data representation, e.g. conceptually:

```ts
type NpcPressure = {
  source: string
  target: NeedId
  value: number
}
```

Keep `value` normalized to the same practical 0–1-ish scoring domain used by the existing selector. Do not add goals, problems, strategies, personality, plans or persistent state here.

The pressure generator should be a pure function over `NeedState` plus the **same contextual inputs currently passed to `pickNeed()`** (`skipWood`, shortage flags, and `critical`). It should reproduce the current threshold/multiplier semantics exactly. `pickNeed()` can then become a thin arbitration step over generated pressures using `pickHighestScore()`.

Do not duplicate the scoring formula in `NpcAgent`, diagnostics, or tests. There must remain one source of truth.

## DecisionContext

Extend `DecisionContext` with an optional pressure collection using a generic/shared shape rather than importing `NpcPressure` from `src/ai` into `src/simulation`. `src/simulation` is deliberately domain-agnostic.

A good seam is a generic `Pressure`/`DecisionPressure` shape in `src/simulation/types.ts`, with NPC code producing the concrete values. Keep the existing `needs` field unless code inspection proves it is unused everywhere; avoid an unrelated contract cleanup in this plan.

Do not put the complete `NpcAgent`, `NeedState`, household, settlement or world state into `DecisionContext`.

## Important semantic constraint

`woodDuty` / `waterDuty` are needs/duties, not a new logistics system. Settlement and household shortage flags are contextual modifiers already used by `pickNeed()`.

Do **not** turn shortages into independent actions or a planner. The pressure layer only exposes the existing arbitration signal.

Likewise, `scheduleActivity` should remain the existing schedule fallback. A future plan may make schedule/profession/etc. explicit competing pressures, but `ai-001` should not change that behaviour.

## Diagnostics

Extend the existing `NpcWhy`/trace path so the selected decision can expose the pressures that actually participated in arbitration:

- source;
- target;
- final value.

Prefer recording a small copied pressure list at the semantic decision transition rather than recomputing scores independently in the inspector. If diagnostics need the candidate pressures for the current decision, keep them as a bounded/plain-data snapshot, not references to mutable NPC state.

Do not make `why()` a second implementation of the pressure formula. If a diagnostic value cannot be obtained from the authoritative decision result, report `null`/unknown rather than infer it.

## Performance

Pressure generation belongs on the existing decision cadence (`choose()`), not `NpcAgent.update()` every frame. The current needs already tick continuously, but arbitration happens when the NPC chooses/re-evaluates.

Avoid persistent per-NPC pressure objects if they are only needed for one decision. A small temporary candidate array at decision time is acceptable; if the implementation proves this path hot, prefer reusable storage over a new allocation-heavy framework.

No worker is justified: this is tiny deterministic scalar arithmetic.

## Tests

Extend `src/ai/Needs.test.ts` or add a focused pressure test module around the pure generator.

At minimum preserve:

- idle when no threshold is crossed;
- water > wood > waterDuty > food tie precedence;
- shortage promotion for wood/food/waterDuty;
- trader `skipWood` behaviour;
- critical thresholds;
- shortage modifiers ignored in critical mode;
- deterministic identical output for identical input.

Add tests asserting the generated pressure values themselves, especially threshold boundaries and shortage multipliers. Existing `pickNeed()` behaviour should remain covered so the refactor cannot silently change action selection.

## Scope / dependency guardrails

`ai-002-npc-personality-decisions.md` depends on this plan. Therefore this pressure representation is the future input seam for personality scoring, but **do not add personality modifiers now**. Likewise, do not introduce Problems, Goals, Strategies, persistent Plans, memory or hierarchical planning.

`DecisionContext` must remain usable by the existing shared simulation architecture and should not become an NPC-only dumping ground.

The current architecture audit explicitly recommends evolving:

```text
Needs / Problems / Opportunities → Pressures → DecisionContext → personality/role → decision → strategy → plan → existing actions
```

For `ai-001`, implement only the first two arrows for the already-existing need/shortage signals.

## Verification

Technical verification should focus on the deterministic pure pressure/scoring tests plus the existing suite. No browser verification is needed to prove the pure arithmetic, but gameplay verification remains useful to confirm representative NPCs still choose the same need-driven actions.

Do not claim browser verification unless it is actually performed.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
