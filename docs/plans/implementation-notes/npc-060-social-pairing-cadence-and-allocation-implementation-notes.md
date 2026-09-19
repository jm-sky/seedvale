# Implementation notes: npc-060 social pairing cadence and allocation

**Plan:** `docs/plans/npc-060-social-pairing-cadence-and-allocation.md`  
**Recon baseline:** current `main` on 2026-09-19

## Current ownership and lifecycle

- `src/ai/socialBehaviour.ts::advanceSocialPairing()` is the only settlement-level pairing orchestrator.
- `NpcAgent.socialCandidate()` is the authoritative eligibility gate for one NPC's attempt. It owns the existing per-NPC retry throttle through private `nextSocialAttemptSim`.
- `NpcAgent.beginConversation()` owns the transient paired execution state. It sets `conversationPartnerId`, the early-exit callback, optional delayed voice cue and starts the ordinary `conversation` planned action.
- NPC↔NPC relationship state remains in the shared `NpcRelationships` store. The social pairing code must not introduce another relationship or conversation registry.
- `Settlement.update()` calls `advanceSocialPairing()` once per loaded-settlement frame inside the existing `agentCpuDiag.social` timing span.

## Confirmed current cost

The expensive shape is entirely inside `advanceSocialPairing()`:

1. every frame it loops all participants and calls `socialCandidate()`;
2. it allocates a fresh `entries` array;
3. it allocates a fresh `Set`;
4. for every candidate it allocates `remaining = entries.filter(...)`;
5. then allocates another array via `remaining.map(...)`;
6. then scans again with `remaining.find(...)`.

The existing per-NPC throttle is already semantically correct, but it sits inside `socialCandidate()`, so the settlement still pays the outer scan and temporary-array setup every frame.

## Recommended minimal architecture

Do not add a settlement scheduler or global social manager.

Expose one **read-only, non-mutating due projection** on `SocialParticipant` / `NpcAgent`, for example a method equivalent to:

- whether this participant could possibly be due for a social attempt at the current `simClock`.

The implementation should reuse the same private `nextSocialAttemptSim` state already owned by `NpcAgent`. Do not create a second timestamp.

A suitable narrow contract is a method such as `socialAttemptDue(): boolean` or equivalent. It should only answer whether the cooldown has elapsed; the authoritative full eligibility check remains `socialCandidate()`.

Keep this projection cheap and side-effect free.

### Important semantic distinction

`socialCandidate()` currently:

- rejects NPCs with no social place;
- rejects dead NPCs;
- rejects already-reserved NPCs;
- rejects NPCs not settled in social/wander state;
- rejects before `nextSocialAttemptSim`;
- **only when it returns a candidate**, advances `nextSocialAttemptSim`.

Do not accidentally change that behavior.

The current doc comment claims every call reschedules, but the implementation does not: the cooldown advances only after all eligibility checks pass. Follow current code semantics, not the stale wording.

This discrepancy is worth correcting in JSDoc while touching the method.

## Cadence fast path

The smallest safe fast path is:

1. in `advanceSocialPairing()`, scan participants with only the cheap due projection;
2. if no participant is due, return immediately without allocating candidate collections;
3. if at least one is due, run the ordinary authoritative `socialCandidate()` checks.

This still performs a linear boolean scan on idle frames, but avoids the candidate-view allocations and the more expensive eligibility/pairing work. It also avoids inventing a second scheduler.

If implementation can safely keep a settlement-local earliest-due value without adding synchronization complexity, that is acceptable, but it is not required. Prefer the read-only projection because it keeps ownership entirely in `NpcAgent`.

## Pairing allocation cleanup

The current semantics are deterministic lowest-id compatible partner selection among same-place candidates.

Do not repeatedly build `remaining.filter().map()` arrays.

A simple implementation is enough:

- build the candidate entries once;
- maintain a reusable or one-pass `taken` representation;
- for each untaken entry, scan the same `entries` array directly;
- choose the compatible untaken candidate with the lexicographically lowest id;
- keep a direct reference/index to the chosen partner, so no follow-up `find()` scan is required.

There is no need to call `findConversationPartner()` from the orchestration path if doing so would force an allocated mapped view. Keep the exported pure helper for existing unit tests if useful, or adapt it to accept the existing views without temporary arrays.

Do not sort the whole participant list unless needed; lowest-id partner can be selected during one linear scan and preserves current semantics.

## Reservation / outcome invariants to preserve

The current pair lifecycle has important correctness properties:

- both ids are marked taken before either `beginConversation()` call;
- one duration is sampled for both NPCs;
- one outcome is sampled for the pair;
- one shared `applyOutcomeOnce` closure guards the relation mutation;
- early exit on either side calls the partner's `releaseConversationPartner()`;
- natural completion clears transient conversation state and schedules the next attempt;
- no relationship delta is applied on interrupted conversation;
- voice cue selection is presentation-only and must not affect pairing eligibility.

Do not move any of this state into the pairing orchestrator.

## Integration points

### `src/ai/socialBehaviour.ts`

Expected primary change:
- extend `SocialParticipant` with the cheap due projection;
- add early-return path;
- remove per-candidate `filter/map/find` allocation chain.

### `src/ai/NpcAgent.ts`

Expected small change:
- expose a non-mutating method backed by `simClock >= nextSocialAttemptSim`;
- keep `nextSocialAttemptSim` private and runtime-only;
- preserve `socialCandidate()` as the full eligibility gate;
- fix stale JSDoc that currently says every call reschedules the cooldown.

Do not persist `nextSocialAttemptSim`.

### `src/settlement/createSettlement.ts`

No architecture change should be needed. Keep the existing call site and existing `agentCpuDiag.beginNpcSocial()/endNpcSocial()` span.

### `src/perf/agentCpuDiag.ts`

Reuse existing `npcSocialMs`; do not add a new performance subsystem.

## Tests

Prefer focused tests in the existing social-behaviour/NpcAgent test surface.

High-value cases:

1. no participant due → no `socialCandidate()` calls and no pairing;
2. one or more due participants → full eligibility still goes through `socialCandidate()`;
3. same-place requirement unchanged;
4. lowest-id compatible partner unchanged;
5. one NPC cannot appear in two pairs in one pass;
6. exactly one relationship delta on natural completion;
7. interruption/death produces no completed-conversation delta;
8. cooldown projection is non-mutating;
9. an NPC whose cooldown is due but whose state is not socially eligible does not get paired and does not have cadence ownership moved elsewhere.

Avoid tests that assert a specific internal collection type.

## Pitfalls

- Do not make the cheap due projection the authoritative eligibility check.
- Do not advance the retry timestamp from the cheap projection.
- Do not introduce a second settlement-level cooldown.
- Do not persist cadence/runtime conversation state.
- Do not change relationship scoring, voice behavior or candidate tie-breaking.
- Do not replace this with a global spatial index; social-place identity already provides the required compatibility boundary.
- Do not optimize away deterministic ordering.

## Suggested implementation order

1. Add the side-effect-free due projection to `SocialParticipant` and `NpcAgent`.
2. Add idle-frame early return in `advanceSocialPairing()`.
3. Replace the `filter/map/find` chain with direct scanning over the single candidate list.
4. Update stale JSDoc around `socialCandidate()`.
5. Run focused social behavior tests and existing NPC tests.
6. Use existing `agentCpuDiag.social` for user-side before/after browser measurement.
