# Living World Consistency Audit

**Created:** 2026-09-12
**Status:** `done`
**Type:** cross-domain consistency audit (recon only — no production code changed, no plans written, no browser verification)
**Scope:** NPC · households · settlements · fauna/livestock · time & schedules · streaming · time skip · save/load · `WorldBundle` rebuild · persistence · lifecycle/death/corpses · needs/pressures/decisions/actions · resources/ownership/economy · environmental pressures

## Audit baseline

| | |
|---|---|
| Audited commit | `9b7b224` (`main`, 2026-09-12T11:37Z) |
| Agent | Claude Code (Opus 5) |
| Method | Static recon of `src/` (666 non-test modules) against `CLAUDE.md`, `docs/STATE.md`, `docs/state/{npc,settlements,fauna,persistence,combat}.md`, `docs/plans/{README,PLANNING}.md` |
| Emphasis | Changes landed on `main` in the last ~7 days: `items-player-029`, `fauna-025`, `settlements-npcs-032`, `settlements-npcs-030`, `world-025`, `fauna-024`, `settlements-007`, `world-026`, `npc-036` |
| Not verified | Anything requiring a running browser. Perf claims are structural (call-site cadence), not measured. |

Every finding below was read out of current source. Where a claim rests on a
chain of call sites, the chain is given so a later agent can re-verify it
without repeating the recon.

---

## 0. Executive summary

The domain-local architecture is in good shape: ownership boundaries are
explicit, the pressure/arbitration seam is genuinely extensible, and the
"deterministic base + persisted delta" rule is applied consistently. Almost
every problem found is a **seam** problem — two locally-correct systems that
never meet, or meet through a pool/clock/identity that one of them doesn't
share.

Three of those seams are load-bearing for the "living world" premise:

1. **Wild predators and household livestock live in disjoint agent pools**, so
   the predator→livestock half of the ecosystem never fires at all (§A1).
2. **Time skip is not simulation-equivalent** for livestock, rats, animal
   corpses, agriculture or the household economy — it violates the stated
   `ARCHITECTURE.md` invariant "time-skip follows the same simulation
   semantics as normal progression" (§A2, §A7).
3. **The wood economy has two incompatible representations** (scalar
   `EconomicStock.wood` vs. concrete `branch`/`beam` `ItemKind`) with a
   one-way item→scalar conversion, which silently kills two shipped NPC
   features and creates a decision livelock (§A5, §A6).

---

## 1. Confirmed findings

### A1 — Wild predators can neither perceive nor hunt household livestock

- **Severity:** critical
- **Category:** missing interaction
- **Affected systems:** fauna (predation), livestock, households, NPC shepherd work, dog guard, lost-livestock quests, `fauna-024`/`fauna-025` stray

**Current behaviour.** `AnimalAgent` sensing is entirely relative to the
`others` array handed to `update()`, and `nearest()` additionally filters on
`AnimalDef.role`:

- `src/fauna/AnimalAgent.ts:4424` `nearest(others, role, range)` — skips any
  candidate whose `def.role !== role`.
- `src/fauna/AnimalAgent.ts:4419` predator prey-lock: `nearest(others, 'prey', detectRange)`.
- `src/fauna/AnimalAgent.ts:3519` prey flee: `nearest(others, 'predator', fleeRange)`.

Two independent gates prevent predator↔livestock contact:

1. **Pool separation.** Wild fauna is ticked with `others: agents`
   (`src/fauna/createFauna.ts:1185`); settlement livestock is ticked with
   `others: livestock` (`src/settlement/livestock.ts:876`); rats with
   `others: agents` of the rat pool (`src/settlement/rats.ts:~280`). The three
   arrays never intersect — `Fauna.getAgents()` returns only the wild pool
   (`createFauna.ts:1332`).
2. **Role filter.** `sheep`/`cow`/`chicken`/`dog`/`horse`/`donkey` are
   `role: 'livestock'` (`src/fauna/animalDefs.ts:472,501,528,607,…`), not
   `'prey'` — so even in a shared pool a wolf's `nearest(..., 'prey', ...)`
   would skip them.

**Why it's a problem.** This is not a missing feature so much as a set of
already-built consumers wired to a signal that can never fire:

- `AnimalAgent.huntingPrey()` (`AnimalAgent.ts:2520`) deliberately returns
  `{ animalId, ownerHouseId }`, and `app/gameLoop.ts:~2455` forwards it as
  `preyAnimalId`/`preyOwnerHouseId`. `ownerHouseId` is only ever set on
  livestock, so this field is structurally always `undefined` in production.
- `senseOwnedFlockThreat` (`src/ai/NpcAgent.ts:2657`, the shepherd's
  flock-defence branch) matches on exactly that `ownerHouseId` → **unreachable**.
  `src/fauna/shepherdFlock.test.ts` only passes because it constructs the
  candidate payload by hand.
- `dogGuard.ts`'s `resolveDogGuardTarget` keys on `wolf.npcTarget` — a wolf's
  **human** target. A household dog therefore defends *people*, never the
  flock, despite `fauna.md` framing dogs as household guards.
- `animalStray.ts`'s `predatorPressureAt()` penalises stray displacement
  destinations near predators — modelling a danger that cannot materialise.
- The lost-livestock quest supports `corpse-uninspected` / `corpse-inspected`
  outcomes (`animalStray.ts:classifyLostLivestock`) that in practice can only
  be produced by the *player* killing their neighbour's sheep.
- `src/fauna/AnimalAgent.test.ts:738` ticks a sheep with `[sheep, wolf]` — a
  pool composition production never builds. The test suite is actively masking
  the gap.

Net effect: livestock can panic at a wolf *howl* (the `preyAlertPerception`
path, which does receive a bounded `nearbyPredators` list) but is physically
immune to the wolf itself.

**Expected systemic direction.** Do not merge the pools and do not give
livestock `role: 'prey'` — both would break dog-guard, hunting-hook exclusion
and the persistence classes. The seam that already exists is the bounded,
caller-supplied candidate list (`nearbyPredators`, `nearbyRats`,
`nearbySettlementNpcs`, `threateningAnimals`): extend it symmetrically so
`gameLoop.ts` also hands each settlement's livestock into the wild predator
pass as an explicit *huntable-candidate* list, and let `resolvePreyTarget`
consider that list alongside `nearest(others, 'prey', …)`. That keeps one
owner per pool, keeps the `role` taxonomy intact, and makes
`huntingPrey().ownerHouseId` mean what its consumers already assume.

**Related plans.** `fauna-023` (systemic animal attraction — food/blood/trap
lures) and `quests-progression-019` (dangerous-animal deeds) both assume
predators can be drawn toward settlement-adjacent targets; both will
either re-discover this gap or build a parallel path around it.

---

### A2 — Time-skip catch-up covers wild fauna and NPCs but not livestock or rats

- **Severity:** high
- **Category:** bug / inconsistency
- **Affected systems:** time skip, fauna, livestock, rats, corpse lifecycle, `fauna-024` stray retention

**Current behaviour.** `app/gameLoop.ts:2425` gates the whole NPC/fauna/trap
block off while `timeSkip.isActive()`, then on `skip.justFinished` calls
exactly two catch-ups:

- `bundle.settlementsManager.resolveTimeSkip(...)` → `SettlementsManager.ts:886`,
  which iterates `entry.settlement.npcs` only.
- `bundle.fauna.resolveTimeSkip(...)` → `createFauna.ts:1316`, which iterates
  the **wild** `agents` array only.

`AnimalAgent.resolveTimeSkip()` (`AnimalAgent.ts:2325`) is therefore never
called for settlement livestock or rats. For those individuals a skip advances
neither `tickAnimalLife` (hunger/thirst/stamina), nor `advanceAge()` (juvenile
maturation), nor `corpse.timeSinceDeath`.

The code itself asserts the opposite in two places:

- `src/settlement/createSettlement.ts:235`: *"`update()` itself stays gated off
  entirely during a skip (NPCs/livestock keep the freeze-and-catch-up
  behaviour, plan 196)"* — livestock has the freeze, not the catch-up.
- `src/fauna/animalStray.ts:49`: *"`timeSinceDeath` already includes time-skip
  catch-up, so this is two default world days"* — false for exactly the class
  of animal (`household`-owned livestock) that `STRAY_CORPSE_RETENTION_SECONDS`
  governs.

**Why it's a problem.** A player sleeping 8 h makes wild deer hungry and ages
wild juveniles, while their own sheep experience no elapsed time at all. A dead
livestock animal's corpse does not decay across a night's sleep, and the
`fauna-024` two-day corpse-retention cap is measured in a clock that a
sleeping player never advances. This is a direct violation of
`ARCHITECTURE.md`'s "time-skip follows the same simulation semantics as normal
progression" invariant, and of `fauna.md`'s claim that livestock production
readiness is "correct across any length of settlement unload or time-skip" —
which is true only because production uses a world-day anchor, unlike the
three fields above.

**Expected systemic direction.** `resolveTimeSkip` should reach every live
`AnimalAgent`, not every agent in one registry. The cheapest correct shape is
for `SettlementsManager.resolveTimeSkip` to fan out to each loaded settlement's
`livestock` and `rats.getAgents()` using the same `elapsedSeconds` conversion
`Fauna.resolveTimeSkip` already performs — no new mechanism, one new loop.
Longer term, the day-anchor idiom (`productionReadyAtDays`, `woolReadyAtDays`,
`NpcPostDeathState.deathAtDays`) is the pattern that never needs a catch-up at
all; `corpse.timeSinceDeath` is the outlier worth migrating (see §A10).

---

### A3 — Rat reconciliation re-fires on every settlement construction

- **Severity:** high
- **Category:** bug
- **Affected systems:** rats, `Household` food, `SettlementEconomy` food, streaming, save/load, `WorldBundle` rebuild

**Current behaviour.** `src/settlement/rats.ts:193` declares
`let lastReconcileDay = -Infinity` as a **runtime-local** of `createRats()`,
and `rats.ts:305` gates the half-day reconciliation on
`ctx.nowDays - lastReconcileDay >= RAT_RECONCILE_INTERVAL_DAYS` (0.5).

`createRats()` is called from `createSettlement()`, i.e. once per settlement
**construction** — which happens on every stream-in, every save restore, and
every in-session `WorldBundle` rebuild. `lastReconcileDay` is not part of the
persisted rat state (`persistence.md` and `fauna.md` both correctly document
that only individuals + `{ storageDamaged, nestDestroyed }` persist).

So the first tick after *any* settlement construction unconditionally runs
`reconcile()` **and** `maybeEatFood()`.

**Why it's a problem.**

- `maybeEatFood()` (`rats.ts:253`) calls `nearest.takeFood(nowDays)` or
  `deps.economy.withdrawFood(1, nowDays)` per rat that passes a
  `hash01(ratId, dayBucket)` roll. The roll is *deterministic per half-day
  bucket*, so re-entering the same village within the same bucket drains the
  same rats' worth of food again, and again. Food destruction becomes a
  function of how often the player crosses the 300 m / 420 m stream boundary,
  not of world time.
- `reconcile()` can `spawnNew()` once per call, and `shouldInfestationReplenish`
  is likewise bucketed — so rat population growth is also stream-frequency
  driven. `fauna.md`'s "at most one spawn per half-day reconciliation" is not
  what the code guarantees across stream transitions.
- The home settlement never unloads in-session, so this mostly bites
  non-home settlements — but every `Continue`/load and every terrain-settings
  `WorldBundle` rebuild replays it for the home village too.

**Expected systemic direction.** `lastReconcileDay` is world-time state, not
runtime state — it belongs next to `{ storageDamaged, nestDestroyed }` in the
settlement-owned infestation record (`ratInfestation.ts`, already sparse,
already persisted, already carried across rebuild). Seeding it from the
restored record turns both the food drain and the replenishment back into pure
functions of elapsed world time. This is the same lazy-anchor fix pattern
`livestockProduction`, `structureCondition` and `NpcPostDeathState` already use.

---

### A4 — A burial claim is released using the *scanning* NPC's plan, not the claimant's

- **Severity:** high
- **Category:** bug
- **Affected systems:** NPC burial (`npc-011`), NPC corpse lifecycle (`npc-010`), grave creation

**Current behaviour.** `src/ai/burialPressure.ts:104`, inside the per-deceased
loop of `resolveBurialPressure`:

```ts
recoverStaleNpcBurialClaim(post, claimantHasMatchingPlan(input.activePlan, deceasedId))
```

`input.activePlan` is supplied by `NpcAgent.burialPressureCandidate()`
(`NpcAgent.ts:4980`) as `this.npcState.activePlan` — the **scanner's** own
plan. `recoverStaleNpcBurialClaim` (`npcPostDeath.ts:167`) releases the claim
whenever that flag is false.

`resolveBurialPressure` is called from every NPC's `choose()` tick
(`NpcAgent.ts:2731`), for every dead NPC in the settlement, **before** the
`if (owner != null && owner !== input.claimantId) continue` guard on line 107.

**Why it's a problem.** NPC A claims a corpse (`status: 'claimed'`,
`burialClaimantId: A`). On the very next frame, any other NPC B in the same
settlement — including one that will immediately fail the `social <= 0` gate
and never bury anything — strips A's claim, because B's own `activePlan` is not
a burial plan for that deceased. Consequences:

- The `claimed` lock that `npc-010` introduced specifically to block natural
  corpse cleanup (`npcPostDeath.ts`'s status contract) is effectively never
  held for more than one frame.
- A second NPC that *does* pass the social gate can take over a corpse A is
  already walking toward; A then bails in `executeBurial`
  (`NpcAgent.ts:5055`) with a cancelled Plan.
- A corpse can reach natural terminal cleanup while a burial is in flight.

The fix is an identity fix, not a design change: the plan to consult is the
*claimant's* — reachable through the hooks already in scope
(`hooks.getNpcState(post.burialClaimantId)?.activePlan`), which is exactly what
`NpcAgent.reevaluateBurialPlan()` (`NpcAgent.ts:4995`) does correctly for its
own claim.

**Related plans.** `npc-011` / `npc-026` are in the browser-verification queue;
this is worth fixing before that verification pass runs, since the symptom
("brak duplikacji grave po reload/rebuild") is adjacent to it.

---

### A5 — Household wood is scalar-only, but three consumers require `branch`/`beam` items

- **Severity:** high
- **Category:** architectural debt / inconsistency
- **Affected systems:** household economy, woodcutter work, hunter arrow production (`settlements-npcs-015`), NPC structure repair (`settlements-007`), player→household transfer (`settlements-npcs-032`)

**Current behaviour.** Wood exists in two incompatible representations and the
conversion is one-way:

| Representation | Owner | Producers |
|---|---|---|
| Scalar `EconomicStock.wood` | `Household.stock`, `SettlementEconomy` | woodcutter `chop → deposit`, player transfer |
| `ItemKind` `'branch'` / `'beam'` | any `Inventory` | tree harvest into a **player** `Inventory` only |

- Woodcutter deposit → `household.deposit('wood', …)` → `stock.add`
  (`src/settlement/household.ts:417`). Scalar.
- Player transfer (`settlements-npcs-032`, landed 2026-09-12) explicitly
  *converts* items to scalar: `householdResourceTransfer.ts:110` removes the
  `branch`/`beam` items from the source inventory and calls
  `household.deposit('wood', woodPerItem * amount, …)`. The item identity is
  destroyed on the way in.
- A full grep of `src/` shows **no** call site anywhere that adds `'beam'` or
  `'branch'` to a `Household.items` inventory. The only writers to
  `household.items` are: bandage/seed starters (`household.ts:381,384`), hay
  forage (`household.ts:469`), `depositFood`, and NPC `depositCarriedItems`
  for fish/hunt/wool/herbal yields.

Three consumers read exactly those item kinds out of `household.items`:

1. `src/ai/npcProfessionWork.ts:224` — Hunter arrow crafting requires
   `household.items.has('branch', 1) || household.items.has('beam', 1)`.
2. `src/settlement/structureCondition.ts:96–97` — the residential repair policy
   requires `{ kind: 'beam' }` + `{ kind: 'branch' }`, drawn in
   `NpcAgent.ts:5227` from `household.items`.
3. `src/ai/npcProfessionWork.ts:540` — Blacksmith whetstone (already documented
   as dormant in `settlements.md` and `npc.md`).

**Why it's a problem.** Two features documented as implemented are structurally
dead, and the documentation says so only for the third. `settlements.md`
describes Hunter arrow crafting as live work ("Hunter podczas bloku `work` …
craftuje strzały z `household.items`"), and `STATE.md` describes NPC
household-house repair as a shipped pressure. Neither can ever run. The
`settlements-npcs-015` verification row ("Hunter z gałęzią/belką w
gospodarstwie craftuje strzały") can only be exercised through a debug fixture.

This also compounds A6 below: the repair branch doesn't merely no-op, it stalls
the NPC.

**Expected systemic direction.** Pick one owner for household wood and make the
seam explicit rather than lossy. The smallest coherent options, in increasing
scope:

- Keep the scalar as the household's *bulk* wood, and give
  `structureCondition`/arrow production a `MaterialRequirement` adapter that
  can draw from `Household.stock.wood` at a declared item→scalar rate — the
  same adapter shape `beginStructureRepair` already takes
  (`hasMaterial`/`consumeMaterial`), so no repair logic changes.
- Or make the woodcutter's deposit and `settlements-npcs-032` write real
  `branch`/`beam` items into `household.items` and keep `stock.wood` as a
  derived count. This is closer to how `food` already works after
  `settlements-npcs-008` (scalar deleted, `items` authoritative, `query('food')`
  computed) — i.e. the repo already has a worked precedent for exactly this
  migration.

The second option is the one that matches the existing direction of travel and
would unblock `settlements-npcs-016`/`017` (blacksmith processing chain,
production demand) without a new abstraction.

---

### A6 — `repairStructure` can win arbitration without producing an action → per-frame decision livelock

- **Severity:** high (latent today, immediate once any damage source is wired)
- **Category:** bug
- **Affected systems:** NPC decision pipeline, `settlements-007`, schedules, profession work, work contracts, social behaviour

**Current behaviour.** `NpcAgent.choose()` (`NpcAgent.ts:2804`) dispatches
`repairStructure` → `beginRepairStructure()` → `break`. `beginRepairStructure`
(`NpcAgent.ts:5217`) returns **without calling `startAction`** in two cases:

```ts
if (!household) return
…
if (outcome.status !== 'started') return   // material-blocked
```

When it returns early, `this.phase` is still `'choose'`. `NpcAgent.update()`'s
phase switch (`NpcAgent.ts:2700`) has no decision throttle — it re-enters
`case 'choose'` **every frame**. The repair pressure
(`structureRepairCandidates.ts:80`) is computed purely from resolved condition
and does **not** consider material availability, so it returns the same
non-zero score every frame.

Result: the NPC re-arbitrates forever, starts nothing, and never falls through
to `idle` (score 60 < repairStructure's 66). Needs (80), scheduled sleep (70),
shelter (90) and collapse (100) still pre-empt it, so this is a starvation of
the *idle* branch specifically — which is where schedule-driven work, profession
dispatch, work-contract discovery and social pairing all live.

Given §A5, `household.items.has('beam', 4)` is **always** false, so the
material-blocked branch is the only branch that will ever be taken once a house
drops below `repairThreshold: 50`.

**Why it's a problem.** V1 has no automatic damage source
(`structureCondition.ts:134` states this explicitly), so today this is reachable
only via `structure.damageHouse` in `?debug=1`. But `settlements-007` §10
explicitly anticipates weather/attack/fire/wear plugging into
`applyStructureDamage`, and `world-026` has just landed storms — the pairing is
one small plan away, and it would silently freeze an NPC's entire non-critical
behaviour.

**Expected systemic direction.** Two independent corrections, both small:

1. Every other pressure producer in the pipeline is gated on the candidate
   actually existing (healing scores 0 without a suitable treatment; burial /
   grave-visit / corpse-cleanup all return `{ score, candidate }` and the
   dispatcher checks the candidate). `structureRepairPressureFromCondition`
   should be gated the same way — pressure 0 when the household cannot pay,
   unless an episode is already active. This keeps "a new pressure producer
   needs no change to the others" intact.
2. Independently, `choose()` should treat "dispatch produced no action" as a
   fall-through to `beginIdle(...)` rather than leaving the phase in `choose`.
   That is a one-line safety net covering every future dispatch target, not
   just this one.

---

### A7 — Time-skip NPC catch-up relieves needs with no resource transaction

- **Severity:** medium
- **Category:** inconsistency
- **Affected systems:** time skip, `Household`, `SettlementEconomy`, agriculture (`settlements-npcs-030`), profession production, wood economy

**Current behaviour.** `NpcAgent.resolveTimeSkip()` (`NpcAgent.ts:3103`) replays
the skipped period in `TIME_SKIP_SAMPLE_HOURS` steps and, per step, resolves
whichever need would have fired:

```ts
if (need === 'water')          { this.household?.water.remove(WATER_DRINK_FROM_STOCK_AMOUNT); relieveNeed(…) }
else if (need === 'waterDuty') { relieveNeed(…); this.household.water.add(WATER_FETCH_AMOUNT) }
else if (need === 'food')      relieveNeed(this.needs, 'food')          // ← no household.takeFood()
else if (need === 'wood' && …) relieveNeed(this.needs, 'wood')          // ← no household.deposit('wood', …)
```

Water is modelled on both sides. Food consumption and wood production are not:
across a skip, NPCs eat for free and chop nothing.

Compounding this, `SettlementsManager.resolveTimeSkip` (`SettlementsManager.ts:885`)
calls `stampSettlementAgriculture(entry.settlement, nowDays)` for every loaded
settlement, which sets `agricultureLastResolvedAtDays = nowDays` — so the
skipped window is *consumed* by the stamp and cannot be recovered later by the
`settlements-npcs-030` stream-in catch-up either.

**Why it's a problem.** The settlement economy's behaviour becomes a function
of whether the player is observing:

| Settlement state during an 8 h skip | Food produced | Food consumed | Wood produced |
|---|---|---|---|
| Loaded (home or non-home) | 0 (frozen + stamped away) | 0 | 0 |
| Unloaded, non-home | full `resolveUnloadedHouseholdAgriculture` aggregate | 0 | 0 |

A player who sleeps every night removes roughly a third of every loaded
settlement's production while also removing its consumption — the two errors
are in opposite directions and do not cancel. It also means the
`settlements-npcs-030` aggregate (deliberately built to keep unloaded
settlements alive) produces *more* than the detailed path it was meant to
approximate.

**Expected systemic direction.** The `waterDuty` branch is the correct model
already present in the same function: relieve the need **and** commit the real
transfer. `food` should route through `household.takeFood(nowDays)` (falling
back to `economyWithdraw` semantics), and `wood` through
`household.deposit('wood', …)`. For the agriculture half, `resolveTimeSkip`
should call `resolveSettlementAgricultureCatchUp` for loaded **non-home**
settlements instead of stamping them, and the home settlement's detailed Farmer
path needs its own skip-equivalent commit — otherwise the invariant
"time-skip follows the same simulation semantics as normal progression" cannot
hold for the one settlement the player actually lives in.

**Related plans.** `world-023` (species-driven sowing density) and
`settlements-npcs-031` (sustainable seed recovery) both build on
`settlements-npcs-030`'s capacity model and will inherit this asymmetry.

---

### A8 — Natural stray permanently consumes the one-shot stray slot, exhausting the lost-livestock quest pool

- **Severity:** medium
- **Category:** missing interaction / inconsistency
- **Affected systems:** `fauna-024`, `fauna-025`, lost-livestock quest opportunity, household livestock

**Current behaviour.** `AnimalStrayState` is a once-per-animal record:

- `beginStrayState` (`animalStray.ts:~248`) refuses when `current` is truthy.
- `clearStrayEpisode` (`animalStray.ts:~268`) sets `active: false` but **keeps**
  the record.
- `isEligibleLostLivestock` (`animalStray.ts:~150`) rejects any candidate with
  `candidate.stray` at all — active *or* spent.
- The state is persisted (`AnimalAgent.snapshot()`'s `stray` field,
  `AnimalAgent.ts:2238`), so it survives save/load and stream-out.

`fauna-025` (landed 2026-09-11) added `tickNaturalStrayClassification`
(`AnimalAgent.ts:1677`), which starts that same one-shot episode autonomously
after 12 s of sustained displacement past 36 m — every tick, on every
household-owned non-dog, non-led animal.

**Why it's a problem.** Before `fauna-025`, the only consumer of an animal's
stray slot was quest materialization, so "one lost-livestock quest per animal,
ever" was a reasonable pacing rule. Now the world consumes those slots by
itself: any wolf chase, thunder panic or long forage excursion that keeps an
animal out of band for 12 s burns that animal's slot permanently. Over a long
playthrough the `recover_lost_livestock` opportunity quietly becomes
unavailable for a household — not because nothing is lost, but because
everything already has been.

Note the interaction is asymmetric with §A1: today the main driver of sustained
displacement (a predator chase) can't happen for livestock, which is why this
has probably not been observed yet. Fixing A1 makes A8 fire much more often.

**Expected systemic direction.** Separate "this animal currently has an
episode" from "this animal may start one". The `active` flag already carries
the former. The latter wants either a cooldown anchor
(`lastStrayEndedAtDays`, matching the `graveVisits` per-deceased cooldown idiom
in `NpcAuthoritativeState`) or an explicit `questBound` marker so a natural
episode does not consume a quest-eligible slot. `isEligibleLostLivestock`'s
`|| candidate.stray` clause is the single line that encodes the current policy.

---

### A9 — Death is a near-total dead end outside burial

- **Severity:** medium
- **Category:** missing interaction (partly a documented gap)
- **Affected systems:** NPC lifecycle, households, profession staffing, settlement economy, quests, reputation, transport orders, livestock ownership

**Current behaviour.** Death consequences are narrow by construction:

**NPC death** (`NpcAgent.takeDamage` → `commitNpcDeath` →
`die()`, `NpcAgent.ts:1977–1988`, `2462`):
- ✅ releases an active work-contract assignment / marks a wage claim
  uncollectable (`NpcAgent.ts:2468–2472`);
- ✅ releases sanitation reservation, conversation, queue membership (via
  `resetInFlightAction`, `NpcAgent.ts:3558`);
- ❌ **no** profession re-staffing — `professionStaffing.ts` is generation-time
  only, so a settlement that loses its only Farmer/Trader/Woodcutter never
  replaces them;
- ❌ **no** household consequence — the household simply stops being supplied;
- ❌ **no** quest consequence — `QuestManager` has no dead-NPC path at all
  (grepping `src/quests/` for `dead` finds only fauna/spawner references). A
  quest whose giver or `talk_to_npc` target dies is stuck in `active` /
  `not_offered` indefinitely, never `failed`, never `invalidated`;
- ❌ **no** social or reputation consequence — neither the NPC↔NPC store nor
  `ReputationManager` is touched;
- ❌ **transport cargo is destroyed.** `commitNpcDeath` (`npcPostDeath.ts:238`)
  deliberately excludes `transportCargo`; its own doc comment names this
  ("carrier death is a known, unresolved gap — order stays `in-transit`, cargo
  stays on the dead NPC's state"). Real food leaves the source household and
  never reaches any destination.

**Animal death** (`onAnimalDeathTarget`, `createApp.ts:1180`) has exactly four
consumers, all of them quests. No household/economy accounting, no social
reaction, no restocking — and there is no breeding system, so household
livestock is monotonically decreasing for the life of a save.

**Why it's a problem.** The audit brief's "significant event with no
consequence in other existing systems" test is failed here most clearly. The
work-contract release shows the right pattern already exists; it simply has one
subscriber. Death is currently the only irreversible world event, and it is
the one the rest of the simulation cannot see.

**Expected systemic direction.** A single death-consequence fan-out at the
`commitNpcDeath` seam (the place that already runs exactly once per alive→dead
edge) is preferable to N systems polling `health.dead`. Minimum viable
subscribers, ordered by value: quest invalidation for a dead giver/target
(reusing the existing `invalidated` terminal state, which was built for exactly
this class of "the world moved on" case), transport-order failure + cargo
handoff, and adult-profession re-staffing within the settlement.

---

### A10 — Animal corpse decay uses accumulated seconds; NPC corpse decay uses a world-day anchor

- **Severity:** medium
- **Category:** architectural debt
- **Affected systems:** fauna corpses, NPC corpses, sanitation, `fauna-024` retention, streaming, time skip

**Current behaviour.**

- `NpcPostDeathState.deathAtDays` (`npcPostDeath.ts:44`) is an absolute
  `dayNight.elapsedDays` anchor. Its doc comment says it correctly: *"not
  `NpcAgent.simClock`, so stream-out / time-skip / save-load keep ageing the
  corpse without an off-screen tick."*
- `AnimalCorpseState.timeSinceDeath` is an **accumulated** simulation-second
  counter, advanced only from `AnimalAgent.update()` and (for wild fauna only)
  `resolveTimeSkip()`. It is persisted verbatim in `AnimalAgent.snapshot()`
  (`AnimalAgent.ts:2231`).

**Why it's a problem.** Animal corpse ageing is therefore observation-dependent
in three ways that the NPC equivalent is not: it stops during settlement
stream-out, stops during a time skip for livestock/rats (§A2), and stops
entirely while the corpse is `held` for a harvest channel. Two corpse
lifecycles that `fauna.md` and `npc.md` describe in matching vocabulary
(`fresh → rotting → bones`) behave differently under every continuity
transition. `fauna-024`'s two-day retention cap inherits all three.

**Expected systemic direction.** `shared/corpseLifecycle.ts` already exists and
already holds `decayPhaseFromElapsed`. Migrating `AnimalCorpseState` to a
`deathAtDays` anchor would make one shared elapsed-time contract serve both
domains, remove the need for `resolveTimeSkip`'s corpse branch entirely, and
make §A2's livestock gap non-fatal by construction. It requires a save
migration for the persisted `corpse.timeSinceDeath` field.

---

### A11 — `resolveBurialPressure` allocates a settlement-wide NPC-state object per NPC per decision tick

- **Severity:** low
- **Category:** architectural debt (performance)
- **Affected systems:** NPC decision pipeline

`NpcAgent.burialPressureCandidate()` (`NpcAgent.ts:4976`) builds
`Object.fromEntries(hooks.listSettlementNpcStates())` on every call, and
`resolveBurialPressure` then iterates every entry, unconditionally — including
when the settlement has no dead NPCs at all (the common case). `choose()` runs
every frame while the phase is `'choose'`, so for an XL settlement this is
O(N²) object construction per frame across the settlement, and §A6 can pin an
NPC in `choose` indefinitely.

Every neighbouring pressure producer (`weatherShelterPressure`, `healingPressure`,
`structureRepairPressureFromCondition`) is cheap-when-not-applicable by design.
This one should take the iterable directly (it already accepts
`ReadonlyMap | Record`) and early-out when no settlement corpse exists.

---

### A12 — Documentation claims contradicted by current code

- **Severity:** low
- **Category:** inconsistency

| Document | Claim | Reality |
|---|---|---|
| `docs/state/fauna.md:49` | *"the concrete difference from NPC death, which has no disposal path at all"* | `npc-010` added `NPC_CORPSE_REMOVE_DAYS = 2` and terminal cleanup that drops remaining loot as world items (`npcPostDeath.ts:58`). The stated difference no longer exists. |
| `docs/state/settlements.md` §Gospodarstwa | Hunter "craftuje strzały z `household.items` (`branch`/`beam` → `arrow`)" presented as live work | Structurally unreachable — §A5. |
| `docs/STATE.md` §Settlements/NPCs | NPC household-house repair presented as a shipped pressure alongside player `[R]` repair | NPC half is material-blocked forever — §A5/§A6. |
| `src/settlement/createSettlement.ts:235` (code comment) | "NPCs/livestock keep the freeze-and-catch-up behaviour" | Livestock has freeze without catch-up — §A2. |
| `src/fauna/animalStray.ts:49` (code comment) | "`timeSinceDeath` already includes time-skip catch-up" | False for livestock — §A2. |

---

## 2. Suspected findings requiring deeper recon

### B1 — `lastWaterTripBucket` resets on reconstruction

`AnimalAgent.lastWaterTripBucket = -1` (`AnimalAgent.ts:1046`) is runtime-only
and `maybeStartWaterTrip()` (`AnimalAgent.ts:4158`) commits whenever the
current bucket differs. Every restored persistent habitat occupant
(`fauna-018`/`fauna-019`, e.g. the planned treasure-map bear) therefore
re-evaluates a water trip immediately on stream-in. Same class of defect as
§A3; needs confirmation that this actually commits a trip rather than being
absorbed by the destination probe, and whether a cave-resident's
interior→entrance route can be entered mid-way as a result.

### B2 — Thunder scare × natural stray classification

`world-026`'s acceptance criteria (`plans/README.md`, "Do sprawdzenia") state
*"Burza nie tworzy questa ani stray"*. `fauna-025` landed **after** `world-026`
and added autonomous stray classification with no scare/threat exclusion
(`tickNaturalStrayClassification` excludes only dogs, led animals and animals
with an existing record). Scare flee duration is 3.2–6.6 s
(`animalScare.ts:scareFleeDurationSec`) against a 12 s grace window, so a
single thunderclap should not latch — but repeated strikes during a storm, or
a scare that lands while the animal is already out of band, are not obviously
excluded. Needs a focused trace or a targeted test.

### B3 — Household sanitation can bury a stray corpse a quest is watching

`isAnimalCorpseCleanupValid` (`NpcAgent.ts:5170`) does not consult
`shouldRetainStrayedCorpse`, so a household NPC can `bury()` a strayed
livestock corpse before the player inspects it. `readyToRemove()` still honours
the retention window (`AnimalAgent.ts:2306`), and `canInspectStrayedCorpse()`
does not check `buried`, so the quest is probably still resolvable — but the
presentation and the `fauna-024` outcome semantics should be confirmed
together.

### B4 — An abandoned repair episode freezes a structure permanently

While `state.repair` is set, `resolveStructureCondition` returns the frozen
checkpointed condition and `applyStructureDamage` is a no-op
(`structureCondition.ts:139,172`). Nothing expires or releases an episode. A
repair started by an NPC that then dies, or by the player who walks away,
leaves the structure permanently un-damageable and un-quotable (though still
resumable). Whether this matters depends on whether an automatic damage source
lands; worth deciding alongside §A6.

### B5 — Off-screen transport checkpoints

`resolveOffscreenTransportArrivals` runs at exactly two checkpoints:
`SettlementsManager.recheck()` (`SettlementsManager.ts:~975`) and time-skip
completion (`gameLoop.ts:899`). A player who neither crosses a stream boundary
nor skips time leaves in-transit off-screen orders unresolved indefinitely.
This is probably acceptable (nothing observes them), but `settlements-npcs-020`
/ `021` will add economic demand that reads order state, and the cadence
should be settled before then.

### B6 — Fauna is blind to weather

`AnimalAgent.update()` takes no `WeatherState` at all; the only weather-derived
input fauna receives is the thunder `scareStimulus`. NPCs have a full
`seekShelter` pressure with rain/snow/cold thresholds
(`ai/weatherPressure.ts`). Whether livestock standing unbothered through a
blizzard is an intentional scope decision or an unbuilt seam is a maintainer
question this audit cannot resolve — but it is worth recording explicitly,
because `world-terrain-009` (seasonal ground/grass appearance) and any future
shelter/barn work will run into it.

---

## 3. Intentional asymmetries worth preserving

These looked like inconsistencies on first pass and are not. Recording them so
a future audit does not "fix" them.

1. **Fauna's two-tier decision pipeline vs. NPC's three-producer pressure
   competition.** `fauna.md` argues this explicitly; fixed-priority
   threat/social override on top of ad hoc need-seeking is the right shape for
   14 behaviour kinds with hard gates, and unifying it would buy nothing.
2. **`fauna/AnimalAgent.ts` importing the NPC-owned movement watchdog
   directly.** The one deliberate inversion of the "hooks, not imports"
   convention; a fauna-local duplicate would be strictly worse.
3. **Interrupt precedence ≠ arbitration precedence** (`npc.md`'s
   `tickCriticalInterrupt` asymmetry). Deliberate, documented, and correct: a
   real need in progress should not be pre-empted by a different need.
4. **`NpcAgent.carried` is never persisted**, so an interrupted claim genuinely
   loses the goods. This is an accepted tradeoff with a real design rationale
   (claim→carry→deposit atomicity), unlike the transport-cargo loss in §A9
   which destroys goods without any actor error.
5. **Rabies is animal-to-animal only** (`updateRabid`, `AnimalAgent.ts:3883` —
   *"Only ever picks another animal, never a human"*). A rabid household dog
   cannot attack an NPC; this is why `threateningAnimals` being built from
   `Fauna.getAgents()` alone is currently harmless.
6. **Cart hitch is runtime-only** while carts persist — the rationale (livestock
   unloads while carts stay) is sound and documented.
7. **`LandOwnershipRegistry`'s flat `SaveData` idiom** vs. the `initial*`/
   `snapshot*` registry pattern. A style asymmetry, already documented as such.
8. **Wild-fauna individual non-persistence.** A deliberate, load-bearing scope
   decision; the four-tier persistence picture in `fauna.md` is one of the
   clearest ownership documents in the repo.

---

## 4. Plan conflicts and stale assumptions

| Plan | Concern |
|---|---|
| `fauna-023` — systemic animal attraction (food/blood/trap lures) | Premised on predators being drawn toward attractants near settlements. With §A1 unfixed, a lure can attract a wolf toward a flock it cannot see or touch. Risk of building a second, lure-specific predator→livestock path instead of fixing the pool seam. **Resolve A1 first.** |
| `quests-progression-019` — dangerous-animal deeds / local reputation | Reads `AnimalAgent.dangerSignificance` on player kills. Sound, but its narrative premise ("dangerous animal threatening the settlement") has no systemic backing while §A1 holds. |
| `settlements-npcs-016` / `017` — blacksmith processing chain, production demand | Both need concrete item inputs inside `Household.items`. §A5 is the blocking precondition; `settlements-npcs-016` will otherwise ship a third permanently dormant profession branch. `017`'s `SettlementDemand` also needs the `iron`/`coal`/`gold` demand-target gap (`settlements.md` S3: `shortage` is always 0 for those kinds) closed first. |
| `settlements-npcs-020` / `021` — economy-driven transport demand, remote production logistics | Build on `TransportOrder`. Inherit the carrier-death cargo-destruction gap (§A9) and the two-checkpoint off-screen cadence (§B5). Both should be resolved in the `TransportOrder` domain, not re-solved per consumer. |
| `npc-032` … `npc-035` — expedition chain (needs/survival, companion combat, shared work, relationship consequences) | The largest architectural risk in the backlog. Expeditions are long-lived, out-of-settlement NPC commitments, but `phase`/`pendingAction`/pathfinding/`combatIntent`/`carried` reset on **every** reconstruction — including an in-session settlement unload/reload, which an expedition by definition triggers. `settlements-npcs-019`'s `TransportOrder.execution` off-screen handoff is the existing precedent for "authoritative commitment record + off-screen resolution"; these plans should extend that mechanism rather than assume live-agent continuity. Worth stating as an explicit constraint in the plans before implementation starts. |
| `world-023` / `settlements-npcs-031` — sowing density, sustainable seed recovery | Extend `settlements-npcs-030`'s capacity model and will inherit the loaded-vs-unloaded production asymmetry (§A7). Decide whether the detailed Farmer path or the aggregate is authoritative *before* adding yield variance on top of both. |
| `npc-027` — spatial context and cave traversal | Should reuse `Caves.resolveHabitat` / `queryGroundIn` / `resolveHorizontalIn` and the `AnimalHabitatBinding` route-cursor pattern (`fauna/animalCaveHabitat.ts`, `fauna-019`) rather than build an NPC-local cave traversal. Note that `AnimalAgent` deliberately avoids the player's hysteretic `Caves.queryGround`; an NPC binding should make the same choice. |
| `settlements-007` (shipped) × `world-026` (shipped) | `resolveCondition` already accepts `rainExposureDays`/`snowExposureDays` and nothing supplies them; storms now exist. This is the obvious next damage source — but §A5/§A6 must be fixed first, or wiring it turns every damaged house into an NPC livelock. |
| `npc-037` — stale work-contract target discovery and notice cleanup | Adjacent to §A9's "release on death" pattern; worth checking whether the two want one shared staleness sweep. |
| `tools-013` — NPC decision verification and scenario tooling | Would have caught §A6 (livelock) and §A4 (claim churn) directly. Its value is higher than its ⚪/🔴 priority suggests given the findings above. |

---

## 5. Strongest systemic opportunities

Ranked by leverage, not by effort.

1. **Close the predator/livestock pool seam (§A1).** One bounded candidate list,
   symmetric with `nearbyPredators`/`nearbyRats`, activates five already-built
   consumers at once: shepherd flock defence, dog guard's household case,
   `huntingPrey().ownerHouseId`, stray predator pressure, and the
   lost-livestock quest's death outcomes. This is the single highest
   living-world return in the codebase right now.
2. **Make every world-time-derived value lazy and anchored (§A2, §A3, §A10,
   §B1).** The repo already has four correct instances of this pattern
   (`productionReadyAtDays`, `deathAtDays`, `lastConditionUpdateAtDays`,
   `injuryRecoveryUpdatedAtDays`) and four incorrect ones
   (`corpse.timeSinceDeath`, `lastReconcileDay`, `lastWaterTripBucket`,
   livestock `AnimalLife`). Converting the remainder eliminates whole classes of
   stream/skip/rebuild inconsistency without adding a mechanism.
3. **Resolve the dual wood representation (§A5).** `food`'s
   `settlements-npcs-008` migration (scalar deleted, `items` authoritative,
   `query()` computed) is a worked precedent in the same file. Doing the same
   for wood unblocks NPC repair, hunter arrows, blacksmith work, and
   `settlements-npcs-016`/`017`.
4. **Give death a consequence fan-out (§A9).** One subscriber list at the
   `commitNpcDeath` seam, starting with quest invalidation and transport-order
   failure. `invalidated` already exists as a terminal quest state for exactly
   this case.
5. **Add a "dispatch produced no action" fall-through in `choose()` (§A6).** A
   one-line safety net that makes the pressure pipeline robust to every future
   producer, not just `repairStructure`.

---

## 6. Prioritisation

Scored on **impact × systemic reach × likelihood × implementation risk**
(likelihood = how often the defect actually fires in a normal playthrough;
implementation risk is inverted — lower risk raises the rank).

| # | Finding | Impact | Reach | Likelihood | Impl. risk | Verdict |
|---|---|---|---|---|---|---|
| 1 | **§A3** Rat reconciliation re-fires per settlement construction | High (unbounded food destruction) | Medium (rats, household, economy) | **Certain** — fires on every stream-in and every load | **Low** — move one field into the existing persisted infestation record | **Fix first.** Best ratio in the audit. |
| 2 | **§A4** Burial claim released by the wrong NPC's plan | Medium–High (breaks the `claimed` lock `npc-010`/`npc-011` depend on) | Medium | High whenever a corpse exists in a populated settlement | **Low** — pass the claimant's plan, hooks already in scope | **Fix first.** Do before the `npc-011`/`npc-026` browser verification pass. |
| 3 | **§A6** `repairStructure` decision livelock | High (total non-critical behaviour stall) | High (schedules, professions, contracts, social) | Low **today**, certain the moment a damage source lands | **Low** — pressure gate + `choose()` fall-through | **Fix now**, while it is still cheap and pre-emptive. |
| 4 | **§A1** No predator↔livestock interaction | **Very high** (a core ecosystem relationship is absent) | **Very high** (fauna, livestock, NPC shepherd, dogs, quests, stray) | Certain (it never happens) | **Medium** — needs a candidate-list design that preserves pool ownership and the `role` taxonomy | **Highest value; plan it properly.** Prerequisite for `fauna-023` and the narrative premise of `quests-progression-019`. |
| 5 | **§A2** Livestock/rats get no time-skip catch-up | Medium–High | High (fauna, corpses, stray, quests) | Certain (every rest/sleep) | **Low** — one fan-out loop in `SettlementsManager.resolveTimeSkip` | Fix alongside #1; §A10 is the durable version of the same fix. |
| 6 | **§A5** Scalar wood vs. `branch`/`beam` items | High (two shipped features are dead) | High (households, professions, repair, future production chains) | Certain | **Medium** — a real migration, with a good precedent in `food` | Do before `settlements-007` gains a damage source or `settlements-npcs-016` starts. |
| 7 | **§A7** Time-skip needs relieved without transactions | Medium | Medium–High (economy, agriculture) | Certain | Medium — needs a decision on detailed-vs-aggregate authority | Bundle with the `world-023`/`settlements-npcs-031` planning round. |
| 8 | **§A9** Death consequence fan-out | Medium (quest soft-locks, goods destruction) | High | Low today (NPC death is rare) | Medium | Design the seam now, add subscribers incrementally. |
| 9 | **§A10** Animal corpse seconds vs. NPC corpse day-anchor | Medium | Medium | Certain | Medium — needs a save migration | The principled version of #5; schedule together. |
| 10 | **§A8** Natural stray exhausts the quest candidate pool | Low–Medium | Medium | Low today, **rises sharply once #4 lands** | Low | Fix as part of the §A1 work, not before. |
| 11 | **§A11** Burial-pressure per-tick allocation | Low | Low | Certain | Very low | Opportunistic cleanup. |
| 12 | **§A12** Stale documentation | Low | Low | — | Very low | Fold into whichever plan touches each area. |

**Suggested sequencing:** #1 + #2 + #3 + #5 as one small correctness pass (all
low-risk, all independent), then #6 as its own plan, then #4 as a properly
scoped fauna plan that also carries #10. #7/#8/#9 belong to their respective
next planning rounds.

---

## 7. Open maintainer questions

The audit deliberately does not resolve these — each is a design decision, not
a defect:

1. **Is livestock meant to be huntable by wild predators at all?** §A1 assumes
   yes (five consumers already assume it). If the answer is no, then
   `huntingPrey().ownerHouseId`, `senseOwnedFlockThreat`, dog-guard's own-household
   tier and `predatorPressureAt` should be deleted rather than fixed.
2. **Which is authoritative for non-home settlement production — the detailed
   Farmer path or the `settlements-npcs-030` aggregate?** §A7 cannot be fixed
   consistently without an answer.
3. **Should a time skip be economically neutral or economically live?** The
   current answer is "neutral for food/wood, live for water", which is the one
   option that is definitely wrong.
4. **Is fauna's weather-blindness (§B6) intentional scope, or an unbuilt seam?**
5. Carried forward from `persistence.md`: **player HP persistence** remains an
   undocumented gap with no stated rationale either way.
