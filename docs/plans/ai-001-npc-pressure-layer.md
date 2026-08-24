# Plan: NPC Pressure Layer

**Created:** 2026-08-23  
**Status:** `verification needed` 🔍  
**Priority:** high · **Effort:** M  
**Depends on:** none
**Domain:** `ai`

## Goal

Introduce an explicit pressure layer between current NPC state/needs and decision selection, while preserving the existing action execution system.

Current:

```text
Needs → pickNeed() → beginNeed() → PlannedAction
```

Target for this plan:

```text
Needs / existing world signals
        ↓
    Pressures
        ↓
  DecisionContext
        ↓
 existing decision/action flow
```

This is the first implementation step of the NPC AI vision. It must remain small and compatible with the current deterministic simulation.

## Scope

### Pressure model

Introduce a minimal `NpcPressure` representation with:

- source/category,
- target or affected concern,
- normalized strength/value,
- enough information for diagnostics and deterministic scoring.

Initial pressure sources should reuse existing concepts rather than creating parallel systems:

- needs,
- existing resource shortages,
- schedule/duty pressure,
- existing problem signals where already available.

Do not introduce a full Problem/Goal framework in this plan.

### Pressure generation

Identify where current `pickNeed()` / decision code already derives priority from needs, thresholds and shortages. Convert these signals into explicit pressure values rather than duplicating their state.

Pressure generation should be pure/deterministic where practical and cheap enough for the current NPC update cadence.

### DecisionContext

Extend the existing `DecisionContext` so pressures are available at the decision boundary.

Do not copy the whole NPC or world state into the context. Keep ownership explicit and pass only data required by the current decision.

### Integration

`pickNeed()` should consume the pressure representation while preserving its existing external behaviour as much as possible.

`beginNeed()`, `PlannedAction` and action execution are outside the main scope and should not be redesigned.

### Diagnostics

Extend existing NPC decision diagnostics/trace mechanisms so a decision can expose:

```text
pressure source
pressure target
pressure value
```

The implementation should fit the existing `NpcWhy`/trace direction rather than creating a second debugging mechanism.

## Implementation steps

1. Inspect the current `DecisionContext`, `pickNeed()`, need scoring and shortage/schedule signals.
2. Identify the smallest shared pressure representation that can express the existing priority inputs.
3. Add pressure generation from existing state.
4. Add pressures to `DecisionContext`.
5. Refactor current need selection to consume pressures without changing action execution.
6. Add diagnostic output for pressure values and selected priority.
7. Add/update unit tests for deterministic pressure generation and priority selection.
8. Verify that NPC behaviour remains stable except where the explicit model intentionally changes equivalent calculations.

## Design constraints

- deterministic;
- no LLM involvement;
- no new parallel needs system;
- no persistent plans yet;
- no hierarchical planning yet;
- no personality scoring yet — that is `ai-002`;
- avoid per-tick allocations where the existing simulation does not require them;
- preserve world independence from the player.

## Future extension points

The pressure model should be capable of later receiving pressure from:

- Problems,
- Goals,
- unresolved plans,
- relationships,
- household obligations,
- opportunities,
- danger,
- frustration.

Do not implement those sources unless they already exist and naturally fit this first layer.

## Verification

### Automated

- existing test suite passes;
- pressure values are deterministic for identical state;
- existing priority selection remains explainable through diagnostics.

### Browser/gameplay

For representative NPCs verify that normal need-driven behaviour still occurs and that pressure diagnostics correspond to visible behaviour.

This plan does not claim browser verification until it is actually performed.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
