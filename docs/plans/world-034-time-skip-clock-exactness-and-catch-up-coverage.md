# Plan: Time-skip clock exactness and catch-up coverage

**Created:** 2026-09-19
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world`
**Type:** `fix`
**Roadmap:** -

## Goal

Restore one coherent time-skip invariant:

```text
requested skipped World Time
=
authoritative DayNightState advancement
=
exactly-once catch-up interval for every frozen simulation owner
```

Do this by extending the existing `dayNight.ts` / `timeSkip.ts` / owner `resolveTimeSkip` seams. Do not introduce a second clock, a generic scheduler or hidden accelerated frame replay.

## Confirmed current defects

### Final-frame clock mismatch

Current order is:

```text
timeSkip.tick(dt)
  → finishing tick restores previous dayNight.timeMultiplier
  → reports justFinished + full requested hours
catch-up owners resolve full requested hours
...
tickDayNight(dayNight, dt)
  → sees restored normal multiplier
```

The final skip frame therefore contributes only normal-speed World Time while catch-up applies the full requested duration. The discrepancy depends on final-frame `dt`.

### Incomplete AnimalAgent fan-out

`Fauna.resolveTimeSkip()` covers wild `agents` only. `SettlementsManager.resolveTimeSkip()` currently covers NPCs, not the other `AnimalAgent` populations it owns/materializes:

- loaded settlement livestock,
- settlement rats,
- detached livestock.

This makes lifecycle progression depend on which runtime collection owns an otherwise identical agent.

## Scope

### 1. Make completion interval exact

Choose the smallest implementation that guarantees:

- a requested `N` game-hour skip advances `DayNightState.elapsedDays` by exactly `N / 24` (within normal floating-point tolerance),
- `timeOfDay` matches the same interval,
- catch-up owners receive that exact same interval once,
- completion is independent of the frame on which `remainingSec` crosses zero,
- cancelling a skip restores normal multiplier without adding the uncompleted remainder.

Preserve `tickDayNight()` as the authoritative clock-advance seam. Do not add another persistent time field to compensate for an ordering bug.

The implementation may change the ordering/handshake between `gameLoop.ts` and `TimeSkip`, but the owner contract should be explicit rather than relying on a multiplier being restored at the right incidental line.

### 2. Complete animal catch-up fan-out

Keep `AnimalAgent.resolveTimeSkip` as the per-animal lifecycle primitive.

- `Fauna.resolveTimeSkip` continues to own wild fauna.
- `SettlementsManager.resolveTimeSkip` must fan out to the live animal collections owned by settlement runtime:
  - each loaded settlement's livestock,
  - each loaded settlement's rats,
  - detached livestock.
- avoid double-processing an animal that can move between owned collections; use the manager's authoritative collection membership/identity rules.
- founded/shared settlement runtimes landing through `settlements-021/022` must use the same manager-level fan-out rather than a procedural-only branch.

Do not merge wild fauna and livestock/rats into one persistence pool.

### 3. Preserve World-Time anchored lifecycle work

`fauna-029` already moves corpse phase/removal to World Time. Do not recreate a second corpse-seconds catch-up path. Only state that genuinely remains simulation-delta-driven should consume `AnimalAgent.resolveTimeSkip`.

Re-read the landed `fauna-029` implementation before changing AnimalAgent catch-up.

### 4. Keep detailed systems frozen

Do not fix this by feeding accelerated `worldDt` into normal NPC/fauna/trap updates. Archived plan 196 deliberately removed that behaviour.

The contract remains:

```text
during skip:
  detailed NPC/fauna/trap movement/AI = frozen

completion:
  deterministic/coarse owner catch-up = once
```

Player needs remain the existing deliberate live-ticked exception.

## Relevant files / symbols

- `src/app/gameLoop.ts` — order of `timeSkip.tick`, catch-up, `tickDayNight`.
- `src/world/timeSkip.ts` — active interval / completion / multiplier restoration.
- `src/world/dayNight.ts` — sole World Time owner.
- `src/world/timeConversion.ts` — canonical game-hours ↔ real-seconds conversion.
- `src/fauna/createFauna.ts::resolveTimeSkip`.
- `src/fauna/AnimalAgent.ts::resolveTimeSkip`.
- `src/settlement/SettlementsManager.ts::resolveTimeSkip`.
- loaded settlement `livestock` / `rats` collections and `detachedLivestock`.
- `docs/architecture/ARCHITECTURE.md` time model if the concrete handshake changes materially.

## Tests

Add/extend focused automated tests for:

1. a skip finishing with a remainder smaller than the current frame still advances exactly the requested World Time;
2. different frame partitions (e.g. 60 Hz-ish vs 20 Hz cap boundary) produce the same end `elapsedDays/timeOfDay`;
3. cancellation advances only the portion actually completed and restores the previous multiplier;
4. wild fauna catch-up remains exactly once;
5. one loaded livestock agent, one settlement rat and one detached livestock agent each receive exactly one catch-up;
6. collection transitions do not double-apply catch-up.

Prefer pure time-controller tests plus a narrow manager fan-out test; do not instantiate a browser/render stack.

## Guardrails

- no `TimeManager`;
- no fixed-step rewrite;
- no global off-screen simulation engine;
- no second animal lifecycle implementation;
- no catch-up based on camera distance;
- no raw `Math.random()` introduced;
- no production behaviour outside time-skip semantics.

## Verification

Automated verification should cover the exact clock and fan-out invariants above.

Browser verification is performed by the user: wait/rest at several skip lengths, confirm the displayed clock lands on the exact expected time and ordinary animal/NPC behaviour resumes without visible double-jump.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
