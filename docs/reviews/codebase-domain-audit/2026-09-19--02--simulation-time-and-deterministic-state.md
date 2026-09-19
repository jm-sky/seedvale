# Codebase domain audit 02: Simulation, time & deterministic state

**Date:** 2026-09-19  
**Area:** Simulation, time & deterministic state  
**Baseline:** current `main` during review (HEAD `16c1d6fb9b40c1a3aa59d28d3c8549a140196c7b`; latest commit was docs-only).  
**Result:** ⚠️ reviewed with unresolved high findings

## 1. Scope

Reviewed the simulation spine and time/determinism boundaries centered on:

- `src/app/gameLoop.ts`,
- `src/app/appRenderLoop.ts`,
- `src/world/dayNight.ts`,
- `src/world/timeSkip.ts`,
- `src/world/timeConversion.ts`,
- `src/world/weather.ts`,
- `src/settlement/SettlementsManager.ts`,
- `src/settlement/rats.ts`, `ratPersistence.ts`, `ratInfestation.ts`,
- `src/ai/NpcAgent.ts`,
- `src/fauna/createFauna.ts`, `AnimalAgent.ts`, `animalUpdateCadence.ts`,
- current architecture/state docs and prior simulation/living-world reviews,
- related active/verification plans, especially `fauna-001`, `fauna-028`, `fauna-029`, `persistence-001`, `settlements-npcs-019`, plus archived plans 192/196.

The traced modes were:

```text
requestAnimationFrame
→ capped real dt
→ time-skip controller
→ world clock / climate
→ player
→ settlements/NPCs
→ fauna
→ traps/world systems

normal detailed simulation
↕ stream-out / owner-specific off-screen representation
↕ time-skip freeze + owner-specific catch-up
```

## 2. Entry points and state owners

### World Time

`DayNightState` is the single game-clock owner. `elapsedDays` and `timeOfDay` advance only through `tickDayNight(state, dt)`, using `dayLengthSec` and `timeMultiplier`.

Lazy world-time systems such as weather/seasons and day-anchored lifecycle data derive from `elapsedDays`; they do not need a second ticking clock.

### Frame / Simulation Time

`gameLoop.ts` owns one browser-frame simulation pass. Three.js `Timer` produces `rawDt`; the loop clamps simulation `dt` to `0.05` seconds. Normal detailed NPC/fauna updates consume this capped variable step.

Player movement/short real-time actions use raw simulation `dt`. Player needs use `worldDt`, which is scaled during time-skip.

### Time-skip

`createTimeSkip(dayNight)` temporarily changes `dayNight.timeMultiplier`. During an active skip:

- the world clock advances quickly,
- player needs continue through scaled `worldDt`,
- settlements/NPC detailed update, wild fauna, traps and other explicitly gated world simulation are frozen,
- on completion, owner-specific `resolveTimeSkip` methods apply coarse catch-up.

This is intentionally not hidden accelerated frame replay.

### Off-screen state

There is no universal off-screen simulation loop. Each owner uses the cheapest continuity mechanism appropriate to its state:

- explicit world-time anchors for lazy systems,
- off-screen NPC travel / transport checkpoints,
- aggregate settlement agriculture,
- persistence/reconstruction for selected animals/NPC state,
- no detailed runtime agent when a settlement is unloaded.

This is compatible with the project's hybrid simulation direction, but it makes parity at the detailed ↔ off-screen ↔ time-skip boundaries especially important.

## 3. Flows traced

### Normal frame

Current ordering is materially:

```text
Timer.update → dt = min(rawDt, 0.05)
→ timeSkip.tick(dt)
→ rest/busy/modal handling
→ interaction/combat dispatch
→ worldDt derivation
→ tickDayNight(dayNight, dt)
→ climate/weather
→ player update + player needs
→ chunk/position-driven world updates
→ collect fauna/NPC encounter inputs
→ SettlementsManager.update(dt, ...)
→ resource deposits
→ Fauna.update(dt, ...)
→ traps
→ other world/presentation ticks
→ render
```

The settlements-before-fauna ordering is partly intentional: fauna encounter inputs for predators are assembled after current settlement stream changes and before the fauna pass. NPC threat perception, however, necessarily observes wild-fauna position/state from before this frame's fauna movement/damage pass.

### Time-skip completion

```text
timeSkip.tick(dt)
→ may set justFinished and restore normal multiplier
→ SettlementsManager.resolveTimeSkip(full requested hours)
→ Fauna.resolveTimeSkip(full requested hours)
→ later in same frame: tickDayNight(dayNight, dt)
```

This ordering is the root of F1.

### Settlement stream-out / off-screen

`SettlementsManager.unload()` stamps agriculture, captures livestock/rats, prepares transport/NPC travel handoff, disposes the live settlement and removes the entry. General NPC needs, livestock life and rats do not continue as a shared background tick. Their continuity is instead split across persisted state, lazy anchors and explicit off-screen mechanisms.

## 4. Findings

### F1 — high — final time-skip frame under-advances World Time but full catch-up still runs

**Affected flow:** time-skip final frame → World Time → catch-up consumers.

**Evidence:**

- `gameLoop.ts` calls `timeSkip.tick(dt)` before `tickDayNight(dayNight, dt)`.
- `timeSkip.ts::tick()` decrements `remainingSec`; when the skip finishes it immediately restores `dayNight.timeMultiplier = previousMultiplier` and clears `active`.
- the same frame then runs `SettlementsManager.resolveTimeSkip(skip.startTimeOfDay, skip.hours, ...)` / `Fauna.resolveTimeSkip(skip.hours, ...)` using the **full requested hours**;
- later, `tickDayNight(dayNight, dt)` sees the already-restored normal multiplier.

Therefore the final real frame of the accelerated period is accounted at normal speed in the authoritative world clock while catch-up treats the whole requested interval as elapsed.

**Why wrong:** the clock and catch-up disagree about how much game time elapsed. The shortfall depends on the final frame's `dt`, so it is also frame-rate dependent. This violates both the time-skip parity invariant and the determinism rule in `CLAUDE.md`.

**Owner:** `world` time-skip / game-loop orchestration.

**Existing plan:** no active plan found that covers this final-frame ordering bug. Archived 196 states the intended semantics but does not own current follow-up work.

**Next action:** new `world-034-time-skip-clock-exactness-and-catch-up-coverage.md`.

### F2 — high — AnimalAgent time-skip catch-up only reaches wild fauna

**Affected flow:** time-skip completion → animal lifecycle.

**Evidence:**

- `Fauna.resolveTimeSkip()` iterates the wild-fauna `agents` array.
- `SettlementsManager.resolveTimeSkip()` iterates loaded NPCs, but does not call `resolveTimeSkip` for:
  - loaded settlement livestock,
  - settlement rats,
  - detached livestock.
- all of these are real `AnimalAgent` instances during normal detailed simulation.

So equal `AnimalAgent` lifecycle state progresses differently during the same skip depending on which owning collection currently contains the animal.

**Why wrong:** fidelity/ownership placement changes biological simulation semantics. Wild animals advance through the skip while domestic/rats/detached instances can remain frozen.

**Owner:** global time-skip orchestration with `SettlementsManager` fan-out; no second animal simulation system is needed.

**Existing plan:** no current focused plan closes this fan-out gap. `fauna-029` already fixes corpse phase to World Time and should not be duplicated; other AnimalAgent life state still needs correct owner fan-out.

**Next action:** include in `world-034`.

### F3 — high — NPC time-skip need replay bypasses authoritative resource transactions

**Affected flow:** time-skip → NPC needs → household/economy/agriculture.

**Evidence in `NpcAgent.resolveTimeSkip()`:**

- `water` removes household water and then relieves the need;
- `waterDuty` adds household water and relieves the need;
- `food` only calls `relieveNeed(..., 'food')` — no food is consumed;
- `wood` only relieves the need when trees exist — no corresponding resource/work mutation occurs.

Separately, `SettlementsManager.resolveTimeSkip()` calls `stampSettlementAgriculture(..., nowDays)`, moving the agriculture resolution anchor to the post-skip time without executing the skipped aggregate agricultural interval.

**Why wrong:** time-skip is a parallel mutation implementation with weaker conservation semantics than normal progression. Presence/fidelity can decide whether food/work was actually paid for and can consume an aggregate agriculture interval without resolving it.

**Owner:** NPC/settlement catch-up semantics.

**Existing plan:** prior reviews recorded this, but no active focused implementation plan was found. `world-023` / `settlements-npcs-031` are adjacent agriculture work, not a replacement for the generic NPC catch-up invariant.

**Next action:** new `npc-058-time-skip-resource-and-interrupt-parity.md`.

### F4 — medium — time-skip resets NPC execution with a weaker cleanup path than normal interruption

**Affected flow:** active NPC action/combat/reservation → time-skip → resumed detailed simulation.

**Evidence:**

- `finishTimeSkipMovementReset()` leaves queue membership, clears `pendingAction`, movement, conversation presentation, path/repath state and phase.
- committed-travel catch-up has another hand-written reset sequence.
- neither path uses the existing full `resetInFlightAction(...)` interruption seam.
- prior audit evidence identifies cleanup owned by that seam which hand-written time-skip reset can omit, including action lifecycle/reservation/combat-specific cleanup.

**Why wrong:** time-skip is a third interruption implementation. Every new in-flight reservation/action feature must remember to patch multiple reset lists.

**Owner:** NPC lifecycle/interruption.

**Existing plan:** no current focused plan.

**Next action:** bundle with F3 in `npc-058`; reuse one interruption/cleanup contract rather than adding more field resets.

### F5 — high — settlement rat reconciliation checkpoint resets on every reconstruction

**Affected flow:** settlement stream-in/rebuild/save-load → rat population/food reconciliation.

**Evidence:**

- `createSettlementRats()` declares `let lastReconcileDay = -Infinity`.
- every constructed rat runtime therefore treats its first `update()` as reconciliation-due.
- reconciliation has real side effects: it may spawn a rat and `maybeEatFood()` can remove household/settlement food.
- the random rolls themselves are correctly keyed by `dayBucket`, but the **side-effect checkpoint is not persisted**.
- `RatRegistry` persists rat individuals/tombstones, while no settlement-level last-processed reconciliation bucket survives runtime reconstruction.

Thus leaving/re-entering a settlement in the same half-day bucket can replay that bucket's deterministic side effect.

**Why wrong:** deterministic random input does not make a mutation idempotent. Runtime reconstruction frequency becomes a simulation input.

**Owner:** settlement-rat persistence/cadence (`fauna` domain, using the existing rat registry rather than a new manager).

**Existing plan:** none found.

**Next action:** new `fauna-040-settlement-rat-reconciliation-checkpoint.md`.

## 5. Architecture observations

### Variable-step simulation is intentionally capped, not fixed-step/lockstep

The main simulation uses browser-frame `dt` clamped to 50 ms. This prevents extreme single-frame integration jumps but means sustained rendering below 20 FPS slows detailed simulation relative to wall time. That is an architectural property, not by itself a new defect in this audit.

Future multiplayer/authoritative replay work should not assume the current client loop is lockstep deterministic.

### Update cadence is already adaptive in fauna

`fauna-028` introduced deterministic per-animal cadence spreading keyed from stable `animalId`, with accumulated time rather than dropping elapsed time. This is the correct pattern for lowering frequency without making cadence depend on `Math.random()` or camera visibility.

No second scheduler should be introduced for findings above.

### RNG is mixed; simulation-critical paths increasingly use keyed rolls

Verified good patterns include:

- weather derived purely from seed + `elapsedDays`,
- combat critical/block/deviation rolls keyed by stable event inputs,
- player-garden NPC maintenance/watering keyed by NPC/garden/time bucket,
- rat eat/infestation rolls keyed by settlement/rat + day bucket,
- fauna update-cadence phase keyed by `animalId`.

Raw `Math.random()` still exists in the codebase. Some uses are presentation-only (dialogue/audio/visual rotation) and are not simulation defects. Some event-level fauna/player paths still use raw randomness (for example rabies transmission and riding-fall rolls). This is real determinism debt, but it spans later domain audits and existing feature plans; this review does **not** propose a global RNG manager or a broad cross-domain rewrite. `fauna-001` remains the correct verification owner for rabies transmission semantics.

### Off-screen simulation is deliberately owner-specific

There is no need for a monolithic off-screen simulation engine. Explicit travel checkpoints, aggregate agriculture and World-Time anchors are all valid lower-fidelity representations.

The invariant is narrower: crossing fidelity modes must not duplicate, lose or invent elapsed-time effects. F2/F3/F5 are violations of that invariant; the existence of different representations is not.

### Update ordering has a known one-frame asymmetry

Settlements/NPCs update before wild fauna. NPC threat inputs are therefore based on fauna state sampled before the current fauna pass, while fauna can damage NPCs later in that same frame. Previous architecture review already identified this one-frame reaction lag. No evidence in this audit shows it currently corrupts state, so it remains an architecture observation rather than a new plan.

## 6. Cross-domain dependencies / follow-ups

- **Persistence (area 03):** F5 needs a durable reconciliation checkpoint; area 03 should verify SaveData/migration continuity but should not invent a second rat-state owner.
- **NPC cognition/work (areas 12/13):** F3/F4 affect need/action semantics, but the root is the time-skip catch-up path; later reviews should not create another catch-up system.
- **Fauna ecosystem/domestic animals (areas 16/17):** F2 concerns ownership collections, not separate animal rules. All live `AnimalAgent` classes should reuse the same lifecycle catch-up primitive.
- **Player systems (area 19):** raw random riding-fall behaviour should be reviewed there in its full player/mount context.
- **Runtime architecture (area 01):** rebuild gating belongs to `world-033`; this area does not duplicate that lifecycle plan.

## 7. Existing plans that already cover findings

### `fauna-029-animal-water-route-preference-and-corpse-world-time.md` — verification needed

Already migrates animal corpse lifecycle away from accumulated real-time seconds toward `elapsedDays` anchors. Do not add another corpse/time-skip plan for that state.

### `fauna-028-animal-agent-update-cadence.md` — verification needed

Already owns adaptive fauna update cadence and deterministic phase staggering. Findings here must preserve its accumulated-time/full-rate-critical-work contract.

### `settlements-npcs-019-persistent-and-off-screen-transport.md` — verification needed

Already owns transport's detailed ↔ off-screen ↔ time-skip continuity. No generic transport changes are needed for this audit.

### `persistence-001-full-simulation-persistence.md` — verification needed

Owns persistence/hydration of NPC/household/livestock authoritative state. It does not replace the time-skip parity fixes in F1–F4.

### Archived 192 / 196

These established the current time categories and “freeze detailed simulation, catch up once” model. The new plans below repair defects in the current implementation of that model rather than designing a new time architecture.

## 8. New plans required

Created:

- `docs/plans/world-034-time-skip-clock-exactness-and-catch-up-coverage.md` — F1/F2.
- `docs/plans/npc-058-time-skip-resource-and-interrupt-parity.md` — F3/F4.
- `docs/plans/fauna-040-settlement-rat-reconciliation-checkpoint.md` — F5.

No broad RNG plan was created: deterministic keyed mechanisms already exist, and remaining raw-RNG call sites should be handled by their owning domain plans/audits rather than by a global mutable RNG service.

## 9. Verification limits

This was a static code/architecture review on `main`.

Not performed:

- browser/gameplay verification,
- production-code changes,
- automated test execution,
- long-running FPS/time-skip measurements,
- save/load/streaming reproduction.

The high findings above follow directly from current control flow/state ownership and do not depend on visual reproduction.

## 10. Master status update

Area 02 should be marked:

**⚠️ reviewed with unresolved high/critical findings**

Links:

- this review,
- new `world-034`,
- new `npc-058`,
- new `fauna-040`,
- existing `fauna-028` / `fauna-029` where relevant.
