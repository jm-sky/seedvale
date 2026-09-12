# Living World Audit — Final Synthesis

**Created:** 2026-09-12  
**Status:** `done`  
**Type:** cross-domain verification synthesis (recon only — no production code changed, no plans created or updated)  
**Method:** Extract findings from three independent 2026-09-12 audits → deduplicate by root cause → re-verify each high/critical (and cross-system medium) finding against current `main` source, tests, and `docs/state/*` where needed.

---

## 1. Executive summary

| Metric | Count |
|--------|------:|
| Raw findings extracted (three audits) | **52** |
| Unique root-cause groups after deduplication | **24** |
| **Confirmed** | **17** |
| **Partially confirmed** | **5** |
| **Resolved-after-audit** | **0** |
| **Intentional** (not defects) | **6** |
| **Unconfirmed** / deferred to follow-up recon | **6** |

**Audits merged:** Living World Consistency (§A/B), Independent Simulation Architecture (§F), Adversarial Living World (§F).

**Highest systemic risks (verified on code):**

1. **Presence selects simulation semantics** — time skip, streaming, and load radius apply different rules to the same `elapsedDays` (NPC stepped replay vs frozen livestock/rats vs aggregate agriculture vs rat reconcile replay). This is the dominant cross-cutting failure mode.
2. **Conservation without a single owner at lifecycle edges** — carrier death + transport, burial loot terminalization, egg `onCollected`, and (by design) ephemeral `carried` collide with persisted ledgers in predictable ways.
3. **Disjoint fauna encounter graphs** — wild predators and settlement livestock never share `others`; five downstream consumers (shepherd, dog guard, `huntingPrey().ownerHouseId`, stray predator pressure, quest death outcomes) are wired to signals that cannot fire.
4. **Quest/opportunity layers that mutate fauna** — lost-livestock sync teleports animals on `offered`/`active` without requiring a stray episode; natural stray (`fauna-025`) competes for the same one-shot slot (`fauna-024`).
5. **Household wood representation** — scalar `stock.wood` vs `branch`/`beam` in `Household.items` makes hunter arrows and NPC structure repair unreachable; repair pressure can win arbitration without starting work (livelock once damage exists).

No audit finding marked **critical** or **high** was found already fixed on `main` at verification time (including commits landed after individual audit baselines, e.g. work-contract refactors — transport death and burial-claim bugs remain).

---

## 2. Confirmed issues

Sorted **critical → high → medium → low**.

### CRITICAL

#### C1 — Carrier death leaves `in-transit` cargo; off-screen delivery can complete from a dead carrier

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | critical |
| **Confidence** | high |
| **Source audits** | Adversarial F1; Architecture F4; Consistency A9 (transport slice) |
| **Root cause** | No alive→dead transaction on `TransportOrder` + `transportCargo`; off-screen resolver does not check `health.dead`. |
| **Affected systems** | transport, NPC death, streaming, time skip, household/settlement food |
| **Files / symbols** | `commitNpcDeath()` (`npcPostDeath.ts`); `resolveOffscreenTransportArrivals()` (`transportOffscreen.ts`); `beginOffscreenTransportHandoff()` (`SettlementsManager.ts`); `NpcAgent.die()` |
| **Failure scenario** | Trader dies with food on `transportCargo`. Settlement stays loaded → cargo stranded on corpse, order stuck `in-transit`, `cancelTransportOrder` cannot retire in-transit. Player leaves → handoff arms off-screen execution → arrival unloads to destination from dead carrier state. |
| **Current behaviour** | Documented gap in `commitNpcDeath` comment; `resolveOffscreenTransportArrivals` only requires `getNpcState` + destination inventory. |
| **Expected systemic behaviour** | `health.dead` ⇒ terminal order + exactly-once cargo disposition (fail/refund/drop), never ghost delivery. |
| **Invariant violated** | Single inventory owner; dead entity must not execute logistics. |
| **Related plans** | `settlements-npcs-020`, `021`, `028`; `npc-037` (adjacent staleness) |
| **Architectural direction** | Idempotent `carrierDied` on transport owner at `commitNpcDeath` edge; refuse off-screen handoff/arrival for dead carriers. |

---

#### C2 — Wild predators cannot acquire household livestock as prey

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | critical (ecosystem / living-world premise) |
| **Confidence** | high |
| **Source audits** | Consistency A1; Architecture F5 |
| **Root cause** | Separate `others` pools (`agents` vs `livestock`) **and** `nearest(..., 'prey', …)` role filter excludes `livestock` role. |
| **Affected systems** | fauna predation, livestock, shepherd, dog guard, stray pressure, lost-livestock outcomes |
| **Files / symbols** | `createFauna.ts` update `others: agents`; `livestock.ts` `tickSettlementLivestock` `others: livestock`; `AnimalAgent.resolvePreyTarget` / `nearest`; `gameLoop.ts` `threateningAnimals` / `nearbyWolves` from wild pool only |
| **Failure scenario** | Wolf enters sheep yard; alert flee may occur via `nearbyPredators`; wolf cannot lock/chase/bite sheep; `preyOwnerHouseId` never set; shepherd flock defense unreachable. |
| **Current behaviour** | By construction; tests can tick sheep+wolf in one array — production never does. |
| **Expected systemic behaviour** | Bounded encounter set at composition root (symmetric to `nearbyPredators`), without merging persistence pools or reclassifying livestock as `prey`. |
| **Invariant violated** | World independence — defense/hunt hooks assume encounters the simulation cannot produce. |
| **Related plans** | `fauna-023` (lures), `quests-progression-019` (narrative pressure) |
| **Architectural direction** | Extend caller-supplied huntable candidates into predator prey resolution; keep pool ownership. |

---

### HIGH

#### H1 — Settlement livestock, rats, and detached livestock omitted from time-skip animal catch-up

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Consistency A2; Architecture F1; Adversarial F3/F8 (partial) |
| **Root cause** | `Fauna.resolveTimeSkip` iterates wild `agents` only; `SettlementsManager.resolveTimeSkip` calls NPC replay only. |
| **Affected systems** | time skip, livestock, rats, corpses, stray retention, juvenile maturation |
| **Files / symbols** | `gameLoop.ts` `skip.justFinished`; `SettlementsManager.resolveTimeSkip`; `createFauna.ts` `resolveTimeSkip`; `AnimalAgent.resolveTimeSkip` |
| **Failure scenario** | 8 h sleep: wild deer age/hunger advance; home sheep/rats frozen; livestock `corpse.timeSinceDeath` frozen (see H9). |
| **Expected** | Same elapsed interval applied once per persisted `AnimalAgent` class, via manager fan-out or day anchors. |
| **Invariant** | Time-skip semantics match normal progression (`ARCHITECTURE.md`). |
| **Plans** | Bundle with H9; `fauna-025` verification assumptions |
| **Direction** | Fan-out `resolveTimeSkip` to settlement `livestock` + `rats.getAgents()` + `detachedLivestock`. |

#### H2 — Rat `lastReconcileDay` resets on every `createRats()` / settlement construction

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Consistency A3; Architecture F8; Adversarial F3 (rats slice) |
| **Root cause** | Module-local `let lastReconcileDay = -Infinity` in `rats.ts`, not persisted with infestation record. |
| **Affected systems** | rats, household food, settlement economy food, streaming, save/load, WorldBundle rebuild |
| **Files / symbols** | `createSettlementRats` / `rats.ts` reconcile gate; `ratPersistence.ts` |
| **Failure scenario** | Multiple stream-ins within same half-day bucket re-run `maybeEatFood` and replenishment per construction. |
| **Expected** | One reconcile per elapsed world bucket, keyed off persisted settlement infestation state. |
| **Plans** | None dedicated; pattern matches lazy anchors elsewhere |
| **Direction** | Persist `lastRatReconcileDay` (or last processed bucket) beside `{ storageDamaged, nestDestroyed }`. |

#### H3 — Burial stale-claim recovery uses evaluator’s `activePlan`, not claimant’s

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Consistency A4; Adversarial F6 |
| **Root cause** | `resolveBurialPressure` calls `recoverStaleNpcBurialClaim(post, claimantHasMatchingPlan(input.activePlan, deceasedId))` before owner guard; `input.activePlan` is the scanning NPC. |
| **Affected systems** | NPC burial, corpse lifecycle (`npc-010`/`npc-011`) |
| **Files / symbols** | `burialPressure.ts:104`; contrast `NpcAgent.reevaluateBurialPlan` (correct claimant plan) |
| **Failure scenario** | NPC A claims corpse; NPC B’s next `choose()` releases A’s claim; burial thrash; last claimant death can leave `claimed` corpse non-decaying (`npcCorpseReadyToRemove` requires `active`). |
| **Expected** | Recover only when **claim owner’s** plan/death state is stale. |
| **Plans** | `npc-011`, `npc-026` (verification queue) |
| **Direction** | Lookup `hooks.getNpcState(post.burialClaimantId)?.activePlan`; release claims held by NPC on `die()`. |

#### H4 — Household wood is scalar-only; consumers require `branch`/`beam` items

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Consistency A5 |
| **Root cause** | Woodcutter/player transfer deposit scalar wood; no writer adds `branch`/`beam` to `household.items`. |
| **Affected systems** | household economy, hunter arrows (`settlements-npcs-015`), structure repair (`settlements-007`), future production chains |
| **Files / symbols** | `household.deposit('wood')`; `householdResourceTransfer.ts`; `npcProfessionWork.ts` arrow gate; `structureCondition.ts` materials |
| **Failure scenario** | Woodcutter-filled household cannot craft arrows or start NPC repair despite abundant scalar wood. |
| **Expected** | One authoritative wood representation or explicit adapter from scalar to material requirements. |
| **Plans** | `settlements-npcs-016`, `017`; `settlements-007` weather damage |
| **Direction** | Follow `food` migration precedent (`settlements-npcs-008`) or material adapter on existing repair executor. |

#### H5 — `repairStructure` wins arbitration but may start no action → decision livelock

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high (latent until automatic damage) |
| **Confidence** | high |
| **Source audits** | Consistency A6 |
| **Root cause** | `beginRepairStructure` returns without `startAction` when materials missing; pressure ignores material availability; `choose` re-enters every frame. |
| **Affected systems** | NPC decisions, schedules, profession work, work contracts, social |
| **Files / symbols** | `NpcAgent.choose` → `beginRepairStructure`; `structureRepairPressureFromCondition` |
| **Failure scenario** | House below threshold with H4 → repair score ~66 beats idle 60 forever; no work/contract/social. |
| **Expected** | Pressure gated on satisfiable materials or active episode; dispatch-without-action falls through to idle. |
| **Plans** | `world-026` + `settlements-007` pairing |
| **Direction** | Gate pressure; optional global “no action started → idle” safety in `choose()`. |

#### H6 — Time-skip NPC need replay without food/wood transactions; agriculture stamped

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Consistency A7; Architecture F6; Adversarial F2, F4 |
| **Root cause** | `NpcAgent.resolveTimeSkip` relieves food/wood without `takeFood`/chop/deposit; `SettlementsManager.resolveTimeSkip` calls `stampSettlementAgriculture`. |
| **Affected systems** | time skip, household, settlement economy, agriculture |
| **Files / symbols** | `NpcAgent.resolveTimeSkip` ~3218–3228; `stampSettlementAgriculture` |
| **Failure scenario** | Loaded settlement during sleep: free food relief, no crop catch-up, remote unloaded village later gains aggregate food (H7). |
| **Expected** | Skip uses same mutations as `beginNeed` onComplete, or documented resource-inert skip with no stamps. |
| **Plans** | `world-023`, `settlements-npcs-031` |
| **Direction** | Shared satisfaction primitive; run aggregate agriculture catch-up instead of stamp when loaded non-home. |

#### H7 — Off-screen agriculture uses `FamilyDef` farmer count; dead NPCs still count

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high (production correctness) |
| **Confidence** | high |
| **Source audits** | Architecture F9; Adversarial F3/F4 (agriculture slice) |
| **Root cause** | `householdAgriculturalCapacity(family)` ignores `NpcAuthoritativeState.health.dead`. |
| **Affected systems** | agriculture, streaming, time skip, NPC death |
| **Files / symbols** | `settlementAgriculture.ts`; stream-in catch-up in `createSettlement.ts` |
| **Failure scenario** | Sole farmer dies; unload + elapsed days → catch-up still produces from seeds. |
| **Expected** | Capacity from living NPC ids ∩ farmer role. |
| **Plans** | `settlements-npcs-027`, `031`, `world-023` |
| **Direction** | Derive labour from registry, not static family defs. |

#### H8 — Lost-livestock quest sync teleports animals on `offered`/`active`

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Architecture F7 |
| **Root cause** | `syncLostLivestockQuests` calls `startLivestockStray` (includes teleport) for offered/active quests each settlements pass. |
| **Affected systems** | quests, stray (`fauna-024`/`025`) |
| **Files / symbols** | `createApp.ts` `syncLostLivestockQuests`; `AnimalAgent.startLivestockStray` |
| **Failure scenario** | Healthy yard sheep selected as opportunity → quest offered → next tick teleported 36–90 m without player acceptance. |
| **Expected** | Opportunities read-only; displacement only at explicit quest activation edge. |
| **Plans** | `quests-progression` lost-livestock; `fauna-025` |
| **Direction** | Gate `startLivestockStray` on `active` + explicit authored transition, or only materialize from existing stray episode. |

#### H9 — NPC healing gates on `carried` only; household and `personalInventory` bandages ignored

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Adversarial F5 |
| **Root cause** | `choose()` / `beginHeal()` use `carried.findInjuryTreatment`; player gifts → `personalInventory`; hunter starter → `household.items`. |
| **Affected systems** | healing, items-player-027, household medicine |
| **Files / symbols** | `NpcAgent.ts` ~2786, ~5181; contrast `resolveNpcAmmo([personalInventory, carried], …)` |
| **Failure scenario** | Injured NPC with bandage in house or personal inventory never heals autonomously. |
| **Expected** | Treatment resolution mirrors ammo union (+ household fetch at home). |
| **Plans** | `npc-032` (expedition medicine), `items-player-028` |
| **Direction** | Ordered inventory search at heal gate and consume. |

#### H10 — Non-home settlement unload destroys household livestock agents (incl. led stray)

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Adversarial F7 |
| **Root cause** | `unload()` captures livestock snapshot then `dispose()`; only `isPlayerOwnedLivestockRecord` restores to `detachedLivestock`. |
| **Affected systems** | livestock streaming, lead, stray, quests |
| **Files / symbols** | `SettlementsManager.unload`; `livestock.ts` `isPlayerOwnedLivestockRecord`; `leadActions.ts` detach on null resolve |
| **Failure scenario** | Player leads neighbour’s stray cow away; village unloads → agent gone, lead detached, snapshot remains until reload. |
| **Expected** | Led/stray-active animals follow detached-livestock rule like player mounts. |
| **Plans** | `fauna-025`, lost-livestock verification |
| **Direction** | Detach criteria: player-led, stray active, or outside unload bubble. |

#### H11 — Stream-out resets NPC position to home; execution state not persisted

| Field | Value |
|-------|--------|
| **Status** | `confirmed` |
| **Final severity** | high |
| **Confidence** | high |
| **Source audits** | Architecture F2 |
| **Root cause** | `NpcAuthoritativeState` excludes position/phase/carried; rebuild at `homePlaces[familyIndex]`. |
| **Affected systems** | streaming, NPC work, combat, logistics |
| **Files / symbols** | `SettlementsManager.unload`; `NpcAgent.create`; `npcState.ts` |
| **Failure scenario** | Miner mid-deposit walk; player triggers unload → miner at home, `carried` empty, ore lost from world deposit path. |
| **Expected** | Coarse position checkpoint on authoritative state; conserved cargo promoted (see partial P1). |
| **Plans** | `npc-029`–`035`, `settlements-npcs-028` |
| **Direction** | Extend `NpcAuthoritativeState` checkpoint + work cargo before expedition plans. |

---

### MEDIUM

#### M1 — Natural stray episode permanently blocks lost-livestock eligibility

| **Status** | `confirmed` | **Severity** | medium | **Confidence** | high |
| **Audits** | Consistency A8 |
| **Root cause** | `isEligibleLostLivestock` rejects any `candidate.stray` record; `clearStrayEpisode` keeps record with `active: false`. |
| **Scenario** | `fauna-025` autonomous stray burns one-shot slot; quest pool exhausts over long play. |
| **Direction** | Separate “episode active” from “quest slot consumed”; cooldown idiom like `graveVisits`. |

#### M2 — Death lacks cross-system fan-out (quests, professions, household, transport)

| **Status** | `partially confirmed` | **Severity** | medium | **Confidence** | high |
| **Audits** | Consistency A9 |
| **Verified** | Work contract release on `die()`; `commitNpcDeath` excludes transport (C1). |
| **Unverified breadth** | Full quest invalidation matrix per def type (grep shows no systematic dead-NPC handler). |
| **Direction** | Single `commitNpcDeath` subscriber list: transport, quest `invalidated`, profession restaffing. |

#### M3 — Animal corpse `timeSinceDeath` vs NPC `deathAtDays`

| **Status** | `confirmed` | **Severity** | medium |
| **Audits** | Consistency A10; Adversarial F8 |
| **Root cause** | Accumulated seconds + tick-only advance; livestock skip gap (H1). |
| **Direction** | Migrate persisted animals to `deathAtDays`; use `shared/corpseLifecycle.ts`. |

#### M4 — Storm scare can latch natural stray (no scare exclusion)

| **Status** | `confirmed` | **Severity** | medium | **Confidence** | medium |
| **Audits** | Consistency B2; Adversarial F9 |
| **Evidence** | `tickNaturalStrayClassification` excludes dog/lead only; scare skips `clampBounds`; grace 12 s vs scare 3.2–6.6 s; world-026 verification text says storms must not create stray. |
| **Direction** | Exclude `scareRemainingSec > 0` from stray classification **or** update world-026 contract. |

#### M5 — Time skip clears `pendingAction` without `resetInFlightAction`

| **Status** | `confirmed` | **Severity** | medium |
| **Audits** | Adversarial F10 |
| **Root cause** | `resolveTimeSkip` nulls pending action but not sanitation reservation / `cancelCombat`. |
| **Direction** | Same cleanup as `die()` interrupt path before catch-up. |

#### M6 — Burial finalization drops loot to nowhere

| **Status** | `confirmed` | **Severity** | medium |
| **Audits** | Architecture F11 |
| **Root cause** | `finalizeNpcCorpseBurial` → `dropNpcCorpseLoot(postDeath, null)` leaves terminal loot snapshot inaccessible. |
| **Direction** | Grave drop, grave inventory, or explicit consume — match natural expiry path. |

#### M7 — Egg production coupled to non-persisted `onCollected` callback

| **Status** | `confirmed` | **Severity** | medium |
| **Audits** | Architecture F10 |
| **Root cause** | `eggPending` persisted; `dropLivestockProduct(..., onCollected)` not. |
| **Direction** | `producerAnimalId` on dropped egg or reconcile on materialization. |

#### M8 — Carcass `meatHarvested` vs `consumedPhase` double ledger

| **Status** | `confirmed` | **Severity** | medium |
| **Audits** | Architecture F12 |
| **Root cause** | Harvest ignores scavenger phase; `consumedPhase` not in snapshot. |
| **Direction** | Single remaining-food field, persisted. |

#### M9 — `commitRoleWork` parallel stock mint

| **Status** | `confirmed` | **Severity** | medium |
| **Audits** | Architecture F13 |
| **Root cause** | Fallback workplace `onComplete` still calls `commitRoleWork` when planner null. |
| **Direction** | No-op fallback; food only via `executeProduction` / real harvest / aggregate (H7). |

#### M10 — Patchwork off-screen settlement simulation (loaded vs unloaded)

| **Status** | `partially confirmed` | **Severity** | medium |
| **Audits** | Adversarial F3 |
| **Verified** | Agriculture catch-up vs frozen needs/rats/hunger; injury lazy clock; NPC corpse `deathAtDays`. |
| **Direction** | Document uniform off-screen contract per process owner. |

---

### LOW

#### L1 — Burial pressure builds full `npcStates` map every `choose()` tick

| **Status** | `confirmed` | Consistency A11 | **Severity** | low |

#### L2 — `NpcAgent.dayLengthSec` default 600 vs live 480

| **Status** | `confirmed` | Architecture F14 | **Severity** | low |

#### L3 — Resource deposit async spawn validates player-only anchor

| **Status** | `confirmed` | Architecture F15 | **Severity** | low |

#### L4 — Hunter resupply ignores `personalInventory` arrows

| **Status** | `confirmed` | Architecture F16 | **Severity** | low |

#### L5 — Stale documentation vs code (corpse disposal, hunter arrows, livestock skip comments)

| **Status** | `confirmed` | Consistency A12 | **Severity** | low |

---

## 3. Root-cause groups

```text
G1  Time / presence semantics
    ├─ H1  livestock/rats skip catch-up
    ├─ H6  NPC skip resource fiction + agriculture stamp
    ├─ H7  FamilyDef agriculture labour
    ├─ M3  animal corpse seconds
    ├─ M5  skip weak interrupt cleanup
    └─ M10 patchwork off-screen table

G2  Fauna encounter composition
    └─ C2  disjoint others + prey role

G3  Transport + death conservation
    └─ C1  carrier death / off-screen ghost delivery

G4  Household material model
    ├─ H4  wood scalar vs items
    └─ H5  repair livelock (enabled by H4)

G5  Burial / corpse lifecycle
    ├─ H3  wrong-plan stale recovery
    ├─ M6  burial loot sink
    └─ (related) M3 corpse clocks

G6  Rats world-time state
    └─ H2  lastReconcileDay local

G7  Quest ↔ fauna ownership
    ├─ H8  quest teleports stray
    └─ M1  one-shot stray slot

G8  Streaming object lifetime
    ├─ H10 livestock dispose on unload
    └─ H11 NPC home teleport + ephemeral execution

G9  Inventory read-set fragmentation
    ├─ H9  heal reads carried only
    └─ L4  hunt resupply

G10 Production / economy parallel commits
    ├─ M9  commitRoleWork
    └─ M7  egg callback

G11 Carcass resource accounting
    └─ M8  meatHarvested vs consumedPhase

G12 Death orchestration (incomplete)
    └─ M2  fan-out (partial)

G13 Weather × stray policy
    └─ M4  thunder + natural stray
```

Prefer fixing **G1**, **G3**, **G2**, **G4**, **G6**, **G7** before feature plans that sit on transport, predators, or household items.

---

## 4. Cross-system invariants (verified or should be protected)

| ID | Invariant | Current code |
|----|-----------|--------------|
| T1 | One elapsed interval must not be both live-ticked and catch-up-ticked for the same entity | **Holds** for loaded NPC/fauna during skip (`gameLoop` freeze) |
| T2 | Same `elapsedDays` should imply comparable settlement semantics regardless of stream state | **Violated** (G1, H2, H6, H7) |
| T3 | Detailed and off-screen transport execution must not both complete delivery | **Mostly holds**; **violated** when dead carrier off-screen completes (C1) |
| O1 | Authoritative state has one owner; transfers use domain operations | **Holds** at `executeTransport*` / `executeProduction`; **violated** at death edges |
| O2 | Reconstruction must not create a second authoritative copy | **Holds** for registries; execution reset is intentional but mutates facts (H11) |
| L1 | Death/removal terminates or redirects commitments | **Partial** (work contract yes; transport/burial claim no) |
| L2 | Dead entities do not start new world actions | **Holds** for NPC `update`; **fails** for off-screen transport (C1) |
| D1 | Decision preview ≠ guaranteed mutation | **Violated** by repair pressure (H5) |
| D2 | Interrupt/reconstruction should not double-complete | **Risk** on carcass ledgers (M8), eggs (M7) |
| W1 | Player/camera must not own semantic world outcomes | **Violated** by stream-frequency rats (H2) and load-dependent transport (C1) |

---

## 5. Intentional asymmetries to preserve

| Asymmetry | Label | Why preserve |
|-----------|--------|--------------|
| NPC three-producer pressure vs fauna fixed-priority table | `intentional asymmetry — preserve` | Different agent counts and hard gates; unification buys no gameplay |
| `NpcAgent.carried` ephemeral work hold (interrupted claim may lose goods) | `intentional asymmetry — preserve` | Documented tradeoff; fix **promotion to authoritative cargo** (P1), not elimination of carried |
| Wild fauna individuals unpersisted; livestock/rats/occupants persisted | `intentional asymmetry — preserve` | Load-bearing scope in `fauna.md` |
| NPC `seekShelter` sustained weather vs fauna thunder scare stimulus | `intentional asymmetry — preserve` | Different contracts (`world-026`) |
| Home settlement never unloads | `intentional asymmetry — preserve` | Streaming policy; bugs are inconsistent catch-up on top, not home load itself |
| Livestock production day-anchors vs per-tick hunger | `intentional asymmetry — preserve` | Valid model; fix skip/stream for hunger/corpses (H1, M3), do not unify tick rates |
| `SettlementEconomy` bulk vs `Household` family stock | `intentional asymmetry — preserve` | Two registries by design; **wood must pick one representation inside Household** (H4), not merge economies |
| Cart hitch runtime-only | `intentional asymmetry — preserve` | Documented livestock/cart lifecycle |
| Rabies animal-to-animal only | `intentional asymmetry — preserve` | Explains why wild-only `threateningAnimals` is harmless for NPC rabies today |

---

## 6. Resolved or rejected audit findings

| Source | Finding | Disposition | Evidence |
|--------|---------|-------------|----------|
| All | Any critical/high issue fixed after audits | **Not found** (`resolved-after-audit`: 0) | Re-verified at HEAD; transport, burial, pools, rats unchanged |
| Consistency B1 | `lastWaterTripBucket` resets on reconstruction | **unconfirmed** | Same class as H2; needs trace whether trip commits on stream-in |
| Consistency B3 | NPC buries stray corpse quest is watching | **unconfirmed** | `isAnimalCorpseCleanupValid` vs `shouldRetainStrayedCorpse` not fully traced |
| Consistency B4 | Abandoned repair episode freezes damage | **partially confirmed** | `structureCondition` freezes during `repair`; episode persistence is by design; severity depends on damage sources |
| Consistency B5 | Off-screen transport only two checkpoints | **intentional** | Documented bounded checkpoints; acceptable until demand plans need fresher reads |
| Consistency B6 | Fauna blind to weather (except scare) | **intentional** (maintainer scope) | Not a verified defect |
| Architecture F3 | `carried` always a bug | **intentional** + **partially confirmed** | Accepted loss on interrupt; **mint/destroy** on reconstruct (hunter arrows) is a real bug distinct from accepted loss |
| Adversarial | Player HP persistence gap | **intentional** (documented gap) | `persistence.md` |
| Architecture | Player-only armor | **intentional** | `items-player-029` scope |

---

## 7. Plans affected

| Plan | Finding / root cause | Impact | Required action |
|------|----------------------|--------|-----------------|
| `fauna-023` | C2 | Lures near villages cannot create predator–livestock gameplay | **add dependency** on encounter-set fix (G2) |
| `quests-progression-019` | C2 | Narrative “dangerous predator” lacks systemic predation | **recon before implementation** |
| `settlements-npcs-016` / `017` | H4, M9 | Processing/demand on dead item paths + parallel mint | **add dependency** on G4 + retire `commitRoleWork` mint |
| `settlements-007` follow-ups / `world-026` damage | H5, H4 | Weather damage → NPC livelock | **add dependency** on G4 before wiring damage |
| `settlements-npcs-020` / `021` / `028` | C1, H11 | More in-transit + distance | **add dependency** on G3; recon real `TransportOrder` API |
| `npc-029`–`035`, `settlements-npcs-027`–`028` | H11, H1, H6, H9 | Expedition assumes continuity | **recon before implementation**; extract travel checkpoint from 019, not parallel engine |
| `settlements-npcs-031`, `world-023` | H6, H7 | Seed/yield on wrong labour/time model | **update implementation notes**; one `CropDefinition` authority |
| `npc-037` | C1, M5 | Stale contracts + skip teleport | **reuse existing mechanism**; align with transport death |
| `npc-032` | H6, H9 | Companion needs on magic skip/heal | **add dependency** on G1/G9 |
| `items-player-028` | H9 | Storage policies need unified read-set | **reuse existing mechanism** after heal fix |
| `tools-013` | H5, H6 | Scenario tooling | **none** (helpful; no blocker) |
| `quests-progression` lost-livestock | H8, M1, H10 | Quest/stray/stream collisions | **recon before implementation** |
| `npc-011` / `npc-026` | H3 | Verification may fail claim stability | **fix H3 before browser verification** |
| `fauna-025` / `world-026` | M4 | Contradictory storm/stray expectations | **update implementation notes** or gate stray |

---

## 8. Recommended repair order

Order: **correctness → systemic reach → dependencies → implementation risk**

1. **G6 H2** — rat reconcile bucket (small, certain, high blast radius on food)  
2. **G5 H3** — burial claim identity (small; unblocks npc-011 verification)  
3. **G4 H4 + H5** — wood model + repair pressure gate (prevents world-026 damage livelock)  
4. **G3 C1** — transport death transaction + off-screen dead-carrier guard  
5. **G1 H1 + M3** — animal skip fan-out; align corpse clocks (migration)  
6. **G2 C2** — bounded predator–livestock encounter set at `gameLoop`  
7. **G7 H8 + M1 + M4** — quest stray authorship + slot policy + storm gate  
8. **G1 H6 + H7** — skip resource semantics + living farmer capacity  
9. **G8 H10 + H11** — livestock detach rules; NPC checkpoint/cargo (foundational for expeditions)  
10. **G9 H9** — heal inventory union  
11. **G10/G11** — egg producer id, burial loot policy, carcass ledger, `commitRoleWork`  
12. **G12 M2** — death fan-out subscribers (incremental)  
13. **Low** — L1–L5, performance/doc cleanup  

---

## 9. Proposed future plan split

Minimal plan set ( **do not create files yet** ):

| Suggested title | Domain | Scope | Findings | Dependencies | Priority | Effort |
|-----------------|--------|-------|----------|--------------|----------|--------|
| Settlement rat reconcile world-time anchor | `settlements-npcs` | Persist reconcile bucket on infestation record | H2 | none | high | S |
| NPC burial claim owner correctness | `npc` | Claimant plan lookup + die() releases claims | H3 | none | high | S |
| Household wood authority migration | `settlements-npcs` | Unify wood with items or scalar adapter for repair/arrows | H4, H5 | none | high | M |
| Transport carrier death termination | `settlements-npcs` / `world` | Order fail/refund + off-screen guards | C1 | none | high | M |
| Animal time-skip + corpse day anchor | `fauna` / `world` | Manager fan-out + save migration for `deathAtDays` | H1, M3, M8 (partial) | transport optional | high | M |
| Fauna encounter set for livestock predation | `fauna` | Composition-root bounded huntable candidates | C2 | none | high | M |
| Time-skip settlement resource contract | `world` / `settlements-npcs` | Shared need satisfaction + agriculture catch-up vs stamp | H6, H7, M5, M10 | wood migration helpful | high | L |
| Stray quest ownership and episode policy | `fauna` / `quests-progression` | Read-only opportunities; slot/cooldown; storm gate | H8, M1, M4 | encounter set for pacing | medium | M |
| Livestock streaming continuity | `fauna` / `settlements-npcs` | Detach led/stray/outside bubble | H10 | none | high | M |
| NPC continuity checkpoint + work cargo | `npc` / `persistence` | Position + promoted inventory on authoritative state | H11, P1 (carried) | none | high | L |
| NPC heal treatment inventory union | `npc` | Mirror ammo resolution for bandages | H9 | items-player-027 | medium | S |
| Death consequence fan-out v1 | `npc` | Quest invalidate + transport (reuse C1) | M2 | C1 | medium | M |
| Production commit cleanup | `settlements-npcs` | Remove `commitRoleWork` mint; egg producer id; burial loot transaction | M7, M9, M6 | wood migration | medium | M |

---

## Appendix A — Phase 1 extraction index (raw findings)

| ID | Audit | Severity (claimed) | Systems |
|----|-------|-------------------|---------|
| A1 | Consistency | critical | fauna/livestock |
| A2–A12 | Consistency | mixed | time, rats, burial, wood, repair, skip, stray, death, corpses, perf, docs |
| B1–B6 | Consistency | suspected | water trip, storm, sanitation, repair, transport cadence, weather |
| F1–F16 | Architecture | mixed | time, stream, carried, transport, fauna, skip, quests, rats, ag, egg, burial, carcass, role work, day length, deposits, hunt ammo |
| F1–F10 | Adversarial | mixed | transport, skip, ag, heal, burial, livestock unload, corpses, storm, skip cleanup |

---

## Appendix B — Partially confirmed / dual-nature items

### P1 — `carried` work cargo (Architecture F3)

| **Status** | `partially confirmed` |
| **Severity** | high for ore/meat/hunter remint; **intentional** for accepted interrupt loss |
| **Evidence** | `npcState.ts` excludes carried; `commitNpcDeath` excludes; hunter `seedHunterStartingArrows(this.carried)` on reconstruct |
| **Direction** | Promote conserved work cargo to authoritative field; do not remove `carried` seam |

---

## Verification metadata

| Field | Value |
|-------|--------|
| **Audited `main` HEAD SHA** | `728a8aa9edb24b2f8c2fc8ebe45b17c406943154` |
| **Source reviews** | `docs/reviews/2026-09-12--living-world-consistency-audit.md` |
| | `docs/reviews/2026-09-12--independent-simulation-architecture-review.md` |
| | `docs/reviews/2026-09-12--adversarial-living-world-audit.md` |
| **Verification date** | 2026-09-12 (UTC) |
