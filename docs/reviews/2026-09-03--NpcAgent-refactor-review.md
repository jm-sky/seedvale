# NpcAgent Refactor Review

**Date:** 2026-09-03
**Status:** `done` (review only — no code changed)
**Scope:** `src/ai/NpcAgent.ts` (5 179 lines) and its direct ownership boundaries
**Excluded:** `AnimalAgent`, `createSettlement`/`SettlementsManager` internals, `props.ts`, the Vue/UI layer

> Naming note: the reviews index uses `YYYY-MM-DD--NNN--slug.md`. This file was created at the path
> the task explicitly requested (same as the `createSettlement` review); renumber to
> `2026-09-03--027--...` when the sequence matters.

---

## 1. Executive summary

`NpcAgent` **is the correct central coordination point for an NPC and must stay one**. Its FSM
(`Phase`), its `goTo → execute → next` action pipeline, its ownership of the Three.js projection, and
its role as the single place `choose()` decides "what now" are all sound, and every one of them is
load-bearing for the rest of the settlement layer. This review does **not** recommend splitting it
into `NpcBrain` / `NpcMovement` / `NpcCombat` classes.

What it *does* find is that the file has crossed the line from coordinating to implementing. Verified
measurements on the current `main`:

| Metric | Value |
|---|---|
| Lines | 5 179 (156 on 2026-08-07 → 5 179 on 2026-09-04; +32× in 4 weeks, 110 commits) |
| Instance fields | 93 |
| Distinct imported modules | 80 (257 lines of imports; 17 from `world/`, 9 `settlement/`, 9 `combat/`, 7 `items/`) |
| `this.startAction({…})` call sites | 31 |
| Direct `this.needs.X = Math.max(0, …)` mutations | 16 |
| Tests that construct an `NpcAgent` | **0** |

The last real extraction pass was plan 202 (2026-08-23, `agentStatusLabel.ts` / `slopeConstraint.ts` /
`npcVoiceLines.ts`). Everything since — plans 151, 152, 167, 174, 176, 177, 178, 179, ai-002/003/004,
settlements-npcs-001/002/003/005/008/009/014, npc-001/006/007/009/012/013/014/015 — added its
execution branch **inside** the class. The growth is not one bad decision; it is 25 individually
reasonable ones with no counter-pressure.

The five genuine architectural problems, in order of value:

1. **The strategy-selection seam is decorative.** `ai/npcStrategies.ts` (plan ai-003) computes an
   ordered candidate list and `selectStrategy()` picks a winner — and `beginNeed()` **throws the
   result away** (`NpcAgent.ts:3266`, `:3316`, `:3350`, `:3399` all discard the return value) and
   re-implements the same priority order as a hand-maintained `if (…) return` chain. Two copies of
   one ordering, kept in sync by hand, one of which is what actually runs.
2. **Profession economics live in the agent.** Eight `begin*Work()` methods (~330 lines + ~55 lines of
   constants) implement farming, fishing, patrolling, trading, smithing, mining, arrow crafting and
   cross-household collection, dispatched by a 7-line `if (this.role === 'x' && …)` ladder
   (`:4331`–`:4337`). These are settlement-economy operations wearing an NPC method signature. The
   repo already believes this module should exist: **`src/ai/npcProfessionWork.test.ts` exists but
   `src/ai/npcProfessionWork.ts` does not** — the test currently imports its subject from `NpcAgent`.
3. **Six divergent copies of "cancel the in-flight action".** `beginCombat` (`:1934`),
   `fleeFromThreat` (`:2238`), `beginCollapseSleep` (`:3105`), `die` (`:2305`),
   `interruptCurrentAction` (`:4967`), `abandonStuckAction` (`:5101`) each reset the same 8–10 fields
   with different subsets. **This has already produced a live defect** — see D1: an NPC pulled out of
   a conversation by an animal threat is permanently removed from the social system for the rest of
   the session.
4. **A 30-parameter positional constructor, written three times** (`:1253` constructor, `:1411`
   `create`, `:1523` `createCapsuleFallback`) and called with 30 positional arguments — one of them a
   bare `undefined` placeholder — from `createSettlement.ts:592`. The `CreateSettlementDeps` fix from
   the 2026-09-03 `createSettlement` review is already in the repo; this is the same defect, one layer
   down, and it is untouched.
5. **Presentation is interleaved with simulation.** Animation clip management (a hard-coded 7-element
   action array repeated in three places), CSS2D label + three bars + debug line + need-marker material
   writes account for ~220 lines and 25 fields inside the class that owns deterministic simulation.

Everything above is fixable **without changing NPC behaviour**, except D1/D2, which are bug fixes this
review recommends landing deliberately and with tests.

Recommendation: **REFACTOR**, in two phases. Phase 1 (steps 1–10) moves ~1 250 lines into six
modules — four of which are *existing owners being given back their responsibility* — and fixes two
defects. Phase 2 (step 11, optional, gated on browser verification of npc-009/npc-015) moves the
combat tick into the existing `ai/npcCombat.ts`. Target size after Phase 1 ≈ 3 900 lines; after both
≈ 3 500. **That is the intended end state** — `NpcAgent` genuinely coordinates needs, schedule,
movement, combat, social, contracts and presentation for one entity, and shrinking it below that
would mean inventing the parallel systems this repo's rules forbid.

---

## 2. Map of current responsibilities

Line ranges are anchored on the current `main` (`4cb78bb`).

### 2.1 Module scope (lines 1–882)

| # | Lines | Responsibility | Verdict |
|---|-------|----------------|---------|
| 1 | 1–257 | 80 imports across 17 domains | symptom, not a concern |
| 2 | 259–314 | Movement/reaction tuning constants | stays |
| 3 | 316–345 | `NPC_MODEL_URLS`, `modelUrlFor` | presentation — could move, low value |
| 4 | 347–435 | `Phase`, `ActionId`, `NpcPlannedAction`, `CurrentActivity` | should move to `ai/npcAction.ts` |
| 5 | 436–566 | `NpcInspectionSnapshot`, `NpcWhy`, `promoteChainKind`, `classifyPendingActivity`, `projectNpcWhy` | already pure + tested — stays |
| 6 | 568–588 | Phase sets (`PAUSE_INTERRUPTIBLE`/`REST`/`WATCHDOG`) | stays |
| 7 | 589–732 | **~30 domain tuning constants** — satisfy amounts, search radii, per-profession caps, hunt/farm/trader/blacksmith/helper constants | ~55 lines belong with the profession/logistics modules |
| 8 | 733–793 | `depositWoodHarvest`, `depositFoodHarvest`, `depositCarriedItems`, `findWeaponNeedingMaintenance` | household/economy logistics — belongs elsewhere |
| 9 | 795–881 | Time-skip / fatigue / abandon / HP-slow constants, `applySociableBoost` | stays |

### 2.2 Class scope (lines 883–5179)

| # | Lines | Responsibility | Domain | Verdict |
|---|-------|----------------|--------|---------|
| 10 | 884–1252 | **93 field declarations** | mixed | shrinks with extractions |
| 11 | 1253–1597 | Constructor + `create` + `createCapsuleFallback` — 30 positional params × 3 | lifecycle | **P4 — deps object** |
| 12 | 1598–1813 | Public accessors, `createInspectionSnapshot`, `why`, `setFrozen`, `getCurrentActivity`, assistance | diagnostics/API | stays |
| 13 | 1814–1932 | `takeDamage`, `applyIncomingCombatDamage`, `canFightBack`, `combatDebugSnapshot` | combat | stays (thin, correct seam) |
| 14 | 1934–2303 | `beginCombat`, melee tick, ranged tick + projectile, `reactToAnimalThreat`, `fleeFromThreat`, `endCombat` | combat | **Phase 2 → `npcCombat.ts`** |
| 15 | 2305–2368 | `die` — contract release, conversation, queue, clips | lifecycle | stays (cleanup unified) |
| 16 | 2370–2824 | **`update()` — 455 lines**: needs tick, stamina/vigor, watchdog, critical interrupt, player-reaction roll, threat sensing, 11-case FSM switch, label/bar/marker/gaze/mixer sync | everything | core stays; ~150 lines leave |
| 17 | 2825–2894 | `resolveTimeSkip` | simulation | stays |
| 18 | 2903–3034 | `findAction`, `syncAnimation`, `playCombatOneShot`, `playCombatImpactSound`, `isBusyPhase`, `updateDebugLabel`, `crossfade` | presentation | **P5 — extract** |
| 19 | 3035–3258 | `startAction`, queue join/leave, `needPickOptions`, `buildDecisionContext`, `beginCollapseSleep`, `resolveWaterWellTarget`, 5 Plan methods, `selectAndTraceStrategy` | coordination | stays |
| 20 | 3259–3498 | **`beginNeed()` — 240 lines**, 4 need branches, each duplicating its strategy order | decision/execution | **P1 — dispatch on strategy** |
| 21 | 3499–3602 | `beginOreGathering`, 3 `compute*Available` helpers | profession/economy | **P2 / P3** |
| 22 | 3603–3765 | `beginEconomyWithdraw`, `beginHouseholdExchange`, `satisfyHouseholdResourceNeed` | logistics | **P3 — extract** |
| 23 | 3766–3840 | `computeDeliveryAvailable`, `beginPlayerStorageDelivery` | logistics | **P3** |
| 24 | 3841–3884 | `beginRealFoodGathering` | food | stays (thin) |
| 25 | 3885–3997 | Hunt expedition, kill loop, yield delivery, arrow crafting | profession | **P2** (partly) |
| 26 | 3998–4041 | `maybeMaintainNearbyGarden`, `maybeWaterNearbyGarden` — identical bodies bar one field | world/garden | dedupe in place |
| 27 | 4042–4296 | Farm / fishing / guard / trader / trader-collection / blacksmith work | profession | **P2 — extract** |
| 28 | 4297–4407 | `resolveIdleActivity`, `beginIdle` + role ladder | schedule | stays (dispatch shrinks) |
| 29 | 4408–4575 | Work-contract pursue/accept/drive + `runContractWorkBout` | contracts | drive stays; **P6 — well bout** |
| 30 | 4576–4602 | `beginSeekShelter` | weather | stays |
| 31 | 4603–4691 | `socialCandidate`, `beginConversation`, conversation release, `beginUnscheduledIdle` | social | stays |
| 32 | 4692–4793 | `wanderNear`, `playReactionSound`, `isWalkable`, `isWalkableExterior`, `applyRimDestination`, sleep destination | movement | **P7 — geometry out** |
| 33 | 4794–4919 | `resolveSteerTarget`, `healthSpeedMultiplier`, `steerTo`, `applySeparation`, `steerWithRescue`, `clearRepath` | movement | mostly stays; **P7** |
| 34 | 4921–5179 | Watchdog tick, critical interrupt, `interruptCurrentAction`, repath ladder, local escape, abandon, emergency teleport | resilience | stays; **P7** for the sampling loops |

**Summary:** 6 module-level concerns + 25 class-level concerns. Roughly 11 of the class-level ones are
not coordination — they are domain logic with their own tuning constants and no test coverage.

---

## 3. Concrete architectural problems

### D1 — Defect: an animal threat mid-conversation permanently removes an NPC from the social system (high)

`beginCombat()` (`:1934`) and `fleeFromThreat()` (`:2238`) both do `this.pendingAction = null`
**without** calling `releaseConversationIfAny()` (`:4670`), unlike `die()` (`:2305`),
`interruptCurrentAction()` (`:4967`) and `abandonStuckAction()` (`:5101`), which all do.

Failure trace (reachable today — plan fauna-006 lets a wolf enter a settlement, plan npc-013 puts
idle NPCs at a lit campfire at night):

1. A and B are in a `conversation` action (`beginConversation`, `:4624`); both have
   `conversationPartnerId` set.
2. A wolf is sensed. `update()`'s threat block (`:2500`-ish) calls `reactToAnimalThreat` →
   `beginCombat` (or `fleeFromThreat`).
3. A's `pendingAction` is nulled. `conversationPartnerId` and `onConversationEarlyExit` are **not**
   cleared, and can no longer be cleared: `releaseConversationIfAny()` early-returns on
   `pendingAction?.kind !== 'conversation'`, and B never calls `releaseConversationPartner()` on A
   (B's own action completes normally and only clears B's fields).
4. `socialCandidate()` (`:4603`) returns `null` forever on `if (this.conversationPartnerId != null)`.

A survives, but never converses again for the rest of the session. Over a long session with any
predator pressure, the settlement's social layer silently decays. `resolveTimeSkip` (`:2884`) already
clears these two fields explicitly — the author noticed the class of problem there and not here,
which is exactly what six hand-maintained copies of one cleanup produce.

### D2 — Defect: `fleeFromThreat` and `beginCollapseSleep` drop the active Plan without marking it interrupted (medium)

`markPlanInterrupted()` (`:3215`) is called by `beginCombat`, `interruptCurrentAction` and
`abandonStuckAction`, but not by `fleeFromThreat` (`:2238`) or `beginCollapseSleep` (`:3105`). Both
destroy the concrete action while leaving `npcState.activePlan.state === 'active'`. `?debug=1`'s
inspector then reports a Plan as actively executing when nothing is. `ensurePlanForNeed` still
resumes it correctly (`planIsResumable` only excludes terminal states), so this is a diagnostic-truth
bug, not a stuck NPC — but it is the same root cause as D1.

### P1 — The strategy layer is computed, traced, and then ignored (high)

`selectAndTraceStrategy()` (`:3232`) returns `NpcStrategyId | null`. Every call site discards it:

```ts
this.selectAndTraceStrategy('food', this.computeFoodStrategyCandidates(household))  // :3350
if (this.beginPlayerStorageDelivery(household)) return
if (household?.has('food', 1)) { … }
if (this.beginEconomyWithdraw(household, 'food')) return
if (this.beginHouseholdExchange(household, 'food')) return
if (this.role === 'hunter' && this.beginHuntExpedition(household)) return
if (this.beginRealFoodGathering(household)) return
/* abstract garden gather */
```

`getFoodStrategyCandidates()` (`npcStrategies.ts:78`) already encodes exactly that order. The two are
in sync **today** (verified branch by branch for `food`, `water`, `waterDuty`, `wood`) purely because
someone hand-updated both in every one of plans 167, 174, 178, ai-003 and settlements-npcs-005. The
return value is used for one thing only — deciding whether to `blockPlan()` when nothing is available.

Consequences: the "which strategy did this NPC pick" the inspector shows is a *prediction*, not the
truth (the candidate list is read-only and can be stale by the time the `begin*` call actually runs);
adding a strategy requires two edits in two files with no compiler help; and the tested module
(`npcStrategies.test.ts`, 240 lines) tests something that does not drive behaviour.

### P2 — Profession economics implemented inside the agent (high)

Eight methods, ~330 lines of body plus ~55 lines of constants (`FARM_WORK_RADIUS`,
`FARM_SEED_PRIORITY`, `FISH_YIELD_KINDS`, `TRADER_TRANSFER_KINDS`, `HOUSEHOLD_EXCHANGE_MAX_TRANSFER`,
`BLACKSMITH_SHARPEN_THRESHOLD`, `HUNTER_ARROW_STOCK_CAP`, `HUNT_*`, `ORE_SEARCH_RADIUS`):

| Method | Lines | What it actually is |
|---|---|---|
| `beginOreGathering` (`:3499`) | 49 | deposit-mining → settlement stock |
| `beginArrowCrafting` (`:3973`) | 25 | adapter over `commitHunterArrowProduction` |
| `beginFarmWork` (`:4042`) | 48 | crop harvest + seed-priority planting |
| `beginFishingWork` (`:4090`) | 39 | dock cast + `rollFishingCatch` + deposit |
| `beginGuardPatrol` (`:4129`) | 29 | 3-point patrol cursor |
| `beginTraderWork` (`:4158`) | 49 | household surplus → `SettlementEconomy` |
| `beginTraderCollection` (`:4207`) | 51 | cross-household pickup → settlement storage |
| `beginBlacksmithWork` (`:4258`) | 39 | whetstone + `sharpenWeapon` target selection |

Dispatched by `:4331`–`:4337`. Every one of them is a pure *decision + world-query* producing a
`NpcPlannedAction`; none needs the FSM, the mesh, the mixer or the watchdog. None is covered by a
test, because none can be reached without a real `NpcAgent`. The naming of the already-existing
`src/ai/npcProfessionWork.test.ts` (which imports `findWeaponNeedingMaintenance` from `NpcAgent`)
shows the intended module was recognised and never created.

### P3 — The claim → carry → deposit pattern is written five times (high)

`beginEconomyWithdraw` (`:3603`), `beginHouseholdExchange` (`:3673`), `beginPlayerStorageDelivery`
(`:3790`), `beginTraderWork` (`:4158`), `beginTraderCollection` (`:4207`) — plus `deliverHuntYieldHome`
(`:3952`) and `beginOreGathering`'s tail — all implement the same two-leg shape:

```
startAction({ kind: <pickup>, destination: <source>, durationSec: 1.2 × waitMultiplier,
              onComplete: claim into this.carried,
              next: { kind: 'deposit', destination: <dest>, durationSec: 0.8 × waitMultiplier,
                      onComplete: deliver from this.carried, relieve need } })
```

Two of them (`beginEconomyWithdraw`, `beginHouseholdExchange`) additionally duplicate the entire body
a second time internally, once for `food` (item claims via `carryFoodClaim`/`deliverCarriedFoodClaim`)
and once for `wood` (scalar claims via `claimEconomySurplus`/`claimHouseholdSurplus`) — so the shape
appears **seven** times in ~340 lines. The `1.2` / `0.8` durations and the "revalidate at completion"
contract are copied by hand each time.

The owners already exist: `economy/localExchange.ts` (atomic claims), `items/foodItems.ts`
(`claimFoodItems`/`carryFoodClaim`/`deliverCarriedFoodClaim`), `settlement/storageDestinations.ts`
(where does this kind go). What is missing is the one thing that ties them together — the two-leg
plan builder — and `NpcAgent` is where it ended up by default.

### P4 — 30-parameter positional constructor, written three times, called with an `undefined` placeholder (high)

`:1253` (30 params), `:1411` (`create`, 30 params, 8 with defaults *in the middle*), `:1523`
(`createCapsuleFallback`, 30 params) — every parameter list is repeated in full four times counting
the forwarding calls. `createSettlement.ts:592` passes 30 positional arguments including a literal
`undefined` for `modelUrl` just to reach `forest`.

Failure mode is silent: `foodSources`, `hunting`, `helperDelivery`, `householdExchange` are four
consecutive optional object parameters; `workContracts`, `playerWells`, `droppedItems` are three more.
Swapping any adjacent pair of same-shaped hooks compiles cleanly. Adding a hook is a five-place edit.

The repo already fixed this exact defect one level up: `CreateSettlementDeps`
(`createSettlement.ts:204`, consumed at `SettlementsManager.ts:318`). `NpcAgent` is the remaining
instance.

### P5 — Presentation interleaved with simulation (medium)

~220 lines and ~25 fields:

- **Animation:** `findAction` (`:2903`), `syncAnimation` (`:2914`), `playCombatOneShot` (`:2942`),
  `crossfade` (`:3014`), plus `die`'s manual clip settling (`:2330`-ish). The 7-element action array
  `[idleAction, walkAction, interactAction, attackMeleeAction, attackRangedAction, hurtAction,
  deathAction]` is written out **three times**; a future clip that misses one copy stacks weights
  silently. `AnimalAgent` (`:3768`, `:3784`, `:3799`) and `PlayerController` each hand-roll their own
  variant — three implementations, no owner.
- **Label:** 6 DOM fields, 4 `lastXPercent` fields, `LabelDistanceState`, and a ~45-line block at the
  end of `update()`. `ui/agentStatusLabel.ts` already owns the pieces but not the controller, so
  `AnimalAgent` duplicates the same wiring (`:1524`, `:2607`–`:2636`).
- **Need marker:** two `setHex` writes *per NPC per frame* (`:2790`-ish) with no change guard, unlike
  the label text right beside them which does have one. Each NPC also allocates its own
  `SphereGeometry(0.12, 8, 8)` in the constructor (`:1367`) — geometry is identical for every NPC and
  could be module-level; the material must stay per-NPC.

### P6 — NPC well construction re-implements the player's `workOnWell` (medium)

`runContractWorkBout` (`:4510`) rebuilds, by hand, the same sequence as
`app/actions/placementActions.ts:455`–`:498`:

```
activeWellStage → if (stage !== well.stage) → build MaterialRequirement[] from WELL_STAGE_COST
  (stone, branch) → hasMaterial(...CONSTRUCTION_MATERIAL_RADIUS...) → consumeMaterial(...)
  → transitionTo(stage) → addWork(WELL_WORK_SESSION_HOURS) → isWellCompleted
```

Two copies of a construction rule that lives in neither of them. The differences are legitimate (no
capability gate, no toast, no busy channel, no partial-credit) but they are *policy*, not a reason to
re-derive the requirement list. `world/playerWell.ts` is the owner.

**Constraint:** `playerWell.ts`, `createPlayerWells.ts` and `placementActions.ts` all have uncommitted
changes in the working tree right now (plan world-004, `world/wellGroundwater.ts` is untracked, and
`WELL_STAGE_COST`/`wellStageWorkHours` gain a `waterDepth` argument). **This step must be sequenced
last, after that work lands.** See §10 R4.

### P7 — Pure collider geometry inlined in the agent (medium)

`isWalkable` (`:4722`, the `NPC_COLLIDER_APPROACH_BUFFER`/`NPC_COLLIDER_CORE_FRACTION` penetration
rule), `resolveSteerTarget` (`:4794`, segment-vs-disk bypass), `attemptBlindRepath` (`:5055`) and
`attemptLocalEscape` (`:5077`) are ~100 lines of pure 2D geometry over `Collider[]`.
`ai/npcColliderRim.ts` already owns exactly this concern (`destinationOnColliderRim`,
`isExteriorPoint`, `localEscapeRadii`, `navigationApproachTarget`, `pickEmergencyTeleportPoint`) and is
tested. The four above are the ones that stayed behind.

### P8 — Need relief is implemented in the agent, not in `Needs.ts` (medium)

16 occurrences of `this.needs.<field> = Math.max(0, this.needs.<field> - <AMOUNT>)` across `beginNeed`,
`satisfyHouseholdResourceNeed`, `beginRealFoodGathering`, `onHuntKill`, `beginIdle` and
`resolveTimeSkip`. `Needs.ts` exports `tickNeeds` (increase) but nothing for decrease, so the
`NeedId → NeedState field` mapping is written out a **fourth** time in `needValueFor` (`:1698`), a
fifth in `buildDecisionContext` (`:3084`) and a sixth in `resolveTimeSkip` (`:2850`-ish). The four
`*_SATISFY_AMOUNT` constants (`:589`–`:592`) are NPC-domain need semantics sitting outside their
domain module.

### P9 — Two divergent copies of the decision precedence (medium)

`choose()` (`:2513`-ish) encodes: vigor collapse → need pressures + weather pressure via
`pickActionKind` → `seekShelter` / need / scheduled sleep / idle.
`tickCriticalInterrupt()` (`:4940`) encodes a second, *different* precedence for the same question:
vigor collapse → (only if `activeNeed === 'idle'`) critical need → severe weather.

They are deliberately different, and the difference is documented — but it lives only in a comment.
`fauna/faunaDecision.ts` (plan npc-008) solved exactly this for `AnimalAgent`: a pure, tested,
allocation-free priority table with a shared validity predicate feeding both the runtime path and the
debug path. NPC never received the analogous treatment, so the NPC's own top-level priority order is
the one thing in the decision stack (`Needs.ts` → `decisionModifiers.ts` → `weatherPressure.ts` →
`npcStrategies.ts` → `npcPlan.ts`, all pure and tested) that is neither pure nor tested.

### P10 — Uncontrolled randomness reaching persisted world state (medium — record, do not fix here)

11 `Math.random()` call sites. Two of them — `maybeMaintainNearbyGarden` (`:4006`) and
`maybeWaterNearbyGarden` (`:4024`) — gate a mutation of `PlayerGardenRecord.care`/`hydration`, which
**is** persisted in `SaveData`. `CLAUDE.md` explicitly lists "uncontrolled randomness" as a
determinism hazard, and the codebase has the seeded alternative everywhere else
(`rollFishingCatch(spotId, attempt)`, `rangedDeviationRoll(id, attempt)`, `cellSeed`).

This is a **behaviour change**, so it is not part of this refactor. Record it in
`docs/plans/LOOSE-ENDS.md` as a candidate `npc-###` plan. The remaining nine sites (reaction roll,
wander offsets, dock-path chance, voice pick, escape sampling) are presentation/local movement and are
lower stakes.

### P11 — Zero test coverage of the class (medium)

Four test files touch this file's exports (`npcCurrentActivity.test.ts`, `npcWhy.test.ts`,
`npcProfessionWork.test.ts`, and indirectly `npcStrategies.test.ts`), and **all** of them test the
handful of functions that were deliberately made pure and exported (`classifyPendingActivity`,
`promoteChainKind`, `projectNpcWhy`, `findWeaponNeedingMaintenance`). Nothing constructs an
`NpcAgent`: `create()` is `async` and loads a GLTF, so it cannot be reached under vitest without
mocking Three.js and the loader.

That means the escape hatch developers have actually used — "export the pure bit so it can be tested"
— is already the established pattern in this file. Every extraction below is a continuation of it, not
a new idea.

### P12 — Minor ownership smells (low)

- `treeIndex` (`:1097`) means two things: the NPC's index within the settlement (used for model pool
  and voice actor in the constructor) and a mutable "next tree to chop" cursor (`:3406`).
- `settledIdleActivity` (`:988`) and `shelterSettled` (`:1002`) are two parallel "already arrived, stop
  replanning" flags with the same purpose and different lifetimes.
- `maybeMaintainNearbyGarden` and `maybeWaterNearbyGarden` (`:3998`, `:4016`) have byte-identical
  bodies except `care`/`CARE_MAINTAINED_THRESHOLD` vs `hydration`/`HYDRATION_DROUGHT_THRESHOLD`.
- The well SFX/facing branches in `update()`'s `execute`/`goTo` cases hard-code `landmarks.well`
  (`:2600`-ish, `:2700`-ish), so a drink at a nearby *player-built* well (`resolveWaterWellTarget`,
  `:3127`) silently gets neither the facing rotation nor the draw sound.

---

## 4. What must stay in `NpcAgent`

Do not extract any of these. They are the coordination the class exists for.

1. **`Phase` FSM and `update()`'s switch.** One entity, one tick, one place that decides which
   sub-behaviour runs. Splitting it produces cross-object phase state — the exact failure the
   architecture rules forbid.
2. **`startAction` / `pendingAction` / `actionLifecycle` / queue membership** (`:3035`–`:3067`). The
   single point where a planned action becomes the active one.
3. **`choose()`'s call sequence** — pressures → modifiers → weather → arbitration → Plan → strategy →
   `beginNeed`/`beginIdle`. The *ordering table* becomes data (P9/step 9), the sequencing stays.
4. **Plan lifecycle plumbing** (`transitionPlan`, `ensurePlanForNeed`, `reevaluatePlanCompletion`,
   `progressActivePlan`, `markPlanInterrupted`, `:3141`–`:3231`). `npcPlan.ts` already owns the pure
   transitions; these five are the agent applying them to its own `npcState`.
5. **Movement execution** — `steerTo`, `steerWithRescue`, `applySeparation`, `healthSpeedMultiplier`,
   the repath state machine. Already delegates to `slopeConstraint.ts`, `navigation.ts`,
   `npcMovementWatchdog.ts`; only the pure geometry leaves (P7).
6. **Combat *entry* seams** — `takeDamage`, `applyIncomingCombatDamage`, `beginCombat`, `endCombat`,
   `die`. These are where NPC-owned consequences (vigor cost, blood trace, contract release,
   conversation release, Plan interruption) attach.
7. **`resolveTimeSkip`.** Must stay inside the class that owns the same fields normal progression
   mutates, or the "time-skip follows the same semantics" invariant becomes two implementations.
8. **`socialCandidate` / `beginConversation` / conversation release.** Small, correct, and the
   settlement-wide pairing pass (`socialBehaviour.ts`) already owns the matching half.
9. **The public API** — `createInspectionSnapshot`, `why`, `getCurrentActivity`,
   `resolveAssistanceRequest`, `setHelperAssignment`, `setQuestMarker`, `setHighlighted`,
   `setFrozen`, `history`. 18 files import from `NpcAgent`; none of these should move.
10. **Ownership of `NpcAuthoritativeState`.** Direct mutation of the shared object is the documented
    plan-197 contract. Do not introduce a snapshot/copy step.

---

## 5. What should actually be extracted

Six modules. Four hand a responsibility back to a module that already owns the domain; two are new
because the domain has three duplicate implementations and no owner.

### E1 — `src/ai/npcAction.ts` (new, tiny, unblocks everything else)

Move `Phase`, `ActionId`, `NpcPlannedAction` out of `NpcAgent.ts` so profession/logistics modules can
build actions without importing the class. Re-export both types from `NpcAgent.ts`
(`export type { ActionId, Phase } from './npcAction'`) so `debug/npcTrace.ts`, `debug/npcInspector.ts`
and every other importer are untouched. ~90 lines moved, zero behaviour.

### E2 — `src/ai/npcProfessionWork.ts` (new — the test file already exists)

Owns the eight `begin*Work` decisions as pure planners plus their constants. Signature shape:

```ts
export type NpcWorkContext = {
  role: Role
  x: number; z: number
  waitMultiplier: number
  simTime: number
  home: Vec3
  landmarks: SettlementLandmarks
  workplace: Place | null
  household: Household | null
  economy: SettlementEconomy | null
  carried: Inventory
  guardPatrolIndex: number          // read; the returned action reports the next value
  fishAttempt: number
  sampleHeight: HeightSampler
  mining: SettlementMiningHooks | null
  foodSources: SettlementFoodSourceHooks | null
  householdExchange: HouseholdExchangeHooks | null
}

/** `null` → no profession work available; caller falls back to the generic
 *  workplace stand (`commitRoleWork`), exactly as today. */
export function planProfessionWork(ctx: NpcWorkContext): NpcPlannedAction | null
```

`onComplete` closures move with their method — they only touch `household`/`economy`/`carried`/hooks,
all of which are in `ctx`. Two need a counter written back (`guardPatrolIndex`, `fishAttempt`); pass a
tiny `{ advanceGuardPatrol(): void, nextFishAttempt(): number }` callback pair in `ctx` rather than
returning a tuple. Moves ~390 lines; `NpcAgent` keeps ~15 (build ctx, call, `startAction`).

### E3 — `src/ai/npcLogistics.ts` (new; a consumer of existing owners, not a new economy)

Owns the two-leg claim → carry → deposit builder and the five flows on top of it. It must **not**
re-implement claims: it composes `economy/localExchange.ts`, `items/foodItems.ts`,
`settlement/storageDestinations.ts` and `settlement/householdExchange.ts`. Shape:

```ts
export type ResourceTransferPlan = {
  pickupKind: ActionId          // 'exchange' | 'eat' | 'work'
  pickup: Vec3
  deposit: Vec3
  onPickup: () => void
  onDeposit: () => void
}
export function buildTransferAction(plan: ResourceTransferPlan, waitMultiplier: number): NpcPlannedAction

export function planEconomyWithdraw(ctx, kind): NpcPlannedAction | null
export function planHouseholdExchange(ctx, kind): NpcPlannedAction | null
export function planPlayerStorageDelivery(ctx): NpcPlannedAction | null
export function canWithdrawFromEconomy(ctx, kind): boolean       // was computeEconomyWithdrawAvailable
export function canExchangeWithHousehold(ctx, kind): boolean     // was computeHouseholdExchangeAvailable
export function canDeliverToPlayerStorage(ctx): boolean          // was computeDeliveryAvailable
```

Also absorbs `depositWoodHarvest`, `depositFoodHarvest`, `depositCarriedItems` (`:733`–`:777`) and
`HOUSEHOLD_EXCHANGE_MAX_TRANSFER` / `HELPER_DELIVERY_*`. Collapse the `food`/non-`food` internal
duplication in `planEconomyWithdraw`/`planHouseholdExchange` into one claim abstraction while moving.
Moves ~340 lines; `NpcAgent` keeps ~60.

### E4 — `src/ai/npcDecision.ts` (new; the NPC counterpart of `fauna/faunaDecision.ts`)

A pure priority table for the top-level "what should this NPC do now" question, shared by `choose()`
and `tickCriticalInterrupt()` so the two precedences can never silently drift:

```ts
export type NpcDecisionKind =
  | 'collapseSleep' | 'need' | 'seekShelter' | 'scheduledSleep' | 'idle'

export type NpcDecisionInput = {
  collapsing: boolean
  wonNeed: NeedId               // pickActionKind result over candidates
  weatherPressure: number
  scheduleActivity: ScheduleActivity
}
export function decideNpcAction(input: NpcDecisionInput): NpcDecisionKind

export type NpcInterruptInput = {
  collapsing: boolean
  activeNeed: NeedId
  criticalNeed: NeedId
  weatherPressure: number
}
export function shouldInterruptAction(input: NpcInterruptInput): boolean
```

Deliberately small. It encodes *only* today's ordering (copy it 1:1 — this is a pure refactor) and,
like `faunaDecision.ts`, exposes a `scoreNpcDecisions()` variant for the inspector. ~60 lines moved,
~120 lines of new tests.

### E5 — extend `src/ai/Needs.ts` (existing owner)

```ts
export const NEED_SATISFY_AMOUNT: Record<Exclude<NeedId, 'idle'>, number>
export function relieveNeed(needs: NeedState, need: NeedId, amount?: number): void
export function needValue(needs: NeedState, need: NeedId): number | null
```

Replaces the 16 ad-hoc mutations and three duplicated `NeedId → field` switches. Moves the four
`*_SATISFY_AMOUNT` constants into the module that owns need semantics. ~20 lines net, but the
duplication count goes 16 → 0.

### E6 — extend `src/ui/agentStatusLabel.ts` (existing owner) + `src/shared/agentAnimationSet.ts` (new)

**Label controller** — `agentStatusLabel.ts` already exports every primitive; add the controller both
agents currently hand-write:

```ts
export type AgentStatusLabelController = {
  label: CSS2DObject
  el: HTMLDivElement
  setName(text: string): void
  setDebugLine(text: string | null): void
  sync(bars: Partial<Record<LabelBarKind, { current: number, max: number }>>,
       mesh: THREE.Object3D, distance: number, gaze: number): void
  dispose(): void
}
export function createAgentStatusLabelController(
  name: string, bars: readonly LabelBarKind[], height: number, fadeDistance: number,
): AgentStatusLabelController
```

**Animation set** — three agents (`NpcAgent`, `AnimalAgent:3768`, `PlayerController`) each hand-roll
clip lookup + crossfade + one-shot. Give them one owner:

```ts
export type AgentAnimationSet<K extends string> = {
  resolve(names: Partial<Record<K, readonly string[]>>): void
  play(key: K): void                    // crossfade, fades every other clip
  playOnce(key: K): number              // LoopOnce + clampWhenFinished, returns duration
  settleAtEnd(key: K): void             // die(alreadySettled) — no blend
  has(key: K): boolean
  update(dt: number): void
  stopAll(): void
}
export function createAgentAnimationSet<K extends string>(root: THREE.Object3D, clips: THREE.AnimationClip[]): AgentAnimationSet<K>
```

This removes the three hard-coded 7-element arrays. **Wire `NpcAgent` only in this refactor**;
`AnimalAgent`/`PlayerController` adoption goes to `docs/plans/LOOSE-ENDS.md` so this change stays
reviewable.

### E7 — move pure geometry into `src/ai/npcColliderRim.ts` (existing owner)

```ts
export function isPointWalkableForNpc(x: number, z: number, colliders: readonly Collider[],
  agentX: number, agentZ: number, destination: { x: number, z: number } | null,
  approachBuffer: number, coreFraction: number): boolean
export function bypassPointForSegment(fromX: number, fromZ: number, dest: { x: number, z: number },
  colliders: readonly Collider[], approachBuffer: number): { x: number, z: number } | null
export function sampleNearbyExteriorPoint(originX: number, originZ: number,
  radii: readonly number[], attempts: number, isExterior: (x: number, z: number) => boolean,
  random: () => number): { x: number, z: number } | null
```

`NpcAgent` keeps the water-level check and the callback wiring. ~100 lines moved into a module that
already has tests.

### E8 (Phase 2, optional) — move the combat tick into `src/ai/npcCombat.ts` (existing owner)

`npcCombat.ts` currently owns weapon resolution and hit application; the ~370-line attack loop lives in
the agent. Give it an `NpcCombatRuntime` owning `intent`/weapons/`combatAttack`/`combatRangedAttack`/
`combatProjectile`/`combatAttackAttempt`, driven through a narrow actor interface:

```ts
export type NpcCombatActor = {
  id: string
  position: { x: number, z: number }
  setYaw(yaw: number): void
  steerToward(x: number, z: number, dt: number): void
  stamina: StaminaState
  carried: Inventory
  onAttackClip(mode: 'melee' | 'ranged'): void
  onImpact(target: CombatIntent['target'], pos: { x: number, z: number }): void
  onTrace(event: NpcTraceEvent): void
}
export function createNpcCombatRuntime(): NpcCombatRuntime
// runtime.begin(intent, carried) → boolean ; runtime.tick(dt, actor, targetPos) → 'running' | 'complete' | 'failed'
```

**Gate this on browser verification of npc-009 and npc-015** — both are still `verification needed` in
`docs/plans/README.md`, and this is the newest, least-exercised code in the file.

---

## 6. Existing modules to reuse (do not invent alternatives)

| Need | Existing owner | Note |
|---|---|---|
| Need semantics, thresholds, pressures | `ai/Needs.ts` | add `relieveNeed`/`needValue`; do not create `NeedService` |
| Personality/role scoring | `ai/decisionModifiers.ts` | already correct; a preference layer, never a candidate generator |
| Weather pressure | `ai/weatherPressure.ts` | `NpcDecisionTarget` seam already exists — reuse it in `npcDecision.ts` |
| Strategy candidates + selection | `ai/npcStrategies.ts` | make its output authoritative (P1); do not add a second scorer |
| Plan lifecycle | `ai/npcPlan.ts` | pure transitions already there |
| Schedule / idle intent / night leisure | `ai/schedule.ts` | `activityAt`, `idleIntentFor`, `isNightLeisureTime`, `nextBoundary` |
| Weapon/ammo/defense resolution, hit application | `ai/npcCombat.ts` | Phase 2 target |
| Threat perception + defend/flee scoring | `ai/npcAnimalThreat.ts` | already extracted, keep |
| Stuck detection ladder | `ai/npcMovementWatchdog.ts` | keep |
| Collider geometry | `ai/npcColliderRim.ts` | **give it P7's four functions** |
| Contract scoring | `ai/npcWorkContract.ts` | keep |
| Conversation pairing/cooldown | `ai/socialBehaviour.ts` | keep |
| Loadout seeding | `ai/npcLoadout.ts` | keep |
| Priority-table arbitration precedent | `fauna/faunaDecision.ts` | **copy its shape for `npcDecision.ts`** |
| Action/lifecycle/queue/scoring contracts | `simulation/` | `PlannedAction`, `ActionLifecycle`, `InteractionQueue`, `pickActionKind` |
| Atomic surplus claims | `economy/localExchange.ts` | `claimHouseholdSurplus`, `claimEconomySurplus` |
| Recipes / role work commits | `economy/production.ts`, `economy/npcWork.ts` | `commitHunterArrowProduction`, `commitRoleWork` |
| Food item claims with freshness | `items/foodItems.ts` | `claimFoodItems`, `carryFoodClaim`, `deliverCarriedFoodClaim` |
| "Where does this kind go" | `settlement/storageDestinations.ts` | already the resolver — keep using it |
| Bounded neighbour lookup | `settlement/householdExchange.ts` | `findSurplusSource`; never a world scan |
| Construction materials | `items/constructionMaterials.ts` | `hasMaterial`/`consumeMaterial` |
| Well stages/costs/work | `world/playerWell.ts` | P6 owner — **blocked by in-flight world-004 work** |
| Food/crop/garden queries | `world/foodSources.ts` | full hooks surface already exists |
| Fishing catch rule | `world/fishing.ts` | `fishingSpotId`, `rollFishingCatch` |
| Tree harvest | `world/treeHarvest.ts`, `world/settlementForestHooks.ts` | keep |
| Deps-object precedent | `settlement/createSettlement.ts:204` (`CreateSettlementDeps`) | **copy this exact shape for `NpcAgentDeps`** |
| Label primitives | `ui/agentStatusLabel.ts` | E6 owner |
| Slope + collision step | `terrain/slopeConstraint.ts` | shared with `AnimalAgent`, keep |
| Path search | `navigation/navigation.ts` + `navigationStats.ts` | keep |

---

## 7. Proposed structure after the refactor

```text
src/ai/
  NpcAgent.ts              ~3 900 (Phase 1) → ~3 500 (Phase 2)
      FSM + update() tick, startAction/queue, choose() sequencing,
      Plan application, movement execution + rescue ladder,
      combat entry seams, social, contracts drive, time-skip, public API
  npcAction.ts             NEW  ~90   Phase / ActionId / NpcPlannedAction
  npcDecision.ts           NEW  ~110  top-level priority table (fauna-style) + tests
  npcProfessionWork.ts     NEW  ~420  8 profession planners + their constants
  npcLogistics.ts          NEW  ~360  two-leg transfer builder + 5 flows
  Needs.ts                 +30        relieveNeed / needValue / NEED_SATISFY_AMOUNT
  npcColliderRim.ts        +110       walkability, segment bypass, exterior sampling
  npcStrategies.ts         unchanged  (its output becomes authoritative)
  npcCombat.ts             +370       Phase 2 only — NpcCombatRuntime
src/shared/
  agentAnimationSet.ts     NEW  ~120  clip resolve / crossfade / one-shot / settle
src/ui/
  agentStatusLabel.ts      +90        createAgentStatusLabelController
src/world/
  playerWell.ts            +60        advanceWellConstruction (actor-neutral) — LAST
```

New/changed test files: `npcDecision.test.ts`, `npcProfessionWork.test.ts` (**exists — extend**),
`npcLogistics.test.ts`, `npcColliderRim.test.ts` (extend), `Needs.test.ts` (extend),
`agentAnimationSet.test.ts`.

---

## 8. Implementation steps, in order

Each step is a separate commit. Steps 1–8 must be **observationally identical**; step 9 is the only
intentional behaviour change (two bug fixes) and gets its own tests; steps 10–11 are structural.

**Step 1 — `npcAction.ts` (mechanical, no risk).**
Move `Phase` (`:347`), `ActionId` (`:367`), `NpcPlannedAction` (`:399`) into `src/ai/npcAction.ts`.
Re-export both public types from `NpcAgent.ts` so `debug/npcTrace.ts`, `debug/npcInspector.ts` and the
15 other importers need no edit. Verify with `npx tsc --noEmit`.

**Step 2 — `Needs.ts` relief API (E5).**
Add `NEED_SATISFY_AMOUNT`, `relieveNeed`, `needValue`. Replace all 16 mutation sites and the three
`NeedId → field` switches (`needValueFor` `:1698`, `buildDecisionContext` `:3084`, `resolveTimeSkip`
`:2850`-ish). Delete `WATER_SATISFY_AMOUNT`/`FOOD_SATISFY_AMOUNT`/`WOOD_SATISFY_AMOUNT`/
`WATER_DUTY_SATISFY_AMOUNT` from `NpcAgent.ts`. Extend `Needs.test.ts`.

**Step 3 — `npcLogistics.ts` (E3).**
Move `depositWoodHarvest`/`depositFoodHarvest`/`depositCarriedItems`, the three `compute*Available`
helpers, `beginEconomyWithdraw`, `beginHouseholdExchange`, `beginPlayerStorageDelivery`,
`satisfyHouseholdResourceNeed`, `deliverHuntYieldHome`, and `HOUSEHOLD_EXCHANGE_MAX_TRANSFER`/
`HELPER_DELIVERY_*`. Introduce `buildTransferAction` and collapse the `food`/non-`food` duplication.
`NpcAgent` calls `plan*(...)` and `startAction(...)`. New `npcLogistics.test.ts` covering: claim
revalidation at deposit time, zero-surplus → `null`, food claim carries `batches` through, wood claim
uses `claimHouseholdSurplus`.

**Step 4 — `npcProfessionWork.ts` (E2).**
Move the eight `begin*Work` bodies and their constants. Replace `:4331`–`:4337` with:

```ts
const work = planProfessionWork(this.professionContext())
if (work) { this.startAction(work); return }
```

Keep the fallback `commitRoleWork` stand exactly as-is. Extend the **existing**
`npcProfessionWork.test.ts` (move `findWeaponNeedingMaintenance` there too) with per-role tests:
farmer prefers harvest over planting, farmer never plants without a seed, fisher returns `null`
without a dock, trader falls through to collection, blacksmith returns `null` without a whetstone,
guard cycles its three points deterministically, miner returns `null` with no carry room.

**Step 5 — strategy dispatch becomes authoritative (P1).**
Rewrite `beginNeed()` (`:3259`) as `switch (this.selectAndTraceStrategy(need, candidates))` over
`NpcStrategyId`. Each case calls the same private method it calls today, so no execution code changes.
`null` → the current `beginUnscheduledIdle()` fallback. **Verify the resulting order matches
`npcStrategies.ts` exactly** — it does today, branch by branch, for `food`, `water`, `waterDuty` and
`wood`; that equivalence is the acceptance criterion. Delete the now-duplicated `if`-ladder.
Add a `npcStrategies.test.ts` case asserting every `NpcStrategyId` is reachable from at least one
candidate builder (guards against an orphaned id).

**Step 6 — `npcDecision.ts` (E4).**
Extract `choose()`'s ordering and `tickCriticalInterrupt()`'s precedence into
`decideNpcAction`/`shouldInterruptAction` + `scoreNpcDecisions`. Copy today's ordering verbatim. Wire
`scoreNpcDecisions` into `NpcInspectionSnapshot` the way `getDebugInfo().behaviourCandidates` works on
the fauna side. New `npcDecision.test.ts`.

**Step 7 — presentation (E6).**
7a: `createAgentStatusLabelController` in `agentStatusLabel.ts`; `NpcAgent` drops
`labelEl`/`labelNameEl`/`labelBarsEl`/`hpFillEl`/`staminaFillEl`/`vigorFillEl`/`debugEl`/
`lastLabelText`/`lastHpPercent`/`lastStaminaPercent`/`lastVigorPercent`/`lastDebugText`/
`labelDistanceState` (13 fields → 1).
7b: `shared/agentAnimationSet.ts`; `NpcAgent` drops the 7 action fields and the three hard-coded
arrays. `hurtAnimTimer`/`deathAnimSettleAtSimClock` stay in `NpcAgent` (they gate simulation, not
presentation).
7c: guard the need-marker `setHex` writes on `activeNeed` change (same idiom as `lastLabelText`) and
hoist the marker `SphereGeometry` to module scope.
Do **not** touch `AnimalAgent`/`PlayerController` here — record in `LOOSE-ENDS.md`.

**Step 8 — collider geometry (E7).**
Move `isWalkable`'s penetration rule, `resolveSteerTarget`'s bypass, and the two sampling loops into
`npcColliderRim.ts`. Extend `npcColliderRim.test.ts`.

**Step 9 — unify action cancellation + fix D1/D2 (intentional behaviour change).**
Add one private helper:

```ts
private resetInFlightAction(opts: {
  lifecycle: 'fail' | 'none'
  clearSleepReason: boolean
  markPlanInterrupted: boolean
}): void
```

covering: `releaseConversationIfAny()`, `leaveActiveQueue()`, `pendingAction = null`,
`pathWaypoints = []`, `pathIndex = 0`, `wait = 0`, `clearRepath()`, `resetMovementWatchdog()`.
Call it from all six sites (`beginCombat`, `fleeFromThreat`, `beginCollapseSleep`, `die`,
`interruptCurrentAction`, `abandonStuckAction`) with the per-site options.
**Effect:** `beginCombat`/`fleeFromThreat` now release the conversation partner (D1) and
`fleeFromThreat`/`beginCollapseSleep` now mark the Plan interrupted (D2).
This is the one step whose diff must be reviewed line by line against the six current bodies.

**Step 10 — `NpcAgentDeps` (P4).**
Define `NpcAgentDeps` mirroring `CreateSettlementDeps` (`createSettlement.ts:204`). Collapse the three
30-parameter lists to `(root, animations, deps)` / `(deps)`. Update the single call site
(`createSettlement.ts:592`) and drop the `undefined` placeholder. Land **last** in Phase 1 — it is the
step with the widest blast radius and the least semantic content, so it should sit on top of a
verified tree.

**Step 11 (Phase 2, optional) — `NpcCombatRuntime` (E8).**
Only after npc-009 and npc-015 have passed browser verification. Move `beginCombat`'s weapon
resolution, `tickMeleeCombat`, `tickRangedCombat`, `isCombatCycleIdle` and the projectile state into
`npcCombat.ts`; move the `isNpcCombatDebugMode()` console blocks into `debug/` behind a small
`logNpcCombatEvent` helper. `NpcAgent` keeps `beginCombat`/`endCombat`/`die` as the consequence seams.

---

## 9. Files to create / modify

### Create

| File | Lines (est.) | Step |
|---|---|---|
| `src/ai/npcAction.ts` | ~90 | 1 |
| `src/ai/npcLogistics.ts` | ~360 | 3 |
| `src/ai/npcLogistics.test.ts` | ~180 | 3 |
| `src/ai/npcProfessionWork.ts` | ~420 | 4 |
| `src/ai/npcDecision.ts` | ~110 | 6 |
| `src/ai/npcDecision.test.ts` | ~140 | 6 |
| `src/shared/agentAnimationSet.ts` | ~120 | 7b |
| `src/shared/agentAnimationSet.test.ts` | ~80 | 7b |

### Modify

| File | Change | Step |
|---|---|---|
| `src/ai/NpcAgent.ts` | −~1 250 lines; 93 → ~62 fields; 80 → ~55 imports | 1–10 |
| `src/ai/Needs.ts` | +`relieveNeed`, `needValue`, `NEED_SATISFY_AMOUNT` | 2 |
| `src/ai/Needs.test.ts` | + relief cases | 2 |
| `src/ai/npcStrategies.test.ts` | + reachability case | 5 |
| `src/ai/npcProfessionWork.test.ts` | **exists** — retarget + extend | 4 |
| `src/ai/npcColliderRim.ts` | +3 pure functions | 8 |
| `src/ai/npcColliderRim.test.ts` | + cases | 8 |
| `src/ui/agentStatusLabel.ts` | +controller | 7a |
| `src/settlement/createSettlement.ts` | 30 positional args → `NpcAgentDeps` object | 10 |
| `src/ai/npcCombat.ts` | +`NpcCombatRuntime` | 11 |
| `docs/STATE.md` | Settlements/NPCs section: note the new `ai/` module boundaries | after 10 |
| `docs/CODE_INDEX.md` | manual routing rows for the new modules, then `pnpm docs:sync` | after 10 |
| `docs/plans/LOOSE-ENDS.md` | P10 determinism, `AnimalAgent`/`PlayerController` adoption of E6, P12 items | after 10 |

### Do not touch

`src/ai/decisionModifiers.ts`, `weatherPressure.ts`, `npcPlan.ts`, `npcAnimalThreat.ts`,
`npcMovementWatchdog.ts`, `npcWorkContract.ts`, `socialBehaviour.ts`, `npcLoadout.ts`,
`schedule.ts`, `simulation/*`, `economy/*`, `settlement/npcState.ts` — all already correct owners.

---

## 10. Risks and mitigations

**R1 — Step 5 (strategy dispatch) silently reorders a need's fallbacks.**
This is the only step that can change *which* action an NPC takes. Mitigation: before the rewrite,
write the current `beginNeed` order out per need as a comment and diff it against
`getFoodStrategyCandidates`/`getWaterStrategyCandidates`/`getWaterDutyStrategyCandidates`/
`getWoodStrategyCandidates`. They match today — if any pair does not, **stop and report it** rather
than "fixing" it inside a refactor. Then confirm in-game via `?debug=1` that the inspector's
`← selected` line matches the action the NPC actually starts.

**R2 — Step 9 changes behaviour on purpose.**
Two fixes ride in one commit. Mitigation: land them as a single, clearly-labelled commit with the six
before/after bodies in the message, plus a browser check (§11) that specifically drives an NPC out of a
conversation with a wolf and confirms it can converse again afterwards.

**R3 — Step 4/3 closures capture stale state.**
Several `onComplete` closures currently capture `this` implicitly (e.g. `this.simClock` read at
completion time, not plan time). When moving them into a context object, **read the same values at the
same moment**: pass `simTime` as a getter (`() => number`), not a captured number, wherever the
current code reads `this.simClock` inside `onComplete`. Audit every moved closure for this.

**R4 — Step P6 (well construction) collides with uncommitted work.**
`src/world/playerWell.ts`, `createPlayerWells.ts`, `placementActions.ts`, `saveData.ts` and
`worldBundle.ts` are all modified in the working tree right now, and `src/world/wellGroundwater.ts` is
untracked (plan world-004: per-well `waterDepth`, deep-well gates). `WELL_STAGE_COST` and
`wellStageWorkHours` are gaining a `waterDepth` parameter. **Do not attempt P6 in this refactor.**
Record it in `LOOSE-ENDS.md` and revisit once world-004 is committed and verified; the extraction is
then a much smaller diff against a stable signature.

**R5 — `NpcAgentDeps` (step 10) is a wide, semantically empty diff.**
Mitigation: land it last, as its own commit, with `npx tsc --noEmit` + `pnpm run build` as the gate.
Because it is positional → named, the compiler catches every real mistake **except** two same-typed
adjacent hooks; hand-check `foodSources`/`hunting`/`helperDelivery`/`householdExchange` and
`workContracts`/`playerWells`/`droppedItems` against the current call site.

**R6 — Presentation extraction breaks the debug label or the mirror layer.**
`assignRenderLayer(this.mesh, AGENT_RENDER_LAYER)` and `NPC_SHADOW_DISTANCE` (imported by
`shadowBudget.ts` and `gameLoop.ts`) must keep their current semantics. The label controller must
preserve the existing early-out guards (`lastHpPercent` etc.) — dropping them adds a per-frame DOM
write per NPC.

**R7 — Import cycles.**
`npcProfessionWork.ts` and `npcLogistics.ts` must import `NpcPlannedAction` from `npcAction.ts`
(step 1), never from `NpcAgent.ts`. `NpcAgent.ts` imports them normally. Step 1 exists precisely to
make this impossible to get wrong.

**R8 — Persistence.**
Nothing in this refactor changes `NpcAuthoritativeState`, `NpcStateSnapshot`, `SaveData` or any
persisted shape. **No `CURRENT_SAVE_VERSION` bump, no migration.** If any step appears to need one,
that step has gone out of scope.

---

## 11. Verification plan

### Automated (required after every step)

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run test
pnpm run build          # steps 7, 10 and 11 only — the ones that touch Three.js wiring
```

Targeted suites: `src/ai/*.test.ts`, `src/debug/npcInspector.test.ts`,
`src/debug/npcDebugApi.test.ts`, `src/economy/*.test.ts`, `src/simulation/*.test.ts`.

### New coverage this refactor must add

| Module | Must assert |
|---|---|
| `npcDecision.test.ts` | collapse outranks everything; `seekShelter` beats `idle` but never an active need; interrupt precedence differs from `choose` precedence exactly as today |
| `npcProfessionWork.test.ts` | per-role availability, deterministic guard cycle, farmer harvest-before-plant, no-seed → no plant, no-dock → `null`, trader falls through to collection |
| `npcLogistics.test.ts` | pickup revalidates at deposit time; a consumed source yields nothing; food claims preserve `batches`; wood uses the scalar claim seam |
| `Needs.test.ts` | `relieveNeed` clamps at 0 and is a no-op for `idle`; `needValue` returns `null` for `idle` |
| `npcColliderRim.test.ts` | approach-buffer/core-fraction rule; segment bypass returns a rim point; exterior sampling rejects interior points |
| `agentAnimationSet.test.ts` | `play` fades every other clip; `playOnce` clamps; `settleAtEnd` produces no blend |

### Browser / manual (required — none of the above proves in-game correctness)

Run with `?debug=1`, open the NPC inspector on a settlement NPC:

1. **Needs unchanged.** Watch one NPC through a full day: drink at home → drink at well (queued) →
   eat from household → garden gather. Confirm phase/action/need transitions read the same as before
   and no NPC gets stuck in `choose`.
2. **Strategy line is now the truth (step 5).** Confirm the inspector's `← selected` strategy always
   matches the action that actually starts, including when a neighbour drains the surplus mid-trip.
3. **Every profession still works (step 4).** Find one NPC per role and confirm during its `work`
   block: miner mines→deposits, farmer harvests, fisher casts at the dock, guard visits all three
   patrol points, trader moves surplus to market, hunter crafts arrows, blacksmith is idle (expected —
   no whetstone path exists), woodcutter uses the generic stand.
4. **Logistics conserved (step 3).** Trigger a household food shortage; confirm withdraw/exchange
   trips leave `source + carried + destination` conserved, and that interrupting mid-trip leaves the
   goods physically carried rather than vanished.
5. **D1 fix (step 9).** At night, get two NPCs into a campfire conversation, then let a wolf approach
   one of them. Confirm the interrupted NPC (a) leaves combat normally and (b) **starts another
   conversation later that night**. Before the fix it never will.
6. **D2 fix (step 9).** Trigger an animal flee mid-`wood` Goal; confirm the inspector shows the Plan as
   `interrupted`, then `partially_completed`/`active` when resumed.
7. **Presentation (step 7).** Walk toward/away from an NPC: name, HP/stamina/vigor bars, gaze fade and
   the `?debug=1` line all behave as before. Attack one: hurt clip plays, then death clip plays once.
   Reload a save with a dead NPC: it presents the settled end pose with no replayed collapse.
8. **Contracts (unchanged, regression only).** Post a construction contract; confirm an NPC accepts,
   travels, works the well through its stages and reaches `payment_due`.
9. **Time-skip.** Skip 8 h; confirm NPCs land at schedule-appropriate places with plausible
   needs/stamina/vigor and no stuck conversation reservations.

### Non-regression check

`git diff --stat` per step should show **only** the files listed in §9 for that step. Any unexpected
file means scope leaked.

---

## 12. Out of scope

- **Changing any NPC behaviour** other than D1/D2 in step 9. Satisfy amounts, search radii, profession
  priorities, strategy order, patrol points, conversation cooldowns, watchdog thresholds and
  reaction chances must all come out numerically identical.
- **P10 — making the garden-maintenance/watering rolls deterministic.** It mutates persisted state and
  is a real behaviour change; it deserves its own `npc-###` plan. Record in `LOOSE-ENDS.md`.
- **P6 — the shared well-construction seam.** Blocked by uncommitted plan world-004 work (R4).
- **`AnimalAgent` (3 822 lines).** A separate review; only `agentAnimationSet.ts`/
  `agentStatusLabelController` are *designed* for its later adoption, and adopting them there is
  explicitly not part of this work.
- **`NpcAgent.update()`'s 8 positional parameters** and the matching question in `Settlement.update` /
  `AnimalAgent.update`. The `createSettlement` review already deferred this; decide it once across all
  four call chains, not here.
- **Persistence of NPC runtime state** (`phase`, `pendingAction`, navigation, combat intent). Still
  correctly out of `SaveData`; nothing here changes that.
- **A new goal/planning framework.** `npcPlan.ts` + `npcStrategies.ts` are sufficient; step 5 makes
  them load-bearing rather than replacing them.
- **Splitting `NpcAgent` into multiple classes.** Explicitly rejected — see §4.
- **`src/ai/dialogue.ts` / `dialogueTemplates.ts` / `characters.ts`.** Untouched.

---

## Verdict

**REFACTOR** — `NpcAgent` is a legitimate coordination core with a sound FSM, correct state ownership
and a well-factored decision stack beneath it, but ~1 250 lines of it are domain logic that four
existing modules already own (`Needs.ts`, `npcColliderRim.ts`, `agentStatusLabel.ts`,
`npcStrategies.ts`), plus two duplicated implementations with no owner (profession work, two-leg
logistics). The strategy layer is computed and discarded; the cleanup path is written six times and has
already produced a live defect; the constructor repeats 30 positional parameters three times. None of
this is a "the file is long" argument: every extraction removes a duplication, gives a responsibility
back to its owner, or makes currently-unreachable logic testable — and the class deliberately stays
large.

**Effort: L** — Phase 1 is 8 new files (4 source, 4 test) + 10 modified, ~1 250 lines moved and
~250 rewritten, across 10 commits, with one deliberate behaviour change (step 9) and one wide
mechanical change (step 10). Phase 2 (step 11, `NpcCombatRuntime`) adds ~370 more lines moved and is
gated on browser verification of npc-009/npc-015. Steps 1, 2, 7 and 8 are low-risk and can land
immediately; steps 3–6 need the browser checks in §11; step 10 lands last.
