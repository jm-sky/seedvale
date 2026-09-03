# NPC AI Roadmap

**Status:** concept / roadmap

This roadmap defines the evolution from the current need-driven NPC behaviour toward the first useful version of the NPC decision and planning model described in [`../vision/npc-ai.md`](../vision/npc-ai.md).

## V1 — Decision & Planning foundation

### 1. Pressure Layer

**Status:** planned

Introduce explicit pressures derived from existing needs and world state. Pressures explain why a need, problem or duty currently matters and become an input to decision-making.

**Implementation plan:** [`../plans/ai-001-npc-pressure-layer.md`](../plans/ai-001-npc-pressure-layer.md)

### 2. Personality-aware Decisions

**Status:** planned

Extend the decision context so Big Five personality, traits and role can influence the scoring of existing choices without directly dictating actions.

**Implementation plan:** [`../plans/ai-002-npc-personality-decisions.md`](../plans/ai-002-npc-personality-decisions.md)

### 3. Strategy Layer

**Status:** future

Move from selecting a need/direction directly to selecting among candidate strategies for resolving a pressure, problem or goal. Strategies should be scored through explicit, inspectable factors including personality, role, resources, risk and distance.

### 4. Persistent Plans

**Status:** future

Introduce persistent plans that can contain multiple actions, retain progress and survive interruptions or partial completion. Existing `PlannedAction` execution should be reused rather than replaced.

Example:

```text
hunt deer A → collect
hunt deer B → collect
hunt deer C → inventory full
unload
return
collect deer C
```

### 5. Re-evaluation, Frustration & Adaptive Planning

**Status:** future

Add adaptive re-evaluation, unresolved-plan pressure, frustration/satisfaction effects and cognitive-ability-based decision frequency. Critical events should still be able to force immediate re-evaluation.

## Beyond V1

Potential later evolution includes hierarchical prerequisite planning, semantic memory, richer Problems/Goals, long-term intentions and more sophisticated off-screen decision processing.

These are intentionally not part of the initial implementation scope.
