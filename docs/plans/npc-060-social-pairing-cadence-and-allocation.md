# Plan: NPC social pairing cadence and allocation

**Created:** 2026-09-19
**Status:** `verification needed` 🔍 — implemented 2026-09-19 (`vitest` socialBehaviour). Browser/gameplay verification by user.
**Type:** optimization
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `relationships` `behavior`
**Tags:** `social` `performance` `allocation`
**Roadmap:** -
**Model:** Composer, Grok

## Goal

Remove frame-rate settlement-wide social candidate discovery and avoidable temporary allocations from NPC conversation pairing while preserving the existing social-place, cooldown, deterministic pairing and once-only relationship mutation semantics.

This is a bounded optimization of the existing mechanism, not a new social scheduler or relationship system.

## Confirmed current cost

`src/ai/socialBehaviour.ts::advanceSocialPairing()` is called once per loaded `Settlement.update()`.

Each call currently:

- scans every participant and calls `socialCandidate()`;
- allocates a fresh candidate array and `Set`;
- creates `filter()` + `map()` arrays while pairing eligible candidates.

`NpcAgent.socialCandidate()` internally rejects attempts before `nextSocialAttemptSim`, so most frames still pay discovery/allocation overhead even when nobody is due to attempt.

The existing `agentCpuDiag.social` span already measures this block.

## Scope

### 1. Make pairing work event/cadence-driven rather than frame-driven

Reuse the existing per-NPC social attempt timing. Do not add a second independent wall-clock cadence that can disagree with `nextSocialAttemptSim`.

Choose the smallest implementation that lets the settlement pairing pass cheaply determine that no participant is due before building candidate collections. Good options include exposing a non-mutating “social attempt due” projection or maintaining a settlement-local next-due timestamp derived from the same participant state.

The authoritative eligibility check remains `socialCandidate()` at pairing time.

Do not persist pairing cadence: it is runtime execution state, not a social consequence.

### 2. Eliminate avoidable O(k²) temporary arrays

Preserve deterministic lowest-id compatible partner selection and atomic reservation of both participants.

Refactor partner selection so it does not allocate a new `filter()` and `map()` array for every candidate. A single sorted candidate list plus indexed/linear selection, or equivalent bounded scratch reuse, is sufficient.

Do not introduce a global NPC spatial index for campfire conversations. The social place already bounds compatibility.

### 3. Preserve conversation lifecycle invariants

The optimization must not change:

- same-`Place.id` compatibility;
- `socialReserved` exclusion;
- per-NPC retry cooldown semantics;
- deterministic lowest-id tie-breaking;
- shared conversation duration;
- one shared `applyOutcomeOnce` closure;
- exactly one ±1 `NpcRelationships.adjust()` per completed pair;
- no relationship result on early interruption/death;
- existing voice/conversation execution.

### 4. Keep ownership local

Keep `advanceSocialPairing()` as settlement-level orchestration over that settlement's existing NPC collection.

Do not add:

- a global social manager;
- a second relationship registry;
- persisted “current conversation” state;
- a worker;
- a separate campfire-nearby scan.

If reusable scratch collections are introduced, own them at the settlement/social-pairing runtime boundary and clear/reuse them explicitly.

## Relevant files / symbols

- `src/ai/socialBehaviour.ts::advanceSocialPairing`
- `src/ai/socialBehaviour.ts::findConversationPartner`
- `src/ai/NpcAgent.ts::socialCandidate`
- `src/ai/NpcAgent.ts::beginConversation`
- `src/settlement/createSettlement.ts::Settlement.update`
- `src/perf/agentCpuDiag.ts` social timing span
- focused social-behaviour tests.

Add/update JSDoc on any new public/cross-module cadence projection so preflight can discover its ownership; use `@domain npc` where appropriate.

## Tests

Add focused automated tests proving:

1. a settlement update with no due social attempt performs no pairing work beyond the cheap due check;
2. due candidates still pair only within the same social place;
3. deterministic lowest-id partner choice is unchanged;
4. one participant cannot be paired twice in one pass;
5. completion still applies one relationship delta even when both sides complete;
6. interruption/death still releases both sides without a completed-conversation delta;
7. cooldown/retry timing remains equivalent to the current behavior;
8. candidate/pairing code does not require per-candidate `filter/map` allocations.

Prefer behavioral tests over asserting a particular internal data structure.

## Performance verification

Use the existing `agentCpuDiag.social` measurement before/after in a settlement-heavy scenario.

Success criteria:

- idle/no-due frames avoid full candidate materialization;
- no per-candidate `filter/map` allocation chain remains;
- social behavior and relationship results stay unchanged.

Do not claim a frame-time win from static inspection alone.

## Guardrails

- no change to Player↔NPC relation ownership;
- no change to `NpcRelationships` persistence format;
- no social feature additions;
- no relationship-score rebalance;
- no global scheduler/manager;
- no worker;
- no unrelated `NpcAgent` refactor;
- no browser verification by the implementing agent.

## Verification

Automated tests own deterministic pairing/lifecycle invariants.

Performance should be measured through the existing diagnostic span. Browser/gameplay verification is performed by the user: observe campfire gathering/conversation pairing, interruption and subsequent relationship behavior.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
