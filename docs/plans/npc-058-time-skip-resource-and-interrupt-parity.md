# Plan: NPC time-skip resource and interrupt parity

**Created:** 2026-09-19
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `npc`
**Type:** `fix`
**Roadmap:** -

## Goal

Make `NpcAgent.resolveTimeSkip()` a coarse execution of the same authoritative consequences as normal simulation, not a parallel shortcut that relieves needs for free or leaves stale action ownership behind.

Keep time-skip coarse. Do not replay normal movement/pathfinding frame by frame.

## Confirmed current defects

### Resource parity

Current `resolveTimeSkip()` samples schedule/needs in 0.5 game-hour steps, but its side effects differ from live need execution:

- water removes household water before relief;
- waterDuty mints household water directly;
- food relieves hunger without consuming food;
- wood relieves the need when trees exist without a corresponding resource/work transaction.

`SettlementsManager.resolveTimeSkip()` also calls `stampSettlementAgriculture(..., nowDays)`, which moves the aggregate agriculture anchor forward without resolving the skipped interval.

### Interrupt cleanup parity

Time-skip ends active work through hand-written field clearing (`pendingAction`, queue/path/repath/conversation state, etc.) rather than the existing full interruption/lifecycle cleanup seam. The committed-travel branch has another reset sequence.

This is fragile for reservations, combat/action lifecycle and future in-flight mechanisms.

## Scope

### 1. Reuse one interruption primitive

Before applying ordinary schedule/need catch-up, terminate the current detailed action through the existing NPC-owned interruption/reset mechanisms.

The final implementation must explicitly cover:

- action lifecycle failure/cancellation semantics,
- interaction queue membership,
- sanitation/cleanup reservations,
- conversation reservation/presentation,
- combat state,
- movement/path/repath/watchdog state,
- pending/chained action state,
- sleep reason / active plan semantics where appropriate.

Do not blindly call a helper if committed NPC travel has a different authoritative owner. Preserve the current committed-travel catch-up path, but factor/shared-cleanup it where the same runtime state must be invalidated.

### 2. Resource-conserving need catch-up

Do not duplicate the full `beginNeed()` routing tree.

Extract or reuse narrow actor-neutral transaction primitives from the existing live paths so catch-up can express outcomes such as:

```text
food need:
  available authoritative source → consume real food → relieve
  no source / transaction fails   → remain hungry

water:
  real household/source operation succeeds → relieve
  otherwise                                → remain thirsty
```

For wood/water duty, preserve the current gameplay meaning of the need, but do not make a resource appear/disappear merely because the physical trip was skipped. If no legitimate aggregate transaction seam exists, leaving the need unresolved is safer than minting a result.

Every transaction must be atomic: relief only after the owner operation succeeds.

### 3. Agriculture interval

Do not stamp away the skipped period.

Reuse the existing settlement agriculture aggregate owner for the interval where that model applies. Respect the procedural/founded distinction from current `settlements-021/022` implementation notes: shared NPC catch-up must not make procedural agriculture assumptions for founded settlement runtimes.

If agriculture intentionally remains frozen for a particular settlement type, its resolution anchor must also remain unchanged so later legitimate catch-up is still possible.

### 4. Preserve existing schedule/travel semantics

Keep:

- `TIME_SKIP_SAMPLE_HOURS` coarse sampling unless tests show it is the source of a correctness issue;
- current schedule-derived final placement;
- cave recovery-domain safeguards;
- committed off-screen travel resolution using the existing travel state/checkpoint machinery;
- World-Time anchored injury recovery.

This plan is not an NPC scheduler redesign.

## Relevant files / symbols

- `src/ai/NpcAgent.ts::resolveTimeSkip`
- `NpcAgent.finishTimeSkipMovementReset`
- `NpcAgent.catchUpCommittedTravel`
- `NpcAgent.resetInFlightAction` / existing interrupt helpers
- normal `beginNeed` / source action transaction seams
- `src/settlement/SettlementsManager.ts::resolveTimeSkip`
- `stampSettlementAgriculture`
- settlement agriculture aggregate helpers
- household food/water APIs
- current `settlements-021/022` runtime distinctions

## Tests

Add focused tests for:

1. food need during skip cannot be relieved without decrementing a real authoritative food source;
2. failed/empty source leaves the need unsatisfied;
3. water relief is conditional on the real remove operation;
4. duty/resource catch-up does not mint state without its owner operation;
5. a skipped interval is not erased from agriculture by a timestamp-only stamp;
6. an NPC entering skip with an active queued/reserved/combat action exits with no stale reservation/lifecycle state;
7. committed travel still uses its current off-screen checkpoint semantics and is not double-reset/double-advanced.

Use pure/helper tests where possible; do not require Three.js asset loading for transaction semantics.

## Guardrails

- no second Needs implementation;
- no second Household/Economy inventory;
- no physical pathfinding replay during skip;
- no per-frame accelerated NPC update;
- no free resource satisfaction as a fallback;
- no special player-present rule for aggregate agriculture;
- no unrelated NPC decision refactor.

## Verification

Automated tests own conservation and cleanup invariants. Browser verification is performed by the user: start a skip with hungry/thirsty NPCs and limited household stock, plus an NPC in an active action, then confirm post-skip resources/state are coherent and normal behaviour resumes.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
