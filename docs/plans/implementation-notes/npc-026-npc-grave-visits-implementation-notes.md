# NPC Grave Visits — Implementation Notes

**Plan:** `npc-026-npc-grave-visits.md`  
**Recon:** 2026-09-09, current `main` (`de12f603` baseline before docs edit)  
**Implemented:** 2026-09-09 on `main` (`f691a2b8`); remaining ROI tests/docs 2026-09-10

## Implemented contract

V1 landed on the seams the recon named. Current source is authoritative:

- `src/ai/graveVisitPressure.ts` — family/grave eligibility, per-deceased cooldown, deterministic opportunity gate, candidate + revalidation.
- `src/settlement/createSettlement.ts` — bounded `familyNpcIdsByVisitor` from `def.families` / `flatMembers`; `graveVisitHooks` into `NpcAgent`.
- `NpcAuthoritativeState.graveVisits` — optional snapshot field, no save-version bump (absent = none).
- `Settlement.update(nowDays)` → `NpcAgent.update(..., nowDays)` — absolute `elapsedDays` for cooldown.
- `NpcDecisionTarget` / `NpcDecisionKind` `'visitGrave'` at rank 65; `ActionId` `'visitGrave'`.
- Completion-only `recordGraveVisit()` after a 2s timed stay. In-progress travel is abandoned on settlement unload.

Do not add a second graves registry, fake `NeedId`, cemetery lookup, or off-screen visit executor.

---

## Recon result

`npc-026` is now blocked by **one real dependency only: `npc-011` persistent burial/grave completion**.

Already implemented and verified on current `main`:

- `npc-010` — persisted NPC death/corpse lifecycle,
- `world-terrain-016` — deterministic settlement cemetery assignment/lookup,
- authoritative NPC state persistence through `NpcStateRegistry` / `SaveData.npcStates`,
- deterministic family → household construction,
- existing pressure arbitration and generic `goTo → execute` action lifecycle.

Do not keep older assumptions that death/corpse or settlement cemetery APIs are still hypothetical.

## `npc-010`: final contract that 026 must respect

### Authoritative ownership

`src/settlement/npcState.ts`

```text
NpcAuthoritativeState
  health
  stamina
  vigor
  needs
  personalInventory
  activePlan
  postDeath: NpcPostDeathState | null
  ...
```

`NpcStateSnapshot` round-trips this through `NpcStateRegistry.serialize()` and `SaveData.npcStates`. `NpcStateRegistry` is owned by `SettlementsManager`, not a loaded `NpcAgent`, so the state survives settlement stream-out/in, agent recreation and save/load.

### Corpse state / identity

`src/settlement/npcPostDeath.ts`:

```ts
type NpcPostDeathStatus = 'active' | 'claimed' | 'terminal'

type NpcPostDeathState = {
  status
  x
  z
  yaw
  deathAtDays
  loot
  cleanupReason
}
```

There is no separate corpse id. Stable corpse identity is the deceased `NpcId` and its authoritative `postDeath` record.

`commitNpcDeath()` is one-shot. `claimNpcCorpseForBurial()` / `releaseNpcCorpseBurialClaim()` are already real handoff seams for `npc-011`. Natural cleanup is world-day driven and only removes `active` corpses; `claimed` already blocks that cleanup.

### Materialization / reconstruction

`src/settlement/createSettlement.ts` currently does, before creating the `NpcAgent`:

```text
npcStateRegistry.getOrCreate(npcId, ...)
→ finalizeExpiredNpcCorpse(postDeath, nowDays, droppedItems)
→ shouldSkipNpcCorpsePresentation(...)
→ NpcAgent.create(...)
```

Terminal corpses do not rematerialize. 026 must not create any corpse-side presentation or registry.

## `npc-011`: current contract and the exact remaining blocker

`npc-011` remains `planned` on current `main`, but its recon is now grounded against the implemented 010/016 contracts.

026 should expect 011 to provide the completed burial result as a persistent world-owned grave record, along the current planned shape:

```text
GraveRecord
  id
  deceasedNpcId
  settlementId
  cemeteryId
  x / z / yaw
  buriedAtDays
```

with a persistent graves collection threaded through `WorldBundle` / `SaveData`, and idempotent grave creation/finalization.

The preferred stable id already established by the 011 plan is equivalent to:

```text
grave:${deceasedNpcId}
```

The one dependency contract 026 genuinely needs is therefore:

```text
deceasedNpcId
→ stable grave id
→ Graves.find(...) / equivalent bounded lookup
→ persistent GraveRecord position
```

026 does **not** need 011's burial claim mechanics, corpse transport steps or burial arbitration at runtime. It only needs the completed persistent result.

If 011 lands with a slightly different public collection name/API, adapt to that final API rather than introducing an adapter registry owned by 026.

## `world-terrain-016`: already implemented

### Canonical settlement cemetery lookup

`src/terrain/chunkManager.ts` exposes:

```text
resolveCemeteryForSettlement(settlementId)
```

Underlying deterministic ownership is in:

- `src/terrain/cemeteryAssignment.ts`,
- `src/terrain/cemeteryPlacement.ts`.

`ResolvedCemeteryPlacement` represents dedicated/shared cemetery placement. `WorldLocationCatalog.cemeteryForSettlement()` already consumes the same public `ChunkManager` seam.

Important consequence for 026: **do not call this lookup to decide where a visit goes**. 011 already has to use it when creating a persistent grave. 026 visits the `GraveRecord` itself.

Shared cemeteries therefore require no visit-specific code.

## Family / household membership: use generated family truth

`src/settlement/createSettlement.ts` confirms:

```text
1 family = 1 household = 1 house
```

`households` is index-aligned with `def.families`, using:

```text
householdIdFor(def.id, familyIndex)
```

Then `flatMembers` is produced from `def.families`, preserving `familyIndex`, and NPC identity is stable inside that flattening:

```text
npcId = `${def.id}:npc:${i}`
```

`Household` itself owns resources/home identity; it is not the canonical member list.

### Correct 026 seam

Build a small family membership/candidate resolver while `createSettlement.ts` still has all of:

```text
def.families
familyIndex
flatMembers
npcId
household
```

Do not:

- add a second family/relationship model,
- scan `HouseholdRegistry` looking for members,
- add member arrays to `Household` just for grave visits.

For V1, generated same-family membership is sufficient eligibility.

## Relationships: deliberately not part of V1 eligibility

The existing NPC↔NPC relationship store is real and persisted, but it exposes a symmetric numeric relationship value rather than a canonical semantic query such as `isMeaningfulRelationship(a,b)`.

026 should therefore not invent a private threshold. Same-family eligibility is enough for V1. Relationship expansion can be added later when another system owns a shared semantic contract.

## Stable grave lookup consumed by 026

The cheapest expected lookup after 011 is:

```text
visitorNpcId
→ own family member NPC ids
→ dead member id
→ graveIdFor(deceasedNpcId)
→ graves.find(graveId)
```

No global grave scan is justified.

Candidate data passed into decision/action code should stay small, e.g.:

```ts
type GraveVisitCandidate = {
  deceasedNpcId: NpcId
  graveId: string
  x: number
  z: number
  yaw: number
}
```

This can be a private/domain-local type. Do not widen shared `ScoredAction`, which correctly remains `{ kind, score }`.

## NPC pressure / decision arbitration: exact insertion point

### Current stage 1

`NpcAgent` combines independent pressure producers in one existing arbitration:

```text
generateNeedPressures(...)
+ weatherShelterPressure(...) → 'seekShelter'
+ healingPressure(...)        → 'heal'
→ pickActionKind<NpcDecisionTarget>(...)
```

`NpcDecisionTarget` currently lives in `src/ai/weatherPressure.ts` and is:

```ts
NeedId | 'seekShelter' | 'heal'
```

026 should extend this same union with `'visitGrave'` and add a grave-visit pressure candidate in the **same `NpcAgent` choose-stage candidate list**.

Do not add a fake `NeedId`, scheduler, grave-specific scorer or second arbitration pass.

### Current stage 2

`src/ai/npcDecision.ts` applies outer sequencing after stage 1:

```text
collapseSleep 100
seekShelter    90
need           80
heal           80
scheduledSleep 70
idle           60
```

The intended V1 semantics are:

```text
critical/real pressure > scheduled sleep > grave visit > idle
```

The smallest explicit implementation is a `visitGrave` `NpcDecisionKind` in the existing priority table at a slot between 70 and 60, with validity driven by `wonNeed === 'visitGrave'`.

Because the stage-1 winner is already singular, this does not create a second scorer.

## Low-frequency / deterministic opportunity

A grave is not supposed to emit a pressure every time `choose()` runs once cooldown expires.

Use a deterministic opportunity gate based on stable visitor/grave identity and a world-time bucket. This can be implemented as a pure helper and evaluated only during normal choose cadence.

Avoid:

- `Math.random()`,
- per-frame grave scans,
- wall clock,
- grief/anniversary state.

The exact probability/cadence can remain simple and tuned in implementation tests; the architectural requirement is deterministic + bounded + low-frequency.

## Cooldown/history: a persisted NPC-owned field is warranted

Current `NpcAuthoritativeState` has no generic history field suitable for `lastVisited(grave)`.

Existing candidates are wrong owners:

- `activePlan` — replaced/obsoleted by unrelated goal work,
- `NpcAgent.simClock` — transient and resets on reconstruction,
- grave record — world result, should not own per-visitor history,
- global manager — explicitly unnecessary.

### Recommended shape

Add a bounded persisted field to `NpcAuthoritativeState` / `NpcStateSnapshot`, for example:

```ts
graveVisits: Array<{
  deceasedNpcId: NpcId
  lastVisitedAtDays: number
}>
```

Equivalent keyed plain data is acceptable if it fits current validation/migration style better.

Why per-deceased rather than one scalar:

- a family can eventually have multiple graves,
- visiting one grave should not globally suppress all others,
- the number of relevant family graves is naturally small/bounded.

Update it only after the timed visit completes successfully.

If adding the field changes persisted save shape, follow the actual current `SaveData.npcStates` validation/version/migration path. Do not rely on stale historical comments.

## Simulation time: current seam and required wiring

This recon found a concrete gap in the older notes.

`Settlement.update()` already receives:

```text
nowDays = dayNight.elapsedDays
```

and stores/forwards it for fauna/livestock. But the current NPC loop calls:

```text
agent.update(dt, observerPos, observerYaw, timeOfDay, nearbyCount,
             dayLengthSec, nearbyAnimalThreats, weather, playerObservation)
```

so `nowDays` is **not currently available inside `NpcAgent.update()`**.

026 needs absolute world days for persisted cooldown. Prefer one minimal explicit wiring:

```text
Settlement.update(nowDays)
→ NpcAgent.update(..., nowDays)
→ choose grave candidate / complete visit
```

or an equivalent narrow deps/context value if the implementation refactor makes that cleaner.

Do not use `NpcAgent.simClock`: it is appropriate for transient runtime timing/debug but not persisted world history. Do not use `Date.now()`.

Absolute `elapsedDays` gives correct lazy behaviour after stream-out, time skip and save/load without off-screen ticking.

## `NpcPlan`: no need to extend it for 026

`src/ai/npcPlan.ts` is still need-centric:

```ts
type NpcGoalId =
  | 'fulfilWorkDuty'
  | 'obtainWood'
  | 'secureFood'
  | 'secureWater'
```

`goalForNeed()` / `needForGoal()` are explicit mappings and `strategy` is `NpcStrategyId | null`.

A grave visit is a short optional pressure reaction, not a persistent resource goal. It is closer to existing `heal`, `shelter` and `social` execution patterns.

Therefore 026 should **not** extend `NpcPlan` just to persist a visit target. The runtime action may be abandoned on unload. The only visit state that must persist is completed-visit history/cooldown.

If 011 extends `NpcPlan` for burial, do not automatically reuse that shape: burial is a multi-step world-changing plan, grave visit is not.

## Existing movement/action lifecycle to reuse

`src/ai/npcAction.ts` already defines `NpcPlannedAction` over shared `PlannedAction` with:

```text
destination
durationSec
onComplete
optional next
```

`NpcAgent` already runs the generic:

```text
goTo
→ arrival
→ execute
→ wait = durationSec
→ onComplete
→ next / choose
```

026 only needs another domain `ActionId`, e.g. `'visitGrave'`.

Recommended action:

```text
kind: visitGrave
destination: snapshot of GraveRecord x/z
durationSec: short non-zero deterministic stay
onComplete:
  revalidate grave identity
  write lastVisitedAtDays
```

No new pathfinder, movement mode, cemetery queue or FSM.

### `activeNeed` / interruption behaviour

`visitGrave` should classify like `heal`/`shelter`/`social`: it is not a Need, so `activeNeed` remains `'idle'`.

That preserves the existing throttled `shouldInterruptAction()` behaviour:

- vigor collapse interrupts,
- critical need interrupts when active need is idle,
- severe weather interrupts when active need is idle.

No grave-specific cancellation subsystem is needed.

## Revalidation semantics

The selected candidate is transient. Re-resolve/revalidate the stable grave before dispatch/completion.

If the grave lookup fails:

```text
candidate obsolete
→ do not write cooldown
→ clear/finish action safely
→ return to choose
```

Never fall back to `resolveCemeteryForSettlement()` or a procedural grave mesh. Missing grave means there is no valid visit target.

## Settlement streaming / reconstruction

Current ownership split is already correct:

```text
SettlementsManager
→ NpcStateRegistry (authoritative persisted NPC state)

loaded Settlement / NpcAgent
→ phase, pendingAction, path, execute timer (transient)
```

An in-progress grave visit may disappear on settlement unload. That is acceptable for V1:

```text
unload before completion
→ no cooldown write
→ runtime path/action disappears
→ stream-in reconstructs NPC from authoritative state
→ visit can be reconsidered later
```

Do not add an off-screen grave movement executor.

The completed grave itself is expected to be world-owned/persisted by 011 and therefore independent of whether the settlement/NPC presentation is currently loaded.

## Concrete implementation seams after 011 lands

Likely files/symbols, based on current code:

- `src/settlement/createSettlement.ts`
  - derive same-family NPC-id lookup from `def.families` / `flatMembers`,
  - thread a bounded grave candidate resolver into NPC deps,
  - forward `nowDays` to NPC update/decision seam.
- `src/settlement/npcState.ts`
  - minimal persisted grave-visit history field + snapshot serialization.
- final grave collection/API from `npc-011`
  - stable `graveIdFor(deceasedNpcId)` / `find()` equivalent.
- `src/ai/weatherPressure.ts` or successor shared target module
  - extend `NpcDecisionTarget` with `'visitGrave'`.
- new small pure `src/ai/graveVisitPressure.ts` (reasonable, not mandatory)
  - cooldown + deterministic opportunity → `[0,1]` pressure.
- `src/ai/npcDecision.ts`
  - add `visitGrave` outcome/rank without changing existing relative priorities.
- `src/ai/npcAction.ts`
  - add `ActionId = 'visitGrave'`.
- `src/ai/NpcAgent.ts`
  - add candidate to current pressure arbitration,
  - dispatch one ordinary timed action,
  - keep `activeNeed === 'idle'`,
  - write cooldown only on completion.
- persistence validator/migration/tests
  - only as required by the final persisted field shape/current save version.

Do not hard-code these as guarantees if 011 renames its final public grave collection; consume the final 011 contract.

## Tests with highest ROI

### Candidate / family

- visitor and deceased in same generated family + completed grave → candidate,
- same family but no grave → no candidate,
- unrelated NPC → no candidate,
- no scan of all graves/relationships is required.

### Stable identity

- candidate resolves by `deceasedNpcId` / deterministic grave id,
- shared cemetery does not alter lookup,
- cemetery classification/nearest selection is never consulted by 026.

### Pressure / priority

- visit candidate enters the same stage-1 arbitration as need/weather/heal,
- visit loses to real urgent pressures,
- scheduled sleep outranks visit,
- visit can outrank idle,
- no `NeedId` is added.

### Cooldown / time

- successful completion writes `lastVisitedAtDays`,
- starting travel does not write cooldown,
- interruption does not write cooldown,
- save/load retains per-deceased cooldown,
- larger `elapsedDays` after unload/time-skip makes cooldown expire lazily,
- `Date.now()` / `simClock` are not needed.

### Action / streaming

- destination is the persistent grave position,
- arrival enters non-zero timed execute phase,
- critical need/severe weather can interrupt using current lifecycle,
- unload/reload does not require persisted pending action/path,
- reconstructed NPC can later reconsider the same visit.

## Guardrails

Do not introduce:

- `GraveVisitManager`,
- a second graves registry,
- fake `NeedId`,
- cemetery-specific pathfinding,
- cemetery scheduler,
- global NPC memory/history manager,
- second family/relationship model,
- off-screen movement executor,
- nearest-cemetery fallback,
- player-triggered visitor spawn.

This recon described the intended seams before implementation. The feature is on `main`; browser/gameplay verification remains manual. Do not run `pnpm docs:sync` by hand.
