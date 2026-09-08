# AnimalAgent Refactor Review

**Date:** 2026-09-03 (executed 2026-09-08 against `main` `c7dd39f1`)
**Status:** `done` (review only — no code changed)
**Scope:** `src/fauna/AnimalAgent.ts` (4 865 lines) and its direct ownership boundaries
**Excluded:** `NpcAgent` (reviewed separately, 2026-09-03), `createFauna.ts`, `settlement/livestock.ts`,
`settlement/rats.ts` internals, `PlayerController`, the Vue/UI layer

> This report is Phase 0 of `docs/plans/fauna-017-animal-agent-refactor.md` (status `draft`, effort `M`).
> Phase 1 of that plan is to translate §8/§9 below into its own implementation steps. This review
> recommends raising that plan's effort from `M` to `L` — see the Verdict.

> Naming note: `docs/reviews/` uses `YYYY-MM-DD--NNN--slug.md` for numbered entries. This file uses the
> path the task prompt requested, same as the `NpcAgent` and `createSettlement` reviews.

---

## 1. Executive summary

`AnimalAgent` **is the correct central integration point for one animal and must stay one.** Unlike the
`NpcAgent` review, this one finds a class that has already been factored well along its *decision* axis:
`faunaDecision.ts` owns behaviour arbitration as a real, tested priority table; `dogGuard.ts`,
`preyAlertPerception.ts`, `predatorHumanDecision.ts`, `playerAwareness.ts`, `waterTraversal.ts`,
`herdCohesion.ts`, `livestockProduction.ts`, `AnimalLife.ts`, `harvestedRemains.ts`, `corpseDecayFx.ts`
and `bloodSplat.ts` all own their slice and are called as thin adapters. There is **no** "computed and
then ignored" seam like `NpcAgent`'s strategy layer, and no duplicated decision ordering. 39 imported
modules against `NpcAgent`'s 80 is the honest measure of that difference.

What the file has instead is a **volume problem in three specific places** and a **cleanup/ownership
problem in two**. Verified measurements on current `main`:

| Metric | Value |
|---|---|
| Lines | 4 865 (456 on 2026-08-07 → 4 865 on 2026-09-08; ~10.7× in one month, 92 commits) |
| Instance fields | 91 |
| Distinct imported modules | 39 (107 lines of imports) |
| Module-level lines before `class AnimalAgent` | 1 506 (31 % of the file) |
| `ANIMAL_DEFS` species table | 329 lines (`:1088`–`:1416`) |
| Constructor positional parameters | 19 |
| `update()` positional parameters | 21 |
| Longest run of `undefined` at a call site | 8 (`settlement/rats.ts:232`) |
| `Math.random()` call sites | 22 |
| Tests that construct an `AnimalAgent` | **0** (`new AnimalAgent(` appears at exactly 5 sites, all production) |

The seven findings that carry value, in order:

1. **31 % of the file is not the agent.** `ANIMAL_DEFS` + the species taxonomy is 640 lines of pure
   data sitting above the class (`:757`–`:1002`, `:1088`–`:1416`). Moving it to `fauna/animalDefs.ts`
   with a re-export is mechanical, zero-risk, and also **breaks a real import cycle**
   (`AnimalAgent.ts` ↔ `world/animalTraps.ts`).
2. **19- and 21-parameter positional signatures.** `rats.ts:232` passes eight consecutive `undefined`
   to `update()`; `livestock.ts:659` passes six; the constructor call sites pass three-`undefined` runs
   between four same-typed `string | undefined` parameters. This risk is **already recorded** in
   `docs/plans/LOOSE-ENDS.md:30` **with a precedent bug** — `docs/research/2026-09-01-npc-animal-threat-forwarding.md`
   documents exactly this failure mode in `NpcAgent.update()`. The repo has already applied the fix
   twice (`CreateSettlementDeps`, `NpcAgentDeps`).
3. **`driveMounted()` re-implements `update()`'s per-tick tail by hand, and it has already drifted.**
   A ridden, walking horse at night burns hunger and thirst at **2×** the rate of a free-roaming one
   (`:2146` passes `{}` where `:3195` passes `hungerThirstRate: 0.5`), and none of the eight cooldown/
   one-shot timers decrement while mounted (`:2915`–`:2922` sits after the `mounted` early-return at
   `:2911`), so anything that sets `hurtAnimTimer` while ridden freezes the mount's animation until
   dismount. See D2.
4. **Two presentation owners already exist, were built for this class, and are not wired up.**
   `ui/agentStatusLabel.ts`'s `createAgentStatusLabelController` (`:146`) and
   `shared/agentAnimationSet.ts`'s `createAgentAnimationSet` (`:55`) came out of the `NpcAgent`
   refactor; both name `AnimalAgent` in their own JSDoc as the intended second consumer, and the
   pending adoption is tracked in `docs/plans/LOOSE-ENDS.md:23`. `AnimalAgent` still hand-rolls
   13 label fields and 9 animation fields, and duplicates the 22-line bar-sync block twice.
   **One adoption blocker must be fixed first** — see R1.
5. **A predator that dies while holding a carcass claim locks that carcass** for the rest of its
   linger (up to 60 s), because `cancelSourceTarget()` (`:4158`) is the only path that releases a
   claim and neither `collapse()` (`:2621`) nor `dispose()` (`:2031`) calls it. Same root-cause class
   as the `NpcAgent` review's D1: one cleanup written once, not called from every terminal transition.
6. **~325 lines of food/water source targeting with no owner and no reachable test.**
   `foodWaterTargeting.test.ts` exists but can only test the four module-level pure functions; the five
   `find*Target` selectors, the revalidation contract in `isSourceTargetValid` and the five-way
   "revalidate at completion or grant no relief" switch in `performSourceAction` have zero coverage.
7. **Per-tick allocations in the fauna hot path.** `resolveAlertThreat()` (`:3850`) builds a fresh
   candidate array plus one object literal per candidate **every tick for every prey/domestic animal**;
   `resolveGuardTarget`, `updateDogVocalization` and `pursuePest` each allocate a `.map()`/`.filter()`
   per dog per tick. `resolveLureTarget` (`:1014`) two-thousand lines up is explicitly documented as
   "pure and allocation-free" — the shape to copy already exists in this very file.

Everything above is fixable **without changing animal behaviour**, except D1/D2/D3, which are three
narrow defects this review recommends landing deliberately, each in its own labelled commit with tests.

Recommendation: **REFACTOR**, in eleven steps. Four new modules, two existing shared modules extended,
three behaviour fixes, and the first test that ever constructs an `AnimalAgent`. Target size afterwards
≈ **3 200 lines**. That is the intended end state — the class genuinely integrates perception,
decision dispatch, movement, combat, needs, corpse lifecycle, production, riding and persistence for one
entity, and shrinking it further would mean inventing the parallel systems this repo's rules forbid.

---

## 2. Map of current responsibilities

Line ranges are anchored on `main` `c7dd39f1`.

### 2.1 Module scope (lines 1–1506 — 31 % of the file)

| # | Lines | Responsibility | Verdict |
|---|-------|----------------|---------|
| 1 | 1–107 | 39 imports | symptom, not a concern |
| 2 | 109–125 | `NavRescue` type + factory, `STALE_NAV_ROUTE_DIST` | stays (movement) |
| 3 | 127–404 | **~45 tuning constants across 10 unrelated subsystems** — corpse decay, rabies, dangerous trait, night speed, roam, perception, fire, flee, village, wander/roaming tiers, trips, dog pest, stamina, human decision, food/water search, lure | ~10 belong with their owners — **P8** |
| 4 | 405–531 | `FaunaActionKind`, `FaunaAiBranch`, `FaunaNavRescueDebugInfo`, **`AnimalAgentDebugInfo` (89 lines)** | diagnostics — **P7**, type could move |
| 5 | 533–545 | `AnimalSaveState` | stays (persistence contract) |
| 6 | 547–593 | `SourceTarget`, `AnimalTrip` types | move with **E4** / **E5** |
| 7 | 595–755 | Pure helpers: `forageEdgeScore`, `hashString`, `tripDayBucket`, `selectDietFeedKind`, `isCarcassEdible`, `carcassFoodValue`, `carcassCandidateScore`, `EnvironmentSense`, `VillageInfo`, `isWithinVillageRadius`, `canPredatorPursueIntoVillage`, `villageFleeBiasFalloff` | already pure + tested — mostly stays |
| 8 | 757–1002 | **Species taxonomy** — `AnimalRole`/`Sociability`/`LifeStage`/`Kind`, `ANIMAL_LABELS`, `AnimalDef` + 6 sub-configs, `HERBIVORE_DIET`, `MEAT_DIET`, `dietAcceptsItem` | **E2 — move** |
| 9 | 1004–1086 | `resolveLureTarget`, `DogGuardTarget`, **5 dog constants**, `PREY_ALERT_RANGE_BONUS` | constants → **P8** |
| 10 | 1088–1416 | **`ANIMAL_DEFS` — 329 lines of species data** | **E2 — move** |
| 11 | 1418–1497 | `NearbyNpcCandidate`, `FrenzyWolfCandidate`, `pickNearestEligibleWolf`, `rollsRabiesInfection`, `isRabiesCorpseContact`, `pickRabidTarget` | already pure + tested — stays |

### 2.2 Class scope (lines 1507–4865)

| # | Lines | Responsibility | Domain | Verdict |
|---|-------|----------------|--------|---------|
| 12 | 1508–1877 | **91 field declarations** | mixed | shrinks with extractions |
| 13 | 1879–2003 | Constructor — **19 positional parameters** | lifecycle | **P3 — deps object** |
| 14 | 2008–2029 | `tickMaturity`, `labelHeight` | lifecycle/presentation | stays |
| 15 | 2031–2047 | `dispose` | lifecycle | stays; **D1** touches it |
| 16 | 2049–2108 | `isDead`/`isMountable`/`isMounted`/`isSprinting`/`setMounted`/`mountSeatTransform` | riding API | stays |
| 17 | 2110–2169 | **`driveMounted` — hand-copied `update()` tail** | riding | **D2 — unify** |
| 18 | 2177–2312 | `markDangerous`, frenzy/rabies flags, threat getters, `feedByPlayer`, `setHighlighted`, `showDebug`/`hideDebug`/`toggleDebug` | public API | stays |
| 19 | 2314–2399 | `navDebugInfo`, **`getDebugInfo` (71 lines)** | diagnostics | stays — **P7** |
| 20 | 2404–2465 | `snapshot`, `hydrate` | persistence | stays |
| 21 | 2468–2502 | `readyToRemove`, `resolveTimeSkip`, `bury` | lifecycle | stays; **D3** |
| 22 | 2507–2756 | **Corpse/remains/decay/rot-FX/rabies-exposure/blood-splat — ~250 lines** | corpse lifecycle | **E3 — extract** |
| 23 | 2764–2807 | `tickProduction`, egg/milk API | livestock | stays (thin, correct) |
| 24 | 2809–3231 | **`update()` — 423 lines**: 21-param signature (81 lines), dead branch, mounted branch, 8 timer decrements, vocalization roll, per-tick caches, `senseEnvironment`, threat resolution, rabid gate, **13-case switch**, aggro edge, tick tail | everything | core stays; **P1** cleanup |
| 25 | 3239–3275 | `updateDebugVisual`, `setIntent`, `buildDecisionContext` | coordination | stays |
| 26 | 3286–3456 | `refreshThrottledHumanIntent`, `decideHumanResponse`, `senseNpcThreat`, `resolveNpcTarget`, `decideNpcResponse`, `refreshThrottledNpcIntent` | perception | stays (target commitment is agent state) |
| 27 | 3462–3563 | `arrivedAtStrategicVillage`, `moveTowardStrategicVillage`, `chaseHuman`/`attackHuman`/`chaseNpc`/`attackNpc` | combat | stays |
| 28 | 3571–3624 | `senseEnvironment` | perception | stays (thin over `playerAwareness.ts`) |
| 29 | 3629–3712 | `nearestVillage`, `fleeFrom`, `walkSpeedNow`/`sprintSpeedNow`, `isNearVillage`, `canPursueIntoVillage` | movement | stays |
| 30 | 3714–3773 | `updatePredator`, `attack`, `tryRabiesBiteInfection` | combat | stays |
| 31 | 3775–3835 | `updatePrey`, `pursuePest` | behaviour | stays; **P6** allocation |
| 32 | 3850–3894 | `resolveAlertThreat` | perception | stays; **P6** — worst allocator |
| 33 | 3896–3914 | `pursueLure` | behaviour | stays |
| 34 | 3926–4010 | `resolveGuardTarget`, `updateDogGuard`, `updateDogVocalization` | dog | stays; **P6/P8** |
| 35 | 4019–4040 | `updateRabid` | rabies | stays |
| 36 | 4047–4370 | **Food/water source targeting + consumption + carcass claims — ~325 lines** | needs | **E4 — extract** |
| 37 | 4372–4488 | `wander`, `tickTrip`, `maybeStartWaterTrip`, `continueTrip`, `findWaterTripDestination` | roaming | **E5** (trip state machine) |
| 38 | 4490–4564 | `needWanderBias`, `pickWanderTarget`, `pickFollowTarget`, `pickPointNear` | roaming | mostly stays; probe → **E5** |
| 39 | 4566–4620 | `isWalkable`, `resolveWaterTraversal`, `swimExertionNow`, `tickDrowning` | traversal | stays (thin over `waterTraversal.ts`) |
| 40 | 4626–4663 | `resolvePreyTarget`, `nearest` | target commitment | stays |
| 41 | 4665–4794 | `steerToward`, `stepNavRescue`, `attemptNavRepath`, `clearNavRescue`, `arrived`, `clampBounds` | movement | stays |
| 42 | 4796–4809 | `snapY` | movement | stays |
| 43 | 4811–4864 | `findAction`, `playAction`, `playOneShotAnim`, `updateAnim` | presentation | **E6 — adopt shared owner** |

**Summary:** 11 module-level concerns, 32 class-level concerns. Four of them (species data, corpse
lifecycle, source targeting, presentation) account for ~1 600 lines and have owners that either already
exist or obviously should.

---

## 3. Concrete problems and suspicious places

### D1 — A predator that dies while holding a carcass claim locks that carcass (medium, defect)

`claimAsFood()` (`:4352`) sets `foodClaimedBy` on the corpse at *selection* time (`findCarcassTarget`,
`:4336`). The **only** path that releases it is `releaseFoodClaim()` (`:4359`), reachable **only**
through `cancelSourceTarget()` (`:4158`–`:4161`).

Neither `collapse()` (`:2621`) nor `dispose()` (`:2031`) calls `cancelSourceTarget()`, and `update()`
early-returns for a dead agent at `:2890` — so once a claiming predator dies, the claim can never be
released.

Failure trace (reachable today):

1. Wolf A picks prey corpse C in `findCarcassTarget` and claims it (`:4336`).
2. A is killed while approaching — a household dog (fauna-011, `updateDogGuard` `:3955` → `attack`
   `:3756`), the player (`gameLoop.ts:984`/`:1140`), an NPC (`faunaCombat.ts:91`), a rabid animal
   (`updateRabid` `:4019`), or drowning (`tickDrowning` `:4618`).
3. `collapse()` runs. `A.sourceTarget` still points at C; `C.foodClaimedBy` still points at A.
4. For every other predator, `isCarcassEdible({ claimedBy: C.foodClaimedBy, eater: this })` (`:663`)
   returns `false`, so `findCarcassTarget` (`:4317`) skips C entirely.
5. C stays unfeedable until `readyToRemove()` disposes it — up to `CORPSE_LINGER_SECONDS` = 60 s.

The whole fauna-005 scavenging tier (`rotting`/`bones` fallback for a hungry wolf) is gated behind the
same check, so this silently removes carrion from the ecosystem exactly in the situation that produces
the most of it: a settlement under predator pressure where wolves are being killed.

### D2 — `driveMounted()` re-implements `update()`'s tick tail and has already drifted (medium, defect)

`driveMounted` (`:2110`–`:2169`) reproduces `update()`'s tail (`:3189`–`:3230`) by hand. Verified
differences:

| Concern | `update()` | `driveMounted()` | Consequence |
|---|---|---|---|
| Metabolism rate | `{ hungerThirstRate: isNight && !sprinting ? 0.5 : 1 }` (`:3195`) | `{}` (`:2146`) | **A ridden, walking horse at night burns hunger/thirst at 2× a stabled one's rate.** |
| Timer decrements (`attackCooldown`, `attackAnimTimer`, `hurtAnimTimer`, `alertTimer`, `provokedTimer`, `sourceSearchCooldown`, `howlPauseTimer`, `vocalizeAlertRemainingSec`) | `:2915`–`:2922` | absent | `updateAnim()` (`:2856`) early-returns while `hurtAnimTimer > 0`; `takeDamage()` (`:2612`) sets it. A mount damaged while ridden **freezes on its hurt clip until dismounted.** |
| `tickMaturity` / `tickProduction` | `:2963`–`:2964` | absent | inert today (no mountable species is a herd species or has `production`) — a latent trap for a future mountable kind |
| `labelDistanceState` | `:3221` | absent | bars-visibility / opacity / shadow-casting freeze at whatever the last free-roaming tick set |
| `clampBounds` | `:3189` | absent | **deliberate and documented** (`:2101`) — a ridden mount must leave its home radius |
| Bar sync (22 lines) | `:3198`–`:3220` | `:2148`–`:2167` | byte-for-byte duplicate |

`this.isNight` is itself assigned at `:2952`, *after* the `mounted` early-return at `:2911`, so it is
stale while ridden and cannot simply be reused — the fix has to thread `dayFactor` through
`driveMounted` or accept the value from the caller.

Note that `docs/state/fauna.md`'s Behaviour section states that water traversal "is the single call
site every movement mode shares... traversability can never diverge between free-roaming and ridden
movement." That is true for `isWalkable` (`:4572`) and is good design — but the sentence reads as a
general guarantee that the rest of the tail does not honour.

### D3 — `resolveTimeSkip()` does not advance juvenile maturity (low–medium, invariant)

`resolveTimeSkip()` (`:2486`–`:2492`) advances exactly two things: `timeSinceDeath` for a corpse, and
one bulk `tickAnimalLife()` for a live animal. `age`/`lifeStage` are advanced **only** by
`tickMaturity()` (`:2008`) inside `update()` (`:2963`), and `update()` is gated off entirely during a
skip (plan 196, `gameLoop.ts`).

`JUVENILE_MATURITY_SECONDS = 600` (`herdCohesion.ts:69`). An 8 h skip is worth far more than that in
world time, so a juvenile deer that should have matured during the skip is still a juvenile after it.

Production is safe by construction and is the pattern to follow: `productionReadyAtDays` is an absolute
`elapsedDays` anchor compared lazily against `nowDays` (`livestockProduction.ts`), so it self-corrects
across any gap with no catch-up code. `age` is the one seconds-accumulating field in this class that
isn't. `CLAUDE.md` lists "time-skip follows the same simulation semantics as normal progression" as an
architecture invariant; this is a narrow but real violation of it.

### P1 — `update()`'s 423 lines carry six copies of one reset and three cancel conventions (high)

The `switch (branch)` at `:3020`–`:3169` has 13 cases. Inside it:

- **Six copies of the same four-line reset.** `this.threateningHuman = false; this.humanDecisionTimer = 0;
  this.npcDecisionTimer = 0; this.provokedTimer = 0` appears at `:2986`–`:2989` (rabid gate), `:3022`–`:3025`
  (`dog-guard`), `:3039`–`:3042` (`fire-avoid`), `:3049`–`:3052` (`frenzy-beeline`), `:3154`–`:3157`
  (`predator-normal`) and `:3162`–`:3165` (`prey-normal`). A seventh, partial copy lives in `takeDamage`
  (`:2601`–`:2603`, resetting the two timers to force an immediate re-score).
- **Three different `cancelSourceTarget()` conventions in one switch.** Eight branches call it inline
  (`:3043`, `:3066`, `:3099`, `:3115`, `:3122`, `:3129`, `:3136`, `:3147`); `dog-guard` calls it inside
  `updateDogGuard` (`:3956`) instead; `frenzy-beeline` never calls it; and `npc-attack-frenzied`
  deliberately omits it with a comment that says so (`:3073`–`:3074`, "asymmetric with the other
  branches on purpose, implementation notes F2, not fixed here"). The deliberate exception is fine —
  having it be one of *four* different shapes is what makes it invisible.
- **32 lines of `console.log` inside the simulation switch.** Four near-identical
  `isNpcCombatDebugMode()` blocks (`:3057`, `:3075`, `:3090`, `:3106`), and **all four contain the same
  copy-paste defect**: `` `npcThreat=${npcThreat!.id}/${npcThreat!.id}` `` prints the id twice. Given
  `NearbyNpcCandidate` is `{ id, x, z, homeId? }` and `homeId` is what the dog-guard tier keys on,
  the second slot was almost certainly meant to be `homeId`.

### P2 — Presentation is hand-rolled although both shared owners already exist (high — cheapest win)

**Label.** 8 DOM fields + `labelDistanceState` (`:1605`–`:1613`) + 4 `last*Percent` fields
(`:1614`–`:1617`) = 13 fields; ~19 lines of constructor wiring (`:1979`–`:1997`); a 22-line bar block in
`update()` (`:3198`–`:3220`) **duplicated verbatim** in `driveMounted` (`:2148`–`:2167`); plus ad hoc
DOM writes scattered across `hydrate` (`:2453`, `:2461`–`:2463`), `harvestMeat` (`:2540`), `collapse`
(`:2631`–`:2633`), `markDangerous` (`:2184`), `setHighlighted` (`:2277`) and `dispose` (`:2042`–`:2043`).

`ui/agentStatusLabel.ts` now exports `createAgentStatusLabelController` (`:146`) with exactly this
surface — `setName`, `sync(bars, mesh, distance, shadowDistance, gaze?)`, `settleAtZeroHp()`, `dispose()`,
plus raw `label`/`el` escape hatches for the highlight class and the maturity height change. Its own
JSDoc (`:105`–`:111`) names the wiring "both `NpcAgent` **and `AnimalAgent`** hand-roll today", and
`NpcAgent` already uses it (`NpcAgent.ts:1370`). `sync()` takes `{ current, max }` per bar, so fauna's
inverted satiety/hydration map cleanly to `{ current: 1 - hunger, max: 1 }`.

**Animation.** 7 action fields (`:1575`–`:1586`) + `currentAction` + `mixer`, and `findAction`/
`playAction`/`playOneShotAnim`/`updateAnim` (`:4811`–`:4864`). `shared/agentAnimationSet.ts` exists, is
tested (`agentAnimationSet.test.ts`), and its module doc (`:3`–`:11`) says outright that
"`AnimalAgent`/`PlayerController` adoption is tracked in `docs/plans/LOOSE-ENDS.md`" — which it is, at
line 23 of that file.

**Adoption blocker — must be fixed before wiring.** `createAgentAnimationSet.resolve()` matches clip
names with `c.name.toLowerCase() === name.toLowerCase()` (`agentAnimationSet.ts:74`) — exact match only.
`AnimalAgent.findAction()` (`:4819`) additionally accepts the `Armature|Walk` form that the Farm Animals
cow/sheep packs actually export (`:4817`–`:4818`). Adopting the shared set as-is **silently kills cow and
sheep animation**. This is a concrete regression trap, not a hypothetical — see R1.

### P3 — 19- and 21-parameter positional signatures with long `undefined` runs (high)

**Constructor** (`:1879`–`:1902`), 19 parameters. Positions 13–19 are
`ownerHouseId?: string`, `onDeath?`, `herdId?: string`, `lifeStage = 'adult'`, `motherId?: string`,
`household?`, `spawnPointId?: string` — **four `string | undefined` parameters** among seven optionals.
Call sites:

| Call site | Args | `undefined` placeholders |
|---|---|---|
| `settlement/livestock.ts:166` | 18 | 1 + a run of 3 before `household` |
| `settlement/livestock.ts:517` | 18 | 1 + a run of 3 before `household` |
| `settlement/livestock.ts:570` | 11 | – (truncated arg list) |
| `settlement/rats.ts:149` | 14 | run of 3 before `onAnimalDeath` |
| `fauna/createFauna.ts:648` | 19 | 3 |

Swapping `herdId` and `motherId`, or `ownerHouseId` and `spawnPointId`, compiles cleanly.

**`update()`** (`:2809`–`:2889`), 21 parameters, an 81-line signature. Call sites:

| Call site | Longest `undefined` run |
|---|---|
| `settlement/rats.ts:232` | **8 consecutive** |
| `settlement/livestock.ts:659` | 6 consecutive, plus one more at position 20 |
| `fauna/createFauna.ts:953` | 2 |

`nearbyNpcs` (11) and `nearbySettlementNpcs` (19) are both `readonly NearbyNpcCandidate[]`;
`nearbyPredators` (18) and `nearbyRats` (21) are both `readonly AnimalAgent[]`. Four same-typed
parameters at four widely separated positions, reached past runs of six and eight `undefined`.

`docs/plans/LOOSE-ENDS.md:30` already records this (with a stale count of 16 — it is 21 now) and cites
the precedent: `docs/research/2026-09-01-npc-animal-threat-forwarding.md`, a real bug caused by exactly
this shape in `NpcAgent.update()`. The repo has applied the deps-object fix twice already
(`CreateSettlementDeps` in `settlement/createSettlement.ts`, `NpcAgentDeps` in `ai/NpcAgent.ts`).

### P4 — The corpse lifecycle is a second entity's state machine inside the live-animal class (medium)

`:2497`–`:2756` is ~250 lines: `bury`, `canHarvestMeat`, `harvestMeat`, `spawnHarvestedRemains`,
`hideLivingVisual`, `holdCorpse`, `releaseCorpseHold`, `collapse`, `spawnDeathSplat`, `corpsePhase`,
`advanceCorpseDecay`, `onCorpsePhaseChanged`, `spawnNaturalRemains`, `applyRotInfluence`,
`applyRabiesCorpseExposure`, `updateRotFx`, `disposeRotFx` — plus `claimAsFood`/`releaseFoodClaim`/
`markFoodConsumed` (`:4352`–`:4370`), 12 fields (`bloodSplat`+token, `harvestedRemains`+token,
`naturalRemains`+token, `rotFx`, `corpsePhaseValue`, `buried`, `meatHarvested`, `corpseHeld`,
`rabiesExposedAnimalIds`) and 10 constants (`:161`–`:198`).

Nothing in it reads needs, decisions or movement, and `update()`'s dead branch (`:2890`–`:2904`) is a
completely separate 15-line tick. Its *pure rules* are already extracted and tested
(`corpsePhaseFromElapsed`, `rotFxRelevant`, `canHarvestMeatFrom`, `corpseLingerSeconds`,
`isRabiesCorpseContact`) and its *presentation* already has owners (`harvestedRemains.ts`,
`corpseDecayFx.ts`, `bloodSplat.ts`). What has no owner is the **state machine that sequences them** —
and that is exactly where D1 lives.

### P5 — Source targeting: ~325 lines, no owner, and no test can reach it (medium-high)

`:4047`–`:4370`: `pursueNeeds`, `findFoodTarget`, `findDietTarget`, `findGrassPatchTarget`,
`isSourceTargetValid`, `cancelSourceTarget`, `pursueSourceTarget`, `performSourceAction`,
`findTroughTarget`, `findWaterTarget`, `findForageTarget`, `findCarcassTarget`, plus 13 constants
(`:346`–`:399`, `:597`).

`performSourceAction` (`:4191`) is a five-way switch, and **each arm re-implements the same
"revalidate at completion or grant no relief" contract by hand**:

| Arm | Revalidation | Lines |
|---|---|---|
| trough water | `household.water.has()` then `.remove()` | `:4200`–`:4203` |
| carcass | re-read live phase, re-run `carcassFoodValue` | `:4212`–`:4218` |
| feed item | `household.items.remove(exact kind)` | `:4225`–`:4227` |
| grass patch | `grassForage.consume()` first-wins | `:4232`–`:4234` |
| abstract forage | none (unconditional `consumeFood`) | `:4236` |

`isSourceTargetValid` (`:4120`) carries the matching approach-time checks, again per-kind.

`foodWaterTargeting.test.ts` exists, but it can only import the module-level pure functions
(`forageEdgeScore`, `isCarcassEdible`, `carcassFoodValue`, `carcassCandidateScore`) — because reaching
anything above requires a real `AnimalAgent`, and nothing constructs one. The five selectors, the
revalidation contract and the consumption switch all have **zero** coverage.

`docs/state/fauna.md` already names this the structural asymmetry vs. NPC: "un-arbitrated
hardcoded-order need-seeking underneath". Extraction does not resolve that asymmetry — it makes the
hardcoded order visible and testable in one place, which is the prerequisite for ever deciding about it.

### P6 — Per-tick allocations in the fauna hot path (medium, performance)

| Site | What it allocates, per tick | Scope |
|---|---|---|
| `resolveAlertThreat` (`:3850`–`:3883`) | one `PreyAlertCandidate[]` + one object literal per candidate over `others` **and** `nearbyPredators` | **every prey/domestic animal, every tick** — the largest source in the file |
| `resolveGuardTarget` (`:3930`) | `nearbyPredators.map(...)` + one literal per wolf | every dog, every tick |
| `updateDogVocalization` (`:3990`–`:3992`) | `.filter().map()` over the **same** array, in the **same** tick | every dog, every tick |
| `pursuePest` (`:3814`) | `nearbyRats.map(...)` + one literal per rat | every dog, every tick |
| `setIntent` (`:3256`–`:3260`) | a `PlannedAction` literal, plus `{ ...current, ...next }` inside `adoptPlannedAction` (`simulation/actionControl.ts:42`) even on the unchanged path | 25 call sites, ≥1 per animal per tick |
| `copyVec3` (`:3124`, `:3131`, `:3138`, `:3733`, `:3786`, `:3958`, `:4029`) | a second object literal | per steering branch |

The counter-example is two thousand lines up in this same file: `resolveLureTarget` (`:1014`) is
explicitly documented as "Pure and allocation-free — safe to call from a throttled per-animal check
without a second candidate-array pass". `nearest()` (`:4641`) is likewise a plain loop that only reports
to `getAgentCpuDiag().recordNearestScan()`.

This is measurable with tooling the repo already has: `perf/agentCpuDiag.ts` wraps the whole fauna pass
(`createFauna.ts:951`/`:976`), and `fauna-012`'s own acceptance criterion in `docs/plans/README.md:130`
is "brak zauważalnego regresu frame time przy większej liczbie zwierząt".

### P7 — Diagnostics are 160 lines interleaved with simulation (low-medium — keep, but move the type)

`AnimalAgentDebugInfo` (`:436`–`:524`, 89 lines of type with per-field JSDoc), `navDebugInfo` (`:2314`),
`getDebugInfo` (`:2329`–`:2399`), `updateDebugVisual` (`:3239`), and five fields that exist only for
them (`debugBranch`, `debugLastStepDist`, `lastFaunaDecisionInput`, `lastBarkStimulus`,
`lastPreyAlertThreat`).

**This should mostly stay.** It is the reason fauna is debuggable at all, `getDebugInfo()` reads ~30
private fields so it has to be a method, and `debug/faunaInspector.ts` is a legitimate consumer. The
only piece worth moving is the 89-line *type declaration*, and only if it can go without churning
`debug/faunaInspector.ts` and `debug/npcDebugApi.ts`. Low value; listed here for completeness, not
recommended as a step.

### P8 — Constants parked away from the systems that own them (low)

- `DOG_GUARD_OWN_RADIUS`, `DOG_GUARD_ASSIST_RADIUS`, `DOG_BARK_HOWL_RADIUS`, `DOG_BARK_STRANGER_RADIUS`,
  `DOG_BARK_COOLDOWN_SEC` (`:1050`–`:1070`) are passed straight into `dogGuard.ts`'s pure functions as
  arguments (`:3937`–`:3938`, `:3993`, `:3995`). They are that module's tuning.
- `PREY_ALERT_RANGE_BONUS` (`:1086`) is only ever used at `:3881`, feeding `preyAlertPerception.ts`.
- `SCAVENGE_ROTTING_HUNGER_THRESHOLD`/`SCAVENGE_BONES_HUNGER_THRESHOLD` (`:360`/`:363`) and
  `CARCASS_VALUE_WEIGHT` (`:370`) are read only by `carcassFoodValue`/`carcassCandidateScore`, which
  move to the foraging module (E4).
- `DOG_PEST_RADIUS` (`:338`) belongs with `resolveDogPestTarget` in `dogGuard.ts`.

### P9 — 22 `Math.random()` sites (low — record, do not fix here)

`docs/state/fauna.md`'s Limitations section already states the policy explicitly: movement-target search
"uses unseeded randomness... internally consistent today only because wild-fauna individual state is
never persisted". That covers `findWaterTarget` (`:4257`–`:4258`), `findForageTarget` (`:4284`–`:4285`),
`findWaterTripDestination` (`:4470`–`:4471`), `pickPointNear` (`:4554`–`:4555`), `wander`'s rest roll
(`:4387`–`:4389`) and `pickWanderTarget`'s timers (`:4504`, `:4509`, `:4513`).

Two sites are **not** wild-fauna-only and are worth recording:

- `hydrate()`'s corpse tip side (`:2457`) rolls **on load**, for a *persisted livestock* corpse — the
  same save loaded twice tips the same corpse to a different side.
- `tickProduction()`'s stagger (`:2767`) seeds `productionReadyAtDays`, which **is** in `AnimalSaveState`.
  It only fires when the field is still `null`, so a hydrated animal is unaffected; a freshly spawned
  one gets a non-reproducible anchor that is then persisted.

Both are cosmetic/benign today. Neither should be changed inside a refactor — record in
`docs/plans/LOOSE-ENDS.md`.

### P10 — Zero tests construct an `AnimalAgent`, and unlike `NpcAgent` that is now fixable (medium)

Nine fauna test files import from `AnimalAgent.ts`; every one imports only module-level pure functions
or `ANIMAL_DEFS`. `new AnimalAgent(` appears at exactly five sites, all production.

The `NpcAgent` review accepted this as unfixable because `NpcAgent.create()` is `async` and loads a
GLTF. **`AnimalAgent` is different**: its constructor is synchronous and has a full capsule fallback
path with no GLB at all (`:1927`–`:1939`). Two things block a test today — the 19 positional parameters,
and the CSS2D label built unconditionally in the constructor (`:1979`–`:1997`, needs `document`).

Step 2 (deps object) removes the first. The second is already solved in this repo:
`src/settlement/settlementSignposts.test.ts:1` uses `// @vitest-environment jsdom` (the default
environment in `vite.config.ts:81` is `node`, and `jsdom` is a devDependency). So the first
`AnimalAgent.test.ts` becomes genuinely reachable after step 2 — which is what makes steps 5–7
verifiable rather than "moved and hoped".

### P11 — Minor ownership smells (low)

- **Three copies of the radial-probe search.** `findWaterTarget` (`:4251`), `findForageTarget` (`:4280`)
  and `findWaterTripDestination` (`:4466`) are the same loop — random angle + distance, `isWalkable`,
  wild/village exclusion, home/roam bound, `metric * 10 - distance` scoring, keep best. Only the probe
  predicate and the center differ.
- **`sourceDest`'s field doc no longer matches its use.** Declared at `:1820` as "Scratch vector for
  `steerToward` calls toward `sourceTarget`", it is also used by `pursueLure` (`:3911`), `pursuePest`
  (`:3832`) and both trip legs (`:4443`, `:4454`).
- **`maybeStartWaterTrip` burns its cooldown window on a failed probe.** `lastWaterTripBucket = bucket`
  (`:4420`) is written *before* the destination search (`:4421`), so a probe that finds no shoreline
  costs the animal a full `cooldownDays`. Probably intended as a bound; it is not stated.
- **Dog behaviour is gated by `kind === 'dog'` inline**, at three call sites (`:2977`, `:3181`, `:3800`),
  unlike every other species behaviour in this file. `AnimalDef`'s own convention, repeated in six field
  docs, is "presence of this field IS the capability" (`mount`, `production`, `scavenging`, `diet`,
  `water`, `roaming`, `trips`). Dog guarding/barking/pest-chasing is the one behaviour that did not get
  a capability field.

---

## 4. What must stay in `AnimalAgent`

Do not extract any of these.

1. **The single `update()` tick and the `decideFaunaBehaviour` switch** (`:3018`–`:3169`).
   `faunaDecision.ts` already owns the *ordering* as tested data; the switch is dispatch, and one entity
   must have one place that dispatches. P1 cleans it up; it does not move.
2. **`setIntent` / `pendingAction` / `actionLifecycle`** (`:3255`) — the plan-055 seam shared with
   `NpcAgent` via `simulation/`.
3. **Movement execution** — `steerToward`, `stepNavRescue`, `attemptNavRepath`, `clearNavRescue`,
   `clampBounds`, `snapY`, `isWalkable`, `arrived`, `withinRange`, `walkSpeedNow`/`sprintSpeedNow`,
   `fleeFrom`, `nearestVillage`, `isNearVillage`. Already delegates to `terrain/slopeConstraint.ts`,
   `navigation/navigation.ts`, `ai/npcMovementWatchdog.ts` and `fauna/waterTraversal.ts`.
4. **Target commitment** — `resolvePreyTarget` (`:4626`), `resolveNpcTarget` (`:3382`), `nearest`
   (`:4641`), plus `preyTarget`/`npcTarget`. These hold per-agent commitment state and are the
   documented fix for target flicker (npc-005, plan 179 follow-up).
5. **Perception adapters** — `senseEnvironment`, `senseNpcThreat`, `refreshThrottledHumanIntent`,
   `refreshThrottledNpcIntent`, `decideHumanResponse`, `decideNpcResponse`, `resolveAlertThreat`,
   `resolveGuardTarget`. They own throttle timers and caches, which are agent state; the scoring
   underneath is already in `predatorHumanDecision.ts` / `preyAlertPerception.ts` / `dogGuard.ts`.
6. **Combat entry seams** — `takeDamage` (`:2595`), `attack` (`:3756`), `attackHuman` (`:3510`),
   `attackNpc` (`:3547`), `collapse` (`:2621`). Small, correct, and where animal-owned consequences
   (provocation, blood trace, rabies roll, `onDeath`) attach.
7. **`resolveTimeSkip`** (`:2486`) — must stay in the class that owns the fields normal progression
   mutates, or the invariant becomes two implementations. D3 fixes what it misses; it does not move it.
8. **Persistence** — `snapshot` (`:2404`) / `hydrate` (`:2433`) / `AnimalSaveState`. Even after E3, the
   corpse fields are serialized here.
9. **The public API.** 49 files import from `AnimalAgent.ts`. `isDead`, `isMountable`, `isMounted`,
   `setMounted`, `mountSeatTransform`, `driveMounted`, `markDangerous`, `setFrenzied`, `isFrenzied`,
   `isRabid`, `infectWithRabies`, `isThreateningHuman`, `npcAttackTarget`, `isHuntingLive`,
   `recentVocalizeAlert`, `feedByPlayer`, `setHighlighted`, `showDebug`/`hideDebug`/`toggleDebug`,
   `getDebugInfo`, `bury`, `canHarvestMeat`, `harvestMeat`, `holdCorpse`, `releaseCorpseHold`,
   `corpsePhase`, `readyToRemove`, `readyToLayEgg`/`markEggLaid`/`notifyEggCollected`/`canBeMilked`/
   `startMilkCooldown`, `dispose` — none of these change shape.
10. **`getDebugInfo()`** — see P7. It reads ~30 private fields and is the fauna debugging asset.
11. **Direct ownership of `AnimalLifeState` / `HealthState`.** No snapshot/copy layer.

---

## 5. What should actually be extracted

Four new modules, two existing owners adopted, one existing owner given its constants back.

### E2 — `src/fauna/animalDefs.ts` (new; the single largest, lowest-risk win)

Move the species taxonomy and data: `AnimalRole`, `AnimalSociability`, `AnimalLifeStage`, `AnimalKind`,
`ANIMAL_LABELS`, `AnimalDef`, `WaterTripConfig`, `AnimalDietConfig`, `ScavengingConfig`,
`MountPointConfig`, `LivestockProductKind`, `LivestockProductionConfig`, `HERBIVORE_DIET`, `MEAT_DIET`,
`dietAcceptsItem`, `ANIMAL_DEFS`, and the three roaming/trip constants they reference
(`SMALL_ROAMING_RANGE`, `LARGE_ROAMING_RANGE`, `DEER_WATER_TRIP`).

**~640 lines moved, zero behaviour.** Re-export every symbol from `AnimalAgent.ts`
(`export * from './animalDefs'` or an explicit list) so all 49 importers are untouched.

Dependency check: the new module imports `AnimalMetabolismConfig`/`DEFAULT_ANIMAL_METABOLISM` from
`AnimalLife.ts`, `AnimalWaterCapability` from `waterTraversal.ts`, `ItemKind` from `items/items.ts`.
None of those import `AnimalAgent.ts`, so no cycle is created — and one is **removed**: `AnimalAgent.ts`
imports `TRAP_DEFS`/`isSpeciesTrappable` from `world/animalTraps.ts` (`:46`) while `animalTraps.ts`
imports `AnimalKind` back. Retargeting `animalTraps.ts` to `animalDefs.ts` breaks that cycle.

### E3 — `src/fauna/animalCorpse.ts` (new)

Owns the corpse state machine (P4): decay-phase advance and its presentation transitions, rot FX
lifecycle, rot stamina influence, rabies corpse exposure, harvested/natural remains spawn with their
token guards, `hideLivingVisual`, blood splat, bury/harvest/hold/release, linger, and the food-claim
state (`foodClaimedBy`/`foodConsumedPhase`).

It must **not** become a second entity. Proposed shape — plain state plus free functions over an
explicit host, mirroring how `AnimalLife.ts` owns `AnimalLifeState` without owning the animal:

```ts
export type AnimalCorpseState = {
  timeSinceDeath: number
  phase: CorpsePhase
  buried: boolean
  meatHarvested: boolean
  held: boolean
  rabid: boolean
  claimedBy: unknown | null
  consumedPhase: CorpsePhase | null
  exposedAnimalIds: Set<string>
  // presentation handles + async tokens
  bloodSplat: THREE.Object3D | null; bloodSplatToken: number
  harvestedRemains: THREE.Object3D | null; harvestedRemainsToken: number
  naturalRemains: THREE.Object3D | null; naturalRemainsToken: number
  rotFx: THREE.Object3D | null
}

export type CorpseHost = {
  mesh: THREE.Object3D
  modelHeight: number
  scale: number
  isCapsule: boolean
  sampleHeight: HeightSampler
}

export function createAnimalCorpseState(): AnimalCorpseState
export function advanceAnimalCorpse(
  state: AnimalCorpseState, host: CorpseHost, dt: number,
  nearby: readonly CorpseNeighbour[], observerPos: THREE.Vector3,
): void
export function buryCorpse(state, host): void
export function harvestCorpseMeat(state, host): void
export function canHarvestCorpseMeat(state): boolean
export function corpseReadyToRemove(state): boolean
export function claimCorpseAsFood(state, by: unknown): boolean
export function releaseCorpseClaim(state, by: unknown): void
export function markCorpseFoodConsumed(state, phase: CorpsePhase): void
export function disposeAnimalCorpse(state): void
```

`AnimalAgent` keeps `collapse()`, `readyToRemove()`, `corpsePhase()`, `bury()`, `harvestMeat()`,
`canHarvestMeat()`, `holdCorpse()`, `releaseCorpseHold()`, `claimAsFood()`, `releaseFoodClaim()` and
`markFoodConsumed()` as **thin delegates**, so the cross-agent call shape used by `findCarcassTarget`
(`:4336`) and `isSourceTargetValid` (`:4130`) does not change at all. `health.dead` stays authoritative
on the agent. `snapshot`/`hydrate` stay on the agent and read/write `AnimalCorpseState` fields.

~250 lines moved + 12 fields collapsed to one.

### E4 — `src/fauna/animalForaging.ts` (new)

Owns source selection, validation and relief (P5). Move `SourceTarget`/`SourceTargetKind`,
`findTroughTarget`, `findWaterTarget`, `findForageTarget`, `findCarcassTarget`, `findDietTarget`,
`findGrassPatchTarget`, `isSourceTargetValid`, the consumption switch, `forageEdgeScore`,
`isCarcassEdible`, `carcassFoodValue`, `carcassCandidateScore`, `selectDietFeedKind`, and the 13
constants (`FOOD_SEARCH_*`, `WATER_SEARCH_*`, `*_INTERACTION_RANGE`, `EAT`/`DRINK_DURATION_SEC`,
`SOURCE_SEARCH_COOLDOWN_SEC`, `SOURCE_TARGET_TIMEOUT_SEC`, `SCAVENGE_*_HUNGER_THRESHOLD`,
`CARCASS_VALUE_WEIGHT`, `TROUGH_DRINK_AMOUNT`).

```ts
export type ForagingContext = {
  x: number; z: number
  home: { readonly x: number, readonly z: number }
  def: AnimalDef
  life: AnimalLifeState
  household: Household | null | undefined
  nowDays: number
  grassForage: GrassForageService | undefined
  sampleHeight: HeightSampler
  waterLevel: number
  sampleForestFactor?: (x: number, z: number) => number
  roamRadius: number
  isWalkable: (x: number, z: number) => boolean
  isNearVillage: (pos: { x: number, z: number }) => boolean
}

/** Structural view of another agent's corpse — production passes the real
 *  `AnimalAgent[]` with no allocation, tests pass plain objects. Same
 *  technique `pickRabidTarget` (`AnimalAgent.ts:1479`) already uses. */
export type CarcassCandidate = {
  readonly mesh: { readonly position: { x: number, z: number } }
  isDead(): boolean
  corpsePhase(): CorpsePhase
  readyToRemove(): boolean
  claimAsFood(by: unknown): boolean
  // …plus the read-only claim/consumed/harvested view
}

export function findWaterTarget(ctx: ForagingContext): SourceTarget | null
export function findFoodTarget<T extends CarcassCandidate>(ctx: ForagingContext, eater: unknown, others: readonly T[]): SourceTarget | null
export function isSourceTargetValid(ctx: ForagingContext, eater: unknown, target: SourceTarget): boolean
/** The five-arm "revalidate at completion or grant no relief" switch. */
export function applySourceRelief(ctx: ForagingContext, target: SourceTarget): void
```

`AnimalAgent` keeps `pursueNeeds` (`:4047`), `pursueSourceTarget` (`:4167`) and `cancelSourceTarget`
(`:4158`) — they drive `setIntent`/`steerToward` and own the `sourceTarget`/`actionTimer`/
`sourceTargetElapsed`/`sourceSearchCooldown` fields — and calls the module for selection, validation
and relief. ~280 lines moved, ~45 kept.

### E5 — `src/fauna/animalRoaming.ts` (new, small)

Owns the trip state machine and the shared radial probe (P11):

```ts
export type AnimalTrip = { kind: 'water', destination: THREE.Vector3, phase: AnimalTripPhase, stayRemainingSec: number }
export function tripDayBucket(animalId: string, worldDays: number, cooldownDays: number): number  // moved
export function startWaterTrip(animalId, nowDays, home, config, probe): AnimalTrip | null

/** The one loop `findWaterTarget`/`findForageTarget`/`findWaterTripDestination`
 *  are three copies of — random angle+distance around `center`, `accept` gate,
 *  `score` metric, best wins. */
export function probeBestPointNear(
  center: { x: number, z: number }, radius: number, attempts: number,
  accept: (x: number, z: number) => boolean,
  score: (x: number, z: number) => number,
  random?: () => number,
): { x: number, z: number } | null
```

`wander()`, `continueTrip()`'s steering, `pickWanderTarget()` and `pickFollowTarget()` stay in the agent
— they read `target`/`wanderTimer`/`currentOthers`/`motherId`/`herdId`, which is genuinely agent state.
~90 lines moved, three duplicate loops collapsed to one.

### E6 — Adopt the two existing presentation owners (P2)

**No new module.** `ui/agentStatusLabel.ts`'s `createAgentStatusLabelController` and
`shared/agentAnimationSet.ts`'s `createAgentAnimationSet`, both already in `main` and both already used
by `NpcAgent`. Requires one prerequisite change to `agentAnimationSet.resolve()` — see R1.

`AnimalAgent` drops 13 label fields → 1, and 9 animation fields → 1. The duplicated 22-line bar block
disappears from both `update()` and `driveMounted()` at the same time as E9 unifies them.

### E9 — Unify the tick tail (D2)

One private method, called by both `update()` and `driveMounted()`:

```ts
/** The per-tick tail every movement mode shares — position snap, animation,
 *  water traversal, drowning, needs, label. `hungerThirstRate` is the one
 *  genuine caller difference (night slowdown does not apply while sprinting). */
private tickPresentationAndLife(dt: number, observerPos: THREE.Vector3, hungerThirstRate: number): void
```

`driveMounted` gains the timer decrements and `tickMaturity`/`tickProduction`; `clampBounds` stays out
of the shared helper (it is the one documented, intentional difference).

### E8 — Give `dogGuard.ts` / `preyAlertPerception.ts` their constants back (P8)

Move `DOG_GUARD_OWN_RADIUS`, `DOG_GUARD_ASSIST_RADIUS`, `DOG_BARK_HOWL_RADIUS`,
`DOG_BARK_STRANGER_RADIUS`, `DOG_BARK_COOLDOWN_SEC`, `DOG_PEST_RADIUS` into `dogGuard.ts`, and
`PREY_ALERT_RANGE_BONUS` into `preyAlertPerception.ts`. They are already passed into those modules'
pure functions as arguments; this only moves the numbers next to the rules that consume them.

---

## 6. Existing modules to reuse (do not invent alternatives)

| Need | Existing owner | Note |
|---|---|---|
| Behaviour arbitration / priority table | `fauna/faunaDecision.ts` | already correct and tested — **do not touch**; it is the model the NpcAgent review told NPC to copy |
| Hunger/thirst/stamina state + tick | `fauna/AnimalLife.ts` | `tickAnimalLife`, `consumeFood`, `drinkWater`, `AnimalMetabolismConfig` |
| Predator↔human/NPC intent scoring | `fauna/predatorHumanDecision.ts` | keep; agent owns only the throttle cache |
| Player perception / stealth | `fauna/playerAwareness.ts` | `isPlayerNoticed`, `detectionRoll`, `sneakDetectionMultiplier` |
| Prey threat-alert perception | `fauna/preyAlertPerception.ts` | **give it `PREY_ALERT_RANGE_BONUS`**; fix P6's allocation at the call site |
| Dog guard / bark / pest scoring | `fauna/dogGuard.ts` | **give it its 6 constants**; fix P6's allocations |
| Water traversal classification | `fauna/waterTraversal.ts` | `classifyWaterTraversal`, `swimStaminaExertion`, `shouldApplyDrowningDamage` |
| Herd / mother / juvenile rules | `fauna/herdCohesion.ts` | `pickHerdLeader`, `HERD_SPECIES`, `JUVENILE_*` |
| Livestock production timing | `fauna/livestockProduction.ts` | day-anchored, lazy — **the pattern D3 should follow** |
| Fauna damage tables / HP | `fauna/faunaCombat.ts` | `damageFor`, `damageVsHuman`, `MAX_HP`, `createHealthState` |
| Corpse/remains meshes | `fauna/harvestedRemains.ts`, `fauna/corpseDecayFx.ts`, `fauna/bloodSplat.ts` | E3 sequences these; it must not re-implement them |
| Stuck detection ladder | `ai/npcMovementWatchdog.ts` | shared with `NpcAgent` — keep |
| Path search | `navigation/navigation.ts` + `navigationStats.ts` | keep |
| Slope + collision step | `terrain/slopeConstraint.ts` | shared with `NpcAgent` — keep |
| Local water sample | `terrain/waterSample.ts` (via `sampleLocalWater`) | the single physical answer; do not re-derive |
| Action/lifecycle contracts | `simulation/` | `PlannedAction`, `ActionLifecycle`, `adoptPlannedAction`, `ScoredAction` |
| **Label controller** | `ui/agentStatusLabel.ts` | **`createAgentStatusLabelController` (`:146`) — built for this class, JSDoc says so** |
| **Animation set** | `shared/agentAnimationSet.ts` | **`createAgentAnimationSet` (`:55`) — built for this class, module doc says so; needs the `Armature\|` fix first** |
| Deps-object precedent | `settlement/createSettlement.ts` (`CreateSettlementDeps`), `ai/NpcAgent.ts` (`NpcAgentDeps`) | **copy this exact shape for `AnimalAgentDeps`** |
| Grass forage | `world/createGrassForagePatches.ts` | atomic `consume()` first-wins — E4 composes it, never re-implements |
| Household stores | `settlement/household.ts` | `water`/`items` atomic `has`/`remove` |
| Trap lures | `world/animalTraps.ts` | `TRAP_DEFS`, `isSpeciesTrappable` — retarget its `AnimalKind` import to `animalDefs.ts` (breaks the cycle) |
| Agent CPU instrumentation | `perf/agentCpuDiag.ts` | already wraps the fauna pass — use it to measure P6 |
| jsdom test environment | `src/settlement/settlementSignposts.test.ts:1` | the `// @vitest-environment jsdom` precedent P10 needs |

---

## 7. Proposed structure after the refactor

```text
src/fauna/
  AnimalAgent.ts          4 865 → ~3 200
      decision dispatch + update() tick, setIntent/action lifecycle,
      perception adapters + throttle caches, target commitment,
      movement execution + nav rescue, combat entry seams, riding,
      needs pursuit driving, production, persistence, diagnostics, public API
  animalDefs.ts           NEW  ~660   species taxonomy + ANIMAL_DEFS + diets + labels
  animalCorpse.ts         NEW  ~330   corpse/remains/decay/rot/rabies-exposure/claims state machine
  animalCorpse.test.ts    NEW  ~140
  animalForaging.ts       NEW  ~380   source selection/validation/relief + carcass scoring
  animalForaging.test.ts  NEW  ~200
  animalRoaming.ts        NEW  ~150   trip state machine + shared radial probe
  animalRoaming.test.ts   NEW  ~100
  AnimalAgent.test.ts     NEW  ~120   first constructing test (capsule fallback + jsdom)
  faunaDecision.ts        unchanged
  dogGuard.ts             +30         its own 6 tuning constants
  preyAlertPerception.ts  +10         PREY_ALERT_RANGE_BONUS + allocation-free candidate iteration
  foodWaterTargeting.test.ts  retarget to animalForaging.ts
src/shared/
  agentAnimationSet.ts    +8          `Armature|Name` suffix match in resolve()
src/ui/
  agentStatusLabel.ts     unchanged   (the controller already exists)
src/world/
  animalTraps.ts          import AnimalKind from animalDefs.ts (breaks the cycle)
```

---

## 8. Implementation steps, in order

Each step is a separate commit. Steps 1, 2, 4–9 must be **observationally identical**; steps 3, 6b and
10 are the three intentional behaviour changes and each gets its own commit and tests.

**Step 1 — `animalDefs.ts` (mechanical, no risk, largest line reduction).**
Move `:757`–`:1002` and `:1088`–`:1416` (plus `SMALL_ROAMING_RANGE`/`LARGE_ROAMING_RANGE`/
`DEER_WATER_TRIP` from `:322`–`:334`) into `src/fauna/animalDefs.ts`. Re-export every moved symbol from
`AnimalAgent.ts` so all 49 importers are untouched. Retarget `world/animalTraps.ts`'s `AnimalKind`
import to the new module to break the existing cycle. Gate: `npx tsc --noEmit` + `pnpm run test`.
Expected: −640 lines, zero diff outside imports/re-exports.

**Step 2 — `AnimalAgentDeps` + `AnimalUpdateContext` (P3).**
Mirror `CreateSettlementDeps`/`NpcAgentDeps`. Constructor becomes `constructor(deps: AnimalAgentDeps)`;
`update()` becomes `update(ctx: AnimalUpdateContext)`. Update all 5 constructor call sites
(`livestock.ts:166`, `:517`, `:570`; `rats.ts:149`; `createFauna.ts:648`) and all 3 `update()` call
sites (`livestock.ts:659`, `rats.ts:232`, `createFauna.ts:953`); drop every `undefined` placeholder.
The compiler catches everything except same-typed adjacent fields — hand-check
`ownerHouseId`/`herdId`/`motherId`/`spawnPointId` and `nearbyNpcs`/`nearbySettlementNpcs` and
`nearbyPredators`/`nearbyRats` against the current argument order. Gate: `npx tsc --noEmit` +
`pnpm run build`. Tick `docs/plans/LOOSE-ENDS.md:30`.
**This step is what unblocks P10** — everything after it can be tested.

**Step 3 — unify the tick tail + fix D2 (intentional behaviour change).**
Add `tickPresentationAndLife(dt, observerPos, hungerThirstRate)` (E9). Call it from `update()`
(`:3189`-ish) and `driveMounted()` (`:2142`-ish). Move the eight timer decrements (`:2915`–`:2922`) and
`tickMaturity`/`tickProduction` into it. Thread the night rate: `driveMounted` needs `dayFactor` (or a
resolved `isNight`) from the riding call site, since `this.isNight` is stale while mounted.
**Effects, all deliberate:** a ridden animal at night now gets the same 0.5 hunger/thirst rate as a free
one; `hurtAnimTimer`/`attackCooldown`/etc. now decrement while mounted, so a damaged mount's animation
recovers; the label's distance state now updates while ridden. Keep `clampBounds` out of the shared
helper. Diff must be reviewed line by line against both current tails.

**Step 4 — presentation (P2/E6).**
- **4a:** extend `agentAnimationSet.resolve()` (`agentAnimationSet.ts:74`) to also accept
  `c.name.endsWith('|' + name)` (case-insensitive), matching `AnimalAgent.findAction()`'s existing rule
  (`:4819`). Add a case to `agentAnimationSet.test.ts` asserting `Armature|Walk` resolves for `'Walk'`.
  **This is a prerequisite, not an optional polish** — see R1.
- **4b:** adopt `createAgentAnimationSet<'idle'|'walk'|'gallop'|'attack'|'hurt'|'death'>` in
  `AnimalAgent`. Delete `findAction`/`playAction`/`playOneShotAnim` and the 9 fields; `updateAnim`
  becomes three `anim.play(...)` calls. `hydrate()`'s dead branch uses `settleAtEnd('death')` where a
  death clip exists. `deathAnimDurationSec`/`attackAnimTimer`/`hurtAnimTimer` stay on the agent (they
  gate simulation, not presentation).
- **4c:** adopt `createAgentStatusLabelController('…', ['hp','stamina','satiety','hydration'],
  labelHeight())`. Satiety/hydration pass `{ current: 1 - hunger, max: 1 }`. `markDangerous`/
  `setHighlighted`/`harvestMeat` reach `controller.el`; `tickMaturity` reaches `controller.label`;
  `collapse`/`hydrate` use `settleAtZeroHp()`. Note the controller seeds every bar at 100 %, so
  satiety/hydration are correct from the first `sync()` rather than from construction — a one-frame
  cosmetic difference.

  Tick `docs/plans/LOOSE-ENDS.md:23` (partially — `PlayerController` remains).

**Step 5 — `animalCorpse.ts` (E3/P4).**
Move `:2497`–`:2756` plus `claimAsFood`/`releaseFoodClaim`/`markFoodConsumed` and the 10 constants
(`:161`–`:198`). `AnimalAgent` keeps every public method as a thin delegate. `snapshot`/`hydrate` read
and write `AnimalCorpseState` fields. New `animalCorpse.test.ts`: phase transitions across the two
thresholds, harvest gated to `fresh`, bury stops decay and never later produces bones, rot influence
only within radius and only while `rotting`, rabies exposure rolls at most once per pair, claim/release/
consumed-phase semantics, and that a `bones` transition hides the living visual exactly once.

**Step 6 — `animalForaging.ts` (E4/P5), then fix D1.**
- **6a (no behaviour change):** move `:4047`'s selection/validation/relief bodies and the 13 constants.
  `AnimalAgent` keeps `pursueNeeds`/`pursueSourceTarget`/`cancelSourceTarget`. Retarget
  `foodWaterTargeting.test.ts` to the new module and extend it: trough preferred over shoreline; a
  drained trough grants no relief; feed item re-checked by the exact selected kind; a lost grass-patch
  race grants no relief; a corpse that decays past what the eater can use is rejected at completion; a
  non-scavenger never selects `rotting`/`bones`; a scavenger below the hunger threshold doesn't either.
- **6b (intentional behaviour change, own commit):** call `cancelSourceTarget()` from `collapse()`
  (`:2621`) and `dispose()` (`:2031`) so a dying/disposed predator releases the carcass claim it holds.
  Regression test: predator A claims corpse C, A dies, predator B can now select C.

**Step 7 — `animalRoaming.ts` (E5/P11).**
Move `AnimalTrip`, `tripDayBucket`, `maybeStartWaterTrip`'s commitment logic and
`findWaterTripDestination`. Introduce `probeBestPointNear` and rewrite `findWaterTarget`,
`findForageTarget` and the trip destination search on top of it — **verify each keeps its own accept
predicate and scoring metric byte-for-byte** (`hits * 10 - d` for water/trip, `suitability * 10 - d` for
forage). Retarget `animalRoamingTrips.test.ts`; add probe tests with an injected `random`.

**Step 8 — `update()` switch cleanup (P1).**
One `private resetHumanThreatState(): void` covering the four-field reset, called from all six sites.
One `logNpcThreatBranch(branch, animalId, kind, frenzied, threat, playerActive)` helper in `debug/`,
replacing the four inline `console.log` blocks — **and fixing the duplicated-id defect** (`homeId` in
the second slot). Make `cancelSourceTarget()` explicit and uniform per branch, keeping
`npc-attack-frenzied`'s deliberate omission with its existing comment intact and adding one to
`frenzy-beeline`.

**Step 9 — constants to their owners (P8/E8).**
Move the six dog constants into `dogGuard.ts` and `PREY_ALERT_RANGE_BONUS` into
`preyAlertPerception.ts`. While there, remove P6's per-tick allocations at the four call sites
(`resolveAlertThreat` `:3855`, `resolveGuardTarget` `:3930`, `updateDogVocalization` `:3990`,
`pursuePest` `:3814`) by making the pure functions accept an index-and-accessor pair or a reusable
scratch buffer — **the shape to copy is `resolveLureTarget` (`:1014`), which is already documented as
allocation-free.** Measure before/after with `perf/agentCpuDiag`.

**Step 10 — `resolveTimeSkip` maturity (D3, intentional behaviour change).**
Advance `age` by `elapsedSeconds` and apply the same `lifeStage` transition `tickMaturity` does.
Simplest correct form: extract the body of `tickMaturity` (`:2008`) into `advanceAge(seconds)` and call
it from both. Test: an 8 h skip matures a juvenile past `JUVENILE_MATURITY_SECONDS`, restores adult
mesh/label scale and drops `motherId`.

**Step 11 — documentation.**
Update `docs/state/fauna.md` (new module boundaries; correct the "traversability can never diverge"
sentence so it stays scoped to `isWalkable`; add the fauna-011 dog description that
`LOOSE-ENDS.md:21` says is missing), add manual routing rows to `docs/CODE_INDEX.md`, run
`pnpm docs:sync`, tick `LOOSE-ENDS.md:23` and `:30`, add P9's two persisted-randomness notes, and
update `docs/plans/fauna-017-animal-agent-refactor.md` from `draft` with the accepted scope and the
`L` effort.

---

## 9. Files to create / modify

### Create

| File | Lines (est.) | Step |
|---|---|---|
| `src/fauna/animalDefs.ts` | ~660 | 1 |
| `src/fauna/animalCorpse.ts` | ~330 | 5 |
| `src/fauna/animalCorpse.test.ts` | ~140 | 5 |
| `src/fauna/animalForaging.ts` | ~380 | 6a |
| `src/fauna/animalForaging.test.ts` | ~200 | 6a |
| `src/fauna/animalRoaming.ts` | ~150 | 7 |
| `src/fauna/animalRoaming.test.ts` | ~100 | 7 |
| `src/fauna/AnimalAgent.test.ts` | ~120 | 3 (created), extended 6b/10 |

### Modify

| File | Change | Step |
|---|---|---|
| `src/fauna/AnimalAgent.ts` | −~1 650 lines; 91 → ~62 fields; 19+21 positional params → 2 objects | 1–10 |
| `src/settlement/livestock.ts` | 3 constructor + 1 `update()` call site → named objects | 2 |
| `src/settlement/rats.ts` | 1 constructor + 1 `update()` call site → named objects | 2 |
| `src/fauna/createFauna.ts` | 1 constructor + 1 `update()` call site → named objects | 2 |
| `src/shared/agentAnimationSet.ts` | `Armature\|Name` suffix match in `resolve()` | 4a |
| `src/shared/agentAnimationSet.test.ts` | + suffix-match case | 4a |
| `src/fauna/dogGuard.ts` | + 6 tuning constants; allocation-free candidate API | 9 |
| `src/fauna/preyAlertPerception.ts` | + `PREY_ALERT_RANGE_BONUS`; allocation-free candidate API | 9 |
| `src/world/animalTraps.ts` | import `AnimalKind` from `animalDefs.ts` (breaks the cycle) | 1 |
| `src/fauna/foodWaterTargeting.test.ts` | retarget to `animalForaging.ts`, extend | 6a |
| `src/fauna/animalRoamingTrips.test.ts` | retarget to `animalRoaming.ts` / `animalDefs.ts` | 7 |
| `src/fauna/corpseDecay.test.ts` | retarget to `animalCorpse.ts` | 5 |
| `src/debug/faunaInspector.ts` | new `logNpcThreatBranch` helper home | 8 |
| `docs/state/fauna.md` | module boundaries; scope the traversal sentence; fauna-011 dog gap | 11 |
| `docs/CODE_INDEX.md` | manual routing rows, then `pnpm docs:sync` | 11 |
| `docs/plans/LOOSE-ENDS.md` | tick `:23` (partial) and `:30`; add P9's two notes | 11 |
| `docs/plans/fauna-017-animal-agent-refactor.md` | `draft` → concrete plan; effort `M` → `L` | 11 |

### Do not touch

`src/fauna/faunaDecision.ts`, `AnimalLife.ts`, `faunaCombat.ts`, `waterTraversal.ts`,
`predatorHumanDecision.ts`, `playerAwareness.ts`, `herdCohesion.ts`, `livestockProduction.ts`,
`harvestedRemains.ts`, `corpseDecayFx.ts`, `bloodSplat.ts`, `huntingHooks.ts`, `AnimalSpawner.ts`,
`animalHarvest.ts`, `animalMeat.ts`, `animalDialogue.ts`, `animalDebugVisual.ts`,
`ai/npcMovementWatchdog.ts`, `navigation/*`, `terrain/slopeConstraint.ts`, `simulation/*`,
`ui/agentStatusLabel.ts` — all already correct owners.

---

## 10. Risks and mitigations

**R1 — Step 4b silently breaks cow and sheep animation.**
`createAgentAnimationSet.resolve()` matches clip names exactly (`agentAnimationSet.ts:74`);
`AnimalAgent.findAction()` also accepts `Armature|Walk`, which the Farm Animals cow/sheep packs export
(`:4817`–`:4818`). Adopting the shared set without step 4a means those clips resolve to `null` — and
`null` is a **silent, documented no-op** in this class (`:1581`–`:1583`), so nothing throws and nothing
logs. Mitigations: (a) land 4a first, with a test; (b) before 4b, enumerate which packs export prefixed
names (grep the GLB inventory via `assets/assetIndex.ts`) and list them in the commit message;
(c) browser check §11.7 must specifically watch a cow and a sheep walk.

**R2 — Step 3 changes mounted behaviour on purpose.**
Two user-visible effects (night metabolism, animation recovery after damage) in one commit.
Mitigation: own commit, both current tails quoted in the message, plus browser check §11.5 riding at
night and checking the mount's hunger/hydration bars against a stabled animal of the same species.

**R3 — Step 2's positional → named conversion is wide and semantically empty.**
The compiler catches every real mistake **except** two same-typed fields swapped. Mitigation: land it as
its own commit gated on `npx tsc --noEmit` + `pnpm run build`, and hand-check the two groups named in
step 2 against each of the eight current call sites. Do the conversion mechanically — do not reorder,
rename or default anything while moving.

**R4 — Step 6a must move the revalidation contracts verbatim.**
All five arms of `performSourceAction` grant relief **only** after a successful atomic operation
(`household.water.remove`, live `carcassFoodValue` re-read, `household.items.remove` of the exact
selected kind, `grassForage.consume`). Getting any of them wrong produces free food/water that no test
currently catches. Mitigation: move each arm as a unit, and write the "raced source grants no relief"
test for each of the four before touching the call site.

**R5 — Import cycles.**
`animalDefs.ts` must never import `AnimalAgent.ts`. `animalCorpse.ts` and `animalForaging.ts` need an
`AnimalAgent` reference for the carcass path — use a **structural interface** (`CarcassCandidate`), the
exact technique `pickRabidTarget` (`:1479`) and `resolveDogGuardTarget` already use, never a value
import. Step 1 exists partly to make this easy to get right, and it removes the one cycle that exists
today (`AnimalAgent.ts` ↔ `world/animalTraps.ts`).

**R6 — Persistence.**
`AnimalSaveState` (`:533`) is unchanged by every step. **No `CURRENT_SAVE_VERSION` bump, no migration.**
`snapshot`/`hydrate` stay on `AnimalAgent` even after E3 — if a step appears to need a version bump, it
has gone out of scope. Note step 5 must keep `hydrate()`'s dead-corpse presentation path intact,
including the `meatHarvested` branch that hides the living visual and spawns remains synchronously.

**R7 — Performance regressions while moving code.**
P6 is a request to *remove* allocations; do not accidentally add more. Specifically: do not replace a
`for` loop with `.map()`/`.filter()` while moving it; do not turn `ForagingContext`/`CorpseHost` into a
per-tick object literal — build them once per agent and mutate the two or three fields that change, or
pass primitives. Mitigation: capture a `perf/agentCpuDiag` snapshot before step 5 and after step 9,
with the same seed and a comparable animal count.

**R8 — `dispose()` ordering.**
After steps 4c and 5, `dispose()` must still: invalidate all three async remains/splat tokens, dispose
rot FX, dispose the label controller, stop the animation set, and dispose the debug visual — and after
6b it must also release the food claim. The token-invalidate-before-await contract
(`spawnHarvestedRemains` `:2546`, `spawnNaturalRemains` `:2691`, `spawnDeathSplat` `:2639`) is what
prevents a stale clone being parented onto a disposed mesh; it must survive the move to `animalCorpse.ts`
unchanged.

**R9 — Step 8 touches the decision switch.**
The four-field reset is currently present in six branches and absent from seven. Mitigation: before
extracting `resetHumanThreatState()`, write out which branches call it today and assert the post-refactor
call set is identical — do **not** "helpfully" add it to a branch that lacks it. Same for
`cancelSourceTarget()`: the current asymmetry is deliberate and documented at `:3073`.

---

## 11. Verification plan

### Automated (required after every step)

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run test
pnpm run build          # steps 2, 3 and 4 only — the ones that touch Three.js/DOM wiring
```

Targeted suites: `src/fauna/*.test.ts`, `src/shared/agentAnimationSet.test.ts`,
`src/settlement/livestock.test.ts`, `src/debug/*.test.ts`, `src/persistence/*.test.ts`.

### New coverage this refactor must add

| Module | Must assert |
|---|---|
| `AnimalAgent.test.ts` (jsdom) | constructs via the capsule fallback with `AnimalAgentDeps`; `update()` with a minimal `AnimalUpdateContext` advances needs and does not throw; a mounted tick and a free tick apply the **same** night hunger rate (D2); `resolveTimeSkip(8h)` matures a juvenile (D3) |
| `animalCorpse.test.ts` | phase transitions at both thresholds; harvest gated to `fresh`; bury stops decay permanently; rot influence bounded by radius and phase; rabies exposure rolls at most once per pair; claim → consume → re-claimable-after-decay; `bones` hides the living visual exactly once |
| `animalForaging.test.ts` | trough preferred over shoreline; drained trough grants no relief; feed item removed by the exact selected kind; lost grass-patch race grants no relief; corpse decayed past the eater's tier rejected at completion; non-scavenger never selects `rotting`/`bones`; scavenger below the hunger threshold doesn't either; **a corpse claimed by a dead predator is selectable again (D1)** |
| `animalRoaming.test.ts` | `probeBestPointNear` respects `accept` and picks the best `score` with an injected `random`; each of the three former loops keeps its own metric; trip phases travel → stay → return → cleared |
| `agentAnimationSet.test.ts` | `Armature\|Walk` resolves for the name `'Walk'` (R1); exact match still wins over a suffix match |
| `dogGuard.test.ts` / `preyAlertPerception.test.ts` | unchanged behaviour after the allocation-free candidate API change |

### Browser / manual (required — none of the above proves in-game correctness)

Run with `?debug=1`; use `debug/faunaInspector.ts`'s wolf selection and `getDebugInfo()`.

1. **Species data intact (step 1).** Spawn near a settlement: every kind still has its own model,
   scale, label, speeds and roaming band; wolves detect at their old range; deer/stag still take water
   trips. Any missing species or wrong label means the `ANIMAL_DEFS` move dropped something.
2. **Nothing changed at the call sites (step 2).** Wild fauna, settlement livestock and rats all still
   spawn, tick and despawn; a dog still guards, barks and chases rats; a chicken still lays; a cow can
   still be milked. This is the step most likely to have silently swapped two arguments.
3. **Predator/prey loop (steps 5–8).** Watch a wolf hunt: chase → bite → kill → eat the fresh corpse →
   corpse rots → bones → disappears. Confirm a second wolf can eat the same corpse after the first
   finishes, and that a hungry wolf falls back onto a `rotting` corpse only past its threshold.
4. **D1 fix (step 6b).** Let a wolf claim a fresh carcass, then kill that wolf before it finishes
   eating. Confirm a second wolf targets the same carcass. Before the fix it will not, for ~60 s.
5. **D2 fix (step 3).** Ride a horse from dusk through the night. Compare its satiety/hydration bars
   against a stabled horse of the same species — they should now drain at the same rate. Then hit the
   mount while riding and confirm its walk/gallop animation resumes rather than freezing.
6. **D3 fix (step 10).** Find a juvenile deer, note it, skip 8 h, confirm it is adult-sized and no
   longer follows its mother.
7. **Presentation (step 4).** Walk toward/away from a wolf, a cow and a sheep: name, HP/stamina/satiety/
   hydration bars, bar-hide distance and shadow-casting all behave as before. **Confirm cow and sheep
   still play their walk clip** (R1). Attack one: hurt clip plays, then death clip plays once and stays
   settled. A species with no death clip (sheep, chicken, bear) still tips over. Harvest a corpse: the
   label hides and remains appear.
8. **Needs pursuit (step 6a).** Livestock: confirm trough-before-shoreline, household-feed-before-grass;
   drain the trough mid-approach and confirm the animal replans instead of drinking for free. Wild prey:
   confirm forage and shoreline search still work away from any settlement.
9. **Roaming and trips (step 7).** Confirm rabbits/ducks stay tight to home, deer/stag range wide, and a
   deer completes a full water trip (travel → linger → return) without re-rolling its destination.
10. **Dogs (steps 8–9).** Confirm a dog still: guards its own household against a wolf at the wider
    radius, assists another household at the tighter one, barks once (not in a chorus) at a distant
    howl and at a stranger, and chases rats only when nothing else is happening.
11. **Persistence.** Save with livestock in mixed states (a dead unharvested corpse, a dead harvested
    one, a hungry cow, a chicken mid-cycle), reload, confirm every one restores identically. Also
    reload twice and confirm nothing else changed (P9's tip-side roll is the known cosmetic exception).
12. **Performance (step 9).** With `?debug=1`'s agent CPU panel, compare fauna agent update time and
    `nearest` scan counts against a pre-refactor capture on the same seed, with several dogs and a
    settlement's worth of livestock in view.

### Non-regression check

`git diff --stat` per step should show **only** the files listed in §9 for that step. Any unexpected
file means scope leaked.

---

## 12. Out of scope

- **Changing any animal behaviour** other than D1, D2 and D3. Search radii, thresholds, priorities,
  damage, cooldowns, roaming bands, trip policies, detection ranges and reaction chances must all come
  out numerically identical.
- **P9 — making movement search deterministic.** `docs/state/fauna.md` already states the current policy
  and why it holds. Changing it is a real behaviour change tied to the question of wild-fauna
  persistence (fauna-018). Record P9's two persisted-randomness sites in `LOOSE-ENDS.md` instead.
- **The two-tier behaviour asymmetry.** That hunger/thirst never contest the priority table and are
  resolved by hardcoded order inside the catch-all branches is a *design* property, documented as such
  in `docs/state/fauna.md`. E4 makes that order visible and testable; deciding whether it should become
  a scored candidate belongs to a `fauna-###` plan.
- **Splitting `AnimalAgent` into multiple classes** (`AnimalBrain`/`AnimalMovement`/…). Explicitly
  rejected — see §4.
- **The `resolveNpcTarget` village-exclusion-once-locked issue** (`LOOSE-ENDS.md:28`). A known, accepted
  behaviour question, not a refactor concern.
- **`PlayerController`'s adoption of `agentAnimationSet`/`agentStatusLabelController`.** Step 4 covers
  `AnimalAgent` only, so a presentation regression is attributable to one agent. `LOOSE-ENDS.md:23`
  stays open for the player.
- **Fauna's flat per-attacker-kind damage table** vs. the shared critical/defense pipeline. A documented
  asymmetry (`docs/state/fauna.md` Combat/Limitations); resolving it is a combat plan.
- **Where rats and livestock live.** They are `AnimalAgent` instances hosted in `src/settlement/` by
  convention; moving them is unrelated churn.
- **`AnimalSpawner` / `createFauna` internals**, wild-fauna persistence (fauna-018), and cave habitats
  (fauna-019).
- **Persistence format changes.** No `CURRENT_SAVE_VERSION` bump, no migration — see R6.

---

## Verdict

**REFACTOR** — but a different shape of refactor than `NpcAgent`'s. `AnimalAgent`'s *decision* layer is
already correct and should be left alone: `faunaDecision.ts` is the tested priority table the NpcAgent
review told NPC to copy, and nine more fauna modules are called as thin adapters exactly as intended.
There is no dead seam, no duplicated ordering, and 39 imports against `NpcAgent`'s 80.

What justifies the work is concrete and mostly mechanical: 31 % of the file is species data that belongs
in its own module and whose move also breaks an import cycle; the constructor and `update()` carry 19 and
21 positional parameters reached past runs of three and eight `undefined`, a shape that has already
caused one documented bug in the sibling class and that `LOOSE-ENDS.md` has been tracking since
2026-09-02; two shared presentation owners were built during the NpcAgent refactor *specifically for this
class*, name it in their own JSDoc, and are still not wired up; ~575 lines of corpse lifecycle and source
targeting have no owner and no test that can reach them; and three narrow defects are live — a dead
predator permanently locking a carcass, a ridden animal starving twice as fast at night with frozen
timers, and a time-skip that does not age juveniles.

None of this is a "the file is long" argument. Every extraction either removes a duplication, hands a
responsibility to an owner that already exists, or makes currently-unreachable logic testable — and the
class deliberately stays large at ~3 200 lines.

**Effort: L.** Eleven commits: 4 new source modules + 4 new test files, 16 modified files, ~1 650 lines
moved and ~250 rewritten, three deliberate behaviour changes (steps 3, 6b, 10) and one wide mechanical
change (step 2). Steps 1 and 2 are low-risk and unblock everything else — step 2 in particular makes the
class constructible in a test for the first time, which is what turns steps 5–7 from "moved and hoped"
into verified. Step 4 carries the one silent-failure risk in the whole plan (R1) and must not be started
before 4a lands.

> This is above the `M` currently recorded for `docs/plans/fauna-017-animal-agent-refactor.md`. If that
> plan must stay `M`, the defensible `M`-sized subset is **steps 1, 2, 3 and 4** (~700 lines moved, the
> deps objects, the tick-tail unification and the presentation adoption) — which delivers the two
> tracked `LOOSE-ENDS` items and fixes D2, and leaves steps 5–10 as a follow-up plan.
